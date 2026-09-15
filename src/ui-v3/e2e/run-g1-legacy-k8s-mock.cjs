#!/usr/bin/env node

// D.1: legacy K8s read/query contract.
//
// This runner deliberately uses fresh browser contexts and page.route() mocks.
// It exercises the request/response contract from src/ui/src/service/container and
// src/ui/src/service/topology without claiming that a live Kubernetes cluster works.
const fs = require('node:fs')
const assert = require('node:assert/strict')

let chromium
function getChromium() {
  if (!chromium) chromium = require('./browser.cjs').chromium
  return chromium
}

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const BIZ_ID = 2
const POD_ID = 101
const CONTAINER_ID = 201
const CLUSTER_ID = 11
const NAMESPACE_ID = 12
const WORKLOAD_ID = 13
const PERMISSION_CODE = 9900403
const REPORT_KIND = 'legacy-g1-k8s-mock'

const POD_FIELDS = ['id', 'name', 'bk_cluster_id', 'bk_namespace_id', 'ref']
const NODE_FIELDS = ['id', 'name', 'bk_cluster_id', 'bk_host_id', 'hostname']
const NAMESPACE_FIELDS = ['id', 'name', 'bk_cluster_id', 'labels']
const CONTAINER_FIELDS = ['id', 'name', 'container_uid']
const WORKLOAD_FIELDS = ['id', 'name', 'bk_namespace_id', 'replicas']
const TOPO_POD_FIELDS = ['id', 'name', 'namespace']
const TOPO_CONTAINER_FIELDS = ['id', 'name', 'container_uid']
const K8S_ENDPOINTS = Object.freeze([
  'POST /findmany/kube/pod',
  'POST /findmany/kube/node',
  'POST /findmany/kube/namespace',
  'POST /findmany/kube/workload/:kind',
  'POST /findmany/kube/container',
  'POST /findmany/kube/container/by_topo',
  'POST /find/kube/pod_path',
  'POST /find/kube/topo_path',
  'POST /find/kube/topo_node/:type/count',
  'GET /find/kube/:object/attributes'
])
const FILTER = {
  condition: 'AND',
  rules: [{ field: 'name', operator: 'equal', value: 'pod-mock-1' }]
}
const CONTAINER_FILTER = {
  condition: 'AND',
  rules: [{ field: 'name', operator: 'equal', value: 'cmdb' }]
}

const POD = {
  id: POD_ID,
  name: 'pod-mock-1',
  bk_biz_id: BIZ_ID,
  bk_cluster_id: CLUSTER_ID,
  bk_namespace_id: NAMESPACE_ID,
  namespace: 'default',
  ref: { kind: 'statefulSet', id: WORKLOAD_ID, name: 'workload-mock-1' },
  labels: { app: 'cmdb' },
  ip: '10.0.0.10',
  ips: [],
  bk_host_id: 501
}
const CONTAINER = {
  id: CONTAINER_ID,
  name: 'cmdb',
  bk_pod_id: POD_ID,
  container_uid: 'container-mock-1',
  image: 'cmdb:test',
  ports: [],
  args: [],
  started: true,
  limits: {},
  requests: {},
  liveness: {},
  environment: {},
  mounts: []
}
const WORKLOAD = {
  id: WORKLOAD_ID,
  name: 'workload-mock-1',
  bk_biz_id: BIZ_ID,
  bk_namespace_id: NAMESPACE_ID,
  kind: 'statefulSet',
  replicas: 1
}
const NODE = {
  id: 14,
  name: 'node-mock-1',
  bk_biz_id: BIZ_ID,
  bk_cluster_id: CLUSTER_ID,
  bk_host_id: 501,
  hostname: 'node-mock-1',
  internal_ip: ['10.0.0.11']
}
const NAMESPACE = {
  id: NAMESPACE_ID,
  name: 'default',
  bk_biz_id: BIZ_ID,
  bk_cluster_id: CLUSTER_ID,
  labels: { env: 'test' }
}
const POD_PATH = {
  bk_biz_id: BIZ_ID,
  biz_name: 'Mock Biz',
  bk_cluster_id: CLUSTER_ID,
  cluster_name: 'cluster-mock-1',
  bk_namespace_id: NAMESPACE_ID,
  namespace: 'default',
  kind: 'statefulSet',
  bk_workload_id: WORKLOAD_ID,
  workload_name: WORKLOAD.name,
  bk_pod_id: POD_ID
}
const TOPO_OBJECTS = [
  { id: CLUSTER_ID, name: 'cluster-mock-1', kind: 'cluster' },
  { id: NAMESPACE_ID, name: 'default', kind: 'namespace' },
  { id: WORKLOAD_ID, name: WORKLOAD.name, kind: 'statefulSet' }
]
const ATTRIBUTES = [
  { field: 'name', type: 'string', required: true, editable: false },
  { field: 'labels', type: 'mapString', required: false, editable: false }
]

