const { chromium } = require('./browser.cjs')
const fs = require('fs')
const { makeM2State, installCommon } = require('./fixtures/model-m2.cjs')
const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const REPORT = process.env.UI_V3_M2_ASSOC_REPORT || '/tmp/ui-v3-m2-association-type.json'
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
    await page.goto(`${BASE}/#/model/association`, { waitUntil: 'load' })
    await page.waitForTimeout(600)
    assert(await page.locator('.association-page').isVisible(), '关联类型页面未渲染')
    assert(records.assocTypeQueries.some((body) => body.page?.sort === '-ispre'), '关联类型列表排序 payload 缺失')
    assert(records.assocTypeCounts.some((body) => body.asst_ids?.includes('connects')), '关联类型使用数请求缺失')
    console.log('✓ M2 关联类型列表/分页/使用数 payload')

    await page.getByRole('textbox', { name: '请输入关联类型名称' }).fill('[')
    await page.getByRole('textbox', { name: '请输入关联类型名称' }).press('Enter')
    await page.waitForTimeout(300)
    const lastQuery = records.assocTypeQueries.at(-1)
    assert(lastQuery.condition?.bk_asst_name?.$regex === '\\[', '关联类型搜索未转义正则字符')
    console.log('✓ M2 关联类型搜索正则转义')

    await page.getByRole('button', { name: '新建' }).click()
    const drawer = page.locator('.association-drawer')
    await drawer.locator('input').nth(0).fill('depends_on')
    await drawer.locator('input').nth(1).fill('依赖')
    await drawer.locator('input').nth(2).fill('依赖目标')
    await drawer.locator('input').nth(3).fill('被依赖')
    await drawer.getByRole('button', { name: '提交' }).click()
    await page.waitForTimeout(400)
    assert(records.assocTypeCreates[0]?.bk_asst_id === 'depends_on', '关联类型创建 payload 缺失')
    assert(state.relationTypes.some((row) => row.bk_asst_id === 'depends_on'), '关联类型创建未读回')
    console.log('✓ M2 关联类型创建 payload + read-back')

    const editable = page.locator('.relation-table .el-table__row').filter({ hasText: '依赖' })
    await editable.getByRole('button', { name: '编辑' }).click()
    const editDrawer = page.locator('.association-drawer')
    await editDrawer.locator('input').nth(1).fill('依赖关系')
    await editDrawer.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(400)
    assert(records.assocTypeUpdates[0]?.body?.bk_asst_id === undefined, '关联类型编辑不应修改 bk_asst_id')
    assert(records.assocTypeUpdates[0]?.body?.bk_asst_name === '依赖关系', '关联类型编辑 payload 不符合契约')
    console.log('✓ M2 关联类型编辑 payload')

    const builtin = page.locator('.relation-table .el-table__row').filter({ hasText: '主线' })
    assert(await builtin.locator('.disabled-action').count() >= 2, '内置关联类型保护缺失')
    await editable.getByRole('button', { name: '删除' }).click()
    await page.locator('.el-message-box .el-button--primary').click()
    await page.waitForTimeout(400)
    assert(records.assocTypeDeletes.length === 1, '关联类型删除请求缺失')
    assert(!state.relationTypes.some((row) => row.bk_asst_id === 'depends_on'), '关联类型删除未读回')
    console.log('✓ M2 关联类型删除 + 内置保护')

    const errorPage = await context.newPage()
    const errorState = makeM2State()
    const errorRecords = { usercustom: [], topologyUpdates: [], assocTypeQueries: [], assocTypeCounts: [], assocTypeCreates: [], assocTypeUpdates: [], assocTypeDeletes: [], assocQueries: [], assocCreates: [], assocUpdates: [], assocDeletes: [], instanceQueries: [], instanceCreates: [], instanceDeletes: [], targetQueries: [], instanceListQueries: [] }
    await installCommon(errorPage, errorState, errorRecords, { failAssocTypes: true })
    await errorPage.goto(`${BASE}/#/model/association`, { waitUntil: 'load' })
    await errorPage.waitForTimeout(500)
    assert(await errorPage.locator('.relation-error').isVisible(), '关联类型加载失败未显示错误态')
    await errorPage.locator('.relation-error').getByRole('button', { name: '重试' }).click()
    await errorPage.waitForTimeout(400)
    assert(!(await errorPage.locator('.relation-error').isVisible()), '关联类型重试后仍显示错误态')
    await errorPage.close()
    console.log('✓ M2 关联类型错误态 + 重试')
  } finally {
    const realErrors = errors.filter((e) => !/favicon|logo\.svg|ResizeObserver/.test(e))
    if (realErrors.length) throw new Error(realErrors.slice(0, 3).join(' | '))
    await context.close()
    await browser.close()
  }
  fs.writeFileSync(REPORT, `${JSON.stringify({ schemaVersion: 1, reportKind: 'ui-v3-m2-association-type-mock', status: 'passed', checks: ['list/sort/count', 'regex escaped search', 'create/readback', 'update payload', 'builtin protection', 'delete/readback'], externalDependencies: 'mock-only' }, null, 2)}\n`)
  console.log('M2 association type mock contract passed')
}
run().catch((e) => { console.error(`✗ M2 association type: ${e.message}`); process.exitCode = 1 })
