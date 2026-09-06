const { chromium } = require('./browser.cjs')
;(async () => {
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[c] ' + m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errors.push('[p] ' + e.message.slice(0, 300)))
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`[http ${r.status()}] ` + r.url().slice(0, 150)) })
  await page.route('**/*', (r) => { const h = { ...r.request().headers() }; delete h['if-none-match']; h['cache-control'] = 'no-cache'; r.continue({ headers: h }) })
  await page.goto('http://localhost:8090/#/analysis/operation', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(6000)
  console.log(errors.join('\n') || '(no errors)')
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