function assertCondition(condition, message) {
  if (!condition) throw new Error(message)
}

function ok(data) {
  return { result: true, code: 0, message: 'success', permission: null, data }
}

function error(code, message) {
  return { result: false, bk_error_code: code, bk_error_msg: message, permission: [], data: null }
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

function infoOf(response) {
  const data = dataOf(response)
  if (Array.isArray(data)) return data
  return data?.info || data?.data?.info || []
}

// Pure equivalent of legacy service/utils.js enableCount(). The true branch
// intentionally replaces pagination with start=0/limit=0/sort='' for count.
function enableCount(params = {}, flag = false) {
  const page = flag
    ? { start: 0, limit: 0, sort: '', enable_count: true }
    : { ...(params.page || {}), enable_count: false }
  return { ...params, page }
}

function onePageParams() {
  return { start: 0, limit: 1 }
}

function listPairParams(params) {
  return {
    list: enableCount(params, false),
    count: enableCount(params, true)
  }
}

function routePath(url) {
  const parsed = new URL(url)
  return parsed.pathname.replace(/^\/api\/v3/, '') || '/'
}

function parseBody(route) {
  const raw = route.request().postData()
  if (!raw) return undefined
  try { return JSON.parse(raw) } catch { return raw }
}

function expectBody(body, expected, label) {
  assert.deepStrictEqual(body, expected, `${label} body mismatch: ${JSON.stringify(body)}`)
}

function expectSuccess(response, label) {
  assertCondition(isOk(response), `${label} failed: ${JSON.stringify(responseSummary(response))}`)
  return dataOf(response)
}

function expectListBody(body, { fields, filter = FILTER, podId = undefined, flag }) {
  assert.equal(body.bk_biz_id, BIZ_ID, 'bk_biz_id must be the selected business')
  assert.deepEqual(body.fields, fields, 'fields must be forwarded unchanged')
  assert.deepEqual(body.filter, filter, 'condition/filter must be forwarded unchanged')
  if (podId !== undefined) assert.equal(body.bk_pod_id, podId, 'bk_pod_id must be forwarded')
  assert.equal(body.page?.enable_count, flag, 'page.enable_count must select list/count request')
  if (flag) {
    assert.deepEqual(body.page, { start: 0, limit: 0, sort: '', enable_count: true })
  } else {
    assert.equal(body.page?.start, 0)
    assert.equal(body.page?.limit, 20)
    assert.equal(body.page?.sort, 'id')
  }
}

function expectTopoPathBody(body, flag) {
  assert.equal(body.bk_biz_id, BIZ_ID)
  assert.equal(body.bk_reference_obj_id, 'business')
  assert.equal(body.bk_reference_id, BIZ_ID)
  assert.equal(body.page?.enable_count, flag)
  if (flag) assert.deepEqual(body.page, { start: 0, limit: 0, sort: '', enable_count: true })
  else assert.deepEqual(body.page, { start: 0, limit: 100, enable_count: false })
}

function makeReport(status, stages, requests, errors, pageErrors, infra = {}) {
  const offline = status === 'passed' ? 'passed' : (infra.required ? 'not run' : 'failed')
  return {
    schemaVersion: 1,
    reportKind: REPORT_KIND,
    generatedAt: new Date().toISOString(),
    git: { commit: process.env.GIT_COMMIT || 'runtime', branch: process.env.GIT_BRANCH || 'unknown' },
    status,
    stages,
    requests,
    errors,
    pageErrors,
    assessment: {
      offline,
      infra: 'required',
      realK8s: 'blocked'
    },
    layers: {
      offline: { status: offline, scenarios: stages },
      infra: {
        status: 'required',
        available: infra.available === true,
        reason: 'The runner needs an HTTP 8090 UI origin for browser page.route/fetch checks.'
      },
      realK8s: {
        status: 'blocked',
        reason: 'All K8s endpoints are mocked locally; this report is not a real Kubernetes or CMDB integration result.'
      }
    },
    layerStatus: { offline, infra: 'required', 'real-k8s': 'blocked' },
    contract: {
      list: K8S_ENDPOINTS,
      countPair: 'legacy list services issue enable_count=false and enable_count=true requests',
      permissionCode: PERMISSION_CODE
    }
  }
}

async function fulfill(route, status, body) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  })
}

