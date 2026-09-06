// 截图验证: top-nav / model-management / host-apply / custom-fields
const { chromium } = require('./browser.cjs')
const fs = require('fs')
const path = require('path')
const OUT = path.join(__dirname, '../screenshots/batch2-verify')
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('[err]', e.message))
  await page.route('**/*', (r) => { const h = { ...r.request().headers() }; delete h['if-none-match']; h['cache-control'] = 'no-cache'; r.continue({ headers: h }) })

  const shots = [
    ['header', 'http://localhost:8090/'],
    ['hostApply', 'http://localhost:8090/#/business/host-apply'],
    ['customFields', 'http://localhost:8090/#/business/custom-fields'],
    ['models', 'http://localhost:8090/#/model/management'],
    ['resourceHost', 'http://localhost:8090/#/resource/host']
  ]
  for (const [name, url] of shots) {
    console.log('shot', name)
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(3500)
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false })
  }
  // 模型管理: 点 ··· 菜单
  await page.goto('http://localhost:8090/#/model/management', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)
  const moreBtn = page.locator('.group-more').first()
  if (await moreBtn.count()) {
    await moreBtn.click({ timeout: 2000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(OUT, 'models-dropdown.png'), fullPage: false })
  }
  // host-apply: 选中模块
  await page.goto('http://localhost:8090/#/business/host-apply', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)
  const fm = page.locator('.el-tree-node__content').filter({ hasText: /B8模块|空闲机|空闲机池|空闲/ }).first()
  if (await fm.count()) {
    await fm.click({ timeout: 2000 })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(OUT, 'hostApply-selected.png'), fullPage: false })
  }
  await ctx.close()
  await browser.close()
  console.log('done')
})().catch((e) => { console.error(e); process.exit(1) })
