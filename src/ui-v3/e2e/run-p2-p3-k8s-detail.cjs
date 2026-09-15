#!/usr/bin/env node

// P2/P3 K8s Pod/Container detail parity.
// All responses are local page.route mocks; this proves UI/API contract only and
// deliberately reports real K8s as blocked rather than treating mock data as live.
const assert = require('node:assert/strict')
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const BIZ_ID = 2
const POD_ID = 101
const CONTAINER_ID = 201
const REPORT_KIND = 'p2-p3-k8s-detail-parity'

const POD = {
  id: POD_ID,
  name: 'pod-detail-mock',
  bk_biz_id: BIZ_ID,
  bk_cluster_id: 11,
  bk_namespace_id: 12,
  bk_node_id: 14,
  bk_host_id: 501,
  namespace: 'default',
  labels: { app: 'cmdb' },
  ip: '10.0.0.10',
  ips: [],
  status: 'Running',
  priority: 0,
  qos_class: 'Burstable',
  operator: ['ops'],
  ref: { kind: 'deployment', id: 13, name: 'cmdb' }
}
const CONTAINER = {
  id: CONTAINER_ID,
  name: 'cmdb',
  bk_pod_id: POD_ID,
  bk_biz_id: BIZ_ID,
  container_uid: 'container-detail-mock',
  image: 'cmdb:test',
  started: true,
  ports: [],
  host_ports: [],
  args: [],
  limits: { cpu: '1' },
  requests: { cpu: '100m' },
  liveness: {},
  environment: {},
  mounts: []
}
const POD_PATH = {
  bk_biz_id: BIZ_ID,
  biz_name: 'Mock Biz',
  bk_cluster_id: 11,
  cluster_name: 'cluster-detail-mock',
  bk_namespace_id: 12,
  namespace: 'default',
  kind: 'deployment',
  bk_workload_id: 13,
  workload_name: 'cmdb',
  bk_pod_id: POD_ID
}
const POD_FIELDS = ['id', 'name', 'bk_biz_id', 'bk_cluster_id', 'bk_namespace_id', 'bk_node_id', 'bk_host_id', 'namespace', 'labels', 'ip', 'ips', 'status', 'priority', 'controlled_by', 'container_uid', 'qos_class', 'volumes', 'node_selectors', 'tolerations', 'operator', 'ref']
const CONTAINER_FIELDS = ['id', 'name', 'bk_pod_id', 'bk_biz_id', 'bk_cluster_id', 'bk_namespace_id', 'ref', 'container_uid', 'image', 'ports', 'host_ports', 'args', 'started', 'limits', 'requests', 'liveness', 'environment', 'mounts']

function ok(data) { return { result: true, code: 0, message: 'success', data } }
function error(code, message) { return { result: false, bk_error_code: code, bk_error_msg: message, data: null } }
function routePath(url) { return new URL(url).pathname.replace(/^\/api\/v3/, '') || '/' }
function bodyOf(route) { return route.request().postDataJSON() }
function assertNoPageErrors(state) { assert.deepEqual(state.pageErrors, [], `page errors: ${state.pageErrors.join(' | ')}`) }

async function installMocks(page, options = {}) {
  const state = { requests: [], pageErrors: [], failures: [], blocked: [] }
  await page.addInitScript(() => localStorage.setItem('selectedBusiness', '2'))
  await page.route('**/*', async (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    await route.continue({ headers })
  })
  await page.route('**/userinfo', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ username: 'p2-p3', chname: 'P2/P3', current_supplier: '0' })) }))
  await page.route('**/api/v3/biz/search/0', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: 1, info: [{ bk_biz_id: BIZ_ID, bk_biz_name: 'Mock Biz' }] })) }))
  await page.route('**/api/v3/findmany/biz_set', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: 0, info: [] })) }))
  await page.route('**/api/v3/usercustom/user/search', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({})) }))
  await page.route('**/api/v3/find/full_text', (route) => route.fulfill({ status: options.failure ? 500 : 200, contentType: 'application/json', body: JSON.stringify(options.failure ? error(500, 'ES unavailable') : ok({ total: 0, aggregations: [], hits: [], attrs: { attributes: {}, groups: {} } })) }))
  await page.route('**/api/v3/**', async (route) => {
    const request = route.request()
    const path = routePath(request.url())
    const body = request.method() === 'POST' ? bodyOf(route) : null
    state.requests.push({ method: request.method(), path, query: new URL(request.url()).search, body })
    try {
      if (path === '/find/classificationobject') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok([{ bk_objects: [{ bk_obj_id: 'biz' }, { bk_obj_id: 'host' }] }])) })
        return
      }
      if (path === '/userinfo') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ username: 'p2-p3', chname: 'P2/P3', current_supplier: '0' })) })
        return
      }
      if (path === '/biz/search/0') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: 1, info: [{ bk_biz_id: BIZ_ID, bk_biz_name: 'Mock Biz' }] })) })
        return
      }
      if (path === '/findmany/biz_set' || path === '/usercustom/user/search') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(path === '/usercustom/user/search' ? {} : { count: 0, info: [] })) })
        return
      }
      if (path === '/find/full_text') {
        await route.fulfill({ status: options.failure ? 500 : 200, contentType: 'application/json', body: JSON.stringify(options.failure ? error(500, 'ES unavailable') : ok({ total: 0, aggregations: [], hits: [], attrs: { attributes: {}, groups: {} } })) })
        return
      }
      if (options.failure && path === '/findmany/kube/pod') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify(error(500, 'K8s unavailable')) })
        return
      }
      if (request.method() === 'GET' && /^\/find\/kube\/(pod|container)\/attributes$/.test(path)) {
        assert.equal(new URL(request.url()).searchParams.get('bk_biz_id'), String(BIZ_ID), 'attribute query must preserve bk_biz_id')
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(path.endsWith('/container/attributes')
          ? [{ field: 'name', type: 'string', required: true }, { field: 'image', type: 'string', required: true }]
          : [{ field: 'name', type: 'string', required: true }, { field: 'labels', type: 'mapString' }, { field: 'status', type: 'string' }])) })
        return
      }
      if (request.method() === 'POST' && path === '/find/kube/pod_path') {
        assert.equal(body.bk_biz_id, BIZ_ID)
        assert.deepEqual(body.ids, [POD_ID])
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ info: [POD_PATH] })) })
        return
      }
      if (request.method() === 'POST' && path === '/findmany/kube/pod') {
        assert.equal(body.bk_biz_id, BIZ_ID)
        const isCapabilityProbe = body.page?.enable_count === true && JSON.stringify(body.fields) === JSON.stringify(['id'])
        const isDetail = body.page?.limit === 1
        if (!isCapabilityProbe) {
          assert.deepEqual(body.fields, isDetail ? POD_FIELDS : ['id', 'name', 'namespace', 'labels', 'ip', 'ips', 'status'])
        }
        if (isDetail) assert.deepEqual(body.filter, { condition: 'AND', rules: [{ field: 'id', operator: 'equal', value: POD_ID }] })
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: 1, info: isCapabilityProbe ? [] : [POD] })) })
        return
      }
      if (request.method() === 'POST' && path === '/findmany/kube/container') {
        assert.equal(body.bk_biz_id, BIZ_ID)
        assert.equal(body.bk_pod_id, POD_ID)
        assert.deepEqual(body.fields, CONTAINER_FIELDS)
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: 1, info: [CONTAINER] })) })
        return
      }
      if (path === '/findmany/biz_set' || path === '/usercustom/user/search' || path === '/find/full_text') {
        await route.continue()
        return
      }
      state.blocked.push({ method: request.method(), path, body })
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify(error(404, `unmocked ${path}`)) })
    } catch (requestError) {
      state.failures.push(`${request.method()} ${path}: ${requestError.message}`)
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify(error(500, requestError.message)) })
    }
  })
  page.on('pageerror', (errorObject) => state.pageErrors.push(errorObject.message))
  return state
}