function shouldReturnEmpty(state, path) {
  return state.empty && ([
    '/findmany/kube/pod',
    '/findmany/kube/container',
    '/findmany/kube/node',
    '/findmany/kube/namespace',
    '/findmany/kube/workload/statefulSet',
    '/findmany/kube/container/by_topo',
    '/find/kube/pod_path',
    '/find/kube/topo_path'
  ].includes(path) || /^\/find\/kube\/[^/]+\/attributes$/.test(path))
}

function responseFor(path, body, state) {
  if (state.failurePath === path) {
    return { status: state.failureStatus, body: error(state.failureStatus === 403 ? PERMISSION_CODE : 500, state.failureStatus === 403 ? 'permission denied' : 'kube backend unavailable') }
  }

  const empty = shouldReturnEmpty(state, path)
    if (path === '/findmany/biz_set' || path === '/biz/search/0') return { status: 200, body: ok({ count: 0, info: [] }) }
    if (path === '/find/objectattr/web' || path === '/usercustom/user/search') return { status: 200, body: ok(empty ? [] : []) }
  if (path === '/findmany/kube/pod' || path === '/findmany/kube/container' || path === '/findmany/kube/node' || path === '/findmany/kube/namespace' || /^\/findmany\/kube\/workload\/[^/]+$/.test(path)) {
    const info = path.endsWith('/pod') ? POD : path.endsWith('/container') ? CONTAINER : path.endsWith('/node') ? NODE : path.endsWith('/namespace') ? NAMESPACE : WORKLOAD
    return {
      status: 200,
      body: ok(body?.page?.enable_count ? { count: empty ? 0 : 1, info: [] } : { count: 0, info: empty ? [] : [info] })
    }
  }
  if (path === '/findmany/kube/container/by_topo') {
    return { status: 200, body: ok(body?.page?.enable_count ? { count: empty ? 0 : 1, info: [] } : { count: 0, info: empty ? [] : [{ container: CONTAINER, pod: POD, topo: { bk_biz_id: BIZ_ID, bk_cluster_id: CLUSTER_ID, bk_namespace_id: NAMESPACE_ID, bk_workload_id: WORKLOAD_ID, workload_type: WORKLOAD.kind, bk_host_id: POD.bk_host_id } }] }) }
  }
  if (path === '/find/kube/pod_path') return { status: 200, body: ok({ info: empty ? [] : [POD_PATH] }) }
  if (path === '/find/kube/topo_path') return { status: 200, body: ok({ count: empty ? 0 : 3, info: empty ? [] : TOPO_OBJECTS }) }
  if (/^\/find\/kube\/topo_node\/(host|pod)\/count$/.test(path)) {
    return { status: 200, body: ok(empty ? [] : [{ kind: 'cluster', id: CLUSTER_ID, count: path.endsWith('/host/count') ? 1 : 1 }]) }
  }
  if (/^\/find\/kube\/[^/]+\/attributes$/.test(path)) return { status: 200, body: ok(empty ? [] : ATTRIBUTES) }
  return { status: 404, body: error(404, `unmocked K8s endpoint ${path}`) }
}

