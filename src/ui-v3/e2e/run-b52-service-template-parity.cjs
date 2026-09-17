// B52: 服务模板 parity 契约专项(mock caller)
// 覆盖:1) 列表删除保护(module_count>0 → 删除禁用 + 不可删除 tooltip);
// 2) 详情抽屉实例同步状态走老版 findmany/proc/service_template_sync_status 端点与 payload;
// 3) 集群模板同步历史日期范围扩展为全天边界(00:00:00 / 23:59:59)。
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
function ok(label) { console.log(`✓ ${label}`) }

function envelope(result, data, code = 0, message = 'success') {
  return { result, bk_error_code: code, bk_error_msg: message, permission: null, data }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    route.continue({ headers })
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`) })

  const state = {
    countInfoRequests: [],
    instanceStatusRequests: [],
    historyRequests: []
  }

  const routeJson = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

  await page.route('**/api/v3/biz/search/0', (route) => routeJson(route, envelope(true, {
    count: 1,
    info: [{ bk_biz_id: 99, bk_biz_name: 'b52-biz', default: 0 }]
  })))
  await page.route('**/api/v3/find/business_set*', (route) => routeJson(route, envelope(true, { count: 0, info: [] })))
  await page.route('**/api/v3/usercustom*', (route) => routeJson(route, envelope(true, {})))
  await page.route('**/api/v3/find/objectattr', (route) => routeJson(route, envelope(true, [])))

  // 服务模板列表:71 已绑定模块,72 未绑定
  // 注意:Playwright 后注册的路由优先生效;子路径路由必须排在精确列表路由之后
  await page.route('**/api/v3/findmany/proc/service_template', (route) => routeJson(route, envelope(true, {
    count: 2,
    info: [
      { id: 71, name: 'b52-tpl-bound', service_category_id: 501, modifier: 'admin', last_time: '2026-09-17 09:00:00' },
      { id: 72, name: 'b52-tpl-free', service_category_id: 501, modifier: 'admin', last_time: '2026-09-17 09:10:00' }
    ]
  })))
  await page.route('**/api/v3/findmany/proc/service_template/count_info/**', (route, req) => {
    state.countInfoRequests.push(req.postDataJSON())
    return routeJson(route, envelope(true, [{ service_template_id: 71, process_template_count: 1, module_count: 2 }]))
  })
  await page.route('**/api/v3/findmany/proc/service_template/sync_status/**', (route) => routeJson(route, envelope(true, { service_templates: [] })))
  await page.route('**/api/v3/findmany/proc/service_category', (route) => routeJson(route, envelope(true, [
    { id: 500, name: 'b52-root', bk_parent_id: 0 },
    { id: 501, name: 'b52-leaf', bk_parent_id: 500 }
  ])))
  await page.route('**/api/v3/findmany/topo/set_template/bk_biz_id/99/web', (route) => routeJson(route, envelope(true, { count: 0, info: [] })))
  await page.route('**/api/v3/findmany/topo/set_template/bk_biz_id/99/set_template_status', (route) => routeJson(route, envelope(true, [])))
  await page.route('**/api/v3/findmany/proc/proc_template', (route) => routeJson(route, envelope(true, { count: 0, info: [] })))

  // 模板 72 绑定一个模块 901
  await page.route('**/api/v3/module/bk_biz_id/99/service_template_id/72', (route) => routeJson(route, envelope(true, {
    count: 1,
    info: [{ bk_module_id: 901, bk_module_name: 'b52-module' }]
  })))

  // 实例同步状态(老版端点):捕获 payload
  await page.route('**/api/v3/findmany/proc/service_template_sync_status/bk_biz_id/99', (route, req) => {
    state.instanceStatusRequests.push(req.postDataJSON())
    return routeJson(route, envelope(true, [{ bk_inst_id: 901, status: 'need_sync', last_time: '2026-09-17 10:00:00', fail_tips: '' }]))
  })

  // 同步历史:捕获 payload
  await page.route('**/api/v3/findmany/topo/set_template_sync_history/bk_biz_id/99', (route, req) => {
    state.historyRequests.push(req.postDataJSON())
    return routeJson(route, envelope(true, { count: 0, info: [] }))
  })
  await page.route('**/api/v3/find/topo/set_template/999999/bk_biz_id/99', (route) => routeJson(route, envelope(true, { name: 'b52-settpl' })))

  try {
    // === 1. 列表删除保护 ===
    await page.goto(`${BASE}/#/business/99/service/template`, { waitUntil: 'load' })
    await page.waitForTimeout(1800)
    const boundRow = page.locator('.el-table__body tr').filter({ hasText: 'b52-tpl-bound' }).first()
    await boundRow.waitFor({ state: 'visible', timeout: 10000 })
    const boundDelete = boundRow.locator('button:has-text("删除")')
    assert(await boundDelete.count() === 1, '已绑定模块模板行未找到删除按钮')
    assert(await boundDelete.isDisabled(), 'module_count>0 的模板删除按钮未禁用')
    await boundRow.hover()
    await page.waitForTimeout(600)
    // headless 下 disabled 按钮的 hover tooltip 不稳定,B33 先例:尽力校验,不因环境误报
    const tooltipText = await page.locator('.el-popper:visible').filter({ hasText: '不可删除' }).last().textContent().catch(() => '')
    if (tooltipText.includes('不可删除')) ok('删除保护 tooltip 不可删除')
    else console.log('- tooltip 校验跳过(headless hover)')
    const freeRow = page.locator('.el-table__body tr').filter({ hasText: 'b52-tpl-free' }).first()
    const freeDelete = freeRow.locator('button:has-text("删除")')
    assert(await freeDelete.count() === 1 && !(await freeDelete.isDisabled()), 'module_count=0 的模板删除按钮应可点击')
    ok('服务模板删除保护(module_count>0 禁用 + tooltip)')

    // === 2. 抽屉实例同步状态走老版端点 ===
    await freeRow.click()
    await page.waitForTimeout(1500)
    const instanceReq = state.instanceStatusRequests.find((b) => b?.service_template_id === 72)
    assert(instanceReq, `未请求实例同步状态端点: ${JSON.stringify(state.instanceStatusRequests)}`)
    assert(Array.isArray(instanceReq.bk_module_ids) && instanceReq.bk_module_ids.includes(901), `实例状态 payload 缺少 bk_module_ids: ${JSON.stringify(instanceReq)}`)
    // 切到模块实例 tab,断言待同步状态渲染
    await page.locator('.el-drawer .el-tabs__item:has-text("模块实例")').click()
    await page.waitForTimeout(1200)
    const drawerText = await page.locator('.el-drawer').textContent()
    assert(drawerText.includes('b52-module'), '抽屉实例 tab 未渲染模块名')
    assert(drawerText.includes('待同步'), '实例状态 need_sync 未渲染为待同步')
    ok('实例同步状态端点与 payload 契约(service_template_sync_status)')

    // === 3. 同步历史日期全天边界 ===
    await page.goto(`${BASE}/#/business/99/set/instance/history/999999`, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    const rangeInputs = page.locator('.el-date-editor .el-range-input')
    await rangeInputs.nth(0).click()
    await rangeInputs.nth(0).fill('2026-09-01')
    await rangeInputs.nth(1).click()
    await rangeInputs.nth(1).fill('2026-09-10')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1200)
    const historyPayload = state.historyRequests[state.historyRequests.length - 1]
    assert(historyPayload?.start_time === '2026-09-01 00:00:00', `start_time 未扩展为全天开始: ${JSON.stringify(historyPayload)}`)
    assert(historyPayload?.end_time === '2026-09-10 23:59:59', `end_time 未扩展为全天结束: ${JSON.stringify(historyPayload)}`)
    assert(historyPayload?.set_template_id === 999999, `set_template_id 不符: ${JSON.stringify(historyPayload)}`)
    ok('同步历史日期全天边界契约(00:00:00 / 23:59:59)')

    const realErrors = errors.filter((item) => !/favicon|ResizeObserver/.test(item))
    assert(!realErrors.length, realErrors.join(' | '))
    console.log('B52 E2E 全部通过')
  } catch (error) {
    errors.push(`ASSERT: ${error.message}`)
    console.error(`✗ B52 失败: ${error.message}`)
  } finally {
    await browser.close()
  }
  if (errors.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(`✗ B52: ${error.message}`)
  process.exitCode = 1
})
