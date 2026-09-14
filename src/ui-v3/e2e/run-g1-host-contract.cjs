// G1-B: legacy Host batch-edit, transfer and deletion-protection contract.
// This is an API-level runner using the real browser session; it does not add UI features.
const fs = require('node:fs')
const { chromium } = require('./browser.cjs')
const { api: request } = require('./support/api.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const TAG = `${Date.now()}${Math.floor(Math.random() * 10000)}`
const HOST_PREFIX = `g1-host-${TAG}`
const SET_PREFIX = `g1-set-${TAG}`
const MODULE_PREFIX = `g1-module-${TAG}`
const MODEL_PREFIX = `g1_guard_${TAG}`
const DELETE_PROTECTION_CODE = 1101036

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function codeOf(response) {
  return response?.data?.bk_error_code ?? response?.data?.code
}

function dataOf(response) {
  return response?.data?.data ?? response?.data
}

function isOk(response) {
  return response?.status >= 200 && response?.status < 300 && (codeOf(response) === 0 || response?.data?.result === true)
}

function responseSummary(response) {
  return {
    status: response?.status,
    code: codeOf(response),
    result: response?.data?.result,
    message: response?.data?.bk_error_msg || response?.data?.message || null
  }
}

function expectOk(response, label) {
  assert(isOk(response), `${label} failed: ${JSON.stringify(responseSummary(response))}`)
  return dataOf(response)
}

function infoOf(response) {
  const data = dataOf(response)
  if (Array.isArray(data)) return data
  return data?.info || data?.data?.info || []
}

function flattenBusinesses(response) {
  const items = infoOf(response)
  return items.flatMap((item) => Array.isArray(item?.biz) ? item.biz : [item?.biz || item]).filter(Boolean)
}

function findId(value, keys) {
  if (!value || typeof value !== 'object') return null
  for (const key of keys) if (value[key] !== undefined && value[key] !== null) return value[key]
  return null
}

function modulesOf(item) {
  const values = []
  const visit = (value) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) return value.forEach(visit)
    const id = findId(value, ['bk_module_id', 'module_id'])
    if (id !== null) values.push(Number(id))
    for (const key of ['module', 'modules', 'set', 'biz']) visit(value[key])
  }
  visit(item)
  return [...new Set(values)]
}

function hostItems(response) {
  return infoOf(response).map(item => item?.host || item).filter(Boolean)
}

function findDefaultModule(response) {
  const data = dataOf(response) || {}
  const modules = data.module || data.modules || []
  return modules.find(module => Number(module.default) === 1 || Number(module.is_default) === 1)
    || modules.find(module => /空闲|idle/i.test(String(module.bk_module_name || module.name)))
    || null
}

function makeReport(status, stages, requests, cleanup, errors, pageErrors) {
  return {
    schemaVersion: 1,
    reportKind: 'legacy-g1-host-contract',
    generatedAt: new Date().toISOString(),
    git: { commit: process.env.GIT_COMMIT || 'runtime', branch: process.env.GIT_BRANCH || 'unknown' },
    status,
    stages,
    requests,
    cleanup,
    errors,
    pageErrors,
    contract: {
      deleteProtectionCode: DELETE_PROTECTION_CODE,
      batchUpdate: 'PUT /api/v3/hosts/batch',
      transferPreview: 'POST /api/v3/host/transfer_with_auto_clear_service_instance/bk_biz_id/:bizId/preview',
      transferExecute: 'POST /api/v3/host/transfer_with_auto_clear_service_instance/bk_biz_id/:bizId',
      hostDelete: 'DELETE /api/v3/hosts/batch'
    }
  }
}

