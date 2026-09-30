// M4-K: service template process form lock semantics + detail page contracts (legacy service-template/template-config + process-form).
const fs = require('fs')
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const REPORT = process.env.UI_V3_M4_PROCFORM_REPORT || '/tmp/ui-v3-m4-proc-form.json'
const SHOTS = process.env.UI_V3_M4_PROCFORM_SHOTS || '/tmp/ui-v3-m4-procform-shots'
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

async function waitMasksHidden(page, timeout = 6000) {
  // v-loading 遮罩会拦截坐标点击,等待全部隐藏(v-show display:none)
  await page.waitForFunction(() => [...document.querySelectorAll('.el-loading-mask')]
    .every((m) => getComputedStyle(m).display === 'none'), null, { timeout })
    .catch(() => {})
}

async function waitForRecord(predicate, message, timeout = 6000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(message)
}

// 进程模型属性(bind_info option 列:ip/port/protocol/enable;protocol 枚举含 v4 1/2 与 v6 3/4)
const PROCESS_ATTRS = [
  { id: 701, bk_property_id: 'bk_func_name', bk_property_name: '功能名称', bk_property_type: 'singlechar', isrequired: true, bk_property_index: 1, editable: true, bk_property_group: 'basic' },
  { id: 702, bk_property_id: 'bk_process_name', bk_property_name: '进程别名', bk_property_type: 'singlechar', bk_property_index: 2, editable: true, bk_property_group: 'basic' },
  { id: 703, bk_property_id: 'user', bk_property_name: '启动用户', bk_property_type: 'singlechar', bk_property_index: 3, editable: true, bk_property_group: 'manage' },
  { id: 704, bk_property_id: 'work_path', bk_property_name: '工作路径', bk_property_type: 'singlechar', bk_property_index: 4, editable: true, bk_property_group: 'manage' },
  { id: 705, bk_property_id: 'bk_start_param_regex', bk_property_name: '启动参数匹配规则', bk_property_type: 'singlechar', bk_property_index: 5, editable: true, bk_property_group: 'basic' },
  { id: 706, bk_property_id: 'bind_info', bk_property_name: '端口绑定', bk_property_type: 'table', bk_property_index: 6, bk_property_group: 'bind', option: [
    { bk_property_id: 'ip', bk_property_name: '监听IP', bk_property_type: 'enum' },
    { bk_property_id: 'port', bk_property_name: '端口', bk_property_type: 'int' },
    { bk_property_id: 'protocol', bk_property_name: '协议', bk_property_type: 'enum', option: [{ id: '1', name: 'TCP' }, { id: '2', name: 'UDP' }, { id: '3', name: 'TCP6' }, { id: '4', name: 'UDP6' }] },
    { bk_property_id: 'enable', bk_property_name: '启用', bk_property_type: 'bool' }
  ] }
]
const MODULE_ATTRS = [
  { id: 601, bk_property_id: 'capacity', bk_property_name: '容量', bk_property_type: 'int', editable: true }
]
const CATEGORIES = [
  { id: 5, name: 'Web 服务', bk_parent_id: 0 },
  { id: 501, name: 'Web', bk_parent_id: 5 },
  { id: 502, name: 'Middleware', bk_parent_id: 5 }
]
// 既有进程模板:user 字段解锁(as_default_value false),其余锁定
const PROC_ROW = {
  id: 801,
  service_template_id: 72,
  property: {
    bk_func_name: { value: 'svc-web', as_default_value: true },
    bk_process_name: { value: 'svc-web', as_default_value: true },
    user: { value: 'root', as_default_value: false },
    work_path: { value: '/data/svc', as_default_value: true },
    bk_start_param_regex: { value: '', as_default_value: true },
    bind_info: {
      value: [{ row_id: 1, ip: { value: '1', as_default_value: true }, port: { value: '8080', as_default_value: true }, protocol: { value: '1', as_default_value: true }, enable: { value: true, as_default_value: true } }],
      as_default_value: true
    }
  }
}

