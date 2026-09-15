#!/usr/bin/env node

const assert = require('node:assert/strict')
const {
  AUTH_FAILURE_CODE,
  REPORT_KIND,
  ACCOUNT,
  REGIONS,
  TASK,
  codeOf,
  dataOf,
  isOk,
  responseSummary,
  infoOf,
  expectBody,
  makeReport
} = require('./run-g1-cloud-mock.cjs')

const list = { status: 200, data: { result: true, code: 0, data: { count: 1, info: [ACCOUNT] } } }
assert.equal(codeOf(list), 0)
assert.deepEqual(dataOf(list), { count: 1, info: [ACCOUNT] })
assert.equal(isOk(list), true)
assert.deepEqual(infoOf(list), [ACCOUNT])

const arrayEnvelope = { status: 200, data: { result: true, code: 0, data: REGIONS } }
assert.deepEqual(infoOf(arrayEnvelope), REGIONS)
assert.deepEqual(infoOf({ status: 200, data: { result: true, code: 0, data: { info: [TASK] } } }), [TASK])

const rawVerify = { status: 200, data: { result: true, code: 0, data: { result: true, bk_error_msg: '' } } }
assert.equal(rawVerify.data.result, true)
assert.equal(dataOf(rawVerify).result, true)

const forbidden = { status: 403, data: { result: false, bk_error_code: AUTH_FAILURE_CODE, bk_error_msg: 'permission denied' } }
assert.equal(codeOf(forbidden), AUTH_FAILURE_CODE)
assert.equal(isOk(forbidden), false)
assert.deepEqual(responseSummary(forbidden), {
  status: 403,
  code: AUTH_FAILURE_CODE,
  result: false,
  message: 'permission denied'
})

assert.doesNotThrow(() => expectBody({ a: 1 }, { a: 1 }, 'body'))
assert.throws(() => expectBody({ a: 1 }, { a: 2 }, 'body'), /body mismatch/)

const report = makeReport('passed', {
  account: 'passed', area: 'passed', discover: 'passed', empty: 'passed', failures: 'passed'
}, [], [], [], { offline: 'passed', infra: 'not required' })
assert.equal(report.reportKind, REPORT_KIND)
assert.equal(report.layers.offline.status, 'passed')
assert.equal(report.layers.infra.status, 'not required')
assert.equal(report.layers.liveCloud.status, 'blocked')
assert.equal(report.layerStatus['live-cloud'], 'blocked')
assert.equal(report.contract.errors.auth, AUTH_FAILURE_CODE)
assert.equal(report.contract.region, 'with_host_count')

process.stdout.write('G1 Cloud mock contract unit checks passed\n')
