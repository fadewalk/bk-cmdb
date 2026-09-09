// 转移页新旧对照截图(夹具由外部脚本预先创建,环境变量传入)
const { chromium } = require('./browser.cjs')
const fs = require('fs')
const path = require('path')
const OUT = path.join(__dirname, '../screenshots/resource-model')
fs.mkdirSync(OUT, { recursive: true })
const SET = process.env.SET, A = process.env.A, HOST = process.env.HOST

async function ensureNoCache(page) {
  await page.route('**/*', (r) => {
    const h = { ...r.request().headers() }; delete h['if-none-match']
    h['cache-control'] = 'no-cache'; r.continue({ headers: h })
  })
}
async function dismissDialogs(page) {
  for (let i = 0; i < 3; i++) {
    const c = page.locator('.bk-dialog-close, .bk-close-btn, .el-dialog__close, .el-message-box__close').first()
    if (await c.count({ timeout: 500 })) { try { await c.click({ timeout: 800 }); await page.waitForTimeout(300); } catch {} } else break
  }
}

;(async () => {
  const browser = await chromium.launch()
  for (const [prefix, base] of [['old', 'http://localhost:8091'], ['new', 'http://localhost:8090']]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log(`[${prefix} err]`, e.message))
    await ensureNoCache(page)
    if (prefix === 'old') {
      await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(3000)
      await dismissDialogs(page)
    }
    const url = `${base}/#/business/2/host/transfer/business?resources=${HOST}&targetModules=${A}`
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(4000)
    await dismissDialogs(page)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(OUT, `${prefix}-hostTransfer.png`), fullPage: true })
    console.log(`[${prefix}] shot done`)
    await ctx.close()
  }
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
