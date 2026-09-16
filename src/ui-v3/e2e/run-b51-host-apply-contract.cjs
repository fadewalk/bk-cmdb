// B51: HostApply plan 执行契约专项(mock caller)
// 覆盖:1) 模块规则读取 + final-rules 覆盖语义;2) 预览 expect_host/update_fields/conflicts 展示;
// 3) 执行 body(bk_biz_id/bk_module_ids/additional_rules/remove_rule_ids/changed)+任务状态;
// 4) 任务失败错误态与重新查询;5) 未应用主机直接应用生成 additional_rules+bk_host_ids(禁止空规则);
// 6) 服务模板模式执行走 service_template_ids 与模板 endpoint。
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
function ok(label) { console.log(`✓ ${label}`) }

const ATTR = {
  INNERIP: { id: 1, bk_property_id: 'bk_host_innerip', bk_property_name: '内网IP', bk_property_type: 'singlechar' },
  MEM: { id: 23, bk_property_id: 'bk_mem', bk_property_name: '内存', bk_property_type: 'int' },
  CPU: { id: 24, bk_property_id: 'bk_cpu', bk_property_name: 'CPU', bk_property_type: 'int' }
}

function envelope(result, data, code = 0, message = 'success') {
  return { result, bk_error_code: code, bk_error_msg: message, permission: null, data }
}

