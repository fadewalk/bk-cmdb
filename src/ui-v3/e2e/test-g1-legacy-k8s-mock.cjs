#!/usr/bin/env node

const assert = require('node:assert/strict')
const {
  BIZ_ID,
  POD_ID,
  CONTAINER_ID,
  WORKLOAD_ID,
  PERMISSION_CODE,
  REPORT_KIND,
  POD_FIELDS,
  NODE_FIELDS,
  NAMESPACE_FIELDS,
  CONTAINER_FIELDS,
  WORKLOAD_FIELDS,
  FILTER,
  CONTAINER_FILTER,
  POD,
  CONTAINER,
  WORKLOAD,
  POD_PATH,
  ATTRIBUTES,
  codeOf,
  dataOf,
  isOk,
  responseSummary,
  infoOf,
  enableCount,
  onePageParams,
  listPairParams,
  expectBody,
  expectListBody,
  expectTopoPathBody,
  makeReport
} = require('./run-g1-legacy-k8s-mock.cjs')

assert.equal(BIZ_ID, 2)
assert.equal(POD_ID, 101)
assert.equal(CONTAINER_ID, 201)
assert.equal(WORKLOAD_ID, 13)
assert.equal(PERMISSION_CODE, 9900403)
assert.equal(REPORT_KIND, 'legacy-g1-k8s-mock')

const listResponse = { status: 200, data: { result: true, code: 0, data: { count: 1, info: [POD] } } }
assert.equal(codeOf(listResponse), 0)
assert.deepEqual(dataOf(listResponse), { count: 1, info: [POD] })
assert.equal(isOk(listResponse), true)
assert.deepEqual(infoOf(listResponse), [POD])

const deniedResponse = { status: 403, data: { result: false, bk_error_code: PERMISSION_CODE, bk_error_msg: 'permission denied' } }
assert.equal(codeOf(deniedResponse), PERMISSION_CODE)
assert.equal(isOk(deniedResponse), false)
assert.deepEqual(responseSummary(deniedResponse), {
  status: 403,
  code: PERMISSION_CODE,
  result: false,
  message: 'permission denied'
})

const params = {
  bk_biz_id: BIZ_ID,
  fields: POD_FIELDS,
  filter: FILTER,
  page: { start: 0, limit: 20, sort: 'id' }
}
assert.deepEqual(enableCount(params, false), { ...params, page: { start: 0, limit: 20, sort: 'id', enable_count: false } })
assert.deepEqual(enableCount(params, true), { ...params, page: { start: 0, limit: 0, sort: '', enable_count: true } })
assert.deepEqual(onePageParams(), { start: 0, limit: 1 })
assert.deepEqual(listPairParams(params), {
  list: enableCount(params, false),
  count: enableCount(params, true)
})

expectBody({ fields: POD_FIELDS }, { fields: POD_FIELDS }, 'fields')
assert.throws(() => expectBody({ fields: ['id'] }, { fields: POD_FIELDS }, 'fields'), /body mismatch/)
expectListBody(enableCount(params, false), { fields: POD_FIELDS, filter: FILTER, flag: false })
expectListBody(enableCount(params, true), { fields: POD_FIELDS, filter: FILTER, flag: true })
expectListBody(enableCount({ ...params, bk_pod_id: POD_ID, fields: CONTAINER_FIELDS, filter: CONTAINER_FILTER }, false), {
  fields: CONTAINER_FIELDS,
  filter: CONTAINER_FILTER,
  podId: POD_ID,
  flag: false
})
assert.deepEqual(CONTAINER_FIELDS, ['id', 'name', 'container_uid'])
assert.deepEqual(NODE_FIELDS, ['id', 'name', 'bk_cluster_id', 'bk_host_id', 'hostname'])
assert.deepEqual(NAMESPACE_FIELDS, ['id', 'name', 'bk_cluster_id', 'labels'])
assert.deepEqual(WORKLOAD_FIELDS, ['id', 'name', 'bk_namespace_id', 'replicas'])
assert.deepEqual(CONTAINER_FILTER, {
  condition: 'AND',
  rules: [{ field: 'name', operator: 'equal', value: 'cmdb' }]
})

const topoParams = {
  bk_biz_id: BIZ_ID,
  bk_reference_obj_id: 'business',
  bk_reference_id: BIZ_ID,
  page: { start: 0, limit: 100 }
}
expectTopoPathBody(enableCount(topoParams, false), false)
expectTopoPathBody(enableCount(topoParams, true), true)
assert.equal(POD_PATH.bk_pod_id, POD_ID)
assert.equal(WORKLOAD.kind, 'statefulSet')
assert.equal(ATTRIBUTES[0].field, 'name')

const report = makeReport('passed', {
  happy: 'passed', empty: 'passed', server500: 'passed', permission403: 'passed'
}, [], [], [], { available: true, required: false })
assert.equal(report.assessment.offline, 'passed')
assert.equal(report.assessment.infra, 'required')
assert.equal(report.assessment.realK8s, 'blocked')
assert.equal(report.layers.realK8s.status, 'blocked')
assert.equal(report.contract.countPair.includes('enable_count=false'), true)
assert.equal(report.contract.list.some((item) => item.includes('container/by_topo')), true)

process.stdout.write('G1 legacy K8s mock contract unit checks passed\n')
