#!/usr/bin/env node

const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

const required = ['schemaVersion', 'reportKind', 'generatedAt', 'git', 'policy', 'counts', 'routes', 'menus', 'notes']
const statuses = ['direct', 'redirect', 'embedded', 'dependency-blocked', 'missing', 'unknown']

function validate(matrix) {
  const errors = []
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) return ['matrix must be an object']
  for (const key of required) if (!(key in matrix)) errors.push(`missing top-level field ${key}`)
  if (matrix.schemaVersion !== 1) errors.push('schemaVersion must be 1')
  if (matrix.reportKind !== 'ui-replacement-parity-matrix') errors.push('reportKind mismatch')
  if (!matrix.git || typeof matrix.git.commit !== 'string' || typeof matrix.git.branch !== 'string') errors.push('git commit/branch required')
  if (!Array.isArray(matrix.routes)) errors.push('routes must be an array')
  if (!Array.isArray(matrix.menus)) errors.push('menus must be an array')
  for (const [index, route] of (matrix.routes || []).entries()) {
    if (!route.legacyPath || !route.legacySource?.file) errors.push(`routes[${index}] missing legacyPath/source`)
    if (!statuses.includes(route.status)) errors.push(`routes[${index}] invalid status ${route.status}`)
    if (!Array.isArray(route.requiredEvidence)) errors.push(`routes[${index}] requiredEvidence must be array`)
  }
  // Legacy route files intentionally repeat canonical paths in nested routers.
  // Preserve those source records; duplicate paths are a matrix fact, not a schema error.
  return errors
}

function readInput() {
  if (process.env.REPLACEMENT_MATRIX_PATH) return fs.readFileSync(process.env.REPLACEMENT_MATRIX_PATH, 'utf8')
  if (process.argv[2]) return fs.readFileSync(process.argv[2], 'utf8')
  const generated = spawnSync(process.execPath, [require.resolve('./replacement-parity-matrix.cjs')], { encoding: 'utf8' })
  if (generated.status !== 0) throw new Error(generated.stderr || 'matrix generator failed')
  return generated.stdout
}

function summarize(matrix) {
  const routes = matrix.routes || []
  const byStatus = Object.fromEntries(statuses.map(status => [status, routes.filter(route => route.status === status).length]))
  const missingNonDependency = routes.filter(route => route.status === 'missing' && !route.dependency).map(route => ({ path: route.legacyPath, source: route.legacySource }))
  return {
    schemaVersion: 1,
    reportKind: 'ui-replacement-parity-summary',
    sourceCommit: matrix.git.commit,
    dirty: matrix.git.dirty,
    counts: matrix.counts,
    routeStatus: byStatus,
    missingNonDependency,
    dependencyBlocked: routes.filter(route => route.status === 'dependency-blocked').map(route => ({ path: route.legacyPath, dependency: route.dependency })),
    menuTextCoverage: matrix.counts.menuRecords ? matrix.counts.menuTextMatched / matrix.counts.menuRecords : 0,
    replacementReady: !matrix.git.dirty && byStatus.missing === 0 && byStatus.unknown === 0,
    caveat: 'replacementReady is a static gate only; it does not prove behavior, API, read-back, visual parity or production safety.'
  }
}

if (require.main === module) {
  try {
    const matrix = JSON.parse(readInput())
    const errors = validate(matrix)
    if (errors.length) {
      process.stderr.write(`${errors.join('\n')}\n`)
      process.exitCode = 1
    } else process.stdout.write(`${JSON.stringify(summarize(matrix), null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`replacement matrix validation: ${error.message}\n`)
    process.exitCode = 1
  }
}

module.exports = { validate, summarize }
