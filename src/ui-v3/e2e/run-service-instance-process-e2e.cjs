#!/usr/bin/env node
// Service-instance process caller E2E: ordinary process discovery -> legacy detail/by_ids expansion.
const assert = require('node:assert/strict')
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const BIZ_ID = Number(process.env.UI_V3_SERVICE_BIZ_ID || 2)
const errors = []
const requests = []

function parseBody(request) {
  try { return JSON.parse(request.postData() || '{}') } catch { return {} }
}

function apiPath(url) {
  return new URL(url).pathname.replace(/^\/api\/v3/, '')
}

async function callApi(page, method, path, body) {
  return page.evaluate(async ({ base, method, path, body }) => {
    const response = await fetch(new URL(`/api/v3${path}`, base).toString(), {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await response.text()
    let data
    try { data = JSON.parse(text) } catch { data = { raw: text.slice(0, 200) } }
    return { status: response.status, ...data }
  }, { base: BASE, method, path, body })
}

function assertEnvelope(response, expectedResult, label) {
  assert.equal(response.status, 200, `${label} HTTP status: ${JSON.stringify(response)}`)
  assert.equal(response.result, expectedResult, `${label} result: ${JSON.stringify(response)}`)
}

function assertBrowserEnvelope(response, envelope, expectedResult, label) {
  assert.equal(response.status(), 200, `${label} HTTP status: ${JSON.stringify(envelope)}`)
  assert.equal(envelope.result, expectedResult, `${label} result: ${JSON.stringify(envelope)}`)
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
    const path = apiPath(request.url())
    if (path === '/findmany/proc/process_instance' || path === '/findmany/proc/process_instance/name_ids' || path === '/findmany/proc/process_instance/detail/by_ids' || path.startsWith('/updatemany/proc/service_instance/biz/')) {
      requests.push({ method: request.method(), path, body: parseBody(request) })
    }
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })

  try {
    await page.goto(`${BASE}/#/index`, { waitUntil: 'load', timeout: 30000 })
    const serviceInstances = await callApi(page, 'POST', '/findmany/proc/service_instance', {
      bk_biz_id: BIZ_ID,
      page: { start: 0, limit: 20 },
      search_key: '',
      selectors: [],
      with_name: true
    })
    assertEnvelope(serviceInstances, true, 'service instance list')
    const candidates = serviceInstances.data?.info || []
    let fixture = null
    let fixtureProcessResponse = null
    for (const instance of candidates) {
      const response = await callApi(page, 'POST', '/findmany/proc/process_instance', {
        bk_biz_id: BIZ_ID,
        service_instance_id: instance.id,
        page: { start: 0, limit: 100 }
      })
      if (response.result === true && Array.isArray(response.data) && response.data.length) {
        fixture = instance
        fixtureProcessResponse = response
        break
      }
    }
    assert(fixture, `业务 ${BIZ_ID} 没有可用于 detail/by_ids caller 的服务实例进程`)
    const expectedProcessIds = fixtureProcessResponse.data
      .map((row) => Number(row?.property?.bk_process_id ?? row?.process_id))
      .filter((id) => Number.isSafeInteger(id) && id > 0)
    assert(expectedProcessIds.length > 0, '普通进程响应没有可用 bk_process_id')

    await page.goto(`${BASE}/#/business/service-instance?biz=${BIZ_ID}`, { waitUntil: 'load', timeout: 30000 })
    const table = page.locator('.page-card > .el-table').first()
    await table.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 15000 })
    const row = table.locator('tbody tr').filter({ hasText: String(fixture.id) }).first()
    await row.waitFor({ state: 'visible', timeout: 8000 })

    const detailRequestPromise = page.waitForRequest((request) =>
      request.method() === 'POST' && apiPath(request.url()) === '/findmany/proc/process_instance/detail/by_ids'
    )
    const detailResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'POST' && apiPath(response.url()) === '/findmany/proc/process_instance/detail/by_ids'
    )
    const ordinaryRequestPromise = page.waitForRequest((request) =>
      request.method() === 'POST' && apiPath(request.url()) === '/findmany/proc/process_instance' &&
      parseBody(request).service_instance_id === fixture.id
    )
    await Promise.all([
      row.locator('.el-button').first().click(),
      ordinaryRequestPromise,
      detailRequestPromise,
      detailResponsePromise
    ])

    const ordinaryRequest = await ordinaryRequestPromise
    const ordinaryBody = parseBody(ordinaryRequest)
    assert.deepEqual(ordinaryBody, {
      bk_biz_id: BIZ_ID,
      service_instance_id: fixture.id,
      page: { start: 0, limit: 100 }
    }, `普通进程查询 payload: ${JSON.stringify(ordinaryBody)}`)

    const detailRequest = await detailRequestPromise
    const detailBody = parseBody(detailRequest)
    assert.equal(detailBody.bk_biz_id, BIZ_ID)
    assert.deepEqual(detailBody.process_ids, expectedProcessIds, `detail/by_ids process_ids: ${JSON.stringify(detailBody)}`)
    assert.equal(detailBody.page.limit, 999999999, `detail/by_ids no-limit page: ${JSON.stringify(detailBody)}`)

    const detailResponse = await detailResponsePromise
    const detailEnvelope = await detailResponse.json()
    assertBrowserEnvelope(detailResponse, detailEnvelope, true, 'detail/by_ids')
    assert(Number(detailEnvelope.data?.count) >= 1, `detail/by_ids count: ${JSON.stringify(detailEnvelope)}`)
    const details = detailEnvelope.data?.info || []
    assert(details.length >= 1, `detail/by_ids info: ${JSON.stringify(detailEnvelope)}`)
    assert(details.every((item) => item.process_id && item.property && item.relation), `detail/by_ids item shape: ${JSON.stringify(details[0])}`)
    assert(details.some((item) => item.service_instance_name === fixture.name), `detail/by_ids service_instance_name: ${JSON.stringify(details[0])}`)

    const drawer = page.locator('.el-drawer').filter({ hasText: '进程实例' }).last()
    await drawer.waitFor({ state: 'visible', timeout: 5000 })
    const drawerText = await drawer.textContent()
    assert(drawerText.includes(String(details[0].property.bk_func_name)), `详情未渲染进程属性: ${drawerText.slice(0, 300)}`)
    console.log(`✓ detail/by_ids caller: instance=${fixture.id}, process_ids=${JSON.stringify(detailBody.process_ids)}, info=${details.length}`)

    const batchUpdate = await callApi(page, 'PUT', `/updatemany/proc/service_instance/biz/${BIZ_ID}`, {
      data: [{ service_instance_id: fixture.id, update: { name: fixture.name } }]
    })
    assertEnvelope(batchUpdate, true, 'service-instance batch update')
    assert.equal(batchUpdate.data, null, `batch update response data: ${JSON.stringify(batchUpdate)}`)
    console.log('✓ batch update contract: PUT /updatemany/proc/service_instance/biz/:biz -> result=true,data=null')

    const invalidCases = [
      {
        label: 'name_ids missing module',
        path: '/findmany/proc/process_instance/name_ids',
        body: { bk_biz_id: BIZ_ID, process_name: '', page: { start: 0, limit: 20 } },
        field: 'bk_module_id'
      },
      {
        label: 'detail empty ids',
        path: '/findmany/proc/process_instance/detail/by_ids',
        body: { bk_biz_id: BIZ_ID, process_ids: [], page: { limit: 999999999 } },
        field: 'process_ids'
      },
      {
        label: 'detail invalid page',
        path: '/findmany/proc/process_instance/detail/by_ids',
        body: { bk_biz_id: BIZ_ID, process_ids: expectedProcessIds.slice(0, 1), page: { limit: 0 } },
        field: 'page.limit'
      }
    ]
    for (const test of invalidCases) {
      const response = await callApi(page, 'POST', test.path, test.body)
      assertEnvelope(response, false, test.label)
      assert.equal(response.bk_error_code, 1199006, `${test.label} error code: ${JSON.stringify(response)}`)
      assert(String(response.bk_error_msg || '').includes(test.field), `${test.label} error field: ${JSON.stringify(response)}`)
    }
    console.log('✓ validation errors: code=1199006 with bk_module_id/process_ids/page.limit field messages')

    assert.equal(errors.length, 0, errors.join('\n'))
    console.log(JSON.stringify({
      status: 'passed',
      businessId: BIZ_ID,
      fixtureServiceInstanceId: fixture.id,
      requests: requests.filter((item) => item.path.includes('process_instance') || item.path.includes('service_instance/biz'))
    }, null, 2))
  } catch (error) {
    console.error(`✗ service-instance process E2E failed: ${error.message}`)
    console.error(JSON.stringify({ errors, requests }, null, 2))
    process.exitCode = 1
  } finally {
    await browser.close()
  }
})()
