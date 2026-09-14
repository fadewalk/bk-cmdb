#!/usr/bin/env node

const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const { allowedStatuses } = require('./legacy-g1-manifest.cjs')

const requiredTopLevel = ['schemaVersion', 'reportKind', 'generatedAt', 'git', 'counts', 'records', 'notes']
const requiredRecordPaths = [
  ['source'],
  ['callers'],
  ['http'],
  ['request'],
  ['response'],
  ['permissions'],
  ['errors'],
  ['evidence'],
  ['status']
]

function fail(errors) {
  process.stderr.write(`${errors.map(error => `manifest validation: ${error}`).join('\n')}\n`)
  process.exitCode = 1
}

function readInput() {
  if (process.env.G1_LEGACY_MANIFEST_PATH) return fs.readFileSync(process.env.G1_LEGACY_MANIFEST_PATH, 'utf8')
  if (process.argv[2]) return fs.readFileSync(process.argv[2], 'utf8')
  const generated = spawnSync(process.execPath, [require.resolve('./legacy-g1-manifest.cjs')], { encoding: 'utf8' })
  if (generated.status !== 0) throw new Error(generated.stderr || 'manifest generator failed')
  return generated.stdout
}

function get(value, path) {
  return path.reduce((current, key) => current == null ? undefined : current[key], value)
}

function validate(manifest) {
  const errors = []
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['top-level value must be an object']
  for (const key of requiredTopLevel) if (!(key in manifest)) errors.push(`missing top-level field ${key}`)
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1')
  if (manifest.reportKind !== 'legacy-g1-contract-manifest') errors.push('reportKind must be legacy-g1-contract-manifest')
  if (!manifest.git || typeof manifest.git.commit !== 'string' || typeof manifest.git.branch !== 'string') errors.push('git.commit and git.branch are required strings')
  if (!Array.isArray(manifest.records)) errors.push('records must be an array')
  if (!Array.isArray(manifest.notes)) errors.push('notes must be an array')
  for (let index = 0; index < (manifest.records || []).length; index += 1) {
    const record = manifest.records[index]
    for (const path of requiredRecordPaths) if (get(record, path) === undefined) errors.push(`records[${index}] missing ${path.join('.')}`)
    if (record?.status && !allowedStatuses.includes(record.status)) errors.push(`records[${index}] has invalid status ${record.status}`)
    if (record?.callers && !Array.isArray(record.callers)) errors.push(`records[${index}].callers must be an array`)
    if (record?.http && typeof record.http.method !== 'string') errors.push(`records[${index}].http.method must be a string`)
    if (record?.http && typeof record.http.endpointTemplate !== 'string') errors.push(`records[${index}].http.endpointTemplate must be a string`)
    if (record?.evidence && (!Array.isArray(record.evidence.current) || !Array.isArray(record.evidence.required))) errors.push(`records[${index}].evidence.current/required must be arrays`)
  }
  return errors
}

function summarize(manifest) {
  const records = manifest.records || []
  const by = (selector) => records.reduce((result, record) => {
    const key = selector(record) || 'unknown'
    result[key] = (result[key] || 0) + 1
    return result
  }, {})
  const priority = records
    .filter(record => record.status !== 'G1 通过')
    .sort((a, b) => {
      const rank = record => (record.externalDependencies?.length ? 2 : 0) + (record.http?.routeMatch?.kind !== 'direct-route-match' ? 1 : 0) + (record.http?.dynamicSelector !== 'static-literal' ? 1 : 0)
      return rank(b) - rank(a) || a.id.localeCompare(b.id)
    })
    .slice(0, 20)
    .map(record => ({ id: record.id, status: record.status, routeMatch: record.http?.routeMatch?.kind, dependencies: record.externalDependencies || [], source: record.source?.file }))
  return {
    schemaVersion: 1,
    reportKind: 'legacy-g1-contract-manifest-summary',
    sourceCommit: manifest.git?.commit || 'unknown',
    recordCount: records.length,
    bySourceKind: by(record => record.source?.kind),
    byStatus: by(record => record.status),
    byRouteMatch: by(record => record.http?.routeMatch?.kind),
    dynamicSelectorCount: records.filter(record => record.http?.dynamicSelector !== 'static-literal').length,
    unknownPermissionCount: records.filter(record => record.permissions?.status?.startsWith('unknown')).length,
    unknownResponseCount: records.filter(record => (record.response?.unknowns || []).length > 0).length,
    contractTestPriority: priority,
    validStaticStatusesOnly: records.every(record => ['未盘点', '仅静态', '外部依赖阻塞'].includes(record.status))
  }
}

if (require.main === module) {
  try {
    const manifest = JSON.parse(readInput())
    const errors = validate(manifest)
    if (errors.length) fail(errors)
    else process.stdout.write(`${JSON.stringify(summarize(manifest), null, 2)}\n`)
  } catch (error) {
    fail([error.message])
  }
}

module.exports = { validate, summarize }
