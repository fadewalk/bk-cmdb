// B28: 资源池主机目录数量、默认选中、scope/directory 查询契约
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []
  const requests = []
  let directories = []


function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function hashQuery(page) {
  const hash = new URL(page.url()).hash.replace(/^#/, '')
  const [, query = ''] = hash.split('?')
  return new URLSearchParams(query)
}

function bodyFor(request) {
  try { return JSON.parse(request.postData() || '{}') } catch { return {} }
}

function findRule(body, objId, field) {
  return (body.condition || [])
    .find((item) => item.bk_obj_id === objId)?.condition
    ?.find((item) => item.field === field)
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
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/findmany/hosts/search/resource')) requests.push(request)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`) })
  page.on('response', async (response) => {
    if (response.url().includes('/findmany/resource/directory') && response.request().method() === 'POST') {
      try { directories = (await response.json()).data?.info || [] } catch { /* ignore non-json */ }
    }
  })

  try {
    await page.goto(`${BASE}/#/resource/host?scope=1`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForSelector('.dir-tree .el-tree-node', { timeout: 15000 })
    await page.waitForTimeout(500)

    const expectedRootCount = directories.reduce((sum, item) => sum + (Number(item.host_count) || 0), 0)
    const rootText = await page.locator('.dir-tree > .el-tree-node').first().textContent()
    assert(rootText.includes('主机池'), `根节点缺少主机池: ${rootText}`)
    assert(rootText.includes(String(expectedRootCount)), `主机池数量不匹配: ${rootText}, expected ${expectedRootCount}`)

    const currentText = await page.locator('.dir-tree .el-tree-node.is-current').first().textContent()
    assert(currentText.includes('主机池'), `无 directory 时应默认选中主机池: ${currentText}`)
    const initialBody = bodyFor(requests.at(-1))
    assert(findRule(initialBody, 'biz', 'default')?.value === 1, `未分配请求缺少 biz.default=1: ${JSON.stringify(initialBody)}`)

    const defaultDirectory = directories.find((item) => Number(item.default) === 1) || directories[0]
    if (defaultDirectory) {
      const name = defaultDirectory.bk_module_name
      const directoryNode = page.locator('.dir-tree .el-tree-node').filter({ hasText: name }).first()
      await directoryNode.click()
      await page.waitForTimeout(500)
      const query = hashQuery(page)
      assert(query.get('directory') === String(defaultDirectory.bk_module_id), `目录 query 未同步: ${page.url()}`)
      const body = bodyFor(requests.at(-1))
      const moduleRule = findRule(body, 'module', 'bk_module_id')
      assert(Number(moduleRule?.value) === Number(defaultDirectory.bk_module_id), `目录条件未进入请求体: ${JSON.stringify(body)}`)
      assert(await directoryNode.locator('.el-tree-node__content').count() > 0, '目录节点不可见')
    }

    await page.locator('.scope-tab').filter({ hasText: '全部' }).click()
    await page.waitForTimeout(500)
    assert(!(await page.locator('.group-col').isVisible().catch(() => false)), '全部 scope 不应显示资源目录')
    const allBody = bodyFor(requests.at(-1))
    assert(!findRule(allBody, 'biz', 'default'), `全部 scope 不应注入 biz.default: ${JSON.stringify(allBody)}`)

    assert(errors.length === 0, errors.join('\n'))
    console.log('✓ B28 主机池/目录数量、默认选中、directory 与 scope 请求契约通过')
  } finally {
    await browser.close()
  }
})().catch((error) => {
  console.error(`✗ B28 主机资源目录回归失败: ${error.message}`)
  process.exit(1)
})