async function installKubeMocks(page, options = {}) {
  const state = {
    requests: [],
    failures: [],
    unhandled: [],
    pageErrors: [],
    empty: options.empty === true,
    failurePath: options.failurePath || null,
    failureStatus: options.failureStatus || 500
  }

  await page.route('**/*', async (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    await route.continue({ headers })
  })
  await page.route('**/userinfo', (route) => fulfill(route, 200, { result: true, data: { username: 'g1-mock', chname: 'G1 Mock User', current_supplier: '0' } }))
  await page.route('**/api/v3/**', async (route) => {
    const request = route.request()
    const path = routePath(request.url())
    const body = parseBody(route)
    state.requests.push({ method: request.method(), path, query: new URL(request.url()).search, body: body === undefined ? null : body })

    try {
      if (request.method() === 'POST' && path === '/findmany/kube/pod') {
        expectListBody(body, { fields: POD_FIELDS, flag: body?.page?.enable_count === true ? true : false })
      } else if (request.method() === 'POST' && path === '/findmany/kube/container') {
        expectListBody(body, { fields: CONTAINER_FIELDS, filter: CONTAINER_FILTER, podId: POD_ID, flag: body?.page?.enable_count === true ? true : false })
      } else if (request.method() === 'POST' && path === '/findmany/kube/node') {
        expectListBody(body, { fields: NODE_FIELDS, filter: FILTER, flag: body?.page?.enable_count === true ? true : false })
      } else if (request.method() === 'POST' && path === '/findmany/kube/namespace') {
        expectListBody(body, { fields: NAMESPACE_FIELDS, filter: FILTER, flag: body?.page?.enable_count === true ? true : false })
      } else if (request.method() === 'POST' && /^\/findmany\/kube\/workload\/([^/]+)$/.test(path)) {
        const kind = path.match(/^\/findmany\/kube\/workload\/([^/]+)$/)[1]
        assert.equal(kind, 'statefulSet', 'workload kind must remain dynamic and match the requested kind')
        expectListBody(body, { fields: WORKLOAD_FIELDS, filter: FILTER, flag: body?.page?.enable_count === true ? true : false })
      } else if (request.method() === 'POST' && path === '/findmany/kube/container/by_topo') {
        assert.equal(body?.bk_biz_id, BIZ_ID)
        assert.deepEqual(body?.bk_kube_nodes, [{ kind: 'statefulSet', id: WORKLOAD_ID }])
        assert.deepEqual(body?.pod_filter, FILTER)
        assert.deepEqual(body?.container_filter, CONTAINER_FILTER)
        assert.deepEqual(body?.pod_fields, TOPO_POD_FIELDS)
        assert.deepEqual(body?.container_fields, TOPO_CONTAINER_FIELDS)
        assert.equal(body?.page?.enable_count, body?.page?.enable_count === true)
      } else if (request.method() === 'POST' && path === '/find/kube/pod_path') {
        assert.equal(body?.bk_biz_id, BIZ_ID)
        assert.deepEqual(body?.ids, [POD_ID])
        if (body?.page) assert.equal(body.page.enable_count, true)
      } else if (request.method() === 'POST' && path === '/find/kube/topo_path') {
        expectTopoPathBody(body, body?.page?.enable_count === true)
      } else if (request.method() === 'POST' && /^\/find\/kube\/topo_node\/(host|pod)\/count$/.test(path)) {
        assert.equal(body?.bk_biz_id, BIZ_ID)
        assert.deepEqual(body?.resource_info, [{ kind: 'cluster', id: CLUSTER_ID }])
        assert.equal(body?.page, undefined, 'topology count uses resource_info chunking, not page pagination')
      } else if (request.method() === 'GET' && /^\/find\/kube\/[^/]+\/attributes$/.test(path)) {
        const object = path.match(/^\/find\/kube\/([^/]+)\/attributes$/)[1]
        assert(['pod', 'container', 'cluster', 'customResource'].includes(object), `unexpected K8s attributes object ${object}`)
        assert.equal(new URL(request.url()).searchParams.get('bk_biz_id'), String(BIZ_ID), 'attributes request must preserve bk_biz_id query')
      } else if (path === '/findmany/biz_set' || path === '/find/objectattr/web' || path === '/biz/search/0' || path === '/usercustom/user/search') {
        // Existing 8090 bootstrapping requests are not part of D.1; keep them
        // deterministic so page.route can run against the actual page.
      } else {
        state.unhandled.push({ method: request.method(), path, body })
      }

      const response = responseFor(path, body, state)
      await fulfill(route, response.status, response.body)
    } catch (requestError) {
      state.failures.push(`${request.method()} ${path}: ${requestError.message}`)
      await fulfill(route, 500, error(500, requestError.message))
    }
  })

  page.on('pageerror', (errorObject) => state.pageErrors.push(`pageerror: ${errorObject.message}`))
  return state
}

