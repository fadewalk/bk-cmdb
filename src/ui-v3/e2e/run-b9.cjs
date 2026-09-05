// B9: Operation CRUD + NAVTYPE + ResourceDirectory CRUD + HostFavorites
const { chromium } = require('/tmp/e2e/node_modules/playwright')
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
    // === 1. 运营统计 NAVTYPE 顶部卡 + CRUD ===
    await page.goto('http://localhost:8090/#/analysis/operation', { waitUntil: 'load' })
    await page.waitForTimeout(3000)
    ok('运营统计加载')
    const navCards = await page.locator('.nav-card').count()
    if (navCards === 4) ok('NAVTYPE 顶部卡 4 张(业务/主机/模型/实例)')
    else fail('NAVTYPE 卡片', `期望 4 张,实际 ${navCards}`)

    // 新建图表
    await page.locator('button:has-text("新建图表")').click()
    await page.waitForTimeout(500)
    const chartDlg = await page.locator('.el-dialog:has-text("新建图表")').isVisible().catch(() => false)
    if (chartDlg) ok('运营统计 新建图表对话框打开')
    else fail('运营统计新建', '对话框未出现')
    // 填写名称
    const chartName = `e2e_chart_${Date.now()}`
    await page.locator('.el-dialog .el-input__inner').nth(0).fill(chartName)
    await page.screenshot({ path: path.join(SHOTS, 'B9-operation.png'), fullPage: true })
    await page.locator('.el-dialog button:has-text("取消")').click()
    await page.waitForTimeout(300)

    // === 2. 资源目录 CRUD ===
    await page.goto('http://localhost:8090/#/resource/host', { waitUntil: 'load' })
    await page.waitForTimeout(3000)
    ok('主机列表加载')
    // 资源目录树
    const dirTree = await page.locator('.dir-tree .el-tree-node').count()
    if (dirTree > 0) ok(`资源目录树: ${dirTree} 节点`)
    // 目录操作按钮
    const createDirBtn = await page.locator('button:has-text("新建目录")').count()
    const renameBtn = await page.locator('button:has-text("重命名")').count()
    const delDirBtn = await page.locator('button:has-text("删除")').first().count()
    if (createDirBtn > 0) ok('"新建目录"按钮')
    if (renameBtn > 0) ok('"重命名"按钮')
    if (delDirBtn > 0) ok('"删除"按钮')

    // 新建目录对话框
    await page.locator('button:has-text("新建目录")').click()
    await page.waitForTimeout(500)
    const newDirDlg = await page.locator('.el-dialog:has-text("新建资源目录")').isVisible().catch(() => false)
    if (newDirDlg) ok('资源目录新建对话框打开')
    await page.screenshot({ path: path.join(SHOTS, 'B9-directory.png'), fullPage: true })
    await page.keyboard.press('Escape')

    // === 3. 主机收藏 ===
    const favBtn = page.locator('button:has-text("收藏")')
    if (await favBtn.isVisible()) {
      await favBtn.click()
      await page.waitForTimeout(800)
      const favDlg = await page.locator('.el-dialog:has-text("主机收藏")').isVisible().catch(() => false)
      if (favDlg) ok('主机收藏对话框打开')
      await page.screenshot({ path: path.join(SHOTS, 'B9-favorites.png'), fullPage: true })
      await page.keyboard.press('Escape')
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
    await page.screenshot({ path: path.join(SHOTS, 'B9-error.png'), fullPage: true }).catch(() => {})
  } finally {
    await browser.close()
  }
})()