// M4-I: set template create/edit/details/sync/history contract (legacy set-template/* + set-sync/*).
const fs = require('fs')
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const REPORT = process.env.UI_V3_M4_SETTPL_REPORT || '/tmp/ui-v3-m4-set-template.json'
const SHOTS = process.env.UI_V3_M4_SETTPL_SHOTS || '/tmp/ui-v3-m4-settpl-shots'
fs.mkdirSync(SHOTS, { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function ok(data) {
  return { result: true, bk_error_code: 0, bk_error_msg: 'success', data }
}

function json(route, data) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
}

function hashQuery(page) {
  const hash = new URL(page.url()).hash.replace(/^#/, '')
  return new URLSearchParams(hash.split('?')[1] || '')
}

async function waitForRecord(predicate, message, timeout = 6000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(message)
}

// 集群属性(类型化控件契约):singlechar/int/enum/bool
const SET_PROPS = [
  { id: 301, bk_property_id: 'bk_set_desc', bk_property_name: '集群描述', bk_property_type: 'singlechar', bk_property_group: 'default', editable: true, default: '' },
  { id: 302, bk_property_id: 'bk_capacity', bk_property_name: '集群容量', bk_property_type: 'int', bk_property_group: 'default', editable: true, default: '', option: { min: 0, max: 2000 } },
  { id: 303, bk_property_id: 'bk_set_env', bk_property_name: '环境类型', bk_property_type: 'enum', bk_property_group: 'default', editable: true, default: '', option: [{ id: '1', name: '测试' }, { id: '2', name: '体验' }] },
  { id: 304, bk_property_id: 'bk_test_bool', bk_property_name: '测试布尔', bk_property_type: 'bool', bk_property_group: 'default', editable: true, default: null, option: false }
]
const SET_GROUPS = [{ bk_group_id: 'default', bk_group_name: '默认', bk_group_index: 0, bk_biz_id: 0 }]
const CATEGORIES = [
  { id: 1, name: 'Web 服务', bk_parent_id: 0 },
  { id: 11, name: 'Web', bk_parent_id: 1 },
  { id: 12, name: 'Job', bk_parent_id: 1 }
]
const SVC_TPLS = [
  { id: 11, name: 'web-tpl', service_category_id: 11 },
  { id: 12, name: 'job-tpl', service_category_id: 12 }
]
// 编辑态:job-tpl(12) 下有 3 台主机 → 禁止删除/取消
const HOST_COUNTS = [{ id: 11, count: 0 }, { id: 12, count: 3 }]
const PROC_TPLS = {
  11: [{ property: { bk_func_name: { value: 'java' }, bk_process_name: { value: 'web' }, bk_start_param_regex: { value: '-x' }, port: { value: '8080' }, bind_info: { value: [{ ip: '127.0.0.1', port: '8080', protocol: 'tcp' }] } } }],
  12: [{ property: { bk_func_name: { value: 'python' }, bk_process_name: { value: 'job' }, bk_start_param_regex: { value: '' }, bind_info: { value: [] } } }]
}
const SET_ROWS = [
  { bk_inst_id: 31, status: 'executing', last_time: '2026-09-30 08:00:00', creator: 'admin' },
  { bk_inst_id: 32, status: 'need_sync', last_time: '', creator: 'admin' }
]
const SETS_TOPO = {
  count: 2,
  info: [
    { bk_set_id: 31, bk_set_name: '集群31', topo_path: [{ ObjectID: 'biz', bk_inst_id: 2, bk_inst_name: '蓝鲸' }, { ObjectID: 'set', bk_inst_id: 31, bk_inst_name: '集群31' }] },
    { bk_set_id: 32, bk_set_name: '集群32', topo_path: [{ ObjectID: 'biz', bk_inst_id: 2, bk_inst_name: '蓝鲸' }, { ObjectID: 'set', bk_inst_id: 32, bk_inst_name: '集群32' }] }
  ]
}
const DIFF_BY_SET = {
  31: {
    module_host_count: { 501: 0 },
    difference: {
      attributes: [{ id: 301, inst_value: 'old', template_value: 'hello' }],
      set_detail: { bk_set_name: '集群31' },
      module_diffs: [{ bk_module_id: 501, bk_module_name: '模块一', diff_type: 'changed' }]
    }
  },
  32: {
    module_host_count: { 601: 2 },
    difference: {
      attributes: [],
      set_detail: { bk_set_name: '集群32' },
      module_diffs: [{ bk_module_id: 601, bk_module_name: '模块二', diff_type: 'remove' }]
    }
  }
}

// 部署态 8090 上 hash 差异 goto 为同文档导航(组件不重挂),统一 goto+reload 保证深链重解析
async function gotoReload(page, url, options) {
  await page.goto(url, options)
  await page.reload({ waitUntil: 'load' }).catch(() => {})
}

function makeRecords() {
  return {
    errors: [],
    createBodies: [],
    updateBodies: [],
    hostCountBodies: [],
    syncStatusBodies: [],
    syncSubmitBodies: [],
    historyBodies: [],
    setListBodies: []
  }
}

function attachObservers(page, records) {
  page.on('pageerror', (error) => records.errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') records.errors.push(`console.error: ${message.text()}`)
  })
}

async function installMocks(page, records) {
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    return route.continue({ headers })
  })
  await page.route('**/api/v3/**', (route) => json(route, ok({})))
  await page.route('**/userinfo', (route) => json(route, ok({ username: 'm4i', chname: 'M4I', current_supplier: '0' })))
  await page.route('**/api/v3/biz/search/0', (route) => json(route, ok({ count: 1, info: [{ bk_biz_id: 2, bk_biz_name: 'Mock Business' }] })))
  await page.route('**/api/v3/findmany/biz_set', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/usercustom/user/search', (route) => json(route, ok({})))
  await page.route('**/api/v3/usercustom', (route) => json(route, ok({})))
  await page.route('**/api/v3/find/classificationobject', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/object', (route) => json(route, ok([])))
  await page.route('**/api/v3/hosts/favorites/search', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/find/objectattr/web', (route) => json(route, ok([])))
  // 集群属性与进程属性
  await page.route('**/api/v3/find/objectattr', (route) => {
    const body = route.request().postDataJSON() || {}
    return json(route, ok(body.bk_obj_id === 'set' ? SET_PROPS : []))
  })
  await page.route('**/api/v3/find/objectattgroup/object/set', (route) => json(route, ok(SET_GROUPS)))
  // 服务分类(无数量版)
  await page.route('**/api/v3/findmany/proc/service_category', (route) => json(route, ok({ count: CATEGORIES.length, info: CATEGORIES })))
  await page.route('**/api/v3/findmany/proc/service_category/with_statistics', (route) => json(route, ok({ count: CATEGORIES.length, info: CATEGORIES })))
  // 服务模板列表(选择器)
  await page.route('**/api/v3/findmany/proc/service_template/count_info/**', (route) => json(route, ok([])))
  await page.route('**/api/v3/findmany/proc/service_template', (route) => json(route, ok({ count: SVC_TPLS.length, info: SVC_TPLS })))
  // 进程模板(hover 浮层/查看详情)
  await page.route('**/api/v3/findmany/proc/proc_template', (route) => {
    const body = route.request().postDataJSON() || {}
    return json(route, ok({ count: (PROC_TPLS[body.service_template_id] || []).length, info: PROC_TPLS[body.service_template_id] || [] }))
  })
  // 集群模板 CRUD
  await page.route('**/api/v3/findmany/topo/set_template/bk_biz_id/2/web', (route) => {
    records.setListBodies.push(route.request().postDataJSON() || {})
    return json(route, ok({ count: 1, info: [{ set_instance_count: 2, set_template: { id: 1, name: '集群模板A', modifier: 'admin', last_time: '2026-09-30 10:00:00' } }] }))
  })
  await page.route('**/api/v3/create/topo/set_template/all_info', (route) => {
    records.createBodies.push(route.request().postDataJSON() || {})
    return json(route, ok({ id: 88 }))
  })
  await page.route('**/api/v3/update/topo/set_template/all_info', (route) => {
    records.updateBodies.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  await page.route('**/api/v3/find/topo/set_template/all_info', (route) => json(route, ok({
    name: '集群模板A',
    service_template_ids: [11, 12],
    attributes: [{ bk_attribute_id: 301, bk_property_value: 'hello' }]
  })))
  await page.route('**/api/v3/find/topo/set_template/1/bk_biz_id/2', (route) => json(route, ok({ name: '集群模板A' })))
  await page.route('**/api/v3/findmany/topo/set_template/1/bk_biz_id/2/service_templates', (route) => json(route, ok(SVC_TPLS)))
  // 服务模板下主机数(rollReq 契约:响应 [{id,count}])
  await page.route('**/api/v3/count/set_template/1/service_template/hosts', (route) => {
    records.hostCountBodies.push(route.request().postDataJSON() || {})
    return json(route, ok(HOST_COUNTS))
  })
  await page.route('**/api/v3/findmany/topo/set_template/bk_biz_id/2/set_template_status', (route) => json(route, ok([{ set_template_id: 1, need_sync: true }])))
  // 实例 tab
  await page.route('**/api/v3/findmany/topo/set_template_sync_status/bk_biz_id/2', (route) => {
    records.syncStatusBodies.push(route.request().postDataJSON() || {})
    if (records.emptyInstance) return json(route, ok({ count: 0, info: [] }))
    return json(route, ok({ count: SET_ROWS.length, info: SET_ROWS }))
  })
  await page.route('**/api/v3/findmany/topo/set_template/1/bk_biz_id/2/sets/web', (route) => json(route, ok(SETS_TOPO)))
  await page.route('**/api/v3/findmany/topo/set_template/1/bk_biz_id/2/instances_sync_status', (route) => json(route, ok({ 31: { status: 500, detail: [{ status: 500, data: { module_diff: { bk_module_name: '模块一' } }, response: { bk_error_msg: '同步失败' } }] } })))
  await page.route('**/api/v3/updatemany/topo/set_template/1/bk_biz_id/2/sync_to_instances', (route) => {
    records.syncSubmitBodies.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  // 同步页
  await page.route('**/api/v3/findmany/topo/set_template/1/bk_biz_id/2/host_with_instances', (route) => json(route, ok([{ id: 31, has_host: false }, { id: 32, has_host: false }])))
  await page.route('**/api/v3/findmany/topo/set_template/1/bk_biz_id/2/diff_with_instances', (route) => {
    const body = route.request().postDataJSON() || {}
    return json(route, ok(DIFF_BY_SET[body.bk_set_id] || DIFF_BY_SET[31]))
  })
  await page.route('**/api/v3/find/topopath/biz/2', (route) => json(route, ok({ nodes: [
    { topo_node: { bk_obj_id: 'set', bk_inst_id: 31 }, topo_path: [{ bk_inst_id: 2, bk_inst_name: '蓝鲸' }, { bk_inst_id: 31, bk_inst_name: '集群31' }] },
    { topo_node: { bk_obj_id: 'set', bk_inst_id: 32 }, topo_path: [{ bk_inst_id: 2, bk_inst_name: '蓝鲸' }, { bk_inst_id: 32, bk_inst_name: '集群32' }] }
  ] })))
  // 同步历史
  await page.route('**/api/v3/findmany/topo/set_template_sync_history/bk_biz_id/2', (route) => {
    records.historyBodies.push(route.request().postDataJSON() || {})
    return json(route, ok({ count: 1, info: [{ bk_inst_id: 31, status: 'finished', last_time: '2026-09-30 09:00:00', creator: 'admin' }] }))
  })
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)

  const records = makeRecords()
  attachObservers(page, records)
  await installMocks(page, records)

  const checks = []
  try {
    // 1. 属性弹窗 + 类型化控件 + 提交保留 0/false(旧值 r.value||null 会打成 null)
    await gotoReload(page, `${BASE}/#/business/2/set/template/create`, { waitUntil: 'load' })
    await page.locator('body').waitFor()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: '添加属性字段' }).click()
    await page.locator('.el-dialog').filter({ hasText: '选择模型字段' }).waitFor()
    const modal = page.locator('.el-dialog').filter({ hasText: '选择模型字段' })
    assert((await modal.locator('.pm-group-title').allInnerTexts()).includes('默认'), '字段弹窗未按分组展示')
    for (const name of ['集群描述', '集群容量', '环境类型', '测试布尔']) {
      await modal.locator('.el-checkbox').filter({ hasText: name }).click()
    }
    await modal.getByRole('button', { name: '确定' }).click()
    const list = page.locator('.selected-list')
    assert(await list.locator('.el-switch').count() === 1, 'bool 属性未渲染为开关控件')
    const capItem = page.locator('.prop-item').filter({ hasText: '集群容量' })
    await capItem.locator('input').fill('0')
    const envItem = page.locator('.prop-item').filter({ hasText: '环境类型' })
    await envItem.locator('.el-select').click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: '测试' }).first().click()
    await page.locator('.prop-item').filter({ hasText: '集群描述' }).locator('input').fill('desc-x')
    await page.locator('.name-input input').fill('tpl-typed')

    // 2. 服务模板选择器:全选/汇总/确定进树
    await page.locator('.topo-add').click()
    await page.locator('.el-dialog').filter({ hasText: '添加服务模板' }).waitFor()
    const svcDialog = page.locator('.el-dialog').filter({ hasText: '添加服务模板' })
    await svcDialog.locator('.svc-item').first().waitFor()
    assert(await svcDialog.locator('.svc-item').count() === 2, '选择器模板数不符')
    await svcDialog.locator('.svc-select-all .el-checkbox').click()
    assert((await svcDialog.locator('.svc-summary').innerText()).includes('已选2个'), '全选后汇总数不符')
    assert(await svcDialog.locator('.svc-summary').innerText().then((t) => t.includes('跳转服务模板')), '缺少跳转服务模板链接')
    await svcDialog.getByRole('button', { name: '确定' }).click()
    assert(await page.locator('.topo-child').filter({ hasText: 'web-tpl' }).count() === 1, '确认后树未渲染服务模板节点')

    await page.getByRole('button', { name: '提交' }).click()
    await waitForRecord(() => records.createBodies.length === 1, '创建请求未发出')
    const createBody = records.createBodies[0]
    const attrOf = (id) => (createBody.attributes || []).find((a) => a.bk_attribute_id === id)
    assert(createBody.attributes?.length === 4, `attributes 未随 payload 提交: ${JSON.stringify(createBody.attributes)}`)
    assert(attrOf(302)?.bk_property_value === 0, `int 值 0 被打成 null: ${JSON.stringify(createBody.attributes)}`)
    assert(attrOf(304)?.bk_property_value === false, `bool 值 false 被打成 null: ${JSON.stringify(createBody.attributes)}`)
    assert(attrOf(303)?.bk_property_value === '1', 'enum 值未按选项 id 提交')
    assert(attrOf(301)?.bk_property_value === 'desc-x', '文本值未提交')
    assert(Array.isArray(createBody.service_template_ids) && createBody.service_template_ids.length === 2, 'service_template_ids 缺失')
    checks.push('property modal renders grouped fields, typed controls keep 0/false in payload')

    // 3. 创建成功引导弹窗(旧版:创建集群→业务拓扑/返回列表)
    await page.locator('.el-dialog').filter({ hasText: '创建成功' }).waitFor()
    const successDlg = page.locator('.el-dialog').filter({ hasText: '创建成功' })
    assert((await successDlg.innerText()).includes('跳转到业务拓扑创建集群实例'), '创建成功文案未对齐老版')
    await successDlg.getByRole('button', { name: '创建集群' }).click()
    await page.waitForFunction(() => window.location.hash.includes('/business/2/index'), null, { timeout: 8000 })
      .catch(() => { throw new Error(`「创建集群」未跳业务拓扑: ${page.url()}`) })
    checks.push('create success dialog offers create-set/return-list with legacy copy')

    // 4. 无属性创建走 all_info 且 attributes 为空数组
    await gotoReload(page, `${BASE}/#/business/2/set/template/create`, { waitUntil: 'load' })
    await page.waitForTimeout(500)
    await page.locator('.name-input input').fill('tpl-empty')
    await page.getByRole('button', { name: '提交' }).click()
    await page.waitForFunction(() => document.body.innerText.includes('请添加服务模板'), null, { timeout: 5000 })
      .catch(() => { throw new Error('未提示请添加服务模板') })
    await page.locator('.topo-add').click()
    const dlg2 = page.locator('.el-dialog').filter({ hasText: '添加服务模板' })
    await dlg2.locator('.svc-item').filter({ hasText: 'job-tpl' }).click()
    await dlg2.getByRole('button', { name: '确定' }).click()
    await page.locator('.name-input input').fill('tpl-empty')
    await page.getByRole('button', { name: '提交' }).click()
    await waitForRecord(() => records.createBodies.length === 2, '第二次创建未发出')
    assert(Array.isArray(records.createBodies[1].attributes) && records.createBodies[1].attributes.length === 0,
      `无属性创建未带空数组 attributes: ${JSON.stringify(records.createBodies[1])}`)
    checks.push('create without properties posts all_info with empty attributes array')

    // 5. 编辑态:主机数守卫 + 查看详情 + 脏门控/离开确认(经列表页真实路由进入)
    await gotoReload(page, `${BASE}/#/business/2/set/template`, { waitUntil: 'load' })
    await page.locator('.el-table__row').first().waitFor()
    await page.locator('.el-table__row').filter({ hasText: '集群模板A' }).getByRole('button', { name: '编辑' }).click()
    await page.waitForFunction(() => window.location.hash.includes('/set/template/edit/1'), null, { timeout: 8000 })
    await page.waitForTimeout(800)
    await waitForRecord(() => records.hostCountBodies.some((b) => JSON.stringify(b.ids) === '[11,12]'),
      `主机数请求不符契约: ${JSON.stringify(records.hostCountBodies)}`)
    const saveBtn = page.getByRole('button', { name: '保存' })
    assert(await saveBtn.isDisabled(), '编辑态未变更时保存按钮未禁用')
    // job-tpl 有主机:删除置灰 + popover 跳转查看带 keyword
    const jobChild = page.locator('.topo-child').filter({ hasText: 'job-tpl' })
    await jobChild.hover()
    await jobChild.locator('a.action-link.disabled').hover()
    await page.waitForTimeout(400)
    const popText = await page.locator('.el-popover').last().innerText().catch(() => '')
    assert(popText.includes('该模块下有主机不可删除'), `删除守卫 tooltip 不符: ${popText}`)
    await page.locator('.el-popover').last().locator('.tips-link').click()
    await page.waitForFunction(() => window.location.hash.includes('keyword=job-tpl'), null, { timeout: 8000 })
      .catch(() => { throw new Error(`跳转查看未带 keyword: ${page.url()}`) })
    checks.push('edit tree guards host-bound template and jumps topo with keyword')

    // 重新进入编辑页(查看详情)
    await gotoReload(page, `${BASE}/#/business/2/set/template`, { waitUntil: 'load' })
    await page.locator('.el-table__row').first().waitFor()
    await page.locator('.el-table__row').filter({ hasText: '集群模板A' }).getByRole('button', { name: '编辑' }).click()
    await page.waitForFunction(() => window.location.hash.includes('/set/template/edit/1'), null, { timeout: 8000 })
    await page.waitForTimeout(600)
    // 查看详情:分类 + 进程表
    const webChild = page.locator('.topo-child').filter({ hasText: 'web-tpl' })
    await webChild.hover()
    await webChild.locator('a.action-link').filter({ hasText: '查看详情' }).click()
    const infoDlg = page.locator('.el-dialog').filter({ hasText: '模板服务信息' })
    await infoDlg.waitFor()
    await page.waitForFunction(() => document.body.innerText.includes('服务分类：Web 服务 / Web'), null, { timeout: 5000 })
      .catch(() => { throw new Error(`查看详情分类未解析: ${(page.locator('.el-dialog').filter({ hasText: '模板服务信息' }).innerText().catch(() => '')).slice?.(0, 120) || ''}`) })
    const infoText = await infoDlg.innerText()
    assert(infoText.includes('【web-tpl】模板服务信息'), '查看详情标题不符')
    assert(infoText.includes('127.0.0.1:8080'), '查看详情进程绑定信息未渲染')
    await infoDlg.getByRole('button', { name: '关闭', exact: true }).click().catch(() => {})
    await page.keyboard.press('Escape')
    checks.push('tree view-detail dialog shows category and process bind info')

    // 离开确认:改名 → 保存解锁 → 取消触发离开确认,确认离开后返回列表
    await page.locator('.name-input input').fill('集群模板B')
    assert(await saveBtn.isEnabled(), '变更后保存按钮仍禁用')
    await page.getByRole('button', { name: '取消' }).click()
    const leaveBox = page.locator('.leave-confirm-dialog')
    await leaveBox.waitFor()
    assert((await leaveBox.innerText()).includes('确认离开当前页？') && (await leaveBox.innerText()).includes('离开将会导致未保存信息丢失'), '离开确认文案不符')
    await leaveBox.getByRole('button', { name: '离开' }).click()
    await page.waitForFunction(() => !window.location.hash.includes('/edit/1'), null, { timeout: 8000 })
      .catch(() => { throw new Error(`离开未返回: ${page.url()}`) })
    await page.waitForFunction(() => !window.location.hash.includes('/edit/1'), null, { timeout: 8000 })
      .catch(() => { throw new Error(`离开未返回: ${page.url()}`) })
    // 二次进入验证「取消」留在编辑页(真实路由)
    await gotoReload(page, `${BASE}/#/business/2/set/template`, { waitUntil: 'load' })
    await page.locator('.el-table__row').first().waitFor()
    await page.locator('.el-table__row').filter({ hasText: '集群模板A' }).getByRole('button', { name: '编辑' }).click()
    await page.waitForFunction(() => window.location.hash.includes('/set/template/edit/1'), null, { timeout: 8000 })
    await page.waitForTimeout(800)
    await page.locator('.name-input input').fill('集群模板C')
    await page.getByRole('button', { name: '取消' }).click()
    await page.locator('.leave-confirm-dialog').waitFor()
    await page.locator('.leave-confirm-dialog').getByRole('button', { name: '取消' }).click()
    await page.waitForTimeout(500)
    assert(page.url().includes('/edit/1'), `留在编辑页失败: ${page.url()}`)
    checks.push('edit dirty gating toggles save and leave confirm blocks navigation')

    // 6. 实例 tab:服务端排序 + 轮询 updateStatusData 契约 + 勾选保留
    await gotoReload(page, `${BASE}/#/business/2/set/template/details/1?tab=instance`, { waitUntil: 'load' })
    await page.locator('.el-table__row').first().waitFor()
    const sortCalls = records.syncStatusBodies.length
    await page.locator('.el-table__header th').filter({ hasText: '上次同步时间' }).click()
    await waitForRecord(() => records.syncStatusBodies.length > sortCalls && records.syncStatusBodies.at(-1).page?.sort === 'last_time',
      `排序请求不符: ${JSON.stringify(records.syncStatusBodies.at(-1))}`)
    // 选中 need_sync 行(executing/finished 行不可选)
    const row32 = page.locator('.el-table__row').filter({ hasText: '集群32' })
    await row32.locator('.el-checkbox').click()
    await page.waitForFunction(() => document.querySelectorAll('.el-table__body .el-checkbox.is-checked').length === 1, null, { timeout: 5000 })
      .catch(() => { throw new Error('勾选未生效') })
    // 轮询(updateStatusData 契约):5s 内第二次请求 page.start=0 且带 bk_set_ids
    await waitForRecord(() => {
      const body = records.syncStatusBodies.at(-1)
      return body.page?.start === 0 && JSON.stringify(body.bk_set_ids) === '[31,32]'
    }, `轮询请求不符 updateStatusData 契约: ${JSON.stringify(records.syncStatusBodies.at(-1))}`, 9000)
    assert(await page.locator('.el-table__body .el-checkbox.is-checked').count() === 1, '轮询后勾选丢失')
    checks.push('instance tab sorts server-side and polling keeps selection via updateStatusData')

    // 7. 批量同步走 sessionStorage setSyncIdMap(URL 不带 sets)
    await page.locator('button').filter({ hasText: '批量同步' }).click()
    await page.waitForFunction(() => window.location.hash.includes('/set/sync/1'), null, { timeout: 8000 })
      .catch(() => { throw new Error(`未进入同步页: ${page.url()}`) })
    assert(!page.url().includes('sets='), `同步页 URL 不应带 sets: ${page.url()}`)
    const storedMap = await page.evaluate(() => JSON.parse(sessionStorage.getItem('setSyncIdMap') || '{}'))
    assert(JSON.stringify(storedMap['2_1']) === '[32]', `sessionStorage setSyncIdMap 不符: ${JSON.stringify(storedMap)}`)
    await page.locator('.title').waitFor()
    // 初始化异步完成前 title 会先渲染批量 0 态,等待单个标题出现
    await page.waitForFunction(() => document.body.innerText.includes('请确认实例更改信息：'), null, { timeout: 6000 })
      .catch(() => { throw new Error(`单个同步标题不符: ${(page.locator('.title').innerText().catch(() => '')).slice(0, 60)}`) })
    assert(await page.locator('.set-head').count() === 0, '单个同步不应渲染折叠头')
    // 被移除模块含主机提示可跳转
    await page.locator('.remove-tip').waitFor()
    const tipText = await page.locator('.remove-tip').innerText()
    assert(tipText.includes('不可同步，模块存在主机') && tipText.includes('跳转查看'), `移除模块提示不符: ${tipText}`)
    await page.locator('.remove-tip .view-btn').click()
    await page.waitForFunction(() => window.location.hash.includes('node=module-601'), null, { timeout: 8000 })
      .catch(() => { throw new Error(`跳转查看未定位模块节点: ${page.url()}`) })
    checks.push('single sync reads sessionStorage map, hides collapse head, links module topo')

    // 8. 批量同步:多标题 + 移除后转单个 + 确认同步成功文案
    await gotoReload(page, `${BASE}/#/business/2/set/sync/1?sets=31,32`, { waitUntil: 'load' })
    await page.locator('.title').waitFor()
    await page.waitForTimeout(600)
    assert((await page.locator('.title').innerText()).includes('请确认以下 2 个实例更改信息：'), '批量同步标题不符')
    assert(await page.locator('.set-head').count() === 2, '批量同步应渲染折叠头')
    const removeBtn32 = page.locator('.set-head').filter({ hasText: '集群32' }).locator('.remove-btn')
    await removeBtn32.scrollIntoViewIfNeeded()
    await removeBtn32.click({ force: true })
    await page.waitForFunction(() => document.body.innerText.includes('请确认实例更改信息：'), null, { timeout: 5000 })
      .catch(() => { throw new Error('移除后未转为单个同步标题') })
    await page.getByRole('button', { name: '确认同步' }).click()
    await waitForRecord(() => records.syncSubmitBodies.length === 1 && JSON.stringify(records.syncSubmitBodies[0].bk_set_ids) === '[31]',
      `同步 payload 不符: ${JSON.stringify(records.syncSubmitBodies)}`)
    await page.waitForFunction(() => document.body.innerText.includes('提交同步成功，请等待执行完成'), null, { timeout: 6000 })
      .catch(() => { throw new Error('成功文案不符') })
    checks.push('batch sync title/mode switch and sync submit copy aligned')

    // 9. 同步历史:同步时间列服务端排序
    await gotoReload(page, `${BASE}/#/business/2/set/instance/history/1`, { waitUntil: 'load' })
    await page.locator('.el-table__row').first().waitFor()
    await page.locator('.el-table__header th').filter({ hasText: '同步时间' }).click()
    await page.locator('.el-table__header th').filter({ hasText: '同步时间' }).click()
    await waitForRecord(() => records.historyBodies.at(-1)?.page?.sort === '-last_time',
      `历史排序请求不符: ${JSON.stringify(records.historyBodies.at(-1))}`)
    checks.push('sync history sorts last_time server-side')

    // 10. 集群模板列表:排序/搜索落 URL,应用数量列跳过服务端排序
    await gotoReload(page, `${BASE}/#/business/2/set/template`, { waitUntil: 'load' })
    await page.locator('.el-table__row').first().waitFor()
    await page.locator('.el-table__header th').filter({ hasText: '修改时间' }).click()
    await page.locator('.el-table__header th').filter({ hasText: '修改时间' }).click()
    await waitForRecord(() => records.setListBodies.at(-1)?.page?.sort === '-last_time', '列表排序请求不符')
    await waitForRecord(() => hashQuery(page).get('sort') === '-last_time', `排序未落 URL: ${page.url()}`)
    await page.locator('.filter-bar input').fill('A')
    await page.keyboard.press('Enter')
    await waitForRecord(() => hashQuery(page).get('searchName') === 'A', '搜索未落 URL')
    checks.push('set template list sorts/searches through URL with server request')

    // 11. 详情属性保存成功提示内嵌「同步功能」链接,点击切实例 tab
    await gotoReload(page, `${BASE}/#/business/2/set/template/details/1`, { waitUntil: 'load' })
    await page.locator('.grid-item').filter({ hasText: '集群描述' }).waitFor()
    const propArea = page.locator('.grid-item').filter({ hasText: '集群描述' })
    await propArea.hover()
    await propArea.locator('.property-edit-button').first().click()
    await propArea.locator('input').fill('hello-x')
    await propArea.getByRole('button', { name: '保存' }).click()
    await page.waitForFunction(() => document.body.innerText.includes('成功更新模板，您可以通过'), null, { timeout: 6000 })
      .catch(() => { throw new Error('属性保存成功提示未出现') })
    const msgLink = page.locator('.el-message').getByText('同步功能')
    assert(await msgLink.count() === 1, '成功提示缺同步功能链接')
    await msgLink.click()
    await page.waitForFunction(() => window.location.hash.includes('tab=instance'), null, { timeout: 6000 })
      .catch(() => { throw new Error(`同步功能未切实例 tab: ${page.url()}`) })
    checks.push('property save tips embeds sync link switching to instance tab')

    // 12. 名称行内编辑校验:必填/utf8 字节超长报错并停留编辑态,合法值保存
    await gotoReload(page, `${BASE}/#/business/2/set/template/details/1`, { waitUntil: 'load' })
    await page.locator('.grid-item').filter({ hasText: '模板名称' }).waitFor()
    const nameArea = page.locator('.grid-item').filter({ hasText: '模板名称' })
    await nameArea.hover()
    await nameArea.locator('.property-edit-button').first().click()
    await nameArea.locator('input').fill('')
    await nameArea.locator('input').blur()
    await page.waitForFunction(() => document.body.innerText.includes('请输入模板名称'), null, { timeout: 5000 })
      .catch(() => { throw new Error('名称必填校验未生效') })
    await nameArea.locator('input').fill('集'.repeat(130))
    await nameArea.locator('input').blur()
    await page.waitForFunction(() => document.body.innerText.includes('长度不能超过256'), null, { timeout: 5000 })
      .catch(() => { throw new Error('名称长度校验未生效') })
    await nameArea.locator('input').fill('集群模板B')
    await nameArea.locator('input').blur()
    await page.waitForFunction(() => {
      const item = document.querySelector('.grid-item')
      return item && item.innerText.includes('集群模板B')
    }, null, { timeout: 5000 })
      .catch(() => { throw new Error('合法名称未保存回显') })
    checks.push('inline name edit validates required and byte length before save')

    // 13. 实例空态分型:筛选态带清除筛选,默认态引导业务拓扑
    records.emptyInstance = true
    await gotoReload(page, `${BASE}/#/business/2/set/template/details/1?tab=instance`, { waitUntil: 'load' })
    await page.waitForFunction(() => document.body.innerText.includes('暂无模板实例，请前往'), null, { timeout: 6000 })
      .catch(() => { throw new Error('默认空态未引导业务拓扑') })
    await page.getByPlaceholder('请输入集群名称搜索').fill('nomatch')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.body.innerText.includes('清除筛选'), null, { timeout: 6000 })
      .catch(() => { throw new Error('筛选空态未带清除筛选') })
    await page.locator('.instance-empty').getByRole('button', { name: '清除筛选' }).click()
    await page.waitForFunction(() => document.body.innerText.includes('暂无模板实例，请前往'), null, { timeout: 6000 })
      .catch(() => { throw new Error('清除筛选未回到默认空态') })
    await page.locator('.instance-empty .empty-link').click()
    await page.waitForFunction(() => window.location.hash.includes('/business/2/index'), null, { timeout: 6000 })
      .catch(() => { throw new Error(`业务拓扑跳转失败: ${page.url()}`) })
    checks.push('instance empty state splits default/search with business topo link')

    await page.screenshot({ path: `${SHOTS}/m4-i-set-template.png`, timeout: 20000, animations: 'disabled' })
    const realErrors = records.errors.filter((entry) => !/favicon|ResizeObserver/.test(entry))
    assert(realErrors.length === 0, `页面产生运行时错误: ${realErrors.slice(0, 3).join(' | ')}`)
  } finally {
    await context.close()
    await browser.close()
  }

  fs.writeFileSync(REPORT, `${JSON.stringify({
    schemaVersion: 1,
    reportKind: 'ui-v3-m4-set-template-mock',
    status: 'passed',
    screenshotDir: SHOTS,
    checks,
    requestCounts: {
      create: records.createBodies.length,
      hostCount: records.hostCountBodies.length,
      syncStatus: records.syncStatusBodies.length,
      syncSubmit: records.syncSubmitBodies.length
    },
    externalDependencies: 'mock-only'
  }, null, 2)}\n`)
  console.log(`M4-I set template mock contract passed (${checks.length} checks)`)
  process.exit(process.exitCode || 0)
}

run().catch((error) => {
  console.error(`✗ M4-I set template: ${error.message}`)
  process.exitCode = 1
})
