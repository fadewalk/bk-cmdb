// 内置账号登录契约专项
// Part A(默认 skip-login 部署下同样可验):/login 表单端点
//   1) 登录页渲染  2) 错误凭据 → 模板渲染错误信息  3) 正确凭据(admin:admin)
//   → 302 回 c_url → /userinfo 返回真实会话用户
const { chromium } = require('./browser.cjs')
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

  try {
    // === 1. 登录页渲染 ===
    await page.goto('http://localhost:8090/login?c_url=%2F%23%2Findex', { waitUntil: 'load' })
    await page.waitForTimeout(600)
    if (!await page.locator('#username').count()) throw new Error('登录页缺少用户名输入框')
    if (!await page.locator('#password').count()) throw new Error('登录页缺少密码输入框')
    ok('登录页渲染(用户名/密码表单)')

    // === 2. 错误凭据 → 模板错误信息(后端 {{.error}}) ===
    await page.fill('#username', 'admin')
    await page.fill('#password', 'wrong-password')
    await page.locator('#login-form button[type="submit"]').click()
    await page.waitForTimeout(1200)
    const errText = (await page.locator('#error').textContent() || '').trim()
    // Go 模板渲染非空错误即视为契约达成;错误文案随语言包,不硬编码断言
    if (!errText || errText.includes('{{')) throw new Error(`错误提示未渲染: ${errText}`)
    ok(`错误凭据返回明确错误(${errText.slice(0, 24)})`)

    // === 3. 正确凭据 → 302 回 c_url → 会话生效 ===
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin')
    await page.locator('#login-form button[type="submit"]').click()
    await page.waitForLoadState('load')
    await page.waitForTimeout(1800)
    const landingHash = await page.evaluate(() => window.location.hash)
    if (!landingHash.includes('/index')) throw new Error(`登录后未回到 c_url: hash=${landingHash}`)
    const userinfo = await page.evaluate(async () => {
      const r = await fetch('/userinfo', { credentials: 'include' })
      return r.json()
    })
    if (userinfo.result !== true || !userinfo.data?.username) throw new Error(`登录会话未生效: ${JSON.stringify(userinfo).slice(0, 120)}`)
    ok(`内置账号登录生效,c_url 回跳成功,会话用户=${userinfo.data.username}`)
  } catch (e) {
    fail('内置账号登录契约', e)
  } finally {
    await browser.close()
  }
  if (!process.exitCode) console.log('登录契约 E2E 全部通过')
})()
