// M4-H: service template list + create contract (legacy service-template/index.vue + create.vue).
const fs = require('fs')
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const REPORT = process.env.UI_V3_M4_SVCTPL_REPORT || '/tmp/ui-v3-m4-svc-template.json'
const SHOTS = process.env.UI_V3_M4_SVCTPL_SHOTS || '/tmp/ui-v3-m4-svctpl-shots'
fs.mkdirSync(SHOTS, { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function ok(data) {
  return { result: true, bk_error_code: 0, bk_error_msg: 'success', data }
}

function json(route, data) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
}

function hashQuery(page) {
  const hash = new URL(page.url()).hash.replace(/^#/, '')
  return new URLSearchParams(hash.split('?')[1] || '')
}

async function waitForRecord(predicate, message, timeout = 6000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(message)
}

const TPL_ROWS = [
  { id: 11, name: 'web-tpl', service_category_id: 11, process_count: 2, module_count: 1, modifier: 'admin', last_time: '2026-09-30 10:00:00' },
  { id: 12, name: 'job-tpl', service_category_id: 12, process_count: 1, module_count: 0, modifier: 'admin', last_time: '2026-09-30 09:00:00' }
]
const CATEGORIES = [
  { id: 1, name: 'Web 服务', bk_parent_id: 0 },
  { id: 11, name: 'Web', bk_parent_id: 1 },
  { id: 12, name: 'Job', bk_parent_id: 1 }
]

function makeRecords() {
  return { listBodies: [], deleteBodies: [], errors: [] }
}

function attachObservers(page, records) {
  page.on('pageerror', (error) => records.errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') records.errors.push(`console.error: ${message.text()}`)
  })
}

async function installM4SvcTpl(page, records) {
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    return route.continue({ headers })
  })
  await page.route('**/api/v3/**', (route) => json(route, ok({})))
  await page.route('**/userinfo', (route) => json(route, ok({ username: 'm4h', chname: 'M4H', current_supplier: '0' })))
  await page.route('**/api/v3/biz/search/0', (route) => json(route, ok({ count: 1, info: [{ bk_biz_id: 2, bk_biz_name: 'Mock Business' }] })))
  await page.route('**/api/v3/findmany/biz_set', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/usercustom/user/search', (route) => json(route, ok({})))
  await page.route('**/api/v3/usercustom', (route) => json(route, ok({})))
  await page.route('**/api/v3/find/classificationobject', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/object', (route) => json(route, ok([])))
  await page.route('**/api/v3/hosts/favorites/search', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/find/objectattr/web', (route) => json(route, ok([])))
  await page.route('**/api/v3/findmany/proc/service_category', (route) => json(route, ok({ count: CATEGORIES.length, info: CATEGORIES })))
  await page.route('**/api/v3/findmany/proc/service_category/with_statistics', (route) => json(route, ok({ count: CATEGORIES.length, info: CATEGORIES })))
  await page.route('**/api/v3/find/objectattr', (route) => json(route, ok([])))
  await page.route('**/api/v3/findmany/proc/service_template/count_info/**', (route) => json(route, ok([
    { service_template_id: 11, process_template_count: 2, module_count: 1 },
    { service_template_id: 12, process_template_count: 1, module_count: 0 }
  ])))
  await page.route('**/api/v3/findmany/proc/service_template', async (route) => {
    const body = route.request().postDataJSON() || {}
    records.listBodies.push(body)
    let rows = TPL_ROWS
    if (body.search) rows = rows.filter((r) => r.name.includes(body.search))
    if (body.service_category_id) {
      // 老版语义:一级分类 id 由后端按一级聚合解析
      const childIds = CATEGORIES.filter((c) => c.bk_parent_id === body.service_category_id).map((c) => c.id)
      const ids = childIds.length ? childIds : [body.service_category_id]
      rows = rows.filter((r) => ids.includes(r.service_category_id))
    }
    const sort = String(body.page?.sort || '-id')
    const field = sort.replace(/^-/, '')
    rows = [...rows].sort((a, b) => (a[field] > b[field] ? 1 : -1) * (sort.startsWith('-') ? -1 : 1))
    return json(route, ok({ count: rows.length, info: rows }))
  })
  await page.route('**/api/v3/delete/proc/service_template', async (route) => {
    records.deleteBodies.push(route.request().postDataJSON() || {})
    return json(route, ok(null))
  })
  await page.route('**/api/v3/create/proc/service_template/all_info', async (route) => {
    const body = route.request().postDataJSON() || {}
    records.createBody = body
    return json(route, ok({ id: 99 }))
  })
  await page.route('**/api/v3/findmany/proc/service_instance', (route) => json(route, ok({ count: 0, info: [] })))
}

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)

  const records = makeRecords()
  attachObservers(page, records)
  await installM4SvcTpl(page, records)

  const checks = []
  try {
    // 1. 一级分类筛选 bug 修复:一级 Web 服务(其下二级 11/12)应筛出两行(旧实现精确匹配必为空)
    await page.goto(`${BASE}/#/business/2/service/template?mainClassification=1`, { waitUntil: 'load' })
    await page.locator('.el-table__row').first().waitFor()
    assert(await page.locator('.el-table__row').count() === 2, `一级分类筛选行数异常: ${await page.locator('.el-table__row').count()}`)
    // tooltip 为 hover 懒挂载:悬停已应用行(web-tpl)的删除按钮后断言老版译文
    const disabledDelete = page.locator('.el-table__row').filter({ hasText: 'web-tpl' }).locator('button:disabled').filter({ hasText: '删除' })
    assert(await disabledDelete.count() === 1, '已应用模板删除按钮未置灰')
    await disabledDelete.hover()
    await page.waitForTimeout(400)
    assert((await page.locator('body').textContent()).includes('模板已被应用不能删除'), '不可删除 tooltip 未使用老版译文')
    checks.push('main category filter matches leaf set with legacy tooltip copy')

    // 2. 深链 name+sort:请求带 search/sort/limit,URL 保留
    await page.goto(`${BASE}/#/business/2/service/template?name=job&sort=name&current=1&limit=50`, { waitUntil: 'load' })
    await page.locator('.el-table__row').first().waitFor()
    await waitForRecord(() => {
      const body = records.listBodies.at(-1) || {}
      return body.search === 'job' && body.page?.sort === 'name' && body.page?.limit === 50
    }, `深链请求不符合契约: ${JSON.stringify(records.listBodies.at(-1))}`)
    assert(hashQuery(page).get('name') === 'job', '深链后 URL name 丢失')
    if (records.errors.length) console.log(`[diag] errors after step2: ${JSON.stringify(records.errors.slice(0,2))}`)
    checks.push('deep link name/sort/limit drives server request and stays in URL')

    // 3. 排序点击:ID 列升序 → page.sort=id 并回写 URL
    await page.goto(`${BASE}/#/business/2/service/template`, { waitUntil: 'load' })
    await page.locator('.el-table__row').first().waitFor()
    const callsBeforeSort = records.listBodies.length
    await page.locator('.el-table__header th').filter({ hasText: 'ID' }).click()
    try {
      await waitForRecord(() => records.listBodies.length > callsBeforeSort && records.listBodies.at(-1).page?.sort === 'id', 'x')
    } catch {
      throw new Error(`排序请求未更新 sort=id; calls=${records.listBodies.length}; last=${JSON.stringify(records.listBodies.at(-1))}; url=${page.url()}`)
    }
    await waitForRecord(() => hashQuery(page).get('sort') === 'id', `排序未写入 URL sort: ${page.url()}`)
    if (records.errors.length) console.log(`[diag] errors after step3: ${JSON.stringify(records.errors.slice(0,2))}`)
    checks.push('header sort posts page.sort and syncs URL')

    // 4. 删除契约:确认框标题「确认删除模板」,成功「删除成功」
    await page.goto(`${BASE}/#/business/2/service/template`, { waitUntil: 'load' })
    await page.locator('.el-table__row').first().waitFor()
    const deleteBtn = page.locator('.el-table__row').filter({ hasText: 'job-tpl' }).getByRole('button', { name: '删除' })
    await deleteBtn.click()
    const confirmBox = page.locator('.el-message-box').filter({ hasText: '确认删除模板' })
    await confirmBox.waitFor()
    await confirmBox.getByRole('button', { name: '确定' }).click()
    await waitForRecord(() => {
      const body = records.deleteBodies.at(-1)
      return body?.bk_biz_id === 2 && body?.service_template_id === 12
    }, `删除 payload 不符合契约: ${JSON.stringify(records.deleteBodies.at(-1))}`)
    checks.push('delete posts payload with legacy confirm title')

    // 5. 创建页:无进程确认文案逐字;成功弹窗记录新 id 且「关闭」跳详情
    await page.goto(`${BASE}/#/business/2/service/template/create`, { waitUntil: 'load' })
    await page.locator('body').waitFor()
    await page.waitForTimeout(600)
    const nameInput = page.getByPlaceholder('模板名称将作为实例化后的模块名')
    await nameInput.fill('new-tpl')
    // 老版 auto-select 契约:有子分类的一级分类与第一个二级分类自动选中(提交 payload 验证 service_category_id=11)
    await page.getByRole('button', { name: '提交' }).click()
    await page.waitForTimeout(600)
    try {
      await page.locator('.el-message-box').filter({ hasText: '当前模板没有设定进程信息，是否确认？' }).waitFor()
    } catch (error) {
      const messages = await page.locator('.el-message').allInnerTexts().catch(() => [])
      const bodyText = await page.locator('body').innerText().catch(() => '')
      const submitCount = await page.getByRole('button', { name: '提交' }).count()
      throw new Error(`${error.message.split('\n')[0]}; messages=${JSON.stringify(messages)}; submitBtns=${submitCount}; body=${bodyText.slice(0, 400).replace(/\n/g, ' ')}`)
    }
    assert(!(await page.locator('body').textContent()).includes('服务模板创建没进程提示'), '创建页仍存在未翻译 i18n key 直出')
    await page.locator('.el-message-box').filter({ hasText: '当前模板没有设定进程信息，是否确认？' }).getByRole('button', { name: '确定' }).click()
    await waitForRecord(() => records.createBody?.name === 'new-tpl', `创建 payload 缺失: ${JSON.stringify(records.createBody)}`)
    assert(records.createBody?.service_category_id === 11, `auto-select 分类未随 payload 提交: ${JSON.stringify(records.createBody)}`)
    await page.locator('.el-dialog').filter({ hasText: '创建成功' }).waitFor()
    const successText = await page.locator('.el-dialog').filter({ hasText: '创建成功' }).innerText()
    assert(successText.includes('中应用') && successText.includes('中创建模块'), '创建成功文案未对齐老版')
    await page.locator('.el-dialog').filter({ hasText: '创建成功' }).getByRole('button', { name: /关\s*闭/ }).click()
    await page.waitForFunction(() => window.location.hash.includes('/service/template/details/99'), null, { timeout: 8000 })
      .catch(() => { throw new Error(`「关闭」未跳新模板详情: ${page.url()}`) })
    checks.push('create posts all_info, records new id, and close redirects to detail')

    // 6. 顶部提示逐字+链接+持久化(旧版 cmdb-tips tips-key=serviceTemplateTips)
    await page.goto(`${BASE}/#/business/2/service/template`, { waitUntil: 'load' })
    await page.locator('.el-table__row').first().waitFor()
    const tips = page.locator('.page-tips').filter({ hasText: '服务模板可以预定义' })
    assert(await tips.isVisible(), '顶部提示未显示')
    const tipsText = await tips.innerText()
    assert(tipsText.includes('服务模板可以预定义业务通用的服务') && tipsText.includes('业务拓扑'), `提示文案不符: ${tipsText.slice(0, 80)}`)
    await tips.locator('.tips-close').click()
    await page.waitForTimeout(300)
    const stored = await page.evaluate(() => localStorage.getItem('serviceTemplateTips'))
    assert(stored === 'closed', `提示关闭未持久化: ${stored}`)
    await page.reload({ waitUntil: 'load' })
    await page.locator('.el-table__row').first().waitFor()
    assert(!(await page.locator('.page-tips').isVisible().catch(() => false)), '关闭后提示仍显示')
    checks.push('svc tips legacy copy with topo link and tips-key persistence')

    // 7. count_info 缺失/失败置 '--'
    await page.route('**/api/v3/findmany/proc/service_template/count_info/**', (route) => route.abort())
    await page.reload({ waitUntil: 'load' })
    await page.locator('.el-table__row').first().waitFor()
    await page.waitForFunction(() => document.body.innerText.includes('--'), null, { timeout: 6000 })
      .catch(() => { throw new Error('count 失败未置 --') })
    checks.push('count_info failure renders -- placeholders')

    // 8. 空态分型:筛选态带清除筛选,点击后恢复并清空 query
    await page.goto(`${BASE}/#/business/2/service/template?name=zzznonexistent`, { waitUntil: 'load' })
    await page.waitForTimeout(800)
    const clearBtn = page.locator('.el-table__empty-block').getByRole('button', { name: '清除筛选' })
    await clearBtn.waitFor()
    await clearBtn.click()
    await page.locator('.el-table__row').first().waitFor()
    checks.push('svc list search empty state offers clear filter and restores rows')

    await page.screenshot({ path: `${SHOTS}/m4-h-svc-template.png`, timeout: 20000, animations: 'disabled' })
    // count_info abort(check 7)的 net::ERR_FAILED 为预期资源错误
    const realErrors = records.errors.filter((entry) => !/favicon|ResizeObserver|ERR_FAILED/.test(entry))
    assert(realErrors.length === 0, `页面产生运行时错误: ${realErrors.slice(0, 3).join(' | ')}`)
  } finally {
    await context.close()
    await browser.close()
  }

  fs.writeFileSync(REPORT, `${JSON.stringify({
    schemaVersion: 1,
    reportKind: 'ui-v3-m4-svc-template-mock',
    status: 'passed',
    screenshotDir: SHOTS,
    checks,
    requestCounts: { list: records.listBodies.length, delete: records.deleteBodies.length },
    externalDependencies: 'mock-only'
  }, null, 2)}\n`)
  console.log(`M4-H svc template mock contract passed (${checks.length} checks)`)
  process.exit(process.exitCode || 0)
}

run().catch((error) => {
  console.error(`✗ M4-H svc template: ${error.message}`)
  process.exitCode = 1
})