function makeRecords() {
  return {
    errors: [],
    createBodies: [],
    updateBodies: [],
    updateProcBodies: [],
    deleteProcBodies: [],
    procTemplateRequests: []
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
  await page.route('**/userinfo', (route) => json(route, ok({ username: 'm4k', chname: 'M4K', current_supplier: '0' })))
  await page.route('**/api/v3/biz/search/0', (route) => json(route, ok({ count: 1, info: [{ bk_biz_id: 2, bk_biz_name: 'Mock Business' }] })))
  await page.route('**/api/v3/findmany/biz_set', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/usercustom/user/search', (route) => json(route, ok({})))
  await page.route('**/api/v3/usercustom', (route) => json(route, ok({})))
  await page.route('**/api/v3/find/classificationobject', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/object', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/objectattr/web', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/objectattgroup/object/process', (route) => json(route, ok([
    { bk_group_id: 'basic', bk_group_name: '基础信息', bk_group_index: 0, is_collapse: false },
    { bk_group_id: 'bind', bk_group_name: '监听信息', bk_group_index: 1, is_collapse: false },
    { bk_group_id: 'manage', bk_group_name: '进程管理信息', bk_group_index: 2, is_collapse: true }
  ])))
  await page.route('**/api/v3/find/objectattr', (route) => {
    const body = route.request().postDataJSON() || {}
    if (body?.bk_obj_id === 'module') return json(route, ok(MODULE_ATTRS))
    if (body?.bk_obj_id === 'process') return json(route, ok(PROCESS_ATTRS))
    return json(route, ok([]))
  })
  await page.route('**/api/v3/findmany/proc/service_category/with_statistics', (route) => json(route, ok({ count: CATEGORIES.length, info: CATEGORIES })))
  await page.route('**/api/v3/findmany/proc/service_category', (route) => json(route, ok({ count: CATEGORIES.length, info: CATEGORIES })))
  // 服务模板详情(all_info)与同步状态
  await page.route('**/api/v3/find/proc/service_template/all_info', (route) => json(route, ok({
    id: 72, bk_biz_id: 2, name: 'svc-tpl', service_category_id: 501,
    attributes: [{ bk_attribute_id: 601, bk_property_value: 4 }],
    processes: []
  })))
  await page.route('**/api/v3/findmany/proc/service_template/sync_status/biz/2', (route) => json(route, ok({ service_templates: [] })))
  await page.route('**/api/v3/module/bk_biz_id/2/service_template_id/72', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/findmany/proc/service_template/count_info/**', (route) => json(route, ok([])))
  await page.route('**/api/v3/findmany/proc/service_template', (route) => json(route, ok({ count: 0, info: [] })))
  // 进程模板列表(既有一行,user 字段解锁)
  await page.route('**/api/v3/findmany/proc/proc_template', (route) => {
    records.procTemplateRequests.push(route.request().postDataJSON() || {})
    return json(route, ok({ count: 1, info: [PROC_ROW] }))
  })
  // 进程模板 CRUD
  await page.route('**/api/v3/createmany/proc/proc_template', (route) => {
    records.createBodies.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  await page.route('**/api/v3/update/proc/proc_template', (route) => {
    records.updateProcBodies.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  await page.route('**/api/v3/deletemany/proc/proc_template', (route) => {
    records.deleteProcBodies.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  // 服务模板基础字段更新(名称/分类)
  await page.route('**/api/v3/update/proc/service_template', (route) => {
    records.updateBodies.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
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
    await page.goto(`${BASE}/#/business/2/service/template/details/72`, { waitUntil: 'load' })
    // headless 下 dialog fade-leave 的 transitionend 可能永不触发,overlay 常驻拦截点击;
    // 零时长过渡让 Vue Transition 立即完成
    await page.addStyleTag({ content: '*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }' })
    await page.locator('.el-table__row').first().waitFor()

    // 1. 进程表 4 列契约(功能名称/进程别名/启动参数匹配规则/绑定信息) + 绑定信息 ip:port
    const headerText = await page.locator('.el-table__header').first().innerText()
    for (const col of ['功能名称', '进程别名', '启动参数匹配规则', '绑定信息']) {
      assert(headerText.includes(col), `进程表缺列: ${col}`)
    }
    assert((await page.locator('.el-table__row').first().innerText()).includes('127.0.0.1:8080'), '绑定信息未按 ip:port 渲染')
    checks.push('process table renders legacy four columns with bind info')

    // 2. 查看态:仅「关闭」按钮
    await page.locator('.el-table__row').first().getByRole('button', { name: '查看' }).click()
    const viewDlg = page.locator('.el-drawer').filter({ hasText: 'svc-web' })
    await viewDlg.waitFor()
    await viewDlg.locator('.el-drawer__footer').waitFor()
    // EP 头部 X 按钮的 aria-label 在 zh-CN 也是「关闭」,断言限定 footer
    assert(await viewDlg.locator('.el-drawer__footer').getByRole('button', { name: '关闭' }).count() === 1, '查看态缺关闭按钮')
    assert(await viewDlg.getByRole('button', { name: '保存' }).count() === 0, '查看态不应有保存按钮')
    await viewDlg.getByRole('button', { name: '关闭', exact: true }).click()
    await page.waitForTimeout(400)
    checks.push('view mode dialog shows close only')

    // 3. 新建进程:字段默认全锁(创建模式),bk_func_name 必填校验,bind_info ip 枚举含 IPv6
    await page.getByRole('button', { name: '新建进程' }).click()
    const createDlg = page.locator('.el-drawer').filter({ hasText: '添加进程' })
    await createDlg.waitFor()
    const lockCount = await createDlg.locator('.property-lock').count()
    assert(lockCount > 0, '新建进程未渲染锁控件')
    // 直接提交触发必填校验(老版 create 为提交按钮)
    await createDlg.getByRole('button', { name: '提交' }).click()
    await page.waitForFunction(() => document.body.innerText.includes('请输入功能名称'), null, { timeout: 5000 })
      .catch(() => { throw new Error('bk_func_name 必填校验未生效') })
    // bind_info ip 下拉含 IPv6 枚举
    await createDlg.locator('.el-table__row').first().locator('.el-select').first().click()
    await page.waitForTimeout(400)
    const ipDropText = await page.locator('.el-select-dropdown:visible').last().innerText()
    assert(ipDropText.includes('::1') && ipDropText.includes('第一外网IPv6'), `ip 枚举缺 IPv6 选项: ${ipDropText.replace(/\n/g, ',')}`)
    // ip 切到 v6 后 protocol 选项联动为 v6 集
    await page.locator('.el-select-dropdown:visible').last().getByText('::1').click()
    await createDlg.locator('.el-table__row').first().locator('.el-select').nth(1).click()
    await page.waitForTimeout(400)
    const protoDropText = await page.locator('.el-select-dropdown:visible').last().innerText()
    assert(protoDropText.includes('TCP6') && !/\bTCP\n/.test(protoDropText), `协议未联动 v6 选项: ${protoDropText.replace(/\n/g, ',')}`)
    await page.keyboard.press('Escape')
    checks.push('create form defaults locked, validates func name, ipv6 enum and protocol linkage')

    // 4. 创建提交 payload:全字段 as_default_value=true,bk_process_name 跟随
    await createDlg.locator('.pf-item').filter({ hasText: '功能名称' }).locator('input').fill('nginx')
    await createDlg.locator('.el-table__row').first().getByPlaceholder('请输入端口').fill('80')
    await createDlg.getByRole('button', { name: '提交' }).click()
    await waitForRecord(() => records.createBodies.length === 1, '创建进程请求未发出')
    const spec = records.createBodies[0]?.processes?.[0]?.spec || {}
    assert(spec.bk_func_name?.value === 'nginx' && spec.bk_func_name?.as_default_value === true, `bk_func_name 契约不符: ${JSON.stringify(spec.bk_func_name)}`)
    assert(spec.bk_process_name?.value === 'nginx' && spec.bk_process_name?.as_default_value === true, 'bk_process_name 未跟随且锁定')
    assert(spec.user?.as_default_value === true, '创建模式字段未默认锁定')
    assert(spec.bind_info?.as_default_value === true && spec.bind_info?.value?.[0]?.port?.value === '80', `bind_info 契约不符: ${JSON.stringify(spec.bind_info)}`)
    assert(records.createBodies[0].service_template_id === 72, '创建 payload 缺 service_template_id')
    checks.push('create posts spec with all fields locked and process name following func name')

    // 5. 编辑既有进程:bk_func_name 禁改;未变更保存禁用;解锁 user 改值 → 仅提交变更字段且 as_default_value=false
    await page.waitForFunction(() => document.body.innerText.includes('成功更新模板进程'), null, { timeout: 6000 })
      .catch(() => { throw new Error('创建成功提示未出现') })
    await waitMasksHidden(page)
    const procSection = page.locator('.detail-section').filter({ hasText: '服务进程' })
    const editBtn = procSection.locator('.el-table__row').first().getByRole('button', { name: '编辑' })
    await editBtn.click()
    const editDlg = page.locator('.el-drawer').filter({ hasText: 'svc-web' })
    await editDlg.waitFor()
    await page.waitForTimeout(400)
    const funcInput = editDlg.locator('.pf-item').filter({ hasText: '功能名称' }).locator('input')
    assert(await funcInput.isDisabled(), '编辑态 bk_func_name 未禁改')
    const saveBtn = editDlg.getByRole('button', { name: '确定' })
    assert(await saveBtn.isDisabled(), '编辑态未变更时确定按钮未禁用')
    // user 字段在「进程管理信息」组(is_collapse 默认折叠),先展开
    await editDlg.locator('.pf-group-header').filter({ hasText: '进程管理信息' }).click()
    await page.waitForTimeout(300)
    const userItem = editDlg.locator('.pf-item').filter({ hasText: '启动用户' })
    await userItem.locator('input').fill('www')
    await page.waitForTimeout(300)
    assert(await saveBtn.isEnabled(), '变更后确定按钮仍禁用')
    await saveBtn.click()
    await waitForRecord(() => records.updateProcBodies.length === 1, '更新进程请求未发出')
    const procProp = records.updateProcBodies[0]?.process_property || {}
    assert(records.updateProcBodies[0].process_template_id === 801, '更新 payload 缺 process_template_id')
    assert(procProp.user?.value === 'www' && procProp.user?.as_default_value === false, `变更字段契约不符: ${JSON.stringify(procProp.user)}`)
    assert(!('bk_func_name' in procProp) && !('bind_info' in procProp), `未变更字段不应提交: ${Object.keys(procProp).join(',')}`)
    checks.push('edit disables func name, gates save on change, submits only changed unlocked field')

    // 6. 删除进程:确认标题逐字
    await page.locator('.el-dialog').filter({ hasText: 'svc-web' }).waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
        await waitMasksHidden(page)
    await procSection.locator('.el-table__row').first().getByRole('button', { name: '删除' }).click()
    const delBox = page.locator('.el-message-box').filter({ hasText: '确认删除模板进程' })
    await delBox.waitFor()
    await delBox.getByRole('button', { name: '确定' }).click()
    await waitForRecord(() => records.deleteProcBodies.length === 1 && records.deleteProcBodies[0]?.process_templates?.[0] === 801,
      `删除 payload 不符: ${JSON.stringify(records.deleteProcBodies)}`)
    checks.push('delete process confirms with legacy title and payload')

    // 7. 名称行内编辑:二次确认 + PUT update/proc/service_template
    await waitMasksHidden(page)
    await page.waitForTimeout(300)
    const nameArea = page.locator('.detail-grid').filter({ hasText: '模板名称' })
    await nameArea.hover()
    await nameArea.locator('.property-edit-button').click()
    await nameArea.locator('input').fill('svc-tpl-new')
    await nameArea.locator('input').blur()
    const nameBox = page.locator('.el-message-box').filter({ hasText: '确认修改名称' })
    await nameBox.waitFor()
    assert((await nameBox.innerText()).includes('修改服务模板名称会立刻应用到所有的模块实例'), '名称确认提示文案不符')
    await nameBox.getByRole('button', { name: '确定' }).click()
    await waitForRecord(() => {
      const body = records.updateBodies.at(-1)
      return body?.name === 'svc-tpl-new' && body?.id === 72 && body?.bk_biz_id === 2
    }, `名称更新 payload 不符: ${JSON.stringify(records.updateBodies.at(-1))}`)
    checks.push('inline name edit confirms then puts update/proc/service_template')

    // 8. 分类行内编辑:二级变更即保存 + 文案「修改成功！服务分类调整后无需同步」
    const catArea = page.locator('.detail-grid').filter({ hasText: '服务分类' })
    await catArea.hover()
    await catArea.locator('.property-edit-button').click()
    await catArea.locator('.el-select').nth(1).click()
    await page.locator('.el-select-dropdown:visible').last().getByText('Middleware').click()
    await waitForRecord(() => {
      const body = records.updateBodies.at(-1)
      return body?.service_category_id === 502 && body?.id === 72
    }, `分类更新 payload 不符: ${JSON.stringify(records.updateBodies.at(-1))}`)
    await page.waitForFunction(() => document.body.innerText.includes('修改成功！服务分类调整后无需同步'), null, { timeout: 5000 })
      .catch(() => { throw new Error('分类成功文案不符') })
    checks.push('inline category edit saves on secondary change with legacy toast')

    // 9. 属性保存:成功提示内嵌「同步功能」链接,点击切实例 tab
    await page.waitForTimeout(800)
    const attrRow = page.locator('.attribute-row').filter({ hasText: '容量' })
    await attrRow.getByRole('button', { name: '编辑' }).click()
    await attrRow.locator('input').fill('8')
    await attrRow.getByRole('button', { name: '保存' }).click()
    await page.waitForFunction(() => document.body.innerText.includes('成功更新模板，您可以通过'), null, { timeout: 6000 })
      .catch(() => { throw new Error('属性保存提示未出现') })
    await page.locator('.el-message').last().getByText('同步功能').click()
    await page.waitForFunction(() => window.location.hash.includes('tab=instance'), null, { timeout: 6000 })
      .catch(() => { throw new Error(`同步功能未切实例 tab: ${page.url()}`) })
    checks.push('attribute save tips embeds sync link switching to instance tab')

    await page.screenshot({ path: `${SHOTS}/m4-k-svc-proc-form.png`, timeout: 20000, animations: 'disabled' })
    const realErrors = records.errors.filter((entry) => !/favicon|ResizeObserver/.test(entry))
    assert(realErrors.length === 0, `页面产生运行时错误: ${realErrors.slice(0, 3).join(' | ')}`)
  } finally {
    await context.close()
    await browser.close()
  }

  fs.writeFileSync(REPORT, `${JSON.stringify({
    schemaVersion: 1,
    reportKind: 'ui-v3-m4-svc-proc-form-mock',
    status: 'passed',
    screenshotDir: SHOTS,
    checks,
    requestCounts: {
      create: records.createBodies.length,
      updateProc: records.updateProcBodies.length,
      updateSvc: records.updateBodies.length,
      deleteProc: records.deleteProcBodies.length
    },
    externalDependencies: 'mock-only'
  }, null, 2)}\n`)
  console.log(`M4-K svc proc form mock contract passed (${checks.length} checks)`)
  process.exit(process.exitCode || 0)
}

run().catch((error) => {
  console.error(`✗ M4-K svc proc form: ${error.message}`)
  process.exitCode = 1
})
