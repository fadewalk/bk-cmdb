// G1-C: Cloud UI mock contract runner.
// Every cloud request is intercepted locally; live cloud credentials are never used.
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { chromium } = require('./browser.cjs')
const { api: request } = require('./support/api.cjs')
const { ok, error } = require('./fixtures/core-domains.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const AUTH_FAILURE_CODE = 9900403
const REPORT_KIND = 'legacy-g1-cloud-mock'

const ACCOUNT = {
  bk_account_id: 7,
  bk_account_name: 'G1 Mock Account',
  bk_cloud_vendor: '2',
  bk_secret_id: 'secret-id-7',
  bk_description: 'mock account',
  bk_creator: 'admin',
  bk_last_editor: 'admin',
  create_time: '2026-09-15T09:00:00Z',
  last_time: '2026-09-15T09:01:00Z',
  bk_can_delete_account: true
}
const REGIONS = [
  { bk_region: 'ap-beijing', bk_region_name: '北京', bk_host_count: 3 },
  { bk_region: 'ap-shanghai', bk_region_name: '上海', bk_host_count: 0 }
]
const AREAS = [
  { bk_cloud_id: 90000001, bk_cloud_name: '未分配', bk_cloud_vendor: '0', bk_region: '', bk_vpc_id: '', bk_vpc_name: '', host_count: 0, sync_task_ids: [] },
  { bk_cloud_id: 12, bk_cloud_name: 'G1 北京区域', bk_cloud_vendor: '2', bk_account_id: 7, bk_region: 'ap-beijing', bk_vpc_id: 'vpc-g1', bk_vpc_name: 'G1 VPC', host_count: 3, sync_task_ids: [] }
]
const TASK = {
  bk_task_id: 42,
  bk_task_name: 'G1 Mock Discovery Task',
  bk_resource_type: 'host',
  bk_account_id: 7,
  bk_cloud_vendor: '2',
  bk_sync_status: 'cloud_sync_success',
  bk_last_sync_time: '2026-09-15T09:02:00Z',
  bk_last_editor: 'admin',
  bk_sync_vpcs: [{ bk_vpc_id: 'vpc-g1', bk_vpc_name: 'G1 VPC', bk_region: 'ap-beijing', bk_host_count: 3, bk_sync_dir: 101, bk_cloud_id: 12, destroyed: false }]
}

function assertCondition(condition, message) { if (!condition) throw new Error(message) }
function codeOf(response) { return response?.data?.bk_error_code ?? response?.data?.code }
function dataOf(response) { return response?.data?.data ?? response?.data }
function isOk(response) { return response?.status >= 200 && response?.status < 300 && (codeOf(response) === 0 || response?.data?.result === true) }
function responseSummary(response) {
  return { status: response?.status, code: codeOf(response), result: response?.data?.result, message: response?.data?.bk_error_msg || response?.data?.message || null }
}
function infoOf(response) {
  const data = dataOf(response)
  if (Array.isArray(data)) return data
  return data?.info || data?.data?.info || []
}
function makeReport(status, stages, requests, errors, pageErrors, layers = {}) {
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
    layers: {
      offline: { status: layers.offline || (status === 'passed' ? 'passed' : 'failed'), scenarios: stages },
      infra: { status: layers.infra || 'required', reason: 'UI_V3_BASE_URL must serve the built UI for Playwright page checks' },
      liveCloud: { status: layers.liveCloud || 'blocked', reason: 'No live cloud API or credential is called by this runner' },
      unsupported: { status: layers.unsupported || 'unsupported', items: ['Alibaba Cloud vendor is not implemented'] }
    },
    layerStatus: { offline: layers.offline || (status === 'passed' ? 'passed' : 'failed'), infra: layers.infra || 'required', 'live-cloud': layers.liveCloud || 'blocked', unsupported: layers.unsupported || 'unsupported' },
    contract: {
      list: ['POST /findmany/cloud/account', 'POST /findmany/cloudarea', 'POST /findmany/cloud/sync/task'],
      single: ['POST /findmany/cloud/account with bk_account_id', 'POST /findmany/cloud/sync/task with bk_task_id'],
      arrays: ['POST /findmany/cloud/account/validity', 'POST /findmany/cloudarea/hostcount', 'POST /findmany/cloud/sync/region', 'POST /createmany/cloudarea'],
      verify: 'POST /cloud/account/verify returns raw outer envelope and inner result',
      errors: { auth: AUTH_FAILURE_CODE, forbidden: 403 },
      region: 'with_host_count',
      vpc: 'POST /findmany/cloud/account/vpc/:accountId',
      history: 'POST /findmany/cloud/sync/history'
    }
  }
}

