#!/usr/bin/env node

// P3 dependency-boundary UI/gate audit.
// This scanner is intentionally read-only: it only reads source/evidence files and
// prints a machine-readable JSON report. It does not call APIs, write config, or
// deploy/restart anything.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const ROOT = path.resolve(__dirname, '../..')
const V3 = 'src/ui-v3/src'

function absolute(relativePath) {
  return path.join(ROOT, relativePath)
}

function read(relativePath) {
  try {
    return fs.readFileSync(absolute(relativePath), 'utf8')
  } catch {
    return ''
  }
}

function exists(relativePath) {
  return fs.existsSync(absolute(relativePath))
}

function sha256(relativePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(absolute(relativePath))).digest('hex')
  } catch {
    return null
  }
}

function linesOf(source) {
  return source.split(/\r?\n/)
}

function sourceRefs(relativePath, patterns, limit = 8) {
  const source = read(relativePath)
  if (!source) return []
  const lines = linesOf(source)
  const refs = []
  for (const pattern of patterns) {
    const matcher = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i')
    for (let index = 0; index < lines.length; index += 1) {
      if (!matcher.test(lines[index])) continue
      refs.push({
        path: relativePath,
        line: index + 1,
        text: lines[index].trim().slice(0, 280)
      })
      break
    }
    if (refs.length >= limit) break
  }
  return refs
}

