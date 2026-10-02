// M4-C: host detail single-host transfer contract (legacy host-details/children/info.vue).
const fs = require('fs')
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const REPORT = process.env.UI_V3_M4_DETAIL_REPORT || '/tmp/ui-v3-m4-hostdetail-transfer.json'
const SHOTS = process.env.UI_V3_M4_DETAIL_SHOTS || '/tmp/ui-v3-m4-hostdetail-shots'
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

const DETAIL_ROWS = [
  { host: { bk_host_id: 103, bk_host_innerip: '10.0.0.3', bk_host_name: 'biz-host' }, biz: [{ bk_biz_id: 2, bk_biz_name: 'Mock Business', default: 0 }], set: [{ bk_set_id: 10, bk_set_name: 'Applications' }], module: [{ bk_module_id: 21, bk_module_name: 'Web Module', default: 0 }] },
  { host: { bk_host_id: 104, bk_host_innerip: '10.0.0.4', bk_host_name: 'idle-host' }, biz: [{ bk_biz_id: 2, bk_biz_name: 'Mock Business', default: 0 }], set: [{ bk_set_id: 1, bk_set_name: '空闲机池' }], module: [{ bk_module_id: 2, bk_module_name: '空闲机模块', default: 1 }] }
]

// 部署态 8090 上 hash 差异 goto 为同文档导航(组件不重挂),统一 goto+reload 保证深链重解析
async function gotoReload(page, url, options) {
  await page.goto(url, options)
  await page.reload({ waitUntil: 'load' }).catch(() => {})
}

function makeRecords() {
  return { previewBodies: [], executeBodies: [], acrossBodies: [], errors: [] }
}

function attachObservers(page, records) {
  page.on('pageerror', (error) => records.errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') records.errors.push(`console.error: ${message.text()}`)
  })
}