function parseBody(route) {
  const raw = route.request().postData()
  if (!raw) return undefined
  try { return JSON.parse(raw) } catch { return raw }
}
function respond(route, status, body) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}
function expectBody(body, expected, label) {
  assert.deepStrictEqual(body, expected, `${label} body mismatch: ${JSON.stringify(body)}`)
}

async function installCloudMocks(page, options = {}) {
  const state = { requests: [], failures: [], unhandled: [], pageErrors: [], empty: !!options.empty, credentialFailure: !!options.credentialFailure, authFailure: !!options.authFailure }
  await page.addInitScript(() => localStorage.setItem('selectedBusiness', '2'))
  page.on('pageerror', (e) => state.pageErrors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/403|9900403|permission denied/i.test(m.text())) state.pageErrors.push(`console.error: ${m.text()}`) })

  await page.route('**/*', async (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    await route.continue({ headers })
  })
  await page.route('**/userinfo', (route) => respond(route, 200, { result: true, data: { username: 'mock-user', chname: 'Mock User', current_supplier: '0' } }))
  await page.route('**/api/v3/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace(/^\/api\/v3/, '') || '/'
    const method = req.method()
    const body = parseBody(route)
    state.requests.push({ method, path, body: body === undefined ? null : body })
    try {
      let payload
      let status = 200
      if (path === '/biz/search/0' && method === 'POST') payload = ok({ count: 1, info: [{ bk_biz_id: 2, bk_biz_name: 'G1 Mock Biz' }] })
      else if (path === '/findmany/biz_set' && method === 'POST') payload = ok({ count: 0, info: [] })
      else if (path === '/usercustom/user/search' && method === 'POST') payload = ok({})
      else if (path === '/auth/verify' && method === 'POST') {
        if (state.authFailure) { status = 403; payload = error(AUTH_FAILURE_CODE, 'permission denied') }
        else payload = ok([{ is_pass: true }])
      } else if (path === '/findmany/cloud/account' && method === 'POST') {
        const isSingleAccount = !!body?.condition?.bk_account_id
        assertCondition(isSingleAccount || (body?.page?.start === 0 && [20, 100].includes(body?.page?.limit)), 'cloud account page payload mismatch')
        if (state.empty) payload = ok({ count: 0, info: [] })
        else payload = ok({ count: 1, info: [ACCOUNT] })
      } else if (path === '/findmany/cloud/account/validity' && method === 'POST') {
        assertCondition(Array.isArray(body?.account_ids), 'account validity must use account_ids array')
        payload = ok(state.empty ? [] : [{ bk_account_id: 7, err_msg: '' }])
      } else if (path === '/cloud/account/verify' && method === 'POST') {
        expectBody(body, { bk_cloud_vendor: '2', bk_secret_id: 'secret-id-7', bk_secret_key: 'secret-key-7' }, 'account verify')
        if (state.credentialFailure) { status = 403; payload = error(AUTH_FAILURE_CODE, 'cloud credential rejected') }
        else payload = ok({ result: true, bk_error_msg: '' })
      } else if (path === '/create/cloud/account' && method === 'POST') {
        assertCondition(body?.bk_account_type === 'api_secret_key', 'create account bk_account_type mismatch')
        payload = ok({ id: 8 })
      } else if (/^\/update\/cloud\/account\/\d+$/.test(path) && method === 'PUT') {
        expectBody(body, { bk_account_name: 'G1 Updated Account', bk_description: 'updated' }, 'update account')
        payload = ok({})
      } else if (/^\/delete\/cloud\/account\/\d+$/.test(path) && method === 'DELETE') payload = ok({})
      else if (path === '/findmany/cloudarea' && method === 'POST') {
        assertCondition(body?.page?.start === 0 && [20, 500].includes(body?.page?.limit), 'cloud area page payload mismatch')
        assertCondition(body?.host_count === true || body?.page?.limit === 500, 'cloud area host_count contract missing')
        assertCondition(body?.condition && (body?.sync_task_ids === undefined || body?.sync_task_ids === true), 'cloud area condition contract mismatch')
        if (state.empty) payload = ok({ count: 0, info: [] })
        else payload = ok({ count: AREAS.length, info: AREAS.map((x) => ({ ...x })) })
      } else if (path === '/findmany/cloudarea/hostcount' && method === 'POST') {
        assert.deepStrictEqual(body, { bk_cloud_ids: [90000001, 12] }, 'area host count body mismatch')
        payload = ok([{ bk_cloud_id: 90000001, host_count: 0 }, { bk_cloud_id: 12, host_count: 3 }])
      } else if (path === '/findmany/cloud/sync/region' && method === 'POST') {
        assertCondition(body?.bk_account_id === 7 && typeof body.with_host_count === 'boolean', 'region payload must include account and with_host_count')
        payload = ok(body.with_host_count ? REGIONS : REGIONS.map(({ bk_region, bk_region_name }) => ({ bk_region, bk_region_name })))
      } else if (path === '/findmany/cloud/sync/task' && method === 'POST') {
        if (body?.condition?.bk_account_id || body?.condition?.bk_task_id) payload = ok(state.empty ? { count: 0, info: [] } : { count: 1, info: [TASK] })
        else if (body?.page?.limit === 100) payload = ok(state.empty ? { count: 0, info: [] } : { count: 1, info: [TASK] })
        else { expectBody(body, { page: { start: 0, limit: 20, sort: 'bk_task_id' }, condition: {} }, 'task list'); payload = ok(state.empty ? { count: 0, info: [] } : { count: 1, info: [TASK] }) }
      } else if (path === '/findmany/cloud/sync/history' && method === 'POST') {
        expectBody(body, { bk_task_id: 42, page: { start: 0, limit: 20 } }, 'task history')
        payload = ok({ count: 1, info: [{ bk_summary: { new_add: 1, update: 0 }, bk_sync_status: 'cloud_sync_success', create_time: '2026-09-15T09:02:00Z', bk_detail: { new_add: { count: 1, ips: ['192.0.2.7'] }, update: { count: 0, ips: [] } } }] })
      } else if (path === '/findmany/resource/directory' && method === 'POST') {
        expectBody(body, {}, 'directory list'); payload = ok({ count: 1, info: [{ bk_module_id: 101, bk_module_name: '资源池' }] })
      } else if (/^\/findmany\/cloud\/account\/vpc\/\d+$/.test(path) && method === 'POST') {
        expectBody(body, { bk_account_id: 7, bk_region: 'ap-beijing' }, 'VPC list')
        payload = ok({ count: 1, info: [{ bk_vpc_id: 'vpc-g1', bk_vpc_name: 'G1 VPC', bk_region: 'ap-beijing', bk_host_count: 3 }] })
      } else if (path === '/createmany/cloudarea' && method === 'POST') {
        assertCondition(Array.isArray(body?.data) && body.data.length === 1, 'batch cloud area must use data array')
        payload = ok([{ bk_cloud_id: 13 }])
      } else if (/^\/update\/cloudarea\/\d+$/.test(path) && method === 'PUT') { expectBody(body, { bk_cloud_name: 'G1 Renamed Area' }, 'update area'); payload = ok({})
      } else if (/^\/delete\/cloudarea\/\d+$/.test(path) && method === 'DELETE') payload = ok({})
      else if (path === '/create/cloud/sync/task' && method === 'POST') { assertCondition(body?.bk_sync_vpcs?.length === 1, 'create task VPC list missing'); payload = ok({ bk_task_id: 43 })
      } else if (/^\/update\/cloud\/sync\/task\/\d+$/.test(path) && method === 'PUT') { assertCondition(body?.bk_task_id === 42 && Array.isArray(body?.bk_sync_vpcs), 'update task payload mismatch'); payload = ok({})
      } else if (/^\/delete\/cloud\/sync\/task\/\d+$/.test(path) && method === 'DELETE') payload = ok({})
      else if (path === '/find/classificationobject' && method === 'POST') payload = ok([])
      else if (path === '/find/objectattr/web' && method === 'POST') payload = ok([])
      else { state.unhandled.push({ method, path, body }); throw new Error(`unsupported/unmocked API ${method} ${path}`) }
      await respond(route, status, payload)
    } catch (e) {
      state.failures.push(`${method} ${path}: ${e.message}`)
      await route.abort()
    }
  })
  return state
}

