// M4-B: resource host page (HostList) transfer wizard contract.
// Legacy source: src/ui/src/views/resource/transfer/{transfer-menu.vue,host-store.js} + host-options.vue.
const fs = require('fs')
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const REPORT = process.env.UI_V3_M4_HOSTLIST_REPORT || '/tmp/ui-v3-m4-hostlist-transfer.json'
const SHOTS = process.env.UI_V3_M4_HOSTLIST_SHOTS || '/tmp/ui-v3-m4-hostlist-shots'
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

function hashPath(page) {
  const hash = new URL(page.url()).hash.replace(/^#/, '')
  return hash.split('?')[0]
}

async function waitForRecord(predicate, message, timeout = 6000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(message)
}

async function waitForMessage(page, text, timeout = 5000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const found = await page.locator('.el-message').filter({ hasText: text }).count()
    if (found) return
    await new Promise((resolve) => setTimeout(resolve, 60))
  }
  throw new Error(`未出现提示「${text}」`)
}

async function selectHostRow(page, ip, expectChecked = true) {
  const row = page.locator('.bk-table tbody tr').filter({ hasText: ip }).first()
  try {
    await row.locator('.el-checkbox').first().waitFor({ timeout: 4000 })
  } catch (error) {
    const tableText = await page.locator('.bk-table').first().innerText().catch(() => '(no table)')
    throw new Error(`row ${ip} not found; table=${tableText.slice(0, 500)}`)
  }
  await row.locator('.el-checkbox').first().click()
  await page.waitForTimeout(200)
  const checked = await row.locator('.el-checkbox').first().evaluate((el) => el.classList.contains('is-checked'))
  if (checked !== expectChecked) throw new Error(`row ${ip} checkbox expected ${expectChecked ? 'checked' : 'unchecked'}`)
}

const RESOURCE_ROWS = [
  // 资源池主机: biz.default===1
  { host: { bk_host_id: 102, bk_host_innerip: '10.0.0.2', bk_host_name: 'pool-host' }, biz: [{ bk_biz_id: 1, bk_biz_name: '资源池', default: 1 }], set: [], module: [{ bk_module_id: 999, bk_module_name: '默认目录', default: 1 }] },
  // 业务普通模块主机
  { host: { bk_host_id: 103, bk_host_innerip: '10.0.0.3', bk_host_name: 'biz-host' }, biz: [{ bk_biz_id: 2, bk_biz_name: 'Mock Business', default: 0 }], set: [{ bk_set_id: 10, bk_set_name: 'Applications' }], module: [{ bk_module_id: 21, bk_module_name: 'Web Module', default: 0 }] },
  // 业务空闲机主机
  { host: { bk_host_id: 104, bk_host_innerip: '10.0.0.4', bk_host_name: 'idle-host' }, biz: [{ bk_biz_id: 2, bk_biz_name: 'Mock Business', default: 0 }], set: [{ bk_set_id: 1, bk_set_name: '空闲机池' }], module: [{ bk_module_id: 2, bk_module_name: '空闲机模块', default: 1 }] }
]

function makeRecords() {
  return { idleAssign: [], crossBiz: [], resourceReturn: [], previewBodies: [], errors: [] }
}

function attachObservers(page, records) {
  page.on('pageerror', (error) => records.errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') records.errors.push(`console.error: ${message.text()}`)
  })
}

