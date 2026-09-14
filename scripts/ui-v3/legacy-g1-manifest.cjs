#!/usr/bin/env node

/**
 * Generate the static G1 contract manifest for the legacy Vue frontend.
 *
 * This deliberately records extraction evidence and uncertainty. It never
 * promotes a route match into runtime or production evidence.
 */
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const allowedStatuses = ['未盘点', '仅静态', 'mock 已验证', '本地真实已验证', '外部依赖阻塞', 'G1 通过', '生产阻断']
const externalDomains = ['cloud', 'collector', 'netcollect', 'kubernetes', 'kube', 'container', 'elasticsearch', 'monstache', 'full_text', 'iam', 'oidc', 'secret', 'redis', 'zookeeper', 'zk']

function filesUnder(dir, extensions = ['.js', '.vue']) {
  if (!fs.existsSync(dir)) return []
  const result = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...filesUnder(file, extensions))
    else if (extensions.some(ext => file.endsWith(ext))) result.push(file)
  }
  return result.sort()
}

function read(file) {
  return fs.readFileSync(file, 'utf8')
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join('/')
}

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length
}

function snippet(source, index, radius = 420) {
  return source.slice(Math.max(0, index - radius), Math.min(source.length, index + radius)).replace(/\s+/g, ' ').trim()
}

function normalizePath(value) {
  let out = String(value || '')
    .replace(/\$\{[^}]+\}/g, '*')
    .replace(/\{[^}]+\}/g, '*')
    .replace(/:[A-Za-z0-9_?]+/g, '*')
    .replace(/\?.*$/, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
  out = out.replace(/^(?:api\/v3|api)\//, '')
  return `/${out}`.replace(/\/+/g, '/') || '/'
}

function endpointPath(raw) {
  let value = String(raw || '')
  value = value.replace(/^\$\{(?:window\.)?(?:API_HOST|API_PREFIX)\}/, '')
  value = value.replace(/^window\.(?:API_HOST|API_PREFIX)/, '')
  value = value.replace(/^https?:\/\/[^/]+/, '')
  return value
}

function pathVariants(raw) {
  const pathValue = endpointPath(raw)
  const normalized = normalizePath(pathValue)
  return [...new Set([normalized, normalizePath(raw)])]
}

function collectBackendRoutes() {
  const roots = ['scene_server', 'source_controller', 'web_server', 'apiserver'].map(dir => path.join(root, 'src', dir))
  const files = roots.flatMap(dir => filesUnder(dir, ['.go']))
  const routes = []
  let genericProxy = false
  for (const file of files) {
    const source = read(file)
    const pattern = /Path:\s*"([^"]+)"|\b(?:GET|POST|PUT|PATCH|DELETE|HEAD)\s*\(\s*"(\/[^"\s]+)"/g
    for (const match of source.matchAll(pattern)) {
      const route = match[1] || match[2]
      if (!route) continue
      routes.push({ path: normalizePath(route), rawPath: route, file: rel(file), line: lineAt(source, match.index) })
    }
    if (/\b(?:GET|POST|PUT|PATCH|DELETE)\s*\(\s*"\{[^"}]*\}"/.test(source)) genericProxy = true
  }
  return { routes, genericProxy }
}

function routeMatch(rawEndpoint, backend) {
  const candidates = pathVariants(rawEndpoint)
  for (const candidate of candidates) {
    const clientSegments = candidate.split('/')
    for (const route of backend.routes) {
      const routeSegments = route.path.split('/')
      if (routeSegments.length !== clientSegments.length) continue
      if (routeSegments.every((part, index) => part === '*' || part === clientSegments[index])) {
        return { kind: 'direct-route-match', route: { ...route }, candidate }
      }
    }
  }
  if (backend.genericProxy) return { kind: 'generic-proxy-only', reason: 'backend exposes a generic apiserver proxy' }
  return { kind: 'unmatched', reason: 'no compatible statically registered backend route' }
}

