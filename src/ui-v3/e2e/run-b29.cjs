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
      const edges = [...document.querySelectorAll('.topo-edge')]
      const nodes = [...document.querySelectorAll('.topo-node')]
      const centers = nodes.map((node) => ({
        x: parseFloat(node.style.left) + 27.5,
        y: parseFloat(node.style.top) + 27.5
      }))
      const startPoints = edges.map((edge) => {
        const match = (edge.getAttribute('d') || '').match(/^M\s*([\d.-]+)\s+([\d.-]+)/)
        return match ? { x: Number(match[1]), y: Number(match[2]) } : null
      })
      return {
        edgeCount: edges.length,
        pathCount: edges.filter((edge) => /^M/.test(edge.getAttribute('d') || '')).length,
        markerEndCount: edges.filter((edge) => edge.getAttribute('marker-end')).length,
        markerStartCount: edges.filter((edge) => edge.getAttribute('marker-start')).length,
        startAtNodeCenter: startPoints.some((point) => point
          && centers.some((center) => Math.hypot(point.x - center.x, point.y - center.y) < 0.1)),
        distinctPaths: new Set(edges.map((edge) => edge.getAttribute('d'))).size
      }
    })
    assert(topology.edgeCount > 0, '拓扑没有渲染关系边')
    assert(topology.pathCount === topology.edgeCount, `关系边缺少贝塞尔路径: ${JSON.stringify(topology)}`)
    assert(topology.markerEndCount > 0 || topology.markerStartCount > 0, `拓扑关系边没有方向 marker: ${JSON.stringify(topology)}`)
    assert(!topology.startAtNodeCenter, `关系边端点仍落在节点中心: ${JSON.stringify(topology)}`)
    assert(topology.distinctPaths === topology.edgeCount, `关系边路径存在重叠: ${JSON.stringify(topology)}`)

    // 节点聚焦:悬浮自定义模型节点,相连边高亮、无关边弱化
    const focusLabel = page.locator('.topo-node-label').filter({ hasText: 'b25' }).first()
    if (await focusLabel.count()) {
      const labelBox = await focusLabel.boundingBox()
      await page.mouse.move(labelBox.x + labelBox.width / 2, labelBox.y - 36.5)
      await page.waitForTimeout(200)
      const focus = await page.evaluate(() => ({
        linked: document.querySelectorAll('.topo-edge.linked').length,
        dimmed: document.querySelectorAll('.topo-edge.dimmed').length
      }))
      assert(focus.linked > 0, `节点悬浮未高亮相连边: ${JSON.stringify(focus)}`)
      assert(focus.dimmed > 0, `节点悬浮未弱化无关边: ${JSON.stringify(focus)}`)
      await page.mouse.move(10, 10)
      await page.waitForTimeout(200)
    }

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
