// Error matrix mock suite. Each case uses a fresh browser context to avoid
// capability-store/session state leaking between scenarios.
const { chromium } = require('./browser.cjs')
const { ok, error, kube, fullText } = require('./fixtures/core-domains.cjs')

async function common(page) {
  await page.addInitScript(() => localStorage.setItem('selectedBusiness', '2'))
  await page.route('**/userinfo', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: true, data: { username: 'mock' } }) }))
  await page.route('**/api/v3/biz/search/0', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: 1, info: [{ bk_biz_id: 2, bk_biz_name: 'Mock Biz' }] })) }))
  await page.route('**/api/v3/findmany/biz_set', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: 0, info: [] })) }))
  await page.route('**/api/v3/usercustom/user/search', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({})) }))
}
async function check(label, fn) { const browser = await chromium.launch({ headless: true }); try { await fn(browser); console.log(`✓ ${label}`) } finally { await browser.close() } }

;(async () => {
  // IAM verify network error: route should fail closed to permission status.
  await check('IAM verify network error fail-closed', async (browser) => {
    const page = await (await browser.newContext()).newPage(); await common(page)
    await page.addInitScript(() => { window.Site = { authscheme: 'iam' } })
    await page.route('**/api/v3/auth/verify', (r) => r.abort())
    await page.goto('http://localhost:8090/#/resource/cloud-area', { waitUntil: 'load' }); await page.waitForTimeout(1200)
    if (!(await page.locator('body').textContent()).includes('无操作权限')) throw new Error('network error did not deny')
  })

  // IAM skip URL failure: stay on page and show failure message.
  await check('IAM skip_url error stays on page', async (browser) => {
    const page = await (await browser.newContext()).newPage(); await common(page)
    await page.addInitScript(() => { window.Site = { authscheme: 'iam' } })
    await page.route('**/api/v3/auth/verify', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok([{ resource_type: 'cloud_area', action: 'find', is_pass: false }])) }))
    await page.route('**/api/v3/auth/skip_url', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify(error(500, 'skip url unavailable')) }))
    await page.goto('http://localhost:8090/#/resource/cloud-area', { waitUntil: 'load' }); await page.waitForTimeout(1000)
    await page.getByRole('button', { name: '去申请权限' }).click(); await page.waitForTimeout(500)
    const skipErrors = (await page.locator('.el-message').allTextContents()).join('|')
    if (!skipErrors.includes('失败') && !skipErrors.includes('500')) throw new Error(`skip_url error not visible: ${skipErrors}`)
    if (!(await page.url()).includes('/resource/cloud-area')) throw new Error('skip_url failure navigated away')
  })

  // K8s 500: capability page must show explicit blocked state, not crash.
  await check('K8s 500 becomes blocked state', async (browser) => {
    const page = await (await browser.newContext()).newPage(); await common(page)
    await page.route('**/api/v3/findmany/kube/pod', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify(error(500, 'kube unavailable')) }))
    await page.route('**/api/v3/find/full_text', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify(error(500, 'es unavailable')) }))
    await page.goto('http://localhost:8090/#/business/2/pod', { waitUntil: 'load' }); await page.waitForTimeout(1200)
    const text = await page.locator('body').textContent(); if (!text.includes('数据链路')) throw new Error('blocked copy missing')
  })

  // ES empty result: healthy tag + empty state.
  await check('ES empty result renders empty state', async (browser) => {
    const page = await (await browser.newContext()).newPage(); await common(page)
    await page.route('**/api/v3/findmany/kube/pod', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: 0, info: [] })) }))
    await page.route('**/api/v3/find/full_text', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ total: 0, aggregations: [], hits: [], attrs: { attributes: {}, groups: {} } })) }))
    await page.goto('http://localhost:8090/#/full-text-search', { waitUntil: 'load' }); await page.waitForTimeout(900)
    await page.locator('.search-row input').fill('empty'); await page.locator('.search-row button').click(); await page.waitForTimeout(500)
    if (!(await page.locator('.el-empty').last().textContent()).includes('未搜索到结果')) throw new Error('empty state missing')
  })

  // K8s empty list: healthy tag + empty Pod state.
  await check('K8s empty list renders empty state', async (browser) => {
    const page = await (await browser.newContext()).newPage(); await common(page)
    await page.route('**/api/v3/findmany/kube/pod', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: 0, info: [] })) }))
    await page.route('**/api/v3/find/full_text', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fullText) }))
    await page.goto('http://localhost:8090/#/business/2/pod', { waitUntil: 'load' }); await page.waitForTimeout(1000)
    if (!(await page.locator('.el-empty').last().textContent()).includes('暂无 Pod')) throw new Error('Pod empty state missing')
  })

  console.log('core-domain error matrix passed')
})().catch((error) => { console.error(`✗ core-domain error matrix: ${error.message}`); process.exit(1) })
