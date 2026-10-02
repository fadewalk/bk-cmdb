// M4-F: business topology host filter query + favorites contract (legacy FilterStore + hosts/favorites).
const fs = require('fs')
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const REPORT = process.env.UI_V3_M4_FILTER_REPORT || '/tmp/ui-v3-m4-topo-filter.json'
const SHOTS = process.env.UI_V3_M4_FILTER_SHOTS || '/tmp/ui-v3-m4-filter-shots'
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

function clone(value) {
  return JSON.parse(JSON.stringify(value))
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

const HOST_ROWS = [
  { host: { bk_host_id: 201, bk_host_innerip: '10.1.0.1', bk_host_name: 'db-01', bk_os_name: 'linux' }, set: [{ bk_set_id: 10, bk_set_name: 'Applications' }], module: [{ bk_module_id: 22, bk_module_name: 'Database Module', default: 0 }] },
  { host: { bk_host_id: 202, bk_host_innerip: '10.1.0.2', bk_host_name: 'web-01', bk_os_name: 'windows' }, set: [{ bk_set_id: 10, bk_set_name: 'Applications' }], module: [{ bk_module_id: 21, bk_module_name: 'Web Module', default: 0 }] }
]

const ATTRS = [
  { id: 301, bk_obj_id: 'host', bk_property_id: 'bk_host_innerip', bk_property_name: '内网IP', bk_property_type: 'singlechar', bk_property_index: 1, ispre: true },
  { id: 302, bk_obj_id: 'host', bk_property_id: 'bk_os_name', bk_property_name: '操作系统名称', bk_property_type: 'singlechar', bk_property_index: 2, ispre: true },
  { id: 303, bk_obj_id: 'host', bk_property_id: 'bk_host_name', bk_property_name: '主机名称', bk_property_type: 'singlechar', bk_property_index: 3, ispre: true },
  { id: 304, bk_obj_id: 'set', bk_property_id: 'bk_set_name', bk_property_name: '集群名', bk_property_type: 'singlechar', bk_property_index: 4, ispre: true },
  { id: 305, bk_obj_id: 'module', bk_property_id: 'bk_module_name', bk_property_name: '模块名', bk_property_type: 'singlechar', bk_property_index: 5, ispre: true },
  { id: 306, bk_obj_id: 'biz', bk_property_id: 'bk_biz_name', bk_property_name: '业务名', bk_property_type: 'singlechar', bk_property_index: 6, ispre: true }
]

function makeRecords() {
  return { hostBodies: [], favoriteBodies: [], favoriteDeletes: [], errors: [] }
}

function attachObservers(page, records) {
  page.on('pageerror', (error) => records.errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') records.errors.push(`console.error: ${message.text()}`)
  })
}

