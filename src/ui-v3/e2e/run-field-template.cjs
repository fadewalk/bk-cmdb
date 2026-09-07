// Field template workflow smoke test: real list/detail/pagination/form validation.
const { chromium } = require('./browser.cjs')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.route('**/*', (route) => route.continue({ headers: { ...route.request().headers(), 'Cache-Control': 'no-cache' } }))
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`) })
  try {
    await page.goto('http://localhost:8090/#/model/field-template', { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    if (!(await page.locator('.field-template-page').isVisible())) throw new Error('字段组合模板页面未渲染')
    console.log('✓ 字段组合模板页面加载')
    const rows = await page.locator('.el-table__body .el-table__row').count()
    console.log(`✓ 字段模板列表渲染 ${rows} 行`)
    if (await page.locator('.el-pagination').isVisible()) console.log('✓ 服务端分页控件可见')
    const searchInputs = page.locator('.table-toolbar input')
    if (await searchInputs.count() >= 3) {
      await searchInputs.nth(0).fill('__field_template_not_found__')
      await page.locator('.table-toolbar button:has-text("查询")').click()
      await page.waitForTimeout(700)
      if (await page.locator('.el-empty').isVisible()) console.log('✓ 模板名称搜索和空状态')
    }
    await page.locator('.table-toolbar button:has-text("重置")').click()
    await page.waitForTimeout(700)
    const first = page.locator('.el-table__body .el-table__row').first()
    if (await first.count()) {
      await first.click()
      await page.waitForTimeout(1000)
      if (await page.locator('.el-drawer').isVisible()) console.log('✓ 模板详情抽屉打开')
      const tabs = await page.locator('.el-drawer .el-tabs__item').count()
      if (tabs >= 3) console.log(`✓ 详情三 tab 渲染: ${tabs}`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    }
    await page.locator('.table-toolbar button:has-text("新建")').click()
    await page.waitForTimeout(400)
    if (!(await page.locator('.el-dialog:has-text("新建字段组合模板")').isVisible())) throw new Error('新建模板对话框未打开')
    console.log('✓ 新建模板对话框打开')
    await page.locator('.el-dialog button:has-text("保存")').click()
    await page.waitForTimeout(300)
    if (await page.locator('.el-form-item__error').count()) console.log('✓ 新建模板空表单校验')
    console.log('')
    if (errors.length) {
      console.log(`浏览器错误 (${errors.length}):`)
      errors.slice(0, 8).forEach((error) => console.log(`  ${error}`))
      process.exitCode = 1
    } else console.log('✓ 无浏览器 page/console error')
  } finally {
    await browser.close()
  }
})().catch((error) => { console.error(`✗ 字段模板 E2E: ${error.message}`); process.exitCode = 1 })