function detectTransport(rawEndpoint, source) {
  if (/window\.API_HOST|API_HOST/.test(rawEndpoint) || /http\.download/.test(source)) return 'root/API_HOST'
  if (/window\.API_PREFIX|API_PREFIX/.test(rawEndpoint)) return 'API_PREFIX'
  return 'API_PREFIX-relative'
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function extractPathParams(endpoint) {
  return unique([...String(endpoint).matchAll(/\$\{\s*([A-Za-z_$][\w$]*)|\$\{[^}]*?\.([A-Za-z_$][\w$]*)\s*\}/g)]
    .flatMap(match => [match[1], match[2]])
    .concat([...String(endpoint).matchAll(/:([A-Za-z0-9_]+)/g)].map(match => match[1])))
}

function extractHints(context) {
  const request = {
    argumentShape: /\.delete\s*\(/.test(context) || /\.get\s*\(/.test(context) ? 'method,url,config' : 'method,url,payload,config',
    payloadHints: unique([
      /params\b/.test(context) ? 'params' : '',
      /data\b/.test(context) ? 'data' : '',
      /config\.data/.test(context) ? 'config.data' : '',
      /JSON\.stringify/.test(context) ? 'JSON.stringify payload' : '',
      /condition\s*:/.test(context) ? 'condition' : '',
      /fields\s*:/.test(context) ? 'fields' : '',
      /page\s*:/.test(context) ? 'page' : '',
      /bk_biz_id/.test(context) ? 'bk_biz_id' : '',
      /enable_count/.test(context) ? 'enable_count' : '',
      /FormData|form\.append|importData\.append/.test(context) ? 'multipart FormData' : ''
    ]),
    configHints: unique([
      /requestId/.test(context) ? 'requestId' : '',
      /fromCache/.test(context) ? 'fromCache' : '',
      /clearCache/.test(context) ? 'clearCache' : '',
      /cancelPrevious/.test(context) ? 'cancelPrevious' : '',
      /globalError/.test(context) ? 'globalError' : '',
      /globalPermission/.test(context) ? 'globalPermission' : '',
      /transformData/.test(context) ? 'transformData' : '',
      /originalResponse/.test(context) ? 'originalResponse' : ''
    ]),
    paginationHints: unique([
      /enable_count|count/.test(context) ? 'count/list dual request or count response' : '',
      /start\s*[:=]|offset/.test(context) ? 'offset/start' : '',
      /limit\s*[:=]|MAX_LIMIT/.test(context) ? 'limit/segment' : '',
      /Promise\.all/.test(context) ? 'parallel requests' : '',
      /rollReq|rollReqUseCount|rollReqUseTotalCount/.test(context) ? 'service pagination helper' : ''
    ])
  }
  return request
}

function responseHints(context) {
  return {
    defaultEnvelope: '$http resolves transformedResponse.data when transformData=true',
    adapterHints: unique([
      /transformData\s*:\s*false/.test(context) ? 'transformData=false; caller inspects full envelope' : '',
      /originalResponse\s*:\s*true/.test(context) ? 'original Axios response' : '',
      /\.info\b/.test(context) ? 'info list' : '',
      /\.data\b/.test(context) ? 'data envelope' : '',
      /\.count\b/.test(context) ? 'count' : '',
      /info:\s*list|\{\s*count.*list/.test(context) ? 'info→list normalization' : '',
      /\[0\]|const \[\w+\]/.test(context) ? 'first-item normalization' : '',
      /normalization|normalize|localSort/.test(context) ? 'normalization/sort adapter' : '',
      /bk_error_code/.test(context) ? 'manual error-envelope inspection' : ''
    ]),
    unknowns: ['runtime response keys require contract test']
  }
}

function nearestSymbol(source, index, kind) {
  const prefix = source.slice(0, index)
  const patterns = kind === 'store'
    ? [/([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/gm]
    : [/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm, /(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm]
  let last = null
  for (const pattern of patterns) {
    for (const match of prefix.matchAll(pattern)) last = { name: match[1], index: match.index }
  }
  return last?.name || 'unknown'
}

function storeNamespace(file) {
  const relative = path.relative(path.join(root, 'src/ui/src/store/modules/api'), file)
  return relative.replace(/\.js$/, '').split(path.sep).join('.')
}

function callerIndex(files) {
  return files.map(file => ({ file: rel(file), source: read(file) }))
}

function findStoreCallers(namespace, action, views) {
  const patterns = [
    new RegExp(`dispatch\\s*\\(\\s*['"]${namespace.replace(/\./g, '\\.')}/${action}['"]`, 'g'),
    new RegExp(`mapActions\\s*\\([^)]*['"]${action}['"]`, 'g')
  ]
  const callers = []
  for (const item of views) {
    for (const pattern of patterns) {
      for (const match of item.source.matchAll(pattern)) {
        callers.push({ file: item.file, line: lineAt(item.source, match.index), kind: 'vuex-dispatch' })
      }
    }
  }
  return callers
}

function findServiceCallers(symbol, services, views) {
  if (!symbol || symbol === 'unknown') return []
  const callers = []
  const pattern = new RegExp(`\\b${symbol.replace(/[$]/g, '\\$&')}\\s*\\(`, 'g')
  for (const item of views) {
    for (const match of item.source.matchAll(pattern)) callers.push({ file: item.file, line: lineAt(item.source, match.index), kind: 'service-call' })
  }
  return callers
}

function domainFor(file, endpoint) {
  const value = `${file} ${endpoint}`.toLowerCase()
  const domains = []
  if (/cloud|cloudserver|cloudsync/.test(value)) domains.push('cloud')
  if (/collector|netcollect|agent/.test(value)) domains.push('collector')
  if (/kubernetes|kube|container|pod|workload/.test(value)) domains.push('kubernetes')
  if (/full_text|fulltext|elasticsearch|monstache|\/es\b/.test(value)) domains.push('elasticsearch/Monstache')
  if (/iam|oidc|permission|auth|login|logout|userinfo|session/.test(value)) domains.push('IAM/OIDC')
  if (/secret|redis|zookeeper|\bzk\b/.test(value)) domains.push('secret/redis/zk')
  return unique(domains)
}

function collectHttpCalls(file, source, kind, backend, views, allServiceFiles) {
  const calls = []
  const methodPattern = /(?:\$http|http)\.(get|post|put|patch|delete)\s*\(\s*([`'"`])([^`'"\n]+)\2/g
  for (const match of source.matchAll(methodPattern)) {
    const method = match[1].toUpperCase()
    const endpoint = match[3]
    const symbol = nearestSymbol(source, match.index, kind)
    const context = snippet(source, match.index, 560)
    const namespace = kind === 'store' ? storeNamespace(file) : undefined
    const callers = kind === 'store' ? findStoreCallers(namespace, symbol, views) : findServiceCallers(symbol, allServiceFiles, views)
    const dependencies = domainFor(rel(file), endpoint)
    calls.push(makeRecord({ file, source, kind, method, endpoint, symbol, namespace, match, context, callers, dependencies, backend }))
  }
  const downloadPattern = /(?:\$?http)\.download\s*\(\s*\{[\s\S]*?url\s*:\s*([`'"`])([^`'"\n]+)\1/g
  for (const match of source.matchAll(downloadPattern)) {
    const endpoint = match[2]
    const symbol = nearestSymbol(source, match.index, kind)
    const context = snippet(source, match.index, 620)
    const namespace = kind === 'store' ? storeNamespace(file) : undefined
    const callers = kind === 'store' ? findStoreCallers(namespace, symbol, views) : findServiceCallers(symbol, allServiceFiles, views)
    const dependencies = domainFor(rel(file), endpoint)
    calls.push(makeRecord({ file, source, kind, method: 'GET', endpoint, symbol, namespace, match, context, callers, dependencies, backend, operation: 'download' }))
  }
  return calls
}

function makeRecord({ file, source, kind, method, endpoint, symbol, namespace, match, context, callers, dependencies, backend, operation }) {
  const matchInfo = routeMatch(endpoint, backend)
  const transport = detectTransport(endpoint, context)
  const pathParams = extractPathParams(endpoint)
  const dynamic = pathParams.length > 0 || /getSearchUrl|urls\s*=|\?\s*:|if\s*\(/.test(context)
  const request = extractHints(context)
  const response = responseHints(context)
  const internalDispatch = unique([...context.matchAll(/(?:dispatch|context\.dispatch)\s*\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]))
  const errors = unique([
    /9900403|PermissionCode/.test(context) ? '9900403 permission' : '',
    /1306000|TokenInvalidCode/.test(context) ? '1306000 token invalid' : '',
    /401/.test(context) ? 'HTTP 401' : '',
    /403/.test(context) ? 'HTTP 403' : '',
    /500/.test(context) ? 'HTTP 500' : '',
    /bk_error_code/.test(context) ? 'bk_error_code envelope' : ''
  ])
  const status = dependencies.length ? '外部依赖阻塞' : '仅静态'
  return {
    id: `${kind}:${rel(file)}:${lineAt(source, match.index)}:${method}:${endpoint}`,
    source: {
      kind: kind === 'store' ? 'vuex-action' : 'service-http',
      file: rel(file),
      line: lineAt(source, match.index),
      symbol,
      namespace,
      operation: operation || 'request',
      expression: source.slice(match.index, Math.min(source.length, match.index + 180)).split('\n')[0].trim()
    },
    callers: callers.length ? callers : [{ file: rel(file), line: lineAt(source, match.index), kind: 'definition-only' }],
    http: {
      method,
      endpointTemplate: endpoint,
      normalizedEndpoint: normalizePath(endpointPath(endpoint)),
      transport,
      pathParams,
      dynamicSelector: dynamic ? 'static-dynamic-selector' : 'static-literal',
      routeMatch: matchInfo
    },
    request,
    response,
    permissions: {
      hints: unique([
        /globalPermission/.test(context) ? 'globalPermission config' : '',
        /with_biz|resource|noauth/.test(endpoint) ? 'endpoint-specific host permission variant' : '',
        /rootGetters|Supplier|supplier/.test(context) ? 'tenant/supplier context' : ''
      ]),
      status: 'unknown; runtime matrix required'
    },
    errors: {
      codes: errors,
      status: errors.length ? 'static-hints' : 'unknown; runtime matrix required'
    },
    relations: {
      internalDispatch,
      serviceComposition: unique([
        /Promise\.all/.test(context) ? 'parallel composition' : '',
        /rollReq|rollReqUse/.test(context) ? 'pagination helper' : '',
        /getSearchUrl|urls\s*=/.test(context) ? 'endpoint selector' : ''
      ])
    },
    externalDependencies: dependencies,
    evidence: {
      status,
      current: ['static source extraction only'],
      required: ['method/payload/response runtime trace', 'permission/error/empty-state test', 'write/read-back and cleanup when mutating']
    },
    status,
    notes: dynamic ? ['Dynamic endpoint or selector requires caller-specific contract variants'] : []
  }
}

function generateManifest() {
  const storeFiles = filesUnder(path.join(root, 'src/ui/src/store/modules/api'), ['.js'])
  const serviceFiles = filesUnder(path.join(root, 'src/ui/src/service'), ['.js'])
  const viewFiles = callerIndex(filesUnder(path.join(root, 'src/ui/src/views'), ['.vue', '.js']))
  const backend = collectBackendRoutes()
  const records = [
    ...storeFiles.flatMap(file => collectHttpCalls(file, read(file), 'store', backend, viewFiles, serviceFiles)),
    ...serviceFiles.flatMap(file => collectHttpCalls(file, read(file), 'service', backend, viewFiles, serviceFiles))
  ].sort((a, b) => a.source.file.localeCompare(b.source.file) || a.source.line - b.source.line)
  const statuses = Object.fromEntries(allowedStatuses.map(status => [status, records.filter(record => record.status === status).length]))
  const routeMatches = Object.fromEntries(['direct-route-match', 'generic-proxy-only', 'unmatched'].map(kind => [kind, records.filter(record => record.http.routeMatch.kind === kind).length]))
  const domains = {}
  for (const record of records) for (const domain of record.externalDependencies) domains[domain] = (domains[domain] || 0) + 1
  let commit = 'unknown'
  let branch = 'unknown'
  let dirty = null
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim()
    dirty = execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim().length > 0
  } catch {}
  return {
    schemaVersion: 1,
    reportKind: 'legacy-g1-contract-manifest',
    generatedAt: new Date().toISOString(),
    git: { commit, branch, dirty },
    sources: {
      legacy: ['src/ui/src/api/index.js', 'src/ui/src/store/modules/api/**', 'src/ui/src/service/**', 'src/ui/src/views/**'],
      backend: ['src/scene_server/**', 'src/source_controller/**', 'src/web_server/**', 'src/apiserver/**'],
      documentation: ['docs/apidoc/**']
    },
    counts: {
      records: records.length,
      vuexRecords: records.filter(record => record.source.kind === 'vuex-action').length,
      serviceRecords: records.filter(record => record.source.kind === 'service-http').length,
      withCallers: records.filter(record => record.callers.some(caller => caller.kind !== 'definition-only')).length,
      dynamicSelectors: records.filter(record => record.http.dynamicSelector !== 'static-literal').length,
      routeMatches,
      statuses,
      externalDomains: domains,
      backendRoutes: backend.routes.length,
      backendGenericProxy: backend.genericProxy
    },
    records,
    notes: [
      'This manifest is static extraction evidence, not runtime contract proof.',
      'Payload defaults, response shapes, permissions, error behavior and read-back must be confirmed by contract tests.',
      'Dynamic selectors and same-path payload variants are retained as separate source records.',
      'External dependency status is a conservative source-level heuristic and must be replaced by environment evidence.'
    ]
  }
}

if (require.main === module) process.stdout.write(`${JSON.stringify(generateManifest(), null, 2)}\n`)

module.exports = {
  allowedStatuses,
  normalizePath,
  endpointPath,
  routeMatch,
  collectBackendRoutes,
  generateManifest
}
