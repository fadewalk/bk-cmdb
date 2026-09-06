const { chromium } = require('./browser.cjs')
const path = require('path')
const fs = require('fs')
const OUT = path.join(__dirname, '../screenshots/old-global-config')
fs.mkdirSync(OUT, { recursive: true })
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.route('**/*', (r) => { const h = { ...r.request().headers() }; delete h['if-none-match']; h['cache-control'] = 'no-cache'; r.continue({ headers: h }) })

  await page.goto('http://localhost:8091/#/platform-management/global-config?tab=id-generate', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(5000)
  // 关闭版本日志弹窗
  const close = page.locator('.bk-dialog-close, .bk-dialog .icon-close, [class*="close"]').first()
  if (await close.count({ timeout: 2000 })) {
    try { await close.click({ timeout: 1500 }); console.log('closed dialog') } catch {}
  }
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(OUT, 'old-id-generate-clean.png'), fullPage: false })
  console.log('shot 1')

  // 展开某个 collapse 并点编辑
  const editBtn = page.locator('button').filter({ hasText: '编辑' }).first()
  if (await editBtn.count({ timeout: 3000 })) {
    await editBtn.click({ timeout: 2000 })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: path.join(OUT, 'old-id-generate-edit.png'), fullPage: false })
    console.log('shot 2 (edit mode)')
  }

  // general tab
  await page.locator('.bk-tab-label').filter({ hasText: '业务通用' }).click().catch(() => {})
  await page.waitForTimeout(2000)
  await page.screenshot({ path: path.join(OUT, 'old-general-clean.png'), fullPage: false })
  console.log('shot 3 (general)')

  // idle tab
  await page.locator('.bk-tab-label').filter({ hasText: '业务空闲机' }).click().catch(() => {})
  await page.waitForTimeout(2000)
  await page.screenshot({ path: path.join(OUT, 'old-idle-clean.png'), fullPage: false })
  console.log('shot 4 (idle)')

  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