function uniqueRefs(refs) {
  const seen = new Set()
  return refs.filter((ref) => {
    const key = `${ref.path}:${ref.line}:${ref.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function fileSnapshot(relativePath) {
  const source = read(relativePath)
  return {
    path: relativePath,
    exists: Boolean(source),
    bytes: source ? Buffer.byteLength(source) : 0,
    lines: source ? linesOf(source).length : 0,
    sha256: sha256(relativePath)
  }
}

function walk(relativeDirectory, extension = '.vue') {
  const root = absolute(relativeDirectory)
  const result = []
  if (!fs.existsSync(root)) return result
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const relative = path.join(relativeDirectory, entry.name)
    if (entry.isDirectory()) result.push(...walk(relative, extension))
    else if (entry.isFile() && (!extension || entry.name.endsWith(extension))) result.push(relative)
  }
  return result.sort()
}

function hasAny(source, patterns) {
  return patterns.some((pattern) => pattern.test(source))
}

function routeInventory() {
  const relativePath = `${V3}/router/index.js`
  const source = read(relativePath)
  const records = []
  for (const [index, line] of linesOf(source).entries()) {
    if (!/\bpath\s*:/.test(line)) continue
    const pathMatch = line.match(/\bpath\s*:\s*['"]([^'"]+)['"]/)
    if (!pathMatch) continue
    const nameMatch = line.match(/\bname\s*:\s*['"]([^'"]+)['"]/)
    const componentMatch = line.match(/\bcomponent\s*:\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/)
    const blockedKindMatch = line.match(/\bblockedKind\s*:\s*['"]([^'"]+)['"]/)
    const routePath = pathMatch[1]
    const name = nameMatch ? nameMatch[1] : null
    const component = componentMatch ? componentMatch[1] : null
    const text = line.trim()
    const isRedirect = /\bredirect\s*:/.test(line)
    const explicitBlocked = /DependencyBlocked|NetworkCollectBlocked|(?:^|['"\s])\w*Blocked\w*(?:['"\s,}])/i.test(line)
    const hasBlockedKind = Boolean(blockedKindMatch)
    const classification = explicitBlocked
      ? 'blocked'
      : hasBlockedKind
        ? 'direct-with-blocked-state'
        : isRedirect
          ? 'redirect'
          : 'direct'
    records.push({
      path: routePath,
      name,
      component,
      redirect: isRedirect,
      blockedKind: blockedKindMatch ? blockedKindMatch[1] : null,
      classification,
      source: { path: relativePath, line: index + 1, text: text.slice(0, 360) }
    })
  }
  return records
}

function routeMatches(record, matcher) {
  return matcher.test([record.path, record.name, record.component, record.blockedKind].filter(Boolean).join(' '))
}

function routeBoundary(matcher, records) {
  const matched = records.filter((record) => routeMatches(record, matcher))
  const direct = matched.filter((record) => ['direct', 'direct-with-blocked-state'].includes(record.classification))
  const blocked = matched.filter((record) => ['blocked', 'direct-with-blocked-state'].includes(record.classification))
  const redirects = matched.filter((record) => record.classification === 'redirect')
  let status = 'missing'
  if (direct.length && blocked.length) status = 'direct-and-blocked'
  else if (direct.length) status = 'direct-only'
  else if (blocked.length) status = 'blocked-only'
  else if (redirects.length) status = 'redirect-only'
  return {
    status,
    direct: direct.map((record) => record.source),
    blocked: blocked.map((record) => record.source),
    redirects: redirects.map((record) => record.source),
    matchedCount: matched.length
  }
}

function evidenceFiles(entries) {
  return entries.map((entry) => {
    const refs = sourceRefs(entry.path, entry.patterns || [/./], 3)
    return {
      path: entry.path,
      exists: exists(entry.path),
      sha256: sha256(entry.path),
      evidence: refs,
      note: entry.note
    }
  })
}

function catchWindows(source) {
  const lines = linesOf(source)
  const windows = []
  for (let index = 0; index < lines.length; index += 1) {
    const catchOffset = lines[index].indexOf('catch')
    if (catchOffset < 0) continue
    const chunkLines = [lines[index].slice(catchOffset)]
    let balance = (chunkLines[0].match(/{/g) || []).length - (chunkLines[0].match(/}/g) || []).length
    for (let next = index + 1; next < lines.length && balance > 0; next += 1) {
      chunkLines.push(lines[next])
      balance += (lines[next].match(/{/g) || []).length - (lines[next].match(/}/g) || []).length
    }
    windows.push({ line: index + 1, text: chunkLines.join('\n').slice(0, 900) })
  }
  return windows
}

function dependencyEmptyFindings() {
  const files = walk(`${V3}/views`)
  const findings = []
  const dependencyApi = /(searchKubePods|searchFullText|searchCloudAccounts|searchCloudAreas|listCloudSyncTask|createCloudSyncTask|updateCloudSyncTask|deleteCloudSyncTask|findCloudSyncRegion|findCloudAccountVPC|batchCreateCloudArea|cloudserver|cloudsync|collector|nodeman|oidc|auth\/verify)/i
  const emptyUi = /<el-empty\b|empty-text\s*=/i
  const collectionReset = /(?:\.value\s*=\s*\[\]|\.value\s*=\s*0\b|\b(?:rows|pods|hits|accounts|areas|vpcList|vpcRegions|dirs|total)\s*=\s*\[\]|\btotal\s*=\s*0\b)/i
  const catchErrorFeedback = /ElMessage\.error|error(?:Message|State)?\.value|errorMessage|errorState|failed|failure/i

  for (const relativePath of files) {
    const source = read(relativePath)
    if (!source || !dependencyApi.test(source) || !emptyUi.test(source)) continue
    for (const window of catchWindows(source)) {
      if (!collectionReset.test(window.text)) continue
      const feedback = catchErrorFeedback.test(window.text)
        ? (/(error(?:Message|State)?\.value|errorMessage|errorState|failed|failure)/i.test(window.text) ? 'page-error-state-or-failure-marker' : 'toast-only')
        : 'silent'
      findings.push({
        status: 'violation',
        path: relativePath,
        line: window.line,
        evidence: window.text.replace(/\s+/g, ' ').slice(0, 420),
        emptyUi: sourceRefs(relativePath, [/<el-empty\b/i, /empty-text\s*=/i], 2),
        errorFeedback: feedback,
        reason: 'dependency/API catch resets collection state while the page exposes an empty/table-empty presentation; dependency failure can be rendered as no data'
      })
    }
  }
  return findings
}

const DOMAIN_DEFINITIONS = [
  {
    id: 'k8s',
    pageFiles: [`${V3}/views/KubePods.vue`],
    pagePatterns: [/KubePods/, /searchKubePods/],
    routeMatcher: /pod|KubePod|KubeContainer|PodBlocked|pod-details/i,
    capability: {
      status: 'present',
      probeType: 'CMDB Kube Pod API capability probe',
      scope: 'The probe proves the CMDB Kube Pod endpoint/data model is reachable; it does not by itself prove cluster informer freshness.',
      files: [`${V3}/stores/capabilities.js`],
      patterns: [/probeK8s\(/, /searchKubePods\(/, /ensureLoaded/]
    },
    blocked: {
      status: 'present',
      patterns: [/DependencyBlocked/, /capabilities\.k8s\.healthy/, /依赖阻塞/],
      files: [`${V3}/views/KubePods.vue`, `${V3}/views/status/DependencyBlocked.vue`]
    },
    evidence: {
      status: 'real-partial',
      note: 'Real K3s/kube-sync read-back exists, but production lifecycle/data freshness remains bounded by kube-sync and external cluster operation.',
      files: [
        { path: 'docs/architecture/ui-v3-external-integration-evidence-20260913.md', patterns: [/Kubernetes/, /CMDB Kube API/] },
        { path: 'docs/architecture/ui-v3-kube-sync-evidence-20260913.md', patterns: [/Successful CMDB read-back/, /real K3s/] },
        { path: 'docs/architecture/ui-v3-kube-sync-lifecycle-evidence-20260914.md', patterns: [/Production boundary/, /仍未完成/] }
      ]
    },
    owner: { name: 'Kubernetes platform and kube-sync/collector operator', boundary: 'cluster access, informer freshness, node-to-host mapping, lifecycle convergence' }
  },
  {
    id: 'es/monstache',
    pageFiles: [`${V3}/views/FullTextSearch.vue`],
    pagePatterns: [/FullTextSearch/, /searchFullText/],
    routeMatcher: /full-text-search|FullTextSearch/i,
    capability: {
      status: 'present-partial',
      probeType: 'Elasticsearch full-text endpoint capability probe',
      scope: 'The probe checks the full-text API response; it does not prove Mongo→ES/Monstache index synchronization.',
      files: [`${V3}/stores/capabilities.js`],
      patterns: [/probeEs\(/, /searchFullText\(/, /__cmdb_capability_probe__/]
    },
    blocked: {
      status: 'present',
      patterns: [/DependencyBlocked/, /capabilities\.es\.healthy/, /Elasticsearch/],
      files: [`${V3}/views/FullTextSearch.vue`, `${V3}/views/status/DependencyBlocked.vue`]
    },
    evidence: {
      status: 'real-partial',
      note: 'A real ES query path was exercised, while Monstache/plugin and business index documents remain blocked.',
      files: [
        { path: 'docs/architecture/ui-v3-external-integration-evidence-20260913.md', patterns: [/Elasticsearch/, /Monstache/, /full_text/] },
        { path: 'docs/architecture/ui-v3-production-parity-handoff-20260912.md', patterns: [/ES 全文检索/] }
      ]
    },
    owner: { name: 'Elasticsearch and Monstache/indexing operator', boundary: 'ES availability, aliases, Mongo→ES synchronization, index/plugin health' }
  },
  {
    id: 'cloud-vendor',
    pageFiles: [`${V3}/views/cloud/CloudDiscover.vue`, `${V3}/views/cloud/CloudAccount.vue`, `${V3}/views/cloud/CloudArea.vue`],
    pagePatterns: [/CloudDiscover/, /listCloudSyncTask/, /云资源/],
    routeMatcher: /cloud-discover|cloud-resource|CloudDiscover/i,
    capability: {
      status: 'missing',
      probeType: 'No dedicated cloud-vendor capability probe found',
      scope: 'CloudDiscover loads account/task/VPC data directly; provider reachability is only observed through request failures.',
      files: [`${V3}/views/cloud/CloudDiscover.vue`],
      patterns: [/onMounted/, /loadAccounts\(/, /findCloudSyncRegion\(/]
    },
    blocked: {
      status: 'partial',
      patterns: [/catch \{/, /ElMessage\.error/, /请检查账户连通性/, /DependencyBlocked/],
      files: [`${V3}/views/cloud/CloudDiscover.vue`, `${V3}/views/status/DependencyBlocked.vue`]
    },
    evidence: {
      status: 'blocked-no-real-provider',
      note: 'Account/task UI and contracts exist, but real provider credentials/network/secret-manager validation is not present.',
      files: [
        { path: 'docs/architecture/ui-v3-next-handoff-20260914.md', patterns: [/云虚拟机生产验收阻塞/, /AWS\/Tencent\/Alibaba credentials/] },
        { path: 'docs/architecture/ui-v3-external-integration-evidence-20260913.md', patterns: [/云|cloud/i] },
        { path: 'docs/architecture/ui-v3-kube-sync-evidence-20260913.md', patterns: [/cloud VMs/, /real cloud credentials/] }
      ]
    },
    owner: { name: 'Cloud vendor credentials/cloudserver-cloudsync operator', boundary: 'provider API, credentials, DNS/TLS, secret manager, sync scheduler and read-back' }
  },
  {
    id: 'collector/nodeman',
    pageFiles: [`${V3}/views/NetworkCollectBlocked.vue`],
    pagePatterns: [/NetworkCollectBlocked/, /collector/],
    routeMatcher: /network-collect|NetworkCollectBlocked/i,
    capability: {
      status: 'missing',
      probeType: 'No collector/Nodeman capability probe found',
      scope: 'The page is an explicit blocked boundary; no collector registration or device-data probe is attempted.',
      files: [`${V3}/views/NetworkCollectBlocked.vue`],
      patterns: [/collector/, /DependencyBlocked/]
    },
    blocked: {
      status: 'present',
      patterns: [/DependencyBlocked/, /接入 collector/, /网络采集/],
      files: [`${V3}/views/NetworkCollectBlocked.vue`, `${V3}/views/status/DependencyBlocked.vue`]
    },
    evidence: {
      status: 'mock-only',
      note: 'The blocking UI/mock contract is recorded; no real collector/Nodeman device-data evidence exists in the current evidence set.',
      files: [
        { path: 'docs/architecture/ui-v3-external-integration-evidence-20260913.md', patterns: [/collector/, /阻塞页/] },
        { path: 'docs/architecture/ui-v3-production-parity-handoff-20260912.md', patterns: [/collector|bk-nodeman/i] }
      ]
    },
    owner: { name: 'collector and bk-nodeman operator', boundary: 'collector registration, agent/device inventory, credentials and device attribute feed' }
  },
  {
    id: 'iam/oidc',
    pageFiles: [`${V3}/views/status/PermissionStatus.vue`, `${V3}/stores/session.js`, `${V3}/stores/permission.js`],
    pagePatterns: [/PermissionStatus/, /cmdb-session-expired/, /auth\/verify/],
    routeMatcher: /auth\s*:|\/error|\/no-business|Permission/i,
    routeDynamicFiles: [{ path: `${V3}/router/index.js`, patterns: [/to\.meta\.view = 'permission'/, /meta\.view='permission'/] }],
    capability: {
      status: 'present-partial',
      probeType: 'session/userinfo and IAM resource verification gates',
      scope: 'Session and permission gates are implemented; a real external IdP/OIDC multi-user proof is outside this static scan.',
      files: [`${V3}/stores/session.js`, `${V3}/stores/permission.js`, `${V3}/router/index.js`],
      patterns: [/userinfo/, /auth\/verify/, /verifyResource/, /beforeEach/]
    },
    blocked: {
      status: 'present',
      patterns: [/PermissionStatus/, /cmdb-session-expired/, /cmdb-permission-denied/, /meta\.view = 'permission'/],
      files: [`${V3}/views/status/PermissionStatus.vue`, `${V3}/api/http.js`, `${V3}/router/index.js`]
    },
    evidence: {
      status: 'mock-only',
      note: 'Deny/apply and session boundary code paths have evidence, but real IdP/OIDC multi-user and formal resource-level IAM evidence remains missing.',
      files: [
        { path: 'docs/architecture/ui-v3-external-integration-evidence-20260913.md', patterns: [/IAM/, /真实 IdP/] },
        { path: 'docs/architecture/ui-v3-production-parity-handoff-20260912.md', patterns: [/真实 OIDC/, /资源级 IAM/] },
        { path: 'docs/architecture/ui-v3-session-handoff-20260909.md', patterns: [/OIDC Authorization Code/, /默认配置仍关闭/] }
      ]
    },
    owner: { name: 'OIDC identity provider and IAM policy owner', boundary: 'IdP login/session, user identity, default-deny policy, resource decisions and audit' }
  }
]

function buildDomainReport(definition, routes, emptyFindings) {
  const pageRefs = uniqueRefs(definition.pageFiles.flatMap((file) => sourceRefs(file, definition.pagePatterns, 4)))
  const capabilityRefs = uniqueRefs(definition.capability.files.flatMap((file) => sourceRefs(file, definition.capability.patterns, 8)))
  const blockedRefs = uniqueRefs(definition.blocked.files.flatMap((file) => sourceRefs(file, definition.blocked.patterns, 8)))
  const dynamicRouteRefs = uniqueRefs((definition.routeDynamicFiles || []).flatMap((entry) => sourceRefs(entry.path, entry.patterns, 8)))
  const route = routeBoundary(definition.routeMatcher, routes)
  if (dynamicRouteRefs.length && route.status === 'direct-only') {
    route.status = 'direct-and-dynamic-blocked'
    route.dynamicBlocked = dynamicRouteRefs
  }
  const domainEmptyFindings = emptyFindings.filter((finding) => {
    const text = `${finding.path} ${finding.evidence}`
    if (definition.id === 'k8s') return /KubePods|searchKubePods/i.test(text)
    if (definition.id === 'es/monstache') return /FullTextSearch|searchFullText/i.test(text)
    if (definition.id === 'cloud-vendor') return /cloud|Cloud|CloudSync/i.test(text)
    return false
  })
  return {
    pageEntry: {
      status: pageRefs.length && route.matchedCount ? 'present' : 'missing',
      files: definition.pageFiles.map(fileSnapshot),
      source: pageRefs,
      routeMatchedCount: route.matchedCount
    },
    capabilityProbe: {
      status: definition.capability.status,
      probeType: definition.capability.probeType,
      scope: definition.capability.scope,
      source: capabilityRefs
    },
    blockedErrorState: {
      status: definition.blocked.status,
      source: blockedRefs,
      dependencyErrorEmptyFindings: domainEmptyFindings
    },
    realEvidence: {
      status: definition.evidence.status,
      note: definition.evidence.note,
      files: evidenceFiles(definition.evidence.files)
    },
    externalOwner: definition.owner,
    route,
    routeDynamicSource: dynamicRouteRefs
  }
}

function audit() {
  const routes = routeInventory()
  const emptyFindings = dependencyEmptyFindings()
  const domains = Object.fromEntries(DOMAIN_DEFINITIONS.map((definition) => [
    definition.id,
    buildDomainReport(definition, routes, emptyFindings)
  ]))

  const routeChecks = Object.fromEntries(Object.entries(domains).map(([id, domain]) => [id, {
    status: domain.route.status,
    directCount: domain.route.direct.length,
    blockedCount: domain.route.blocked.length,
    redirectCount: domain.route.redirects.length,
    note: id === 'cloud-vendor' && domain.route.status === 'direct-only'
      ? 'Cloud resource discovery has a direct route but no domain-specific blocked route; provider failures are handled inside the page.'
      : undefined
  }]))

  const directErrorEmptyCheck = {
    status: emptyFindings.length ? 'blocked' : 'passed',
    findingCount: emptyFindings.length,
    findings: emptyFindings
  }
  const routeCheckStatus = Object.values(routeChecks).some((check) => check.status === 'missing') ? 'blocked' : 'passed'
  const evidenceCheckStatus = Object.values(domains).some((domain) => ['blocked-no-real-provider', 'mock-only'].includes(domain.realEvidence.status))
    ? 'attention'
    : 'passed'
  const blockers = []
  if (directErrorEmptyCheck.status === 'blocked') blockers.push('One or more dependency/API failures can become an empty/table-empty presentation.')
  if (routeCheckStatus === 'blocked') blockers.push('One or more dependency domains have no statically discoverable direct or blocked route.')
  if (evidenceCheckStatus === 'attention') blockers.push('External owner evidence is partial, blocked, or mock-only; this is not a real-dependency release proof.')

  const sourceFiles = uniqueRefs(DOMAIN_DEFINITIONS.flatMap((definition) => [
    ...definition.pageFiles,
    ...definition.capability.files,
    ...definition.blocked.files
  ].map((file) => ({ path: file, line: 1, text: '' })))).map((ref) => fileSnapshot(ref.path))

  return {
    schemaVersion: 1,
    reportKind: 'ui-replacement-p3-dependency-boundary-gate',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    sideEffects: { network: false, writes: false, configChanges: false, deployment: false, excludedMutations: ['field template files', 'service instance files'] },
    scope: {
      sourceOfTruth: 'src/ui-v3',
      scannedViews: walk(`${V3}/views`).length,
      scannedViewFiles: walk(`${V3}/views`),
      inspectedBoundaryInputs: sourceFiles,
      excludedPaths: [`${V3}/views/model/FieldTemplate.vue`, `${V3}/views/service/ServiceInstance.vue`]
    },
    domains,
    checks: {
      dependencyErrorRenderedAsEmpty: directErrorEmptyCheck,
      routeDirectBlocked: { status: routeCheckStatus, domains: routeChecks },
      realEvidenceBoundary: { status: evidenceCheckStatus, note: 'Static evidence inventory is not a substitute for external integration acceptance.' }
    },
    summary: {
      directDependencyErrorEmptyFindings: emptyFindings.length,
      domains: DOMAIN_DEFINITIONS.length,
      domainsWithCapabilityProbe: Object.values(domains).filter((domain) => ['present', 'present-partial'].includes(domain.capabilityProbe.status)).length,
      domainsWithExplicitBlockedOrErrorState: Object.values(domains).filter((domain) => ['present', 'partial'].includes(domain.blockedErrorState.status)).length
    },
    status: blockers.length ? 'blocked' : 'passed',
    blockers,
    releaseDecision: blockers.length
      ? 'do not treat ui-v3 as a complete replacement; keep external boundaries explicit and do not retire src/ui'
      : 'boundary scan passed; external integration acceptance is still required'
  }
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(audit(), null, 2)}\n`)
}

module.exports = { audit, dependencyEmptyFindings, routeInventory }
