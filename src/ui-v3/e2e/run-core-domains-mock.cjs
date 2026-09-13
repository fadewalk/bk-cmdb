// Mock contract coverage for external/advanced core domains.
// Real integrations remain separately marked blocked; this proves UI request/response
// shapes, error/capability branches, and write-preview interactions.
const { chromium } = require('./browser.cjs')
const { ok, kube, fullText, service } = require('./fixtures/core-domains.cjs')

function assert(condition, message) { if (!condition) throw new Error(message) }
function log(message) { console.log(`✓ ${message}`) }

async function installCommonMocks(page) {
  await page.addInitScript(() => {
    localStorage.setItem('selectedBusiness', '2')
  })
  await page.route('**/userinfo', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ result: true, data: { username: 'mock-user', chname: 'Mock User', current_supplier: '0' } })
  }))
  await page.route('**/api/v3/biz/search/0', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: 1, info: [{ bk_biz_id: 2, bk_biz_name: 'Mock Biz' }] })) }))
  await page.route('**/api/v3/findmany/biz_set', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: 0, info: [] })) }))
  await page.route('**/api/v3/usercustom/user/search', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({})) }))
}

;(async () => {
  const browser = await chromium.launch({ headless: true })

  // K8s healthy path: both capability probes must be mocked because capability store probes both domains.
  {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await installCommonMocks(page)
    const podBodies = []
    await page.route('**/api/v3/findmany/kube/pod', async (route) => {
      podBodies.push(route.request().postDataJSON())
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(kube.pods) })
    })
    await page.route('**/api/v3/find/full_text', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fullText) }))
    await page.goto('http://localhost:8090/#/business/2/pod', { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    assert((await page.locator('.kube-page .el-tag').allTextContents()).some((t) => t.includes('K8s 可用')), 'K8s mock did not enter healthy state')
    const row = page.locator('.kube-page .el-table__body-wrapper .el-table__row').first()
    assert((await row.textContent()).includes('pod-mock-1'), 'mock Pod row missing')
    assert(podBodies.some((body) => body.page?.enable_count === true), 'K8s capability probe shape missing')
    assert(podBodies.some((body) => body.fields?.includes('name') && body.page?.enable_count === false), 'K8s list shape missing')
    log('K8s mock: capability probe + Pod list envelope/payload')
    await row.getByRole('button', { name: '详情' }).click()
    await page.waitForTimeout(700)
    assert((await page.url()).includes('/business/2/pod/101'), 'Pod detail deep link missing')
    log('K8s mock: Pod detail deep link and readback')
    await page.close()
  }

  // ES healthy path: result aggregation/hits and actual query body.
  {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await installCommonMocks(page)
    const textBodies = []
    await page.route('**/api/v3/findmany/kube/pod', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: 0, info: [] })) }))
    await page.route('**/api/v3/find/full_text', async (route) => {
      textBodies.push(route.request().postDataJSON())
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fullText) })
    })
    await page.goto('http://localhost:8090/#/full-text-search', { waitUntil: 'load' })
    await page.waitForTimeout(900)
    assert((await page.locator('.fulltext-page .el-tag').allTextContents()).some((t) => t.includes('ES 可用')), 'ES mock did not enter healthy state')
    await page.locator('.search-row input').fill('mock-host')
    await page.locator('.search-row button').click()
    await page.waitForTimeout(600)
    assert((await page.locator('.result-item').textContent()).includes('mock-host'), 'ES mock hit missing')
    assert(textBodies.some((body) => body.query_string === 'mock-host' && body.page?.limit === 20), 'ES query payload mismatch')
    log('ES mock: full_text query, aggregation/hit response and render')
    await page.close()
  }

  // Service-instance advanced route: template unbind request + updated list readback.
  {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await installCommonMocks(page)
    let unbound = false
    await page.route('**/api/v3/findmany/kube/pod', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: 0, info: [] })) }))
    await page.route('**/api/v3/find/full_text', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ total: 0, aggregations: [], hits: [], attrs: { attributes: {}, groups: {} } })) }))
    await page.route('**/api/v3/findmany/proc/service_instance', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: 1, info: [{ id: 301, name: 'svc-mock', bk_module_id: 11, bk_module_name: 'web', service_template_id: unbound ? null : 7, bk_host_id: 501, bk_host_innerip: '10.0.0.10', process_count: 1 }] })) }))
    await page.route('**/api/v3/delete/proc/template_binding_on_module', async (route) => {
      const body = route.request().postDataJSON()
      assert(body.bk_biz_id === 2 && body.service_instance_ids?.[0] === 301 && body.module_id === 11, 'unbind payload mismatch')
      unbound = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({})) })
    })
    await page.goto('http://localhost:8090/#/business/service-instance?biz=2', { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    const row = page.locator('.el-table__body-wrapper .el-table__row').first()
    assert((await row.textContent()).includes('svc-mock'), 'service mock row missing')
    await row.getByRole('button', { name: '解绑模板' }).click()
    await page.locator('.el-message-box .el-button--primary').click()
    await page.waitForTimeout(800)
    assert(unbound, 'unbind endpoint not called')
    assert(!(await page.locator('.el-table__body-wrapper .el-table__row').first().getByRole('button', { name: '解绑模板' }).count()), 'unbind did not read back updated row')
    log('Service mock: template unbind payload and list readback')
    await page.close()
  }

  // Network collection is intentionally a static dependency gate; assert no fake collector traffic.
  {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await installCommonMocks(page)
    const collectorRequests = []
    page.on('request', (request) => { if (request.url().includes('/collector/')) collectorRequests.push(request.url()) })
    await page.goto('http://localhost:8090/#/analysis/network-collect', { waitUntil: 'load' })
    await page.waitForTimeout(600)
    const networkBody = await page.locator('.page-card').last().textContent()
    assert(networkBody.includes('网络采集') && /collector|采集器|设备数据链路/.test(networkBody), 'network blocked copy missing')
    assert(collectorRequests.length === 0, 'network blocked page must not invent collector traffic')
    log('Network mock: explicit collector dependency gate, no fake API traffic')
    await page.close()
  }

  await browser.close()
  console.log('core-domain mock contracts passed')
})().catch((error) => { console.error(`✗ core-domain mock contracts: ${error.message}`); process.exit(1) })
