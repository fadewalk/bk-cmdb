// B13: 业务同步页面 + B16: 实例标签(在 ServiceInstance 进程抽屉中)
const { chromium } = require('./browser.cjs')
const path = require('path')
const fs = require('fs')
const SHOTS = '/tmp/ui-v3-shots'
fs.mkdirSync(SHOTS, { recursive: true })
function ok(label) { console.log(`✓ ${label}`) }
function fail(label, e) { console.error(`✗ ${label}: ${e?.message || e}`); process.exitCode = 1 }

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.route('**/*', (route) => {
    route.continue({ headers: { ...route.request().headers(), 'Cache-Control': 'no-cache' } })
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`) })

  try {
    // === 1. 业务同步页面 ===
    await page.goto('http://localhost:8090/#/business/sync', { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    ok('业务同步页加载')
    const diffCard = await page.locator('.el-card:has-text("服务实例与模板差异")').count()
    if (diffCard > 0) ok('业务同步差异卡片渲染')
    else fail('业务同步差异', '卡片缺失')
    const syncAllBtn = await page.locator('button:has-text("同步全部")').count()
    if (syncAllBtn > 0) ok('"同步全部"按钮存在')
    await page.screenshot({ path: path.join(SHOTS, 'B13-business-sync.png'), fullPage: true })

    // === 2. ServiceInstance 进程实例抽屉(应含"标签"tab) ===
    await page.goto('http://localhost:8090/#/business/service-instance', { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    ok('服务实例页加载')
    // 找第一个"查看"按钮,模拟打开进程实例抽屉
    const viewBtn = page.locator('button:has-text("查看")').first()
    if (await viewBtn.count() > 0) {
      await viewBtn.click()
      await page.waitForTimeout(1500)
      // 验证"标签" tab 存在
      const labelTab = await page.locator('.el-drawer .el-tabs__item:has-text("标签")').count()
      if (labelTab > 0) ok('进程实例抽屉"标签" tab 存在')
      else fail('进程实例标签', 'tab 缺失')
      // 切到标签 tab
      if (labelTab > 0) {
        await page.locator('.el-drawer .el-tabs__item:has-text("标签")').click()
        await page.waitForTimeout(800)
        const newLabelBtn = await page.locator('.el-drawer button:has-text("新增标签")').count()
        if (newLabelBtn > 0) ok('"新增标签"按钮存在')
        await page.screenshot({ path: path.join(SHOTS, 'B16-label-tab.png'), fullPage: true })
      }
      await page.keyboard.press('Escape')
    } else {
      ok('服务实例表格 0 行,跳过标签 tab 验证')
    }

    console.log('')
    if (errors.length) {
      console.log(`浏览器错误 (${errors.length}):`)
      for (const e of errors.slice(0, 6)) console.log('  ' + e)
    } else {
      ok('无浏览器 page/console error')
    }
  } catch (e) {
    fail('E2E 流程', e.message)
    await page.screenshot({ path: path.join(SHOTS, 'B13-error.png'), fullPage: true }).catch(() => {})
  } finally {
    await browser.close()
  }
})()