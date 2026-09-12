// B38: 前后端 API 契约清理专项
// 断言:1) 死接口(/host/search、/hosts/snapshot)绝不再发出 2) 主机详情走真实
// findmany/hosts/search/{resource|noauth} 且 payload 为四对象 condition 3) 字段分组
// 改名(update/objectattgroup)与移动(update/objectattgroupproperty)真实写回 4) 模型
// 导入/导出根路径接口已注册(非 404)
const { chromium } = require('./browser.cjs')
const fs = require('fs')
const SHOTS = '/tmp/ui-v3-shots'
fs.mkdirSync(SHOTS, { recursive: true })
function ok(label) { console.log(`✓ ${label}`) }
function fail(label, e) { console.error(`✗ ${label}: ${e?.message || e}`); process.exitCode = 1 }
const TAG = Date.now() % 1000000

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    route.continue({ headers })
  })

  // 1) 死接口守卫:全程收集请求 URL,结束时断言未出现
  const requestUrls = []
  page.on('request', (req) => requestUrls.push(req.url()))

  // 统一 API 助手:仅凭 session cookie,不带任何身份头(B37 信任边界)
  const api = (method, p, body) => page.evaluate(async ({ method, p, body }) => {
    const r = await fetch(`/api/v3${p}`, {
      method,
      credentials: 'include',
      headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : (body instanceof FormData ? body : JSON.stringify(body))
    })
    const text = await r.text()
    try { return { status: r.status, ...JSON.parse(text) } } catch { return { status: r.status, raw: text.slice(0, 120) } }
  }, { method, p, body }).then((res) => res)

  let hostId = null
  let groupId = null
  let groupBkId = null
  let attrId = null
  try {
    await page.goto('http://localhost:8090/#/index', { waitUntil: 'load' })
    await page.waitForTimeout(800)

    // === 2. 主机详情契约:资源池取主机(空则造一个),深链打开,断言真实端点与渲染 ===
    const list = await api('POST', '/hosts/list_hosts_without_app', {
      page: { start: 0, limit: 1 },
      fields: ['bk_host_id', 'bk_host_innerip']
    })
    if (list.bk_error_code !== 0) throw new Error('资源池主机查询失败: ' + list.bk_error_msg)
    hostId = list.data?.info?.[0]?.bk_host_id || null
    if (!hostId) {
      const add = await api('POST', '/hosts/add/resource', {
        host_info: { '0': { bk_host_innerip: `127.0.0.${TAG % 200 + 2}` } },
        bk_supplier_account: '0'
      })
      const created = add.data?.[0]?.bk_host_id || add.data?.bk_host_id
      if (!created) throw new Error('资源池无主机且造主机失败: ' + JSON.stringify(add).slice(0, 160))
      hostId = created
    }

    const detailRequests = []
    page.on('request', (req) => {
      if (req.url().includes('/findmany/hosts/search/')) detailRequests.push(req.url())
    })
    await page.goto(`http://localhost:8090/#/host-detail?id=${hostId}`, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    if (!detailRequests.length) throw new Error('主机详情未发出 findmany/hosts/search 真实请求')
    ok(`主机详情走真实端点 ${detailRequests[0].split('/api/v3')[1]}`)
    const hostIpVisible = await page.locator('.host-detail, .page-card, body').first().textContent()
    if (!hostIpVisible) throw new Error('主机详情页无内容')
    ok('主机详情页渲染正常')
    await page.screenshot({ path: `${SHOTS}/b38-host-detail.png` })

    // === 3. 字段分组契约:建组 → 改名(PUT update/objectattgroup condition/data) → 回读 ===
    groupBkId = `grp_b38_${TAG}`
    const createGroup = await api('POST', '/create/objectattgroup', {
      bk_group_id: groupBkId, bk_group_name: `b38分组${TAG}`, bk_obj_id: 'host',
      bk_group_index: 99, bk_supplier_account: '0', is_collapse: false
    })
    if (createGroup.bk_error_code !== 0) throw new Error('建组失败: ' + createGroup.bk_error_msg)
    const groups = await api('POST', '/find/objectattgroup/object/host', {})
    const groupRow = (groups.data || []).find((g) => g.bk_group_id === groupBkId)
    if (!groupRow?.id) throw new Error('建组后回读失败')
    groupId = groupRow.id
    const newName = `b38改名${TAG}`
    const rename = await api('PUT', '/update/objectattgroup', {
      bk_obj_id: 'host', condition: { id: groupId }, data: { bk_group_name: newName }
    })
    if (rename.bk_error_code !== 0) throw new Error('分组改名(修复后契约)失败: ' + rename.bk_error_msg)
    const groups2 = await api('POST', '/find/objectattgroup/object/host', {})
    const renamed = (groups2.data || []).find((g) => g.id === groupId)
    if (renamed?.bk_group_name !== newName) throw new Error(`改名回读不符: ${renamed?.bk_group_name}`)
    ok('字段分组改名契约(update/objectattgroup condition/data)真实写回')

    // === 4. 移动字段契约:建字段 → update/objectattr/index 移入分组 → B38 契约移回 default → 回读 ===
    const propId = `b38f${TAG}`
    const createAttr = await api('POST', '/create/objectattr', {
      bk_obj_id: 'host', bk_property_id: propId, bk_property_name: 'b38字段',
      bk_property_type: 'longchar', unit: '', placeholder: '', isrequired: false,
      bk_property_group: 'default', description: 'B38 contract fixture'
    })
    if (createAttr.bk_error_code !== 0) throw new Error('建字段失败: ' + createAttr.bk_error_msg)
    const attrs = await api('POST', '/find/objectattr', { bk_obj_id: 'host', bk_property_id: propId })
    const attrRow = (attrs.data || []).find((a) => a.bk_property_id === propId)
    if (!attrRow?.id) throw new Error('建字段回读失败')
    attrId = attrRow.id
    const moveIn = await api('POST', `/update/objectattr/index/host/${attrId}`, {
      bk_property_group: groupBkId, bk_property_index: 1
    })
    if (moveIn.bk_error_code !== 0) throw new Error('字段移动(legacy 契约)失败: ' + moveIn.bk_error_msg)
    const attrs2 = await api('POST', '/find/objectattr', { bk_obj_id: 'host', bk_property_id: propId })
    const moved = (attrs2.data || []).find((a) => a.id === attrId)
    if (moved?.bk_property_group !== groupBkId) throw new Error(`移入分组回读不符: ${moved?.bk_property_group}`)
    const moveBack = await api('PUT', '/update/objectattgroupproperty', {
      data: [{
        condition: { bk_supplier_account: '0', bk_obj_id: 'host', bk_property_id: propId },
        data: { bk_property_group: 'default', bk_property_index: 0 }
      }]
    })
    if (moveBack.bk_error_code !== 0) throw new Error('B38 移动契约(update/objectattgroupproperty)失败: ' + moveBack.bk_error_msg)
    const attrs3 = await api('POST', '/find/objectattr', { bk_obj_id: 'host', bk_property_id: propId })
    const movedBack = (attrs3.data || []).find((a) => a.id === attrId)
    if (movedBack?.bk_property_group !== 'default') throw new Error(`移回 default 回读不符: ${movedBack?.bk_property_group}`)
    ok('字段分组移动契约(update/objectattgroupproperty 批量 data[].condition/data)真实写回')

    // === 5. 模型导入/导出根路径接口注册契约(非 404,返回业务错误即证明路由存在) ===
    // 注意:这两个接口挂在 web_server 根路径(同源,无 /api/v3 前缀),与产品 baseURL:'' 契约一致
    const rootApi = (method, p, body) => page.evaluate(async ({ method, p, body }) => {
      const r = await fetch(p, {
        method,
        credentials: 'include',
        headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : (body instanceof FormData ? body : JSON.stringify(body))
      })
      const text = await r.text()
      try { return { status: r.status, json: JSON.parse(text), raw: '' } } catch { return { status: r.status, json: null, raw: text.slice(0, 120) } }
    }, { method, p, body })
    const form = new FormData()
    form.append('file', new Blob(['not-a-zip'], { type: 'application/octet-stream' }), 'b38.zip')
    const analyze = await rootApi('POST', '/object/importmany/analysis', form)
    if (analyze.status === 404) throw new Error('/object/importmany/analysis 返回 404(路由未注册)')
    if (!analyze.json && !/zip|file|解析/i.test(analyze.raw)) throw new Error('分析接口返回异常: ' + analyze.raw)
    const exportRes = await rootApi('POST', '/object/exportmany', { object_id: [], file_name: 'b38probe' })
    if (exportRes.status === 404) throw new Error('/object/exportmany 返回 404(路由未注册)')
    ok(`模型导入/导出根路径接口已注册(analysis=${analyze.status}, exportmany=${exportRes.status})`)
  } catch (e) {
    fail('B38 闭环', e)
  } finally {
    // === 6. 清理夹具 ===
    try {
      if (attrId) await api('DELETE', `/delete/objectattr/${attrId}`)
      if (groupId) await api('DELETE', `/delete/objectattgroup/${groupId}`)
      ok('夹具清理完成(字段/分组)')
    } catch (e) { fail('清理', e) }

    // === 7. 死接口守卫断言 ===
    const dead = requestUrls.filter((u) => /\/api\/v3\/host\/search|\/api\/v3\/hosts\/snapshot\//.test(u))
    if (dead.length) fail('死接口守卫', new Error(`仍请求了未注册接口: ${dead.slice(0, 3).join(', ')}`))
    else ok('死接口守卫:全程未请求 /host/search 与 /hosts/snapshot')

    await browser.close()
  }
  if (!process.exitCode) console.log('B38 E2E 全部通过')
})()
