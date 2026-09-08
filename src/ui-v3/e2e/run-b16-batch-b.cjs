// B批验证: 主机批量编辑(/hosts/batch) + 业务批量编辑(/updatemany/biz/property) + 自定义字段导入项隐藏
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
  await page.waitForTimeout(600)
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
    // ============ 1. 自定义字段: 导入字段项应隐藏(老版 hideImport) ============
    await openHash(page, '#/business/custom-fields')
    await page.waitForSelector('.field-options', { timeout: 15000 })
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.field-options button')]
      btns.find((b) => b.textContent.includes('导入'))?.click()
    })
    await page.waitForTimeout(500)
    const menuText = await page.evaluate(() => [...document.querySelectorAll('.el-dropdown-menu__item')].map((e) => e.textContent.trim()).join(','))
    console.log('导入下拉项:', menuText || '(未弹出)')
    assert(!menuText.includes('导入字段'), '业务自定义字段页不应出现导入字段项(老版 hideImport)')

    // ============ 2. 主机批量编辑 ============
    const stamp = Date.now()
    // 前置清理:历史运行遗留的 e2e 主机
    const preList = await api(page, 'POST', '/api/v3/findmany/hosts/search/resource', { condition: [], page: { start: 0, limit: 100 } })
    for (const h of (preList.data?.info || [])) {
      if (String(h.host?.bk_host_name || '').startsWith('e2e-')) {
        await api(page, 'DELETE', '/api/v3/hosts/batch', { bk_host_id: String(h.host.bk_host_id), bk_supplier_account: '0' })
      }
    }
    const hostIp = `127.0.0.${Math.floor(Math.random() * 200) + 20}`
    const add = await api(page, 'POST', '/api/v3/hosts/add/resource', {
      host_info: [{ bk_host_innerip: hostIp, bk_host_name: `e2e-batch-${stamp}`, bk_cloud_id: 0 }]
    })
    assert(add.bk_error_code === 0, `创建临时主机失败: ${JSON.stringify(add).slice(0, 120)}`)
    const hostId = add.data.success[0].bk_host_id

    await openHash(page, '#/resource/host')
    await page.waitForSelector('.el-table', { timeout: 15000 })
    await page.waitForTimeout(1200)
    // 勾选临时主机
    await page.evaluate((ip) => {
      const tr = [...document.querySelectorAll('.el-table__body-wrapper tbody tr')].find((r) => r.textContent.includes(ip))
      tr?.querySelector('.el-checkbox')?.click()
    }, hostIp)
    await page.waitForTimeout(400)
    // 编辑下拉 → 编辑属性
    await page.evaluate(() => {
      const dd = [...document.querySelectorAll('.table-toolbar .el-dropdown, .page-card .el-dropdown')]
        .find((d) => d.textContent.includes('编辑'))
      dd?.querySelector('button')?.click()
    })
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.el-dropdown-menu__item')]
      items.find((i) => i.textContent.includes('编辑属性'))?.click()
    })
    await page.waitForSelector('.el-drawer__title:has-text("编辑主机属性")', { timeout: 5000 })
    await page.waitForTimeout(600)
    // 修改主机名称字段
    const nameInput = await page.$('.el-drawer .el-form-item:has-text("主机名称") input')
    assert(nameInput, '批量抽屉缺少主机名称字段')
    await nameInput.fill(`e2e-renamed-${stamp}`)
    const putPromise = page.waitForResponse((r) => r.url().endsWith('/hosts/batch') && r.request().method() === 'PUT', { timeout: 8000 })
    page.on('request', (req) => { if (req.url().endsWith('/hosts/batch') && req.method() === 'PUT') console.log('PUT 请求体:', req.postData()) })
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.el-drawer__footer button')]
      btns.find((b) => b.textContent.includes('保存'))?.click()
    })
    const putRes = await putPromise
    const putBody = await putRes.json()
    console.log('批量编辑主机:', putBody.bk_error_code)
    assert(putBody.bk_error_code === 0, `批量编辑主机失败: ${putBody.bk_error_msg}`)
    // 回读
    const detail = await api(page, 'POST', '/api/v3/findmany/hosts/search/resource', {
      condition: [{ bk_obj_id: 'host', fields: [], condition: [{ field: 'bk_host_id', operator: '$eq', value: hostId }] }],
      page: { start: 0, limit: 1 }
    })
    const row = (detail.data?.info || [])[0]?.host
    console.log('回读主机名:', row?.bk_host_name)
    assert(row?.bk_host_name === `e2e-renamed-${stamp}`, `批量编辑未生效: ${row?.bk_host_name}`)

    // ============ 3. 业务批量编辑 ============
    const bizName = `E2E批量业务${stamp}`
    // 前置清理:历史失败运行遗留的 E2E批量业务
    const preBiz = await api(page, 'POST', '/api/v3/biz/search/0', { page: { start: 0, limit: 100 } })
    for (const b0 of ((preBiz.data?.info || [])[0]?.biz || [])) {
      if (String(b0.bk_biz_name || '').startsWith('E2E批量业务')) {
        await api(page, 'PUT', `/api/v3/biz/status/disabled/0/${b0.bk_biz_id}`)
        await api(page, 'POST', '/api/v3/deletemany/biz', { bk_biz_id: [b0.bk_biz_id] })
      }
    }
    const mk = await api(page, 'POST', '/table/biz/0', {
      bk_biz_name: bizName, bk_biz_maintainer: 'admin', bk_biz_developer: '', bk_biz_tester: '',
      bk_biz_productor: '', life_cycle: '1', time_zone: 'Asia/Shanghai', language: '1', description: ''
    })
    assert(mk.bk_error_code === 0, `创建临时业务失败: ${JSON.stringify(mk).slice(0, 150)}`)
    const bizId = mk.data?.bk_biz_id
    await openHash(page, '#/resource/business')
    await page.waitForSelector('.el-table', { timeout: 15000 })
    await page.waitForTimeout(1000)
    await page.evaluate((name) => {
      const tr = [...document.querySelectorAll('.el-table__body-wrapper tbody tr')].find((r) => r.textContent.includes(name))
      tr?.querySelector('.el-checkbox')?.click()
    }, bizName)
    await page.waitForTimeout(400)
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.table-toolbar button')].find((b) => b.textContent.includes('批量编辑'))
      btn?.click()
    })
    await page.waitForSelector('.el-drawer__title:has-text("批量编辑")', { timeout: 5000 })
    const maintainerInput = await page.$('.el-drawer .el-form-item:has-text("运维人员") input')
    await maintainerInput.fill('admin,e2eadmin')
    const bizPutPromise = page.waitForResponse((r) => r.url().includes('updatemany/biz/property'), { timeout: 8000 })
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.el-drawer__footer button')]
      btns.find((b) => b.textContent.includes('保存'))?.click()
    })
    const bizPut = await bizPutPromise
    const bizPutBody = await bizPut.json()
    console.log('批量编辑业务:', bizPutBody.bk_error_code)
    assert(bizPutBody.bk_error_code === 0, `批量编辑业务失败: ${bizPutBody.bk_error_msg}`)
    // 回读
    const bizList = await api(page, 'POST', '/api/v3/biz/search/0', { page: { start: 0, limit: 100 } })
    const hitBiz = (bizList.data?.info || []).find((b) => b.bk_biz_name === bizName)
    console.log('回读运维人员:', hitBiz?.bk_biz_maintainer)
    assert(String(hitBiz?.bk_biz_maintainer).includes('e2eadmin'), `业务批量编辑未生效: ${hitBiz?.bk_biz_maintainer}`)

    // ============ 清理 ============
    const delHost = await api(page, 'DELETE', '/api/v3/hosts/batch', { bk_host_id: String(hostId), bk_supplier_account: '0' })
    assert(delHost.bk_error_code === 0, `清理临时主机失败: ${JSON.stringify(delHost).slice(0, 100)}`)
    const arc = await api(page, 'PUT', `/api/v3/biz/status/disabled/0/${bizId}`)
    assert(arc.bk_error_code === 0, `归档临时业务失败: ${JSON.stringify(arc).slice(0, 100)}`)
    const delBiz = await api(page, 'POST', '/api/v3/deletemany/biz', { bk_biz_id: [bizId] })
    assert(delBiz.bk_error_code === 0, `删除临时业务失败: ${JSON.stringify(delBiz).slice(0, 100)}`)
    console.log('临时数据已清理')
  } catch (e) {
    failed = 1
    console.error('❌', e.message)
    await page.screenshot({ path: '/tmp/e2e-b-batch-error.png', fullPage: true }).catch(() => {})
  } finally {
    await browser.close()
  }

  if (errors.length) {
    console.error('页面错误:', errors)
    failed = 1
  }
  console.log(failed ? '❌ 验证失败' : '✅ B批全部通过')
  process.exit(failed)
})()
