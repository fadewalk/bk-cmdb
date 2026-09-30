// 权限管理页(/platform/iam)mock 契约:
// 1. 自研 IAM 开启:策略/绑定表渲染 + 增删 payload 契约
// 2. IAM 未开启(404):空态提示,且探测不得弹全局错误 toast
// 3. 老蓝鲸 authscheme 契约回归见 run-iam.cjs(不在本 runner)
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []

const MOCK_PERMISSIONS = {
  subject: 'admin',
  policies: [
    ['admin', '*', '*', '*', 'allow'],
    ['dev', '2', 'biz', 'update', 'allow'],
    ['guest', '2', 'audit', 'read', 'deny']
  ],
  groupings: [
    ['admin', 'admin', '*'],
    ['bob', 'dev', '2']
  ]
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function installMocks(page, options = {}) {
  const { enabled = true } = options
  const posted = { policy: null, grouping: null }
  const removed = { policy: null, grouping: null }
  await page.route('**/iam/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-cache' },
    body: JSON.stringify({ enabled, subject: enabled ? 'admin' : '' })
  }))
  await page.route('**/iam/me/permissions', (route) => {
    // enabled=false 时页面不应打到本端点;打到也按关闭语义回 404
    if (!enabled) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'standalone authorization is disabled' }) })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-cache' },
      body: JSON.stringify(MOCK_PERMISSIONS)
    })
  })
  await page.route('**/iam/verify', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-cache' },
    body: JSON.stringify({ subject: 'admin', allowed: true })
  }))
  await page.route('**/iam/policies', (route) => {
    if (route.request().method() === 'POST') {
      posted.policy = route.request().postDataJSON()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ added: true }) })
    }
    if (route.request().method() === 'DELETE') {
      removed.policy = route.request().postDataJSON()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ removed: true }) })
    }
    return route.continue()
  })
  await page.route('**/iam/groupings', (route) => {
    if (route.request().method() === 'POST') {
      posted.grouping = route.request().postDataJSON()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ added: true }) })
    }
    if (route.request().method() === 'DELETE') {
      removed.grouping = route.request().postDataJSON()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ removed: true }) })
    }
    return route.continue()
  })
  // 静默其余真实请求(登录态/业务列表等),避免环境噪音
  await page.route('**/api/v3/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: true, data: null }) }))
  return { posted, removed }
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
    // 场景 1:IAM 开启,管理页契约
    const { posted, removed } = await installMocks(page, { enabled: true })
    await freshLoad(page, '#/platform/iam')
    await page.getByTestId('iam-policy-table').waitFor()
    const policyRows = await page.getByTestId('iam-policy-table').locator('tbody tr').count()
    assert(policyRows === 3, `策略表应渲染 3 行,实际 ${policyRows}`)
    assert(await page.getByTestId('iam-policy-table').getByText('guest').count() > 0, '策略表缺 deny 行主体')
    const groupingRows = await page.getByTestId('iam-grouping-table').locator('tbody tr').count()
    assert(groupingRows === 2, `绑定表应渲染 2 行,实际 ${groupingRows}`)
    console.log('✓ 策略/绑定表渲染自 /iam/me/permissions')

    await page.getByTestId('iam-policy-add').locator('input').nth(0).fill('carol')
    await page.getByTestId('iam-policy-add').locator('input').nth(1).fill('2')
    await page.getByTestId('iam-policy-add').locator('input').nth(2).fill('topology')
    await page.getByTestId('iam-policy-add').locator('input').nth(3).fill('create')
    await page.getByTestId('iam-policy-add').getByRole('button', { name: '添加策略' }).click()
    await page.waitForTimeout(400)
    assert(Array.isArray(posted.policy) && posted.policy.length === 5, `添加策略 payload 应为五元组,实际 ${JSON.stringify(posted.policy)}`)
    assert(posted.policy[0] === 'carol' && posted.policy[1] === '2' && posted.policy[2] === 'topology' && posted.policy[3] === 'create' && posted.policy[4] === 'allow', `五元组内容不符: ${JSON.stringify(posted.policy)}`)
    console.log(`✓ 添加策略 payload ${JSON.stringify(posted.policy)}`)

    await page.getByTestId('iam-grouping-add').locator('input').nth(0).fill('carol')
    await page.getByTestId('iam-grouping-add').locator('input').nth(1).fill('dev')
    await page.getByTestId('iam-grouping-add').locator('input').nth(2).fill('2')
    await page.getByTestId('iam-grouping-add').getByRole('button', { name: '添加绑定' }).click()
    await page.waitForTimeout(400)
    assert(posted.grouping?.subject === 'carol' && posted.grouping?.role === 'dev' && posted.grouping?.domain === '2', `添加绑定 payload 不符: ${JSON.stringify(posted.grouping)}`)
    console.log(`✓ 添加绑定 payload ${JSON.stringify(posted.grouping)}`)

    await page.getByTestId('iam-grouping-table').locator('tbody tr').nth(1).getByTestId('iam-grouping-remove').click()
    await page.waitForTimeout(400)
    assert(removed.grouping?.subject === 'bob' && removed.grouping?.role === 'dev' && removed.grouping?.domain === '2', `删除绑定 payload 不符: ${JSON.stringify(removed.grouping)}`)
    console.log('✓ 删除绑定 payload 对齐行数据')

    assert(errors.length === 0, `页面错误: ${errors.join(' | ')}`)

    // 场景 2:IAM 未开启 → 空态 + 探测不得弹 toast
    await installMocks(page, { enabled: false })
    await freshLoad(page, '#/platform/iam')
    await page.getByText('独立授权未开启').waitFor()
    await page.waitForTimeout(600)
    const toastCount = await page.locator('.el-message').count()
    assert(toastCount === 0, `探测 404 不应弹全局错误 toast,实际 ${toastCount} 个`)
    console.log('✓ IAM 未开启空态 + 静默探测无 toast')

    await browser.close()
    console.log('权限管理页 mock 契约 runner 全部通过')
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`)
    process.exitCode = 1
    await browser.close().catch(() => {})
  }
})()
