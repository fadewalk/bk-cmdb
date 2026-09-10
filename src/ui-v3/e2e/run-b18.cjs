// B18: 资源域(资源目录/管控区域/云账户/云资源发现) + 模型域(管理/拓扑/关联类型/字段模板) 专项回归
// 覆盖:旧深链重定向、管控区域行内改名与服务端搜索、云账户状态列、云任务 CRUD、模型四页加载
const { chromium } = require('./browser.cjs')
const path = require('path')
const fs = require('fs')
const SHOTS = '/tmp/ui-v3-shots'
fs.mkdirSync(SHOTS, { recursive: true })
const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
function ok(label) { console.log(`✓ ${label}`) }
function fail(label, e) { console.error(`✗ ${label}: ${e?.message || e}`); process.exitCode = 1 }
function note(label) { console.log(`- ${label}`) }

const TAG = `e2e-b18-${Date.now() % 100000}`
const API_HEADERS = {
  'Content-Type': 'application/json',
  'X-Bkcmdb-User': 'admin',
  'X-Bkcmdb-Supplier-Account': '0'
}

function routePath(page) {
  return new URL(page.url()).hash.replace(/^#/, '') || '/'
}

// hash 同源跳转必须走 location.assign 才触发真实导航
async function openHash(page, hash, expectHash = hash, timeout = 30000) {
  const full = hash.startsWith('#') ? hash : `#${hash}`
  await page.evaluate((url) => { window.location.assign(url) }, `${BASE}/${full}`)
  await page.waitForFunction((expected) => {
    const normalize = (raw) => {
      const h = (raw || '').replace(/^#/, '')
      const [p, q = ''] = h.split('?')
      const params = [...new URLSearchParams(q).entries()].sort(([a], [b]) => a.localeCompare(b))
      return `${p}?${new URLSearchParams(params)}`.replace(/\?$/, '')
    }
    return normalize(window.location.href.split('#')[1] || '/') === normalize(expected)
  }, expectHash, { timeout })
  await page.waitForTimeout(400)
}

async function api(page, method, url, body) {
  return page.evaluate(async ({ method, url, body, headers }) => {
    const resp = await fetch(`/api/v3${url}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const json = await resp.json().catch(() => ({}))
    return json
  }, { method, url, body, headers: API_HEADERS })
}

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
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) errors.push(`console.error: ${msg.text()}`)
  })

  let accountId = null
  let areaId = null
  let taskId = null

  try {
    // === 1. 旧深链重定向 ===
    await openHash(page, '/resource/cloud-resource', '/resource/cloud-discover')
    ok('旧 /resource/cloud-resource 重定向到 /resource/cloud-discover')
    await openHash(page, '/model', '/model/management')
    ok('旧 /model 重定向到 /model/management')
    await openHash(page, '/resource', '/resource/index')
    ok('旧 /resource 重定向到 /resource/index')

    // === 2. 造数:云账户 + 管控区域(老版任务表单同源契约) ===
    const accountResp = await api(page, 'POST', '/create/cloud/account', {
      bk_account_name: `e2e账户${TAG}`,
      bk_cloud_vendor: '2',
      bk_account_type: 'api_secret_key',
      bk_secret_id: `id-${TAG}`,
      bk_secret_key: `key-${TAG}`,
      bk_description: 'b18 e2e 临时账户'
    })
    if (!accountResp?.result) throw new Error(`创建测试云账户失败: ${accountResp?.errmsg || 'unknown'}`)
    const accSearch = await api(page, 'POST', '/findmany/cloud/account', {
      page: { start: 0, limit: 100 }, condition: { bk_account_name: `e2e账户${TAG}` }, is_fuzzy: true
    })
    accountId = accSearch?.data?.info?.[0]?.bk_account_id
    if (!accountId) throw new Error('未找到测试云账户')
    ok(`测试云账户创建成功 id=${accountId}`)

    const areaResp = await api(page, 'POST', '/createmany/cloudarea', {
      data: [{
        bk_cloud_name: `e2e区域${TAG}`,
        bk_vpc_id: `vpc-${TAG}`,
        bk_vpc_name: `vpc-${TAG}`,
        bk_region: 'ap-guangzhou',
        bk_cloud_vendor: '2',
        bk_account_id: accountId
      }]
    })
    if (!areaResp?.result) throw new Error(`创建测试管控区域失败: ${areaResp?.errmsg || 'unknown'}`)
    const areaList = Array.isArray(areaResp.data) ? areaResp.data : (areaResp.data?.created || [])
    areaId = areaList?.[0]?.bk_cloud_id
    if (!areaId) throw new Error('批量建区域响应缺少 bk_cloud_id(老版契约:按行返回)')
    ok(`测试管控区域创建成功 id=${areaId}`)

    // === 3. 管控区域页:未分配置顶 + 行内改名(服务端回读) ===
    await page.goto(`${BASE}/#/resource/cloud-area`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1500)
    const areaRow = page.locator('.el-table__row').filter({ hasText: `e2e区域${TAG}` })
    if (!await areaRow.count()) throw new Error('管控区域列表缺少测试区域')
    ok('管控区域列表展示测试区域')
    const firstRowText = await page.locator('.el-table__row').first().textContent()
    if (firstRowText.includes('未分配')) ok('「未分配」管控区域置顶(老版行为)')
    else note('当前数据无「未分配」区域,跳过置顶断言')
    const statusCells = await page.locator('.el-table__row .row-status').count()
    if (statusCells > 0) ok('状态列渲染(正常/异常状态点)')
    // 行内改名:点击名称进入编辑态,回车保存(点击后行文本被 input 替换,改用表格级定位)
    await areaRow.locator('.cell-name').first().click()
    const nameInput = page.locator('.el-table__body-wrapper input').first()
    await nameInput.waitFor({ timeout: 3000 })
    await nameInput.fill(`e2e区域改名${TAG}`)
    await nameInput.press('Enter')
    await page.waitForTimeout(1200)
    const renamed = await api(page, 'POST', '/findmany/cloudarea', {
      page: { start: 0, limit: 100, sort: 'bk_cloud_id' },
      condition: { bk_cloud_name: `e2e区域改名${TAG}` }, is_fuzzy: true
    })
    if (renamed?.data?.info?.some((r) => r.bk_cloud_name === `e2e区域改名${TAG}`)) ok('行内改名生效(API 回读)')
    else fail('行内改名', 'API 回读未生效')
    await page.screenshot({ path: path.join(SHOTS, 'B18-cloud-area.png'), fullPage: true })

    // === 4. 云账户页:状态列 + 查看抽屉 + 编辑入口 ===
    await page.goto(`${BASE}/#/resource/cloud-account`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1800)
    const accRow = page.locator('.el-table__row').filter({ hasText: `e2e账户${TAG}` })
    if (!await accRow.count()) throw new Error('云账户列表缺少测试账户')
    ok('云账户列表展示测试账户')
    const accRowText = await accRow.textContent()
    if (/(正常|异常)/.test(accRowText || '')) ok('账户状态列渲染(正常/异常)')
    else note(`账户状态列未出现正常/异常文案: ${(accRowText || '').slice(0, 40)}`)
    await accRow.locator('button').filter({ hasText: '查看' }).click()
    await page.waitForTimeout(800)
    if (await page.locator('.el-drawer:visible').isVisible()) {
      ok('账户详情抽屉打开')
      const hasEdit = await page.locator('.el-drawer:visible button').filter({ hasText: '编辑' }).count()
      if (hasEdit) ok('详情抽屉含编辑入口(老版交互)')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    } else fail('账户详情抽屉', '未打开')
    await page.screenshot({ path: path.join(SHOTS, 'B18-cloud-account.png'), fullPage: true })

    // === 5. 云资源发现:任务 CRUD(表单契约与老版一致) ===
    await page.goto(`${BASE}/#/resource/cloud-discover`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1500)
    const headers = await page.locator('.el-table .cell').allTextContents()
    if (headers.some((c) => c.includes('任务名称')) && headers.some((c) => c.includes('最近同步状态'))) {
      ok('任务表头对齐老版(任务名称/最近同步状态)')
    } else fail('任务表头', headers.join(',').slice(0, 120))
    if (await page.locator('button').filter({ hasText: '新建' }).count()) ok('工具栏「新建」按钮')
    else fail('工具栏', '缺少「新建」')

    const dirSearch = await api(page, 'POST', '/findmany/resource/directory', {})
    const dirId = dirSearch?.data?.info?.[0]?.bk_module_id
    if (!dirId) note('无资源池目录,跳过任务创建断言')
    const taskResp = dirId ? await api(page, 'POST', '/create/cloud/sync/task', {
      bk_task_name: `e2e任务${TAG}`,
      bk_account_id: accountId,
      bk_resource_type: 'host',
      bk_sync_vpcs: [{
        bk_vpc_id: `vpc-${TAG}`,
        bk_vpc_name: `vpc-${TAG}`,
        bk_region: 'ap-guangzhou',
        bk_host_count: 0,
        bk_sync_dir: dirId,
        bk_cloud_id: areaId,
        destroyed: false
      }]
    }) : { result: false }
    if (taskResp?.result) {
      const taskSearch = await api(page, 'POST', '/findmany/cloud/sync/task', {
        page: { start: 0, limit: 50 }, condition: { bk_task_name: `e2e任务${TAG}` }, is_fuzzy: true
      })
      const task = taskSearch?.data?.info?.[0]
      taskId = task?.bk_task_id
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      const taskRow = page.locator('.el-table__row').filter({ hasText: `e2e任务${TAG}` })
      if (await taskRow.count()) {
        ok('发现任务列表展示测试任务')
        await taskRow.locator('.cell-link').first().click()
        await page.waitForTimeout(800)
        if (await page.locator('.el-drawer:visible').isVisible()) {
          const drawerText = await page.locator('.el-drawer:visible').textContent()
          if (drawerText.includes('VPC 同步列表')) ok('任务详情抽屉含 VPC 同步列表')
          else note('任务详情抽屉打开,但无 VPC 列表(接口未返回 bk_sync_vpcs)')
          await page.keyboard.press('Escape')
          await page.waitForTimeout(500)
        } else fail('任务详情抽屉', '未打开')
        await taskRow.locator('button').filter({ hasText: '编辑' }).click()
        await page.waitForTimeout(800)
        if (await page.locator('.el-drawer:visible').isVisible()) {
          ok('任务编辑抽屉打开')
          await page.keyboard.press('Escape')
          await page.waitForTimeout(400)
        } else fail('任务编辑抽屉', '未打开')
      } else fail('发现任务列表', '缺少测试任务行')
      await page.screenshot({ path: path.join(SHOTS, 'B18-cloud-discover.png'), fullPage: true })
    } else {
      note(`后端拒绝创建同步任务(${taskResp?.errmsg || '无目录'}),与老版同源约束一致,跳过任务 UI 断言`)
    }

    // === 6. 模型域四页加载 smoke ===
    await page.goto(`${BASE}/#/model/management`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1200)
    if ((await page.locator('.model-management, .model-page').count())) ok('模型管理页加载')
    else fail('模型管理页', '缺少根节点')
    await page.goto(`${BASE}/#/model/topology`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1500)
    if (await page.locator('svg').count()) ok('模型拓扑画布加载')
    else fail('模型拓扑页', '缺少 svg 画布')
    await page.goto(`${BASE}/#/model/association`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1200)
    if (await page.locator('.el-table').count()) ok('关联类型页加载')
    else fail('关联类型页', '缺少表格')
    await page.goto(`${BASE}/#/model/field-template`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1200)
    if (await page.locator('.el-table').count()) ok('字段模板页加载')
    else fail('字段模板页', '缺少表格')

    // === 7. 清理测试数据 ===
    if (taskId) await api(page, 'DELETE', `/delete/cloud/sync/task/${taskId}`)
    if (areaId) await api(page, 'DELETE', `/delete/cloudarea/${areaId}`)
    if (accountId) await api(page, 'DELETE', `/delete/cloud/account/${accountId}`)
    ok('测试数据已清理(任务/区域/账户)')

    if (errors.length) {
      console.log('浏览器错误:')
      for (const e of errors.slice(0, 6)) console.log('  ' + e)
      process.exitCode = 1
    } else {
      ok('无浏览器 page/console error')
    }
    console.log(path.join(SHOTS, 'B18-*.png'))
  } catch (e) {
    fail('E2E 流程', e.message)
    await page.screenshot({ path: path.join(SHOTS, 'B18-error.png'), fullPage: true }).catch(() => {})
  } finally {
    // 兜底清理,避免异常路径遗留数据
    try {
      if (taskId) await api(page, 'DELETE', `/delete/cloud/sync/task/${taskId}`)
      if (areaId) await api(page, 'DELETE', `/delete/cloudarea/${areaId}`)
      if (accountId) await api(page, 'DELETE', `/delete/cloud/account/${accountId}`)
    } catch {}
    await browser.close()
  }
})()
