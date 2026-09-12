// B9: Operation CRUD + NAVTYPE + ResourceDirectory CRUD + HostFavorites
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
    // === 1. 运营统计 NAVTYPE 顶部卡 + CRUD ===
    await page.goto('http://localhost:8090/#/analysis/operation', { waitUntil: 'load' })
    await page.waitForTimeout(3000)
    ok('运营统计加载')
    const navCards = await page.locator('.nav-card').count()
    if (navCards === 4) ok('NAVTYPE 顶部卡 4 张(业务/主机/模型/实例)')
    else fail('NAVTYPE 卡片', `期望 4 张,实际 ${navCards}`)

    // 新建图表
    await page.locator('button:has-text("新建图表")').click()
    await page.waitForTimeout(800)
    // B27 起弹窗对齐老版 chart-detail 契约,标题为 新建主机统计
    const chartDlg = await page.locator('.el-dialog:has-text("新建主机统计")').isVisible().catch(() => false)
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
    // 新建目录按钮(老版:搜索框旁 + 号)
    const createDirBtn = await page.locator('.dir-add').count()
    if (createDirBtn > 0) ok('"新建目录"按钮')
    else fail('新建目录按钮', '未渲染')

    // 老版契约:重命名/删除不是常驻按钮,而是自定义目录行悬停点菜单;根(主机池)与默认目录(空闲机)无入口
    if (await page.locator('.dir-actions').count() === 0) ok('无常驻重命名/删除按钮')
    else fail('常驻按钮', '仍存在 .dir-actions 常驻操作区')
    // 只看各自行内容(el-tree-node 会把子节点的菜单算进来)
    const rootOp = await page.locator('.dir-tree > .el-tree-node > .el-tree-node__content .dir-op').count()
    if (rootOp === 0) ok('主机池根节点无点菜单')
    else fail('主机池根节点', '不应有点菜单')
    const idleOp = await page.locator('.dir-tree .el-tree-node__content').filter({ hasText: '空闲机' }).locator('.dir-op').count()
    if (idleOp === 0) ok('默认目录(空闲机)无点菜单')
    else fail('默认目录(空闲机)', '不应有点菜单')

    // 建一个自定义目录 → 悬停出现点菜单 → 菜单含 重命名/删除
    const stamp = Date.now()
    // 前置清理:历史失败运行遗留的临时目录
    const preDirs = await page.evaluate(async () => {
      const res = await fetch('/api/v3/findmany/resource/directory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ page: { sort: 'bk_module_name' } })
      })
      return res.json()
    })
    for (const d of (preDirs.data?.info || [])) {
      if (String(d.bk_module_name || '').startsWith('e2e-dir-')) {
        await page.evaluate(async (id) => {
          await fetch(`/api/v3/delete/resource/directory/${id}`, { method: 'DELETE', credentials: 'include' })
        }, d.bk_module_id)
      }
    }
    const created = await page.evaluate(async (name) => {
      const res = await fetch('/api/v3/create/resource/directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bk_module_name: name, bk_supplier_account: '0' })
      })
      return res.json()
    }, `e2e-dir-${stamp}`)
    if (created.result) {
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForSelector('.dir-tree .el-tree-node', { timeout: 15000 })
      // 注意:按行内容定位,el-tree-node 会同时命中包含子节点文本的父节点
      const row = page.locator('.dir-tree .el-tree-node__content').filter({ hasText: `e2e-dir-${stamp}` }).first()
      await row.hover()
      await page.waitForTimeout(300)
      const opVisible = await row.locator('.dir-op').isVisible().catch(() => false)
      if (opVisible) ok('自定义目录悬停显示点菜单')
      else fail('自定义目录点菜单', '悬停后未出现')
      await row.locator('.dir-op-trigger').click({ force: true })
      await page.waitForTimeout(400)
      const menuText = await page.locator('.el-dropdown-menu:visible').textContent().catch(() => '')
      if (menuText.includes('重命名') && menuText.includes('删除')) ok('点菜单含 重命名/删除')
      else fail('点菜单内容', `缺少操作项: ${menuText}`)
      await page.keyboard.press('Escape')
      // 清理
      const dirId = created.data?.created?.id
      await page.evaluate(async (id) => {
        await fetch(`/api/v3/delete/resource/directory/${id}`, { method: 'DELETE', credentials: 'include' })
      }, dirId)
      ok('临时目录已清理')
    } else {
      fail('创建临时目录', created.bk_error_msg || '接口失败')
    }

    // 新建目录对话框
    await page.locator('.dir-add').click()
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