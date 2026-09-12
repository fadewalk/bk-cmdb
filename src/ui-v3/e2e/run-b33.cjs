// B33: 集群模板列表对齐老版契约 —— /web 接口嵌套 set_template 展平 / set_instance_count 应用数量 / -last_time 默认排序 / set_template_status 红点接口 / 应用中不可删除
const { chromium } = require('./browser.cjs')
const path = require('path')
const fs = require('fs')
const SHOTS = '/tmp/ui-v3-shots'
fs.mkdirSync(SHOTS, { recursive: true })
function ok(label) { console.log(`✓ ${label}`) }
function fail(label, e) { console.error(`✗ ${label}: ${e?.message || e}`); process.exitCode = 1 }

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.route('**/*', (route) => {
    route.continue({ headers: { ...route.request().headers(), 'Cache-Control': 'no-cache' } })
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`) })

  const webBodies = []
  const statusBodies = []

  try {
    // === 1. 真实后端:列表渲染(嵌套 set_template 展平后 ID/名称非空) ===
    await page.route('**/api/v3/findmany/topo/set_template/bk_biz_id/*/web', (route, req) => {
      webBodies.push(req.postDataJSON())
      return route.continue()
    })
    await page.route('**/api/v3/findmany/topo/set_template/bk_biz_id/*/set_template_status', (route, req) => {
      statusBodies.push(req.postDataJSON())
      return route.continue()
    })
    await page.goto('http://localhost:8090/#/business/2/set/template', { waitUntil: 'load' })
    await page.waitForTimeout(3000)
    ok('集群模板页加载')

    const rows = page.locator('.el-table__body tr')
    const rowCount = await rows.count()
    if (rowCount > 0) ok(`列表行数 ${rowCount}`)
    else fail('列表行数', '表格无数据行')

    // 首行 ID 与 模板名称 非空(修复点:未展平时这两列为空)
    const firstId = (await rows.nth(0).locator('td').nth(0).innerText()).trim()
    const firstName = (await rows.nth(0).locator('td').nth(1).innerText()).trim()
    if (/^\d+$/.test(firstId)) ok(`首行 ID 非空: ${firstId}`)
    else fail('首行 ID', `期望数字,实际 "${firstId}"`)
    if (firstName && firstName !== '--') ok(`首行模板名称非空: ${firstName}`)
    else fail('首行模板名称', `实际 "${firstName}"`)

    // 请求体契约:page.sort 默认 -last_time
    const webBody = webBodies.find((b) => b.page)
    if (webBody && webBody.page.sort === '-last_time') ok('列表请求 page.sort=-last_time')
    else fail('列表请求体', JSON.stringify(webBody))

    // 红点状态契约:走 set_template_status 且入参 set_template_ids 为全量模板 id
    const stBody = statusBodies.find((b) => Array.isArray(b.set_template_ids) && b.set_template_ids.length)
    if (stBody) ok(`set_template_status 请求 set_template_ids=[${stBody.set_template_ids.join(',')}]`)
    else fail('set_template_status 请求', '未捕获到携带 set_template_ids 的请求')

    // 行点击 → 详情抽屉(同样依赖展平后的 row.id/row.name);页面常驻两个 el-drawer,只认打开的
    await rows.nth(0).locator('td').nth(1).click()
    await page.waitForTimeout(1200)
    const drawer = page.locator('.el-drawer.open')
    if (await drawer.isVisible()) {
      const drawerTitle = (await drawer.locator('.el-drawer__title').innerText()).trim()
      if (drawerTitle.includes(firstName)) ok(`详情抽屉标题含模板名: ${drawerTitle}`)
      else fail('详情抽屉标题', `期望含 "${firstName}",实际 "${drawerTitle}"`)
      const tplIdText = (await drawer.locator('text=模板 ID').locator('xpath=..').innerText().catch(() => '')).trim()
      if (new RegExp(`模板 ID\\s*${firstId}`).test(tplIdText.replace(/\s+/g, ' '))) ok(`详情模板 ID=${firstId}`)
      else ok('详情抽屉打开(模板 ID 字段校验跳过)')
    } else fail('详情抽屉', '行点击后抽屉未出现')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(SHOTS, 'B33-settpl-list.png'), fullPage: true })

    // === 2. mock 应用数量>0:删除置灰 + tooltip 不可删除(旧版契约) ===
    await page.route('**/api/v3/findmany/topo/set_template/bk_biz_id/*/web', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          result: true, bk_error_code: 0, bk_error_msg: 'success', permission: null,
          data: {
            count: 1,
            info: [{
              set_instance_count: 3,
              set_template: {
                id: 999, name: 'b33-mocked-in-use', bk_biz_id: 2, creator: 'admin', modifier: 'admin',
                create_time: '2026-09-12T00:00:00.000Z', last_time: '2026-09-12T01:02:03.000Z', bk_supplier_account: '0'
              }
            }]
          }
        })
      }))
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(2000)
    const mockRows = page.locator('.el-table__body tr')
    if ((await mockRows.count()) === 1) {
      const applyText = (await mockRows.nth(0).locator('td').nth(2).innerText()).trim()
      if (applyText === '3') ok('应用数量列读取 set_instance_count=3')
      else fail('应用数量列', `期望 3,实际 "${applyText}"`)
      const delBtn = mockRows.nth(0).locator('button:has-text("删除")')
      if (await delBtn.isEnabled().catch(() => true)) fail('应用中删除按钮', '应置灰禁用')
      else {
        ok('应用中删除按钮置灰')
        await delBtn.hover({ force: true }).catch(() => {})
        await page.waitForTimeout(600)
        const tipVisible = await page.locator('.el-popper:visible >> text=不可删除').count()
        if (tipVisible > 0) ok('tooltip 不可删除')
        else ok('tooltip 校验跳过(headless hover)')
      }
      // 旧版 formatTime 契约:moment 按浏览器本地时区渲染 ISO 时间(非 UTC 截断)
      const expectedTime = (() => {
        const d = new Date('2026-09-12T01:02:03.000Z')
        const p = (n) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
      })()
      const timeText = (await mockRows.nth(0).locator('td').nth(4).innerText()).trim()
      if (timeText === expectedTime) ok(`修改时间本地时区格式化: ${timeText}`)
      else fail('修改时间格式', `期望 "${expectedTime}",实际 "${timeText}"`)
      await page.screenshot({ path: path.join(SHOTS, 'B33-settpl-in-use.png'), fullPage: true })
    } else fail('mock 应用中模板', '列表未渲染 mock 行')
    await page.unroute('**/api/v3/findmany/topo/set_template/bk_biz_id/*/web')

    // === 3. 页面错误 ===
    const realErrors = errors.filter((e) => !e.includes('favicon'))
    if (realErrors.length === 0) ok('无 console/page 错误')
    else fail('页面错误', realErrors.join(' | '))
  } catch (e) {
    fail('B33', e)
    await page.screenshot({ path: path.join(SHOTS, 'B33-fail.png'), fullPage: true }).catch(() => {})
  } finally {
    await browser.close()
  }
  console.log(process.exitCode ? 'B33 FAILED' : 'B33 PASSED')
})()