async function newPage(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const state = await installKubeMocks(page, options)
  return { context, page, state }
}

async function openOrigin(page) {
  await page.goto(`${BASE}/#/${process.env.G1_K8S_ROUTE || 'index'}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(150)
}

async function requestJson(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const response = await fetch(`/api/v3${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await response.text()
    let data = text
    try { data = JSON.parse(text) } catch {}
    return { status: response.status, data }
  }, { method, path, body })
}

function requireCleanMockState(state) {
  assert.equal(state.failures.length, 0, `mock request assertions failed: ${state.failures.join(' | ')}`)
  assert.equal(state.unhandled.length, 0, `unhandled K8s contract requests: ${JSON.stringify(state.unhandled)}`)
}

async function runHappy(browser) {
  const { context, page, state } = await newPage(browser)
  try {
    await openOrigin(page)

    const podParams = { bk_biz_id: BIZ_ID, fields: POD_FIELDS, filter: FILTER, page: { start: 0, limit: 20, sort: 'id' } }
    const podPair = listPairParams(podParams)
    const [podList, podCount] = await Promise.all([
      requestJson(page, 'POST', '/findmany/kube/pod', podPair.list),
      requestJson(page, 'POST', '/findmany/kube/pod', podPair.count)
    ])
    assert.deepEqual(infoOf(podList), [POD])
    assert.equal(dataOf(podCount).count, 1)

    const containerParams = { bk_biz_id: BIZ_ID, bk_pod_id: POD_ID, fields: CONTAINER_FIELDS, filter: CONTAINER_FILTER, page: { start: 0, limit: 20, sort: 'id' } }
    const containerPair = listPairParams(containerParams)
    const [containerList, containerCount] = await Promise.all([
      requestJson(page, 'POST', '/findmany/kube/container', containerPair.list),
      requestJson(page, 'POST', '/findmany/kube/container', containerPair.count)
    ])
    assert.deepEqual(infoOf(containerList), [CONTAINER])
    assert.equal(dataOf(containerCount).count, 1)

    const workloadParams = { bk_biz_id: BIZ_ID, fields: WORKLOAD_FIELDS, filter: FILTER, page: { start: 0, limit: 20, sort: 'id' } }
    const workloadPair = listPairParams(workloadParams)
    const [workloadList, workloadCount] = await Promise.all([
      requestJson(page, 'POST', '/findmany/kube/workload/statefulSet', workloadPair.list),
      requestJson(page, 'POST', '/findmany/kube/workload/statefulSet', workloadPair.count)
    ])
    assert.deepEqual(infoOf(workloadList), [WORKLOAD])
    assert.equal(dataOf(workloadCount).count, 1)

    const nodeParams = { bk_biz_id: BIZ_ID, fields: NODE_FIELDS, filter: FILTER, page: { start: 0, limit: 20, sort: 'id' } }
    const namespaceParams = { bk_biz_id: BIZ_ID, fields: NAMESPACE_FIELDS, filter: FILTER, page: { start: 0, limit: 20, sort: 'id' } }
    const [nodeList, nodeCount, namespaceList, namespaceCount] = await Promise.all([
      requestJson(page, 'POST', '/findmany/kube/node', enableCount(nodeParams, false)),
      requestJson(page, 'POST', '/findmany/kube/node', enableCount(nodeParams, true)),
      requestJson(page, 'POST', '/findmany/kube/namespace', enableCount(namespaceParams, false)),
      requestJson(page, 'POST', '/findmany/kube/namespace', enableCount(namespaceParams, true))
    ])
    assert.deepEqual(infoOf(nodeList), [NODE])
    assert.equal(dataOf(nodeCount).count, 1)
    assert.deepEqual(infoOf(namespaceList), [NAMESPACE])
    assert.equal(dataOf(namespaceCount).count, 1)

    const byTopo = {
      bk_biz_id: BIZ_ID,
      bk_kube_nodes: [{ kind: 'statefulSet', id: WORKLOAD_ID }],
      pod_filter: FILTER,
      container_filter: CONTAINER_FILTER,
      pod_fields: TOPO_POD_FIELDS,
      container_fields: TOPO_CONTAINER_FIELDS,
      page: { start: 0, limit: 20, sort: 'id', enable_count: false }
    }
    const byTopoList = await requestJson(page, 'POST', '/findmany/kube/container/by_topo', byTopo)
    assert.equal(dataOf(byTopoList).info[0].container.id, CONTAINER_ID)
    const byTopoCount = await requestJson(page, 'POST', '/findmany/kube/container/by_topo', { ...byTopo, page: { start: 0, limit: 0, sort: '', enable_count: true } })
    assert.equal(dataOf(byTopoCount).count, 1)

    const podPath = await requestJson(page, 'POST', '/find/kube/pod_path', { bk_biz_id: BIZ_ID, ids: [POD_ID] })
    assert.equal(infoOf(podPath)[0].bk_pod_id, POD_ID)
    // Legacy pod.getCount sends enable_count=true, although the backend's
    // PodPathData response is info-only. Keep this request visible in evidence.
    const podPathCountShape = await requestJson(page, 'POST', '/find/kube/pod_path', enableCount({ bk_biz_id: BIZ_ID, ids: [POD_ID] }, true))
    assert.equal(dataOf(podPathCountShape).info[0].bk_pod_id, POD_ID)

    const topoCount = await requestJson(page, 'POST', '/find/kube/topo_path', enableCount({ bk_biz_id: BIZ_ID, bk_reference_obj_id: 'business', bk_reference_id: BIZ_ID, page: { start: 0, limit: 100 } }, true))
    assert.equal(dataOf(topoCount).count, 3)
    const topoList = await requestJson(page, 'POST', '/find/kube/topo_path', enableCount({ bk_biz_id: BIZ_ID, bk_reference_obj_id: 'business', bk_reference_id: BIZ_ID, page: { start: 0, limit: 100 } }, false))
    assert.equal(infoOf(topoList).find((item) => item.kind === 'statefulSet').id, WORKLOAD_ID)

    const hostCount = await requestJson(page, 'POST', '/find/kube/topo_node/host/count', { bk_biz_id: BIZ_ID, resource_info: [{ kind: 'cluster', id: CLUSTER_ID }] })
    const podCountByTopo = await requestJson(page, 'POST', '/find/kube/topo_node/pod/count', { bk_biz_id: BIZ_ID, resource_info: [{ kind: 'cluster', id: CLUSTER_ID }] })
    assert.equal(infoOf(hostCount)[0].kind, 'cluster')
    assert.equal(infoOf(podCountByTopo)[0].kind, 'cluster')

    const attributes = await requestJson(page, 'GET', '/find/kube/pod/attributes?bk_biz_id=2')
    assert.equal(infoOf(attributes)[0].field, 'name')
    const customAttributes = await requestJson(page, 'GET', '/find/kube/customResource/attributes?bk_biz_id=2')
    assert.equal(infoOf(customAttributes)[0].type, 'string')

    requireCleanMockState(state)
    return { status: 'passed', requests: state.requests }
  } finally {
    await context.close()
  }
}

