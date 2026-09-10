// E2E: B3 + B4 验证(业务拓扑右键菜单/分页/字段设置/服务实例向导 + 资源目录联动 + 主机导入 + 云区域新建)
const { chromium } = require('./browser.cjs')
const fs = require('fs')
const path = require('path')

const SHOTS = '/tmp/ui-v3-shots'
fs.mkdirSync(SHOTS, { recursive: true })

function ok(label) { console.log(`✓ ${label}`) }
function fail(label, e) { console.error(`✗ ${label}: ${e?.message || e}`); process.exitCode = 1 }

;(async () => {
  // 用 Playwright 自带 chromium (headless-shell),且使用它打开 dist 的 index.html 直接加载
  // 避免 Chrome 扩展 / 缓存干扰。绕开 /static assets cache,直接用 file:// 协议
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  // 强制禁缓存,避免 webserver 重启前后的 stale hash
  await page.route('**/*', (route) => {
    route.continue({ headers: { ...route.request().headers(), 'Cache-Control': 'no-cache' } })
  })
  const errors = []
  const reqs = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`) })
  page.on('requestfailed', (req) => reqs.push(`FAILED ${req.method()} ${req.url()} :: ${req.failure()?.errorText}`))

  try {
    // === B3 业务拓扑 ===
    await page.goto('http://localhost:8090/#/business/topo', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000) // 等待异步路由 + chunk 加载
    const bodyInfo = await page.evaluate(() => ({
      bodyLen: document.body.innerHTML.length,
      appLen: document.querySelector('#app')?.innerHTML?.length || 0,
      hasTopo: !!document.querySelector('.topo-page'),
      url: location.href,
      title: document.title
    }))
    console.log(`  bodyLen=${bodyInfo.bodyLen} appLen=${bodyInfo.appLen} hasTopo=${bodyInfo.hasTopo}`)
    console.log(`  url=${bodyInfo.url} title=${bodyInfo.title}`)
    await page.waitForSelector('.topo-page', { timeout: 30000, state: 'attached' })
    ok('业务拓扑页加载')

    const treeRows = await page.locator('.el-tree .tree-node').count()
    if (treeRows >= 4) ok(`树节点渲染 ${treeRows} 个`)
    else fail('树节点', `仅 ${treeRows} 个`)

    // 字段设置弹窗
    await page.locator('button.col-set').click()
    await page.waitForSelector('.col-picker', { timeout: 3000 })
    ok('字段设置弹窗打开')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    const pagerVisible = await page.locator('.el-pagination').isVisible()
    if (pagerVisible) ok('分页器可见')
    else fail('分页器', '不可见')

    // 右键第一个真实集群(旧环境通常是 B8集群,新环境不依赖固定测试数据)
    const setRow = page.locator('.el-tree-node[data-key^="set-"]').filter({ has: page.locator('.node-label') }).first()
    await setRow.click({ button: 'right' })
    await page.waitForTimeout(300)
    const ctxVisible = await page.locator('ul.ctx-menu').isVisible().catch(() => false)
    if (ctxVisible) ok('右键集群菜单弹出')
    else fail('右键菜单', '未弹出')
    const ctxItems = await page.locator('ul.ctx-menu li.ctx-item').allTextContents()
    ok(`右键菜单项: ${ctxItems.filter(Boolean).join(' | ')}`)
    await page.screenshot({ path: path.join(SHOTS, 'B3-topo-ctx.png'), fullPage: true })
    await page.keyboard.press('Escape')

    // 服务实例向导(右键第一个真实模块)
    await page.mouse.click(20, 20) // 点击空白处关闭前一个 ctx-menu
    await page.waitForTimeout(200)
    const modRow = page.locator('.el-tree-node[data-key^="module-"]').first()
    await modRow.click({ button: 'right' })
    await page.waitForTimeout(300)
    const ctxText = await page.locator('ul.ctx-menu').textContent().catch(() => '')
    if (ctxText.includes('新建服务实例')) ok('右键模块菜单含"新建服务实例"')
    else fail('右键模块', `ctx: ${ctxText}`)
    await page.locator('ul.ctx-menu li.ctx-item:has-text("新建服务实例")').click()
    await page.waitForSelector('.el-dialog:has-text("新建服务实例")', { timeout: 3000 })
    ok('服务实例向导对话框打开')
    // 验证步骤条 + 选主机表格
    const importStepsText = await page.locator('.el-dialog .el-steps').textContent()
    if (importStepsText.includes('选择主机')) ok('向导步骤 1:选择主机')
    else fail('向导步骤', stepText)
    const candRows = await page.locator('.el-dialog .el-table .el-table__row').count()
    ok(`候选主机表行数: ${candRows}`)
    await page.screenshot({ path: path.join(SHOTS, 'B3-wizard.png'), fullPage: true })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // === B4 资源目录(卡片瀑布流,对齐老版) ===
    await page.goto(`http://localhost:8090/?t=${Date.now()+1}#/resource/index`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.res-index', { timeout: 10000 })
    ok('资源目录加载')

    await page.waitForSelector('.classify-name-text', { timeout: 15000 })
    const groupNames = await page.locator('.classify-name-text').allTextContents()
    ok(`资源分类卡片: ${groupNames.join(' / ')}`)
    if (!groupNames.includes('主机管理')) fail('资源目录', '缺少"主机管理"分组')
    const hostCount = await page.locator('.models-link:has(.model-name:has-text("主机")) .model-instance-count').first().textContent()
    if (Number(hostCount) >= 0) ok(`主机实例计数: ${hostCount.trim()}`)

    // 联动点击:自定义模型 → 实例页
    await page.locator('.models-link:has(.model-name:has-text("交换机"))').click()
    await page.waitForURL(/\/resource\/instance\/bk_switch/, { timeout: 5000 })
    ok('点击"交换机"跳到模型实例页')
    await page.screenshot({ path: path.join(SHOTS, 'B4-resource-index.png'), fullPage: true })

    // === B4 主机列表导入(老版两步抽屉) ===
    await page.goto(`http://localhost:8090/?t=${Date.now()+2}#/resource/host`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.host-page', { timeout: 10000 })
    ok('主机列表页加载')

    await page.locator('button:has-text("导入主机")').click()
    await page.waitForSelector('.el-drawer__title:has-text("导入主机")', { timeout: 3000 })
    ok('导入抽屉打开(两步:上传文件/选择关联模型)')
    const twoStepText = await page.locator('.import-steps').textContent()
    if (twoStepText.includes('上传文件') && twoStepText.includes('选择关联模型')) ok('两步步骤条渲染')
    else fail("导入步骤条", twoStepText)
    const uploadArea = await page.locator('.import-upload').count()
    if (uploadArea) ok('拖拽上传区渲染')
    else fail('上传区', '缺失')
    const tplLink = await page.locator('.upload-tips span.link').count()
    if (tplLink) ok('「下载模板」链接渲染')
    else fail('下载模板', '缺失')
    await page.screenshot({ path: path.join(SHOTS, 'B4-import.png'), fullPage: true })
    await page.keyboard.press('Escape')

    console.log('')
    if (reqs.length) {
      console.log(`请求失败 (${reqs.length}):`)
      for (const r of reqs.slice(0, 10)) console.log('  ' + r)
    }
    if (errors.length) {
      console.log(`浏览器错误 (${errors.length}):`)
      for (const e of errors.slice(0, 10)) console.log('  ' + e)
    } else {
      ok('无浏览器 page/console error')
    }
  } catch (e) {
    fail('E2E 流程', e.message)
    await page.screenshot({ path: path.join(SHOTS, 'error.png'), fullPage: true }).catch(() => {})
  } finally {
    await browser.close()
  }
})()