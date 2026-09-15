// B47: 运营统计图表排序位置契约(read-back + 成功/失败反馈)
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function response(data) {
  return {
    result: true,
    bk_error_code: 0,
    bk_error_msg: 'success',
    permission: null,
    data
  }
}

function orderedCharts(charts, ids) {
  const byId = new Map(charts.map((chart) => [chart.config_id, chart]))
  return ids.map((id) => byId.get(id)).filter(Boolean)
}

async function readVisibleHostOrder(page) {
  return page.locator('[data-chart-category="host"][data-chart-id]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-chart-id'))
  )
}

async function waitForToast(page, text) {
  const toast = page.locator('.el-message').filter({ hasText: text }).last()
  await toast.waitFor({ state: 'visible', timeout: 5000 })
  return toast.textContent()
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  let positionPayload = null
  let failNextPosition = false
  const serverPosition = {
    host: [101, 102],
    inst: [201, 202]
  }
  const hostCharts = [
    { config_id: 101, report_type: 'host_biz_chart', name: '主机A', bk_obj_id: 'host', width: '50', chart_type: 'pie', field: 'bk_os_type', x_axis_count: 10 },
    { config_id: 102, report_type: 'host_cloud_chart', name: '主机B', bk_obj_id: 'host', width: '50', chart_type: 'pie', field: 'bk_cloud_id', x_axis_count: 10 }
  ]
  const instCharts = [
    { config_id: 201, report_type: 'model_inst_chart', name: '实例A', bk_obj_id: 'demo_object', width: '50', chart_type: 'pie', field: 'state', x_axis_count: 10 },
    { config_id: 202, report_type: 'model_inst_change_chart', name: '实例B', bk_obj_id: 'demo_object', width: '50', chart_type: 'pie', field: 'status', x_axis_count: 10 }
  ]

  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    route.continue({ headers })
  })
  await page.route('**/userinfo', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ result: true, data: { username: 'admin', chname: 'admin' } })
    })
  })
  await page.route('**/api/v3/findmany/operation/chart', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response({
        count: hostCharts.length + instCharts.length,
        info: {
          host: orderedCharts(hostCharts, serverPosition.host),
          inst: orderedCharts(instCharts, serverPosition.inst),
          nav: []
        }
      }))
    })
  })
  await page.route('**/api/v3/find/operation/chart/data', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response([])) })
  })
  await page.route('**/api/v3/update/operation/chart/position', async (route) => {
    positionPayload = route.request().postDataJSON()
    if (failNextPosition) {
      failNextPosition = false
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: false,
          bk_error_code: 1116008,
          bk_error_msg: 'position probe failed',
          permission: null,
          data: null
        })
      })
      return
    }
    serverPosition.host = [...(positionPayload?.position?.host || [])]
    serverPosition.inst = [...(positionPayload?.position?.inst || [])]
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response(null)) })
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))

  try {
    await page.goto(`${BASE}/#/analysis/operation`, { waitUntil: 'load' })
    await page.locator('.op-page').waitFor({ state: 'visible', timeout: 15000 })
    await page.locator('[data-chart-category="host"][data-chart-id="101"]').waitFor({ state: 'visible', timeout: 15000 })
    await page.locator('[data-chart-category="host"][data-chart-id="102"]').waitFor({ state: 'visible', timeout: 15000 })

    assert(JSON.stringify(await readVisibleHostOrder(page)) === JSON.stringify(['101', '102']), '初始 read-back 顺序不符')
    const firstChart = page.locator('[data-chart-category="host"][data-chart-id="101"]')
    await firstChart.locator('button[aria-label^="下移"]').click()
    await waitForToast(page, '图表位置已保存')
    assert(JSON.stringify(positionPayload) === JSON.stringify({ position: { host: [102, 101], inst: [201, 202] } }),
      `位置保存请求体不符: ${JSON.stringify(positionPayload)}`)
    assert(JSON.stringify(await readVisibleHostOrder(page)) === JSON.stringify(['102', '101']), '成功保存后页面顺序未更新')
    console.log('✓ updateOperationChartPosition body + success feedback')

    await page.reload({ waitUntil: 'load' })
    await page.locator('[data-chart-category="host"][data-chart-id="102"]').waitFor({ state: 'visible', timeout: 15000 })
    assert(JSON.stringify(await readVisibleHostOrder(page)) === JSON.stringify(['102', '101']), '位置保存后 read-back 顺序未持久化')
    console.log('✓ operation chart position read-back preserves host order')

    failNextPosition = true
    const secondChart = page.locator('[data-chart-category="host"][data-chart-id="101"]')
    await secondChart.locator('button[aria-label^="上移"]').click()
    await waitForToast(page, '图表位置保存失败')
    await page.locator('[data-chart-category="host"][data-chart-id="102"]').waitFor({ state: 'visible', timeout: 15000 })
    assert(JSON.stringify(await readVisibleHostOrder(page)) === JSON.stringify(['102', '101']), '保存失败后未回读服务端顺序')
    assert(positionPayload?.position?.host?.join(',') === '101,102', `失败场景位置请求体不符: ${JSON.stringify(positionPayload)}`)
    console.log('✓ updateOperationChartPosition failure feedback + rollback read-back')

    assert(!errors.length, errors.join(' | '))
    console.log('B47 E2E 全部通过')
  } catch (error) {
    errors.push(`ASSERT: ${error.message}`)
    console.error('✗ B47 失败:', error.message)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
})()
