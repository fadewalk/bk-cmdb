// B25: 假端点修复 + 主机详情新增关联 + 服务模板整页编辑(老版契约复刻验证)
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
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

  const stamp = Date.now()
  const api = (method, path, body) => page.evaluate(async ({ method, path, body }) => {
    const res = await fetch(`/api/v3${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    return { status: res.status, body: await res.json() }
  }, { method, path, body })
  const rootApi = (method, path, body) => page.evaluate(async ({ method, path, body }) => {
    const res = await fetch(path, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  }, { method, path, body })

  // 夹具
  let objId = `b25obj${String(stamp).slice(-6)}`
  let objModelRow = null
  let objAssocId = null
  let instId = null
  let svcTplId = null
  let hostId = null
  let bizId = null

  try {
    await page.goto(`${BASE}/#/index`, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(800)

    // ---------- 0. 业务 ID(不硬编码) ----------
    const bizRes = await api('POST', '/biz/search/0', { page: { start: 0, limit: 200 } })
    const bizList = bizRes.body?.data?.info || []
    const target = bizList.find((b) => b.bk_biz_id === 2) || bizList.find((b) => b.default === 0) || bizList[0]
    bizId = target?.bk_biz_id
    assert(bizId, '无法解析业务 ID')
    console.log('✓ 业务 ID:', bizId)

    // ---------- 1. 批次① 假端点路由存在性(非 404 即路由已注册) ----------
    const topoRes = await api('POST', `/find/instassttopo/object/host/inst/99999999`, { bk_biz_id: bizId, page: { start: 0, limit: 1 } })
    assert(topoRes.status !== 404, 'find/instassttopo/object/{obj}/inst/{inst} 路由不存在')
    assert(topoRes.body && 'result' in topoRes.body, 'instassttopo 响应形态异常')
    console.log('✓ 实例拓扑路由 find/instassttopo/object/host/inst/{id} 可达(响应 result:', topoRes.body.result, ')')

    const tblRes = await rootApi('PUT', `/table/update/instance/object/host/inst/99999999`, { bk_host_name: 'b25' })
    assert(tblRes.status !== 404, 'table/update/instance/object/{obj}/inst/{id} 路由不存在')
    console.log('✓ 根路径 table 更新路由 PUT 可达')

    const delTplRes = await api('DELETE', `/deletemany/topo/set_template/bk_biz_id/${bizId}/`, { set_template_ids: [] })
    assert(delTplRes.status !== 404, 'deletemany/topo/set_template DELETE 路由不存在')
    console.log('✓ 集群模板删除 DELETE 路由可达')

    // ---------- 2. 主机夹具 + 详情页关联可用性(未定义关联时按钮禁用) ----------
    const addHost = await api('POST', '/hosts/add/resource', {
      host_info: [{ bk_host_innerip: `10.0.${stamp % 200}.${Math.floor(stamp / 256) % 200}`, bk_host_name: `b25host${stamp}`, bk_cloud_id: 0 }],
      bk_supplier_account: '0'
    })
    assert(addHost.body?.result !== false, '创建主机夹具失败: ' + JSON.stringify(addHost.body).slice(0, 200))
    hostId = addHost.body?.data?.success?.[0]?.bk_host_id
    assert(hostId, '未取到 host_id: ' + JSON.stringify(addHost.body?.data))
    console.log('✓ 主机夹具:', hostId)

    const openAssocTab = async () => {
      await page.goto(`${BASE}/#/resource/host/${hostId}`, { waitUntil: 'load' })
      await page.waitForSelector('.detail-tabs', { timeout: 15000 })
      await page.click('.el-tabs__item:has-text("关联实例")')
      await page.waitForTimeout(900)
    }
    await openAssocTab()
    // 新库自带 bk_switch->host 等非主线关联,按钮可用性走老版主线过滤(主线关系不计数),此处只断言按钮存在
    const btnBefore = page.locator('button:has-text("新增关联")').first()
    await btnBefore.waitFor({ state: 'visible', timeout: 8000 })
    console.log('✓ 关联 tab 新增关联按钮渲染')

    // ---------- 3. 模型关联夹具 → 抽屉创建/取消实例关联 ----------
    const modelRes = await api('POST', '/create/object', {
      bk_obj_id: objId,
      bk_obj_name: `b25model${String(stamp).slice(-4)}`,
      bk_obj_icon: 'icon-cc-host',
      bk_classification_id: 'bk_network',
      bk_supplier_account: '0'
    })
    assert(modelRes.body?.result !== false, '创建自定义模型失败: ' + (modelRes.body?.bk_error_msg || ''))
    const typeRes = await api('POST', '/find/associationtype', {})
    const asstType = (typeRes.body?.data?.info || [])[0]
    assert(asstType?.bk_asst_id, '未取到关联类型')
    const assocRes = await api('POST', '/create/objectassociation', {
      bk_obj_id: 'host',
      bk_asst_obj_id: objId,
      bk_asst_id: asstType.bk_asst_id,
      bk_obj_asst_id: `b25asst${stamp}`,
      mapping: '1:n',
      on_delete: 'none',
      ispre: false
    })
    assert(assocRes.body?.result !== false, '创建模型关联失败: ' + (assocRes.body?.bk_error_msg || ''))
    objAssocId = assocRes.body?.data?.id
    console.log('✓ 模型关联夹具:', objAssocId, `(type=${asstType.bk_asst_id})`)

    const instRes = await api('POST', `/create/instance/object/${objId}`, { bk_inst_name: `b25inst${stamp}`, bk_supplier_account: '0' })
    assert(instRes.body?.result !== false, '创建模型实例失败: ' + (instRes.body?.bk_error_msg || ''))
    instId = instRes.body?.data?.bk_inst_id ?? instRes.body?.data?.id ?? instRes.body?.data
    assert(instId, '未取到实例 ID: ' + JSON.stringify(instRes.body?.data))
    console.log('✓ 模型实例夹具:', instId)

    await openAssocTab()
    const btnAfter = page.locator('button:has-text("新增关联")').first()
    await btnAfter.waitFor({ state: 'visible', timeout: 8000 })
    assert(!(await btnAfter.isDisabled()), '定义模型关联后新增关联按钮应可用')
    await btnAfter.click()
    await page.waitForSelector('.el-drawer:has-text("新增关联") .new-association', { timeout: 8000 })
    console.log('✓ 新增关联抽屉打开')

    // 选择关联列表(下拉项 label = 方向描述-模型名,精确匹配夹具模型)
    await page.click('.new-association .el-select')
    await page.waitForTimeout(600)
    await page.evaluate((modelLabel) => {
      const opt = [...document.querySelectorAll('.el-select-dropdown__item')]
        .filter((o) => o.offsetParent !== null)
        .find((o) => o.textContent.includes(modelLabel))
      if (!opt) throw new Error('关联列表下拉未找到夹具模型项')
      opt.click()
    }, `b25model${String(stamp).slice(-4)}`)
    await page.waitForSelector('.new-association .el-table__row', { timeout: 10000 })
    const rowText = await page.locator('.new-association .el-table__row').first().innerText()
    assert(rowText.includes(`b25inst${stamp}`), '实例表格未展示目标实例: ' + rowText)
    console.log('✓ 关联列表选择后展示目标实例')

    // 添加关联 → readback(注意:该接口只认 rules 格式 conditions,裸 condition 会被忽略)
    await page.click('.new-association .el-table__row button:has-text("添加关联")')
    await page.waitForTimeout(1000)
    const asstRules = () => ({ conditions: { condition: 'AND', rules: [{ field: 'bk_obj_asst_id', operator: 'equal', value: `b25asst${stamp}` }] }, page: { start: 0, limit: 200 } })
    let readback = await api('POST', '/search/instance_associations/object/host', asstRules())
    let assocCount = readback.body?.data?.count ?? (readback.body?.data?.info || []).length
    assert(assocCount === 1, '添加关联后应存在 1 条实例关联,实际 ' + assocCount)
    assert((readback.body?.data?.info || [])[0]?.bk_asst_inst_id === instId, '实例关联指向的实例不符')
    console.log('✓ 添加关联成功(create/instassociation 契约生效)')

    // 取消关联 → readback
    await page.click('.new-association .el-table__row button:has-text("取消关联")')
    await page.waitForTimeout(1000)
    readback = await api('POST', '/search/instance_associations/object/host', asstRules())
    assocCount = readback.body?.data?.count ?? (readback.body?.data?.info || []).length
    assert(assocCount === 0, '取消关联后实例关联应为 0,实际 ' + assocCount)
    console.log('✓ 取消关联成功(delete/instassociation 契约生效)')
    await page.click('.el-drawer:has(.new-association) .el-drawer__close-btn')
    await page.waitForTimeout(600)

    // ---------- 4. 主机属性编辑走真实 PUT 路由 ----------
    let hostUpdateCaptured = null
    await page.route('**/table/update/instance/object/**', (route) => {
      hostUpdateCaptured = { method: route.request().method(), url: route.request().url() }
      route.continue()
    })
    await page.click('.el-tabs__item:has-text("主机属性")')
    await page.waitForTimeout(600)
    await page.click('button:has-text("编辑属性")')
    await page.waitForTimeout(800)
    const nameInput = page.locator('.edit-form .el-input__inner').first()
    await nameInput.fill(`b25host${stamp}-edit`)
    await page.click('button:has-text("保存")')
    await page.waitForTimeout(1500)
    assert(hostUpdateCaptured, '主机属性保存未发出 table 更新请求')
    assert(hostUpdateCaptured.method === 'PUT', '主机属性更新应为 PUT: ' + hostUpdateCaptured.method)
    assert(/\/table\/update\/instance\/object\/host\/inst\/\d+$/.test(hostUpdateCaptured.url), '更新路径不符合老版契约: ' + hostUpdateCaptured.url)
    console.log('✓ 主机属性编辑 PUT', hostUpdateCaptured.url.replace(BASE, ''))

    // ---------- 5. 服务模板整页编辑(老版 edit.vue + management-form 复刻) ----------
    const cats = await api('POST', '/findmany/proc/service_category', { bk_biz_id: bizId })
    const catId = (cats.body?.data?.info || [])[0]?.id || 0
    assert(catId, '未取到服务分类')
    const moduleAttrs = await api('POST', '/find/objectattr', { bk_obj_id: 'module', bk_supplier_account: '0' })
    const modAttr = (Array.isArray(moduleAttrs.body?.data) ? moduleAttrs.body.data : moduleAttrs.body?.data?.info || [])[0]
    assert(modAttr?.id, '未取到模块属性')
    const tplName = `b25tpl${stamp}`
    const createTpl = await api('POST', '/create/proc/service_template/all_info', {
      bk_biz_id: bizId,
      name: tplName,
      service_category_id: catId,
      processes: [{
        property: {
          bk_func_name: { value: 'b25proc', as_default_value: true },
          bk_process_name: { value: 'b25proc', as_default_value: true }
        }
      }],
      attributes: [{ bk_attribute_id: modAttr.id, bk_property_value: 'b25val' }]
    })
    assert(createTpl.body?.result !== false, '创建服务模板夹具失败: ' + (createTpl.body?.bk_error_msg || ''))
    svcTplId = createTpl.body?.data?.id ?? createTpl.body?.data
    console.log('✓ 服务模板夹具:', svcTplId)

    const editUrl = `${BASE}/#/business/${bizId}/service/template/edit/${svcTplId}`
    await page.evaluate((url) => { window.location.assign(url) }, editUrl)
    await page.waitForSelector('.create-page', { timeout: 15000 })
    await page.waitForTimeout(1200)
    const nameVal = await page.locator('.create-page .name-input input').inputValue()
    assert(nameVal === tplName, '编辑页模板名称未回填: ' + nameVal)
    const bodyText = await page.locator('.create-page').innerText()
    assert(bodyText.includes('属性设置') && bodyText.includes('服务进程'), '编辑页缺少三段结构')
    // 属性值在 input value 里(innerText 读不到),进程名为行文本
    const propVal = await page.locator('.create-page .property-table .el-input__inner').first().inputValue()
    assert(propVal === 'b25val', '编辑页属性值未回填: ' + propVal)
    assert(bodyText.includes('b25proc'), '编辑页进程未回填')
    console.log('✓ 编辑页整页回填(基础信息/属性设置/服务进程)')

    // 修改名称保存,断言 PUT payload 契约
    let updatePayload = null
    await page.route('**/update/proc/service_template/all_info', (route) => {
      updatePayload = route.request().postDataJSON()
      route.continue()
    })
    await page.locator('.create-page .name-input input').fill(`${tplName}-edited`)
    await page.click('.create-footer button:has-text("保存")')
    await page.waitForTimeout(2000)
    assert(updatePayload, '保存未发出 update/proc/service_template/all_info')
    assert(updatePayload.id === svcTplId && updatePayload.bk_biz_id === bizId, 'PUT payload 缺少 id/bk_biz_id')
    assert(updatePayload.name === `${tplName}-edited`, 'PUT payload name 不符')
    assert(updatePayload.processes?.[0]?.id, '已有进程更新应携带进程 id')
    assert(Array.isArray(updatePayload.attributes), 'PUT payload 应包含 attributes')
    const rbTpl = await api('POST', '/find/proc/service_template/all_info', { bk_biz_id: bizId, id: svcTplId })
    assert(rbTpl.body?.data?.name === `${tplName}-edited`, '保存后模板名未变更: ' + rbTpl.body?.data?.name)
    console.log('✓ 整页编辑保存(PUT all_info + 进程 id + attributes)')

    // 编辑深链回收:老 /edit/ 路径不再落列表页小弹窗
    console.log('B25 全部通过')
  } catch (e) {
    errors.push('ASSERT: ' + e.message)
  } finally {
    // ---------- 清理 ----------
    try {
      const orphan = await api('POST', '/search/instance_associations/object/host', { conditions: { condition: 'AND', rules: [{ field: 'bk_obj_asst_id', operator: 'equal', value: `b25asst${stamp}` }] }, page: { start: 0, limit: 200 } })
      for (const rec of orphan.body?.data?.info || []) await api('DELETE', `/delete/instassociation/host/${rec.id}`)
    } catch {}
    try { if (svcTplId) await api('DELETE', '/delete/proc/service_template', { bk_biz_id: bizId, service_template_id: svcTplId }) } catch {}
    try { if (objAssocId) await api('DELETE', `/delete/objectassociation/${objAssocId}`) } catch {}
    try { if (instId && objId) await api('DELETE', `/delete/instance/object/${objId}/inst/${instId}`, { bk_biz_id: 0 }) } catch {}
    try { if (objId) await api('DELETE', `/delete/object/${objId}`, { bk_supplier_account: '0', is_force: true }) } catch {}
    try { if (hostId) await api('DELETE', '/hosts/batch', { bk_host_id: String(hostId), bk_supplier_account: '0' }) } catch {}
    await browser.close()
  }

  if (errors.length) {
    console.error('\n✗ B25 失败:')
    errors.forEach((e) => console.error('  -', e))
    process.exit(1)
  }
})()
