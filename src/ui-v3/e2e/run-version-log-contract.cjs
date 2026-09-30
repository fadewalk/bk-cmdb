// 版本日志契约回归:帮助菜单 → /version-log 必须走 web_server 根路径接口
// (老版契约 window.API_HOST + findmany/changelog);/api/v3 下的 changelog 会落
// web_server 代理 → apiserver rewrite failed 500,属于错误契约,直接 abort 记红。
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []

const LIST = [
  { version: 'v3.14.0', time: '2026-09-30', is_current: true },
  { version: 'v3.10.16', time: '2022-05-17', is_current: false }
]
const DETAIL_MARKDOWN = '# v3.14.0\n\n- 修复版本日志接口契约\n'

const listCalls = []
const detailCalls = []
const forbiddenCalls = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  context.setDefaultTimeout(15000)
  const page = await context.newPage()

  // 根路径契约 mock(先注册;/api/v3 红线后注册以获得更高优先级)
  await page.route('**/findmany/changelog*', (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname.startsWith('/api/')) {
      forbiddenCalls.push(route.request().url())
      return route.abort()
    }
    listCalls.push(route.request().url())
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ result: true, code: 0, message: 'success', data: LIST })
    })
  })
  await page.route('**/find/changelog/detail*', (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname.startsWith('/api/')) {
      forbiddenCalls.push(route.request().url())
      return route.abort()
    }
    detailCalls.push({ url: route.request().url(), body: route.request().postDataJSON() || null })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ result: true, code: 0, message: 'success', data: DETAIL_MARKDOWN })
    })
  })
  await page.route('**/api/v3/findmany/changelog*', (route) => {
    forbiddenCalls.push(route.request().url())
    return route.abort()
  })
  await page.route('**/api/v3/find/changelog/detail*', (route) => {
    forbiddenCalls.push(route.request().url())
    return route.abort()
  })

  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })

  try {
    await page.goto(`${BASE}/#/index`, { waitUntil: 'networkidle', timeout: 30000 })

  // 帮助菜单 → 版本日志
  await page.locator('.info-help').click()
  await page.locator('.el-dropdown-menu__item').filter({ hasText: '版本日志' }).click()
  await page.waitForURL(/#\/version-log/, { timeout: 15000 })
  console.log('✓ 帮助 → 版本日志 跳转 #/version-log')

  // 契约:列表必须打 web_server 根路径,禁止 /api/v3
  await page.waitForFunction(() => document.querySelectorAll('.version-item').length > 0, null, { timeout: 10000 })
  assert(forbiddenCalls.length === 0, `changelog 请求落进 /api/v3(错误契约): ${forbiddenCalls.join(', ')}`)
  assert(listCalls.length === 1, `findmany/changelog 应恰好请求一次,实际 ${listCalls.length}`)
  assert(new URL(listCalls[0]).pathname === '/findmany/changelog', `列表请求路径错误: ${listCalls[0]}`)
  console.log(`✓ 列表走根路径 ${new URL(listCalls[0]).pathname}`)

  // 列表渲染 + 当前版本标记(服务端 is_current 契约)
  const items = page.locator('.version-item')
  assert(await items.count() === 2, `应渲染 2 个版本,实际 ${await items.count()}`)
  assert(await items.nth(0).locator('.version-item-title').innerText() === 'v3.14.0', '首项版本号应为 v3.14.0')
  assert(await items.nth(0).locator('.el-tag').filter({ hasText: '当前版本' }).count() === 1, '当前版本缺 is_current 标记')
  assert(await items.nth(0).locator('.version-item-date').innerText() === '2026-09-30', '首项日期应为 2026-09-30')
  console.log('✓ 列表渲染含当前版本标记')

  // 详情契约:自动加载当前版本,body {version}
  await page.waitForFunction(() => document.querySelector('.markdown-container')?.innerText.includes('修复版本日志接口契约'), null, { timeout: 10000 })
  assert(detailCalls.length === 1, `find/changelog/detail 应恰好请求一次,实际 ${detailCalls.length}`)
  assert(new URL(detailCalls[0].url).pathname === '/find/changelog/detail', `详情请求路径错误: ${detailCalls[0].url}`)
  assert(detailCalls[0].body?.version === 'v3.14.0', `详情 payload 应为 {version:'v3.14.0'},实际 ${JSON.stringify(detailCalls[0].body)}`)
  assert(await page.locator('.markdown-container h1').innerText() === 'v3.14.0', '详情标题渲染错误')
  console.log(`✓ 详情走根路径且 payload ${JSON.stringify(detailCalls[0].body)}`)

  // 切换版本 → 重新请求详情
  await items.nth(1).click()
  await page.waitForTimeout(600)
  assert(detailCalls.length === 2, `切换版本应再次请求详情,实际 ${detailCalls.length} 次`)
  assert(detailCalls[1].body?.version === 'v3.10.16', `切换后 payload 应为 v3.10.16,实际 ${JSON.stringify(detailCalls[1].body)}`)
  assert(await page.locator('.version-item.active .version-item-title').innerText() === 'v3.10.16', '切换后 active 项未更新')
  console.log('✓ 切换版本重新请求详情且 active 高亮迁移')

  assert(errors.length === 0, `页面错误: ${errors.join(' | ')}`)

  console.log('版本日志契约 runner 全部通过')
  } finally {
    await browser.close()
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
})
