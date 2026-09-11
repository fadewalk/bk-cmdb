// B29: 模型拓扑方向箭头、关联类型抽屉壳层、全局 logo 回归
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const errors = []
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
    await page.goto(`${BASE}/#/model/topology`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForFunction(() => document.querySelectorAll('.topo-edge').length > 0, null, { timeout: 15000 })
    await page.waitForTimeout(500)

    const topology = await page.evaluate(() => {
      const lines = [...document.querySelectorAll('.topo-edge')]
      const nodes = [...document.querySelectorAll('.topo-node')]
      const centers = nodes.map((node) => ({
        x: parseFloat(node.style.left) + 27.5,
        y: parseFloat(node.style.top) + 27.5
      }))
      return {
        edgeCount: lines.length,
        markerEndCount: lines.filter((line) => line.getAttribute('marker-end')).length,
        markerStartCount: lines.filter((line) => line.getAttribute('marker-start')).length,
        endpointAtNodeCenter: lines.some((line) => {
          const x1 = Number(line.getAttribute('x1'))
          const y1 = Number(line.getAttribute('y1'))
          const x2 = Number(line.getAttribute('x2'))
          const y2 = Number(line.getAttribute('y2'))
          return centers.some((center) => (Math.hypot(x1 - center.x, y1 - center.y) < 0.1)
            || (Math.hypot(x2 - center.x, y2 - center.y) < 0.1))
        })
      }
    })
    assert(topology.edgeCount > 0, '拓扑没有渲染关系边')
    assert(topology.markerEndCount > 0 || topology.markerStartCount > 0, `拓扑关系边没有方向 marker: ${JSON.stringify(topology)}`)
    assert(!topology.endpointAtNodeCenter, `关系边端点仍落在节点中心: ${JSON.stringify(topology)}`)

    const logo = await page.locator('.logo-icon').getAttribute('src')
    assert(logo === '/static/logo.svg' || logo === '/logo.svg', `顶部 logo 未使用老版资源: ${logo}`)

    await page.goto(`${BASE}/#/model/association`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.locator('button').filter({ hasText: '新建' }).first().click()
    await page.waitForFunction(() => {
      const drawer = document.querySelector('.association-drawer')
      return drawer && getComputedStyle(drawer).visibility !== 'hidden'
    }, null, { timeout: 10000 })
    const drawerStyle = await page.evaluate(() => {
      const drawer = document.querySelector('.association-drawer')
      const header = drawer?.querySelector('.el-drawer__header')
      const footer = drawer?.querySelector('.drawer-footer')
      return {
        headerBorder: header && getComputedStyle(header).borderBottomStyle,
        footerBorder: footer && getComputedStyle(footer).borderTopStyle,
        bodyPaddingTop: drawer && getComputedStyle(drawer.querySelector('.el-drawer__body')).paddingTop
      }
    })
    assert(drawerStyle.headerBorder === 'solid', `关联类型抽屉顶部未对齐: ${JSON.stringify(drawerStyle)}`)
    assert(drawerStyle.footerBorder === 'solid', `关联类型抽屉底部未对齐: ${JSON.stringify(drawerStyle)}`)
    assert(drawerStyle.bodyPaddingTop === '20px', `关联类型抽屉内容间距未对齐: ${JSON.stringify(drawerStyle)}`)

    assert(errors.length === 0, errors.join('\n'))
    console.log(`✓ B29 拓扑箭头、关联类型抽屉壳层、全局 logo 回归通过 (${topology.edgeCount} edges)`)
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(`✗ B29 模型关系视觉契约回归失败: ${error.message}`)
  process.exit(1)
})
