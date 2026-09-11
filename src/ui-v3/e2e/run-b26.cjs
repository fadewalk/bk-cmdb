// B26: 集群模板同步差异确认页(set-sync 复刻) + 业务同步逐进程差异/实例对比(business-synchronous 复刻)
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
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    route.continue({ headers })
  })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push('console: ' + m.text()) })

  const stamp = Date.now()
  const TAG = String(stamp).slice(-6)
  const api = (method, path, body) => page.evaluate(async ({ method, path, body }) => {
    const res = await fetch(`/api/v3${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Bkcmdb-User': 'admin', 'X-Bkcmdb-Supplier-Account': '0' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await res.text()
    try { return JSON.parse(text) } catch { return { result: false, bk_error_msg: `non-json(${res.status})` } }
  }, { method, path, body })

  // 夹具句柄
  let svcA = null
  let svcB = null
  let setTplId = null
  let setId = null
  let bizSetId = null
  let bizModId = null
  let bizHostId = null

  const leafCategory = async () => {
    const cats = await api('POST', '/findmany/proc/service_category', { bk_biz_id: 2 })
    const list = cats?.data?.info || []
    return list.find((c) => !list.some((x) => x.bk_parent_id === c.id))?.id
  }
  const createSvcTpl = async (name, procName) => {
    const catId = await leafCategory()
    const res = await api('POST', '/create/proc/service_template/all_info', {
      bk_biz_id: 2,
      name,
      service_category_id: catId,
      processes: [{
        property: {
          bk_func_name: { value: procName, as_default_value: true },
          bk_process_name: { value: procName, as_default_value: true },
          port: { value: '80', as_default_value: true }
        }
      }],
      attributes: []
    })
    assert(res.result !== false, `创建服务模板 ${name} 失败: ` + (res.bk_error_msg || ''))
    return res.data?.id ?? res.data
  }

  try {
    await page.goto(`${BASE}/#/index`, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(600)

    // ========== Part A: 集群模板同步差异确认页 ==========
    svcA = await createSvcTpl(`b26sa${TAG}`, 'pa')
    svcB = await createSvcTpl(`b26sb${TAG}`, 'pb')
    const setTpl = await api('POST', '/create/topo/set_template/bk_biz_id/2/', {
      name: `b26stpl${TAG}`, bk_biz_id: 2, service_template_ids: [svcA]
    })
    assert(setTpl.result !== false, '创建集群模板失败: ' + (setTpl.bk_error_msg || ''))
    setTplId = setTpl.data?.id
    const setRes = await api('POST', '/set/2', {
      bk_set_name: `b26set${TAG}`, bk_parent_id: 2, bk_supplier_account: '0', set_template_id: setTplId
    })
    assert(setRes.result !== false, '创建模板集群失败: ' + (setRes.bk_error_msg || ''))
    setId = setRes.data?.bk_set_id
    console.log(`✓ 夹具: svcA=${svcA} svcB=${svcB} setTpl=${setTplId} set=${setId}`)

    // 更新集群模板追加服务模板 → 集群出现"待新增模块"差异
    const upd = await api('PUT', `/update/topo/set_template/${setTplId}/bk_biz_id/2`, {
      service_template_ids: [svcA, svcB]
    })
    assert(upd.result !== false, '更新集群模板失败: ' + (upd.bk_error_msg || ''))

    // 打开差异确认页
    let syncPayload = null
    await page.route('**/sync_to_instances*', (route) => {
      try { syncPayload = route.request().postDataJSON() } catch {}
      route.continue()
    })
    await page.evaluate((url) => { window.location.assign(url) }, `${BASE}/#/business/2/set/sync/${setTplId}?sets=${setId}`)
    await page.waitForSelector('.set-sync-page', { timeout: 15000 })
    await page.waitForTimeout(1500)
    const headText = await page.locator('.set-sync-page .sync-head').innerText()
    assert(headText.includes('请确认单个实例更改信息'), '页头标题不符: ' + headText)
    assert(headText.includes('变更') && headText.includes('新增') && headText.includes('删除'), '缺少变更图例')
    const bodyText = await page.locator('.set-sync-page').innerText()
    assert(bodyText.includes('拓扑结构变更'), '未展示拓扑结构变更区块')
    assert(bodyText.includes('拓扑同步前') && bodyText.includes('拓扑同步后'), '缺少同步前后双栏')
    assert(bodyText.includes('新增'), '拓扑差异缺少新增标记')
    assert(bodyText.includes(`b26set${TAG}`), '集群拓扑路径未展示')
    console.log('✓ 差异确认页整页渲染(标题/图例/双栏拓扑差异/新增标记)')

    // 确认同步 → 断言 payload bk_set_ids
    await page.click('.sync-footer button:has-text("确认同步")')
    await page.waitForTimeout(1800)
    assert(syncPayload, '确认同步未发出 sync_to_instances 请求')
    assert(JSON.stringify(syncPayload.bk_set_ids) === JSON.stringify([setId]), '同步 payload bk_set_ids 不符: ' + JSON.stringify(syncPayload))
    console.log('✓ 确认同步 payload 契约(bk_set_ids)', JSON.stringify(syncPayload))

    // ========== Part B: 业务同步逐进程差异 ==========
    const bizSet = await api('POST', '/set/2', { bk_set_name: `b26bizset${TAG}`, bk_parent_id: 2, bk_supplier_account: '0' })
    bizSetId = bizSet.data?.bk_set_id
    const bizMod = await api('POST', `/module/2/${bizSetId}`, {
      bk_module_name: `b26mod${TAG}`, bk_parent_id: bizSetId, bk_supplier_account: '0', service_template_id: svcA
    })
    assert(bizMod.result !== false, '创建模板模块失败: ' + (bizMod.bk_error_msg || ''))
    bizModId = bizMod.data?.bk_module_id
    const addHost = await api('POST', '/hosts/add/resource', {
      host_info: [{ bk_host_innerip: `10.0.${stamp % 200}.${Math.floor(stamp / 256) % 200}`, bk_host_name: `b26h${TAG}`, bk_cloud_id: 0 }]
    })
    bizHostId = addHost.data?.success?.[0]?.bk_host_id
    const toIdle = await api('POST', '/hosts/modules/resource/idle', { bk_biz_id: 2, bk_host_id: [bizHostId] })
    assert(toIdle.result !== false, '主机转入业务空闲机失败: ' + (toIdle.bk_error_msg || ''))
    const transfer = await api('POST', '/hosts/modules', { bk_biz_id: 2, bk_host_id: [bizHostId], bk_module_id: [bizModId], is_increment: false })
    assert(transfer.result !== false, '主机转入模板模块失败: ' + (transfer.bk_error_msg || ''))
    // 模板追加进程 pb → 模块产生"新增进程"差异
    const p2 = await api('POST', '/createmany/proc/proc_template', {
      bk_biz_id: 2,
      service_template_id: svcA,
      processes: [{ spec: { bk_func_name: { value: 'pb', as_default_value: true }, bk_process_name: { value: 'pb', as_default_value: true } } }]
    })
    assert(p2.result !== false, '追加进程模板失败: ' + (p2.bk_error_msg || ''))
    console.log(`✓ 业务同步夹具: set=${bizSetId} mod=${bizModId} host=${bizHostId} 进程pb已追加`)

    // UI: 选模板 → 模块分组自动展开 → 进程列表 → 变更内容 → 涉及实例 → 实例对比抽屉
    await page.evaluate((url) => { window.location.assign(url) }, `${BASE}/#/business/sync`)
    await page.waitForSelector('.biz-sync-page', { timeout: 15000 })
    await page.waitForTimeout(800)
    // 选择服务模板下拉(第 2 个 select)
    const selects = page.locator('.biz-sync-page .toolbar .el-select')
    await selects.nth(1).click()
    await page.waitForTimeout(500)
    await page.evaluate((name) => {
      const opt = [...document.querySelectorAll('.el-select-dropdown__item')]
        .filter((o) => o.offsetParent !== null)
        .find((o) => o.textContent.includes(name))
      if (!opt) throw new Error('模板下拉未找到: ' + name)
      opt.click()
    }, `b26sa${TAG}`)
    await page.waitForTimeout(1500)
    // 模块分组按 topo 展示;自动展开第 1 组(老版契约),手动展开业务模块所在组
    const heads = page.locator('.module-group .group-head')
    const headCount = await heads.count()
    let bizGroupIdx = -1
    for (let i = 0; i < headCount; i += 1) {
      const t = await heads.nth(i).innerText()
      if (t.includes(`b26bizset${TAG}`)) bizGroupIdx = i
    }
    assert(bizGroupIdx >= 0, '未找到业务模块分组')
    await heads.nth(bizGroupIdx).click()
    try {
      await page.waitForSelector('.module-group .process-item', { timeout: 20000 })
    } catch (e) {
      const snap = await page.locator('.biz-sync-page').innerText().catch(() => '')
      throw new Error('进程差异未渲染,页面快照: ' + snap.replace(/\s+/g, ' ').slice(0, 300))
    }
    const bodyText2 = await page.locator('.biz-sync-page').innerText()
    assert(bodyText2.includes('变更内容'), '未渲染变更内容区块')
    assert(bodyText2.includes('涉及实例'), '未渲染涉及实例区块')
    assert(bodyText2.includes('pb'), '进程列表未包含新增进程 pb')
    assert(bodyText2.includes('模板中新增进程'), '新增进程未展示模板中新增进程文案')
    console.log('✓ 模块分组 + 进程差异(变更内容/涉及实例)渲染')

    // 点击涉及实例 → 实例对比抽屉
    const instItem = page.locator('.instance-item').first()
    if (await instItem.count()) {
      await instItem.click()
      await page.waitForSelector('.el-drawer:visible', { timeout: 8000 })
      console.log('✓ 实例对比抽屉打开')
      await page.click('.el-drawer:visible .el-drawer__close-btn')
    } else {
      console.log('- 无涉及实例(实例未自动创建),跳过抽屉断言')
    }

    console.log('B26 全部通过')
  } catch (e) {
    errors.push('ASSERT: ' + (e.message || e))
  } finally {
    // ---------- 清理 ----------
    try { if (setId) await api('DELETE', `/set/2/${setId}`, { bk_supplier_account: '0' }) } catch {}
    try { if (bizSetId) await api('DELETE', `/set/2/${bizSetId}`, { bk_supplier_account: '0' }) } catch {}
    try { if (setTplId) await api('DELETE', `/deletemany/topo/set_template/bk_biz_id/2/`, { data: { set_template_ids: [setTplId] } }) } catch {}
    try { if (bizHostId) await api('DELETE', '/hosts/batch', { bk_host_id: String(bizHostId), bk_supplier_account: '0' }) } catch {}
    for (const id of [svcA, svcB].filter(Boolean)) {
      try { await api('DELETE', '/delete/proc/service_template', { bk_biz_id: 2, service_template_id: id }) } catch {}
    }
    await browser.close()
  }

  if (errors.length) {
    console.error('\n✗ B26 失败:')
    errors.forEach((e) => console.error('  -', e))
    process.exit(1)
  }
})()