async function newPage(browser, options) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const state = await installCloudMocks(page, options)
  return { context, page, state }
}
async function settle(page, ms = 650) { await page.waitForTimeout(ms) }
async function navigate(page, path) { await page.goto(`${BASE}/#${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 }); await settle(page) }
async function call(page, method, path, body) { return request(page, method, path, body) }
function requireNoRouteFailures(state) {
  assertCondition(state.failures.length === 0, `mock route failures: ${state.failures.join(' | ')}`)
  assertCondition(state.unhandled.length === 0, `unmocked API calls: ${JSON.stringify(state.unhandled)}`)
  assertCondition(state.pageErrors.length === 0, `page errors: ${state.pageErrors.join(' | ')}`)
}

async function runAccount(browser) {
  const { context, page, state } = await newPage(browser)
  try {
    await navigate(page, '/resource/cloud-account')
    assertCondition((await page.locator('.el-table__body-wrapper').textContent()).includes('G1 Mock Account'), 'account list row missing')
    await page.getByText('G1 Mock Account', { exact: true }).click()
    await settle(page, 350)
    assertCondition((await page.locator('body').textContent()).includes('G1 Mock Discovery Task'), 'account task detail row missing')
    await call(page, 'POST', '/findmany/cloud/account', { condition: { bk_account_id: { $eq: 7 } } })
    await call(page, 'POST', '/create/cloud/account', { bk_account_name: 'G1 New Account', bk_cloud_vendor: '2', bk_secret_id: 'id', bk_secret_key: 'key', bk_description: '', bk_account_type: 'api_secret_key' })
    await call(page, 'PUT', '/update/cloud/account/7', { bk_account_name: 'G1 Updated Account', bk_description: 'updated' })
    await call(page, 'DELETE', '/delete/cloud/account/7')
    const verify = await call(page, 'POST', '/cloud/account/verify', { bk_cloud_vendor: '2', bk_secret_id: 'secret-id-7', bk_secret_key: 'secret-key-7' })
    assertCondition(verify.status === 200 && verify.data.result === true && verify.data.data.result === true, 'verify raw envelope mismatch')
    requireNoRouteFailures(state)
    return { status: 'passed', requests: state.requests }
  } finally { await context.close() }
}

async function runArea(browser) {
  const { context, page, state } = await newPage(browser)
  try {
    await navigate(page, '/resource/cloud-area')
    const text = await page.locator('.el-table__body-wrapper').textContent()
    assertCondition(text.indexOf('未分配') < text.indexOf('G1 北京区域'), 'unassigned cloud area was not pinned first')
    const region = await call(page, 'POST', '/findmany/cloud/sync/region', { bk_account_id: 7, with_host_count: true })
    assertCondition(Array.isArray(region.data.data) && region.data.data[0].bk_host_count === 3, 'region with_host_count response mismatch')
    await call(page, 'PUT', '/update/cloudarea/12', { bk_cloud_name: 'G1 Renamed Area' })
    await call(page, 'DELETE', '/delete/cloudarea/12')
    requireNoRouteFailures(state)
    return { status: 'passed', requests: state.requests }
  } finally { await context.close() }
}

async function runDiscover(browser) {
  const { context, page, state } = await newPage(browser)
  try {
    await navigate(page, '/resource/cloud-discover')
    assertCondition((await page.locator('.el-table__body-wrapper').textContent()).includes('G1 Mock Discovery Task'), 'cloud task row missing')
    await page.getByText('G1 Mock Discovery Task', { exact: true }).click()
    await settle(page, 250)
    assertCondition((await page.locator('body').textContent()).includes('VPC 同步列表'), 'task detail VPC section missing')
    const vpc = await call(page, 'POST', '/findmany/cloud/account/vpc/7', { bk_account_id: 7, bk_region: 'ap-beijing' })
    assertCondition(vpc.data.data.info[0].bk_vpc_id === 'vpc-g1', 'VPC response mismatch')
    await call(page, 'POST', '/findmany/cloud/sync/history', { bk_task_id: 42, page: { start: 0, limit: 20 } })
    await call(page, 'POST', '/createmany/cloudarea', { data: [{ bk_cloud_name: 'new-area', bk_vpc_id: 'vpc-g1', bk_vpc_name: 'G1 VPC', bk_region: 'ap-beijing', bk_cloud_vendor: '2', bk_account_id: 7 }] })
    await call(page, 'POST', '/create/cloud/sync/task', { bk_task_name: 'G1 Created Task', bk_account_id: 7, bk_resource_type: 'host', bk_sync_vpcs: [{ bk_vpc_id: 'vpc-g1' }] })
    await call(page, 'PUT', '/update/cloud/sync/task/42', { bk_task_id: 42, bk_task_name: 'G1 Updated Task', bk_sync_vpcs: TASK.bk_sync_vpcs })
    await call(page, 'DELETE', '/delete/cloud/sync/task/42')
    requireNoRouteFailures(state)
    return { status: 'passed', requests: state.requests }
  } finally { await context.close() }
}

async function runEmpty(browser) {
  const { context, page, state } = await newPage(browser, { empty: true })
  try {
    await navigate(page, '/resource/cloud-account')
    assertCondition((await page.locator('body').textContent()).includes('暂无数据'), 'account empty state missing')
    requireNoRouteFailures(state)
    return { status: 'passed', requests: state.requests }
  } finally { await context.close() }
}

async function runFailureMatrix(browser) {
  const credential = await newPage(browser, { credentialFailure: true })
  try {
    await navigate(credential.page, '/resource/cloud-account')
    await credential.page.getByRole('button', { name: '新建' }).click()
    const items = credential.page.locator('.account-form .el-form-item')
    await items.nth(0).locator('input').fill('G1 Failure Account')
    await items.nth(2).locator('input').fill('secret-id-7')
    await items.nth(3).locator('input').fill('secret-key-7')
    await credential.page.getByRole('button', { name: '连通测试' }).click()
    await settle(credential.page, 300)
    assertCondition((await credential.page.locator('.verify-result').textContent()).includes('连通失败'), 'credential failure was not rendered')
    requireNoRouteFailures(credential.state)
  } finally { await credential.context.close() }

  const auth = await newPage(browser, { authFailure: true })
  try {
    await navigate(auth.page, '/index')
    const response = await call(auth.page, 'POST', '/auth/verify', { resource_type: 'cloud_area', action: 'find' })
    assertCondition(response.status === 403 && codeOf(response) === AUTH_FAILURE_CODE, 'auth 403/9900403 contract mismatch')
    requireNoRouteFailures(auth.state)
  } finally { await auth.context.close() }
  return { status: 'passed' }
}

async function run() {
  const stages = { account: 'pending', area: 'pending', discover: 'pending', empty: 'pending', failures: 'pending' }
  const requests = []
  const errors = []
  const pageErrors = []
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    for (const [name, fn] of Object.entries({ account: runAccount, area: runArea, discover: runDiscover, empty: runEmpty, failures: runFailureMatrix })) {
      try {
        const result = await fn(browser)
        stages[name] = result.status
        if (result.requests) requests.push(...result.requests)
      } catch (e) {
        stages[name] = 'failed'
        errors.push(`${name}: ${e.message}`)
        if (e.message.includes('net::') || e.message.includes('ERR_CONNECTION')) errors.push(`${name}: infra required; UI server unavailable`)
        break
      }
    }
  } catch (e) {
    errors.push(`runner: ${e.message}`)
  } finally { if (browser) await browser.close() }
  const passed = Object.values(stages).every((stage) => stage === 'passed')
  const infra = errors.some((e) => /infra required|无法加载 Playwright|ERR_CONNECTION|net::/.test(e))
  return makeReport(passed ? 'passed' : (infra ? 'infra required' : 'failed'), stages, requests, errors, pageErrors, { offline: passed ? 'passed' : 'failed', infra: infra ? 'required' : 'not required' })
}

if (require.main === module) {
  run().then((report) => {
    const output = JSON.stringify(report, null, 2)
    if (process.env.G1_CLOUD_REPORT_PATH) fs.writeFileSync(process.env.G1_CLOUD_REPORT_PATH, `${output}\n`)
    process.stdout.write(`${output}\n`)
    if (report.status !== 'passed' || report.errors.length || report.pageErrors.length) process.exitCode = report.status === 'infra required' ? 2 : 1
  }).catch((e) => { process.stderr.write(`G1 Cloud mock runner crashed: ${e.stack || e}\n`); process.exitCode = 1 })
}

module.exports = {
  BASE,
  AUTH_FAILURE_CODE,
  REPORT_KIND,
  ACCOUNT,
  REGIONS,
  AREAS,
  TASK,
  codeOf,
  dataOf,
  isOk,
  responseSummary,
  infoOf,
  expectBody,
  makeReport,
  installCloudMocks,
  run
}
