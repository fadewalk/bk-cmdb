// B24 首页高级筛选复刻回归:侧滑打开/预填、无效文本气泡、条件提交 URL 与请求体、深链恢复
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []
const bodies = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// hash 路由的 query 在 fragment 内,需从 hash 中解析
function hashQuery(page) {
  const hash = new URL(page.url()).hash.replace(/^#/, '')
  const [, query = ''] = hash.split('?')
  return new URLSearchParams(query)
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
  page.on('request', (request) => {
    if (request.url().includes('findmany/hosts/search/resource') && request.method() === 'POST') {
      bodies.push(request.postData())
    }
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })

  const drawer = page.locator('.advanced-host-filter')

  try {
    // 1. 首页输入 IP → 高级筛选:不导航,侧滑打开且 IP 预填、精确默认勾选
    await page.goto(`${BASE}/#/index`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.locator('.index-home .search-input').fill('10.0.0.5')
    await page.locator('a').filter({ hasText: '高级筛选' }).click()
    await page.waitForTimeout(500)
    assert((await page.url()).includes('#/index'), `不应导航: ${page.url()}`)
    assert(await drawer.count() > 0, '侧滑未打开')
    const ipText = await drawer.locator('textarea').inputValue()
    assert(ipText === '10.0.0.5', `IP 未预填: ${ipText}`)
    const exactChecked = await drawer.getByText('精确', { exact: true }).locator('..').locator('input').isChecked().catch(() => false)
    assert(exactChecked, '精确未默认勾选')

    // 2. 查询 → 旧版 URL 契约 adv/ip/scope,主机页自动恢复侧滑,请求体带 equal 精确规则
    bodies.length = 0
    await drawer.locator('button').filter({ hasText: '查询' }).click()
    await page.waitForTimeout(1200)
    const query = hashQuery(page)
    const hash = new URL(page.url()).hash
    assert(hash.startsWith('#/resource/host'), `查询未跳转主机页: ${hash}`)
    assert(query.get('adv') === '1', `缺少 adv=1: ${hash}`)
    assert(query.get('scope') === 'all', `缺少 scope=all: ${hash}`)
    assert((query.get('ip') || '').includes('text=10.0.0.5'), `ip query 缺少文本: ${hash}`)
    assert(await drawer.count() > 0, '主机页未自动恢复侧滑')
    const restoredIp = await drawer.locator('textarea').inputValue()
    assert(restoredIp === '10.0.0.5', `主机页侧滑 IP 未恢复: ${restoredIp}`)
    const listBody = bodies.at(-1) || ''
    assert(listBody.includes('"bk_host_innerip"') && listBody.includes('"$eq"'), `请求体缺少 IP 精确规则: ${listBody.slice(0, 300)}`)

    // 3. 关闭侧滑后由漏斗按钮重开,默认条件行存在;添加条件(操作系统名称 属于 linux)→ 提交后侧滑关闭且不被 watch 重开,URL 带 filter
    await drawer.locator('.sideslider-collapse').click()
    await page.waitForTimeout(400)
    await page.locator('.option-filter').click()
    await page.waitForTimeout(600)
    const defaultText = await drawer.textContent()
    assert(defaultText.includes('集群名') && defaultText.includes('模块名') && defaultText.includes('主要维护人') && defaultText.includes('管控区域'), `默认条件行缺失: ${defaultText.slice(0, 200)}`)
    // 旧版值控件形态:字符多值 = tag 输入(占位 请输入xx),用户字段带「我」快捷键
    assert(defaultText.includes('请输入集群名') && defaultText.includes('请输入模块名'), '字符条件行缺少 请输入xx 占位')
    assert(await drawer.locator('.item-me').filter({ hasText: '我' }).count() >= 2, '用户字段缺少「我」快捷键')
    const valueWidths = await drawer.locator('.item-value').evaluateAll((els) => els
      .filter((el) => el.offsetParent !== null)
      .map((el) => Math.round(el.getBoundingClientRect().width)))
    assert(valueWidths.length >= 5 && Math.min(...valueWidths) >= 150, `值控件被压窄: ${valueWidths.join(',')}`)
    await drawer.locator('.field-picker input').click()
    await page.waitForTimeout(600)
    await page.locator('.el-select-dropdown:visible').getByText('操作系统名称', { exact: true }).first().click()
    await page.waitForTimeout(300)
    // 字符类默认操作符「属于」:点该行值控件展开后键入回车建标签(旧版 tag-input 行为)
    const osRow = drawer.locator('.filter-item').filter({ hasText: '操作系统名称' })
    await osRow.locator('.item-value').click()
    await page.keyboard.type('linux')
    await page.waitForTimeout(500)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    bodies.length = 0
    await drawer.locator('button').filter({ hasText: '查询' }).click()
    await page.waitForTimeout(1200)
    const query3 = hashQuery(page)
    const hash3 = new URL(page.url()).hash
    assert((query3.get('filter') || '').includes('bk_os_name.in=linux'), `filter query 缺条件: ${hash3}`)
    const visibleDrawer = await page.locator('.advanced-host-filter').evaluate((el) => el.offsetParent !== null).catch(() => false)
    assert(!visibleDrawer, '提交后侧滑应关闭(不得被路由 watch 重开)')
    const body3 = bodies.at(-1) || ''
    assert(body3.includes('"bk_os_name"') && body3.includes('"linux"'), `请求体缺少 OS 条件: ${body3.slice(0, 300)}`)

    // 4. 无效文本气泡:固资编号分支预置 bk_asset_id in 条件
    await page.goto(`${BASE}/#/index`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.locator('.index-home .search-input').fill('asset-001,asset-002')
    await page.locator('a').filter({ hasText: '高级筛选' }).click()
    await page.waitForTimeout(400)
    assert(await page.locator('.picking-popover-content').count() > 0, '无效文本未弹选择气泡')
    await page.locator('.picking-popover-content button').filter({ hasText: '固资编号' }).click()
    await page.waitForTimeout(500)
    assert(await drawer.count() > 0, '固资编号分支未打开侧滑')
    const drawerText = await drawer.textContent()
    assert(drawerText.includes('固资编号'), '侧滑缺少固资编号条件行')
    assert(drawerText.includes('asset-001'), '固资编号条件值未预置')

    // 5. 深链直达:adv=1 + filter 恢复侧滑与条件值
    await page.goto(`${BASE}/#/resource/host?adv=1&scope=all&filter=bk_os_name.in%3Dlinux`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1000)
    assert(await page.locator('.advanced-host-filter').count() > 0, '深链未自动打开侧滑')
    const deepText = await page.locator('.advanced-host-filter').textContent()
    assert(deepText.includes('操作系统名称') && deepText.includes('linux'), `深链条件未恢复: ${deepText.slice(0, 200)}`)

    assert(errors.length === 0, errors.join('\n'))
    console.log('✓ 首页高级筛选:打开/预填/气泡/URL契约/请求体/深链恢复 全部通过')
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(`✗ B24 首页高级筛选回归失败: ${error.message}`)
  process.exit(1)
})
