// B46: 关联类型详情 wrapper 接入 AssociationType 行点击，验证 payload/read-back/error
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []
function assert(condition, message) {
  if (!condition) throw new Error(message)
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  let failDetailRead = false
  let listResponse = null
  let detailPayload = null
  let detailResponse = null

  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    route.continue({ headers })
  })
  await page.route('**/api/v3/find/associationtype', async (route) => {
    const payload = route.request().postDataJSON() || {}
    if (payload?.condition?.id && failDetailRead) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: false,
          bk_error_code: 990046,
          bk_error_msg: 'detail probe failed',
          data: null
        })
      })
      return
    }
    await route.continue()
  })

  page.on('response', async (response) => {
    if (!response.url().includes('/api/v3/find/associationtype') || response.request().method() !== 'POST') return
    const payload = response.request().postDataJSON() || {}
    const body = await response.json().catch(() => null)
    if (payload?.condition?.id !== undefined) {
      detailPayload = payload
      detailResponse = body
    } else if (!listResponse && body?.data?.info?.length) {
      listResponse = body
    }
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })

  try {
    await page.goto(`${BASE}/#/model/association`, { waitUntil: 'load' })
    await page.locator('.relation-table .el-table__row').first().waitFor({ state: 'visible', timeout: 15000 })
    await page.waitForTimeout(500)
    assert(listResponse?.data?.info?.length, '关联类型列表未返回可用行')
    const source = listResponse.data.info[0]
    assert(source.id !== undefined && source.id !== null, '关联类型列表行缺少数字 id')

    await page.locator('.relation-table .el-table__row').first().click()
    await page.locator('.association-drawer:visible').waitFor({ state: 'visible', timeout: 8000 })
    await page.waitForTimeout(300)
    assert(detailPayload, '行点击未调用 getAssociationType 对应详情请求')
    assert(detailPayload.condition?.id === source.id, `详情请求 condition.id 不符: ${JSON.stringify(detailPayload)}`)
    assert(detailPayload.page?.start === 0 && detailPayload.page?.limit === 1, `详情请求 page 不符: ${JSON.stringify(detailPayload)}`)
    assert(detailResponse?.result === true && detailResponse.data?.info?.length === 1, '详情请求 read-back 响应形态不符')

    const detail = detailResponse.data.info[0]
    const formValues = await page.locator('.association-drawer:visible .el-form-item input').evaluateAll((inputs) => inputs.map((input) => input.value))
    assert(formValues[0] === detail.bk_asst_id, `详情 drawer 未回填唯一标识: ${JSON.stringify(formValues)}`)
    assert(formValues[1] === detail.bk_asst_name, `详情 drawer 未回填名称: ${JSON.stringify(formValues)}`)
    console.log(`✓ row-click getAssociationType payload/read-back: id=${source.id}, asst=${detail.bk_asst_id}`)

    await page.locator('.association-drawer:visible .el-drawer__close-btn').click()
    await page.waitForTimeout(300)
    assert(!(await page.locator('.association-drawer:visible').count()), '详情抽屉未关闭')

    failDetailRead = true
    detailPayload = null
    detailResponse = null
    await page.locator('.relation-table .el-table__row').first().click()
    await page.waitForTimeout(700)
    assert(detailPayload?.condition?.id === source.id, '错误场景未发出同一详情请求')
    assert(detailResponse?.result === false && detailResponse?.bk_error_msg === 'detail probe failed', '错误场景响应未按预期返回')
    assert(!(await page.locator('.association-drawer:visible').count()), '详情读取失败时不应打开抽屉')
    const toast = await page.locator('.el-message').last().textContent().catch(() => '')
    assert(/detail probe failed|关联类型加载失败/.test(toast || ''), `详情错误未反馈到 UI: ${toast}`)
    console.log(`✓ getAssociationType error surfaced without opening drawer: ${toast}`)

    assert(!errors.length, errors.join(' | '))
    console.log('B46 E2E 全部通过')
  } catch (error) {
    errors.push(`ASSERT: ${error.message}`)
    console.error('✗ B46 失败:', error.message)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
})()
