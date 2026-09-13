#!/usr/bin/env node

/**
 * Generate a machine-readable API migration manifest.
 *
 * This is intentionally conservative: source extraction records evidence and
 * confidence, rather than claiming payload/response parity from a path match.
 */
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const v3ApiFile = path.join(root, 'src/ui-v3/src/api/cmdb.js')
const v3Source = fs.readFileSync(v3ApiFile, 'utf8')

function filesUnder(dir, extension) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...filesUnder(file, extension))
    else if (file.endsWith(extension)) out.push(file)
  }
  return out
}

const v3Files = filesUnder(path.join(root, 'src/ui-v3/src'), '.vue').concat(
  filesUnder(path.join(root, 'src/ui-v3/src'), '.js')
)
const v3Exports = []
const exportPattern = /export const (\w+)\s*=\s*(?:\([^\n]*\)|\w+)\s*=>\s*\w+\.(get|post|put|delete)\(\s*([`'\"])([^`'\"]+)\3/g
for (const match of v3Source.matchAll(exportPattern)) {
  const [, name, method, , endpoint] = match
  const callers = []
  for (const file of v3Files) {
    const rel = path.relative(root, file)
    if (rel === 'src/ui-v3/src/api/cmdb.js') continue
    const source = fs.readFileSync(file, 'utf8')
    const re = new RegExp(`\\b${name}\\s*\\(`)
    const hit = re.exec(source)
    if (hit) callers.push({ file: rel, line: source.slice(0, hit.index).split('\n').length })
  }
  const baseURL = /baseURL:\s*['"]['"]/.test(v3Source.slice(Math.max(0, match.index - 250), match.index + 500)) ? 'root' : 'api-v3'
  v3Exports.push({ name, method: method.toUpperCase(), endpoint, transport: baseURL, callerCount: callers.length, callers })
}

function legacyDefinitions() {
  const files = filesUnder(path.join(root, 'src/ui/src/store/modules/api'), '.js').concat(
    filesUnder(path.join(root, 'src/ui/src/service'), '.js')
  )
  const definitions = []
  const pattern = /\$(?:http|httpClient)\.(get|post|put|delete|patch)\(\s*([`'\"])([^`'\"]+)\2/g
  for (const file of files) {
    const rel = path.relative(root, file)
    const source = fs.readFileSync(file, 'utf8')
    for (const match of source.matchAll(pattern)) {
      definitions.push({ method: match[1].toUpperCase(), endpoint: match[3], file: rel, line: source.slice(0, match.index).split('\n').length })
    }
  }
  return definitions
}

function normalize(endpoint) {
  return endpoint.replace(/\$\{[^}]+\}/g, '*').replace(/\{[^}]+\}/g, '*').replace(/:[A-Za-z0-9_?]+/g, '*').replace(/^\/+/, '').replace(/\?.*$/, '').replace(/\/+$/, '')
}

const legacy = legacyDefinitions()
const normalizedV3 = v3Exports.map((item) => ({ ...item, normalizedEndpoint: normalize(item.endpoint) }))
const normalizedLegacy = legacy.map((item) => ({ ...item, normalizedEndpoint: normalize(item.endpoint) }))
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  git: { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(), branch: execFileSync('git', ['branch', '--show-current'], { cwd: root }).toString().trim() },
  counts: {
    legacyDefinitions: normalizedLegacy.length,
    legacyUniqueMethodEndpoints: new Set(normalizedLegacy.map((x) => `${x.method} ${x.normalizedEndpoint}`)).size,
    v3Exports: normalizedV3.length,
    v3ExportsWithCallers: normalizedV3.filter((x) => x.callerCount > 0).length,
    v3UnusedExports: normalizedV3.filter((x) => x.callerCount === 0).length
  },
  legacy: normalizedLegacy,
  v3: normalizedV3,
  notes: [
    'Static extraction does not prove payload, response shape, runtime reachability, permission behavior or write read-back.',
    'Legacy URLs may be composed dynamically and service/store layers can duplicate one contract.',
    'Use run-b*.cjs request traces and integration tests as higher-confidence evidence.'
  ]
}
console.log(JSON.stringify(manifest, null, 2))