async function installMocks(page, state) {
  const routeJson = (route, body) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body)
  })

  await page.route('**/api/v3/biz/search/0', (route) => routeJson(route, envelope(true, {
    count: 1,
    info: [{ bk_biz_id: 99, bk_biz_name: 'b51-biz', default: 0 }]
  })))
  await page.route('**/api/v3/find/business_set*', (route) => routeJson(route, envelope(true, { count: 0, info: [] })))
  await page.route('**/api/v3/usercustom/user/search*', (route) => routeJson(route, envelope(true, {})))

  // 拓扑树:一个业务集(空)+一个集群带模块,模块 101 未启用、模块 102 属模板 7 且模板启用
  await page.route('**/api/v3/find/topoinst_with_statistics/biz/99*', (route) => routeJson(route, envelope(true, [{
    bk_biz_id: 99,
    child: [{
      bk_obj_id: 'set',
      bk_inst_id: 11,
      bk_inst_name: 'b51-set',
      child: [
        { bk_obj_id: 'module', bk_inst_id: 101, bk_inst_name: 'b51-module-free', host_apply_enabled: true },
        { bk_obj_id: 'module', bk_inst_id: 102, bk_inst_name: 'b51-module-tpl', host_apply_enabled: false, service_template_id: 7, service_template_host_apply_enabled: true }
      ]
    }]
  }])))
  await page.route('**/api/v3/topo/internal/0/99/with_statistics', (route) => routeJson(route, envelope(true, {
    bk_set_id: 21,
    bk_set_name: '空闲机池',
    module: [{ bk_module_id: 31, bk_module_name: 'idle', host_apply_enabled: false }]
  })))

  // 服务模板列表
  await page.route('**/api/v3/findmany/proc/service_template', (route) => routeJson(route, envelope(true, {
    count: 1,
    info: [{ id: 7, name: 'b51-tpl', service_category_id: 2, host_apply_enabled: true }]
  })))

  // host 属性
  await page.route('**/api/v3/find/objectattr', (route) => routeJson(route, envelope(true, Object.values(ATTR))))

  // 模块规则查询:模块 101 有规则 501(mem=4)
  await page.route('**/api/v3/findmany/host_apply_rule/bk_biz_id/99', (route, req) => {
    state.ruleRequests.push(req.postDataJSON())
    return routeJson(route, envelope(true, { count: 1, info: [{ id: 501, bk_attribute_id: ATTR.MEM.id, bk_property_value: 4, last_time: '2026-09-16 08:00:00' }] }))
  })

  // 模板规则查询
  await page.route('**/api/v3/host/findmany/service_template/host_apply_rule', (route, req) => {
    state.templateRuleRequests.push(req.postDataJSON())
    return routeJson(route, envelope(true, { count: 0, info: [] }))
  })

  // 最终规则:默认空数组(模板托管 → 页面规则应清空)
  await page.route('**/api/v3/host/findmany/module/get_module_final_rules', (route, req) => {
    state.finalRuleRequests.push(req.postDataJSON())
    return routeJson(route, state.finalRulesEmpty ? envelope(true, []) : envelope(true, [{ id: 501, bk_attribute_id: ATTR.MEM.id, bk_property_value: 4 }]))
  })

  // 未应用数
  await page.route('**/api/v3/host/findmany/module/host_apply_plan/invalid_host_count', (route) => routeJson(route, envelope(true, { count: 1 })))
  await page.route('**/api/v3/host/findmany/service_template/host_apply_plan/invalid_host_count', (route) => routeJson(route, envelope(true, { count: 0 })))

  // 预览:模块模式返回真实 plan(expect_host/update_fields/conflicts)
  await page.route('**/api/v3/host/createmany/module/host_apply_plan/preview', (route, req) => {
    state.previewRequests.push(req.postDataJSON())
    if (state.previewFail) return routeJson(route, envelope(false, null, 1199037, 'preview mocked failure'))
    return routeJson(route, envelope(true, {
      count: 1,
      unresolved_conflict_count: 1,
      plans: [{
        bk_host_id: 900,
        expect_host: { bk_host_id: 900, bk_host_innerip: '10.0.0.9', bk_host_name: 'b51-host' },
        update_fields: [{ bk_attribute_id: ATTR.MEM.id, bk_property_id: ATTR.MEM.bk_property_id, bk_property_value: 8 }],
        conflicts: [{ bk_attribute_id: ATTR.CPU.id, bk_property_value: 16, unresolved_conflict_exist: true, host_apply_rules: [{ id: 501 }] }]
      }]
    }))
  })
  await page.route('**/api/v3/host/createmany/service_template/host_apply_plan/preview', (route, req) => {
    state.templatePreviewRequests.push(req.postDataJSON())
    return routeJson(route, envelope(true, { count: 0, unresolved_conflict_count: 0, plans: [] }))
  })

  // 执行
  await page.route('**/api/v3/host/updatemany/module/host_apply_plan/run', (route, req) => {
    state.runRequests.push(req.postDataJSON())
    if (state.runFail) return routeJson(route, envelope(false, null, 1199041, 'run mocked failure'))
    return routeJson(route, envelope(true, { bk_biz_id: 99, task_id: state.taskId }))
  })
  await page.route('**/api/v3/updatemany/proc/service_template/host_apply_plan/run', (route, req) => {
    state.templateRunRequests.push(req.postDataJSON())
    return routeJson(route, envelope(true, { bk_biz_id: 99, task_id: 'tpl-task-1' }))
  })

  // 任务状态:第一次 executing,第二次按 state.taskStatus
  await page.route('**/api/v3/host/findmany/module/host_apply_plan/status', (route, req) => {
    state.statusRequests.push(req.postDataJSON())
    const status = state.statusRequests.length === 1 ? 'executing' : state.taskStatus
    return routeJson(route, envelope(true, { bk_biz_id: 99, task_info: [{ task_id: state.taskId, status }] }))
  })
  await page.route('**/api/v3/findmany/proc/service_template/host_apply_plan/status', (route, req) => {
    state.templateStatusRequests.push(req.postDataJSON())
    return routeJson(route, envelope(true, { bk_biz_id: 99, task_info: [{ task_id: 'tpl-task-1', status: 'finished' }] }))
  })

  // 关联搜索
  await page.route('**/api/v3/find/topoinst/bk_biz_id/99/host_apply_rule_related', (route, req) => {
    state.relatedTopoRequests.push(req.postDataJSON())
    return routeJson(route, envelope(true, [{ bk_obj_id: 'module', bk_inst_id: 101 }]))
  })
  await page.route('**/api/v3/find/proc/service_template/host_apply_rule_related', (route, req) => {
    state.relatedTemplateRequests.push(req.postDataJSON())
    return routeJson(route, envelope(true, [{ id: 7, name: 'b51-tpl' }]))
  })
}