async function installM4Filter(page, records) {
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    return route.continue({ headers })
  })
  await page.route('**/api/v3/**', (route) => json(route, ok({})))
  await page.route('**/userinfo', (route) => json(route, ok({ username: 'm4f', chname: 'M4F', current_supplier: '0' })))
  await page.route('**/api/v3/biz/search/0', (route) => json(route, ok({ count: 1, info: [{ bk_biz_id: 2, bk_biz_name: 'Mock Business' }] })))
  await page.route('**/api/v3/findmany/biz_set', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/usercustom/user/search', (route) => json(route, ok({})))
  await page.route('**/api/v3/usercustom', (route) => json(route, ok({})))
  await page.route('**/api/v3/find/classificationobject', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/object', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/objectattr/web', (route) => json(route, ok(ATTRS)))
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
    const osRule = (body.condition || []).find((c) => c.bk_obj_id === 'host')?.condition
      ?.find((rule) => rule.field === 'bk_os_name')
    if (osRule) return json(route, ok({ count: 1, info: [HOST_ROWS[0]] }))
    return json(route, ok({ count: HOST_ROWS.length, info: HOST_ROWS }))
  })
  await page.route('**/api/v3/hosts/favorites/search', (route) => json(route, ok({ count: records.favoriteList?.length || 0, info: clone(records.favoriteList || []) })))
  await page.route('**/api/v3/hosts/favorites', async (route) => {
    const body = route.request().postDataJSON() || {}
    records.favoriteBodies.push(body)
    records.favoriteList = [...(records.favoriteList || []), { id: 77, name: body.name, info: body.info, query_params: body.query_params }]
    return json(route, ok({ id: 77 }))
  })
  await page.route(/\/api\/v3\/hosts\/favorites\/\d+$/, async (route) => {
    if (route.request().method() === 'DELETE') {
      records.favoriteDeletes.push(Number(route.request().url().split('/').pop()))
      records.favoriteList = (records.favoriteList || []).filter((item) => item.id !== Number(route.request().url().split('/').pop()))
      return json(route, ok(null))
    }
    return json(route, ok(null))
  })
  await page.route('**/api/v3/findmany/proc/service_instance/labels/aggregation', (route) => json(route, ok({})))
  await page.route('**/api/v3/findmany/proc/service_instance', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/count/service_instance/processes', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/objectattgroup/object/biz', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/objectattr', (route) => json(route, ok([])))
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)

  const records = makeRecords()
  attachObservers(page, records)
  await installM4Filter(page, records)

  const checks = []
  try {
    await page.goto(`${BASE}/#/business/2/index?tab=hostList&node=module-21`, { waitUntil: 'load' })
    await page.locator('[data-testid="business-topology-host-table"]').waitFor()
    await page.waitForTimeout(400)

    // 1. 高级筛选:添加操作系统条件 → filter query + host.condition 规则
    await page.getByTestId('business-topology-filter').click()
    const drawer = page.locator('.advanced-host-filter')
    await drawer.waitFor()
    await drawer.locator('.field-picker').click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: '操作系统名称' }).last().click()
    const osRow = drawer.locator('.filter-item').filter({ hasText: '操作系统名称' })
    const valueSelect = osRow.locator('.item-value').last()
    await valueSelect.click()
    const valueInput = valueSelect.locator('input').last()
    await valueInput.pressSequentially('linux', { delay: 30 })
    await valueInput.press('Enter')
    try {
      await valueSelect.locator('.el-tag').first().waitFor({ timeout: 3000 })
    } catch (error) {
      const rowText = await osRow.innerText().catch(() => '(row gone)')
      throw new Error(`tag 未创建; row=${rowText.slice(0, 200)}`)
    }
    await drawer.getByRole('button', { name: '查询' }).click()
    await waitForRecord(() => hashQuery(page).get('filter') === 'bk_os_name.in=linux', `filter query 未按老版契约写入: ${hashQuery(page).toString()}`)
    await waitForRecord(() => {
      const rules = records.hostBodies.at(-1)?.condition?.find((c) => c.bk_obj_id === 'host')?.condition || []
      const rule = rules.find((item) => item.field === 'bk_os_name')
      return rule?.operator === '$in' && JSON.stringify(rule?.value) === JSON.stringify(['linux'])
    }, `host.condition 规则未注入: ${JSON.stringify(records.hostBodies.at(-1))}`)
    checks.push('advanced filter writes legacy filter query and host condition rule')

    // 2. 深链恢复:带 filter query 进入,条件回填并注入请求
    await page.goto(`${BASE}/#/business/2/index?tab=hostList&node=module-21&filter=bk_os_name.in%3Dlinux`, { waitUntil: 'load' })
    await page.locator('[data-testid="business-topology-host-table"]').waitFor()
    await waitForRecord(() => {
      const rules = records.hostBodies.at(-1)?.condition?.find((c) => c.bk_obj_id === 'host')?.condition || []
      return rules.some((item) => item.field === 'bk_os_name' && JSON.stringify(item.value) === JSON.stringify(['linux']))
    }, '深链 filter 未还原为请求条件')
    checks.push('filter query deep link restores request condition')

    // 3. 收藏:保存 → hosts/favorites POST;应用 → 条件+IP 还原;删除 → DELETE
    await page.getByTestId('business-topology-save-favorite').click()
    const promptBox = page.locator('.el-message-box')
    await promptBox.waitFor()
    await promptBox.locator('.el-input__inner').fill('linux 主机')
    await promptBox.getByRole('button', { name: '确定' }).click()
    await waitForRecord(() => {
      const body = records.favoriteBodies.at(-1)
      return body?.bk_biz_id === 2 && body?.name === 'linux 主机' && typeof body?.query_params === 'string' && typeof body?.info === 'string'
    }, `收藏 payload 不符合契约: ${JSON.stringify(records.favoriteBodies.at(-1))}`)
    checks.push('favorite posts hosts/favorites with serialized info/query_params')

    await page.goto(`${BASE}/#/business/2/index?tab=hostList&node=module-21`, { waitUntil: 'load' })
    await page.locator('[data-testid="business-topology-host-table"]').waitFor()
    await page.getByTestId('business-topology-favorites').click()
    const item = page.locator('[data-testid="business-topology-favorite-item"]:visible').filter({ hasText: 'linux 主机' })
    await item.waitFor()
    await item.click()
    await page.waitForTimeout(300)
    await waitForRecord(() => {
      const rules = records.hostBodies.at(-1)?.condition?.find((c) => c.bk_obj_id === 'host')?.condition || []
      return rules.some((r) => r.field === 'bk_os_name' && JSON.stringify(r.value) === JSON.stringify(['linux']))
    }, '应用收藏后未注入条件')
    await waitForRecord(() => hashQuery(page).get('filter') === 'bk_os_name.in=linux', '应用收藏后 URL 未写入 filter')
    checks.push('applied favorite restores conditions into query and request')

    await page.getByTestId('business-topology-favorites').click()
    await item.getByRole('button', { name: '删除' }).click()
    await waitForRecord(() => records.favoriteDeletes.includes(77), '删除收藏未调用 DELETE')
        checks.push('favorite delete calls DELETE endpoint')

    await page.screenshot({ path: `${SHOTS}/m4-f-topo-filter.png`, timeout: 20000, animations: 'disabled' })
    const realErrors = records.errors.filter((entry) => !/favicon|ResizeObserver/.test(entry))
    assert(realErrors.length === 0, `页面产生运行时错误: ${realErrors.slice(0, 3).join(' | ')}`)
  } finally {
    await context.close()
    await browser.close()
  }

  fs.writeFileSync(REPORT, `${JSON.stringify({
    schemaVersion: 1,
    reportKind: 'ui-v3-m4-topo-filter-mock',
    status: 'passed',
    screenshotDir: SHOTS,
    checks,
    requestCounts: { hostQueries: records.hostBodies.length, favoriteCreates: records.favoriteBodies.length, favoriteDeletes: records.favoriteDeletes.length },
    externalDependencies: 'mock-only'
  }, null, 2)}\n`)
  console.log(`M4-F topo filter mock contract passed (${checks.length} checks)`)
  process.exit(process.exitCode || 0)
}

run().catch((error) => {
  console.error(`✗ M4-F topo filter: ${error.message}`)
  process.exitCode = 1
})
