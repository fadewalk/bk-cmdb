// 本轮 5 项修复验证
const { chromium } = require('./browser.cjs')
const path = require('path')
const fs = require('fs')
const OUT = path.join(__dirname, '../screenshots/fix-round4')
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('[err]', e.message.slice(0, 150)))
  await page.route('**/*', (r) => { const h = { ...r.request().headers() }; delete h['if-none-match']; h['cache-control'] = 'no-cache'; r.continue({ headers: h }) })

  const shots = [
    ['1-index', '/index'],
    ['2-audit', '/analysis/audit'],
    ['3-operation', '/analysis/operation'],
    ['4-models', '/model/management'],
    ['5-resource-project', '/resource/project'],
    ['6-resource-nav', '/resource/index']
  ]
  for (const [name, url] of shots) {
    await page.goto('http://localhost:8090/#' + url, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(4000)
    await page.screenshot({ path: path.join(OUT, `${name}.png`) })
    console.log('shot', name)
  }

  // model-management: 勾选 2 个模型试导出 dialog
  const checks = page.locator('.card-check .el-checkbox')
  if (await checks.count() >= 2) {
    await checks.nth(0).click()
    await checks.nth(1).click()
    await page.waitForTimeout(400)
    const expBtn = page.locator('button').filter({ hasText: /导出/ }).first()
    await expBtn.click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(OUT, '7-model-export-dialog.png') })
    console.log('shot 7 export dialog')
  }

  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
