// M4-D: transfer preview page conflict-handling contract (legacy host-operation/index.vue + children).
const fs = require('fs')
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const REPORT = process.env.UI_V3_M4_PREVIEW_REPORT || '/tmp/ui-v3-m4-transfer-preview.json'
const SHOTS = process.env.UI_V3_M4_PREVIEW_SHOTS || '/tmp/ui-v3-m4-preview-shots'
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

async function waitForRecord(predicate, message, timeout = 6000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(message)
}

const PREVIEW_PLANS = {
  101: [{
    bk_host_id: 101,
    final_modules: [22],
    to_add_to_modules: [{
      bk_module_id: 22,
      service_template: {
        service_template: { id: 7, bk_biz_id: 2 },
        process_templates: [{
          process_template_id: 71,
          property: {
            bk_func_name: { value: 'java' },
            bk_process_name: { value: 'java' },
            bind_info: { value: [{ ip: { value: '1' }, port: { value: '8080' }, row_id: { value: 1 } }] }
          }
        }]
      }
    }],
    to_remove_from_modules: [],
    host_apply_plan: {
      bk_host_id: 101,
      conflicts: [{
        bk_attribute_id: 55, bk_property_id: 'bk_cpu', bk_property_value: 4,
        host_apply_rules: [
          { id: 901, bk_attribute_id: 55, bk_property_value: 8, bk_module_id: 22 },
          { id: 902, bk_attribute_id: 55, bk_property_value: 16, bk_module_id: 23 }
        ]
      }],
      update_fields: [{ bk_attribute_id: 55, bk_property_id: 'bk_cpu', bk_property_value: 8 }],
      unresolved_conflict_count: 1
    }
  }],
  105: [{
    bk_host_id: 105,
    final_modules: [23],
    to_add_to_modules: [{ bk_module_id: 23, service_template: null }],
    to_remove_from_modules: [],
    host_apply_plan: { bk_host_id: 105, conflicts: [], update_fields: [], unresolved_conflict_count: 0 }
  }]
}

// 部署态 8090 上 hash 差异 goto 为同文档导航(组件不重挂),统一 goto+reload 保证深链重解析
async function gotoReload(page, url, options) {
  await page.goto(url, options)
  await page.reload({ waitUntil: 'load' }).catch(() => {})
}

function makeRecords() {
  return { previewBodies: [], executeBodies: [], errors: [] }
}

function attachObservers(page, records) {
  page.on('pageerror', (error) => records.errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') records.errors.push(`console.error: ${message.text()}`)
  })
}

