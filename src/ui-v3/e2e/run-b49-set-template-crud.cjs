// B49: 非生态集群模板基础 CRUD caller —— 创建页无属性时 createSetTemplate、列表删除 deleteSetTemplates、详情名称编辑 updateSetTemplate。
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []
const stamp = String(Date.now()).slice(-7)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    route.continue({ headers })
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`) })

  const api = (method, path, body) => page.evaluate(async ({ base, method, path, body }) => {
    const response = await fetch(`${base}/api/v3${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await response.text()
    let payload = null
    try { payload = JSON.parse(text) } catch { payload = { raw: text.slice(0, 200) } }
    return { status: response.status, ...payload }
  }, { base: BASE, method, path, body })

  let templateId = null
  let serviceTemplateId = null
  const templateName = `b49-set-template-${stamp}`
  const renamed = `${templateName}-renamed`
  const createPayloads = []
  const updatePayloads = []
  const deletePayloads = []

  try {
    await page.goto(`${BASE}/#/index`, { waitUntil: 'load' })
    await page.waitForTimeout(600)

    const serviceTemplateResponse = await api('POST', '/create/proc/service_template', {
      bk_biz_id: 2,
      name: `b49-service-template-${stamp}`,
      service_category_id: 16
    })
    assert(serviceTemplateResponse.result !== false, `创建服务模板夹具失败: ${JSON.stringify(serviceTemplateResponse)}`)
    serviceTemplateId = serviceTemplateResponse.data?.id ?? serviceTemplateResponse.data
    assert(serviceTemplateId, `服务模板夹具响应缺少 id: ${JSON.stringify(serviceTemplateResponse)}`)

    const allInfoCreates = []
    await page.route('**/api/v3/create/topo/set_template/all_info', (route, req) => {
      allInfoCreates.push(req.postDataJSON())
      return route.continue()
    })
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/v3/create/topo/set_template/bk_biz_id/')) createPayloads.push(req.postDataJSON())
      if (req.method() === 'PUT' && req.url().includes('/api/v3/update/topo/set_template/') && req.url().includes('/bk_biz_id/')) updatePayloads.push(req.postDataJSON())
      if (req.method() === 'DELETE' && req.url().includes('/api/v3/deletemany/topo/set_template/bk_biz_id/')) deletePayloads.push(req.postDataJSON())
    })

    await page.goto(`${BASE}/#/business/2/set/template/create`, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    await page.reload({ waitUntil: 'load' })
    await page.locator('.name-input input').waitFor({ state: 'visible', timeout: 15000 })
    await page.locator('.name-input input').fill(templateName)

    // 真实服务模板夹具已在页面加载前创建；选第一项，不添加集群模板属性，
    // 这样创建页明确走基础 createSetTemplate contract，而非 all_info 组合写入。
    const serviceDropdown = page.locator('.topo-add')
    await serviceDropdown.click()
    const serviceOption = page.getByText(`b49-service-template-${stamp}（#${serviceTemplateId}）`, { exact: true })
    await serviceOption.waitFor({ state: 'visible', timeout: 10000 })
    await serviceOption.click({ force: true })
    await page.locator('.create-footer button:has-text("提交")').click()
    await page.waitForTimeout(1200)

    assert(createPayloads.length === 1, `createSetTemplate 请求次数不符: ${createPayloads.length}; all_info=${JSON.stringify(allInfoCreates)}`)
    assert(createPayloads[0]?.name === templateName, `创建 name 不符: ${JSON.stringify(createPayloads)}`)
    assert(JSON.stringify(createPayloads[0]?.service_template_ids || []).length > 2, `创建 service_template_ids 缺失: ${JSON.stringify(createPayloads)}`)
    assert(page.url().includes('/business/2/set/template'), `创建后未返回集群模板列表: ${page.url()}`)
    console.log(`✓ createSetTemplate POST payload: ${JSON.stringify(createPayloads[0])}`)

    // 用真实 API 读回新模板 ID，随后通过 UI 详情名称行编辑验证 updateSetTemplate。
    const listed = await api('POST', '/findmany/topo/set_template/bk_biz_id/2/web', { page: { start: 0, limit: 200, sort: '-last_time' } })
    const list = listed.data?.info || []
    const createdRow = list.find((item) => (item.set_template?.name || item.name) === templateName)
    templateId = createdRow?.set_template?.id ?? createdRow?.id
    assert(templateId, `创建后列表未读回模板: ${JSON.stringify(list)}`)

    await page.goto(`${BASE}/#/business/2/set/template/details/${templateId}`, { waitUntil: 'load' })
    await page.locator('.basic-value').first().waitFor({ state: 'visible', timeout: 15000 })
    await page.locator('.grid-item').first().hover()
    await page.locator('.grid-item').first().locator('.property-edit-button').click()
    await page.locator('.name-form input').fill(renamed)
    await page.locator('.name-form input').press('Enter')
    await page.waitForTimeout(1000)

    const updatePayload = updatePayloads.find((payload) => payload?.name === renamed)
    assert(updatePayload, `updateSetTemplate payload 缺失: ${JSON.stringify(updatePayloads)}`)
    assert(updatePayload.name === renamed, `更新 name 不符: ${JSON.stringify(updatePayload)}`)
    console.log(`✓ updateSetTemplate PUT payload: ${JSON.stringify(updatePayload)}`)

    // 回列表点击真实删除；后端列表应用数为 0 时旧版允许删除。
    await page.goto(`${BASE}/#/business/2/set/template`, { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    const targetRow = page.locator('.el-table__body tr').filter({ hasText: renamed }).first()
    await targetRow.waitFor({ state: 'visible', timeout: 15000 })
    await targetRow.locator('button:has-text("删除")').click()
    await page.locator('.el-message-box:visible .el-button--primary').click()
    await page.waitForTimeout(1200)

    const deletePayload = deletePayloads.find((payload) => Array.isArray(payload?.set_template_ids) && payload.set_template_ids.includes(templateId))
    assert(deletePayload, `deleteSetTemplates payload 缺失: ${JSON.stringify(deletePayloads)}`)
    assert(JSON.stringify(deletePayload.set_template_ids) === JSON.stringify([templateId]), `删除 ids 不符: ${JSON.stringify(deletePayload)}`)
    const readBack = await api('POST', '/findmany/topo/set_template/bk_biz_id/2/web', { page: { start: 0, limit: 200 } })
    const remaining = readBack.data?.info || []
    assert(!remaining.some((item) => (item.set_template?.id ?? item.id) === templateId), `删除后仍读回模板: ${JSON.stringify(remaining)}`)
    console.log(`✓ deleteSetTemplates DELETE payload/read-back: ${JSON.stringify(deletePayload)}`)

    const realErrors = errors.filter((item) => !/favicon|ResizeObserver/.test(item))
    assert(!realErrors.length, realErrors.join(' | '))
    console.log('B49 E2E 全部通过')
  } catch (error) {
    errors.push(`ASSERT: ${error.message}`)
    console.error(`✗ B49 失败: ${error.message}`)
  } finally {
    if (templateId) {
      try { await api('DELETE', '/deletemany/topo/set_template/bk_biz_id/2/', { set_template_ids: [templateId] }) } catch {}
    }
    if (serviceTemplateId) {
      try { await api('DELETE', '/delete/proc/service_template', { bk_biz_id: 2, service_template_id: serviceTemplateId }) } catch {}
    }
    await browser.close()
  }
  if (errors.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(`✗ B49: ${error.message}`)
  process.exitCode = 1
})
