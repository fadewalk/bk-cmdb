// global-config 三个 tab 验证
const { chromium } = require('/tmp/e2e/node_modules/playwright')
const path = require('path')
const fs = require('fs')
const OUT = path.join(__dirname, '../screenshots/global-config')
fs.mkdirSync(OUT, { recursive: true })
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('[err]', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('[c.err]', m.text().slice(0, 150)) })
  await page.route('**/*', (r) => { const h = { ...r.request().headers() }; delete h['if-none-match']; h['cache-control'] = 'no-cache'; r.continue({ headers: h }) })

  await page.goto('http://localhost:8090/#/platform/global-config', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: path.join(OUT, '01-general.png') })
  console.log('01 业务通用')

  await page.locator('.el-tabs__item').filter({ hasText: '业务空闲机池' }).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(OUT, '02-idle.png') })
  console.log('02 业务空闲机池')

  await page.locator('.el-tabs__item').filter({ hasText: 'ID 生成器' }).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(OUT, '03-id.png') })
  console.log('03 ID生成器')

  // ID 生成器点编辑
  const editBtn = page.locator('button').filter({ hasText: /^编辑$/ }).first()
  if (await editBtn.count()) {
    await editBtn.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(OUT, '04-id-editing.png') })
    console.log('04 ID生成器编辑态')
  }

  // 测试业务通用:改层级 3→4 再保存
  await page.locator('.el-tabs__item').filter({ hasText: '业务通用' }).click()
  await page.waitForTimeout(1500)
  const numInput = page.locator('.el-input-number input').first()
  if (await numInput.count()) {
    await numInput.click({ clickCount: 3 })
    await numInput.fill('4')
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT, '05-general-changed.png') })
    console.log('05 general changed to level 4')
    const saveBtn = page.locator('button').filter({ hasText: /^保存$/ }).first()
    await saveBtn.click()
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(OUT, '06-general-saved.png') })
    console.log('06 general saved')
  }

  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