async function installM4Preview(page, records) {
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    return route.continue({ headers })
  })
  await page.route('**/api/v3/**', (route) => json(route, ok({})))
  await page.route('**/userinfo', (route) => json(route, ok({ username: 'm4d', chname: 'M4D', current_supplier: '0' })))
  await page.route('**/api/v3/biz/search/0', (route) => json(route, ok({ count: 1, info: [{ bk_biz_id: 2, bk_biz_name: 'Mock Business' }] })))
  await page.route('**/api/v3/findmany/biz_set', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/usercustom/user/search', (route) => json(route, ok({})))
  await page.route('**/api/v3/usercustom', (route) => json(route, ok({})))
  await page.route('**/api/v3/find/classificationobject', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/object', (route) => json(route, ok([])))
  await page.route('**/api/v3/hosts/app/*/list_hosts', (route) => json(route, ok({ count: 2, info: [
    { bk_host_id: 101, bk_host_innerip: '10.0.0.1', bk_host_name: 'host-101' },
    { bk_host_id: 105, bk_host_innerip: '10.0.0.5', bk_host_name: 'host-105' }
  ] })))
  await page.route('**/api/v3/find/topopath/biz/*', (route) => json(route, ok({ nodes: [] })))
  await page.route(/\/api\/v3\/host\/transfer_with_auto_clear_service_instance\/bk_biz_id\/2\/preview$/, async (route) => {
    const body = route.request().postDataJSON() || {}
    records.previewBodies.push(body)
    const hostId = (body.bk_host_ids || [])[0]
    return json(route, ok(PREVIEW_PLANS[hostId] || []))
  })
  await page.route(/\/api\/v3\/host\/transfer_with_auto_clear_service_instance\/bk_biz_id\/2$/, async (route) => {
    records.executeBodies.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  await page.route('**/api/v3/find/objectattr', (route) => json(route, ok([
    { id: 55, bk_obj_id: 'host', bk_property_id: 'bk_cpu', bk_property_name: 'CPU', bk_property_type: 'int' }
  ])))
}

async function fillProcessDialog(page, name, port) {
  const dialog = page.locator('.el-dialog').filter({ hasText: '添加进程' }).or(page.locator('.el-dialog').filter({ hasText: '编辑进程' }))
  await dialog.waitFor()
  await dialog.getByPlaceholder('如 java / nginx').fill(name)
  await dialog.getByPlaceholder('如 8080,多个用逗号分隔').fill(port)
  await dialog.getByRole('button', { name: '保存' }).click()
  await page.waitForTimeout(300)
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)

  const records = makeRecords()
  attachObservers(page, records)
  await installM4Preview(page, records)

  const checks = []
  try {
    // 1. 模板实例:预览渲染模板进程行 + unconfirmed 红标
    await gotoReload(page, `${BASE}/#/business/2/host/transfer/business?resources=101&targetModules=22`, { waitUntil: 'load' })
    const entry = page.locator('[data-testid="transfer-create-entry"]').first()
    await entry.waitFor()
    assert((await entry.textContent()).includes('java'), '模板进程行未渲染 bk_func_name=java')
    const applyTab = page.locator('.tab-head li').filter({ hasText: '属性自动应用' })
    assert((await applyTab.locator('.tab-count').getAttribute('class')).includes('unconfirmed'), '未访问 tab 缺少 unconfirmed 红标')
    checks.push('preview renders template process rows and unconfirmed badges')

    // 2. 编辑模板进程 → updated payload;冲突规则默认第一条 → final_rules
    await entry.getByRole('button', { name: '编辑' }).click()
    await fillProcessDialog(page, 'python', '9090')
    const entryText = await entry.innerText().catch(() => '(entry gone)')
    const dialogCount = await page.locator('.el-dialog:visible').count()
    assert(entryText.includes('python'), `编辑后进程行未更新为 python; entry=${entryText.slice(0, 300)}; visibleDialogs=${dialogCount}; errors=${JSON.stringify(records.errors.slice(-3))}`)
    await applyTab.click()
    assert(await page.locator('[data-testid="transfer-apply-panel"]').isVisible(), '属性自动应用面板未显示')
    assert(await page.locator('[data-testid="transfer-apply-panel"]').textContent().then((t) => t.includes('是将把转移的主机更新为目标模块配置')), '更新选项 radio 文案缺失')
    await page.getByRole('button', { name: '确认转移' }).click()
    await waitForRecord(() => records.executeBodies.length > 0, '确认转移未提交执行接口')
    const executed = records.executeBodies.at(-1)
    const svcOptions = executed.options?.service_instance_options
    const applyRule = executed.options?.host_apply_trans_rule
    assert(Array.isArray(svcOptions?.created) && svcOptions.created.length === 0, `模板默认不应产生 created: ${JSON.stringify(svcOptions)}`)
    const updatedRow = svcOptions?.updated?.[0]
    assert(updatedRow?.bk_module_id === 22 && updatedRow?.bk_host_id === 101
      && updatedRow.processes?.[0]?.process_template_id === 71
      && updatedRow.processes?.[0]?.process_info?.bk_func_name === 'python', `updated payload 不符合契约: ${JSON.stringify(svcOptions)}`)
    assert(applyRule?.changed === true && applyRule.final_rules?.[0]?.id === 901
      && applyRule.final_rules?.[0]?.bk_attribute_id === 55
      && applyRule.final_rules?.[0]?.bk_property_value === 8, `final_rules 不符合契约: ${JSON.stringify(applyRule)}`)
    checks.push('edited template process posts updated; conflict rule defaults to first rule')

    // 3. 更新选项=否:changed false 且不带 final_rules
    await gotoReload(page, `${BASE}/#/business/2/host/transfer/business?resources=101&targetModules=22`, { waitUntil: 'load' })
    await page.locator('.tab-head li').filter({ hasText: '属性自动应用' }).click()
    await page.locator('[data-testid="transfer-apply-panel"]').getByText('否将保留主机原有配置').click()
    await page.getByRole('button', { name: '确认转移' }).click()
    await waitForRecord(() => records.executeBodies.length > 1, '第二次确认未提交')
    const keepRule = records.executeBodies.at(-1).options?.host_apply_trans_rule
    assert(keepRule?.changed === false && !('final_rules' in (keepRule || {})), `changed=false payload 不符合契约: ${JSON.stringify(keepRule)}`)
    checks.push('keep-host-option posts changed:false without final_rules')

    // 4. 无模板实例:添加进程 → created 带 processes;无 apply tab 时不带 host_apply_trans_rule
    await gotoReload(page, `${BASE}/#/business/2/host/transfer/business?resources=105&targetModules=23`, { waitUntil: 'load' })
    const plainEntry = page.locator('[data-testid="transfer-create-entry"]').first()
    await plainEntry.waitFor()
    assert((await plainEntry.textContent()).includes('(未添加进程)'), '无模板实例未显示空进程提示')
    await plainEntry.getByRole('button', { name: '添加进程' }).click()
    await fillProcessDialog(page, 'nginx', '80')
    await page.screenshot({ path: `${SHOTS}/m4-d-transfer-preview.png`, timeout: 20000, animations: 'disabled' })
    await page.getByRole('button', { name: '确认转移' }).click()
    await waitForRecord(() => records.executeBodies.length > 2, '无模板确认未提交')
    const plainExecuted = records.executeBodies.at(-1)
    const plainSvc = plainExecuted.options?.service_instance_options
    const plainCreated = plainSvc?.created?.[0]
    assert(plainCreated?.bk_module_id === 23 && plainCreated?.bk_host_id === 105
      && plainCreated.processes?.[0]?.process_info?.bk_func_name === 'nginx'
      && plainCreated.processes?.[0]?.process_info?.port === '80'
      && !('process_template_id' in (plainCreated.processes?.[0] || {})), `created payload 不符合契约: ${JSON.stringify(plainSvc)}`)
    assert(!('host_apply_trans_rule' in (plainExecuted.options || {})), '无 apply tab 不应附带 host_apply_trans_rule')
    checks.push('non-template added process posts created with process_info')

    const realErrors = records.errors.filter((entry) => !/favicon|ResizeObserver/.test(entry))
    assert(realErrors.length === 0, `页面产生运行时错误: ${realErrors.slice(0, 3).join(' | ')}`)
  } finally {
    await context.close()
    await browser.close()
  }

  fs.writeFileSync(REPORT, `${JSON.stringify({
    schemaVersion: 1,
    reportKind: 'ui-v3-m4-transfer-preview-mock',
    status: 'passed',
    screenshotDir: SHOTS,
    checks,
    requestCounts: { preview: records.previewBodies.length, execute: records.executeBodies.length },
    externalDependencies: 'mock-only'
  }, null, 2)}\n`)
  console.log(`M4-D transfer preview mock contract passed (${checks.length} checks)`)
  // Playwright 清理偶发挂起,报告已落盘后显式退出
  process.exit(process.exitCode || 0)
}

run().catch((error) => {
  console.error(`✗ M4-D transfer preview: ${error.message}`)
  process.exitCode = 1
})
