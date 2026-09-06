// 截老 UI 的 global-config id-generate tab
const { chromium } = require('./browser.cjs')
const path = require('path')
const fs = require('fs')
const OUT = path.join(__dirname, '../screenshots/old-global-config')
fs.mkdirSync(OUT, { recursive: true })
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('[err]', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('[c.err]', m.text().slice(0, 150)) })
  await page.route('**/*', (r) => { const h = { ...r.request().headers() }; delete h['if-none-match']; h['cache-control'] = 'no-cache'; r.continue({ headers: h }) })

  await page.goto('http://localhost:8091/#/platform-management/global-config?tab=id-generate', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(6000)
  await page.screenshot({ path: path.join(OUT, 'old-id-generate.png'), fullPage: false })
  console.log('shot old id-generate')

  // 业务通用 tab
  await page.goto('http://localhost:8091/#/platform-management/global-config?tab=business-general-config', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: path.join(OUT, 'old-general.png'), fullPage: false })
  console.log('shot old general')

  // 空闲机池
  await page.goto('http://localhost:8091/#/platform-management/global-config?tab=idle-pool-config', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: path.join(OUT, 'old-idle.png'), fullPage: false })
  console.log('shot old idle')

  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
