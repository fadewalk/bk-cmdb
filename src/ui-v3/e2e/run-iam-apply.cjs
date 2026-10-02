// 站内权限申请流契约(standalone-iam 模式):
// 0. 冷加载回归:mode 未探测时不得把开放模式误判为无权限(P 批次曾引入)
// 1. deny 资源 → permission 视图 → 去申请权限 → POST /iam/apply payload 契约
// 2. 管理页审批区块:列表渲染 + 通过 → /iam/apply/decision 决策契约
// legacy-iam skip_url 契约由 run-iam.cjs 覆盖,本 runner 不重复
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function installIamMocks(page, { verifyDecide }) {
  const state = { applyBody: null, decisionBodies: [] }
  await page.route('**/iam/status', (route) => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-cache' },
    body: JSON.stringify({ enabled: true, subject: 'bob' })
  }))
  await page.route('**/iam/verify', async (route) => {
    const body = route.request().postDataJSON() || {}
    const allowed = verifyDecide(body)
    return route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ subject: 'bob', allowed })
    })
  })
  await page.route('**/iam/apply', (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    state.applyBody = route.request().postDataJSON()
    return route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ id: 'r1001', status: 'pending' })
    })
  })
  await page.route('**/iam/apply/list', (route) => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-cache' },
    body: JSON.stringify({ applications: [
      { id: 'r1001', subject: 'bob', object: 'cloud', action: 'read', domain: '*', reason: '', status: 'pending', created_at: '2026-10-01T10:00:00Z', decided_at: '0001-01-01T00:00:00Z' }
    ] })
  }))
  await page.route('**/iam/apply/decision', (route) => {
    state.decisionBodies.push(route.request().postDataJSON())
    return route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-cache' },
      body: JSON.stringify({ application: { id: 'r1001', status: 'approved' } })
    })
  })
  await page.route('**/iam/me/permissions', (route) => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-cache' },
    body: JSON.stringify({ subject: 'bob', policies: [['admin', '*', '*', '*', 'allow']], groupings: [['admin', 'admin', '*']] })
  }))
  return state
}

async function freshLoad(page, hash) {
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'load' })
  await page.reload({ waitUntil: 'load' }).catch(() => {})
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  context.setDefaultTimeout(15000)
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })

  try {
    // === 0. 冷加载回归:standalone-iam 模式下 verify 放行的资源不得误入 permission 视图 ===
    await installIamMocks(page, { verifyDecide: () => true })
    await freshLoad(page, '#/resource/cloud-area')
    await page.locator('table').first().waitFor()
    assert(!(await page.getByText('无操作权限').count()), '冷加载深链误入 permission 视图(mode 未探测回归)')
    console.log('✓ 冷加载深链正常渲染(mode 先探测)')

    // === 1. deny 资源 → 站内申请 payload 契约 ===
    const state = await installIamMocks(page, { verifyDecide: (body) => !(body.object === 'instance' && body.action === 'read') })
    await freshLoad(page, '#/resource/cloud-area')
    await page.getByText('无操作权限').waitFor()
    const applyButton = page.getByRole('button', { name: '去申请权限' })
    assert(await applyButton.isEnabled(), '去申请权限按钮不可用')
    await applyButton.click()
    await page.getByText('权限申请已提交').waitFor()
    assert(state.applyBody, '未发出 /iam/apply 请求')
    assert(state.applyBody.object === 'instance' && state.applyBody.action === 'read' && state.applyBody.domain === '*',
      `申请 payload 应为 {instance,read,*}(镜像边缘键空间),实际 ${JSON.stringify(state.applyBody)}`)
    console.log(`✓ 站内申请 payload ${JSON.stringify(state.applyBody)}`)

    // === 2. 管理页审批区块 ===
    await freshLoad(page, '#/platform/iam')
    await page.getByTestId('iam-apply-table').waitFor()
    // 申请列表在 permissions 之后异步加载,等行出现再断言
    const pendingRow = page.getByTestId('iam-apply-table').locator('tbody tr').filter({ hasText: 'bob' })
    await pendingRow.waitFor()
    await pendingRow.getByText('通过', { exact: true }).click()
    await page.getByText('已通过,策略已生效').waitFor()
    assert(state.decisionBodies.length === 1 && state.decisionBodies[0].id === 'r1001' && state.decisionBodies[0].approve === true,
      `决策 payload 应为 {id:r1001,approve:true},实际 ${JSON.stringify(state.decisionBodies)}`)
    console.log(`✓ 审批区块渲染 + 通过决策 ${JSON.stringify(state.decisionBodies[0])}`)

    assert(errors.length === 0, `页面错误: ${errors.join(' | ')}`)
    await browser.close()
    console.log('站内申请流契约 runner 全部通过')
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`)
    process.exitCode = 1
    await browser.close().catch(() => {})
  }
})()
