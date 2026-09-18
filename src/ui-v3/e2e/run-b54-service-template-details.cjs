// B54: 服务模板独立详情双 Tab parity 契约
const { chromium } = require('./browser.cjs')
const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []
const state = { propertyUpdates: [], propertyDeletes: [], processCreates: [], processUpdates: [], topoRequests: [], countRequests: [], statusRequests: [] }
function assert(condition, message) { if (!condition) throw new Error(message) }
function envelope(result, data, code = 0, message = 'success') { return { result, bk_error_code: code, bk_error_msg: message, permission: null, data } }
function ok(label) { console.log(`✓ ${label}`) }

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    route.continue({ headers })
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`) })
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  await page.route('**/api/v3/biz/search/0', (route) => json(route, envelope(true, { count: 1, info: [{ bk_biz_id: 99, bk_biz_name: 'b54-biz' }] })))
  await page.route('**/api/v3/find/business_set*', (route) => json(route, envelope(true, { count: 0, info: [] })))
  await page.route('**/api/v3/usercustom*', (route) => json(route, envelope(true, {})))
  await page.route('**/api/v3/findmany/proc/service_template/sync_status/biz/99', (route) => json(route, envelope(true, { service_templates: [{ service_template_id: 72, need_sync: true }] })))
  await page.route('**/api/v3/find/proc/service_template/all_info', (route) => json(route, envelope(true, {
    id: 72, bk_biz_id: 99, name: 'b54-service', service_category_id: 501,
    attributes: [{ bk_attribute_id: 601, bk_property_value: 4 }],
    processes: [{ id: 801, property: { bk_func_name: { value: 'b54-web' } } }]
  })))
  await page.route('**/api/v3/find/objectattr', (route, req) => {
    const body = req.postDataJSON()
    if (body?.bk_obj_id === 'module') return json(route, envelope(true, [{ id: 601, bk_property_id: 'b54_capacity', bk_property_name: '容量', bk_property_type: 'int' }]))
    return json(route, envelope(true, [
      { id: 701, bk_property_id: 'bk_func_name', bk_property_name: '进程名', bk_property_type: 'singlechar' },
      { id: 702, bk_property_id: 'user', bk_property_name: '启动用户', bk_property_type: 'singlechar' },
      { id: 703, bk_property_id: 'work_path', bk_property_name: '工作路径', bk_property_type: 'singlechar' },
      { id: 704, bk_property_id: 'bind_info', bk_property_name: '端口绑定', bk_property_type: 'object' }
    ]))
  })
  await page.route('**/api/v3/findmany/proc/service_category', (route) => json(route, envelope(true, [{ id: 500, name: '基础', bk_parent_id: 0 }, { id: 501, name: '服务', bk_parent_id: 500 }])))
  await page.route('**/api/v3/findmany/proc/proc_template', (route) => json(route, envelope(true, { count: 1, info: [{ id: 801, service_template_id: 72, property: { bk_func_name: { value: 'b54-web' }, user: { value: 'root' }, work_path: { value: '/opt/b54' }, bind_info: { value: [{ port: { value: { value: '8080' } } }] } } }] })))
  await page.route('**/api/v3/update/proc/service_template/attribute', (route, req) => { state.propertyUpdates.push(req.postDataJSON()); return json(route, envelope(true, null)) })
  await page.route('**/api/v3/delete/proc/service_template/attribute', (route, req) => { state.propertyDeletes.push(req.postDataJSON()); return json(route, envelope(true, null)) })
  await page.route('**/api/v3/createmany/proc/proc_template', (route, req) => { state.processCreates.push(req.postDataJSON()); return json(route, envelope(true, null)) })
  await page.route('**/api/v3/update/proc/proc_template', (route, req) => { state.processUpdates.push(req.postDataJSON()); return json(route, envelope(true, null)) })
  await page.route('**/api/v3/delete/proc/proc_template', (route) => json(route, envelope(true, null)))
  await page.route('**/api/v3/module/bk_biz_id/99/service_template_id/72', (route) => json(route, envelope(true, { count: 2, info: [{ bk_module_id: 11, bk_module_name: 'b54-web', bk_set_id: 21 }, { bk_module_id: 12, bk_module_name: 'b54-worker', bk_set_id: 21, set_template_id: 72 }] })))
  await page.route('**/api/v3/find/topopath/biz/99', (route, req) => { state.topoRequests.push(req.postDataJSON()); return json(route, envelope(true, { nodes: [{ topo_node: { bk_inst_id: 11 }, topo_path: [{ bk_inst_name: 'b54-web' }, { bk_inst_name: 'default' }, { bk_inst_name: 'b54-biz' }] }, { topo_node: { bk_inst_id: 12 }, topo_path: [{ bk_inst_name: 'b54-worker' }, { bk_inst_name: 'default' }, { bk_inst_name: 'b54-biz' }] }] })) })
  await page.route('**/api/v3/find/topoinstnode/host_serviceinst_count/99', (route, req) => { state.countRequests.push(req.postDataJSON()); return json(route, envelope(true, [{ bk_obj_id: 'module', bk_inst_id: 11, host_count: 0, service_instance_count: 2 }, { bk_obj_id: 'module', bk_inst_id: 12, host_count: 3, service_instance_count: 1 }])) })
  await page.route('**/api/v3/findmany/proc/service_template_sync_status/bk_biz_id/99', (route, req) => { state.statusRequests.push(req.postDataJSON()); return json(route, envelope(true, [{ bk_inst_id: 11, status: 'need_sync', last_time: '2026-09-18 09:00:00', fail_tips: '' }, { bk_inst_id: 12, status: 'finished', last_time: '2026-09-18 08:00:00', fail_tips: '' }])) })

  try {
    await page.goto(`${BASE}/#/business/99/service/template/details/72`, { waitUntil: 'load' })
    await page.waitForTimeout(1800)
    const body = await page.locator('body').textContent()
    assert(body.includes('b54-service') && body.includes('容量') && body.includes('4'), '配置 tab 未渲染模板名称/属性')
    assert(body.includes('b54-web') && body.includes('8080'), '配置 tab 未渲染进程 property/bind_info')
    assert(await page.locator('.tab-dot').count() === 1, 'need_sync 红点未显示')
    ok('配置 tab all_info/属性/进程契约')

    const attrRow = page.locator('.attribute-row').filter({ hasText: '容量' }).first()
    await attrRow.getByRole('button', { name: '编辑' }).click()
    await attrRow.locator('input').fill('8')
    await attrRow.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(500)
    assert(state.propertyUpdates[0]?.id === 72 && state.propertyUpdates[0]?.bk_biz_id === 99, '属性更新基础 payload 不符')
    assert(state.propertyUpdates[0]?.attributes?.[0]?.bk_attribute_id === 601 && state.propertyUpdates[0]?.attributes?.[0]?.bk_property_value === '8', '属性更新 payload 不符')
    ok('配置属性增量更新契约')

    await page.getByRole('button', { name: '新增进程模板' }).click()
    const processDialog = page.locator('.el-dialog:visible')
    await processDialog.getByRole('textbox').first().fill('b54-api')
    await processDialog.getByRole('textbox').nth(1).fill('root')
    await processDialog.getByRole('textbox').nth(2).fill('/opt/b54-api')
    const portInput = processDialog.getByPlaceholder('如 8080')
    if (await portInput.count()) await portInput.fill('9090')
    await processDialog.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(600)
    const createBody = state.processCreates[0]
    assert(createBody?.bk_biz_id === 99 && createBody?.service_template_id === 72, '进程创建基础 payload 不符')
    assert(createBody?.processes?.[0]?.spec?.bk_func_name?.value === 'b54-api', '进程创建动态名称 payload 不符')
    assert(createBody?.processes?.[0]?.spec?.bind_info?.value?.[0]?.port?.value === '9090', '进程创建 bind_info payload 不符')
    ok('进程新增动态属性/bind_info payload 契约')

    await page.locator('.el-tabs__item').filter({ hasText: '实例' }).click()
    await page.waitForTimeout(1200)
    const instanceText = await page.locator('.template-instance').textContent()
    assert(instanceText.includes('b54-web') && instanceText.includes('b54-biz / default / b54-web'), '实例 tab 拓扑路径未渲染')
    assert(instanceText.includes('3') && instanceText.includes('待同步') && instanceText.includes('已同步'), '实例主机数/状态未合并渲染')
    assert(state.topoRequests[0]?.topo_nodes?.length === 2, '拓扑请求 payload 不符')
    assert(state.countRequests[0]?.condition?.length === 2, '主机数请求 payload 不符')
    assert(state.statusRequests[0]?.service_template_id === 72, '实例状态缺 service_template_id')
    ok('实例拓扑/主机数/同步状态契约')

    const rows = page.locator('.template-instance .el-table__body tr')
    const protectedRow = rows.filter({ hasText: 'b54-worker' }).first()
    assert(await protectedRow.getByRole('button', { name: '删除' }).isDisabled(), '有主机/集群模板模块删除未保护')
    const freeRow = rows.filter({ hasText: 'b54-web' }).first()
    await freeRow.getByRole('button', { name: '去同步' }).click()
    await page.waitForTimeout(300)
    assert(page.url().includes('/business/99/sync') && page.url().includes('template=72') && page.url().includes('modules=11'), '单模块同步跳转契约不符')
    ok('实例同步入口与删除保护契约')

    const realErrors = errors.filter((item) => !/favicon|ResizeObserver/.test(item))
    assert(!realErrors.length, realErrors.join(' | '))
    console.log('B54 E2E 全部通过')
  } catch (error) {
    errors.push(`ASSERT: ${error.message}`)
    console.error(`✗ B54 失败: ${error.message}`)
  } finally {
    await browser.close()
  }
  if (errors.length) process.exitCode = 1
}
main().catch((error) => { console.error(`✗ B54: ${error.message}`); process.exitCode = 1 })
