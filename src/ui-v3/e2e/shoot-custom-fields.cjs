// 截图 /business/custom-fields
const { chromium } = require('/tmp/e2e/node_modules/playwright')
const fs = require('fs')
const path = require('path')
const OUT = path.join(__dirname, '../screenshots/custom-fields')
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('[err]', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('[c.err]', m.text().slice(0,200)) })
  await page.route('**/*', (r) => { const h = { ...r.request().headers() }; delete h['if-none-match']; h['cache-control'] = 'no-cache'; r.continue({ headers: h }) })

  await page.goto('http://localhost:8090/#/business/custom-fields', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: path.join(OUT, '01-initial.png'), fullPage: true })

  // 切换 tab 看几个
  for (const tab of ['集群', '模块', '主机']) {
    const t = page.locator('.el-tabs__item').filter({ hasText: tab }).first()
    if (await t.count()) {
      await t.click({ timeout: 2000 })
      await page.waitForTimeout(2000)
      await page.screenshot({ path: path.join(OUT, `02-tab-${tab}.png`), fullPage: true })
      console.log('saved', tab)
    }
  }
  await ctx.close()
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