async function installM4Detail(page, records) {
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    return route.continue({ headers })
  })
  // 兜底:未逐一 mock 的页面级 API 返回空成功(晚于 **/* 注册即优先生效,specifics 再覆盖兜底)
  await page.route('**/api/v3/**', (route) => json(route, ok({})))
  await page.route('**/userinfo', (route) => json(route, ok({ username: 'm4c', chname: 'M4C', current_supplier: '0' })))
  await page.route('**/api/v3/biz/search/0', (route) => json(route, ok({ count: 2, info: [
    { bk_biz_id: 2, bk_biz_name: 'Mock Business' },
    { bk_biz_id: 3, bk_biz_name: 'Target Business' }
  ] })))
  await page.route('**/api/v3/findmany/hosts/search/with_biz', (route) => json(route, ok({ count: DETAIL_ROWS.length, info: DETAIL_ROWS })))
  // 主机属性分组呈现契约(老版 host-details/property.vue)
  await page.route('**/api/v3/find/objectattr', (route) => json(route, ok([
    { bk_property_id: 'bk_host_innerip', bk_property_name: '内网IP', bk_property_group: 'default', bk_property_index: 1 },
    { bk_property_id: 'bk_host_name', bk_property_name: '主机名称', bk_property_group: 'default', bk_property_index: 2 },
    { bk_property_id: 'bk_os_name', bk_property_name: '操作系统类型', bk_property_group: 'more', bk_property_index: 1 },
    { bk_property_id: 'bk_host_id', bk_property_name: '主机ID', bk_property_group: 'default', bk_property_index: 3 }
  ])))
  await page.route('**/api/v3/find/objectattgroup/object/host', (route) => json(route, ok([
    { bk_group_id: 'more', bk_group_name: '更多信息', bk_group_index: 2, bk_supplier_account: '0' },
    { bk_group_id: 'default', bk_group_name: '基础信息', bk_group_index: 1, bk_supplier_account: '0' }
  ])))
  await page.route('**/api/v3/find/classificationobject', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/object', (route) => json(route, ok([])))
  await page.route('**/api/v3/findmany/biz_set', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/usercustom/user/search', (route) => json(route, ok({})))
  await page.route('**/api/v3/usercustom', (route) => json(route, ok({})))
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
  await page.route(/\/api\/v3\/host\/transfer_with_auto_clear_service_instance\/bk_biz_id\/2\/preview$/, async (route) => {
    records.previewBodies.push(route.request().postDataJSON() || {})
    return json(route, ok([]))
  })
  await page.route(/\/api\/v3\/host\/transfer_with_auto_clear_service_instance\/bk_biz_id\/2$/, async (route) => {
    records.executeBodies.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  await page.route('**/api/v3/hosts/modules/across/biz', async (route) => {
    records.acrossBodies.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  await page.route('**/api/v3/hosts/app/*/list_hosts', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/find/topopath/biz/*', (route) => json(route, ok({ nodes: [] })))
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
  await installM4Detail(page, records)

  const checks = []
  try {
    // 1. 业务主机详情转移 tab:老版结构(归属行+移除+修改归属),不再出现追加模式/直转资源池
    await gotoReload(page, `${BASE}/#/business/2/host/103?tab=transfer`, { waitUntil: 'load' })
    try {
      await page.locator('.module-row').filter({ hasText: 'Web Module' }).waitFor({ timeout: 8000 })
    } catch (error) {
      const bodyText = await page.locator('body').innerText().catch(() => '')
      throw new Error(`${error.message.split('\n')[0]}; page=${bodyText.slice(0, 600)}; errors=${JSON.stringify(records.errors.slice(-3))}`)
    }
    assert(await page.getByRole('button', { name: '从该模块移除' }).count() === 1, '归属模块行缺少「从该模块移除」')
    assert(await page.getByRole('button', { name: '修改归属' }).isVisible(), '修改归属按钮缺失')
    assert(await page.getByRole('button', { name: '转移到资源池' }).count() === 0, '老版详情页不应有直接转移到资源池按钮')
    checks.push('legacy transfer tab structure with per-module remove')


    // 2. 修改归属→业务模块:gotoTransferPage 契约(single=1)
    await page.getByRole('button', { name: '修改归属' }).click()
    const dialog = page.locator('.el-dialog').filter({ hasText: '修改主机归属' })
    await dialog.waitFor()
    await pickCascaderModule(page, 'Applications', 'Web Module')
    await dialog.getByRole('button', { name: '确定' }).click()
    await waitForRecord(() => hashPath(page).includes('/business/2/host/transfer/business'), 'business 未跳转移预览页')
    let q = hashQuery(page)
    assert(q.get('resources') === '103' && q.get('targetModules') === '21' && q.get('single') === '1', `business 预览页 query 不符合契约: ${q.toString()}`)
    await waitForRecord(() => {
      const body = records.previewBodies.at(-1)
      return body?.bk_host_ids?.[0] === 103 && body.is_remove_from_all === true && body.add_to_modules?.[0] === 21
    }, `business 预览 payload 不符合契约: ${JSON.stringify(records.previewBodies.at(-1))}`)
    checks.push('business tab redirects to transfer preview page with single=1')

    // 3. 空闲机主机:修改归属→idle 直转(default_internal_module),且跨业务 tab 可见
    await gotoReload(page, `${BASE}/#/business/2/host/104?tab=transfer`, { waitUntil: 'load' })
    await page.locator('.module-row').filter({ hasText: '空闲机模块' }).waitFor()
    await page.getByRole('button', { name: '修改归属' }).click()
    await dialog.waitFor()
    assert(await dialog.getByText('跨业务', { exact: true }).isVisible(), '空闲机主机未显示跨业务 tab')
    await dialog.getByText('空闲机', { exact: true }).click()
    await page.waitForTimeout(300)
    await pickCascaderModule(page, '空闲机池', '空闲机模块')
    await dialog.getByRole('button', { name: '确定' }).click()
    await waitForRecord(() => {
      const body = records.executeBodies.at(-1)
      return body?.bk_host_ids?.[0] === 104 && body.default_internal_module === 2 && body.is_remove_from_all === true
    }, `idle 直转 payload 不符合契约: ${JSON.stringify(records.executeBodies.at(-1))}`)
    assert(hashPath(page).includes('/business/2/host/104'), 'idle 直转不应离开详情页')
    checks.push('idle host in idle set transfers directly with default_internal_module')

    // 4. 跨业务:ONE_TO_ONE payload + 成功后路由业务改写
    await page.getByRole('button', { name: '修改归属' }).click()
    await dialog.waitFor()
    await dialog.getByText('跨业务', { exact: true }).click()
    await dialog.locator('.el-select').first().click()
    await page.locator('.el-select-dropdown__item').filter({ hasText: 'Target Business' }).last().click()
    await page.waitForTimeout(400)
    await pickCascaderModule(page, '空闲机池', 'Target Idle Module')
    await dialog.getByRole('button', { name: '确定' }).click()
    await waitForRecord(() => {
      const body = records.acrossBodies.at(-1)
      return body?.src_bk_biz_id === 2 && body?.dst_bk_biz_id === 3 && body?.bk_host_id?.[0] === 104 && body?.bk_module_id === 32
    }, `跨业务 payload 不符合契约: ${JSON.stringify(records.acrossBodies.at(-1))}`)
    try {
      await waitForRecord(() => hashPath(page).startsWith('/business/3/host/104'), 'x')
    } catch {
      await page.waitForTimeout(800)
      const bodyText = await page.locator('body').innerText().catch(() => '')
      throw new Error(`跨业务成功后未改写路由业务上下文; url=${page.url()}; body=${bodyText.slice(0, 300)}; errors=${JSON.stringify(records.errors.slice(-3))}`)
    }
    checks.push('across posts ONE_TO_ONE payload and rewrites route biz context')

    // 5. 从该模块移除:跳 type=remove 预览页(sourceId 即移除模块)
    await gotoReload(page, `${BASE}/#/business/2/host/103?tab=transfer`, { waitUntil: 'load' })
    try {
      await page.locator('.module-row').filter({ hasText: 'Web Module' }).waitFor({ timeout: 8000 })
    } catch (error) {
      const bodyText = await page.locator('body').innerText().catch(() => '')
      throw new Error(`${error.message.split('\n')[0]}; page=${bodyText.slice(0, 600)}; errors=${JSON.stringify(records.errors.slice(-3))}`)
    }
    await page.getByRole('button', { name: '从该模块移除' }).click()
    await waitForRecord(() => hashPath(page).includes('/business/2/host/transfer/remove/21'), '移除未跳转移预览页')
    q = hashQuery(page)
    assert(q.get('sourceModel') === 'module' && q.get('sourceId') === '21' && q.get('resources') === '103', `remove 预览页 query 不符合契约: ${q.toString()}`)
    await waitForRecord(() => {
      const body = records.previewBodies.at(-1)
      return Array.isArray(body?.remove_from_modules) && body.remove_from_modules[0] === 21 && body.is_remove_from_all === false
    }, `remove 预览 payload 不符合契约: ${JSON.stringify(records.previewBodies.at(-1))}`)
    checks.push('per-module remove redirects to remove-type transfer preview')
    await page.screenshot({ path: `${SHOTS}/m4-c-hostdetail-transfer.png` })

    // 末段:属性 tab 老版契约——按分组呈现,中文 bk_property_name,组序按 bk_group_index
    await gotoReload(page, `${BASE}/#/business/2/host/103?tab=property`, { waitUntil: 'load' })
    await page.locator('.group-name').first().waitFor({ timeout: 8000 })
    const groupNames = await page.locator('.group-name').allInnerTexts()
    assert(groupNames.join(',') === '基础信息,更多信息', `分组顺序应为 基础信息,更多信息(组 fixtures 乱序注入),实际 ${groupNames.join(',')}`)
    assert(await page.locator('.prop-group').first().getByText('内网IP').count() === 1, '属性标签未用中文 bk_property_name')
    assert(await page.getByText('10.0.0.3').count() >= 1, '属性值未按 property 渲染')
    const propCardText = await page.locator('.prop-group').first().innerText()
    assert(!propCardText.includes('bk_host_innerip'), '属性标签仍暴露英文标识')
    checks.push('property tab grouped Chinese labels with legacy group order')
    await page.screenshot({ path: `${SHOTS}/m4-c-hostdetail-property.png` })

    const realErrors = records.errors.filter((entry) => !/favicon|ResizeObserver/.test(entry))
    assert(realErrors.length === 0, `页面产生运行时错误: ${realErrors.slice(0, 3).join(' | ')}`)
  } finally {
    await context.close()
    await browser.close()
  }

  fs.writeFileSync(REPORT, `${JSON.stringify({
    schemaVersion: 1,
    reportKind: 'ui-v3-m4-hostdetail-transfer-mock',
    status: 'passed',
    screenshotDir: SHOTS,
    checks,
    requestCounts: {
      preview: records.previewBodies.length,
      execute: records.executeBodies.length,
      across: records.acrossBodies.length
    },
    externalDependencies: 'mock-only'
  }, null, 2)}\n`)
  console.log(`M4-C host detail transfer mock contract passed (${checks.length} checks)`)
}

run().catch((error) => {
  console.error(`✗ M4-C host detail transfer: ${error.message}`)
  process.exitCode = 1
})