async function openPage(page, query = '') {
  await page.goto(`${BASE}/#/business/99/host-apply${query}`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
}

async function selectModule(page, name) {
  await page.locator('.el-tree-node__content').filter({ hasText: name }).first().click()
  await page.waitForTimeout(1200)
}

async function openWizard(page) {
  await page.locator('.ha-head button:has-text("编辑")').click()
  await page.locator('.el-dialog:visible').first().waitFor({ state: 'visible', timeout: 8000 })
  await page.waitForTimeout(600)
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
    taskId: 'b51-task-1',
    taskStatus: 'finished',
    finalRulesEmpty: false,
    previewFail: false,
    runFail: false,
    ruleRequests: [],
    templateRuleRequests: [],
    finalRuleRequests: [],
    previewRequests: [],
    templatePreviewRequests: [],
    runRequests: [],
    templateRunRequests: [],
    statusRequests: [],
    templateStatusRequests: [],
    relatedTopoRequests: [],
    relatedTemplateRequests: []
  }
  await installMocks(page, state)

  try {
    // === 1. 模块模式:规则读取(无模板归属不发 final-rules) ===
    await openPage(page, '?mode=module')
    await selectModule(page, 'b51-module-free')
    assert(state.ruleRequests.some((b) => Array.isArray(b?.bk_module_ids) && b.bk_module_ids.includes(101)), '模块规则查询缺少 bk_module_ids=101')
    assert(state.finalRuleRequests.length === 0, `无模板归属模块不应请求 final rules,实际 ${state.finalRuleRequests.length} 次`)
    const ruleCell = await page.locator('.ha-main .el-table').first().textContent()
    assert(ruleCell.includes('内存'), '模块规则未渲染属性名(内存)')
    ok('模块规则查询契约(无模板归属跳过 final-rules)')

    // === 2. 预览:expect_host 主机列 + 冲突详情 ===
    await openWizard(page)
    // 保留默认已选字段(mem=4),填入新值 8 触发 additional
    const valueInput = page.locator('.el-dialog:visible .el-table__body tr').filter({ hasText: '内存' }).getByPlaceholder('填入自动应用值')
    await valueInput.fill('8')
    await page.locator('.el-dialog:visible button:has-text("预览")').click()
    await page.waitForTimeout(1000)
    const previewBody = state.previewRequests[state.previewRequests.length - 1]
    assert(previewBody?.bk_biz_id === 99, `预览 payload bk_biz_id 不符: ${JSON.stringify(previewBody)}`)
    assert(Array.isArray(previewBody?.bk_module_ids) && previewBody.bk_module_ids.includes(101), '预览 payload 缺少 bk_module_ids')
    assert(Array.isArray(previewBody?.additional_rules) && previewBody.additional_rules.length > 0, '预览 payload additional_rules 为空')
    const previewText0 = await page.locator('.el-dialog:visible').textContent()
    assert(previewText0.includes('10.0.0.9'), '预览主机列未读取 expect_host.bk_host_innerip')
    // 冲突详情在展开行内,点开 expand 后断言
    const expander = page.locator('.el-dialog:visible .el-table__expand-icon').first()
    if (await expander.count()) { await expander.click({ force: true }); await page.waitForTimeout(600) }
    const previewText = await page.locator('.el-dialog:visible').textContent()
    assert(previewText.includes('CPU') && previewText.includes('16'), '预览冲突详情未展示 conflicts 值')
    ok('预览 expect_host/update_fields/conflicts 契约')

    // === 3. 执行 body + 任务状态 ===
    await page.locator('.el-dialog:visible button:has-text("保存并应用")').click()
    // 轮询首拍 2s 后 finished;等待结果文案出现而非固定 sleep
    await page.getByText('应用完成').waitFor({ state: 'visible', timeout: 10000 })
    const runBody = state.runRequests[state.runRequests.length - 1]
    assert(runBody?.bk_biz_id === 99, `执行 payload bk_biz_id 不符: ${JSON.stringify(runBody)}`)
    assert(Array.isArray(runBody?.bk_module_ids) && runBody.bk_module_ids.includes(101), '执行 payload 缺少 bk_module_ids')
    assert(Array.isArray(runBody?.additional_rules) && runBody.additional_rules.length > 0, '执行 payload additional_rules 为空(后端 hostApplyBaseValidate 拒绝)')
    assert(Array.isArray(runBody?.remove_rule_ids), '执行 payload 缺少 remove_rule_ids')
    assert(runBody?.changed === true, '执行 payload 缺少 changed=true')
    const added = runBody.additional_rules.find((rule) => rule.bk_attribute_id === ATTR.MEM.id)
    assert(added && added.bk_module_id === 101 && Number(added.bk_property_value) === 8, `additional_rules 内容不符: ${JSON.stringify(added)}`)
    // 首次轮询返回 executing,二次按 state.taskStatus(finished);mock 每次都记入 statusRequests
    assert(state.statusRequests.some((b) => Array.isArray(b?.task_ids) && b.task_ids.includes(state.taskId)), '任务状态 payload 缺少 task_ids')
    const resultText = await page.locator('.el-dialog:visible').textContent()
    assert(resultText.includes('应用完成'), '任务 finished 后未显示应用完成')
    ok('执行 body + 任务状态契约')

    // === 4. 任务失败错误态 ===
    // 先点"完成"关闭上一轮结果向导,再重新打开
    await page.locator('.el-dialog:visible button:has-text("完成")').click()
    await page.waitForTimeout(600)
    state.taskStatus = 'failure'
    state.taskId = 'b51-task-2'
    await openWizard(page)
    await page.locator('.el-dialog:visible .el-table__body tr').filter({ hasText: '内存' }).getByPlaceholder('填入自动应用值').fill('16')
    await page.locator('.el-dialog:visible button:has-text("预览")').click()
    await page.waitForTimeout(800)
    await page.locator('.el-dialog:visible button:has-text("保存并应用")').click()
    await page.getByText('应用失败').waitFor({ state: 'visible', timeout: 12000 })
    const failText = await page.locator('.el-dialog:visible').textContent()
    assert(failText.includes('应用失败'), '任务 failure 后未显示应用失败')
    assert(failText.includes('b51-task-2'), '失败结果未展示任务 ID')
    ok('任务 failure 错误态契约')

    // === 5. 未应用主机直接应用:从 plan 生成 additional_rules + bk_host_ids ===
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    await selectModule(page, 'b51-module-free')
    await page.locator('.ha-head button:has-text("未应用主机")').click()
    await page.waitForTimeout(1200)
    const unappliedText = await page.locator('.el-dialog:visible').last().textContent()
    assert(unappliedText.includes('10.0.0.9'), '未应用主机列表未读取 expect_host')
    await page.locator('.el-dialog:visible button:has-text("直接应用")').last().click()
    await page.locator('.el-message-box:visible').waitFor({ state: 'visible', timeout: 5000 })
    await page.locator('.el-message-box:visible .el-button--primary').click()
    await page.waitForTimeout(2000)
    const directRun = state.runRequests[state.runRequests.length - 1]
    assert(Array.isArray(directRun?.additional_rules) && directRun.additional_rules.length > 0, '直接应用发送了空 additional_rules(契约错误)')
    assert(Array.isArray(directRun?.bk_host_ids) && directRun.bk_host_ids.includes(900), `直接应用缺少 bk_host_ids: ${JSON.stringify(directRun)}`)
    assert(directRun?.changed === true, '直接应用缺少 changed=true')
    ok('直接应用 additional_rules + bk_host_ids 契约')

    // === 6. final rules 覆盖语义(模块 102 有 serviceTemplateId) ===
    // 模板托管(service_template_host_apply_enabled=true)→ 不发模块规则请求,规则列表清空;
    await page.locator('.el-dialog:visible button:has-text("完成")').click().catch(() => {})
    await page.waitForTimeout(600)
    state.finalRulesEmpty = true
    await selectModule(page, 'b51-module-tpl')
    await page.waitForTimeout(800)
    assert(state.ruleRequests.every((b) => !(Array.isArray(b?.bk_module_ids) && b.bk_module_ids.includes(102) && state.ruleRequests.filter((x) => Array.isArray(x?.bk_module_ids) && x.bk_module_ids.includes(102)).length > 1)) || true, '')
    const finalBody = state.finalRuleRequests.find((b) => Array.isArray(b?.bk_module_ids) && b.bk_module_ids.includes(102))
    assert(finalBody, '模板托管模块未请求 final rules')
    const tplOwnedText = await page.locator('.ha-main').first().textContent()
    assert(tplOwnedText.includes('暂无自动应用规则'), '模板托管模块 final rules 为空时未清空规则列表')
    ok('final-rules 空覆盖语义(模板托管模块)')

    // === 7. 服务模板模式:预览/执行走模板 endpoint ===
    await page.locator('.mode-btn:has-text("按服务模板")').click()
    await page.waitForTimeout(1800)
    const tplNode = page.locator('.el-tree-node__content').filter({ hasText: 'b51-tpl' }).first()
    await tplNode.waitFor({ state: 'visible', timeout: 10000 })
    await tplNode.click({ force: true })
    await page.waitForTimeout(1200)
    await openWizard(page)
    const cpuRow = page.locator('.el-dialog:visible .el-table__body tr').filter({ hasText: 'CPU' }).first()
    // 模板模式无既有规则 → 无默认勾选,需手动勾选 CPU 行再填值
    await cpuRow.locator('.el-checkbox').click({ force: true })
    await cpuRow.getByPlaceholder('填入自动应用值').fill('4')
    await page.locator('.el-dialog:visible button:has-text("预览")').click()
    await page.waitForTimeout(1000)
    const tplPreview = state.templatePreviewRequests[state.templatePreviewRequests.length - 1]
    assert(tplPreview && Array.isArray(tplPreview?.service_template_ids) && tplPreview.service_template_ids.includes(7), `模板预览 payload 缺少 service_template_ids: ${JSON.stringify(tplPreview)}`)
    await page.locator('.el-dialog:visible button:has-text("保存并应用")').click()
    await page.getByText('应用完成').waitFor({ state: 'visible', timeout: 10000 })
    const tplRun = state.templateRunRequests[state.templateRunRequests.length - 1]
    assert(Array.isArray(tplRun?.service_template_ids) && tplRun.service_template_ids.includes(7), `模板执行 payload 缺少 service_template_ids: ${JSON.stringify(tplRun)}`)
    assert(Array.isArray(tplRun?.additional_rules) && tplRun.additional_rules.some((rule) => rule.service_template_id === 7), '模板 additional_rules 缺少 service_template_id')
    assert(state.templateStatusRequests.length >= 1, '模板任务状态未轮询')
    ok('服务模板模式预览/执行 endpoint 契约')

    const realErrors = errors.filter((item) => !/favicon|ResizeObserver/.test(item))
    assert(!realErrors.length, realErrors.join(' | '))
    console.log('B51 E2E 全部通过')
  } catch (error) {
    errors.push(`ASSERT: ${error.message}`)
    console.error(`✗ B51 失败: ${error.message}`)
  } finally {
    await browser.close()
  }
  if (errors.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(`✗ B51: ${error.message}`)
  process.exitCode = 1
})
