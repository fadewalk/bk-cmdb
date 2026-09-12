// B31: 资源主机表格对齐老版 —— 表头列契约 / 列配置抽屉 / 排序 / 分页
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []
const usercustomBodies = []
const listBodies = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

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
    if (request.url().endsWith('/usercustom') && request.method() === 'POST') usercustomBodies.push(request.postData())
    if (request.url().includes('/findmany/hosts/search/resource') && request.method() === 'POST') listBodies.push(request.postData())
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`) })

  const headerTexts = () => page.locator('.el-table thead th').allTextContents()

  try {
    // 0. 重置列配置用户习惯,保证默认表头
    await page.request.post(`${BASE}/api/v3/usercustom`, { data: { resource_host_table_column_config: [] } })
    await page.goto(`${BASE}/#/resource/host`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForSelector('.el-table thead th', { timeout: 15000 })
    await page.waitForTimeout(500)

    // 1. 默认表头:固定列在前 + 优先级前6;设置齿轮存在
    let headers = await headerTexts()
    assert(headers.some((t) => t.trim() === 'ID'), `缺 ID 列: ${headers}`)
    assert(headers.some((t) => t.includes('内网IPv4')), `缺 内网IPv4: ${headers}`)
    assert(headers.some((t) => t.includes('内网IPv6')), `缺 内网IPv6: ${headers}`)
    assert(headers.some((t) => t.includes('管控区域')), `缺 管控区域: ${headers}`)
    assert(headers.some((t) => t.includes('业务拓扑')), `缺 业务拓扑: ${headers}`)
    assert(headers.some((t) => t.includes('主机名称')), `缺 主机名称: ${headers}`)
    const gear = page.locator('.el-table thead .col-setting-icon')
    assert(await gear.count() === 1, '表头缺列设置齿轮')
    console.log('✓ 默认表头六列 + 设置齿轮')

    // 2. 单元格契约:ID 蓝字链接,IP 纯文本(老版无 el-link)
    const firstRow = page.locator('.el-table tbody tr').first()
    assert(await firstRow.locator('.cell-link').count() >= 1, 'ID 列缺蓝字链接')
    assert(await firstRow.locator('.el-link').count() === 0, '单元格不应使用 el-link(IP 为纯文本)')
    console.log('✓ 单元格:ID 链接 / IP 纯文本')

    // 3. 列配置抽屉:搜索属性 + 已选属性 + 固定列不可移除;添加 操作系统名称 并应用
    await gear.click()
    const drawer = page.locator('.columns-config-drawer')
    await page.waitForTimeout(600)
    assert(await drawer.isVisible(), '列配置抽屉未打开')
    assert((await drawer.textContent()).includes('已选属性'), '抽屉缺 已选属性 区')
    const searchInput = drawer.locator('input')
    await searchInput.fill('操作系统名称')
    await page.waitForTimeout(300)
    await drawer.locator('.property-item').filter({ hasText: '操作系统名称' }).first().click()
    await page.waitForTimeout(300)
    assert(await drawer.locator('.property-item.disabled').filter({ hasText: '内网IPv4' }).count() === 1, '固定列(内网IPv4)未锁定')
    usercustomBodies.length = 0
    await drawer.locator('button').filter({ hasText: '应用' }).click()
    await page.waitForTimeout(800)
    assert(usercustomBodies.some((b) => b.includes('resource_host_table_column_config') && b.includes('bk_os_name')),
      `应用未持久化: ${usercustomBodies.join('|').slice(0, 200)}`)
    headers = await headerTexts()
    assert(headers.some((t) => t.includes('操作系统名称')), `应用后表头未更新: ${headers}`)
    console.log('✓ 列配置:添加列/应用/持久化')

    // 4. 刷新后列保留(usercustom 恢复)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('.el-table thead th', { timeout: 15000 })
    await page.waitForTimeout(500)
    headers = await headerTexts()
    assert(headers.some((t) => t.includes('操作系统名称')), '刷新后自定义列丢失')
    console.log('✓ 刷新后自定义列保留')

    // 5. 还原默认 → 确认 → 表头回默认
    await page.locator('.el-table thead .col-setting-icon').click()
    await page.waitForTimeout(600)
    await page.locator('.columns-config-drawer button').filter({ hasText: '还原默认' }).click()
    await page.waitForTimeout(400)
    await page.locator('.el-message-box button').filter({ hasText: '确定' }).click()
    await page.waitForTimeout(800)
    headers = await headerTexts()
    assert(!headers.some((t) => t.includes('操作系统名称')), `还原默认失败: ${headers}`)
    console.log('✓ 还原默认')

    // 默认无 sort 参数时,EP 表头第一次点击通常落升序(不同 Element Plus 版本默认顺序可能不同),断言只要求写入有效方向
    let query = hashQuery(page)
    let body = JSON.parse(listBodies.at(-1) || '{}')
    await page.locator('.el-table thead th').filter({ hasText: '主机名称' }).locator('.cell').click()
    await page.waitForFunction(() => /[?&]sort=-?bk_host_name/.test(window.location.hash), { timeout: 5000 })
    query = hashQuery(page)
    const firstSort = query.get('sort')
    assert(['bk_host_name', '-bk_host_name'].includes(firstSort), `第一次排序 sort 未写入 URL: ${page.url()}`)
    body = JSON.parse(listBodies.at(-1) || '{}')
    assert(body.page?.sort === firstSort, `请求排序错误: ${body.page?.sort}`)
    await page.locator('.el-table thead th').filter({ hasText: '主机名称' }).locator('.cell').click()
    await page.waitForTimeout(800)
    // 第二次应切换方向或清除;两者均必须与请求体保持一致
    query = hashQuery(page)
    const secondSort = query.get('sort') || 'bk_host_id'
    assert(['bk_host_id', 'bk_host_name', '-bk_host_name'].includes(secondSort), `第二次排序状态无效: ${page.url()}`)
    body = JSON.parse(listBodies.at(-1) || '{}')
    assert(body.page?.sort === secondSort, `第二次请求排序错误: ${body.page?.sort}`)
    console.log('✓ 排序 URL + 请求体契约')

    // 7. 分页选项含 500
    await page.locator('.table-footer .el-select').click()
    await page.waitForTimeout(400)
    const options = await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').allTextContents()
    assert(options.some((t) => t.trim() === '500'), `分页选项缺 500: ${options}`)
    console.log('✓ 分页 20/50/100/500')

    assert(errors.length === 0, errors.join('\n'))
    console.log('✓ B31 表格样式与列设置契约全部通过')
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(`✗ B31 表格契约回归失败: ${error.message}`)
  process.exit(1)
})
