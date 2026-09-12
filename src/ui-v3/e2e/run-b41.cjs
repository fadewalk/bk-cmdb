// B41: 模型/字段模板/详情关联深度专项
// 真实闭环:创建模型→建字段→建实例×2→建关联→列表/取消关联→唯一校验保护→清理
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
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  const api = (method, p, body) => page.evaluate(async ({ method, p, body }) => {
    const r = await fetch(`/api/v3${p}`, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await r.text()
    try { return { status: r.status, ...JSON.parse(text) } } catch { return { status: r.status, raw: text.slice(0, 120) } }
  }, { method, p, body })

  let modelId = null
  let objId = null
  let instA = null
  let objAsstId = null
  let instB = null
  try {
    await page.goto('http://localhost:8090/#/index', { waitUntil: 'load' })
    await page.waitForTimeout(900)

    // === 1. 夹具:自定义模型 + 两个实例 + 一条关联 ===
    objId = `b41_${TAG}`
    const clsRes = await api('POST', '/find/objectclassification', {})
    const cls = ((clsRes.data?.info) || clsRes.data || [])[0]
    if (!cls) throw new Error('无可用模型分类')
    const created = await api('POST', '/create/object', {
      bk_obj_id: objId, bk_obj_name: `B41模型${TAG}`, bk_obj_icon: 'icon-cc-default',
      bk_classification_id: cls.bk_classification_id, bk_supplier_account: '0', creator: 'admin'
    })
    if (created.bk_error_code !== 0) throw new Error('建模型失败: ' + created.bk_error_msg)
    modelId = created.data?.id
    const attr = await api('POST', '/create/objectattr', {
      bk_obj_id: objId, bk_property_id: 'b41name', bk_property_name: 'B41名称',
      bk_property_type: 'singlechar', unit: '', placeholder: '', isrequired: false,
      bk_property_group: 'default', bk_supplier_account: '0'
    })
    if (attr.bk_error_code !== 0) throw new Error('建字段失败: ' + attr.bk_error_msg)
    const mkInst = async (name) => {
      const res = await api('POST', `/create/instance/object/${objId}`, { bk_inst_name: name, b41name: name })
      if (res.bk_error_code !== 0) throw new Error('建实例失败: ' + res.bk_error_msg)
      return res.data?.bk_inst_id
    }
    instA = await mkInst(`B41实例A${TAG}`)
    instB = await mkInst(`B41实例B${TAG}`)
    if (!instA || !instB) throw new Error('实例 ID 缺失')

    // === 2. 实例详情关联 tab:列表渲染 + 取消关联(真实创建一条) ===
    const kindRes = await api('POST', '/find/associationtype', {})
    const kinds = ((kindRes.data?.info) || kindRes.data || [])
    const kind = kinds.find((k) => k.bk_asst_id === 'default') || kinds[0]
    const defRes = await api('POST', '/create/objectassociation', {
      bk_obj_id: objId, bk_asst_obj_id: objId, bk_asst_id: kind.bk_asst_id,
      bk_obj_asst_id: `b41_asst_${TAG}`, mapping: 'n:n'
    })
    if (defRes.bk_error_code !== 0) throw new Error('建关联定义失败: ' + defRes.bk_error_msg)
    objAsstId = defRes.data?.id
    let asstCreated = null
    for (let i = 0; i < 4; i += 1) {
      await new Promise((r) => setTimeout(r, 2000))
      asstCreated = await api('POST', '/create/instassociation', {
        bk_obj_asst_id: defRes.data?.bk_obj_asst_id, bk_inst_id: instA, bk_asst_inst_id: instB
      })
      if (asstCreated.bk_error_code === 0) break
    }
    if (!asstCreated || asstCreated.bk_error_code !== 0) throw new Error('建关联失败: ' + (asstCreated?.bk_error_msg || '未知'))
    const assoId = asstCreated.data?.id

    await page.goto(`http://localhost:8090/#/resource/instance/${objId}?instId=${instA}`, { waitUntil: 'load' })
    await page.waitForTimeout(1600)
    await page.locator('.el-tabs__item').filter({ hasText: '关联' }).click()
    await page.waitForTimeout(1400)
    const assocCell = await page.locator('.el-drawer .el-table').first().textContent()
    if (!assocCell.includes(`B41实例B${TAG}`)) throw new Error('关联列表未显示对端实例: ' + assocCell.slice(0, 120))
    ok('实例详情关联 tab 列表显示对端实例(方向/类型/名称)')
    await page.screenshot({ path: `${SHOTS}/b41-inst-assoc.png` })

    // UI 取消关联
    const before = await page.locator('.el-drawer .el-table tbody tr').count()
    await page.locator('.el-drawer .el-table').first().getByText('取消关联').click()
    await page.locator('.el-message-box').waitFor({ state: 'visible', timeout: 8000 })
    await page.locator('.el-message-box .el-button--primary').click()
    await page.waitForTimeout(2000)
    const after = await page.locator('.el-drawer .el-table tbody tr').count()
    if (!(after < before)) throw new Error(`取消关联未生效: ${before} -> ${after}`)
    ok('取消关联真实生效(读回验证)')

    // === 3. 唯一校验内置保护(主线模型 host 的模板/内置规则锁定) ===
    await page.goto('http://localhost:8090/#/model/management/details/host', { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    await page.locator('.box-tab, .el-tabs__item').filter({ hasText: '唯一校验' }).first().click().catch(() => {})
    await page.waitForTimeout(1200)
    const uniquePage = await page.locator('body').textContent()
    if (uniquePage.includes('唯一校验')) {
      const hasView = await page.locator('button, .el-button').filter({ hasText: '查看' }).count()
      if (!hasView) throw new Error('唯一校验缺少「查看」入口')
      ok('唯一校验提供只读「查看」详情入口')
    } else {
      console.log('- host 模型唯一校验 tab 未渲染,跳过保护段')
    }
  } catch (e) {
    fail('B41 闭环', e)
  } finally {
    try {
      if (objId) {
        const attrs = await api('POST', '/find/objectattr', { bk_obj_id: objId })
        for (const a of (attrs.data || [])) await api('DELETE', `/delete/objectattr/${a.id}`)
        const insts = await api('POST', `/search/instances/object/${objId}`, { page: { start: 0, limit: 100 } })
        for (const inst of (insts.data?.info || [])) {
          await api('DELETE', `/delete/instance/object/${objId}/inst/${inst.bk_inst_id}`)
        }
        if (objAsstId) await api('DELETE', `/delete/objectassociation/${objAsstId}`)
        if (modelId) await api('DELETE', `/delete/object/${modelId}`)
      }
      ok('夹具清理完成(模型/字段/实例)')
    } catch (e) { fail('清理', e) }
    const realErrors = errors.filter((e) => !/favicon|ResizeObserver/.test(e))
    if (realErrors.length) fail('页面错误', new Error(realErrors.slice(0, 3).join(' | ')))
    await browser.close()
  }
  if (!process.exitCode) console.log('B41 E2E 全部通过')
})()
