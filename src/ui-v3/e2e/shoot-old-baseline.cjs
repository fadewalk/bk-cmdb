// 老版资源导航 + 各页面基线截图
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
  page.on('pageerror', (e) => console.log('[err]', e.message))
  await page.route('**/*', (r) => { const h = { ...r.request().headers() }; delete h['if-none-match']; h['cache-control'] = 'no-cache'; r.continue({ headers: h }) })

  // 1. 资源导航侧边栏
  await page.goto('http://localhost:8091/#/resource/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(5000)
  await dismiss(page)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: path.join(OUT, 'resource-nav.png') })
  console.log('1 resource nav')

  // 2. 首页(看地图背景位置)
  await page.goto('http://localhost:8091/#/index', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(4000)
  await dismiss(page)
  await page.screenshot({ path: path.join(OUT, 'index.png') })
  console.log('2 index')

  // 3. audit
  await page.goto('http://localhost:8091/#/audit', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(4000)
  await dismiss(page)
  await page.screenshot({ path: path.join(OUT, 'audit.png') })
  console.log('3 audit')

  // 4. operation
  await page.goto('http://localhost:8091/#/operation', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(4000)
  await dismiss(page)
  await page.screenshot({ path: path.join(OUT, 'operation.png') })
  console.log('4 operation')

  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
