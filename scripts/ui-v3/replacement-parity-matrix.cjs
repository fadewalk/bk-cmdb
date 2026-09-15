#!/usr/bin/env node

// Generate a replacement-oriented legacy route/menu parity matrix.
// This is intentionally conservative: string matches become evidence, not completion.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const legacyRoot = path.join(root, 'src/ui/src')
const v3Root = path.join(root, 'src/ui-v3/src')
const statuses = ['direct', 'redirect', 'embedded', 'dependency-blocked', 'missing', 'unknown']
const dependencyTerms = [
  ['kubernetes', /kube|pod|container|workload|namespace|cluster/i],
  ['elasticsearch/monstache', /full.?text|elasticsearch|monstache|find\/full_text/i],
  ['blueking-iam/oidc', /iam|oidc|auth\/verify|auth\/skip_url|sub-saas/i],
  ['blueking-nodeman/collector', /nodeman|collector|net.?collect|agent/i],
  ['cloud-vendor', /cloud\/account|cloud\/sync|cloudserver|aws|tencent/i]
]

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
function read(file) { try { return fs.readFileSync(file, 'utf8') } catch { return '' } }
function rel(file) { return path.relative(root, file).split(path.sep).join('/') }
function lineAt(text, index) { return text.slice(0, index).split('\n').length }
function normalize(value) { return String(value || '').replace(/\s+/g, ' ').trim() }
function unique(values) { return [...new Set(values.filter(Boolean))] }

function legacyRouteRecords() {
  const files = filesUnder(path.join(legacyRoot, 'views'), ['.js'])
    .filter(file => /router\.config\.js$|router\.js$|route/i.test(file))
  const records = []
  const patterns = [
    /path\s*:\s*['"`]([^'"`]+)['"`]/g,
    /(?:name|route)\s*:\s*['"`]([^'"`]+)['"`]/g
  ]
  for (const file of files) {
    const source = read(file)
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const value = normalize(match[1])
        if (!value || value === '/' || value.length > 180) continue
        records.push({ path: value, source: { file: rel(file), line: lineAt(source, match.index) } })
      }
    }
  }
  const byKey = new Map()
  for (const record of records) byKey.set(`${record.path}|${record.source.file}|${record.source.line}`, record)
  return [...byKey.values()].sort((a, b) => a.path.localeCompare(b.path) || a.source.file.localeCompare(b.source.file))
}

