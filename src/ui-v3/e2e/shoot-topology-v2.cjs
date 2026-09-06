// ModelTopology 详细交互测试
const { chromium } = require('./browser.cjs')
const path = require('path')
const fs = require('fs')
const OUT = path.join(__dirname, '../screenshots/topology-v2')
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('[err]', e.message))
  await page.route('**/*', (r) => { const h = { ...r.request().headers() }; delete h['if-none-match']; h['cache-control'] = 'no-cache'; r.continue({ headers: h }) })

  await page.goto('http://localhost:8090/#/model/topology', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: path.join(OUT, '01-initial.png') })
  console.log('shot 01 initial')

  // 1) 测试 hover node 弹出 tooltip
  const firstNode = page.locator('.node-g').first()
  await firstNode.hover({ timeout: 2000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, '02-hover-tooltip.png') })
  console.log('shot 02 hover tooltip')

  // 2) 测试拖动第一个节点
  const box = await firstNode.boundingBox()
  console.log('first node box:', box)
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 200, startY + 100, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, '03-after-drag.png') })
  console.log('shot 03 after drag')

  // 3) 测试再加载页面(验证位置持久化)
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: path.join(OUT, '04-after-reload.png') })
  console.log('shot 04 after reload (should keep dragged position)')

  // 4) 测试缩放(滚轮 + 按钮)
  const wrap = await page.locator('.graph-wrap').boundingBox()
  await page.mouse.move(wrap.x + wrap.width / 2, wrap.y + wrap.height / 2)
  await page.mouse.wheel(0, -300) // 滚轮上滚 = 放大
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, '05-zoom-in.png') })
  console.log('shot 05 zoom in')

  // 5) 测试还原(fitView)
  await page.locator('.icon-cc-fit').first().click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT, '06-fit-view.png') })
  console.log('shot 06 fit view')

  // 6) 测试画布平移(空白处拖动)
  const wrap2 = await page.locator('.graph-wrap').boundingBox()
  await page.mouse.move(wrap2.x + wrap2.width - 80, wrap2.y + wrap2.height / 2)
  await page.mouse.down()
  await page.mouse.move(wrap2.x + wrap2.width - 280, wrap2.y + wrap2.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, '07-pan.png') })
  console.log('shot 07 pan')

  // 7) 测试选中节点 → 显示右侧详情
  await page.locator('.icon-cc-fit').first().click() // 先还原
  await page.waitForTimeout(500)
  const node = page.locator('.node-g').first()
  await node.click({ timeout: 2000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, '08-node-selected.png') })
  console.log('shot 08 node selected')

  // 8) 测试 hover edge
  const edge = page.locator('.edge-line').first()
  await edge.hover({ timeout: 2000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(OUT, '09-edge-hover.png') })
  console.log('shot 09 edge hover')

  // 9) 测试左侧分组切换
  const group2 = page.locator('.group-info').nth(2)
  await group2.click({ timeout: 2000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT, '10-group-switch.png') })
  console.log('shot 10 group switch')

  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