async function installM4Hostlist(page, records) {
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    return route.continue({ headers })
  })
  await page.addInitScript(() => localStorage.setItem('selectedBusiness', '2'))
  // 兜底:未逐一 mock 的页面级 API 返回空成功(先注册,后被 specifics 覆盖)
  await page.route('**/api/v3/**', (route) => json(route, ok({})))
  await page.route('**/userinfo', (route) => json(route, ok({ username: 'm4b', chname: 'M4B', current_supplier: '0' })))
  await page.route('**/api/v3/biz/search/0', (route) => json(route, ok({ count: 2, info: [
    { bk_biz_id: 2, bk_biz_name: 'Mock Business' },
    { bk_biz_id: 3, bk_biz_name: 'Target Business' }
  ] })))
  await page.route('**/api/v3/findmany/biz_set', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/usercustom/user/search', (route) => json(route, ok({})))
  await page.route('**/api/v3/usercustom', (route) => json(route, ok({})))
  await page.route('**/api/v3/find/classificationobject', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/object', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/objectattr', (route) => json(route, ok([
    { id: 1, bk_obj_id: 'host', bk_property_id: 'bk_host_innerip', bk_property_name: '内网IP', bk_property_type: 'singlechar', bk_property_group: 'default', bk_property_index: 1, ispre: true },
    { id: 2, bk_obj_id: 'host', bk_property_id: 'bk_host_name', bk_property_name: '主机名', bk_property_type: 'singlechar', bk_property_group: 'default', bk_property_index: 2, ispre: true }
  ])))
  await page.route('**/api/v3/findmany/hosts/search/resource', (route) => json(route, ok({ count: RESOURCE_ROWS.length, info: RESOURCE_ROWS })))
  await page.route(/\/api\/v3\/find\/topoinst_with_statistics\/biz\/2(?:\?.*)?$/, (route) => json(route, ok([
    { bk_obj_id: 'biz', bk_inst_id: 2, bk_inst_name: 'Mock Business', child: [
      { bk_obj_id: 'set', bk_inst_id: 10, bk_inst_name: 'Applications', child: [
        { bk_obj_id: 'module', bk_inst_id: 21, bk_inst_name: 'Web Module', child: [] }
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
  await page.route('**/api/v3/findmany/resource/directory', (route) => json(route, ok({ count: 1, info: [{ bk_module_id: 999, bk_module_name: '默认目录' }] })))
  await page.route('**/api/v3/hosts/modules/resource/idle', async (route) => {
    records.idleAssign.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  await page.route('**/api/v3/hosts/resource/cross/biz', async (route) => {
    records.crossBiz.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  await page.route('**/api/v3/hosts/modules/resource', async (route) => {
    records.resourceReturn.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  await page.route(/\/api\/v3\/host\/transfer_with_auto_clear_service_instance\/bk_biz_id\/2\/preview$/, async (route) => {
    records.previewBodies.push(route.request().postDataJSON() || {})
    return json(route, ok([]))
  })
  await page.route(/\/api\/v3\/host\/transfer_with_auto_clear_service_instance\/bk_biz_id\/2$/, (route) => json(route, ok(null)))
  await page.route('**/api/v3/hosts/app/*/list_hosts', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/find/topopath/biz/*', (route) => json(route, ok({ nodes: [] })))
  await page.route('**/api/v3/hosts/favorites**', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/findmany/cloud_area**', (route) => json(route, ok({ count: 0, info: [] })))
}

async function pickCascaderModule(page, setLabel, moduleLabel) {
  await page.locator('.el-cascader').first().click()
  await page.locator('.el-cascader-panel .el-cascader-node').filter({ hasText: setLabel }).first().click()
  await page.locator('.el-cascader-panel .el-cascader-node').filter({ hasText: moduleLabel }).last().click()
  await page.waitForTimeout(400)
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)

  const records = makeRecords()
  attachObservers(page, records)
  await installM4Hostlist(page, records)

  const checks = []
  try {
    await page.goto(`${BASE}/#/resource/host?scope=all`, { waitUntil: 'load' })
    try {
      await page.locator('.bk-table tbody tr').first().waitFor({ timeout: 8000 })
    } catch (error) {
      const bodyText = await page.locator('body').innerText().catch(() => '')
      throw new Error(`${error.message.split('\n')[0]}; page=${bodyText.slice(0, 600)}`)
    }
    await page.waitForTimeout(400)

    // 1. 资源池主机 idle 分配:目标业务 + /hosts/modules/resource/idle(修复旧实现误调退回资源池接口)
    await selectHostRow(page, '102')
    await page.getByRole('button').filter({ hasText: '分配到' }).click()
    const wizard = page.locator('.el-dialog').filter({ has: page.locator('.el-steps') })
    await wizard.waitFor()
    assert(await wizard.locator('text=资源池主机将直接分配到目标业务的空闲机池').isVisible(), '资源主机 idle 分支缺少说明')
    await wizard.locator('.el-select').first().click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: 'Target Business' }).last().click()
    await page.waitForTimeout(400)
    try {
      await wizard.getByRole('button', { name: '下一步' }).click()
      await wizard.getByRole('button', { name: '确认转移' }).click()
    } catch (error) {
      const dlgText = await wizard.innerText().catch(() => '(dialog gone)')
      const dlgCount = await page.locator('.el-dialog').count()
      throw new Error(`${error.message.split('\n')[0]}; dialogs=${dlgCount}; wizard=${dlgText.slice(0, 500)}`)
    }
    await waitForRecord(() => {
      const body = records.idleAssign.at(-1)
      return body?.bk_biz_id === 3 && body?.bk_host_id?.[0] === 102
    }, `idle 分配 payload 不符合契约: ${JSON.stringify(records.idleAssign.at(-1))}`)
    await waitForMessage(page, '分配成功')
    checks.push('resource host idle assign posts /hosts/modules/resource/idle with dst biz')

    // 2. 业务主机 move:预览页契约(不再直调 /hosts/modules)
    await selectHostRow(page, '103')
    await page.getByRole('button').filter({ hasText: '分配到' }).click()
    await wizard.waitFor()
    await pickCascaderModule(page, 'Applications', 'Web Module')
    try {
      await wizard.getByRole('button', { name: '下一步' }).click()
      await wizard.getByRole('button', { name: '确认转移' }).click()
    } catch (error) {
      const dlgText = await wizard.innerText().catch(() => '(dialog gone)')
      const dlgCount = await page.locator('.el-dialog').count()
      throw new Error(`[${hashPath(page)}] ${error.message.split('\n')[0]}; dialogs=${dlgCount}; wizard=${dlgText.slice(0, 400)}`)
    }
    await waitForRecord(() => hashPath(page).includes('/business/2/host/transfer/business'), 'move 未跳转转移预览页')
    await waitForRecord(() => {
      const body = records.previewBodies.at(-1)
      return body?.bk_host_ids?.[0] === 103 && body.is_remove_from_all === true && body.add_to_modules?.[0] === 21
    }, `预览 payload 不符合契约: ${JSON.stringify(records.previewBodies.at(-1))}`)
    await page.goBack()
    await page.locator('.bk-table tbody tr').first().waitFor()
    await page.waitForTimeout(300)
    checks.push('business host move redirects to transfer preview page')

    // 3. 业务空闲机主机 across: MULTI_TO_ONE 分组 payload
    await selectHostRow(page, '104')
    await page.getByRole('button').filter({ hasText: '分配到' }).click()
    await wizard.waitFor()
    await wizard.getByText('跨业务转移', { exact: true }).click()
    await wizard.locator('.el-select').first().click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: 'Target Business' }).last().click()
    await page.waitForTimeout(600)
    await pickCascaderModule(page, '空闲机池', 'Target Idle Module')
    try {
      await wizard.getByRole('button', { name: '下一步' }).click()
      await wizard.getByRole('button', { name: '确认转移' }).click()
    } catch (error) {
      const dlgText = await wizard.innerText().catch(() => '(dialog gone)')
      const dlgCount = await page.locator('.el-dialog').count()
      throw new Error(`[${hashPath(page)}] ${error.message.split('\n')[0]}; dialogs=${dlgCount}; wizard=${dlgText.slice(0, 400)}`)
    }
    await waitForRecord(() => {
      const body = records.crossBiz.at(-1)
      const group = body?.resource_hosts?.[0]
      return body?.dst_bk_biz_id === 3 && body?.dst_bk_module_id === 32
        && group?.src_bk_biz_id === 2 && Array.isArray(group?.src_bk_host_ids) && group.src_bk_host_ids[0] === 104
    }, `跨业务 MULTI_TO_ONE payload 不符合契约: ${JSON.stringify(records.crossBiz.at(-1))}`)
    await waitForMessage(page, '转移成功')
    checks.push('across posts MULTI_TO_ONE resource_hosts grouped by source biz')

    // 4. 门禁:普通模块主机不可归还主机池(老版文案)
    await selectHostRow(page, '103')
    await page.getByRole('button').filter({ hasText: '更多' }).click()
    await page.locator('.el-dropdown-menu__item:visible').first().waitFor({ timeout: 4000 })
    await page.waitForTimeout(200)
    await page.locator('.el-dropdown-menu__item:visible').filter({ hasText: '转移到资源池' }).click()
    await page.waitForTimeout(300)
    await waitForMessage(page, '仅支持对空闲机池下的主机进行操作')
    await page.keyboard.press('Escape')
    checks.push('return-to-pool gating rejects normal module hosts with legacy text')

    // 5. 空闲机主机归还:目录必选 + bk_module_id payload(先取消步骤4的 103)
    await selectHostRow(page, '103', false)
    await selectHostRow(page, '104')
    await page.getByRole('button').filter({ hasText: '更多' }).click()
    await page.locator('.el-dropdown-menu__item:visible').first().waitFor({ timeout: 4000 })
    await page.waitForTimeout(200)
    await page.locator('.el-dropdown-menu__item:visible').filter({ hasText: '转移到资源池' }).click()
    await page.waitForTimeout(300)
    const returnDialog = page.locator('.el-dialog').filter({ hasText: '确认归还主机池' })
    try {
      await returnDialog.waitFor()
    } catch (error) {
      const bodyText = await page.locator('body').innerText().catch(() => '')
      const errs = records.errors.slice(-3)
      throw new Error(`${error.message.split('\n')[0]}; body=${bodyText.slice(0, 400)}; errors=${JSON.stringify(errs)}`)
    }
    await returnDialog.locator('.el-select').click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: '默认目录' }).last().click()
    await returnDialog.getByRole('button', { name: '确定' }).click()
    await waitForRecord(() => {
      const body = records.resourceReturn.at(-1)
      return body?.bk_biz_id === 2 && body?.bk_host_id?.[0] === 104 && body?.bk_module_id === 999
    }, `归还主机池 payload 缺少 bk_module_id: ${JSON.stringify(records.resourceReturn.at(-1))}`)
    checks.push('return to pool posts directory id with payload')
    await page.screenshot({ path: `${SHOTS}/m4-b-hostlist-transfer.png` })

    const realErrors = records.errors.filter((entry) => !/favicon|ResizeObserver/.test(entry))
    assert(realErrors.length === 0, `页面产生运行时错误: ${realErrors.slice(0, 3).join(' | ')}`)
  } finally {
    await context.close()
    await browser.close()
  }

  fs.writeFileSync(REPORT, `${JSON.stringify({
    schemaVersion: 1,
    reportKind: 'ui-v3-m4-hostlist-transfer-mock',
    status: 'passed',
    screenshotDir: SHOTS,
    checks,
    requestCounts: {
      idleAssign: records.idleAssign.length,
      crossBiz: records.crossBiz.length,
      resourceReturn: records.resourceReturn.length,
      preview: records.previewBodies.length
    },
    externalDependencies: 'mock-only'
  }, null, 2)}\n`)
  console.log(`M4-B hostlist transfer mock contract passed (${checks.length} checks)`)
}

run().catch((error) => {
  console.error(`✗ M4-B hostlist transfer: ${error.message}`)
  process.exitCode = 1
})