async function open(page, path) {
  await page.goto(`${BASE}/#${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(800)
}

async function runHappy(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const state = await installMocks(page)
  try {
    await open(page, '/business/2/pod')
    assert((await page.locator('body').textContent()).includes('pod-detail-mock'), 'Pod list did not render')
    await page.getByRole('button', { name: '详情' }).first().click()
    await page.waitForTimeout(800)
    assert((await page.locator('body').textContent()).includes('Pod属性'), 'Pod attribute tab missing')
    assert((await page.locator('body').textContent()).includes('cluster-detail-mock'), 'Pod topology path missing')
    assert((await page.locator('body').textContent()).includes('Pod 标签'), 'Pod attribute metadata missing')
    await page.getByRole('tab', { name: 'Container(s)' }).click()
    assert((await page.locator('body').textContent()).includes('container-detail-mock'), 'Container list missing')
    await page.getByRole('button', { name: '详情' }).last().click()
    await page.waitForTimeout(700)
    assert(new URL(page.url()).hash.includes('containerId=201'), 'Container query deep link missing')
    assert((await page.locator('body').textContent()).includes('镜像信息'), 'Container attributes missing')

    await open(page, '/business/2/index/pod/101/container/201')
    assert(new URL(page.url()).hash.includes('containerId=201'), 'Legacy container route did not preserve containerId')
    assert((await page.locator('body').textContent()).includes('Container详情') || (await page.locator('body').textContent()).includes('Pod详情'), 'Legacy container detail did not render')
    assert(state.failures.length === 0, state.failures.join(' | '))
    assert(state.blocked.length === 0, `unmocked requests: ${JSON.stringify(state.blocked)}`)
    assertNoPageErrors(state)
    return { status: 'passed', requests: state.requests }
  } finally { await context.close() }
}

async function runBlocked(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const state = await installMocks(page, { failure: true })
  try {
    await open(page, '/business/2/index/pod/101/container/201')
    const text = await page.locator('body').textContent()
    assert(text.includes('数据链路'), 'Blocked dependency copy missing')
    assert(state.requests.filter((request) => request.path === '/findmany/kube/container').length === 0, 'blocked capability must not query containers')
    assertNoPageErrors(state)
    return { status: 'passed', requests: state.requests }
  } finally { await context.close() }
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  try {
    const happy = await runHappy(browser)
    const blocked = await runBlocked(browser)
    const report = {
      schemaVersion: 1,
      reportKind: REPORT_KIND,
      generatedAt: new Date().toISOString(),
      status: 'passed',
      stages: { podDetail: happy.status, containerDetail: happy.status, legacyDeepLink: happy.status, dependencyBlocked: blocked.status },
      contract: {
        wrappers: ['POST /findmany/kube/pod', 'POST /findmany/kube/container', 'POST /find/kube/pod_path', 'GET /find/kube/{object}/attributes'],
        realK8s: 'blocked: all browser responses in this runner are local mocks; no live K8s claim'
      },
      requests: [...happy.requests, ...blocked.requests]
    }
    console.log(JSON.stringify(report, null, 2))
  } finally { await browser.close() }
}

if (require.main === module) run().catch((error) => { console.error(`P2/P3 K8s detail parity failed: ${error.stack || error}`); process.exitCode = 1 })