function v3RouteInventory() {
  const files = filesUnder(path.join(v3Root), ['.js', '.vue'])
  const routes = []
  const routePatterns = [
    /path\s*:\s*['"`]([^'"`]+)['"`]/g,
    /(?:path|hash)\s*===?\s*['"`]([^'"`]+)['"`]/g,
    /['"`](\/[^'"`\s]{2,})['"`]/g
  ]
  for (const file of files) {
    const source = read(file)
    for (const pattern of routePatterns) {
      for (const match of source.matchAll(pattern)) {
        const value = normalize(match[1])
        if (!value || value === '/' || value.length > 180) continue
        routes.push({ path: value, source: { file: rel(file), line: lineAt(source, match.index) } })
      }
    }
  }
  const byPath = new Map()
  for (const route of routes) if (!byPath.has(route.path)) byPath.set(route.path, route)
  return [...byPath.values()]
}

function routeTokens(value) {
  return String(value || '').replace(/^#?\//, '').split(/[/?]/).filter(Boolean).filter(token => !/^:?[A-Za-z0-9_-]+$/.test(token) || token.startsWith(':'))
}
function pathComparable(value) {
  return String(value || '')
    .replace(/^#?\//, '')
    .replace(/:\w+/g, '*')
    .replace(/\([^)]*\)/g, '*')
    .replace(/\d+/g, '*')
    .replace(/\/+$/, '')
}
function dependencyFor(pathValue, sourceText) {
  const text = `${pathValue} ${sourceText}`
  for (const [name, pattern] of dependencyTerms) if (pattern.test(text)) return name
  return null
}
function classify(legacyPath, matchingV3, sourceText) {
  const dependency = dependencyFor(legacyPath, sourceText)
  if (matchingV3.length > 0) {
    const same = matchingV3.some(item => pathComparable(item.path) === pathComparable(legacyPath))
    return { status: same ? 'direct' : 'redirect', dependency }
  }
  if (dependency) return { status: 'dependency-blocked', dependency }
  return { status: 'missing', dependency: null }
}

function menuRecords() {
  const legacyFile = path.join(legacyRoot, 'dictionary/menu.js')
  const v3File = path.join(v3Root, 'layout/menu-config.js')
  const source = read(legacyFile)
  const v3Source = read(v3File)
  const records = []
  const pattern = /i18n\s*:\s*['"`]([^'"`]+)['"`]/g
  for (const match of source.matchAll(pattern)) {
    const value = normalize(match[1])
    if (value.length < 2 || value.length > 100) continue
    const v3Hit = v3Source.includes(value) || filesUnder(path.join(v3Root, 'layout'), ['.js', '.vue']).some(file => read(file).includes(value))
    records.push({ value, legacySource: { file: rel(legacyFile), line: lineAt(source, match.index) }, v3TextMatch: v3Hit })
  }
  return records
}

function generatedGit() {
  try {
    return {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      branch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(),
      dirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0
    }
  } catch { return { commit: 'unknown', branch: 'unknown', dirty: null } }
}

function generate() {
  const legacyRoutes = legacyRouteRecords()
  const v3Routes = v3RouteInventory()
  const allLegacyVueFiles = filesUnder(path.join(legacyRoot, 'views'), ['.vue'])
  const routeMatrix = legacyRoutes.map(record => {
    const matching = v3Routes.filter(route => {
      const left = pathComparable(record.path)
      const right = pathComparable(route.path)
      return left === right || left.includes(right) || right.includes(left)
    })
    const sourceText = read(path.join(root, record.source.file))
    const classification = classify(record.path, matching, sourceText)
    return {
      legacyPath: record.path,
      legacySource: record.source,
      v3Matches: matching.slice(0, 8),
      status: classification.status,
      dependency: classification.dependency,
      evidence: classification.status === 'direct' ? ['static route match only'] : [],
      requiredEvidence: ['refresh/copy-url/back/invalid-id/error/permission behavior', 'real API/read-back where mutating']
    }
  })
  const menu = menuRecords()
  const counts = {
    legacyViewFiles: allLegacyVueFiles.length,
    v3ViewFiles: filesUnder(path.join(v3Root, 'views'), ['.vue']).length,
    legacyRouteRecords: routeMatrix.length,
    v3RouteInventory: v3Routes.length,
    routeStatus: Object.fromEntries(statuses.map(status => [status, routeMatrix.filter(record => record.status === status).length])),
    dependencyDomains: Object.fromEntries(unique(routeMatrix.map(record => record.dependency)).map(domain => [domain, routeMatrix.filter(record => record.dependency === domain).length])),
    menuRecords: menu.length,
    menuTextMatched: menu.filter(record => record.v3TextMatch).length
  }
  return {
    schemaVersion: 1,
    reportKind: 'ui-replacement-parity-matrix',
    generatedAt: new Date().toISOString(),
    git: generatedGit(),
    policy: {
      sourceOfTruth: 'src/ui',
      target: 'src/ui-v3',
      completionRequires: ['route behavior', 'API method/payload/response', 'error/permission/empty', 'write/read-back/cleanup', 'visual evidence'],
      dependencyStatuses: ['dependency-blocked', 'unsupported']
    },
    counts,
    routes: routeMatrix,
    menus: menu,
    notes: [
      'Static route/menu matching is not functional parity.',
      'A redirect or embedded page must still prove interaction, query restoration, error states and read-back.',
      'Strong BlueKing ecosystem dependencies remain explicit boundary items rather than fabricated UI implementations.'
    ]
  }
}

if (require.main === module) process.stdout.write(`${JSON.stringify(generate(), null, 2)}\n`)
module.exports = { generate, legacyRouteRecords, v3RouteInventory, menuRecords, classify, pathComparable }
