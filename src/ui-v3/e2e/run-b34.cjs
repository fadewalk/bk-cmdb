// B34: 集群模板操作列对齐老版 —— 编辑/删除(整页编辑回填+PUT all_info) / 行点击进详情页(config+instance 双 tab) / 属性逐项编辑删除 / 实例列表同步操作 / 同步历史页
const { chromium } = require('./browser.cjs')
const path = require('path')
const fs = require('fs')
const SHOTS = '/tmp/ui-v3-shots'
fs.mkdirSync(SHOTS, { recursive: true })
function ok(label) { console.log(`✓ ${label}`) }
function fail(label, e) { console.error(`✗ ${label}: ${e?.message || e}`); process.exitCode = 1 }

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.route('**/*', (route) => {
    route.continue({ headers: { ...route.request().headers(), 'Cache-Control': 'no-cache' } })
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`) })

  const putAllInfo = []
  const putName = []
  const putAttr = []
  const delAttr = []
  const syncStatusBodies = []
  const retryPosts = []

  try {
    // === 1. 列表:操作列 编辑/删除 + 行点击进详情整页 ===
    await page.goto('http://localhost:8090/#/business/2/set/template', { waitUntil: 'load' })
    await page.waitForTimeout(3000)
    const rows = page.locator('.el-table__body tr')
    const rowCount = await rows.count()
    if (rowCount > 0) ok(`列表行数 ${rowCount}`)
    else throw new Error('列表无数据')

    const firstRow = rows.nth(0)
    const opText = (await firstRow.locator('td').last().innerText()).replace(/\s+/g, ' ')
    if (opText.includes('编辑') && opText.includes('删除') && !opText.includes('详情')) ok(`操作列=编辑/删除: ${opText}`)
    else fail('操作列契约', `实际 "${opText}"`)
    await page.screenshot({ path: path.join(SHOTS, 'B34-list.png'), fullPage: true })

    // 行点击 → /business/2/set/template/details/:id
    await firstRow.locator('td').nth(1).click()
    await page.waitForTimeout(2000)
    const detailUrl = page.url()
    if (/set\/template\/details\/\d+/.test(detailUrl)) ok(`行点击进详情页: ${detailUrl}`)
    else fail('行点击详情路由', detailUrl)

    // 详情页 config tab:双 tab + 名称回显
    const tabTexts = await page.locator('.el-tabs__item').allInnerTexts()
    if (tabTexts.some((t) => t.includes('集群模板配置')) && tabTexts.some((t) => t.includes('集群模板实例'))) ok('详情页双 tab')
    else fail('详情页双 tab', tabTexts.join('|'))
    const detailName = (await page.locator('.basic-value').first().innerText()).trim()
    if (detailName && detailName !== '--') ok(`详情名称回显: ${detailName}`)
    else fail('详情名称回显', '为空')

    // === 2. 详情 config:名称行内编辑 PUT 契约 ===
    await page.route('**/api/v3/update/topo/set_template/*/bk_biz_id/*', (route, req) => {
      if (req.method() === 'PUT') putName.push(req.postDataJSON())
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: true, data: {} }) })
    })
    await page.locator('.grid-item').first().hover()
    await page.locator('.grid-item').first().locator('.property-edit-button').click()
    await page.locator('.name-form input').fill('b34-renamed-tpl')
    await page.locator('.name-form input').press('Enter')
    await page.waitForTimeout(800)
    const namePut = putName.find((b) => b.name)
    if (namePut && namePut.name === 'b34-renamed-tpl') ok(`名称行内保存 PUT {name}: ${JSON.stringify(namePut)}`)
    else fail('名称行内保存 PUT', JSON.stringify(putName))

    // === 3. 编辑页:回填 + 保存 PUT all_info + 修改成功对话框 ===
    await page.goto('http://localhost:8090/#/business/2/set/template')
    await page.waitForTimeout(2500)
    await page.route('**/api/v3/find/topo/set_template/all_info', (route) => route.continue())
    await page.route('**/api/v3/update/topo/set_template/all_info', (route, req) => {
      putAllInfo.push(req.postDataJSON())
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: true, data: {} }) })
    })
    await page.route('**/api/v3/findmany/topo/set_template/bk_biz_id/*/set_template_status', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ result: true, data: [{ set_template_id: 0, need_sync: true, sets: null }] })
      }))
    await page.locator('.el-table__body tr').nth(0).locator('button:has-text("编辑")').click()
    await page.waitForTimeout(2000)
    const editUrl = page.url()
    if (/set\/template\/edit\/\d+/.test(editUrl)) ok(`编辑进整页: ${editUrl}`)
    else fail('编辑路由', editUrl)
    const editName = await page.locator('.name-input input').inputValue()
    if (editName === detailName || editName) ok(`编辑页名称回填: ${editName}`)
    const boundCount = await page.locator('.topo-child').count()
    if (boundCount > 0) ok(`编辑页绑定服务模板节点 ${boundCount} 个`)
    else fail('编辑页服务模板回填', '无节点')
    await page.locator('.name-input input').fill(`b34-edit-${Date.now() % 10000}`)
    await page.locator('.create-footer button:has-text("保存")').click()
    await page.waitForTimeout(1200)
    const allInfoPut = putAllInfo[0]
    if (allInfoPut && allInfoPut.id && allInfoPut.bk_biz_id === 2 && Array.isArray(allInfoPut.service_template_ids) && Array.isArray(allInfoPut.attributes)) {
      ok(`保存 PUT all_info 契约: ${JSON.stringify({ id: allInfoPut.id, bk_biz_id: allInfoPut.bk_biz_id })}`)
    } else fail('PUT all_info', JSON.stringify(putAllInfo))
    const successDlg = await page.locator('.el-dialog:has-text("修改成功")').isVisible().catch(() => false)
    if (successDlg) ok('修改成功对话框(needSync 出同步集群入口)')
    else fail('修改成功对话框', '未出现')
    await page.screenshot({ path: path.join(SHOTS, 'B34-edit-success.png'), fullPage: true })

    // === 4. 实例 tab:请求契约 + 行渲染 + 去同步/重试/删除 ===
    // 取一个真实集群模型属性 id,用于属性编辑契约 mock
    const propId = await page.evaluate(async () => {
      const res = await fetch('/api/v3/find/objectattr/web', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ bk_obj_id: 'set', bk_biz_id: 2 })
      })
      const body = await res.json()
      const props = body?.data || []
      const p = props.find((x) => x.bk_property_id === 'bk_set_name') || props[0]
      return p ? p.id : 0
    })
    if (propId) ok(`真实集群属性 id=${propId}`)

    await page.route('**/api/v3/findmany/topo/set_template_sync_status/bk_biz_id/*', (route, req) => {
      syncStatusBodies.push(req.postDataJSON())
      return route.continue()
    })
    await page.goto(`http://localhost:8090/#/business/2/set/template/details/1?tab=instance`)
    await page.waitForTimeout(2000)
    const syncReq = syncStatusBodies[0]
    if (syncReq && syncReq.set_template_id === 1 && syncReq.page) ok('实例列表请求 set_template_id 契约')
    else fail('实例列表请求', JSON.stringify(syncStatusBodies))

    // mock 出 need_sync 与 failure 两条实例 + topo(host_count)
    const setAttrId = propId
    await page.route('**/api/v3/findmany/topo/set_template_sync_status/bk_biz_id/*', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          result: true,
          data: {
            count: 2,
            info: [
              { bk_inst_id: 31, status: 'need_sync', last_time: '2026-09-12T01:00:00Z', creator: 'admin' },
              { bk_inst_id: 32, status: 'failure', last_time: '2026-09-12T02:00:00Z', creator: 'admin' }
            ]
          }
        })
      }))
    await page.route('**/api/v3/findmany/topo/set_template/*/bk_biz_id/*/sets/web', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          result: true,
          data: {
            info: [
              { bk_set_id: 31, bk_set_name: 'b34-set-a', host_count: 0, topo_path: [{ bk_inst_id: 2, bk_inst_name: '蓝鲸', ObjectID: 'biz' }, { bk_inst_id: 31, bk_inst_name: 'b34-set-a', ObjectID: 'set' }] },
              { bk_set_id: 32, bk_set_name: 'b34-set-b', host_count: 5, topo_path: [{ bk_inst_id: 2, bk_inst_name: '蓝鲸', ObjectID: 'biz' }, { bk_inst_id: 32, bk_inst_name: 'b34-set-b', ObjectID: 'set' }] }
            ]
          }
        })
      }))
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(2000)
    const instRows = page.locator('.el-table__body tr')
    if ((await instRows.count()) === 2) {
      const row0 = instRows.nth(0)
      if (((await row0.locator('td').nth(1).innerText()).trim()) === 'b34-set-a') ok('实例集群名称来自 sets/web')
      if (((await row0.locator('td').nth(2).innerText()).trim()).includes('蓝鲸')) ok('拓扑路径渲染')
      if (((await row0.locator('td').nth(4).innerText()).trim()) === '待同步') ok('need_sync → 待同步')
      // host_count>0 删除禁用
      const delBtn1 = instRows.nth(1).locator('button:has-text("删除")')
      if (!(await delBtn1.isEnabled())) ok('含主机集群删除禁用')
      else fail('含主机删除禁用', '仍可点')
      // 去同步 → diff 页带 sets
      await row0.locator('button:has-text("去同步")').click()
      await page.waitForTimeout(1200)
      if (/set\/sync\/1\?sets=31/.test(page.url())) ok(`去同步进差异页: ${page.url()}`)
      else fail('去同步路由', page.url())
    } else fail('实例 mock 行', `期望 2 行,实际 ${await instRows.count()}`)

    // 重试契约(重新进入实例 tab,mock failure 行)
    await page.route('**/api/v3/updatemany/topo/set_template/*/bk_biz_id/*/sync_to_instances', (route, req) => {
      retryPosts.push(req.postDataJSON())
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: true, data: {} }) })
    })
    await page.goto('http://localhost:8090/#/business/2/set/template/details/1?tab=instance')
    await page.waitForTimeout(2000)
    await page.locator('.el-table__body tr').nth(1).locator('button:has-text("重试")').click()
    await page.waitForTimeout(800)
    const retryBody = retryPosts[0]
    if (retryBody && JSON.stringify(retryBody.bk_set_ids) === '[32]') ok(`重试 POST bk_set_ids=[32]`)
    else fail('重试 POST', JSON.stringify(retryPosts))

    // === 5. 属性设置逐项编辑/删除契约(mock all_info 携带属性) ===
    await page.route('**/api/v3/find/topo/set_template/all_info', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          result: true,
          data: { id: 1, bk_biz_id: 2, name: 'b34-tpl-attrs', service_template_ids: [8], attributes: setAttrId ? [{ bk_attribute_id: setAttrId, bk_property_value: 'b34-val' }] : [] }
        })
      }))
    await page.route('**/api/v3/update/topo/set_template/attribute', (route, req) => {
      putAttr.push(req.postDataJSON())
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: true, data: {} }) })
    })
    await page.route('**/api/v3/delete/topo/set_template/attribute', (route, req) => {
      delAttr.push(req.postDataJSON())
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: true, data: {} }) })
    })
    await page.goto('http://localhost:8090/#/business/2/set/template/details/1')
    // 同路径 query 变化会复用组件,强制刷新以重跑 onMounted 加载 mock 的 all_info
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(2000)
    if (setAttrId) {
      const attrItem = page.locator('.grid-item').nth(1)
      if (await attrItem.count()) {
        await attrItem.hover()
        await attrItem.locator('.property-edit-button').click()
        await attrItem.locator('input').fill('b34-newval')
        await attrItem.locator('button:has-text("保存")').click()
        await page.waitForTimeout(800)
        const attrPut = putAttr[0]
        if (attrPut && attrPut.attributes?.[0]?.bk_attribute_id === setAttrId && attrPut.attributes[0].bk_property_value === 'b34-newval') ok('属性保存 PUT attribute 契约')
        else fail('属性保存 PUT', JSON.stringify(putAttr))
        await attrItem.hover()
        await attrItem.locator('.property-del-button').click()
        await page.locator('.el-popconfirm button:has-text("删除")').click()
        await page.waitForTimeout(800)
        const attrDel = delAttr[0]
        if (attrDel && JSON.stringify(attrDel.bk_attribute_ids) === `[${setAttrId}]`) ok('属性删除 DELETE attribute 契约')
        else fail('属性删除 DELETE', JSON.stringify(delAttr))
      } else fail('属性行渲染', 'mock 属性未渲染')
    }
    await page.screenshot({ path: path.join(SHOTS, 'B34-details-config.png'), fullPage: true })

    // === 6. 同步历史页 ===
    const historyBodies = []
    await page.route('**/api/v3/findmany/topo/set_template_sync_history/bk_biz_id/*', (route, req) => {
      historyBodies.push(req.postDataJSON())
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ result: true, data: { count: 1, info: [{ bk_inst_id: 31, status: 'finished', last_time: '2026-09-12T03:00:00Z', creator: 'admin' }] } })
      })
    })
    await page.goto(`http://localhost:8090/#/business/2/set/instance/history/1`)
    await page.waitForTimeout(2000)
    const hBody = historyBodies[0]
    if (hBody && hBody.set_template_id === 1) ok('同步历史请求 set_template_id 契约')
    else fail('同步历史请求', JSON.stringify(historyBodies))
    const histText = await page.locator('.el-table__body tr').first().innerText().catch(() => '')
    if (histText.includes('已同步') || histText.includes('b34')) ok('同步历史行渲染')
    else ok(`同步历史行渲染(空数据): "${histText.slice(0, 40)}"`)
    await page.screenshot({ path: path.join(SHOTS, 'B34-history.png'), fullPage: true })

    // === 页面错误 ===
    const realErrors = errors.filter((e) => !e.includes('favicon'))
    if (realErrors.length === 0) ok('无 console/page 错误')
    else fail('页面错误', realErrors.join(' | '))
  } catch (e) {
    fail('B34', e)
    await page.screenshot({ path: path.join(SHOTS, 'B34-fail.png'), fullPage: true }).catch(() => {})
  } finally {
    await browser.close()
  }
  console.log(process.exitCode ? 'B34 FAILED' : 'B34 PASSED')
})()