async function run() {
  const stages = {
    health: 'pending',
    batchEdit: 'blocked',
    transfer: 'blocked',
    deleteProtection: 'blocked'
  }
  const requests = []
  const cleanup = []
  const errors = []
  const pageErrors = []
  const ids = { bizId: null, defaultModuleId: null, setId: null, moduleA: null, moduleB: null, hostId: null, guardObjId: null, guardModelId: null, guardAttrIds: [], associationDefId: null, associationInstId: null }
  let browser
  let page
  const call = async (method, path, body, options) => {
    const result = await request(page, method, path, body, options)
    requests.push({ method, path, body: body === undefined ? null : body, response: responseSummary(result) })
    return result
  }
  const cleanupCall = async (label, method, path, body) => {
    try {
      const response = await call(method, path, body)
      cleanup.push({ label, ...responseSummary(response), ok: isOk(response) })
      if (!isOk(response)) errors.push(`${label}: ${JSON.stringify(responseSummary(response))}`)
      return response
    } catch (error) {
      cleanup.push({ label, ok: false, error: error.message })
      errors.push(`${label}: ${error.message}`)
      return null
    }
  }

  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await context.newPage()
    await page.route('**/*', (route) => {
      const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
      delete headers['if-none-match']
      return route.continue({ headers })
    })
    page.on('pageerror', error => pageErrors.push(`pageerror: ${error.message}`))
    page.on('console', message => { if (message.type() === 'error') pageErrors.push(`console.error: ${message.text()}`) })

    await page.goto(`${BASE}/#/index`, { waitUntil: 'load', timeout: 30000 })
    const probe = await call('POST', '/findmany/hosts/search/resource', { condition: [], page: { start: 0, limit: 1 } })
    if (!isOk(probe)) throw Object.assign(new Error(`Host API unavailable: ${JSON.stringify(responseSummary(probe))}`), { blocked: true })
    stages.health = 'passed'

    const bizResponse = await call('POST', '/biz/search/0', { page: { start: 0, limit: 200 } })
    const businesses = flattenBusinesses(bizResponse)
    const biz = businesses.find(item => Number(item.bk_biz_id) === 2 && item.bk_data_status !== 'disabled')
      || businesses.find(item => item.bk_data_status !== 'disabled' && Number(item.bk_biz_id) > 0)
    assert(biz, 'no enabled business available for Host contract')
    ids.bizId = Number(biz.bk_biz_id)

    const topo = await call('GET', `/topo/internal/0/${ids.bizId}/with_statistics`)
    const defaultModule = findDefaultModule(topo)
    assert(defaultModule, `no default idle module for business ${ids.bizId}`)
    ids.defaultModuleId = Number(findId(defaultModule, ['bk_module_id', 'module_id']))

    const setResponse = await call('POST', `/set/${ids.bizId}`, { bk_set_name: SET_PREFIX, bk_parent_id: ids.bizId, bk_supplier_account: '0' })
    ids.setId = Number(expectOk(setResponse, 'create temporary set')?.bk_set_id)
    assert(ids.setId, 'temporary set id missing')
    const moduleResponse = await call('POST', `/module/${ids.bizId}/${ids.setId}`, { bk_module_name: `${MODULE_PREFIX}-a`, bk_parent_id: ids.setId, bk_supplier_account: '0' })
    ids.moduleA = Number(expectOk(moduleResponse, 'create temporary module A')?.bk_module_id)
    const moduleBResponse = await call('POST', `/module/${ids.bizId}/${ids.setId}`, { bk_module_name: `${MODULE_PREFIX}-b`, bk_parent_id: ids.setId, bk_supplier_account: '0' })
    ids.moduleB = Number(expectOk(moduleBResponse, 'create temporary module B')?.bk_module_id)
    assert(ids.moduleA && ids.moduleB, 'temporary module ids missing')

    const hostIp = `192.0.2.${(Number(String(Date.now()).slice(-2)) % 200) + 1}`
    const hostResponse = await call('POST', '/hosts/add/resource', { host_info: [{ bk_host_innerip: hostIp, bk_host_name: HOST_PREFIX, bk_cloud_id: 0 }] })
    const hostData = expectOk(hostResponse, 'create temporary resource host')
    ids.hostId = Number(hostData?.success?.[0]?.bk_host_id)
    assert(ids.hostId, 'temporary host id missing')

    const updateResponse = await call('PUT', '/hosts/batch', { bk_host_id: String(ids.hostId), bk_host_name: `${HOST_PREFIX}-renamed` })
    expectOk(updateResponse, 'batch update host')
    const updateReadback = await call('POST', '/findmany/hosts/search/resource', {
      condition: [{ bk_obj_id: 'host', fields: ['bk_host_id', 'bk_host_name'], condition: [{ field: 'bk_host_id', operator: '$eq', value: ids.hostId }] }],
      page: { start: 0, limit: 1 }
    })
    const updatedHost = hostItems(updateReadback).find(host => Number(host.bk_host_id) === ids.hostId)
    assert(updatedHost?.bk_host_name === `${HOST_PREFIX}-renamed`, `batch update read-back mismatch: ${JSON.stringify(updatedHost)}`)
    stages.batchEdit = 'passed'

    expectOk(await call('POST', '/hosts/modules/resource/idle', { bk_biz_id: ids.bizId, bk_host_id: [ids.hostId] }), 'assign host to idle module')
    expectOk(await call('POST', '/hosts/modules', { bk_biz_id: ids.bizId, bk_host_id: [ids.hostId], bk_module_id: [ids.moduleA], is_increment: false }), 'assign host to module A')
    const transferPayload = { bk_host_ids: [ids.hostId], remove_from_modules: [ids.moduleA], add_to_modules: [ids.moduleB], is_remove_from_all: false }
    const preview = await call('POST', `/host/transfer_with_auto_clear_service_instance/bk_biz_id/${ids.bizId}/preview`, transferPayload)
    const previewData = expectOk(preview, 'transfer preview')
    const plans = Array.isArray(previewData) ? previewData : (previewData?.plans || previewData?.info || [])
    assert(plans.length > 0, `transfer preview returned no plan: ${JSON.stringify(previewData)}`)
    assert(plans.some(plan => Number(plan.bk_host_id) === ids.hostId && (!plan.final_modules || plan.final_modules.map(Number).includes(ids.moduleB))), `transfer preview missing target module: ${JSON.stringify(plans)}`)
    expectOk(await call('POST', `/host/transfer_with_auto_clear_service_instance/bk_biz_id/${ids.bizId}`, transferPayload), 'transfer execute')
    const transferReadback = await call('POST', '/hosts/modules/read', { bk_biz_id: ids.bizId, bk_host_id: [ids.hostId] })
    const relationData = dataOf(transferReadback)
    const relations = Array.isArray(relationData) ? relationData : infoOf(transferReadback)
    assert(relations.some(relation => modulesOf(relation).includes(ids.moduleB) || Number(relation.bk_module_id) === ids.moduleB || Number(relation.module_id) === ids.moduleB), `transfer read-back missing module B: ${JSON.stringify(relationData)}`)
    stages.transfer = 'passed'

    try {
      const classifications = await call('POST', '/find/objectclassification', {})
      const classification = infoOf(classifications)[0]
      assert(classification, 'no model classification available for deletion-protection fixture')
      ids.guardObjId = `${MODEL_PREFIX}`
      const modelResponse = await call('POST', '/create/object', {
        bk_obj_id: ids.guardObjId,
        bk_obj_name: ids.guardObjId,
        bk_obj_icon: 'icon-cc-default',
        bk_classification_id: classification.bk_classification_id,
        bk_supplier_account: '0',
        creator: 'admin'
      })
      ids.guardModelId = Number(expectOk(modelResponse, 'create deletion-protection model')?.id)
      const attrResponse = await call('POST', '/create/objectattr', {
        bk_obj_id: ids.guardObjId,
        bk_property_id: `${MODEL_PREFIX}_name`,
        bk_property_name: 'G1 guard name',
        bk_property_type: 'singlechar',
        unit: '', placeholder: '', isrequired: false, bk_property_group: 'default', bk_supplier_account: '0'
      })
      const attrId = Number(expectOk(attrResponse, 'create deletion-protection model attribute')?.id)
      if (attrId) ids.guardAttrIds.push(attrId)
      const instResponse = await call('POST', `/create/instance/object/${ids.guardObjId}`, { bk_inst_name: `${MODEL_PREFIX}-instance`, [`${MODEL_PREFIX}_name`]: `${MODEL_PREFIX}-instance` })
      const guardInstId = Number(expectOk(instResponse, 'create deletion-protection instance')?.bk_inst_id)
      assert(guardInstId, 'deletion-protection instance id missing')
      const kinds = await call('POST', '/find/associationtype', {})
      const kind = infoOf(kinds).find(item => item.bk_asst_id === 'default') || infoOf(kinds)[0]
      assert(kind, 'no association type available for deletion-protection fixture')
      const definition = await call('POST', '/create/objectassociation', {
        bk_obj_id: 'host', bk_asst_obj_id: ids.guardObjId, bk_asst_id: kind.bk_asst_id,
        bk_obj_asst_id: `${MODEL_PREFIX}_asst`, mapping: 'n:n'
      })
      const definitionData = expectOk(definition, 'create host association definition')
      ids.associationDefId = Number(definitionData?.id)
      const association = await call('POST', '/create/instassociation', {
        bk_obj_asst_id: definitionData?.bk_obj_asst_id,
        bk_inst_id: ids.hostId,
        bk_asst_inst_id: guardInstId
      })
      ids.associationInstId = Number(expectOk(association, 'create host instance association')?.id)
      assert(ids.associationInstId, 'host association id missing')

      const protectedDelete = await call('DELETE', '/hosts/batch', { bk_host_id: String(ids.hostId), bk_supplier_account: '0' })
      assert(codeOf(protectedDelete) === DELETE_PROTECTION_CODE, `delete protection code mismatch: ${JSON.stringify(responseSummary(protectedDelete))}`)
      const protectedReadback = await call('POST', '/findmany/hosts/search/noauth', {
        condition: [{ bk_obj_id: 'host', fields: [], condition: [{ field: 'bk_host_id', operator: '$eq', value: ids.hostId }] }],
        page: { start: 0, limit: 1 }
      })
      assert(hostItems(protectedReadback).some(host => Number(host.bk_host_id) === ids.hostId), 'protected host disappeared after rejected delete')
      stages.deleteProtection = 'passed'
    } catch (error) {
      stages.deleteProtection = 'blocked'
      errors.push(`delete protection fixture blocked: ${error.message}`)
    }
  } catch (error) {
    errors.push(error.message)
    return makeReport(error.blocked ? 'blocked' : 'failed', stages, requests, cleanup, errors, pageErrors)
  } finally {
    if (page) {
      if (ids.associationInstId) await cleanupCall('delete host instance association', 'DELETE', `/delete/instassociation/host/${ids.associationInstId}`)
      if (ids.associationDefId) await cleanupCall('delete host association definition', 'DELETE', `/delete/objectassociation/${ids.associationDefId}`)
      if (ids.guardObjId) {
        const instances = await call('POST', `/search/instances/object/${ids.guardObjId}`, { page: { start: 0, limit: 100 } }).catch(() => null)
        for (const instance of instances ? infoOf(instances) : []) await cleanupCall(`delete guard instance ${instance.bk_inst_id}`, 'DELETE', `/delete/instance/object/${ids.guardObjId}/inst/${instance.bk_inst_id}`)
        if (ids.guardModelId) await cleanupCall('delete deletion-protection model cascade', 'DELETE', `/delete/object/${ids.guardModelId}`)
      }
      if (ids.hostId) {
        await cleanupCall('move temporary host to idle', 'POST', '/hosts/modules/idle', { bk_biz_id: ids.bizId, bk_host_id: [ids.hostId] })
        await cleanupCall('move temporary host to resource pool', 'POST', '/hosts/modules/resource', { bk_biz_id: ids.bizId, bk_host_id: [ids.hostId] })
        await cleanupCall('delete temporary host', 'DELETE', '/hosts/batch', { bk_host_id: String(ids.hostId), bk_supplier_account: '0' })
      }
      if (ids.moduleA && ids.setId) await cleanupCall('delete temporary module A', 'DELETE', `/module/${ids.bizId}/${ids.setId}/${ids.moduleA}`)
      if (ids.moduleB && ids.setId) await cleanupCall('delete temporary module B', 'DELETE', `/module/${ids.bizId}/${ids.setId}/${ids.moduleB}`)
      if (ids.setId) await cleanupCall('delete temporary set', 'DELETE', `/set/${ids.bizId}/${ids.setId}`)
      await browser.close()
    }
  }
  const status = stages.health === 'passed' && stages.batchEdit === 'passed' && stages.transfer === 'passed' && stages.deleteProtection === 'passed' ? 'passed' : 'blocked'
  return makeReport(status, stages, requests, cleanup, errors, pageErrors)
}

if (require.main === module) {
  run().then((report) => {
    const output = JSON.stringify(report, null, 2)
    if (process.env.G1_HOST_REPORT_PATH) fs.writeFileSync(process.env.G1_HOST_REPORT_PATH, `${output}\n`)
    process.stdout.write(`${output}\n`)
    if (report.status !== 'passed' || report.errors.length || report.pageErrors.length) process.exitCode = report.status === 'blocked' ? 2 : 1
  }).catch((error) => {
    process.stderr.write(`G1 Host runner crashed: ${error.stack || error}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  BASE,
  DELETE_PROTECTION_CODE,
  codeOf,
  dataOf,
  isOk,
  responseSummary,
  flattenBusinesses,
  findDefaultModule,
  modulesOf,
  hostItems,
  makeReport,
  run
}
