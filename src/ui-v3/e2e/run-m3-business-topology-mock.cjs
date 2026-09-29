// M3-A: traditional business topology tree and URL-state contract.
const fs = require('fs')
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const REPORT = process.env.UI_V3_M3_REPORT || '/tmp/ui-v3-m3-business-topology.json'
const SHOTS = process.env.UI_V3_M3_SHOTS || '/tmp/ui-v3-m3-business-topology-shots'
fs.mkdirSync(SHOTS, { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function ok(data) {
  return { result: true, bk_error_code: 0, bk_error_msg: 'success', data }
}

function json(route, data, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
}

function hashQuery(page) {
  const hash = new URL(page.url()).hash.replace(/^#/, '')
  return new URLSearchParams(hash.split('?')[1] || '')
}

async function waitForRecord(predicate, message, timeout = 5000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(message)
}

const M3_INSTANCE_ROWS = [
  { id: 501, name: 'inst-alpha', bk_host_innerip: '10.0.0.9', labels: { env: 'test' } },
  { id: 502, name: 'inst-beta', bk_host_innerip: '10.0.0.10', labels: {} }
]

function makeState() {
  return { usercustom: {} }
}

function makeRecords() {
  return { hostQueries: [], instanceQueries: [], processCountQueries: [], processQueries: [], usercustom: [], unexpectedKube: [], apiResponses: [], errors: [] }
}

function attachObservers(page, records) {
  page.on('request', (request) => {
    if (/\/find\/kube\//.test(request.url())) records.unexpectedKube.push(request.url())
  })
  page.on('response', (response) => {
    if (response.url().includes('/api/v3/')) records.apiResponses.push({ url: response.url(), status: response.status() })
  })
  page.on('pageerror', (error) => records.errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') records.errors.push(`console.error: ${message.text()}`)
  })
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

async function installM3(page, state, records, options = {}) {
  let failHost = Boolean(options.failHost)
  let failInstance = Boolean(options.failInstance)
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    return route.continue({ headers })
  })
  await page.route('**/userinfo', (route) => json(route, ok({ username: 'm3-mock', chname: 'M3 Mock', current_supplier: '0' })))
  await page.route('**/api/v3/biz/search/0', (route) => json(route, ok({ count: 1, info: [{ bk_biz_id: 2, bk_biz_name: 'Mock Business' }] })))
  await page.route('**/api/v3/findmany/biz_set', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/usercustom/user/search', (route) => json(route, ok(clone(state.usercustom))))
  await page.route('**/api/v3/usercustom', async (route) => {
    const body = route.request().postDataJSON() || {}
    records.usercustom.push(body)
    Object.assign(state.usercustom, body)
    return json(route, ok({}))
  })
  await page.route('**/api/v3/find/classificationobject', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/object', (route) => json(route, ok([])))
  await page.route(/\/api\/v3\/find\/topoinst_with_statistics\/biz\/2(?:\?.*)?$/, (route) => json(route, ok([
    {
      bk_obj_id: 'biz', bk_inst_id: 2, bk_inst_name: 'Mock Business', child: [
        {
          bk_obj_id: 'set', bk_inst_id: 10, bk_inst_name: 'Applications', child: [
            { bk_obj_id: 'module', bk_inst_id: 21, bk_inst_name: 'Web Module', child: [] },
            { bk_obj_id: 'module', bk_inst_id: 22, bk_inst_name: 'Database Module', child: [] }
          ]
        },
        {
          bk_obj_id: 'set', bk_inst_id: 11, bk_inst_name: 'Operations', child: [
            { bk_obj_id: 'module', bk_inst_id: 31, bk_inst_name: 'Monitoring Module', child: [] }
          ]
        }
      ]
    }
  ])))
  await page.route('**/api/v3/topo/internal/0/2/with_statistics', (route) => json(route, ok({
    bk_set_id: 1, bk_set_name: '空闲机池', default: 1,
    module: [{ bk_module_id: 2, bk_module_name: '空闲机模块', default: 1 }]
  })))
  await page.route('**/api/v3/findmany/hosts/search/with_biz', async (route) => {
    const body = route.request().postDataJSON() || {}
    records.hostQueries.push(body)
    if (failHost && body.page?.limit !== 500) {
      failHost = false
      return json(route, { result: false, bk_error_code: 500, bk_error_msg: '主机服务不可用' })
    }
    const count = body.page?.limit === 500 ? 3 : 100
    const rows = body.page?.limit === 500 ? [] : Array.from({ length: Math.min(body.page?.limit || 20, 5) }, (_, index) => ({
      host: { bk_host_id: index + 100, bk_host_innerip: `10.0.0.${index + 1}`, bk_host_name: `host-${index + 1}` },
      set: [{ bk_set_id: 10, bk_set_name: 'Applications' }],
      module: [{ bk_module_id: 22, bk_module_name: 'Database Module' }]
    }))
    return json(route, ok({ count, info: rows }))
  })
  await page.route('**/api/v3/findmany/proc/service_instance/labels/aggregation', (route) => json(route, ok({ env: ['test'] })))
  await page.route('**/api/v3/findmany/proc/service_instance', async (route) => {
    records.instanceQueries.push(route.request().postDataJSON() || {})
    if (failInstance) {
      failInstance = false
      return json(route, { result: false, bk_error_code: 500, bk_error_msg: '服务实例服务不可用' })
    }
    return json(route, ok({ count: M3_INSTANCE_ROWS.length, info: clone(M3_INSTANCE_ROWS) }))
  })
  await page.route('**/api/v3/count/service_instance/processes', async (route) => {
    const body = route.request().postDataJSON() || {}
    records.processCountQueries.push(body)
    return json(route, ok((body.ids || []).map((id) => ({ id, count: id === 501 ? 3 : 0 }))))
  })
  await page.route('**/api/v3/findmany/proc/process_instance', async (route) => {
    records.processQueries.push(route.request().postDataJSON() || {})
    return json(route, ok({ count: 0, info: [] }))
  })
  await page.route('**/api/v3/find/objectattgroup/object/biz', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/objectattr', (route) => json(route, ok([])))
  await page.route('**/api/v3/hosts/favorites/search', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/find/objectattr/web', (route) => json(route, ok([])))
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)

  const state = makeState()
  const records = makeRecords()
  attachObservers(page, records)
  await installM3(page, state, records)

  const checks = []
  try {
    await page.goto(`${BASE}/#/business/2/index?keyword=Database&node=module-22&tab=serviceInstance&page=3&limit=10&view=process`, { waitUntil: 'load' })
    await page.locator('[data-testid="business-topology-tree"]').waitFor()
    try {
      await page.locator('[data-node-id="module-22"]').waitFor()
    } catch (error) {
      const bodyText = await page.locator('body').innerText().catch(() => '')
      throw new Error(`${error.message}; page=${bodyText.slice(0, 800)}; hosts=${JSON.stringify(records.hostQueries)}; instances=${JSON.stringify(records.instanceQueries)}; apiResponses=${JSON.stringify(records.apiResponses)}; errors=${JSON.stringify(records.errors)}`)
    }
    assert(await page.locator('[data-node-id="module-21"]').count() === 0, 'keyword 过滤仍显示不匹配的模块')
    assert(await page.locator('[data-node-id="set-10"]').count() === 1, 'keyword 过滤未保留命中节点的祖先集群')
    assert(await page.locator('[data-node-id="module-22"]').evaluate((el) => el.closest('.el-tree-node')?.classList.contains('is-current')), '深链节点未恢复为当前选中节点')
    assert(await page.getByRole('tab', { name: '服务实例' }).getAttribute('aria-selected') === 'true', 'serviceInstance tab 未恢复')
    const firstQuery = hashQuery(page)
    assert(firstQuery.get('keyword') === 'Database' && firstQuery.get('node') === 'module-22' && firstQuery.get('page') === '3' && firstQuery.get('limit') === '10' && firstQuery.get('view') === 'process', '深链 query 在页面初始化时未完整恢复')
    assert(records.instanceQueries.some((body) => body.bk_biz_id === 2 && body.bk_module_id === 22 && body.with_name === true), '服务实例深链未按模块加载')
    checks.push('keyword/node/tab/view deep-link restore')
    await page.screenshot({ path: `${SHOTS}/m3-a-deep-link.png` })
    await page.reload({ waitUntil: 'load' })
    await page.locator('[data-node-id="module-22"]').waitFor()
    assert(await page.locator('[data-node-id="module-22"]').evaluate((el) => el.closest('.el-tree-node')?.classList.contains('is-current')), '刷新后未恢复深链节点')
    assert(await page.getByRole('tab', { name: '服务实例' }).getAttribute('aria-selected') === 'true', '刷新后未恢复 serviceInstance Tab')
    assert(await page.getByTestId('business-topology-keyword').inputValue() === 'Database', '刷新后未恢复树 keyword')
    assert(hashQuery(page).get('view') === 'process', '刷新后未保留服务实例 view')
    checks.push('refresh restores keyword, node, tab, and service view')

    await page.goto(`${BASE}/#/business/2/index?keyword=Database&node=module-22&tab=hostList&page=3&limit=10`, { waitUntil: 'load' })
    await page.locator('[data-testid="business-topology-host-pagination"] .el-pager li.is-active').waitFor()
    assert((await page.locator('[data-testid="business-topology-host-pagination"] .el-pager li.is-active').textContent()).trim() === '3', 'query.page 未恢复到主机分页')
    const paginationText = await page.locator('[data-testid="business-topology-host-pagination"]').innerText()
    assert(paginationText.includes('10'), `query.limit 未恢复到主机分页: ${paginationText}`)
    await waitForRecord(() => records.hostQueries.some((body) => body.page?.start === 20 && body.page?.limit === 10), `主机分页 query 未映射到请求 payload: ${JSON.stringify(records.hostQueries)}`)
    checks.push('host page/limit query restored to pagination and request payload')

    await page.getByRole('tab', { name: '服务实例' }).click()
    await waitForRecord(() => hashQuery(page).get('tab') === 'serviceInstance', '切换服务实例 Tab 后 URL 未回写 serviceInstance')
    assert(hashQuery(page).get('view') === 'instance', '服务实例 Tab 未写入旧版默认 view=instance')
    await page.getByRole('tab', { name: '主机列表' }).click()
    await waitForRecord(() => hashQuery(page).get('tab') === 'hostList', '切换主机 Tab 后 URL 未回写 hostList')
    let query = hashQuery(page)
    assert(query.get('page') === '1' && query.get('limit') === '10', '切换 Tab 未重置 page 或保留 limit')
    assert(!query.has('view'), '离开服务实例 Tab 后仍保留 view')
    await waitForRecord(() => records.hostQueries.some((body) => body.page?.start === 0 && body.page?.limit === 10), '主机列表未按恢复后的 limit 请求')
    checks.push('legacy tab mapping and tab-change pagination reset')

    const beforePageChange = records.hostQueries.length
    await page.locator('[data-testid="business-topology-host-pagination"] .el-pager li').filter({ hasText: /^2$/ }).click()
    await waitForRecord(() => hashQuery(page).get('page') === '2', '换页后 URL 未回写 page=2')
    await waitForRecord(() => records.hostQueries.length > beforePageChange, '换页后没有重新请求主机列表')
    const pageTwo = records.hostQueries.at(-1)
    assert(pageTwo.page?.start === 10 && pageTwo.page?.limit === 10, `分页 payload 不符合 page=2/limit=10: ${JSON.stringify(pageTwo.page)}`)
    checks.push('page query and host request pagination contract')

    const beforeLimitChange = records.hostQueries.length
    await page.locator('[data-testid="business-topology-host-pagination"] .el-select').click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: /^50/ }).last().click()
    await waitForRecord(() => hashQuery(page).get('limit') === '50', '切换 page size 后 URL 未回写 limit=50')
    await waitForRecord(() => records.hostQueries.length > beforeLimitChange, '切换 page size 后没有重新请求主机列表')
    query = hashQuery(page)
    assert(query.get('page') === '1', '切换 page size 后 page 未重置为 1')
    const pageSizeChange = records.hostQueries.at(-1)
    assert(pageSizeChange.page?.start === 0 && pageSizeChange.page?.limit === 50, `page size payload 不符合契约: ${JSON.stringify(pageSizeChange.page)}`)
    checks.push('page-size query and reset-to-first-page contract')

    await page.getByTestId('business-topology-keyword').fill('Web')
    await waitForRecord(() => hashQuery(page).get('keyword') === 'Web', '树关键词未写回 URL')
    await page.locator('[data-node-id="module-21"]').waitFor()
    assert(await page.locator('[data-node-id="module-22"]').count() === 0, '关键词改为 Web 后 Database 节点仍显示')
    await page.getByTestId('business-topology-keyword').fill('')
    await waitForRecord(() => !hashQuery(page).has('keyword'), '清空关键词后 URL 未删除 keyword')
    await page.locator('[data-node-id="module-22"]').waitFor()
    checks.push('keyword URL write-back, live filtering, and empty-query cleanup')

    await page.locator('[data-node-id="module-21"]').click()
    await waitForRecord(() => hashQuery(page).get('node') === 'module-21', '点击模块后 URL 未写回 node')
    query = hashQuery(page)
    assert(query.get('page') === '1' && query.get('tab') === 'hostList', '节点切换未重置 page 或保留当前 Tab')
    await page.getByRole('tab', { name: '节点信息' }).click()
    await waitForRecord(() => hashQuery(page).get('tab') === 'nodeInfo', '节点信息 Tab 未回写旧版 nodeInfo')
    assert(!hashQuery(page).has('view'), '节点信息 Tab 仍保留 service-instance view')
    await page.getByRole('tab', { name: '服务实例' }).click()
    await waitForRecord(() => hashQuery(page).get('tab') === 'serviceInstance', '切换服务实例 Tab 后 URL 未回写 serviceInstance')
    assert(hashQuery(page).get('view') === 'instance', '重新进入服务实例 Tab 时未设置默认 view=instance')
    assert(!records.unexpectedKube.length, `M3-A 不应发送 K8s 请求: ${records.unexpectedKube.join(', ')}`)
    checks.push('node selection, nodeInfo tab mapping, and no K8s deep-path request')

    // === M3-B: 主机列表契约 ===
    await page.goto(`${BASE}/#/business/2/index?tab=hostList&node=module-21&page=1&limit=10`, { waitUntil: 'load' })
    await page.locator('[data-testid="business-topology-host-table"]').waitFor()
    await waitForRecord(() => {
      const condition = records.hostQueries.at(-1)?.condition?.find((entry) => entry.bk_obj_id === 'module')?.condition?.[0]
      return condition?.field === 'bk_module_id' && condition?.operator === '$eq' && condition?.value === 21
    }, '模块节点条件未注入 bk_module_id $eq')
    checks.push('host module node condition payload')

    // 服务端排序: 表头点击 asc → desc → 清除,page.sort 写入请求(sort 不落 URL,老版仅内存)
    const ipHeader = page.locator('.el-table__header th').filter({ hasText: '内网IPv4' }).first()
    await ipHeader.click()
    await waitForRecord(() => records.hostQueries.at(-1)?.page?.sort === 'bk_host_innerip', '升序点击未写入 page.sort=bk_host_innerip')
    await ipHeader.click()
    await waitForRecord(() => records.hostQueries.at(-1)?.page?.sort === '-bk_host_innerip', '降序点击未写入 page.sort=-bk_host_innerip')
    await ipHeader.click()
    await waitForRecord(() => records.hostQueries.at(-1)?.page?.sort === 'bk_host_id', '清除排序未回退 page.sort=bk_host_id')
    assert(!hashQuery(page).has('sort'), 'sort 不应写入 URL(老版排序仅存内存)')
    checks.push('server-side sort cycle into page.sort')

    // IP 搜索: 老版顶层 ip/ipv6 对象(data/exact/flag) + URL ip query(text=逗号分隔)
    const ipInput = page.getByTestId('business-topology-host-ip')
    await ipInput.fill('192.168.1.1,2001:db8::1,asset-01')
    await ipInput.press('Enter')
    await waitForRecord(() => {
      const body = records.hostQueries.at(-1) || {}
      return Array.isArray(body.ip?.data) && body.ip.data.includes('192.168.1.1') && body.ip.data.includes('asset-01')
        && Array.isArray(body.ipv6?.data) && body.ipv6.data.includes('2001:db8::1')
        && body.ip.exact === 1 && body.ip.flag === 'bk_host_innerip|bk_host_outerip'
    }, `IP 搜索请求体不符合老版 ip/ipv6 契约: ${JSON.stringify(records.hostQueries.at(-1))}`)
    await waitForRecord(() => (hashQuery(page).get('ip') || '').startsWith('text=192.168.1.1'), `IP 搜索未持久化到 URL ip query: ${page.url()}`)
    await ipInput.fill('')
    await ipInput.press('Enter')
    await waitForRecord(() => Array.isArray(records.hostQueries.at(-1)?.ip?.data) && records.hostQueries.at(-1).ip.data.length === 0, '清空 IP 搜索后请求体未回归空 ip.data')
    await waitForRecord(() => !hashQuery(page).has('ip'), '清空 IP 搜索后 URL 未删除 ip query')
    checks.push('legacy ip/ipv6 search body and URL persistence')

    // 列配置: usercustom 读写 business_topology_table_column_config,固定列不可取消
    await page.locator('.col-set').click()
    await page.locator('.col-picker').waitFor()
    assert(await page.locator('.col-picker-row .el-checkbox.is-disabled').count() >= 3, '固定列应不可取消勾选')
    await page.locator('.col-picker').getByText('主机名').click()
    await waitForRecord(() => (records.usercustom.at(-1)?.business_topology_table_column_config || []).includes('bk_host_name'), '列配置变更未写入 usercustom')
    await page.reload({ waitUntil: 'load' })
    await page.locator('[data-testid="business-topology-host-table"]').waitFor()
    assert(await page.locator('.el-table__header th').filter({ hasText: '主机名' }).count() === 1, 'usercustom 列配置刷新后未恢复')
    checks.push('usercustom column config read/write with fixed columns')

    // 错误态 + 重试(失败只注入列表请求,放过 limit=500 的统计请求)
    const errorPage = await context.newPage()
    errorPage.setDefaultTimeout(8000)
    const errorRecords = makeRecords()
    attachObservers(errorPage, errorRecords)
    await installM3(errorPage, makeState(), errorRecords, { failHost: true })
    await errorPage.goto(`${BASE}/#/business/2/index?tab=hostList&node=module-21`, { waitUntil: 'load' })
    await errorPage.locator('[data-testid="business-topology-host-error"]').waitFor()
    await errorPage.locator('[data-testid="business-topology-host-error"]').getByRole('button', { name: '重试' }).click()
    await errorPage.locator('[data-testid="business-topology-host-table"]').waitFor()
    assert(await errorPage.locator('[data-testid="business-topology-host-error"]').count() === 0, '重试后错误态未消失')
    assert(!errorRecords.unexpectedKube.length, `主机失败路径不应触发 K8s 请求: ${errorRecords.unexpectedKube.join(', ')}`)
    await errorPage.close()
    checks.push('host load error state with retry recovery')

    // === M3-C: 服务实例契约 ===
    await page.goto(`${BASE}/#/business/2/index?tab=serviceInstance&node=module-22&page=2&limit=10`, { waitUntil: 'load' })
    await page.locator('[data-testid="business-topology-instance-table"]').waitFor()
    await waitForRecord(() => {
      const body = records.instanceQueries.at(-1) || {}
      return body.bk_module_id === 22 && body.page?.start === 10 && body.page?.limit === 10 && body.with_name === true
    }, `服务实例分页 payload 不符合契约: ${JSON.stringify(records.instanceQueries.at(-1))}`)
    assert((await page.locator('[data-testid="business-topology-instance-table"]').textContent()).includes('inst-alpha'), '服务实例行未渲染')
    assert((await page.locator('.table-footer').last().textContent()).includes('共计2条'), '实例 footer 未显示服务端 total')
    await waitForRecord(() => {
      const body = records.processCountQueries.at(-1) || {}
      return Array.isArray(body.ids) && body.ids.includes(501) && body.ids.includes(502)
    }, `进程数统计请求未按 ids 发出: ${JSON.stringify(records.processCountQueries)}`)
    assert((await page.locator('[data-testid="business-topology-instance-table"] tbody tr').first().textContent()).includes('3'), '进程数列未回填统计值')
    checks.push('instance shared pagination payload, with_name, and process count rollup')

    await page.locator('[data-testid="business-topology-instance-table"] tbody tr').first().getByText('查看/编辑进程').click()
    await waitForRecord(() => {
      const body = records.processQueries.at(-1) || {}
      return body.bk_biz_id === 2 && body.service_instance_id === 501 && body.page?.start === 0
    }, `进程抽屉 payload 不符合契约: ${JSON.stringify(records.processQueries.at(-1))}`)
    await page.locator('.el-drawer').filter({ hasText: '进程实例' }).waitFor()
    await page.keyboard.press('Escape')
    checks.push('process drawer request contract')

    const nameInput = page.getByTestId('business-topology-instance-search')
    await nameInput.fill('alpha')
    await nameInput.press('Enter')
    await waitForRecord(() => records.instanceQueries.at(-1)?.search_key === 'alpha', '实例名搜索未写入 search_key')
    await waitForRecord(() => hashQuery(page).get('instanceName') === 'alpha', `实例名搜索未持久化到 URL instanceName: ${page.url()}`)
    await nameInput.fill('')
    await nameInput.press('Enter')
    await waitForRecord(() => records.instanceQueries.at(-1)?.search_key === '', '清空实例名后 search_key 未复位')
    await waitForRecord(() => !hashQuery(page).has('instanceName'), '清空实例名后 URL 未删除 instanceName')
    checks.push('instanceName search body and URL persistence')

    await page.locator('.toolbar .el-select').filter({ hasText: '标签键' }).click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: /^env$/ }).last().click()
    await page.locator('.toolbar .el-select').filter({ hasText: '标签值' }).click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: /^test$/ }).last().click()
    await waitForRecord(() => {
      const selectors = records.instanceQueries.at(-1)?.selectors
      return Array.isArray(selectors) && selectors.some((item) => item.key === 'env' && item.operator === 'in' && Array.isArray(item.values) && item.values.includes('test'))
    }, `标签 selectors 未按 in 操作符写入: ${JSON.stringify(records.instanceQueries.at(-1))}`)
    checks.push('label selectors operator contract')

    const instErrorPage = await context.newPage()
    instErrorPage.setDefaultTimeout(8000)
    const instErrorRecords = makeRecords()
    attachObservers(instErrorPage, instErrorRecords)
    await installM3(instErrorPage, makeState(), instErrorRecords, { failInstance: true })
    await instErrorPage.goto(`${BASE}/#/business/2/index?tab=serviceInstance&node=module-22`, { waitUntil: 'load' })
    await instErrorPage.locator('[data-testid="business-topology-instance-error"]').waitFor()
    await instErrorPage.locator('[data-testid="business-topology-instance-error"]').getByRole('button', { name: '重试' }).click()
    await instErrorPage.locator('[data-testid="business-topology-instance-table"]').waitFor()
    assert(!instErrorRecords.unexpectedKube.length, `服务实例失败路径不应触发 K8s 请求: ${instErrorRecords.unexpectedKube.join(', ')}`)
    await instErrorPage.close()
    checks.push('instance load error state with retry recovery')

    await page.goto(`${BASE}/#/business/2/index?node=module-999&topo_path=set-10,module-999&tab=hostList`, { waitUntil: 'load' })
    await page.locator('[data-node-id="set-10"]').waitFor()
    assert(await page.locator('[data-node-id="set-10"]').evaluate((el) => el.closest('.el-tree-node')?.classList.contains('is-current')), '未知深层 node 未回退到 topo_path 中最近的普通祖先')
    assert(!records.unexpectedKube.length, `topo_path 回退触发了 deferred K8s 请求: ${records.unexpectedKube.join(', ')}`)
    checks.push('topo_path fallback to loaded ordinary ancestor without K8s calls')
    await page.screenshot({ path: `${SHOTS}/m3-a-topo-path-fallback.png` })

    const realErrors = records.errors.filter((entry) => !/favicon|ResizeObserver/.test(entry))
    assert(realErrors.length === 0, `页面产生运行时错误: ${realErrors.slice(0, 3).join(' | ')}`)
  } finally {
    await context.close()
    await browser.close()
  }

  fs.writeFileSync(REPORT, `${JSON.stringify({
    schemaVersion: 1,
    reportKind: 'ui-v3-m3-business-topology-mock',
    status: 'passed',
    screenshotDir: SHOTS,
    checks,
    requestCounts: { host: records.hostQueries.length, serviceInstance: records.instanceQueries.length },
    externalDependencies: 'mock-only'
  }, null, 2)}\n`)
  console.log(`M3-A business topology mock contract passed (${checks.length} checks)`)
}

run().catch((error) => {
  console.error(`✗ M3-A business topology: ${error.message}`)
  process.exitCode = 1
})
