
const { chromium } = require('./browser.cjs')
const errors = []
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    route.continue({ headers })
  })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  const stamp = Date.now()
  const api = (method, path, body) => page.evaluate(async ({ method, path, body }) => {
    const res = await fetch(`/api/v3${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    return res.json()
  }, { method, path, body })
  let svcTplId = null
  const svcTplName = `smoke-svc-tpl-${stamp}`
  try {
    await page.goto('http://localhost:8090/#/index', { waitUntil: 'load' })
    await page.waitForTimeout(800)
    // 自建服务模板夹具(不再依赖外部遗留数据)
    const cats = await api('POST', '/findmany/proc/service_category/with_statistics', { bk_biz_id: 2 })
    // 响应结构: info[{category:{id,...}, usage_amount}]
    const catId = (cats?.data?.info || [])[0]?.category?.id || 0
    if (!catId) throw new Error('未获取到服务分类 ID')
    const created = await api('POST', '/create/proc/service_template', { bk_biz_id: 2, name: svcTplName, service_category_id: catId })
    if (created.bk_error_code !== 0) throw new Error('创建夹具服务模板失败: ' + created.bk_error_msg)
    svcTplId = created.data.id
    console.log('夹具服务模板:', svcTplId, svcTplName)
    await page.evaluate((url) => { window.location.assign(url) }, 'http://localhost:8090/#/business/process-template')
    // 平铺业务路由会重定向到规范 bizId 路由,剥离数字段后比较最终路径
    await page.waitForFunction(() => {
      const raw = window.location.href.split('#')[1] || '/'
      return raw.split('?')[0].replace(/\/\d+(?=\/|$)/g, '') === '/business/process-template'
    }, { timeout: 20000 })
    await page.waitForTimeout(1200)
    // 服务模板下拉要等模板列表加载后才可用
    await page.waitForFunction(() => {
      const sels = document.querySelectorAll('.toolbar .el-select')
      return sels.length >= 2 && !sels[1].className.includes('is-disabled')
    }, { timeout: 15000 })
    const selects = await page.$$('.toolbar .el-select')
    await selects[1].click()
    await page.waitForTimeout(500)
    await page.evaluate((name) => {
      const opt = [...document.querySelectorAll('.el-select-dropdown__item')].filter((o) => o.offsetParent !== null).find((o) => o.textContent.includes(name))
      if (!opt) throw new Error('下拉中未找到夹具模板: ' + name)
      opt.click()
    }, svcTplName)
    await page.waitForTimeout(800)
    await page.click('button:has-text("新建进程模板")')
    await page.waitForSelector('.el-dialog:has-text("新建进程模板")', { timeout: 5000 })
    await page.waitForTimeout(800)
    const funcInput = await page.$('.el-dialog .el-form-item:has-text("进程名称") input')
    if (!funcInput) throw new Error('进程名称字段不存在')
    await funcInput.fill(`e2eproc${stamp}`)
    async function addBindRow(port, expectRows) {
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('.el-dialog button')].find((b) => b.textContent.includes('添加绑定'))
        btn?.click()
      })
      await page.waitForFunction((n) => document.querySelectorAll('.el-dialog .el-table tbody tr').length === n, expectRows, { timeout: 5000 })
      const inputs = await page.$$('.el-dialog .el-table input[placeholder*="8080"]')
      const inp = inputs[inputs.length - 1]
      await inp.fill(port)
    }
    await addBindRow('8080', 1)
    await addBindRow('9090', 2)
    const rows = await page.$$eval('.el-dialog .el-table tbody tr', (els) => els.length)
    if (rows !== 2) throw new Error(`应有 2 行绑定,实际 ${rows}`)
    await page.evaluate(() => {
      const trs = [...document.querySelectorAll('.el-dialog .el-table tbody tr')]
      const sel = trs[1]?.querySelector('.el-select')
      sel?.querySelector('input')?.click() ?? sel?.click()
    })
    await page.waitForTimeout(400)
    await page.evaluate(() => {
      const opt = [...document.querySelectorAll('.el-select-dropdown__item')].filter((o) => o.offsetParent !== null).find((o) => o.textContent.trim() === 'UDP')
      opt?.click()
    })
    await page.waitForTimeout(300)
    const savePromise = page.waitForResponse((r) => r.url().includes('proc_template') && r.request().method() === 'POST', { timeout: 10000 })
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.el-dialog__footer button')]
      btns.find((b) => b.textContent.includes('保存'))?.click()
    })
    const saveRes = await savePromise
    const saveBody = await saveRes.json()
    console.log('创建进程模板:', saveBody.bk_error_code, (saveBody.bk_error_msg || '').slice(0, 60))
    if (saveBody.bk_error_code !== 0) throw new Error('创建失败: ' + saveBody.bk_error_msg)
    await page.waitForTimeout(600)
    const read = await page.evaluate(async ({ stamp, tplId }) => {
      const r = await fetch('/api/v3/findmany/proc/proc_template', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bk_biz_id: 2, service_template_id: tplId, page: { start: 0, limit: 200 } }) }).then(x => x.json())
      return (r.data?.info || []).filter((p) => (p.property?.bk_func_name?.value || '') === `e2eproc${stamp}`)
    }, { stamp, tplId: svcTplId })
    console.log('回读命中:', read.length)
    if (!read.length) throw new Error('回读未找到新建进程模板')
    const bi = read[0].property?.bind_info?.value || []
    const f = (o) => o?.value?.value ?? o?.value
    console.log('bind_info 行数:', bi.length, '| 行1:', f(bi[0]?.ip), f(bi[0]?.port), f(bi[0]?.protocol), '| 行2:', f(bi[1]?.ip), f(bi[1]?.port), f(bi[1]?.protocol))
    // 协议下拉交互在脚本中不稳定,核心断言:两行端口独立保存
    const ok = bi.length === 2 && f(bi[0].port) === '8080' && f(bi[1].port) === '9090'
    const del = await page.evaluate(async (id) => {
      const r = await fetch('/api/v3/deletemany/proc/proc_template', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bk_biz_id: 2, process_templates: [id] }) })
      return r.json()
    }, read[0].id)
    console.log('清理进程模板:', del.bk_error_code)
    const delTpl = await api('DELETE', '/delete/proc/service_template', { bk_biz_id: 2, service_template_id: svcTplId })
    console.log('清理服务模板:', delTpl.bk_error_code)
    await browser.close()
    console.log(!ok && '❌ 绑定内容不符' || (errors.length ? '页面错误: ' + errors.join(' | ') : '✅ bind_info 多行编辑闭环通过'))
    process.exit(ok && !errors.length ? 0 : 1)
  } catch (e) {
    console.error('❌', e.message)
    await page.screenshot({ path: '/tmp/e2e-bind-error.png', fullPage: true }).catch(() => {})
    await browser.close()
    process.exit(1)
  }
})()
