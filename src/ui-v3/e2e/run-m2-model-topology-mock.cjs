const { chromium } = require('./browser.cjs')
const fs = require('fs')
const { makeM2State, installCommon, json } = require('./fixtures/model-m2.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const REPORT = process.env.UI_V3_M2_TOPOLOGY_REPORT || '/tmp/ui-v3-m2-topology.json'
const SHOTS = '/tmp/ui-v3-m2-shots'
fs.mkdirSync(SHOTS, { recursive: true })
function assert(condition, message) { if (!condition) throw new Error(message) }

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  const state = makeM2State()
  const records = {
    usercustom: [], topologyUpdates: [], assocTypeQueries: [], assocTypeCounts: [],
    assocTypeCreates: [], assocTypeUpdates: [], assocTypeDeletes: [], assocQueries: [],
    assocCreates: [], assocUpdates: [], assocDeletes: [], instanceQueries: [],
    instanceCreates: [], instanceDeletes: [], targetQueries: [], instanceListQueries: []
  }
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await installCommon(page, state, records)
  try {
    await page.goto(`${BASE}/#/model/topology`, { waitUntil: 'load' })
    await page.waitForTimeout(700)
    await page.waitForSelector('.topo-node[data-model-id="server"]', { state: 'visible', timeout: 8000 })
    await page.waitForFunction(() => document.querySelectorAll('.topo-edge').length > 0, null, { timeout: 8000 })
    assert(await page.locator('.topo-wrapper').isVisible(), '拓扑页面未渲染')
    assert(await page.locator('.topo-node[data-model-id="server"]').isVisible(), '自定义模型节点缺失')
    const edge = page.locator('.topo-edge').first()
    assert((await page.locator('.topo-edge').count()) > 0, '关联边缺失')
    assert((await edge.getAttribute('data-edge-key')).startsWith('e-'), '关联边 key 未生成')
    assert(records.assocQueries.some((body) => body.page?.limit === 2000 && body.condition?.$or), '关联初始化 payload 不符合契约')
    console.log('✓ M2 拓扑节点/边/初始化 payload')

    await page.locator('.topo-node[data-model-id="server"]').hover()
    await page.waitForTimeout(150)
    assert(await page.locator('.topo-edge.linked').count() === 1, '节点 hover 未高亮关联边')
    if ((await page.locator('.topo-edge').count()) > 1) assert(await page.locator('.topo-edge.dimmed').count() >= 1, '无关边未弱化')
    console.log('✓ M2 拓扑 hover linked/dimmed')

    await page.getByRole('button', { name: '编辑拓扑' }).click()
    const node = page.locator('.topo-node[data-model-id="server"]')
    const box = await node.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(500)
    assert(records.topologyUpdates.length >= 1, '拓扑拖拽未调用位置更新接口')
    assert(Array.isArray(records.topologyUpdates[0].origin) && records.topologyUpdates[0].origin[0].bk_obj_id === 'server', '位置更新 origin payload 不符合契约')
    console.log('✓ M2 拓扑拖拽 update/objecttopo origin payload')

    await page.locator('.topology-node-tooltips [title="新建关联"]').click()
    await page.waitForTimeout(250)
    const createDrawer = page.locator('.el-drawer').filter({ hasText: '新建关联' }).last()
    assert(await createDrawer.isVisible(), '拓扑新建关联抽屉未打开')
    const selects = createDrawer.locator('.el-select')
    await selects.nth(1).click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: /路由器/ }).last().click()
    await createDrawer.getByRole('button', { name: '提交' }).click()
    await page.waitForTimeout(400)
    assert(records.assocCreates.some((body) => body.bk_obj_id === 'server' && body.bk_asst_obj_id === 'router'), '拓扑关联创建 payload 不符合契约')
    assert(state.associations.some((row) => row.bk_obj_id === 'server' && row.bk_asst_obj_id === 'router'), '拓扑关联创建未读回')
    console.log('✓ M2 拓扑关联创建 payload + read-back')

    await page.screenshot({ path: `${SHOTS}/m2-topology.png`, fullPage: true })
    const legacy = await context.newPage()
    await installCommon(legacy, state, records)
    await legacy.goto(`${BASE}/#/model/all/topology/new?tab=relations`, { waitUntil: 'load' })
    await legacy.waitForTimeout(300)
    assert(legacy.url().includes('/model/topology') && legacy.url().includes('tab=relations'), `拓扑 legacy redirect 未保留 query: ${legacy.url()}`)
    await legacy.close()

    const errorPage = await context.newPage()
    const errorState = makeM2State()
    const errorRecords = {
      usercustom: [], topologyUpdates: [], assocTypeQueries: [], assocTypeCounts: [], assocTypeCreates: [], assocTypeUpdates: [], assocTypeDeletes: [], assocQueries: [], assocCreates: [], assocUpdates: [], assocDeletes: [], instanceQueries: [], instanceCreates: [], instanceDeletes: [], targetQueries: [], instanceListQueries: []
    }
    await installCommon(errorPage, errorState, errorRecords, { failTopology: true })
    await errorPage.goto(`${BASE}/#/model/topology`, { waitUntil: 'load' })
    await errorPage.waitForTimeout(500)
    assert(await errorPage.locator('.topo-error').isVisible(), '拓扑加载失败未显示错误态')
    await errorPage.locator('.topo-error').getByRole('button', { name: '重试' }).click()
    await errorPage.waitForTimeout(500)
    assert(!(await errorPage.locator('.topo-error').isVisible()), '拓扑重试后仍显示错误态')
    await errorPage.close()
    console.log('✓ M2 拓扑错误态 + 重试')
  } finally {
    const realErrors = errors.filter((e) => !/favicon|logo\.svg|ResizeObserver/.test(e))
    if (realErrors.length) throw new Error(realErrors.slice(0, 3).join(' | '))
    await context.close()
    await browser.close()
  }
  fs.writeFileSync(REPORT, `${JSON.stringify({ schemaVersion: 1, reportKind: 'ui-v3-m2-model-topology-mock', status: 'passed', screenshotDir: SHOTS, checks: ['topology init payload', 'edge linked/dimmed', 'position update origin', 'association create/readback', 'legacy query redirect'], externalDependencies: 'mock-only' }, null, 2)}\n`)
  console.log('M2 topology mock contract passed')
}
run().catch((e) => { console.error(`✗ M2 topology: ${e.message}`); process.exitCode = 1 })
