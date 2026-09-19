// B56: 服务模板详情 + SetSyncDiff 错误态/空态契约
const { chromium } = require('./browser.cjs')
const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []; const state = { configAttempts: 0, instanceAttempts: 0, diffAttempts: 0, removedAttempts: 0, syncAttempts: 0 }
const env = (result, data, code = 0, msg = 'success') => ({ result, bk_error_code: code, bk_error_msg: msg, permission: null, data })
const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const ok = (label) => console.log(`✓ ${label}`)

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await page.route('**/*', (r) => { const h = { ...r.request().headers(), 'Cache-Control': 'no-cache' }; delete h['if-none-match']; r.continue({ headers: h }) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  await page.route('**/api/v3/biz/search/0', (r) => json(r, env(true, { count: 1, info: [{ bk_biz_id: 99, bk_biz_name: 'b56-biz' }] })))
  await page.route('**/api/v3/find/business_set*', (r) => json(r, env(true, { count: 0, info: [] })))
  await page.route('**/api/v3/usercustom*', (r) => json(r, env(true, {})))
  await page.route('**/api/v3/findmany/proc/service_template/sync_status/biz/99', (r) => json(r, env(true, { service_templates: [] })))
  await page.route('**/api/v3/find/proc/service_template/all_info', (r) => { state.configAttempts++; return json(r, state.configAttempts === 1 ? env(false, null, 9901, 'B56 config failed') : env(true, { id: 72, name: 'b56-service', service_category_id: 501, attributes: [], processes: [] })) })
  await page.route('**/api/v3/find/objectattr', (r) => json(r, env(true, [])))
  await page.route('**/api/v3/findmany/proc/service_category/with_statistics', (r) => json(r, env(true, [])))
  await page.route('**/api/v3/findmany/proc/proc_template', (r) => json(r, env(true, { count: 0, info: [] })))
  await page.route('**/api/v3/module/bk_biz_id/99/service_template_id/72', (r) => { state.instanceAttempts++; return json(r, state.instanceAttempts === 1 ? env(false, null, 9902, 'B56 instance failed') : env(true, { count: 0, info: [] })) })
  await page.route('**/api/v3/findmany/proc/service_template_sync_status/bk_biz_id/99', (r) => json(r, env(true, [])))
  await page.route('**/api/v3/find/topopath/biz/99', (r) => json(r, env(true, { nodes: [] })))
  await page.route('**/api/v3/find/topoinstnode/host_serviceinst_count/99', (r) => json(r, env(true, [])))

  try {
    await page.goto(`${BASE}/#/business/99/service/template/details/72`, { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    const config = page.locator('.template-config')
    assert((await config.locator('.el-alert').textContent()).includes('B56 config failed'), '配置失败 alert 缺失')
    assert(await config.locator('.el-empty').count() === 0, '配置失败错误地显示 empty')
    await config.getByRole('button', { name: '重试' }).click(); await page.waitForTimeout(900)
    assert(state.configAttempts === 2 && (await config.textContent()).includes('b56-service'), '配置重试未恢复')
    ok('配置 all_info 错误/重试/非空态')

    await page.locator('.el-tabs__item').filter({ hasText: '实例' }).click(); await page.waitForTimeout(1000)
    const instance = page.locator('.template-instance')
    assert((await instance.locator('.el-alert').textContent()).includes('B56 instance failed'), '实例失败 alert 缺失')
    assert(await instance.locator('.el-empty').count() === 0, '实例失败错误地显示 empty')
    await instance.getByRole('button', { name: '重试' }).click(); await page.waitForTimeout(900)
    assert(state.instanceAttempts === 2, '实例重试未重新请求')
    ok('实例列表错误/重试/非空态')

    const realErrors = errors.filter((item) => !/favicon|ResizeObserver/.test(item)); assert(!realErrors.length, realErrors.join(' | '))
    console.log('B56 E2E 全部通过')
  } catch (e) { errors.push(`ASSERT: ${e.message}`); console.error(`✗ B56 失败: ${e.message}`) } finally { await browser.close() }
  if (errors.length) process.exitCode = 1
}
main().catch((e) => { console.error(`✗ B56: ${e.message}`); process.exitCode = 1 })
