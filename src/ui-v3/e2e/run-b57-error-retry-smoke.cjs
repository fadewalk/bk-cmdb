// B57: common error/retry smoke for FullText, K8s Pod list, CloudDiscover
const { chromium } = require('./browser.cjs')
const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []
const env = (result, data, code = 0, msg = 'success') => ({ result, bk_error_code: code, bk_error_msg: msg, permission: null, data })
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const ok = (label) => console.log(`✓ ${label}`)

async function pageWithCommonMocks(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await page.route('**/*', (r) => { const h = { ...r.request().headers(), 'Cache-Control': 'no-cache' }; delete h['if-none-match']; r.continue({ headers: h }) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  await page.route('**/api/v3/userinfo', (r) => json(r, env(true, { username: 'admin' })))
  await page.route('**/api/v3/biz/search/0', (r) => json(r, env(true, { count: 1, info: [{ bk_biz_id: 2, bk_biz_name: 'b57-biz' }] })))
  await page.route('**/api/v3/findmany/biz_set', (r) => json(r, env(true, { count: 0, info: [] })))
  await page.route('**/api/v3/usercustom/user/search', (r) => json(r, env(true, {})))
  return page
}

async function runFullText(browser) {
  const page = await pageWithCommonMocks(browser); let searchCount = 0
  await page.route('**/api/v3/findmany/kube/pod', (r) => json(r, env(true, { count: 0, info: [] })))
  await page.route('**/api/v3/find/classificationobject', (r) => json(r, env(true, [{ bk_objects: [{ bk_obj_id: 'host' }] }])))
  await page.route('**/api/v3/find/full_text', (r, req) => {
    const body = req.postDataJSON()
    if (body?.query_string === '__cmdb_capability_probe__') return json(r, env(true, { total: 0, hits: [] }))
    searchCount += 1
    if (searchCount === 1) return json(r, env(false, null, 1199006, 'B57 fulltext failed'), 500)
    return json(r, env(true, { total: 1, hits: [{ kind: 'instance', key: 'b57-host', source: { bk_host_name: 'b57-host' } }] }))
  })
  try {
    await page.goto(`${BASE}/#/full-text-search`, { waitUntil: 'load' })
    await page.locator('.search-row input').waitFor({ state: 'visible', timeout: 10000 })
    await page.locator('.search-row input').fill('b57-host'); await page.locator('.search-row button').click()
    await page.locator('.fulltext-page .el-alert').waitFor({ state: 'visible', timeout: 10000 })
    assert((await page.locator('.fulltext-page .el-alert').textContent()).match(/500|Request failed/), '全文错误 alert 缺失')
    await page.locator('.fulltext-page .el-alert').getByRole('button', { name: '重试' }).click()
    await page.locator('.result-item').waitFor({ state: 'visible', timeout: 10000 })
    assert(searchCount === 2 && (await page.locator('.result-item').textContent()).includes('b57-host'), '全文重试未恢复结果')
    ok('FullText 首失败→重试→结果恢复')
  } finally { await page.context().close() }
}

async function runKube(browser) {
  const page = await pageWithCommonMocks(browser); let listCount = 0
  await page.route('**/api/v3/find/full_text', (r) => json(r, env(true, { total: 0, hits: [] })))
  await page.route('**/api/v3/findmany/kube/pod', (r, req) => {
    const body = req.postDataJSON()
    if (body?.page?.enable_count === true) return json(r, env(true, { count: 1, info: [] }))
    listCount += 1
    if (listCount === 1) return json(r, env(false, null, 1199007, 'B57 K8s list failed'), 500)
    return json(r, env(true, { count: 1, info: [{ id: 101, name: 'b57-pod', namespace: 'default', ip: '10.0.0.57', status: 'Running' }] }))
  })
  try {
    await page.goto(`${BASE}/#/business/2/pod`, { waitUntil: 'load' }); await page.waitForTimeout(1500)
    await page.locator('.kube-page .el-alert').waitFor({ state: 'visible', timeout: 10000 })
    assert((await page.locator('.kube-page .el-alert').textContent()).match(/500|Request failed/), 'K8s 列表错误 alert 缺失')
    await page.locator('.kube-page .el-alert').getByRole('button', { name: '重试' }).click()
    await page.locator('.el-table__body tr').filter({ hasText: 'b57-pod' }).waitFor({ state: 'visible', timeout: 10000 })
    assert(listCount === 2, `K8s 列表重试次数不符: ${listCount}`)
    ok('K8s Pod 列表首失败→重试→恢复')
  } finally { await page.context().close() }
}

async function runCloud(browser) {
  const page = await pageWithCommonMocks(browser); let taskCount = 0
  await page.route('**/api/v3/findmany/cloud/account', (r) => json(r, env(true, { count: 0, info: [] })))
  await page.route('**/api/v3/findmany/cloudarea', (r) => json(r, env(true, { count: 0, info: [] })))
  await page.route('**/api/v3/findmany/resource/directory', (r) => json(r, env(true, { count: 0, info: [] })))
  await page.route('**/api/v3/findmany/cloud/sync/region', (r) => json(r, env(true, { count: 0, info: [] })))
  await page.route('**/api/v3/findmany/cloud/sync/task', (r) => { taskCount += 1; return taskCount === 1 ? json(r, env(false, null, 1199008, 'B57 cloud task failed'), 500) : json(r, env(true, { count: 1, info: [{ id: 57, bk_task_name: 'b57-task', status: 'success', bk_account_id: 1 }] })) })
  try {
    await page.goto(`${BASE}/#/resource/cloud-discover`, { waitUntil: 'load' }); await page.waitForTimeout(1500)
    await page.locator('.res-page .el-alert').waitFor({ state: 'visible', timeout: 10000 })
    assert((await page.locator('.res-page .el-alert').textContent()).match(/500|Request failed/), 'CloudDiscover 错误 alert 缺失')
    await page.locator('.res-page .el-alert').getByRole('button', { name: '重试' }).click()
    await page.getByText('b57-task').waitFor({ state: 'visible', timeout: 10000 })
    assert(taskCount === 2, `CloudDiscover 重试次数不符: ${taskCount}`)
    ok('CloudDiscover 任务列表首失败→重试→恢复')
  } finally { await page.context().close() }
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  try { await runFullText(browser); await runKube(browser); await runCloud(browser); const real = errors.filter((e) => !/favicon|ResizeObserver|Failed to load resource: the server responded with a status of 500/.test(e)); assert(!real.length, real.join(' | ')); console.log('B57 E2E 全部通过') } catch (e) { console.error(`✗ B57 失败: ${e.message}`); process.exitCode = 1 } finally { await browser.close() }
})()
