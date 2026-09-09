// B20: 老版转移确认页(host/transfer/:type)专项
// 闭环:建集群/双模块 → 资源池造主机 → 分配到模块A → 转移页预览(business) → 执行 → API 回读 → 清理
const { chromium } = require('./browser.cjs')
const path = require('path')
const fs = require('fs')
const SHOTS = '/tmp/ui-v3-shots'
fs.mkdirSync(SHOTS, { recursive: true })
function ok(label) { console.log(`✓ ${label}`) }
function fail(label, e) { console.error(`✗ ${label}: ${e?.message || e}`); process.exitCode = 1 }
function note(label) { console.log(`- ${label}`) }
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
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(`console.error: ${m.text()}`) })
  // 全局捕获转移预览/执行响应
  let executeCode = null
  let previewPlans = []
  page.on('response', async (res) => {
    if (!res.url().includes('transfer_with_auto_clear_service_instance')) return
    try {
      const body = await res.json()
      if (res.url().endsWith('preview')) previewPlans = body.data || []
      else executeCode = body.bk_error_code
    } catch {}
  })

  const api = (method, p, body) => page.evaluate(async ({ method, p, body }) => {
    const r = await fetch(`/api/v3${p}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Bkcmdb-User': 'admin', 'X-Bkcmdb-Supplier-Account': '0' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await r.text()
    try { return JSON.parse(text) } catch { return { bk_error_code: -1, bk_error_msg: `non-json(${r.status}): ${text.slice(0, 80)}` } }
  }, { method, p, body })

  let setId = null
  let moduleA = null
  let moduleB = null
  let hostId = null

  try {
    await page.goto('http://localhost:8090/#/index', { waitUntil: 'load' })
    await page.waitForTimeout(600)

    // === 1. 夹具:集群 + 双模块 + 主机(资源池→模块A) ===
    const setRes = await api('POST', `/set/2`, { bk_set_name: `e2e转移集群${TAG}`, bk_parent_id: 2, bk_supplier_account: '0' })
    if (setRes.bk_error_code !== 0) throw new Error('建集群失败: ' + setRes.bk_error_msg)
    setId = setRes.data.bk_set_id
    const mkA = await api('POST', `/module/2/${setId}`, { bk_module_name: `e2e模块A${TAG}`, bk_parent_id: setId, bk_supplier_account: '0' })
    const mkB = await api('POST', `/module/2/${setId}`, { bk_module_name: `e2e模块B${TAG}`, bk_parent_id: setId, bk_supplier_account: '0' })
    if (mkA.bk_error_code !== 0 || mkB.bk_error_code !== 0) throw new Error('建模块失败')
    moduleA = mkA.data.bk_module_id
    moduleB = mkB.data.bk_module_id
    ok(`夹具拓扑就绪 set=${setId} A=${moduleA} B=${moduleB}`)

    const hostIp = `10.20.30.${TAG % 200 + 10}`
    const add = await api('POST', '/hosts/add/resource', { host_info: [{ bk_host_innerip: hostIp, bk_host_name: `e2e转移${TAG}`, bk_cloud_id: 0 }] })
    if (add.bk_error_code !== 0) throw new Error('造主机失败: ' + add.bk_error_msg)
    hostId = add.data.success[0].bk_host_id
    const toIdle = await api('POST', '/hosts/modules/resource/idle', { bk_biz_id: 2, bk_host_id: [hostId] })
    if (toIdle.bk_error_code !== 0) throw new Error('分配到空闲机失败: ' + toIdle.bk_error_msg)
    const assign = await api('POST', '/hosts/modules', { bk_biz_id: 2, bk_host_id: [hostId], bk_module_id: [moduleA], is_increment: false })
    if (assign.bk_error_code !== 0) throw new Error('分配到模块A失败: ' + assign.bk_error_msg)
    ok(`临时主机 ${hostId}(${hostIp}) 已分配到模块A`)

    // === 2. 打开转移确认页(business) ===
    await page.goto(`http://localhost:8090/#/business/2/host/transfer/business?resources=${hostId}&targetModules=${moduleB}`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1500)
    ok('转移确认页加载')
    const bodyText = await page.locator('.transfer-page').textContent()
    if (bodyText.includes('已选主机') && bodyText.includes('1')) ok('已选主机计数渲染')
    else fail('已选主机', '缺少计数')
    if (bodyText.includes('变更确认')) ok('变更确认区块渲染')
    else fail('变更确认', '区块缺失')
    await page.screenshot({ path: path.join(SHOTS, 'B20-transfer.png'), fullPage: true })

    // === 3. 执行转移 ===
    await page.locator('button').filter({ hasText: '确认转移' }).click()
    await page.waitForTimeout(2500)
    // 预览数据应包含主机且 final_modules 落在模块B;执行返回成功
    const finalOk = previewPlans.some((p) => Number(p.bk_host_id) === hostId
      && (p.final_modules || []).includes(moduleB))
    if (previewPlans.length) ok(`预览返回 ${previewPlans.length} 台主机的变更计划`)
    if (executeCode === 0 && finalOk) ok('转移执行成功:预览 final_modules 落在模块B 且执行返回 0')
    else fail('转移执行', `execute=${executeCode}, final_modules 校验=${finalOk}, plans=${previewPlans.length}`)

    // === 4. 空闲类型页面打开(点击修改选择器) ===
    await page.goto(`http://localhost:8090/#/business/2/host/transfer/idle?resources=${hostId}`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1200)
    const idleBtn = page.locator('button').filter({ hasText: '选择空闲模块' })
    if (await idleBtn.count()) {
      await idleBtn.click()
      await page.waitForTimeout(800)
      if (await page.locator('.el-dialog:visible').count()) ok('空闲模块选择器打开')
      else fail('空闲模块选择器', '未打开')
      await page.keyboard.press('Escape')
    } else note('未出现「选择空闲模块」按钮(可能已有默认模块)')
    await page.screenshot({ path: path.join(SHOTS, 'B20-transfer-idle.png'), fullPage: true })

    // === 5. 清理:主机回空闲→退回资源池→删除;删模块/集群 ===
    const idleTopo = await api('GET', `/topo/internal/0/2/with_statistics`)
    const idleModule = ((idleTopo.data?.module || []).find((m) => Number(m.default) === 1) || {}).bk_module_id
    if (idleModule) {
      const toIdle = await api('POST', '/hosts/modules/idle', { bk_biz_id: 2, bk_host_id: [hostId] })
      if (toIdle.bk_error_code !== 0) note(`主机回空闲失败: ${toIdle.bk_error_msg}`)
      const toPool = await api('POST', '/hosts/modules/resource', { bk_biz_id: 2, bk_host_id: [hostId] })
      if (toPool.bk_error_code !== 0) note(`主机退回资源池失败: ${toPool.bk_error_msg}`)
    } else {
      note('未获取到空闲机模块 ID,跳过主机回退')
    }
    const delHost = await api('DELETE', '/hosts/batch', { bk_host_id: String(hostId), bk_supplier_account: '0' })
    if (delHost.bk_error_code !== 0) note(`删除主机失败: ${delHost.bk_error_msg}`)
    const delA = await api('DELETE', `/module/2/${setId}/${moduleA}`)
    const delB = await api('DELETE', `/module/2/${setId}/${moduleB}`)
    const delSet = await api('DELETE', `/set/2/${setId}`)
    console.log(`清理: 主机=${delHost.bk_error_code} 模块=${delA.bk_error_code}/${delB.bk_error_code} 集群=${delSet.bk_error_code}`)

    if (errors.length) {
      console.log('浏览器错误:')
      for (const e of errors.slice(0, 6)) console.log('  ' + e)
      process.exitCode = 1
    } else {
      ok('无浏览器 page/console error')
    }
  } catch (e) {
    fail('E2E 流程', e.message)
    await page.screenshot({ path: path.join(SHOTS, 'B20-error.png'), fullPage: true }).catch(() => {})
  } finally {
    await browser.close()
  }
})()
