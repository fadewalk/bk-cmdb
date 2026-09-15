#!/usr/bin/env node

const assert = require('node:assert/strict')
const { pathComparable, classify, menuRecords } = require('./replacement-parity-matrix.cjs')
const { validate, summarize } = require('./validate-replacement-parity.cjs')

assert.equal(pathComparable('/business/:bizId/index'), 'business/*/index')
assert.equal(pathComparable('/business/2/index'), 'business/*/index')
assert.equal(classify('/business/2/index', [{ path: '/business/:bizId/index' }], '').status, 'direct')
assert.equal(classify('/network/collect', [], 'collector network service').status, 'dependency-blocked')
assert.ok(menuRecords().some(record => record.value === '业务拓扑'))

const matrix = {
  schemaVersion: 1,
  reportKind: 'ui-replacement-parity-matrix',
  generatedAt: new Date().toISOString(),
  git: { commit: 'fixture', branch: 'test', dirty: false },
  policy: {},
  counts: { menuRecords: 1, menuTextMatched: 1 },
  routes: [{ legacyPath: '/business/:bizId/index', legacySource: { file: 'fixture.js', line: 1 }, v3Matches: [], status: 'direct', dependency: null, evidence: [], requiredEvidence: ['real readback'] }],
  menus: [{ value: '业务', v3TextMatch: true }],
  notes: []
}
assert.deepEqual(validate(matrix), [])
assert.equal(summarize(matrix).replacementReady, true)
assert.ok(validate({}).length > 0)
assert.equal(summarize({ ...matrix, git: { ...matrix.git, dirty: true } }).replacementReady, false)
process.stdout.write('replacement parity unit checks passed\n')
