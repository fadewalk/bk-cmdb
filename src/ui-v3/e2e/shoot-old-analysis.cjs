const { chromium } = require('./browser.cjs')
const path = require('path')
const fs = require('fs')
const OUT = path.join(__dirname, '../screenshots/old-baseline')
fs.mkdirSync(OUT, { recursive: true })
async function dismiss(page) {
  for (let i = 0; i < 3; i++) {
    const c = page.locator('.bk-dialog-close, .bk-dialog .icon-close').first()
    if (await c.count({ timeout: 600 })) { try { await c.click({ timeout: 800 }); await page.waitForTimeout(300) } catch {} } else break
  }
}
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.route('**/*', (r) => { const h = { ...r.request().headers() }; delete h['if-none-match']; h['cache-control'] = 'no-cache'; r.continue({ headers: h }) })

  for (const [name, hash] of [
    ['audit2', '/#/analysis/audit'],
    ['operation2', '/#/analysis/operation']
  ]) {
    await page.goto('http://localhost:8091' + hash, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(4500)
    await dismiss(page)
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(OUT, `${name}.png`) })
    console.log('shot', name)
  }
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
