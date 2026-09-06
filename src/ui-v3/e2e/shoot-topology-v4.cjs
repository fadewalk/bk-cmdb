// 验证: ①header 干净 ②查看模式节点不可拖 ③编辑模式可拖 + 自动保存
const { chromium } = require('/tmp/e2e/node_modules/playwright')
const path = require('path')
const fs = require('fs')
const OUT = path.join(__dirname, '../screenshots/topology-v4')
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('[err]', e.message))
  await page.route('**/*', (r) => { const h = { ...r.request().headers() }; delete h['if-none-match']; h['cache-control'] = 'no-cache'; r.continue({ headers: h }) })
  await page.addInitScript(() => { try { localStorage.removeItem('bk-cmdb-topology-positions-v1') } catch {} })

  await page.goto('http://localhost:8090/#/model/topology', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(5000)
  await page.screenshot({ path: path.join(OUT, '01-view-mode.png') })
  console.log('01 view mode (header clean, no lang/help buttons)')

  // 查看模式: 尝试拖动节点 → 应该不动
  const node = page.locator('.node-g').first()
  let box = await node.boundingBox()
  const beforeX = box.x, beforeY = box.y
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 80, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  box = await node.boundingBox()
  console.log(`view-mode drag: moved ${Math.round(box.x - beforeX)}px x, ${Math.round(box.y - beforeY)}px y (expect ~0,0)`)
  await page.screenshot({ path: path.join(OUT, '02-view-drag-locked.png') })

  // 点编辑拓扑
  await page.locator('button').filter({ hasText: '编辑拓扑' }).first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, '03-edit-mode.png') })
  console.log('03 edit mode entered')

  // 编辑模式拖动 → 应该动
  box = await node.boundingBox()
  const ex = box.x, ey = box.y
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 80, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  box = await node.boundingBox()
  console.log(`edit-mode drag: moved ${Math.round(box.x - ex)}px x, ${Math.round(box.y - ey)}px y (expect ~+150,+80)`)
  await page.screenshot({ path: path.join(OUT, '04-edit-dragged.png') })

  // 重置布局
  await page.locator('button').filter({ hasText: '重置布局' }).first().click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(OUT, '05-reset.png') })
  console.log('05 reset layout')

  // 返回
  await page.locator('button').filter({ hasText: /^返回$/ }).first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, '06-back-to-view.png') })
  console.log('06 back to view mode')

  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
