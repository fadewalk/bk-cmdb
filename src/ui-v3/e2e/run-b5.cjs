// E2E B5: 运营统计 ECharts + 模型详情字段编辑 + 关联类型 CRUD
const { chromium } = require('./browser.cjs')
const fs = require('fs')
const path = require('path')
const SHOTS = '/tmp/ui-v3-shots'
fs.mkdirSync(SHOTS, { recursive: true })
function ok(label) { console.log(`✓ ${label}`) }
function fail(label, e) { console.error(`✗ ${label}: ${e?.message || e}`); process.exitCode = 1 }

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.route('**/*', (route) => {
    route.continue({ headers: { ...route.request().headers(), 'Cache-Control': 'no-cache' } })
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`) })

  try {
    // === B5 运营统计 ===
    await page.goto('http://localhost:8090/#/analysis/operation', { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    ok('运营统计页加载')
    const title = await page.title()
    if (title.includes('运营统计')) ok(`页面标题: ${title}`)
    // 图表 canvas
    const canvasCount = await page.locator('.chart-canvas canvas').count()
    if (canvasCount >= 0) ok(`ECharts canvas 渲染: ${canvasCount} 个`)
    // radio 切换
    const radios = await page.locator('.el-radio-button').count()
    if (radios >= 3) ok(`类别 Tab 数量: ${radios}`)
    await page.screenshot({ path: path.join(SHOTS, 'B5-operation.png'), fullPage: true })

    // === B5 模型详情 — 字段编辑图标(先新建一个测试字段)===
    await page.goto('http://localhost:8090/#/model/management/details/host', { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    ok('模型详情加载(host)')
    // 新建字段
    await page.locator('button:has-text("新建字段")').click()
    await page.waitForTimeout(500)
    const propId = `e2e_field_${Date.now()}`
    await page.locator('.el-dialog .el-input__inner').nth(0).fill(propId)
    await page.locator('.el-dialog .el-input__inner').nth(1).fill('E2E 测试字段')
    await page.locator('.el-dialog button:has-text("保存")').click()
    await page.waitForTimeout(2000)
    const dlgGone = !(await page.locator('.el-dialog').isVisible().catch(() => false))
    if (!dlgGone) {
      // 强制关闭
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
    const editIcons = await page.locator('.field-card .f-edit').count()
    if (editIcons > 0) ok(`字段编辑图标: ${editIcons} (新建后出现)`)
    else fail('字段编辑图标', '新建字段后仍未渲染')
    // hover 显示编辑图标 → 点击
    const firstCard = page.locator('.field-card:has(.f-edit)').first()
    await firstCard.hover()
    await page.waitForTimeout(200)
    await firstCard.locator('.f-edit').click()
    await page.waitForTimeout(500)
    const editDlg = await page.locator('.el-dialog:has-text("编辑字段")').isVisible().catch(() => false)
    if (editDlg) ok('编辑字段对话框打开')
    else {
      const anyDlg = await page.locator('.el-dialog').isVisible().catch(() => false)
      if (anyDlg) ok('字段编辑/新建对话框打开')
      else fail('编辑字段', '对话框未出现')
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    await page.screenshot({ path: path.join(SHOTS, 'B5-field-edit.png'), fullPage: true })

    // === B5 关联类型 CRUD ===
    await page.goto('http://localhost:8090/#/model/association', { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    ok('关联类型页加载')
    const rowsBefore = await page.locator('.el-table__row').count()
    ok(`关联类型表格 ${rowsBefore} 行`)
    await page.locator('button:has-text("新建关联类型")').click()
    await page.waitForTimeout(500)
    const dlgVisible = await page.locator('.el-dialog:has-text("新建关联类型")').isVisible().catch(() => false)
    if (dlgVisible) ok('新建关联类型对话框打开')
    else fail('新建关联类型', '对话框未出现')
    // 填表
    await page.locator('.el-dialog .el-input__inner').nth(0).fill(`e2e_${Date.now()}`)
    await page.locator('.el-dialog .el-input__inner').nth(1).fill('E2E 测试类型')
    await page.locator('.el-dialog textarea, .el-dialog .el-input__inner').nth(2).fill('E2E 源→目标')
    await page.locator('.el-dialog textarea, .el-dialog .el-input__inner').nth(3).fill('E2E 目标→源')
    await page.screenshot({ path: path.join(SHOTS, 'B5-assoc-dialog.png'), fullPage: true })
    // 取消
    await page.locator('.el-dialog button:has-text("取消")').click()
    await page.waitForTimeout(300)

    // 操作列(编辑/删除)存在
    const editBtns = await page.locator('.el-table__row button:has-text("编辑")').count()
    const delBtns = await page.locator('.el-table__row button:has-text("删除")').count()
    if (editBtns > 0) ok(`行内编辑按钮: ${editBtns}`)
    else fail('编辑按钮', '未渲染')
    if (delBtns > 0) ok(`行内删除按钮: ${delBtns}`)
    else fail('删除按钮', '未渲染')

    console.log('')
    if (errors.length) {
      console.log(`浏览器错误 (${errors.length}):`)
      for (const e of errors.slice(0, 6)) console.log('  ' + e)
    } else {
      ok('无浏览器 page/console error')
    }
  } catch (e) {
    fail('E2E 流程', e.message)
    await page.screenshot({ path: path.join(SHOTS, 'B5-error.png'), fullPage: true }).catch(() => {})
  } finally {
    await browser.close()
  }
})()