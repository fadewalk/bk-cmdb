const { chromium } = require('/tmp/e2e/node_modules/playwright')
const path = require('path')
const fs = require('fs')
const OUT = path.join(__dirname, '../screenshots/topology-full')
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('[err]', e.message))
  await page.route('**/*', (r) => { const h = { ...r.request().headers() }; delete h['if-none-match']; h['cache-control'] = 'no-cache'; r.continue({ headers: h }) })

  await page.goto('http://localhost:8090/#/model/topology', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(4500)
  await page.screenshot({ path: path.join(OUT, '01-initial.png'), fullPage: false })
  console.log('shot 01')

  // 点一个 group 切换
  const group = page.locator('.group-info').nth(2)
  if (await group.count()) {
    await group.click({ timeout: 2000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(OUT, '02-group-selected.png'), fullPage: false })
    console.log('shot 02')
  }

  // 点一个 node
  const node = page.locator('.node-g').first()
  if (await node.count()) {
    await node.click({ timeout: 2000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(OUT, '03-node-selected.png'), fullPage: false })
    console.log('shot 03')
  }

  // 放大
  await page.locator('.icon-cc-zoom-in').first().click({ timeout: 2000 })
  await page.waitForTimeout(300)
  await page.locator('.icon-cc-zoom-in').first().click({ timeout: 2000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, '04-zoom.png'), fullPage: false })
  console.log('shot 04')

  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
