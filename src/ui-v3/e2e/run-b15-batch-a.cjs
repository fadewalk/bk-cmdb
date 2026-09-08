// A批验证: 动态分组条件编辑器(创建/编辑回显/预览/清空) + 云账户(编辑/详情任务关联)
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []
let failed = 0

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function api(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    return res.json()
  }, { method, path, body })
}

async function openHash(page, hash, timeout = 30000) {
  await page.evaluate((url) => { window.location.assign(url) }, `${BASE}/${hash}`)
  await page.waitForFunction((expected) => window.location.href.split('#')[1] === expected, hash.replace(/^#/, ''), { timeout })
  await page.waitForTimeout(500)
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
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })

  try {
    // ============ 动态分组编辑器 ============
    await openHash(page, '#/business/dynamic-group')
    await page.waitForSelector('.el-table', { timeout: 15000 })
    await page.waitForTimeout(800)

    // 1. 打开新建编辑器,验证结构(查询对象/条件分组/添加条件/预览/清空)
    await page.click('.table-toolbar button.el-button--primary')
    await page.waitForSelector('.el-drawer__title:has-text("新建动态分组")', { timeout: 5000 })
    await page.waitForTimeout(600)
    const hasTarget = await page.$('.el-drawer .el-radio-group')
    assert(hasTarget, '编辑器缺少查询对象选择')
    const groupTitles = await page.$$eval('.cond-group-title', (els) => els.map((e) => e.textContent.trim()))
    console.log('条件分组:', groupTitles.join(' | '))
    assert(groupTitles.includes('可变条件'), '缺少可变条件分组')

    // 2. 填名称,添加主机属性条件(bk_host_innerip in [...])
    await page.fill('.editor-left .el-input input', `E2E动态组${Date.now()}`)
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.el-dropdown-menu__item')]
      const target = items.find((i) => i.textContent.includes('bk_host_innerip'))
      target?.click()
    })
    await page.waitForTimeout(400)
    let rowCount = await page.$$eval('.cond-row', (els) => els.length)
    assert(rowCount === 1, `添加条件后应有 1 行,实际 ${rowCount}`)
    // 填值: in 操作符的多选框 allow-create → 输入回车
    await page.click('.cond-row .cond-val')
    await page.keyboard.type('127.0.0.1')
    await page.keyboard.press('Enter')
    await page.keyboard.type('127.0.0.2')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)

    // 3. 预览(host 条件 → hosts search resource)
    const previewPromise = page.waitForResponse((r) => r.url().includes('findmany/hosts/search/resource'), { timeout: 8000 }).catch(() => null)
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.editor-actions button')]
      btns.find((b) => b.textContent.includes('预览'))?.click()
    })
    const previewRes = await previewPromise
    assert(previewRes, '预览请求未发出')
    const previewBody = await previewRes.json()
    console.log('预览响应:', previewBody.bk_error_code, 'count:', previewBody.data?.count)
    assert(previewBody.bk_error_code === 0, `预览接口失败: ${previewBody.bk_error_msg}`)
    await page.waitForTimeout(400)

    // 4. 清空条件(popconfirm 确认)
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.editor-actions button')]
      btns.find((b) => b.textContent.includes('清空条件'))?.click()
    })
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.el-popconfirm button')].find((b) => b.textContent.includes('确定'))
      btn?.click()
    })
    await page.waitForTimeout(400)
    rowCount = await page.$$eval('.cond-row', (els) => els.length)
    assert(rowCount === 0, `清空后应有 0 行,实际 ${rowCount}`)

    // 5. 保存闭环:再加一个条件并保存,API 回读验证 info.condition
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.el-dropdown-menu__item')]
      const target = items.find((i) => i.textContent.includes('bk_host_name'))
      target?.click()
    })
    await page.waitForTimeout(300)
    // bk_host_name 是 singlechar → 默认 in;切换到 like
    await page.evaluate(() => {
      const row = document.querySelector('.cond-row')
      const opSelect = row.querySelector('.cond-op input')
      opSelect?.click()
    })
    await page.waitForTimeout(400)
    await page.evaluate(() => {
      const opts = [...document.querySelectorAll('.el-select-dropdown__item')]
      const like = opts.find((o) => o.textContent.trim() === 'like')
      like?.click()
    })
    await page.waitForTimeout(300)
    await page.type('.cond-row .cond-val input', 'e2e-host')
    const saveName = `E2E动态组${Date.now()}`
    await page.fill('.editor-left .el-input input', saveName)
    const createPromise = page.waitForResponse((r) => r.url().endsWith('/dynamicgroup') && r.request().method() === 'POST', { timeout: 8000 })
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.editor-actions button')]
      btns.find((b) => b.textContent.includes('保存'))?.click()
    })
    const createRes = await createPromise
    const createBody = await createRes.json()
    console.log('创建动态分组:', createBody.bk_error_code)
    assert(createBody.bk_error_code === 0, `创建失败: ${createBody.bk_error_msg}`)
    // 回读
    // UI 的业务来自 store 默认(可能非 1),遍历业务找到刚创建的组
    let hit = null
    for (const biz of [1, 2, 3]) {
      const list = await api(page, 'POST', `/api/v3/dynamicgroup/search/${biz}`, { page: { start: 0, limit: 50 } }).catch(() => null)
      hit = ((list?.data || {}).info || []).find((g) => g.name === saveName)
      if (hit) { hit._biz = biz; break }
    }
    assert(hit, '回读未找到创建的动态分组')
    const cond0 = hit.info?.condition?.[0]
    console.log('保存的条件:', JSON.stringify(hit.info?.condition))
    assert(['$regex', 'contains'].includes(cond0?.condition?.[0]?.operator), `模糊操作符提交异常: ${cond0?.condition?.[0]?.operator}`)

    // 6. 编辑回显:打开编辑,验证条件行回显
    await page.waitForTimeout(600)
    await page.evaluate((name) => {
      const rows = [...document.querySelectorAll('.el-table__body-wrapper tbody tr')]
      const row = rows.find((r) => r.textContent.includes(name))
      const btn = [...row.querySelectorAll('button')].find((b) => b.textContent.includes('编辑'))
      btn?.click()
    }, saveName)
    await page.waitForSelector('.el-drawer__title:has-text("编辑动态分组")', { timeout: 5000 })
    await page.waitForTimeout(800)
    rowCount = await page.$$eval('.cond-row', (els) => els.length)
    assert(rowCount === 1, `编辑回显应有 1 行条件,实际 ${rowCount}`)
    const echoOp = await page.$eval('.cond-row .cond-op', (el) => el.textContent.trim())
    console.log('回显操作符:', echoOp)
    assert(echoOp === 'like', `回显操作符应为 like,实际 ${echoOp}`)
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.editor-actions button')]
      btns.find((b) => b.textContent.includes('取消'))?.click()
    })

    // 清理
    const del = await api(page, 'DELETE', `/api/v3/dynamicgroup/${hit._biz}/${hit.id}`)
    assert(del.bk_error_code === 0, `清理动态分组失败: ${JSON.stringify(del).slice(0, 100)}`)
    console.log('动态分组已清理')

    // ============ 云账户 编辑/详情 ============
    const stamp = Date.now()
    const mk = await api(page, 'POST', '/api/v3/create/cloud/account', {
      bk_account_name: `E2E账户${stamp}`, bk_cloud_vendor: '2', bk_account_type: 'api_secret_key',
      bk_secret_id: 'sid', bk_secret_key: 'skey', bk_description: ''
    })
    assert(mk.bk_error_code === 0, `创建云账户失败: ${JSON.stringify(mk).slice(0, 120)}`)
    const acctId = mk.data.bk_account_id

    await openHash(page, '#/resource/cloud-account')
    await page.waitForSelector('.el-table', { timeout: 15000 })
    await page.waitForTimeout(600)
    // 编辑
    await page.evaluate((name) => {
      const tr = [...document.querySelectorAll('.el-table__body-wrapper tbody tr')].find((r) => r.textContent.includes(name))
      const btn = [...tr.querySelectorAll('button')].find((b) => b.textContent.includes('编辑'))
      btn?.click()
    }, `E2E账户${stamp}`)
    await page.waitForSelector('.el-dialog__title:has-text("编辑云账户")', { timeout: 5000 })
    const nameInput = await page.$('.el-dialog .el-form-item:has-text("账户名称") input')
    await nameInput.fill(`E2E账户改${stamp}`)
    const updatePromise = page.waitForResponse((r) => r.url().includes('update/cloud/account'), { timeout: 8000 })
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.el-dialog__footer button')]
      btns.find((b) => b.textContent.includes('保存'))?.click()
    })
    const upRes = await updatePromise
    const upBody = await upRes.json()
    console.log('更新云账户:', upBody.bk_error_code)
    assert(upBody.bk_error_code === 0, `更新失败: ${upBody.bk_error_msg}`)
    // 详情(关联任务)
    await page.waitForTimeout(600)
    await page.evaluate((name) => {
      const tr = [...document.querySelectorAll('.el-table__body-wrapper tbody tr')].find((r) => r.textContent.includes(name))
      const btn = [...tr.querySelectorAll('button')].find((b) => b.textContent.includes('详情'))
      btn?.click()
    }, `E2E账户改${stamp}`)
    await page.waitForSelector('.el-drawer__title:has-text("账户详情")', { timeout: 5000 })
    await page.waitForTimeout(800)
    const taskApiSeen = errors.every((e) => !e.includes('findmany/cloud/sync/task'))
    assert(taskApiSeen, '任务查询报错')
    const descText = await page.$eval('.el-drawer .el-descriptions', (el) => el.textContent)
    assert(descText.includes(`E2E账户改${stamp}`), '详情抽屉未显示账户名')
    console.log('详情抽屉正常,关联任务区块已渲染')
    // 清理
    const delAcct = await api(page, 'DELETE', `/api/v3/delete/cloud/account/${acctId}`)
    assert(delAcct.bk_error_code === 0, `清理云账户失败`)
    console.log('云账户已清理')
  } catch (e) {
    failed = 1
    console.error('❌', e.message)
    await page.screenshot({ path: '/tmp/e2e-a-batch-error.png', fullPage: true }).catch(() => {})
  } finally {
    await browser.close()
  }

  if (errors.length) {
    console.error('页面错误:', errors)
    failed = 1
  }
  console.log(failed ? '❌ 验证失败' : '✅ A批全部通过')
  process.exit(failed)
})()
