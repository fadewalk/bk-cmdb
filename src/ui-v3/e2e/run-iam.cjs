// IAM deny matrix smoke:mock auth/verify deny + auth/skip_url exact payload
const { chromium } = require('./browser.cjs')
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    route.continue({ headers })
  })
  let verified = null
  let skipBody = null
  await page.addInitScript(() => {
    window.Site = { ...(window.Site || {}), authscheme: 'iam' }
  })
  await page.route('**/api/v3/auth/verify', async (route) => {
    verified = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: true, data: [{ ...(verified.resources?.[0] || {}), is_pass: false }] }) })
  })
  await page.route('**/api/v3/auth/skip_url', async (route) => {
    skipBody = route.request().postDataJSON()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: true, data: 'https://iam.example/apply/b37' }) })
  })
  try {
    await page.goto('http://localhost:8090/#/resource/cloud-area', { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    const text = await page.locator('body').textContent()
    if (!text.includes('无操作权限')) throw new Error('IAM deny 未显示无操作权限')
    if (!verified?.resources?.length || verified.auths) throw new Error('auth/verify 未使用 resources 契约')
    console.log('✓ IAM deny: auth/verify resources 契约 + permission 视图')
    const apply = page.getByRole('button', { name: '去申请权限' })
    if (!(await apply.count())) throw new Error('缺少去申请权限按钮')
    const popup = await context.waitForEvent('page', { timeout: 5000 }).catch(() => null)
    await apply.click()
    await page.waitForTimeout(500)
    if (!skipBody?.system_id || !skipBody.actions?.length) throw new Error('auth/skip_url 未收到 IamPermission payload')
    console.log('✓ auth/skip_url 收到 IamPermission payload 并触发申请动作')
    await popup?.close()
  } finally {
    await browser.close()
  }
})().catch((error) => { console.error(`✗ IAM deny matrix: ${error.message}`); process.exit(1) })
