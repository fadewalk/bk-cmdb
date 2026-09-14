#!/usr/bin/env node

const assert = require('node:assert/strict')
const {
  DELETE_PROTECTION_CODE,
  codeOf,
  dataOf,
  isOk,
  responseSummary,
  flattenBusinesses,
  findDefaultModule,
  modulesOf,
  hostItems,
  makeReport
} = require('./run-g1-host-contract.cjs')

const okResponse = { status: 200, data: { result: true, bk_error_code: 0, data: { info: [{ host: { bk_host_id: 7 } }] } } }
assert.equal(codeOf(okResponse), 0)
assert.deepEqual(dataOf(okResponse), { info: [{ host: { bk_host_id: 7 } }] })
assert.equal(isOk(okResponse), true)
assert.deepEqual(hostItems(okResponse), [{ bk_host_id: 7 }])

const errorResponse = { status: 400, data: { result: false, bk_error_code: DELETE_PROTECTION_CODE, bk_error_msg: 'associated' } }
assert.equal(codeOf(errorResponse), DELETE_PROTECTION_CODE)
assert.equal(isOk(errorResponse), false)
assert.deepEqual(responseSummary(errorResponse), { status: 400, code: DELETE_PROTECTION_CODE, result: false, message: 'associated' })

assert.deepEqual(flattenBusinesses({ status: 200, data: { data: { info: [{ biz: [{ bk_biz_id: 2 }] }] } } }), [{ bk_biz_id: 2 }])
assert.deepEqual(require('./run-g1-host-contract.cjs').hostItems({ status: 200, data: { data: [{ bk_host_id: 7 }] } }), [{ bk_host_id: 7 }])
assert.equal(findDefaultModule({ status: 200, data: { module: [{ bk_module_id: 1, default: 1 }] } }).bk_module_id, 1)
assert.deepEqual(modulesOf({ module: [{ bk_module_id: 1 }, { bk_module_id: 2 }] }), [1, 2])

const report = makeReport('blocked', { deleteProtection: 'blocked' }, [], [], [], [])
assert.equal(report.contract.deleteProtectionCode, DELETE_PROTECTION_CODE)
assert.equal(report.reportKind, 'legacy-g1-host-contract')

process.stdout.write('G1 Host contract unit checks passed\n')
