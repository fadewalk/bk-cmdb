// batch 3 全页面截图
const { chromium } = require('./browser.cjs')
const fs = require('fs')
const path = require('path')
const OUT = path.join(__dirname, '../screenshots/batch3-verify')
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('[err]', e.message))
  await page.route('**/*', (r) => { const h = { ...r.request().headers() }; delete h['if-none-match']; h['cache-control'] = 'no-cache'; r.continue({ headers: h }) })

  const shots = [
    ['operation', '/analysis/operation'],
    ['topo', '/business/topo'],
    ['modelTopology', '/model/topology'],
    ['cloudDiscover', '/resource/cloud-discover'],
    ['modelRelation', '/model/relation'],
    ['serviceTemplate', '/business/service-template'],
    ['setTemplate', '/business/set-template'],
    ['audit', '/analysis/audit']
  ]
  for (const [name, url] of shots) {
    const full = 'http://localhost:8090/#' + url
    console.log('shot', name)
    await page.goto(full, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(4000)
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false })
  }
  await ctx.close()
  await browser.close()
  console.log('done')
})().catch((e) => { console.error(e); process.exit(1) })
