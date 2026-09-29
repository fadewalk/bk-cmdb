// M4-E: business topology "add host" entry contract (legacy host-list-options handleAddHost + HostSelector).
const fs = require('fs')
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const REPORT = process.env.UI_V3_M4_ADDHOST_REPORT || '/tmp/ui-v3-m4-add-host.json'
const SHOTS = process.env.UI_V3_M4_ADDHOST_SHOTS || '/tmp/ui-v3-m4-addhost-shots'
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

function hashPath(page) {
  const hash = new URL(page.url()).hash.replace(/^#/, '')
  return hash.split('?')[0]
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

const MODULE_HOSTS = [
  { host: { bk_host_id: 103, bk_host_innerip: '10.0.0.3', bk_host_name: 'idle-host' }, set: [{ bk_set_id: 1, bk_set_name: '空闲机池' }], module: [{ bk_module_id: 21, bk_module_name: 'Web Module', default: 1 }] }
]

function makeRecords() {
  return { hostBodies: [], previewBodies: [], executeBodies: [], errors: [] }
}

function attachObservers(page, records) {
  page.on('pageerror', (error) => records.errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') records.errors.push(`console.error: ${message.text()}`)
  })
}

async function installM4AddHost(page, records) {
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    return route.continue({ headers })
  })
  await page.route('**/api/v3/**', (route) => json(route, ok({})))
  await page.route('**/userinfo', (route) => json(route, ok({ username: 'm4e', chname: 'M4E', current_supplier: '0' })))
  await page.route('**/api/v3/biz/search/0', (route) => json(route, ok({ count: 1, info: [{ bk_biz_id: 2, bk_biz_name: 'Mock Business' }] })))
  await page.route('**/api/v3/findmany/biz_set', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/usercustom/user/search', (route) => json(route, ok({})))
  await page.route('**/api/v3/usercustom', (route) => json(route, ok({})))
  await page.route('**/api/v3/find/classificationobject', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/object', (route) => json(route, ok([])))
  await page.route(/\/api\/v3\/find\/topoinst_with_statistics\/biz\/2(?:\?.*)?$/, (route) => json(route, ok([
    { bk_obj_id: 'biz', bk_inst_id: 2, bk_inst_name: 'Mock Business', child: [
      { bk_obj_id: 'set', bk_inst_id: 10, bk_inst_name: 'Applications', child: [
        { bk_obj_id: 'module', bk_inst_id: 21, bk_inst_name: 'Web Module', child: [] },
        { bk_obj_id: 'module', bk_inst_id: 22, bk_inst_name: 'Database Module', child: [] }
      ] }
    ] }
  ])))
  await page.route('**/api/v3/topo/internal/0/2/with_statistics', (route) => json(route, ok({
    bk_set_id: 1, bk_set_name: '空闲机池', default: 1,
    module: [{ bk_module_id: 2, bk_module_name: '空闲机模块', default: 1 }]
  })))
  await page.route('**/api/v3/findmany/hosts/search/with_biz', async (route) => {
    const body = route.request().postDataJSON() || {}
    records.hostBodies.push(body)
    const moduleCondition = (body.condition || []).find((c) => c.bk_obj_id === 'module')?.condition?.[0]
    if (moduleCondition?.value === 21) return json(route, ok({ count: MODULE_HOSTS.length, info: MODULE_HOSTS }))
    return json(route, ok({ count: 0, info: [] }))
  })
  await page.route(/\/api\/v3\/host\/transfer_with_auto_clear_service_instance\/bk_biz_id\/2\/preview$/, async (route) => {
    records.previewBodies.push(route.request().postDataJSON() || {})
    return json(route, ok([
      {
        bk_host_id: 103,
        final_modules: [21],
        to_add_to_modules: [{ bk_module_id: 21, service_template: null }],
        to_remove_from_modules: [],
        host_apply_plan: { bk_host_id: 103, conflicts: [], update_fields: [], unresolved_conflict_count: 0 }
      }
    ]))
  })
  await page.route(/\/api\/v3\/host\/transfer_with_auto_clear_service_instance\/bk_biz_id\/2$/, async (route) => {
    records.executeBodies.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  await page.route('**/api/v3/hosts/app/*/list_hosts', (route) => json(route, ok({ count: 1, info: [{ bk_host_id: 103, bk_host_innerip: '10.0.0.3' }] })))
  await page.route('**/api/v3/find/topopath/biz/*', (route) => json(route, ok({ nodes: [] })))
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)

  const records = makeRecords()
  attachObservers(page, records)
  await installM4AddHost(page, records)

  const checks = []
  try {
    await page.goto(`${BASE}/#/business/2/index`, { waitUntil: 'load' })
    await page.locator('[data-testid="business-topology-host-table"]').waitFor()
    await page.waitForTimeout(400)

    // 1. 门禁:普通模块可用,空闲模块禁用(老版 isNormalModuleNode)
    const addBtn = page.getByTestId('business-topology-add-host')
    await page.locator('[data-node-id="module-21"]').click()
    await page.waitForTimeout(300)
    assert(await addBtn.isEnabled(), '普通模块节点未启用新增主机按钮')
    await page.locator('[data-node-id="module-2"]').click()
    await page.waitForTimeout(300)
    assert(await addBtn.isDisabled(), '空闲机模块节点不应启用新增主机按钮')
    checks.push('add-host button gated to normal module nodes')

    // 2. 选择器:源模块树 → with_biz 模块条件查询 → 多选 → 确定跳 type=add 预览页
    await page.locator('[data-node-id="module-21"]').click()
    await addBtn.click()
    const dialog = page.locator('[data-testid="business-topology-add-host-dialog"]')
    await dialog.waitFor()
    await dialog.locator('.add-host-module').filter({ hasText: 'Web Module' }).click()
    await waitForRecord(() => {
      const condition = records.hostBodies.at(-1)?.condition?.find((c) => c.bk_obj_id === 'module')?.condition?.[0]
      return condition?.field === 'bk_module_id' && condition?.operator === '$eq' && condition?.value === 21
    }, `选择器主机查询未按模块条件: ${JSON.stringify(records.hostBodies.at(-1))}`)
    const row = dialog.locator('[data-testid="add-host-table"] tbody tr').filter({ hasText: '10.0.0.3' })
    await row.locator('.el-checkbox').first().click()
    await dialog.getByRole('button', { name: '确定' }).click()
    await waitForRecord(() => hashPath(page).includes('/business/2/host/transfer/add'), '确定后未跳 type=add 预览页')
    const q = hashQuery(page)
    assert(q.get('sourceModel') === 'module' && q.get('sourceId') === '21'
      && q.get('targetModules') === '21' && q.get('resources') === '103' && q.get('node') === 'module-21',
      `add 预览页 query 不符合老版契约: ${q.toString()}`)
    checks.push('selector posts module condition and redirects to type=add with legacy query')

    // 3. type=add 预览:is_remove_from_all=false + add_to_modules=目标模块
    await waitForRecord(() => records.previewBodies.length > 0, 'add 预览未请求')
    const preview = records.previewBodies.at(-1)
    assert(preview?.bk_host_ids?.[0] === 103 && preview.is_remove_from_all === false && preview.add_to_modules?.[0] === 21,
      `add 预览 payload 不符合契约: ${JSON.stringify(preview)}`)
    assert(await page.locator('[data-testid="transfer-create-entry"]').first().isVisible(), 'add 预览未渲染新增服务实例 tab')
    await page.screenshot({ path: `${SHOTS}/m4-e-add-host.png`, timeout: 20000, animations: 'disabled' })
    checks.push('type=add preview posts increment payload with target module')

    const realErrors = records.errors.filter((entry) => !/favicon|ResizeObserver/.test(entry))
    assert(realErrors.length === 0, `页面产生运行时错误: ${realErrors.slice(0, 3).join(' | ')}`)
  } finally {
    await context.close()
    await browser.close()
  }

  fs.writeFileSync(REPORT, `${JSON.stringify({
    schemaVersion: 1,
    reportKind: 'ui-v3-m4-add-host-mock',
    status: 'passed',
    screenshotDir: SHOTS,
    checks,
    requestCounts: { hostQueries: records.hostBodies.length, preview: records.previewBodies.length, execute: records.executeBodies.length },
    externalDependencies: 'mock-only'
  }, null, 2)}\n`)
  console.log(`M4-E add host mock contract passed (${checks.length} checks)`)
}

run().catch((error) => {
  console.error(`✗ M4-E add host: ${error.message}`)
  process.exitCode = 1
})