async function runEmpty(browser) {
  const { context, page, state } = await newPage(browser, { empty: true })
  try {
    await openOrigin(page)
    const params = { bk_biz_id: BIZ_ID, fields: POD_FIELDS, filter: FILTER, page: { start: 0, limit: 20, sort: 'id' } }
    const [list, count] = await Promise.all([
      requestJson(page, 'POST', '/findmany/kube/pod', enableCount(params, false)),
      requestJson(page, 'POST', '/findmany/kube/pod', enableCount(params, true))
    ])
    assert.deepEqual(infoOf(list), [])
    assert.equal(dataOf(count).count, 0)
    assert.deepEqual(infoOf(await requestJson(page, 'POST', '/find/kube/pod_path', { bk_biz_id: BIZ_ID, ids: [POD_ID] })), [])
    assert.deepEqual(infoOf(await requestJson(page, 'POST', '/find/kube/topo_path', enableCount({ bk_biz_id: BIZ_ID, bk_reference_obj_id: 'business', bk_reference_id: BIZ_ID, page: { start: 0, limit: 100 } }, false))), [])
    assert.deepEqual(infoOf(await requestJson(page, 'GET', '/find/kube/pod/attributes?bk_biz_id=2')), [])
    requireCleanMockState(state)
    return { status: 'passed', requests: state.requests }
  } finally {
    await context.close()
  }
}

