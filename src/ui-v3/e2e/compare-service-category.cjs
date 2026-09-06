// 对比截图: 新 UI (8090) vs 老 UI (8091) 服务分类页
const { chromium } = require('./browser.cjs')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '../screenshots/service-category')
fs.mkdirSync(OUT, { recursive: true })

async function ensureNoCache(page) {
  await page.route('**/*', (route) => {
    const h = { ...route.request().headers() }
    delete h['if-none-match']
    h['cache-control'] = 'no-cache'
    route.continue({ headers: h })
  })
}

async function pickBiz(page) {
  // 关弹窗 + 选业务下拉里的第一个业务
  await page.waitForTimeout(500)
  const close = page.locator('.bk-dialog .bk-dialog-close, .bk-close-btn, [class*="close-btn"]').first()
  if (await close.count()) {
    try { await close.click({ timeout: 1000 }); } catch {}
  }
  // 老 UI: 业务选择下拉 .business-select 或 cmdb-search-select
  try {
    const sel = page.locator('.business-select, [data-test-id*="biz"], .biz-select, .bk-selector').first()
    if (await sel.count({ timeout: 2000 })) await sel.click({ timeout: 1500 })
    await page.waitForTimeout(500)
    const opt = page.locator('.bk-option, [class*="option"]').first()
    if (await opt.count({ timeout: 1500 })) await opt.click({ timeout: 1500 })
    await page.waitForTimeout(500)
  } catch {}
}

;(async () => {
  const browser = await chromium.launch()

  async function shot(label, url) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log(`[${label} pageerror]`, e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') console.log(`[${label} console.error]`, m.text().slice(0, 200))
    })
    await ensureNoCache(page)
    console.log(`[${label}] goto`, url)
    // 先到首页让左侧菜单加载
    const homeUrl = label.startsWith('old') ? 'http://localhost:8091/' : 'http://localhost:8090/'
    await page.goto(homeUrl, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2500)
    // 关闭所有弹窗
    for (let i = 0; i < 3; i++) {
      const close = page.locator('.bk-dialog-close, .bk-close-btn, [class*="close-btn"], .el-dialog__close').first()
      if (await close.count({ timeout: 500 })) {
        try { await close.click({ timeout: 1000 }); await page.waitForTimeout(300); } catch {}
      } else break
    }
    // 点左侧 "服务分类"
    const link = page.locator('a, .bk-menu-item, [class*="menu-item"]').filter({ hasText: '服务分类' }).first()
    if (await link.count({ timeout: 3000 })) {
      await link.click({ timeout: 2000 })
      console.log(`[${label}] clicked 左侧 服务分类`)
    } else {
      console.log(`[${label}] no menu link found, goto direct`)
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    }
    await page.waitForTimeout(2500)
    // 等内容渲染
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('.category-item, [class*="category-item"]').length > 0 ||
              document.querySelectorAll('.el-tabs__item').length > 0,
        null,
        { timeout: 8000 }
      )
    } catch {}
    await page.waitForTimeout(1500)
    const file = path.join(OUT, `${label}.png`)
    await page.screenshot({ path: file, fullPage: true })
    const html = await page.content()
    fs.writeFileSync(path.join(OUT, `${label}.html`), html)
    console.log(`[${label}] saved`, file, 'body bytes:', html.length)
    await ctx.close()
  }

  await shot('new-8090', 'http://localhost:8090/#/business/service-category')
  await shot('old-8091', 'http://localhost:8091/#/business/service/cagetory')
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
