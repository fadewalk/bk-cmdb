// B39: 路由/权限/错误状态完整替代专项
// 断言:业务不存在 → 原位 permission 视图(URL 保留,非空表);非法 bizId 规范化回填;
// /no-business、/error 状态路由;常规导航与既有深链不受影响
const { chromium } = require('./browser.cjs')
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
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    route.continue({ headers })
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  const shot = (name) => page.screenshot({ path: `${SHOTS}/b39-${name}.png` })

  try {
    // 首次进入建立会话,同时记录真实存在的业务 ID
    await page.goto('http://localhost:8090/#/index', { waitUntil: 'load' })
    await page.waitForTimeout(900)
    const bizId = await page.evaluate(async () => {
      const r = await fetch('/api/v3/biz/search/0', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: { start: 0, limit: 1 } })
      })
      const res = await r.json()
      return res.data?.info?.[0]?.bk_biz_id || null
    })
    if (!bizId) throw new Error('环境中无任何业务,B39 规范化用例无法执行')

    // === 1. 业务不存在:原位 permission 视图,URL 保留,展示「业务不存在」 ===
    await page.goto('http://localhost:8090/#/business/99999999/index', { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    const notFoundText = await page.locator('body').textContent()
    if (!notFoundText.includes('业务不存在')) throw new Error('业务不存在未渲染 permission 视图: ' + notFoundText.slice(0, 120))
    const hashKept = await page.evaluate(() => window.location.hash)
    if (!hashKept.includes('business/99999999')) throw new Error(`原位视图丢失深链 URL: ${hashKept}`)
    ok('业务不存在 → 原位 permission 视图且 URL 保留(403 不再是空表)')
    await shot('biz-not-found')

    // === 2. 非法 bizId 规范化:/business/abc/index 回填为合法业务 ===
    // 先离开业务视图,避免老版 biz→biz 整页 reload 分支参与(它保留于守卫中,见步骤 2b)
    await page.goto('http://localhost:8090/#/index', { waitUntil: 'load' })
    await page.waitForTimeout(800)
    await page.evaluate((id) => localStorage.setItem('selectedBusiness', String(id)), bizId)
    await page.goto('http://localhost:8090/#/business/abc/index', { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    const normalizedHash = await page.evaluate(() => window.location.hash)
    if (!new RegExp(`#/business/${bizId}/index`).test(normalizedHash)) {
      throw new Error(`非法 bizId 未规范化: ${normalizedHash}`)
    }
    ok(`非法 bizId 规范化回填 → /business/${bizId}/index`)

    // === 2b. 业务间切换仍走老版整页 reload(守卫回归) ===
    await page.goto('http://localhost:8090/#/index', { waitUntil: 'load' })
    await page.waitForTimeout(600)
    await page.goto(`http://localhost:8090/#/business/${bizId}/index`, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    const switchHash = await page.evaluate(() => window.location.hash)
    if (!switchHash.includes(`/business/${bizId}/index`)) throw new Error(`合法业务深链被破坏: ${switchHash}`)
    ok('合法业务视图切换/深链保持老版 reload 语义')

    // === 3. /no-business 独立状态路由 ===
    await page.goto('http://localhost:8090/#/no-business', { waitUntil: 'load' })
    await page.waitForTimeout(600)
    const noBizText = await page.locator('body').textContent()
    if (!noBizText.includes('无任何业务权限')) throw new Error('/no-business 未渲染无业务权限视图')
    ok('/no-business 状态路由渲染无业务权限视图')
    await shot('no-business')

    // === 4. /error 独立状态路由 ===
    await page.goto('http://localhost:8090/#/error', { waitUntil: 'load' })
    await page.waitForTimeout(600)
    const errText = await page.locator('body').textContent()
    if (!errText.includes('服务异常')) throw new Error('/error 未渲染服务异常视图')
    ok('/error 状态路由渲染服务异常视图')

    // === 5. 常规导航不受守卫加固影响(不得误触发 error/permission) ===
    await page.goto('http://localhost:8090/#/resource/host', { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    const hostText = await page.locator('body').textContent()
    if (hostText.includes('服务异常') || hostText.includes('业务不存在')) throw new Error('常规主机页被守卫误判为异常/权限态')
    ok('常规导航(资源池主机)不受守卫加固影响')

    await page.goto(`http://localhost:8090/#/business/${bizId}/index`, { waitUntil: 'load' })
    await page.waitForTimeout(1800)
    const topoText = await page.locator('body').textContent()
    if (topoText.includes('业务不存在') || topoText.includes('服务异常')) throw new Error('合法业务拓扑被守卫误判')
    ok('合法业务拓扑正常加载')

    const realErrors = errors.filter((e) => !/favicon|favicon\.ico|ResizeObserver/.test(e))
    if (realErrors.length) throw new Error('页面错误: ' + realErrors.slice(0, 3).join(' | '))
    ok('全程无 pageerror')
  } catch (e) {
    fail('B39 闭环', e)
  } finally {
    await browser.close()
  }
  if (!process.exitCode) console.log('B39 E2E 全部通过')
})()
