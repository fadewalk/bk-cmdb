// B32: 业务/项目/业务集列表对齐老版表格契约 —— 列配置抽屉/usercustom 持久化/排序/分页/样式
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []
const usercustomBodies = []
const bizListBodies = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function resetUsercustom(request, keys) {
  const data = {}
  for (const key of keys) data[key] = []
  await request.post(`${BASE}/api/v3/usercustom`, { data })
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
    if (request.url().includes('/biz/search/') && request.method() === 'POST') bizListBodies.push(request.postData())
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`) })

  const headerTexts = () => page.locator('.el-table thead th').allTextContents()

  try {
    // ============ 1. 业务列表 ============
    await resetUsercustom(page.request, ['biz_custom_table_columns'])
    await page.goto(`${BASE}/#/resource/business`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForSelector('.el-table thead th', { timeout: 15000 })
    await page.waitForTimeout(500)

    // 默认表头:固定 ID/业务名 在前 + 优先前列;齿轮在工具栏
    let headers = await headerTexts()
    assert(headers.some((t) => t.trim() === 'ID'), `业务表缺 ID 列: ${headers}`)
    assert(headers.some((t) => t.includes('业务名')), `业务表缺 业务名: ${headers}`)
    assert(headers.some((t) => t.includes('运维人员')), `业务表缺 运维人员: ${headers}`)
    const gear = page.locator('.legacy-toolbar-gear')
    assert(await gear.count() === 1, '业务表工具栏缺配置齿轮')
    // 单元格:ID 蓝字链接,无 el-link(老版纯文本)
    const firstRow = page.locator('.el-table tbody tr').first()
    assert(await firstRow.locator('.cell-link').count() >= 1, '业务表 ID 列缺蓝字链接')
    assert(await firstRow.locator('.el-link').count() === 0, '业务表不应使用 el-link')
    console.log('✓ 业务列表:默认表头 + 齿轮 + 单元格契约')

    // 列配置抽屉:固定列锁定,添加 创建时间 并应用
    await gear.click()
    const drawer = page.locator('.columns-config-drawer')
    await page.waitForTimeout(600)
    assert(await drawer.isVisible(), '业务列配置抽屉未打开')
    assert((await drawer.textContent()).includes('已选属性'), '业务抽屉缺 已选属性')
    await drawer.locator('input').fill('创建时间')
    await page.waitForTimeout(300)
    await drawer.locator('.property-item').filter({ hasText: '创建时间' }).first().click()
    await page.waitForTimeout(300)
    assert(await drawer.locator('.property-item.disabled').filter({ hasText: '业务名' }).count() === 1, '业务固定列(业务名)未锁定')
    usercustomBodies.length = 0
    await drawer.locator('button').filter({ hasText: '应用' }).click()
    await page.waitForTimeout(800)
    assert(usercustomBodies.some((b) => b.includes('biz_custom_table_columns') && b.includes('bk_created_at')),
      `业务列配置未持久化: ${usercustomBodies.join('|').slice(0, 160)}`)
    headers = await headerTexts()
    assert(headers.some((t) => t.includes('创建时间')), `业务表头未更新: ${headers}`)
    console.log('✓ 业务列表:列配置抽屉 + usercustom 持久化')

    // 刷新保留 + 还原默认
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('.el-table thead th', { timeout: 15000 })
    await page.waitForTimeout(500)
    assert((await headerTexts()).some((t) => t.includes('创建时间')), '业务自定义列刷新后丢失')
    await page.locator('.legacy-toolbar-gear').click()
    await page.waitForTimeout(600)
    await page.locator('.columns-config-drawer button').filter({ hasText: '还原默认' }).click()
    await page.waitForTimeout(400)
    await page.locator('.el-message-box button').filter({ hasText: '确定' }).click()
    await page.waitForTimeout(800)
    assert(!(await headerTexts()).some((t) => t.includes('创建时间')), '业务列还原默认失败')
    console.log('✓ 业务列表:刷新保留 + 还原默认')

    // 排序契约:点表头 → 请求 page.sort(老版为内部 sort,不写 URL)
    bizListBodies.length = 0
    await page.locator('.el-table thead th').filter({ hasText: '业务名' }).locator('.cell').click()
    await page.waitForTimeout(800)
    let body = JSON.parse(bizListBodies.at(-1) || '{}')
    assert(body.page?.sort === 'bk_biz_name', `业务排序未下发: ${body.page?.sort}`)
    await page.locator('.el-table thead th').filter({ hasText: '业务名' }).locator('.cell').click()
    await page.waitForTimeout(800)
    body = JSON.parse(bizListBodies.at(-1) || '{}')
    assert(body.page?.sort === '-bk_biz_name', `业务降序未下发: ${body.page?.sort}`)
    // 分页选项含 500
    await page.locator('.table-footer .el-select').click()
    await page.waitForTimeout(400)
    const options = await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').allTextContents()
    assert(options.some((t) => t.trim() === '500'), `业务分页选项缺 500: ${options}`)
    console.log('✓ 业务列表:排序下发 + 分页 20/50/100/500')

    // ============ 2. 业务集 / 项目:共享抽屉 + usercustom 持久化 smoke ============
    await resetUsercustom(page.request, ['biz_set_custom_table_columns', 'pro_custom_table_columns'])

    await page.goto(`${BASE}/#/resource/biz-set`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForSelector('.el-table thead th', { timeout: 15000 })
    await page.locator('.legacy-toolbar-gear').click()
    await page.waitForTimeout(600)
    assert(await page.locator('.columns-config-drawer').isVisible(), '业务集列配置抽屉未打开')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    console.log('✓ 业务集:共享列配置抽屉')

    await page.goto(`${BASE}/#/resource/project`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForSelector('.el-table thead th', { timeout: 15000 })
    await page.locator('.legacy-toolbar-gear').click()
    await page.waitForTimeout(600)
    assert(await page.locator('.columns-config-drawer').isVisible(), '项目列配置抽屉未打开')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    console.log('✓ 项目:共享列配置抽屉')

    assert(errors.length === 0, errors.join('\n'))
    console.log('✓ B32 业务/项目/业务集表格契约全部通过')
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(`✗ B32 表格契约回归失败: ${error.message}`)
  process.exit(1)
})
