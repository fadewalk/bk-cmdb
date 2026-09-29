// M4-G: topology node statistics contract (legacy getTopoStatistics / find/topoinstnode/host_serviceinst_count).
const fs = require('fs')
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const REPORT = process.env.UI_V3_M4_STATS_REPORT || '/tmp/ui-v3-m4-node-stats.json'
const SHOTS = process.env.UI_V3_M4_STATS_SHOTS || '/tmp/ui-v3-m4-stats-shots'
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

// 统计源:模块 21→3 台主机/2 实例,模块 22→1 台/0 实例,空闲模块 2→5 台/0 实例
const STATS = {
  'biz-2': { host_count: 9, service_instance_count: 2 },
  'set-1': { host_count: 5, service_instance_count: 0 },
  'module-2': { host_count: 5, service_instance_count: 0 },
  'set-10': { host_count: 4, service_instance_count: 2 },
  'module-21': { host_count: 3, service_instance_count: 2 },
  'module-22': { host_count: 1, service_instance_count: 0 }
}

function makeRecords() {
  return { statsBodies: [], errors: [] }
}

function attachObservers(page, records) {
  page.on('pageerror', (error) => records.errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') records.errors.push(`console.error: ${message.text()}`)
  })
}

async function installM4Stats(page, records) {
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    return route.continue({ headers })
  })
  await page.route('**/api/v3/**', (route) => json(route, ok({})))
  await page.route('**/userinfo', (route) => json(route, ok({ username: 'm4g', chname: 'M4G', current_supplier: '0' })))
  await page.route('**/api/v3/biz/search/0', (route) => json(route, ok({ count: 1, info: [{ bk_biz_id: 2, bk_biz_name: 'Mock Business' }] })))
  await page.route('**/api/v3/findmany/biz_set', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/usercustom/user/search', (route) => json(route, ok({})))
  await page.route('**/api/v3/usercustom', (route) => json(route, ok({})))
  await page.route('**/api/v3/hosts/favorites/search', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/find/objectattr/web', (route) => json(route, ok([])))
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
  await page.route(/\/api\/v3\/find\/topoinstnode\/host_serviceinst_count\/2$/, async (route) => {
    const body = route.request().postDataJSON() || {}
    records.statsBodies.push(body)
    const rows = (body.condition || []).map(({ bk_obj_id, bk_inst_id }) => ({
      bk_obj_id,
      bk_inst_id,
      ...(STATS[`${bk_obj_id}-${bk_inst_id}`] || { host_count: 0, service_instance_count: 0 })
    }))
    return json(route, ok(rows))
  })
  await page.route('**/api/v3/findmany/hosts/search/with_biz', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/findmany/proc/service_instance/labels/aggregation', (route) => json(route, ok({})))
  await page.route('**/api/v3/findmany/proc/service_instance', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/count/service_instance/processes', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/objectattgroup/object/biz', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/objectattr', (route) => json(route, ok([])))
}

function nodeText(t) { return String(t).replace(/\n/g, ' ') }

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)

  const records = makeRecords()
  attachObservers(page, records)
  await installM4Stats(page, records)

  const checks = []
  try {
    await page.goto(`${BASE}/#/business/2/index`, { waitUntil: 'load' })
    await page.locator('[data-node-id="module-21"]').waitFor()

    // 1. 统计请求:condition 含全部树节点(biz/set/module),按 {bk_obj_id,bk_inst_id} 形态
    await waitForRecord(() => records.statsBodies.length > 0, '未请求节点统计接口')
    const first = records.statsBodies[0]
    assert(Array.isArray(first.condition) && first.condition.length >= 6, `统计 condition 未覆盖全树: ${JSON.stringify(first)}`)
    assert(first.condition.every((item) => item.bk_obj_id && item.bk_inst_id !== undefined), `condition 形态不符合契约: ${JSON.stringify(first.condition)}`)
    const keys = first.condition.map((item) => `${item.bk_obj_id}-${item.bk_inst_id}`)
    assert(keys.includes('biz-2') && keys.includes('set-1') && keys.includes('module-21'), `condition 缺少根/空闲池/模块节点: ${keys.join(',')}`)
    checks.push('stats request covers all tree nodes with legacy condition shape')

    // 2. 渲染:host tab 显示 host_count,模块 21 显示 3
    try {
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-node-id="module-21"] .node-count')
        return el && el.textContent.trim() === '3'
      }, null, { timeout: 8000 })
    } catch {
      await page.waitForTimeout(800)
      const nodeHtml = await page.locator('[data-node-id="module-21"]').first().innerText().catch(() => '(gone)')
      const statsCount = records.statsBodies.length
      const lastCond = JSON.stringify(records.statsBodies.at(-1)?.condition || [])
      const allCounts = await page.locator('[data-node-id="module-21"] .node-count').allTextContents().catch(() => [])
      const elCount = await page.locator('[data-node-id="module-21"]').count()
      throw new Error(`模块 21 未渲染 host_count=3; node=${nodeText(nodeHtml)}; counts=${JSON.stringify(allCounts)}; wrappers=${elCount}; statsCalls=${statsCount}; cond=${lastCond}; errors=${JSON.stringify(records.errors.slice(-3))}`)
    }
    checks.push('host tab renders host_count from stats endpoint')

    // 3. serviceInstance tab 切换 nodeCountType:模块 21 显示 service_instance_count=2
    await page.getByRole('tab', { name: '服务实例' }).click()
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-node-id="module-21"] .node-count')
      return el && el.textContent.trim() === '2'
    }, null, { timeout: 8000 })
    checks.push('service instance tab switches node count type')

    await page.screenshot({ path: `${SHOTS}/m4-g-node-stats.png`, timeout: 20000, animations: 'disabled' })
    const realErrors = records.errors.filter((entry) => !/favicon|ResizeObserver/.test(entry))
    assert(realErrors.length === 0, `页面产生运行时错误: ${realErrors.slice(0, 3).join(' | ')}`)
  } finally {
    await context.close()
    await browser.close()
  }

  fs.writeFileSync(REPORT, `${JSON.stringify({
    schemaVersion: 1,
    reportKind: 'ui-v3-m4-node-stats-mock',
    status: 'passed',
    screenshotDir: SHOTS,
    checks,
    requestCounts: { stats: records.statsBodies.length },
    externalDependencies: 'mock-only'
  }, null, 2)}\n`)
  console.log(`M4-G node stats mock contract passed (${checks.length} checks)`)
  process.exit(process.exitCode || 0)
}

run().catch((error) => {
  console.error(`✗ M4-G node stats: ${error.message}`)
  process.exitCode = 1
})
