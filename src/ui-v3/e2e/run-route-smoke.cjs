// 阶段 0 路由回归：验证跨模块入口不会落到 404，并保留关键 query 上下文。
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function routePath(page) {
  return new URL(page.url()).hash.replace(/^#/, '') || '/'
}

// hash 路由 page.goto 到同源不同 hash 不触发真实导航,必须走 router 推进并等 hash 稳定。
// 重定向路由(如 host-landing)会立即改写 hash,因此用 expectHash 指定预期最终地址。
async function openHash(page, hash, expectHash = hash, timeout = 30000) {
  console.log(`  … 导航 ${hash}${expectHash !== hash ? ` (期望重定向到 ${expectHash})` : ''}`)
  await page.evaluate((url) => { window.location.assign(url) }, `${BASE}/${hash}`)
  await page.waitForFunction(
    (expected) => window.location.href.split('#')[1] === expected,
    expectHash.replace(/^#/, ''),
    { timeout }
  )
  // hash 稳定后再等一拍,让旧页面的异步请求排队结束
  await page.waitForTimeout(300)
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    route.continue({ headers })
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })

  try {
    await page.goto(`${BASE}/#/index`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.locator('input').first().fill('10.0.0.1')
    await page.locator('button').filter({ hasText: '搜索' }).click()
    await page.waitForTimeout(500)
    assert(routePath(page).startsWith('/resource/host'), `首页搜索错误跳转: ${routePath(page)}`)
    assert(routePath(page).includes('ip='), `首页搜索丢失 ip query: ${routePath(page)}`)
    console.log('✓ 首页主机搜索跳转 /resource/host 并保留 ip')

    await page.goto(`${BASE}/#/index`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.locator('a').filter({ hasText: '高级筛选' }).click()
    await page.waitForTimeout(500)
    assert(routePath(page).startsWith('/resource/host'), `高级筛选错误跳转: ${routePath(page)}`)
    assert(routePath(page).includes('advanced='), `高级筛选丢失 advanced query: ${routePath(page)}`)
    console.log('✓ 首页高级筛选跳转 /resource/host 并保留 advanced')

    await page.goto(`${BASE}/#/resource/business`, { waitUntil: 'networkidle', timeout: 30000 })
    const topoButton = page.locator('button').filter({ hasText: '查看拓扑' }).first()
    if (await topoButton.count()) {
      await topoButton.click()
      await page.waitForTimeout(500)
      assert(routePath(page).startsWith('/business/topo'), `业务列表拓扑错误跳转: ${routePath(page)}`)
      assert(routePath(page).includes('biz='), `业务列表拓扑丢失 biz query: ${routePath(page)}`)
      console.log('✓ 业务列表拓扑跳转 /business/topo 并保留 biz')
    } else {
      console.log('- 业务列表无数据，跳过行级拓扑入口；canonical 路由已加载')
    }

    await openHash(page, '#/business/topo')
    assert(!routePath(page).startsWith('/404'), `业务拓扑 canonical 路由落到 404: ${routePath(page)}`)
    await openHash(page, '#/business/1/index')
    assert(!routePath(page).startsWith('/404'), `旧版业务拓扑深链落到 404: ${routePath(page)}`)
    await openHash(page, '#/resource/host/1')
    assert(!routePath(page).startsWith('/404'), `旧版资源主机详情深链落到 404: ${routePath(page)}`)
    await openHash(page, '#/business/1/host/1')
    assert(!routePath(page).startsWith('/404'), `旧版业务主机详情深链落到 404: ${routePath(page)}`)
    await openHash(page, '#/business-set/1/index')
    assert(!routePath(page).startsWith('/404'), `旧版业务集拓扑深链落到 404: ${routePath(page)}`)
    await openHash(page, '#/business-set/1/host/1')
    assert(!routePath(page).startsWith('/404'), `旧版业务集主机详情深链落到 404: ${routePath(page)}`)
    await openHash(page, '#/host-landing/10.0.0.1/0', '#/resource/host?ip=10.0.0.1&cloudId=0')
    assert(routePath(page).startsWith('/resource/host'), `旧版 IP 落地页未重定向到主机资源: ${routePath(page)}`)
    assert(routePath(page).includes('ip='), `旧版 IP 落地页丢失 ip 参数: ${routePath(page)}`)
    await openHash(page, '#/resource/instance/bk_switch')
    assert(!routePath(page).startsWith('/404'), `模型实例页落到 404: ${routePath(page)}`)
    const table = await page.locator('.el-table').count()
    assert(table > 0, '模型实例页缺少表格')
    await openHash(page, '#/resource/instance/bk_switch/1', '#/resource/instance/bk_switch?instId=1')
    assert(routePath(page).startsWith('/resource/instance/bk_switch'), `旧版实例详情深链未兼容: ${routePath(page)}`)
    assert(routePath(page).includes('instId=1'), `旧版实例详情深链丢失 instId: ${routePath(page)}`)
    await openHash(page, '#/business/1/service/template/create')
    assert(!routePath(page).startsWith('/404'), `服务模板创建深链落到 404: ${routePath(page)}`)
    await openHash(page, '#/business/1/service/template/details/1')
    assert(!routePath(page).startsWith('/404'), `服务模板详情深链落到 404: ${routePath(page)}`)
    await openHash(page, '#/business/1/service/operational/template/1', '#/business/1/service/template/details/1')
    assert(routePath(page).includes('/service/template/details/1'), `旧版 operational 链接未重定向: ${routePath(page)}`)
    await openHash(page, '#/platform/global-config?tab=id-generate')
    assert(!routePath(page).startsWith('/404'), `全局配置 tab 深链落到 404: ${routePath(page)}`)
    const idTabActive = await page.locator('.box-tab.active').textContent()
    assert((idTabActive || '').includes('ID生成器'), `全局配置 tab 深链未激活 ID 生成器: ${idTabActive}`)
    await openHash(page, '#/platform-management/global-config', '#/platform/global-config')
    assert(routePath(page).startsWith('/platform/global-config'), `旧版平台管理路径未重定向: ${routePath(page)}`)
    await openHash(page, '#/business/1/host-apply/template')
    assert(!routePath(page).startsWith('/404') && routePath(page).includes('mode=template'), `旧版 host-apply 深链未兼容: ${routePath(page)}`)
    await openHash(page, '#/business/1/set/sync/5', '#/business/set-template?action=sync&templateId=5')
    assert(routePath(page).startsWith('/business/set-template'), `旧版 set-sync 深链未兼容: ${routePath(page)}`)
    await openHash(page, '#/business/1/synchronous/module/7/12,13', '#/business/sync?template=7&modules=12,13')
    assert(!routePath(page).startsWith('/404') && routePath(page).includes('/business/sync'), `旧版业务同步深链未兼容: ${routePath(page)}`)
    await openHash(page, '#/resource/host')
    assert(!routePath(page).startsWith('/404'), `主机资源 canonical 路由落到 404: ${routePath(page)}`)
    console.log('✓ 旧版业务/业务集/资源主机深链和 IP 落地页可加载')
    console.log('✓ 模型实例页及旧版实例详情深链可加载')

    assert(errors.length === 0, errors.join('\n'))
    console.log('✓ 路由入口 smoke 无 pageerror/console.error')
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(`✗ 路由入口 smoke 失败: ${error.message}`)
  process.exit(1)
})
