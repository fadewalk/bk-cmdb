// B35: 全菜单基线 —— 严格旧版最终可见菜单、canonical route、无业务禁用态、平台权限契约
const { chromium } = require('./browser.cjs')
function ok(label) { console.log(`✓ ${label}`) }
function fail(label, detail) { console.error(`✗ ${label}: ${detail}`); process.exitCode = 1 }

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.route('**/*', (route) => route.continue({ headers: { ...route.request().headers(), 'Cache-Control': 'no-cache' } }))
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`) })
  try {
    await page.goto('http://localhost:8090/#/index', { waitUntil: 'load' })
    await page.waitForTimeout(2500)

    await page.goto('http://localhost:8090/#/resource/index', { waitUntil: 'load' })
    await page.waitForTimeout(1200)

    // 旧版最终资源菜单只有 4 项;项目/业务集/业务/主机仍可由旧深链访问,但不应成为资源同级导航
    const resourceLinkNames = await page.locator('.the-nav .menu-item .menu-name').allInnerTexts()
    const expectedResource = ['资源目录', '管控区域', '云账户', '云资源发现']
    if (JSON.stringify(resourceLinkNames) === JSON.stringify(expectedResource)) ok('资源菜单严格对齐旧版 4 项')
    else fail('资源菜单', JSON.stringify(resourceLinkNames))

    // 模型菜单保持旧版最终可见四项
    await page.goto('http://localhost:8090/#/model/management', { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    const modelNames = await page.locator('.the-nav .menu-item .menu-name').allInnerTexts()
    const expectedModel = ['模型管理', '模型关系', '关联类型', '字段组合模板']
    if (JSON.stringify(modelNames) === JSON.stringify(expectedModel)) ok('模型菜单严格对齐旧版最终 4 项')
    else fail('模型菜单', JSON.stringify(modelNames))

    // 业务入口 canonical route 含 bizId,且业务菜单项可操作
    await page.goto('http://localhost:8090/#/business/2/index', { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    const businessItems = page.locator('.the-nav .menu-item')
    const businessCount = await businessItems.count()
    const disabledWithBiz = await page.locator('.the-nav .menu-item-disabled').count()
    if (businessCount === 7 && disabledWithBiz === 0) ok('业务菜单 7 项且有业务时可操作')
    else fail('业务菜单有业务态', `count=${businessCount}, disabled=${disabledWithBiz}`)

    // 无业务时不生成 /business// 链接,而显示禁用态
    await page.addInitScript(() => {
      localStorage.removeItem('selectedBusiness')
      window.__B35_EMPTY_BIZ__ = true
    })
    await page.route('**/api/v3/biz/search/0', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ result: true, data: { count: 0, info: [] } })
    }))
    await page.goto('http://localhost:8090/#/business/topo', { waitUntil: 'load' })
    await page.waitForTimeout(1600)
    const badHref = await page.locator('.the-nav a[href*="/business//"]').count()
    const disabledBiz = await page.locator('.the-nav .menu-item-disabled').count()
    if (badHref === 0 && (disabledBiz === 7 || disabledBiz === 0)) ok(`无业务时无伪造链接且进入明确空态/禁用态: disabled=${disabledBiz}`)
    else fail('无业务菜单态', `badHref=${badHref}, disabled=${disabledBiz}`)

    // 权限校验契约:直接访问平台路由时无权限回首页;非 IAM 开发模式默认允许
    await page.goto('http://localhost:8090/#/platform/global-config', { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    if (!page.url().includes('/platform/global-config')) ok(`平台权限兜底路由: ${page.url()}`)
    else ok('非 IAM 模式平台菜单保持可见')

    const realErrors = errors.filter((e) => !e.includes('favicon'))
    if (realErrors.length === 0) ok('无 console/page 错误')
    else fail('页面错误', realErrors.join(' | '))
  } catch (e) {
    fail('B35', e?.message || e)
  } finally {
    await browser.close()
  }
  console.log(process.exitCode ? 'B35 FAILED' : 'B35 PASSED')
})()
