// 截图 /business/host-apply
const { chromium } = require('./browser.cjs')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '../screenshots/host-apply')
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200))
  })
  await page.route('**/*', (route) => {
    const h = { ...route.request().headers() }
    delete h['if-none-match']
    h['cache-control'] = 'no-cache'
    route.continue({ headers: h })
  })

  await page.goto('http://localhost:8090/#/business/host-apply', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: path.join(OUT, '01-new-initial.png'), fullPage: true })
  console.log('saved 01-new-initial')

  // 点按服务模板看 mode 切换
  const templateBtn = page.locator('label.el-radio-button, .el-radio-button__inner').filter({ hasText: '服务模板' }).first()
  if (await templateBtn.count()) {
    await templateBtn.click({ timeout: 2000 })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(OUT, '02-new-template-mode.png'), fullPage: true })
    console.log('saved 02-new-template-mode')
  }

  // 点 "编辑" 按钮看对话框
  await page.locator('label.el-radio-button, .el-radio-button__inner').filter({ hasText: '业务拓扑' }).first().click().catch(() => {})
  await page.waitForTimeout(2000)
  // 点左侧第一个模块
  const firstModule = page.locator('.el-tree-node__content').filter({ hasText: /B8模块|空闲机|空闲机池|空闲/ }).first()
  if (await firstModule.count()) {
    await firstModule.click({ timeout: 2000 })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(OUT, '03-new-node-selected.png'), fullPage: true })
    console.log('saved 03-new-node-selected')
  }

  // 点击 编辑 按钮
  const editBtn = page.locator('button').filter({ hasText: /^编辑$/ }).first()
  if (await editBtn.count()) {
    await editBtn.click({ timeout: 2000 })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(OUT, '04-new-edit-dialog.png'), fullPage: true })
    console.log('saved 04-new-edit-dialog')
  }

  await ctx.close()
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
