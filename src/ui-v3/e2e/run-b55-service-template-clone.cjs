// B55: 服务模板 clone 全量 all_info 契约
const { chromium } = require('./browser.cjs')
const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []; const state = { creates: [], allInfoRequests: [] }
const envelope = (result, data, code = 0, message = 'success') => ({ result, bk_error_code: code, bk_error_msg: message, permission: null, data })
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const ok = (label) => console.log(`✓ ${label}`)

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.route('**/*', (route) => { const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }; delete headers['if-none-match']; route.continue({ headers }) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
  const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

  await page.route('**/api/v3/biz/search/0', (r) => json(r, envelope(true, { count: 1, info: [{ bk_biz_id: 99, bk_biz_name: 'b55-biz' }] })))
  await page.route('**/api/v3/find/business_set*', (r) => json(r, envelope(true, { count: 0, info: [] })))
  await page.route('**/api/v3/usercustom*', (r) => json(r, envelope(true, {})))
  await page.route('**/api/v3/findmany/proc/service_category/with_statistics', (r) => json(r, envelope(true, [{ id: 500, name: 'root', bk_parent_id: 0 }, { id: 501, name: 'leaf', bk_parent_id: 500 }])))
  await page.route('**/api/v3/find/objectattr', (r, req) => {
    const body = req.postDataJSON()
    return json(r, envelope(true, body?.bk_obj_id === 'module'
      ? [{ id: 601, bk_property_id: 'b55_capacity', bk_property_name: '容量', bk_property_type: 'int' }]
      : [{ id: 701, bk_property_id: 'bk_func_name', bk_property_name: '进程名', bk_property_type: 'singlechar' }, { id: 702, bk_property_id: 'user', bk_property_name: '启动用户', bk_property_type: 'singlechar' }, { id: 703, bk_property_id: 'work_path', bk_property_name: '工作路径', bk_property_type: 'singlechar' }, { id: 704, bk_property_id: 'bind_info', bk_property_name: '端口绑定', bk_property_type: 'object' }]))
  })
  await page.route('**/api/v3/find/proc/service_template/all_info', (r, req) => {
    state.allInfoRequests.push(req.postDataJSON())
    return json(r, envelope(true, { id: 72, bk_biz_id: 99, name: 'b55-source', service_category_id: 501, attributes: [{ bk_attribute_id: 601, bk_property_value: 8 }], processes: [{ id: 801, property: { bk_func_name: { value: 'b55-web', as_default_value: true }, user: { value: 'root', as_default_value: true }, work_path: { value: '/opt/b55', as_default_value: true }, bind_info: { value: [{ row_id: 1, ip: { value: '1' }, protocol: { value: '1' }, port: { value: '8080' }, enable: { value: true } }, { row_id: 2, ip: { value: '2' }, protocol: { value: '2' }, port: { value: '9090' }, enable: { value: false } }], as_default_value: true } } }] }))
  })
  await page.route('**/api/v3/create/proc/service_template/all_info', (r, req) => { state.creates.push(req.postDataJSON()); return json(r, envelope(true, { id: 99 })) })

  try {
    await page.goto(`${BASE}/#/business/99/service/template/create?clone=72`, { waitUntil: 'load' })
    await page.waitForTimeout(1600)
    assert(state.allInfoRequests.some((body) => body?.bk_biz_id === 99 && body?.id === 72), 'clone 未请求源模板 all_info')
    assert((await page.locator('.property-table').textContent()).includes('容量'), 'clone 未回填模块属性')
    const procText = await page.locator('.process-table').textContent()
    assert(procText.includes('b55-web') && procText.includes('8080'), 'clone 未回填进程或端口')
    await page.locator('.name-input input').fill('b55-clone')
    await page.locator('.create-footer button:has-text("提交")').click()
    await page.waitForTimeout(800)
    const body = state.creates[0]
    assert(body?.bk_biz_id === 99 && body.name === 'b55-clone' && body.service_category_id === 501, `clone 基础 payload 不符: ${JSON.stringify(body)}`)
    assert(body.attributes?.[0]?.bk_attribute_id === 601 && body.attributes?.[0]?.bk_property_value === 8, 'clone 属性 payload 不完整')
    const process = body.processes?.[0]
    assert(process && !('id' in process) && process.property?.bk_func_name?.value === 'b55-web', `clone process payload 不符: ${JSON.stringify(process)}`)
    const binds = process.property?.bind_info?.value || []
    assert(binds.length === 2 && binds[0].row_id === 1 && binds[0].port.value === '8080' && binds[1].row_id === 2 && binds[1].port.value === '9090' && binds[1].enable.value === false, `clone bind_info 不完整: ${JSON.stringify(binds)}`)
    ok('clone all_info 属性/动态进程/多端口 bind_info 契约')
    const realErrors = errors.filter((item) => !/favicon|ResizeObserver/.test(item)); assert(!realErrors.length, realErrors.join(' | '))
    console.log('B55 E2E 全部通过')
  } catch (error) { errors.push(`ASSERT: ${error.message}`); console.error(`✗ B55 失败: ${error.message}`) } finally { await browser.close() }
  if (errors.length) process.exitCode = 1
}
main().catch((e) => { console.error(`✗ B55: ${e.message}`); process.exitCode = 1 })
