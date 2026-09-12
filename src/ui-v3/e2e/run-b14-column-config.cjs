// 业务集/项目页列配置 + 项目批量编辑 真实闭环验证
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []
let failed = 0
const usercustomBodies = []

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

async function headerTexts(page) {
  return page.$$eval('.el-table__header-wrapper th', (ths) => ths.map((th) => th.textContent.trim()).filter(Boolean))
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
    if (request.url().endsWith('/usercustom') && request.method() === 'POST') usercustomBodies.push(request.postData())
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`) })

  try {
    // ============ 项目页 ============
    await openHash(page, '#/resource/project')
    await page.waitForSelector('.el-table__header-wrapper', { timeout: 15000 })

    // 1. 默认表头:固定 ID/项目名称 + 动态列(模型属性默认前 6)
    let headers = await headerTexts(page)
    console.log('项目默认表头:', headers.join(' | '))
    assert(headers[0] === 'ID' && headers[1] === '项目名称', '项目固定列应为 ID/项目名称')

    // B32 后项目页列配置使用老版无边框齿轮图标
    const projectColumnTrigger = '.table-toolbar .legacy-toolbar-gear, .table-toolbar button.is-circle'
    await page.click('.table-toolbar .legacy-toolbar-gear, .table-toolbar button.is-circle')
    await page.waitForSelector('.el-drawer__title:has-text("列表显示属性配置")', { timeout: 5000 })
    const drawerTitle = await page.$eval('.el-drawer__title:has-text("列表显示属性配置")', (el) => el.textContent.trim())
    assert(drawerTitle.includes('列表显示属性配置'), `列配置抽屉标题不对: ${drawerTitle}`)
    const optionCount = await page.$$eval('.columns-config-drawer .property-item', (els) => els.length)
    console.log(`列配置候选项: ${optionCount} 个`)
    assert(optionCount > 0, '列配置候选不应为空')
    // 点击
    const targetProperty = page.locator('.columns-config-drawer .property-item').filter({ hasText: '项目描述' }).first()
    if (await targetProperty.count()) await targetProperty.click()
    await page.waitForTimeout(300)
    await page.locator('.columns-config-drawer .config-options button:has-text("应用")').click()
    await page.waitForTimeout(500)
    headers = await headerTexts(page)
    console.log('应用后表头:', headers.join(' | '))
    assert(headers.includes('项目描述'), '应用后应包含项目描述列')
    const saved = usercustomBodies.find((b) => b.includes('pro_custom_table_columns') && b.includes('project_desc'))
    assert(saved, `usercustom pro_custom_table_columns 未持久化: ${usercustomBodies.join('|').slice(0, 200)}`)

    // 3. 恢复默认
    await page.click('.table-toolbar .legacy-toolbar-gear, .table-toolbar button.is-circle')
    await page.waitForSelector('.columns-config-drawer .config-options button:has-text("还原默认")', { timeout: 5000, state: 'visible' })
    await page.locator('.columns-config-drawer .config-options button:has-text("还原默认")').click()
    await page.waitForTimeout(400)
    headers = await headerTexts(page)
    assert(headers[0] === 'ID' && headers[1] === '项目名称', '恢复默认后固定列应仍在首位')

    // 4. 批量编辑真实闭环:创建临时项目 → 勾选 → 批量编辑改负责人 → API 回读 → 删除
    const stamp = Date.now()
    const created = await api(page, 'POST', '/api/v3/createmany/project', {
      data: [{
        bk_project_name: `E2E批量${stamp}`,
        bk_project_code: `e2ebatch${stamp}`,
        bk_project_owner: 'admin',
        bk_project_type: 'other',
        bk_project_desc: 'e2e 临时'
      }]
    })
    console.log('创建临时项目:', JSON.stringify(created).slice(0, 120))
    assert(created.bk_error_code === 0, `创建临时项目失败: ${JSON.stringify(created)}`)

    await page.reload()
    await page.waitForSelector('.el-table__body-wrapper', { timeout: 15000 })
    await page.waitForTimeout(600)
    // 勾选包含临时项目的第一行
    await page.evaluate((name) => {
      const rows = [...document.querySelectorAll('.el-table__body-wrapper tbody tr')]
      const row = rows.find((r) => r.textContent.includes(name))
      row?.querySelector('.el-checkbox')?.click()
    }, `E2E批量${stamp}`)
    await page.waitForTimeout(300)
    await page.click('.table-toolbar button:not(.is-circle):not(.el-button--primary)')
    await page.waitForSelector('.el-drawer__title:has-text("批量编辑")', { timeout: 5000 })
    const batchTitle = await page.$eval('.el-drawer__title:has-text("批量编辑")', (el) => el.textContent.trim())
    assert(batchTitle === '批量编辑', `批量编辑抽屉标题不对: ${batchTitle}`)
    // 修改负责人字段(真实键盘输入,触发 v-model)
    const ownerInput = await page.waitForSelector('.el-drawer .el-form-item:has-text("项目负责人") input')
    await ownerInput.click({ clickCount: 3 })
    await page.keyboard.type('e2eadmin,admin')
    const putPromise = page.waitForResponse((r) => r.url().includes('updatemany/project'), { timeout: 5000 }).catch(() => null)
    page.on('request', (req) => {
      if (req.url().includes('updatemany/project')) console.log('PUT 请求体:', req.postData())
    })
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.el-drawer__footer button')]
      btns.find((b) => b.textContent.includes('保存'))?.click()
    })
    const putRes = await putPromise
    if (putRes) {
      console.log('PUT 状态:', putRes.status(), '响应:', (await putRes.text()).slice(0, 200))
    } else {
      console.log('!! PUT 未发出')
      const msg = await page.$$eval('.el-message', (els) => els.map((e) => e.textContent.trim()))
      console.log('页面消息:', msg)
    }
    await page.waitForTimeout(800)
    // API 回读验证
    const check = await api(page, 'POST', '/api/v3/findmany/project', { page: { start: 0, limit: 50 } })
    const hit = ((check.data || {}).info || []).find((r) => r.bk_project_code === `e2ebatch${stamp}`)
    assert(hit, '回读未找到临时项目')
    console.log('批量编辑后负责人:', hit.bk_project_owner, '| 描述:', hit.bk_project_desc)
    assert(String(hit.bk_project_owner).includes('e2eadmin'), `批量编辑未生效: ${hit.bk_project_owner}`)
    // 未修改字段不应被误提交(项目描述仍为创建时值)
    assert(hit.bk_project_desc === 'e2e 临时', `未修改字段被误改: ${hit.bk_project_desc}`)
    // 清理
    const del = await api(page, 'DELETE', '/api/v3/deletemany/project', { ids: [hit.id] })
    assert(del.bk_error_code === 0, `删除临时项目失败: ${JSON.stringify(del)}`)
    console.log('临时项目已清理')

    // ============ 业务集页 ============
    await openHash(page, '#/resource/biz-set')
    await page.waitForSelector('.el-table__header-wrapper', { timeout: 15000 })
    headers = await headerTexts(page)
    console.log('业务集默认表头:', headers.join(' | '))
    assert(headers[0] === 'ID' && headers[1] === '业务集名', '业务集固定列应为 ID/业务集名')
    // 打开列配置,应用只保留一个动态列,验证持久化 key
    await page.click('.table-toolbar .legacy-toolbar-gear, .table-toolbar button.is-circle')
    await page.waitForSelector('.columns-config-drawer .property-item', { timeout: 5000 })
    const bsOptionCount = await page.$$eval('.columns-config-drawer .property-item', (els) => els.length)
    console.log(`业务集列配置候选: ${bsOptionCount} 个`)
    assert(bsOptionCount > 0, '业务集列配置候选不应为空')
    // 只勾选"业务集描述"(真实鼠标点击,合成 click 不触发 EP 切换)
    const bsBoxes = await page.$$('.columns-config-drawer .property-item')
    for (const b of bsBoxes) {
      const text = await b.evaluate((el) => el.textContent.trim())
      if (text.includes('业务集描述')) await b.click()
    }
    await page.waitForTimeout(300)
    await page.locator('.columns-config-drawer .config-options button:has-text("应用")').click()
    await page.waitForTimeout(500)
    headers = await headerTexts(page)
    console.log('业务集应用后表头:', headers.join(' | '))
    assert(headers.includes('业务集描述'), `业务集应用后应包含业务集描述列: ${headers.join('|')}`)
    assert(headers[0] === 'ID' && headers[1] === '业务集名', `业务集固定列顺序错误: ${headers.join('|')}`)
    const bsSaved = usercustomBodies.find((b) => b.includes('biz_set_custom_table_columns') && b.includes('bk_biz_set_desc'))
    assert(bsSaved, `usercustom biz_set_custom_table_columns 未持久化: ${usercustomBodies.join('|').slice(0, 200)}`)
    // 恢复默认,清理 localStorage
    await page.click('.table-toolbar .legacy-toolbar-gear, .table-toolbar button.is-circle')
    await page.waitForSelector('.columns-config-drawer .config-options button:has-text("还原默认")', { timeout: 5000, state: 'visible' })
    await page.locator('.columns-config-drawer .config-options button:has-text("还原默认")').click()
    await page.waitForTimeout(400)
    await page.evaluate(() => {
      localStorage.removeItem('biz_set_custom_table_columns')
      localStorage.removeItem('pro_custom_table_columns')
    })
  } catch (e) {
    failed = 1
    console.error('❌', e.message)
  } finally {
    await browser.close()
  }

  if (errors.length) {
    console.error('页面错误:', errors)
    failed = 1
  }
  console.log(failed ? '❌ 验证失败' : '✅ 全部通过')
  process.exit(failed)
})()