async function runFailures(browser) {
  const scenarios = {}
  for (const [name, status] of [['server500', 500], ['permission403', 403]]) {
    const { context, page, state } = await newPage(browser, { failurePath: '/findmany/kube/pod', failureStatus: status })
    try {
      await openOrigin(page)
      const response = await requestJson(page, 'POST', '/findmany/kube/pod', enableCount({ bk_biz_id: BIZ_ID, fields: POD_FIELDS, filter: FILTER, page: { start: 0, limit: 20, sort: 'id' } }, false))
      assert.equal(response.status, status)
      assert.equal(codeOf(response), status === 403 ? PERMISSION_CODE : 500)
      assert.equal(isOk(response), false)
      scenarios[name] = 'passed'
      requireCleanMockState(state)
    } finally {
      await context.close()
    }
  }
  return { status: 'passed', scenarios }
}

async function run() {
  const stages = { happy: 'pending', empty: 'pending', server500: 'pending', permission403: 'pending' }
  const requests = []
  const errors = []
  const pageErrors = []
  let browser
  let infraAvailable = false
  try {
    browser = await getChromium().launch({ headless: true })
    const happy = await runHappy(browser)
    stages.happy = happy.status
    requests.push(...happy.requests)
    const empty = await runEmpty(browser)
    stages.empty = empty.status
    requests.push(...empty.requests)
    const failures = await runFailures(browser)
    stages.server500 = failures.scenarios.server500
    stages.permission403 = failures.scenarios.permission403
    infraAvailable = true
  } catch (runError) {
    errors.push(runError.message)
    if (/ERR_CONNECTION|net::|timeout|UI server|Target page|page.goto/i.test(runError.message)) errors.push('infra required: UI_V3_BASE_URL is not serving the existing 8090 page')
  } finally {
    if (browser) await browser.close()
  }

  const passed = Object.values(stages).every((stage) => stage === 'passed')
  const infraRequired = errors.some((item) => /infra required|ERR_CONNECTION|net::|timeout/i.test(item))
  const status = passed ? 'passed' : (infraRequired ? 'infra required' : 'failed')
  return makeReport(status, stages, requests, errors, pageErrors, { required: infraRequired, available: infraAvailable })
}

if (require.main === module) {
  run().then((report) => {
    const output = JSON.stringify(report, null, 2)
    if (process.env.G1_LEGACY_K8S_REPORT_PATH) fs.writeFileSync(process.env.G1_LEGACY_K8S_REPORT_PATH, `${output}\n`)
    process.stdout.write(`${output}\n`)
    if (report.status !== 'passed') process.exitCode = report.status === 'infra required' ? 2 : 1
  }).catch((runError) => {
    process.stderr.write(`G1 legacy K8s mock runner crashed: ${runError.stack || runError}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  BASE,
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
  TOPO_OBJECTS,
  ATTRIBUTES,
  ok,
  error,
  codeOf,
  dataOf,
  isOk,
  responseSummary,
  infoOf,
  enableCount,
  onePageParams,
  listPairParams,
  routePath,
  parseBody,
  expectBody,
  expectListBody,
  expectTopoPathBody,
  makeReport,
  installKubeMocks,
  run
}
