// B53: 服务模板详情深链 + 进程 property 展平 caller 契约
// 验证:详情深链经列表 read-back 定位模板,请求进程模板 payload,property/bind_info 展平并渲染。
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []
function assert(condition, message) { if (!condition) throw new Error(message) }
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

  const procRequests = []
  const routeJson = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

  await page.route('**/api/v3/biz/search/0', (route) => routeJson(route, envelope(true, {
    count: 1, info: [{ bk_biz_id: 99, bk_biz_name: 'b53-biz', default: 0 }]
  })))
  await page.route('**/api/v3/find/business_set*', (route) => routeJson(route, envelope(true, { count: 0, info: [] })))
  await page.route('**/api/v3/usercustom*', (route) => routeJson(route, envelope(true, {})))
  await page.route('**/api/v3/find/objectattr', (route) => routeJson(route, envelope(true, [])))
  await page.route('**/api/v3/findmany/proc/service_category', (route) => routeJson(route, envelope(true, [
    { id: 500, name: 'b53-root', bk_parent_id: 0 },
    { id: 501, name: 'b53-leaf', bk_parent_id: 500 }
  ])))
  await page.route('**/api/v3/findmany/topo/set_template/bk_biz_id/99/web', (route) => routeJson(route, envelope(true, { count: 0, info: [] })))
  await page.route('**/api/v3/findmany/topo/set_template/bk_biz_id/99/set_template_status', (route) => routeJson(route, envelope(true, [])))

  // 列表 read-back:applyDeepLink 会从这里找到 templateId=72
  await page.route('**/api/v3/findmany/proc/service_template', (route) => routeJson(route, envelope(true, {
    count: 1,
    info: [{ id: 72, name: 'b53-tpl', service_category_id: 501, modifier: 'admin', last_time: '2026-09-17 09:00:00' }]
  })))
  await page.route('**/api/v3/findmany/proc/service_template/count_info/biz/99', (route) => routeJson(route, envelope(true, [
    { service_template_id: 72, process_template_count: 1, module_count: 0 }
  ])))
  await page.route('**/api/v3/findmany/proc/service_template/sync_status/biz/99', (route) => routeJson(route, envelope(true, { service_templates: [] })))

  // B52 已验证模块同步；B53 只让模块列表为空，聚焦进程配置 caller。
  await page.route('**/api/v3/module/bk_biz_id/99/service_template_id/72', (route) => routeJson(route, envelope(true, { count: 0, info: [] })))
  await page.route('**/api/v3/findmany/proc/proc_template', (route, req) => {
    procRequests.push(req.postDataJSON())
    return routeJson(route, envelope(true, {
      count: 1,
      info: [{
        id: 801,
        service_template_id: 72,
        property: {
          bk_func_name: { value: 'b53-web' },
          bk_process_name: { value: 'b53-web' },
          user: { value: 'root' },
          work_path: { value: '/opt/b53' },
          bind_info: { value: [{ row_id: 1, ip: { value: '1' }, port: { value: { value: '8080' } }, protocol: { value: '1' } }] }
        }
      }]
    }))
  })

  try {
    await page.goto(`${BASE}/#/business/99/service/template/details/72`, { waitUntil: 'load' })
    await page.waitForTimeout(2200)
    const procBody = procRequests.find((body) => body?.bk_biz_id === 99 && body?.service_template_id === 72)
    assert(procBody, `详情深链未请求进程模板: ${JSON.stringify(procRequests)}`)
    assert(procBody.page?.start === 0 && procBody.page?.limit === 100, `进程模板 page 契约不符: ${JSON.stringify(procBody)}`)
    const drawer = page.locator('.el-drawer:visible')
    await drawer.waitFor({ state: 'visible', timeout: 10000 })
    const drawerText = await drawer.textContent()
    assert(drawerText.includes('b53-tpl'), '详情抽屉标题未包含模板名称')
    assert(drawerText.includes('进程配置'), '默认进程配置 tab 未显示')
    assert(drawerText.includes('b53-web'), 'property.bk_func_name 未展平渲染')
    assert(drawerText.includes('8080'), 'property.bind_info.port 未展平渲染')
    assert(drawerText.includes('/opt/b53'), 'property.work_path 未展平渲染')
    const realErrors = errors.filter((item) => !/favicon|ResizeObserver/.test(item))
    assert(!realErrors.length, realErrors.join(' | '))
    ok('详情深链 → 进程模板请求 → property 展平渲染')
    console.log('B53 E2E 全部通过')
  } catch (error) {
    errors.push(`ASSERT: ${error.message}`)
    console.error(`✗ B53 失败: ${error.message}`)
  } finally {
    await browser.close()
  }
  if (errors.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(`✗ B53: ${error.message}`)
  process.exitCode = 1
})
