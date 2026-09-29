// M4-A: business topology host transfer flow contract (gating / idle-direct / resource / across / preview page).
const fs = require('fs')
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const REPORT = process.env.UI_V3_M4_REPORT || '/tmp/ui-v3-m4-host-transfer.json'
const SHOTS = process.env.UI_V3_M4_SHOTS || '/tmp/ui-v3-m4-host-transfer-shots'
fs.mkdirSync(SHOTS, { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function ok(data) {
  return { result: true, bk_error_code: 0, bk_error_msg: 'success', data }
}

function json(route, data) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function hashPath(page) {
  const hash = new URL(page.url()).hash.replace(/^#/, '')
  return hash.split('?')[0]
}

function hashQuery(page) {
  const hash = new URL(page.url()).hash.replace(/^#/, '')
  return new URLSearchParams(hash.split('?')[1] || '')
}

async function waitForRecord(predicate, message, timeout = 6000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(message)
}

const M4_HOST_ROWS = [
  { host: { bk_host_id: 101, bk_host_innerip: '10.0.0.1', bk_host_name: 'biz-host' }, set: [{ bk_set_id: 10, bk_set_name: 'Applications' }], module: [{ bk_module_id: 21, bk_module_name: 'Web Module', default: 0 }] },
  { host: { bk_host_id: 102, bk_host_innerip: '10.0.0.2', bk_host_name: 'idle-host' }, set: [{ bk_set_id: 1, bk_set_name: '空闲机池' }], module: [{ bk_module_id: 2, bk_module_name: '空闲机模块', default: 1 }] },
  { host: { bk_host_id: 103, bk_host_innerip: '10.0.0.3', bk_host_name: 'idle-host-3' }, set: [{ bk_set_id: 1, bk_set_name: '空闲机池' }], module: [{ bk_module_id: 2, bk_module_name: '空闲机模块', default: 1 }] }
]

function makeRecords() {
  return { hostBodies: [], resourceBodies: [], acrossBodies: [], previewBodies: [], executeBodies: [], directoryBodies: [], unexpectedKube: [], errors: [] }
}

function attachObservers(page, records) {
  page.on('request', (request) => {
    if (/\/find\/kube\//.test(request.url())) records.unexpectedKube.push(request.url())
  })
  page.on('pageerror', (error) => records.errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') records.errors.push(`console.error: ${message.text()}`)
  })
}

async function installM4(page, records) {
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    return route.continue({ headers })
  })
  await page.route('**/userinfo', (route) => json(route, ok({ username: 'm4-mock', chname: 'M4 Mock', current_supplier: '0' })))
  await page.route('**/api/v3/biz/search/0', (route) => json(route, ok({ count: 2, info: [
    { bk_biz_id: 2, bk_biz_name: 'Mock Business' },
    { bk_biz_id: 3, bk_biz_name: 'Target Business' }
  ] })))
  await page.route('**/api/v3/findmany/biz_set', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/usercustom/user/search', (route) => json(route, ok({})))
  await page.route('**/api/v3/usercustom', (route) => json(route, ok({})))
  await page.route('**/api/v3/find/classificationobject', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/object', (route) => json(route, ok([])))
  await page.route(/\/api\/v3\/find\/topoinst_with_statistics\/biz\/2(?:\?.*)?$/, (route) => json(route, ok([
    { bk_obj_id: 'biz', bk_inst_id: 2, bk_inst_name: 'Mock Business', child: [
      { bk_obj_id: 'set', bk_inst_id: 10, bk_inst_name: 'Applications', child: [
        { bk_obj_id: 'module', bk_inst_id: 21, bk_inst_name: 'Web Module', child: [] },
        { bk_obj_id: 'module', bk_inst_id: 22, bk_inst_name: 'Database Module', child: [] }
      ] }
    ] }
  ])))
  await page.route('**/api/v3/topo/internal/0/2/with_statistics', (route) => json(route, ok({
    bk_set_id: 1, bk_set_name: '空闲机池', default: 1,
    module: [{ bk_module_id: 2, bk_module_name: '空闲机模块', default: 1 }]
  })))
  await page.route('**/api/v3/topo/internal/0/3/with_statistics', (route) => json(route, ok({
    bk_set_id: 30, bk_set_name: '空闲机池', default: 1,
    module: [{ bk_module_id: 32, bk_module_name: 'Target Idle Module', default: 1 }]
  })))
  await page.route('**/api/v3/findmany/hosts/search/with_biz', async (route) => {
    const body = route.request().postDataJSON() || {}
    records.hostBodies.push(body)
    if (body.page?.limit === 500) return json(route, ok({ count: M4_HOST_ROWS.length, info: M4_HOST_ROWS }))
    return json(route, ok({ count: M4_HOST_ROWS.length, info: M4_HOST_ROWS }))
  })
  await page.route('**/api/v3/hosts/app/*/list_hosts', (route) => json(route, ok({ count: 1, info: [{ bk_host_id: 101, bk_host_innerip: '10.0.0.1', bk_host_name: 'biz-host' }] })))
  await page.route('**/api/v3/find/topopath/biz/*', (route) => json(route, ok({ nodes: [] })))
  await page.route('**/api/v3/findmany/resource/directory', async (route) => {
    records.directoryBodies.push(route.request().postDataJSON() || {})
    return json(route, ok({ count: 1, info: [{ bk_module_id: 999, bk_module_name: '默认目录' }] }))
  })
  await page.route('**/api/v3/hosts/modules/resource', async (route) => {
    records.resourceBodies.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  await page.route('**/api/v3/hosts/modules/across/biz', async (route) => {
    records.acrossBodies.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  await page.route(/\/api\/v3\/host\/transfer_with_auto_clear_service_instance\/bk_biz_id\/2\/preview$/, async (route) => {
    records.previewBodies.push(route.request().postDataJSON() || {})
    return json(route, ok([]))
  })
  await page.route(/\/api\/v3\/host\/transfer_with_auto_clear_service_instance\/bk_biz_id\/2$/, async (route) => {
    records.executeBodies.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  await page.route('**/api/v3/findmany/proc/service_instance/labels/aggregation', (route) => json(route, ok({})))
  await page.route('**/api/v3/findmany/proc/service_instance', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/count/service_instance/processes', (route) => json(route, ok([])))
  await page.route('**/api/v3/findmany/proc/process_instance', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/find/objectattgroup/object/biz', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/objectattr', (route) => json(route, ok([])))
  await page.route('**/api/v3/hosts/favorites/search', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/find/objectattr/web', (route) => json(route, ok([])))
}

async function selectHostRow(page, ip, expectChecked = true) {
  const row = page.locator('[data-testid="business-topology-host-table"] tbody tr').filter({ hasText: ip }).first()
  await row.locator('.el-checkbox').first().click()
  try {
    await page.waitForTimeout(200)
    const checked = await row.locator('.el-checkbox').first().evaluate((el) => el.classList.contains('is-checked'))
    if (checked !== expectChecked) throw new Error(`row ${ip} checkbox expected ${expectChecked ? 'checked' : 'unchecked'}`)
  } catch (error) {
    const tableText = await page.locator('[data-testid="business-topology-host-table"]').innerText().catch(() => '')
    throw new Error(`${error.message}; table=${tableText.slice(0, 300)}`)
  }
}

async function openTransferDropdown(page) {
  const trigger = page.getByRole('button').filter({ hasText: '转移至' })
  const disabled = await trigger.isDisabled()
  if (disabled) throw new Error('转移至按钮仍处于禁用态,主机选择未生效')
  await trigger.click()
  try {
    await page.locator('.el-dropdown-menu__item:visible').first().waitFor({ timeout: 4000 })
  } catch (error) {
    throw new Error(`转移至下拉未展开: ${error.message.split('\n')[0]}`)
  }
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)

  const records = makeRecords()
  attachObservers(page, records)
  await installM4(page, records)

  const checks = []
  try {
    await page.goto(`${BASE}/#/business/2/index`, { waitUntil: 'load' })
    await page.locator('[data-testid="business-topology-host-table"]').waitFor()
    await page.waitForTimeout(400)

    // 1. 门禁:业务模块主机选中时,资源池/跨业务禁用并带提示
    await selectHostRow(page, '10.0.0.1')
    await openTransferDropdown(page)
    const resourceItem = page.locator('.el-dropdown-menu__item').filter({ hasText: '转移到资源池' })
    const acrossItem = page.locator('.el-dropdown-menu__item').filter({ hasText: '跨业务转移' })
    assert((await resourceItem.getAttribute('class')).includes('disabled'), '资源池项未按空闲机池校验禁用')
    assert((await acrossItem.getAttribute('class')).includes('disabled'), '跨业务项未按空闲机池校验禁用')
    assert((await resourceItem.getAttribute('title') || '').includes('空闲机池'), '资源池项缺少老版禁用提示文案')
    await page.keyboard.press('Escape')
    checks.push('idle-set gating on resource/across dropdown items')

    // 2. 已在空闲机池的主机:转移至空闲机池直接提交,不进预览页(先取消步骤1的 A,保证仅选 B)
    await selectHostRow(page, '10.0.0.1', false)
    await selectHostRow(page, '10.0.0.2')
    await openTransferDropdown(page)
    await page.locator('.el-dropdown-menu__item').filter({ hasText: '转移至空闲机池' }).click()
    await waitForRecord(() => {
      const body = records.executeBodies.at(-1)
      return body?.bk_host_ids?.[0] === 102 && body.is_remove_from_all === true && body.default_internal_module === 2
    }, `idle 直接转移 payload 不符合契约: ${JSON.stringify(records.executeBodies.at(-1))}`)
    assert(!hashPath(page).includes('/host/transfer'), 'idle 直接转移不应跳转预览页')
    checks.push('idle hosts transfer directly with default_internal_module')

    // 3. 归还主机池:目录必选 + 老版 payload bk_module_id
    await page.waitForTimeout(500)
    await selectHostRow(page, '10.0.0.2')
    await openTransferDropdown(page)
    await page.locator('.el-dropdown-menu__item').filter({ hasText: '转移到资源池' }).click()
    const resourceDialog = page.locator('.el-dialog').filter({ hasText: '确认归还主机池' })
    await resourceDialog.waitFor()
    assert((await resourceDialog.textContent()).includes('空闲机池'), '归还确认文案缺少空闲机池名')
    await resourceDialog.locator('.el-select').click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: '默认目录' }).last().click()
    await resourceDialog.getByRole('button', { name: '确定' }).click()
    await waitForRecord(() => {
      const body = records.resourceBodies.at(-1)
      return body?.bk_biz_id === 2 && body.bk_host_id?.[0] === 102 && body.bk_module_id === 999
    }, `归还主机池 payload 缺少 bk_module_id: ${JSON.stringify(records.resourceBodies.at(-1))}`)
    checks.push('resource return requires directory and posts bk_module_id')

    // 4. 跨业务:目标业务空闲机模块 + src/dst payload
    await page.waitForTimeout(500)
    await selectHostRow(page, '10.0.0.2')
    await openTransferDropdown(page)
    await page.locator('.el-dropdown-menu__item').filter({ hasText: '跨业务转移' }).click()
    const acrossDialog = page.locator('.el-dialog').filter({ hasText: '跨业务转移' })
    await acrossDialog.waitFor()
    await acrossDialog.locator('.el-select').first().click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: 'Target Business' }).last().click()
    await acrossDialog.locator('.el-cascader').click()
    await page.locator('.el-cascader-panel .el-cascader-node').filter({ hasText: '空闲机池' }).first().click()
    await page.locator('.el-cascader-panel .el-cascader-node').filter({ hasText: 'Target Idle Module' }).last().click()
    await acrossDialog.getByRole('button', { name: '确认转移' }).click()
    await page.locator('.el-message-box').waitFor()
    await page.locator('.el-message-box__btns .el-button--primary').click()
    await waitForRecord(() => {
      const body = records.acrossBodies.at(-1)
      return body?.src_bk_biz_id === 2 && body?.dst_bk_biz_id === 3 && body?.bk_host_id?.[0] === 102 && body?.bk_module_id === 32
    }, `跨业务 payload 不符合契约: ${JSON.stringify(records.acrossBodies.at(-1))}`)
    checks.push('across biz posts src/dst with target idle module only')

    // 5. 业务模块转移:预览页按路由业务执行,返回后拓扑页重挂载刷新
    await page.waitForTimeout(500)
    await selectHostRow(page, '10.0.0.1')
    await openTransferDropdown(page)
    await page.locator('.el-dropdown-menu__item').filter({ hasText: '业务模块' }).click()
    const transferDialog = page.locator('.el-dialog').filter({ has: page.locator('.el-dialog__title', { hasText: '转移主机' }) })
    try {
      await transferDialog.waitFor()
    } catch (error) {
      const dialogTitles = await page.evaluate(() => [...document.querySelectorAll('.el-dialog')]
        .map((d) => `${d.querySelector('.el-dialog__title')?.textContent || '?'}:${getComputedStyle(d).display}`))
      throw new Error(`${error.message.split('\n')[0]}; dialogs=${dialogTitles.join('|')}`)
    }
    await transferDialog.locator('.el-cascader').click()
    await page.locator('.el-cascader-panel .el-cascader-node').filter({ hasText: 'Applications' }).first().click()
    await page.locator('.el-cascader-panel .el-cascader-node').filter({ hasText: 'Web Module' }).last().click()
    await transferDialog.getByRole('button', { name: '确定' }).click()
    await waitForRecord(() => hashPath(page).includes('/business/2/host/transfer/business'), '业务模块转移未跳转预览页')
    await waitForRecord(() => {
      const body = records.previewBodies.at(-1)
      return body?.bk_host_ids?.[0] === 101 && body.is_remove_from_all === true && body.add_to_modules?.[0] === 21
    }, `转移预览 payload 不符合契约: ${JSON.stringify(records.previewBodies.at(-1))}`)
    assert(hashPath(page).startsWith('/business/2/host/transfer'), '预览页未按路由业务路径打开')
    // 执行成功后 HostTransfer 自身 router.back();以执行前的请求数为基线验证重挂载刷新
    const hostCallsBeforeConfirm = records.hostBodies.length
    await page.getByRole('button', { name: '确认转移' }).click()
    await waitForRecord(() => records.executeBodies.length >= 2, '预览页确认未提交执行接口')
    const pageExecute = records.executeBodies.at(-1)
    assert(!('options' in pageExecute), `空预览不应附带 options: ${JSON.stringify(pageExecute)}`)
    await waitForRecord(() => hashPath(page) === '/business/2/index', '执行成功后未自动返回业务拓扑页')
    await waitForRecord(() => records.hostBodies.length > hostCallsBeforeConfirm, '返回拓扑页后主机列表未重新加载(重挂载刷新)')
    checks.push('business transfer preview page uses route biz and remount refreshes list')

    await page.screenshot({ path: `${SHOTS}/m4-a-transfer.png` })
    assert(!records.unexpectedKube.length, `转移流程不应触发 K8s 请求: ${records.unexpectedKube.join(', ')}`)
    const realErrors = records.errors.filter((entry) => !/favicon|ResizeObserver/.test(entry))
    assert(realErrors.length === 0, `页面产生运行时错误: ${realErrors.slice(0, 3).join(' | ')}`)
  } finally {
    await context.close()
    await browser.close()
  }

  fs.writeFileSync(REPORT, `${JSON.stringify({
    schemaVersion: 1,
    reportKind: 'ui-v3-m4-host-transfer-mock',
    status: 'passed',
    screenshotDir: SHOTS,
    checks,
    requestCounts: {
      resource: records.resourceBodies.length,
      across: records.acrossBodies.length,
      preview: records.previewBodies.length,
      execute: records.executeBodies.length
    },
    externalDependencies: 'mock-only'
  }, null, 2)}\n`)
  console.log(`M4-A host transfer mock contract passed (${checks.length} checks)`)
}

run().catch((error) => {
  console.error(`✗ M4-A host transfer: ${error.message}`)
  process.exitCode = 1
})
