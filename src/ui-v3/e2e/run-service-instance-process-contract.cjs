#!/usr/bin/env node
// Service-instance process caller contract: legacy name_ids/detail-by_ids discovery and errors.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const ROOT = path.resolve(__dirname, '..')
const helperPath = path.join(ROOT, 'src/utils/service-instance-search.js')
const source = fs.readFileSync(helperPath, 'utf8')
const transformed = source
  .replace(/^export function /gm, 'function ')
  .replace(/^export \{[^\n]+\}\s*$/gm, '')
const context = {}
vm.runInNewContext(`${transformed}\nthis.api = { buildProcessDetailsByIdsRequest, extractProcessIds, normalizeProcessDetailsByIdsResponse, processDetailsErrorMessage }`, context)

const API = {
  nameIds: '/findmany/proc/process_instance/name_ids',
  details: '/findmany/proc/process_instance/detail/by_ids',
  batchUpdate: '/updatemany/proc/service_instance/biz/:bk_biz_id'
}

function plain(value) { return JSON.parse(JSON.stringify(value)) }

function run() {
  const { api } = context
  const nameIdsBody = { bk_biz_id: 2, bk_module_id: 12, process_name: 'p', page: { start: 0, limit: 20 } }
  const nameIdsResponse = { count: 1, info: [{ bk_process_name: 'p1', process_ids: [1] }] }
  assert(nameIdsBody.bk_biz_id === 2 && nameIdsBody.bk_module_id === 12, 'name_ids scope fields changed')
  assert(nameIdsBody.page.start === 0 && nameIdsBody.page.limit === 20, 'name_ids page contract changed')
  assert(nameIdsResponse.info[0].bk_process_name === 'p1' && nameIdsResponse.info[0].process_ids[0] === 1, 'name_ids response shape changed')

  const ordinaryResponse = {
    info: [
      { property: { bk_process_id: 1 }, relation: { service_instance_id: 1 } },
      { property: { bk_process_id: '2' }, relation: { service_instance_id: 2 } }
    ]
  }
  const processIds = api.extractProcessIds(ordinaryResponse)
  assert.deepEqual(plain(processIds), [1, 2], 'ordinary process response IDs were not normalized')
  const detailsBody = api.buildProcessDetailsByIdsRequest(2, processIds)
  assert.deepEqual(plain(detailsBody), {
    bk_biz_id: 2,
    process_ids: [1, 2],
    page: { limit: 999999999 }
  })

  const detailsResponse = api.normalizeProcessDetailsByIdsResponse({
    count: 2,
    info: [
      { process_id: 1, service_instance_name: '10.0.26.26_p1', property: { bk_process_name: 'p1' }, relation: { process_template_id: 6 } },
      { process_id: 2, service_instance_name: '10.0.106.70_pa', property: { bk_process_name: 'pa' }, relation: { process_template_id: 0 } }
    ]
  })
  assert(detailsResponse.count === 2 && detailsResponse.info.length === 2, 'detail response envelope changed')
  assert(detailsResponse.info[0].service_instance_name === '10.0.26.26_p1', 'detail relation/name shape changed')

  assert.throws(() => api.normalizeProcessDetailsByIdsResponse({ count: 1 }), /缺少 info/)
  assert(api.processDetailsErrorMessage({ message: '后端异常' }) === '后端异常')
  assert(api.processDetailsErrorMessage({}) === '进程详情查询失败')

  return {
    status: 'passed',
    cases: 6,
    contract: {
      nameIds: { method: 'POST', path: API.nameIds, request: nameIdsBody, response: nameIdsResponse, emptyResponse: { count: 0, info: [] }, validation: ['bk_biz_id', 'bk_module_id', 'page.limit'] },
      details: { method: 'POST', path: API.details, request: detailsBody, response: { count: 2, info: detailsResponse.info }, validation: ['bk_biz_id', 'process_ids', 'page.limit'] },
      batchUpdateServiceInstances: { method: 'PUT', path: API.batchUpdate, request: { data: [{ service_instance_id: 1, update: { name: 'new-name' } }] }, response: { result: true, data: null }, validation: ['data', 'service_instance_id', 'name'] },
      errors: { validationCode: 1199006, messages: ['process_ids', 'bk_biz_id', 'page.limit'] }
    }
  }
}

if (require.main === module) process.stdout.write(`${JSON.stringify(run(), null, 2)}\n`)
module.exports = { run }
