const { chromium } = require('./browser.cjs')
const fs = require('fs')
const { makeM2State, installCommon, installInstanceRoutes } = require('./fixtures/model-m2.cjs')
const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const REPORT = process.env.UI_V3_M2_INSTANCE_REPORT || '/tmp/ui-v3-m2-instance-association.json'
function assert(condition, message) { if (!condition) throw new Error(message) }

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  const state = makeM2State()
  const records = {
    usercustom: [], topologyUpdates: [], assocTypeQueries: [], assocTypeCounts: [], assocTypeCreates: [], assocTypeUpdates: [], assocTypeDeletes: [],
    assocQueries: [], assocCreates: [], assocUpdates: [], assocDeletes: [], instanceQueries: [], instanceCreates: [], instanceDeletes: [], targetQueries: [], instanceListQueries: []
  }
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await installCommon(page, state, records)
  installInstanceRoutes(page, state, records)
  try {
    await page.goto(`${BASE}/#/resource/instance/server?instId=1001&tab=association`, { waitUntil: 'load' })
    await page.waitForTimeout(700)
    assert(await page.locator('.inst-page').isVisible(), '实例列表页面未渲染')
    await page.waitForTimeout(500)
    assert(records.instanceQueries.some((q) => q.objId === 'server' && q.instId === 1001), '实例关联查询 URL 契约缺失')
    assert(await page.locator('[data-testid="instance-association-toolbar"]').isVisible(), '关联工具栏未渲染')
    assert(await page.locator('[data-testid="instance-association-table"]').isVisible(), '关联列表未渲染')
    assert((await page.locator('[data-testid="instance-association-table"]').textContent()).includes('路由器 A'), 'src 方向对端实例缺失')
    console.log('✓ M2 实例关联深链/src 方向列表')

    await page.getByText('拓扑', { exact: true }).click()
    assert(await page.locator('.assoc-topo').isVisible(), '实例关联拓扑视图未渲染')
    console.log('✓ M2 实例关联列表/拓扑切换')

    await page.getByText('列表', { exact: true }).click()
    await page.getByRole('button', { name: '新增关联' }).click()
    const assocDialog = page.locator('.el-dialog:visible').filter({ hasText: '新增关联' })
    await assocDialog.locator('.el-select').first().click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: /连接/ }).last().click()
    const targetSelect = assocDialog.locator('.el-select').nth(1)
    await targetSelect.click()
    const targetInput = targetSelect.locator('input.el-select__input')
    await targetInput.fill('路由器')
    await page.waitForTimeout(300)
    const visibleDropdown = page.locator('.el-select-dropdown:visible').last()
    const dropdownText = await visibleDropdown.textContent()
    assert(dropdownText.includes('路由器 B'), `目标实例搜索结果缺失: ${dropdownText}; requests=${JSON.stringify(records.targetQueries)}`)
    const targetOption = visibleDropdown.locator('li').filter({ hasText: '路由器 B' }).last()
    await targetOption.click({ force: true })
    await assocDialog.getByRole('button', { name: '提交' }).click()
    await page.waitForTimeout(500)
    assert(records.instanceCreates.some((body) => body.bk_inst_id === 1001 && body.bk_asst_inst_id === 2002), 'src 方向创建 payload 不符合契约')
    assert(records.instanceQueries.some((q) => q.instId === 1001), '创建后实例关联未读回')
    console.log('✓ M2 实例关联创建 payload + read-back')

    const cancel = page.locator('[data-testid="instance-association-table"] .el-button').filter({ hasText: '取消关联' }).first()
    await cancel.click()
    await page.locator('.el-message-box .el-button--primary').click()
    await page.waitForTimeout(500)
    assert(records.instanceDeletes.length >= 1, '实例关联取消 DELETE 缺失')
    console.log('✓ M2 实例关联取消 + read-back')
  } finally {
    const realErrors = errors.filter((e) => !/favicon|logo\.svg|ResizeObserver/.test(e))
    if (realErrors.length) throw new Error(realErrors.slice(0, 3).join(' | '))
    await context.close()
    await browser.close()
  }
  fs.writeFileSync(REPORT, `${JSON.stringify({ schemaVersion: 1, reportKind: 'ui-v3-m2-instance-association-mock', status: 'passed', checks: ['deep-link/src-dst list', 'list/topology switch', 'create payload/readback', 'delete/readback'], externalDependencies: 'mock-only' }, null, 2)}\n`)
  console.log('M2 instance association mock contract passed')
}
run().catch((e) => { console.error(`✗ M2 instance association: ${e.message}`); process.exitCode = 1 })
