const { chromium } = require('./browser.cjs')
const { makeM2State, installCommon } = require('./fixtures/model-m2.cjs')
const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
function assert(condition, message) { if (!condition) throw new Error(message) }

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  const state = makeM2State()
  const records = { usercustom: [], topologyUpdates: [], assocTypeQueries: [], assocTypeCounts: [], assocTypeCreates: [], assocTypeUpdates: [], assocTypeDeletes: [], assocQueries: [], assocCreates: [], assocUpdates: [], assocDeletes: [], instanceQueries: [], instanceCreates: [], instanceDeletes: [], targetQueries: [], instanceListQueries: [] }
  await installCommon(page, state, records)
  try {
    await page.goto(`${BASE}/#/model/management/details/server?tab=association`, { waitUntil: 'load' })
    await page.waitForTimeout(700)
    assert(await page.getByRole('tab', { name: '模型关联' }).isVisible(), '模型关联 tab 未渲染')
    assert(await page.getByRole('button', { name: '新建关联' }).isVisible(), '模型关联缺少新建入口')
    await page.getByRole('button', { name: '新建关联' }).click()
    const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新建关联' })
    const selects = dialog.locator('.el-select')
    await selects.nth(1).click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: /路由器/ }).last().click()
    await selects.nth(2).click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: /连接/ }).last().click()
    await dialog.getByRole('button', { name: '提交' }).click()
    await page.waitForTimeout(500)
    const body = records.assocCreates.at(-1)
    assert(body?.bk_obj_id === 'server' && body?.bk_asst_obj_id === 'router', 'ModelDetail 新建关联源/目标 payload 错误')
    assert(body?.bk_obj_asst_id === 'server_connects_router', 'ModelDetail 新建关联别名 payload 错误')
    assert(state.associations.some((row) => row.bk_obj_asst_id === 'server_connects_router'), 'ModelDetail 关联创建未 read-back')
    console.log('M2 model detail association create mock contract passed')
  } finally {
    await context.close()
    await browser.close()
  }
})().catch((error) => { console.error(`✗ M2 model detail association: ${error.message}`); process.exitCode = 1 })
