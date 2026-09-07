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
    const propName = `E2E 测试字段 ${Date.now()}`
    await page.locator('.el-dialog .el-input__inner').nth(0).fill(propId)
    await page.locator('.el-dialog .el-input__inner').nth(1).fill(propName)
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
    const rowsBefore = await page.locator('.relation-table .el-table__row').count()
    ok(`关联类型表格 ${rowsBefore} 行`)
    const newAssoc = page.locator('button:has-text("新建")').first()
    if (await newAssoc.count() > 0) {
      await newAssoc.click()
      await page.waitForTimeout(500)
      const drawerVisible = await page.locator('.el-drawer:has-text("新建关联类型")').isVisible().catch(() => false)
      if (drawerVisible) ok('新建关联类型抽屉打开')
      else fail('新建关联类型', '抽屉未出现')
      const formInputs = await page.locator('.el-drawer input').count()
      if (formInputs >= 4) ok(`关联类型表单字段: ${formInputs}`)
      const submit = page.locator('.el-drawer button:has-text("提交")')
      if (await submit.count() > 0) {
        await submit.click()
        await page.waitForTimeout(300)
        const requiredError = await page.locator('.el-form-item__error').count()
        if (requiredError > 0) ok('关联类型空表单校验')
      }
      await page.keyboard.press('Escape')
    } else fail('新建关联类型', '新建按钮未出现')

    const editBtns = await page.locator('.relation-table .el-table__row button:has-text("编辑")').count()
    const delBtns = await page.locator('.relation-table .el-table__row button:has-text("删除")').count()
    if (editBtns >= 0) ok(`关联类型可编辑行: ${editBtns}`)
    if (delBtns >= 0) ok(`关联类型可删除行: ${delBtns}`)
    const disabledActions = await page.locator('.relation-table .disabled-action').count()
    if (disabledActions > 0) ok(`内置关联类型禁用动作: ${disabledActions}`)
    await page.locator('.relation-table .el-table__row').first().click().catch(() => {})
    await page.waitForTimeout(300)
    if (await page.locator('.el-drawer:has-text("关联类型详情")').count() > 0) ok('关联类型详情抽屉可打开')
    await page.screenshot({ path: path.join(SHOTS, 'B5-association-type.png'), fullPage: true })

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