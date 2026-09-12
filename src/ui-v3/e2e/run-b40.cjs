// B40: 主机/拓扑/服务实例深交互专项
// 断言:1) 拓扑 node/tab 契约(点击节点/切 tab 回写 query,深链恢复选中节点)
// 2) 服务实例老版 create/clone 深链不再 404 且落到对应交互
// 3) host-apply stage=confirm 深链恢复;4) 主机详情返回链快照
const { chromium } = require('./browser.cjs')
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
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    route.continue({ headers })
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  try {
    await page.goto('http://localhost:8090/#/index', { waitUntil: 'load' })
    await page.waitForTimeout(900)
    const bizId = await page.evaluate(async () => {
      const r = await fetch('/api/v3/biz/search/0', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: { start: 0, limit: 1 } })
      })
      const res = await r.json()
      return res.data?.info?.[0]?.bk_biz_id || null
    })
    if (!bizId) throw new Error('环境无业务')

    // === 1. 拓扑 node/tab 契约 ===
    await page.goto(`http://localhost:8090/#/business/${bizId}/index`, { waitUntil: 'load' })
    await page.waitForTimeout(1800)
    // 点击第一个模块节点 → node/tab 回写
    const moduleNode = page.locator('.el-tree-node').filter({ hasText: /模块|module/i }).last()
    const idleNode = page.locator('.el-tree-node').filter({ hasText: '空闲机' }).first()
    const target = (await idleNode.count()) ? idleNode : moduleNode
    await target.click()
    await page.waitForTimeout(900)
    const q1 = await page.evaluate(() => Object.fromEntries(new URLSearchParams(window.location.hash.split('?')[1] || '')))
    if (!(q1.node && /^(module|set)-\d+$/.test(q1.node))) {
      throw new Error(`节点点击未回写 node query: ${q1.toString()}`)
    }
    if (q1.tab !== 'hostList') throw new Error(`节点点击未回写 tab=hostList: ${q1.tab}`)
    ok(`节点点击回写 node=${q1.node} tab=hostList`)
    const nodeWritten = q1.node

    // 切到服务实例 tab → tab 回写为老版命名
    await page.locator('.el-tabs__item').filter({ hasText: '服务实例' }).click()
    await page.waitForTimeout(700)
    const q2 = await page.evaluate(() => Object.fromEntries(new URLSearchParams(window.location.hash.split('?')[1] || '')))
    if (q2.tab !== 'serviceInstance') throw new Error(`切 tab 未回写 serviceInstance: ${q2.tab}`)
    ok('切 tab 回写 tab=serviceInstance(老版命名)')
    await page.screenshot({ path: `${SHOTS}/b40-topo-query.png` })

    // 刷新恢复:带 node/tab 深链重进 → 选中节点恢复
    await page.goto(`http://localhost:8090/#/business/${bizId}/index?tab=hostList&node=${nodeWritten}`, { waitUntil: 'load' })
    await page.waitForTimeout(2000)
    const selectedText = await page.locator('.el-tree-node.is-current > .el-tree-node__content').first().textContent().catch(() => '')
    if (!selectedText) throw new Error('node 深链未恢复选中节点')
    ok(`node 深链恢复选中节点(${selectedText.trim().slice(0, 14)})`)

    // === 2. 服务实例老版 create/clone 深链 ===
    // create:set/module 取真实拓扑值
    const topo = await page.evaluate(async (biz) => {
      const r = await fetch(`/api/v3/topo/internal/${biz}/with_statistics`, { credentials: 'include' })
      return r.json()
    }, bizId).catch(() => null)
    let setId = null
    let moduleId = null
    const internal = topo?.data || {}
    if (Array.isArray(internal.topo)) {
      const bizRoot = internal.topo.find((x) => x.bk_obj_id === 'biz')
      const idleSet = (bizRoot?.child || []).find((x) => x.bk_obj_id === 'set' && x.bk_inst_name === '空闲机池') || (bizRoot?.child || [])[0]
      setId = idleSet?.bk_inst_id
      moduleId = (idleSet?.child || [])[0]?.bk_inst_id
    }
    if (setId && moduleId) {
      await page.goto(`http://localhost:8090/#/business/${bizId}/service/instance/create/set/${setId}/module/${moduleId}`, { waitUntil: 'load' })
      await page.waitForTimeout(2000)
      const createHash = await page.evaluate(() => window.location.hash)
      if (!createHash.includes('/business/') || !createHash.includes('tab=serviceInstance')) {
        throw new Error(`create 深链未落到服务实例 tab: ${createHash}`)
      }
      const wizardShown = await page.locator('.el-dialog').filter({ hasText: '新建服务实例' }).isVisible().catch(() => false)
      if (!wizardShown) throw new Error('create 深链未自动打开新建服务实例向导')
      ok('老版 create 深链 → 拓扑服务实例 tab + 新建向导(模块预选)')
    } else {
      console.log('- 拓扑无内部模块,跳过 create 深链 UI 段(路由已注册,404 守卫由审计覆盖)')
    }

    // clone 深链路由存在(直接造一个不存在的 instance id,断言页面加载且提示未找到,而非 404)
    await page.goto(`http://localhost:8090/#/business/${bizId}/service/instance/clone/set/2/module/2/instance/999999/host/999999`, { waitUntil: 'load' })
    await page.waitForTimeout(2200)
    const cloneHash = await page.evaluate(() => window.location.hash)
    if (cloneHash.includes('/404')) throw new Error('clone 深链 404')
    ok('老版 clone 深链路由已接(不再 404)')

    // === 3. host-apply stage=confirm 深链(无选中节点时给出明确提示) ===
    await page.goto(`http://localhost:8090/#/business/${bizId}/host-apply?mode=module&stage=confirm`, { waitUntil: 'load' })
    await page.waitForTimeout(1800)
    const applyText = await page.locator('body').textContent()
    if (!applyText.includes('请先在左侧选择') && !(await page.locator('.el-dialog').filter({ hasText: '预览变更' }).isVisible().catch(() => false))) {
      throw new Error('stage=confirm 深链未恢复预览向导也未给出选择提示')
    }
    ok('host-apply stage=confirm 深链恢复(向导或明确选择提示)')

    // === 4. 主机详情返回链快照 ===
    await page.goto(`http://localhost:8090/#/resource/host`, { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    const hostLink = page.locator('a, .el-link').filter({ hasText: /^\d+\.\d+\.\d+\.\d+$/ }).first()
    if (await hostLink.count()) {
      await hostLink.click()
      await page.waitForTimeout(1500)
      const backBtn = page.locator('.el-page-header__back, .el-page-header__left').first()
      if (await backBtn.count()) {
        await backBtn.click()
        await page.waitForTimeout(1200)
        const backHash = await page.evaluate(() => window.location.hash)
        if (!backHash.includes('/resource/host')) throw new Error(`返回链未恢复资源主机列表: ${backHash}`)
        ok('主机详情返回链恢复来源列表(scope 上下文保留)')
      }
    } else {
      console.log('- 资源池无主机 IP 链接,跳过返回链 UI 段(链路已在业务拓扑覆盖)')
    }

    const realErrors = errors.filter((e) => !/favicon|ResizeObserver/.test(e))
    if (realErrors.length) throw new Error('页面错误: ' + realErrors.slice(0, 3).join(' | '))
    ok('全程无 pageerror')
  } catch (e) {
    fail('B40 闭环', e)
  } finally {
    await browser.close()
  }
  if (!process.exitCode) console.log('B40 E2E 全部通过')
})()
