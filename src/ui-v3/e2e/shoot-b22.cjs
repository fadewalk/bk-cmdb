// B22 四处形态对照截图:新建业务/新建云账户/主机列表/导入抽屉
const { chromium } = require('./browser.cjs')
const fs = require('fs')
const path = require('path')
const OUT = path.join(__dirname, '../screenshots/resource-model')
fs.mkdirSync(OUT, { recursive: true })

async function ensureNoCache(page) {
  await page.route('**/*', (r) => {
    const h = { ...r.request().headers() }; delete h['if-none-match']
    h['cache-control'] = 'no-cache'; r.continue({ headers: h })
  })
}
async function dismissDialogs(page) {
  for (let i = 0; i < 3; i++) {
    const c = page.locator('.bk-dialog-close, .bk-close-btn, .el-dialog__close, .el-message-box__close').first()
    if (await c.count({ timeout: 400 })) { try { await c.click({ timeout: 700 }); await page.waitForTimeout(250); } catch {} } else break
  }
}

;(async () => {
  const browser = await chromium.launch()
  for (const [prefix, base] of [['old', 'http://localhost:8091'], ['new', 'http://localhost:8090']]) {
    // 1. 业务列表 + 新建表单
    let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    let page = await ctx.newPage()
    await ensureNoCache(page)
    if (prefix === 'old') {
      await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(2500); await dismissDialogs(page)
    }
    await page.goto(`${base}/#/resource/business`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(2000); await dismissDialogs(page)
    await page.locator('button').filter({ hasText: /^新?建/ }).first().click().catch(() => {})
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(OUT, `${prefix}-bizCreate.png`), fullPage: true })
    await ctx.close()

    // 2. 云账户列表 + 新建表单
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await ctx.newPage()
    await ensureNoCache(page)
    await page.goto(`${base}/#/resource/cloud-account`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(2000); await dismissDialogs(page)
    await page.locator('button').filter({ hasText: '新建' }).first().click().catch(() => {})
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(OUT, `${prefix}-accountCreate.png`), fullPage: true })
    await ctx.close()

    // 3. 主机列表(未分配默认态)
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await ctx.newPage()
    await ensureNoCache(page)
    const hostUrl = prefix === 'old'
      ? `${base}/#/resource/host?_t=${Date.now()}&directory=1&page=1`
      : `${base}/#/resource/host?scope=unassigned&directory=1`
    await page.goto(hostUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(2500); await dismissDialogs(page)
    await page.screenshot({ path: path.join(OUT, `${prefix}-hostList.png`), fullPage: true })

    // 4. 导入抽屉
    await page.locator('button').filter({ hasText: '导入主机' }).first().click().catch(() => {})
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(OUT, `${prefix}-hostImport.png`), fullPage: true })
    await ctx.close()
  }
  await browser.close()
  console.log('done')
})().catch((e) => { console.error(e); process.exit(1) })
