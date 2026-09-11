// B27: 运营统计图表弹窗(老版 chart-detail 契约) + 模型导入/导出向导(老版 model-import-export 契约)
const { chromium } = require('./browser.cjs')
const fs = require('fs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
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
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push('console: ' + m.text()) })

  const stamp = Date.now()
  const TAG = String(stamp).slice(-6)
  const api = (method, path, body) => page.evaluate(async ({ method, path, body }) => {
    const res = await fetch(`/api/v3${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Bkcmdb-User': 'admin', 'X-Bkcmdb-Supplier-Account': '0' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await res.text()
    try { return JSON.parse(text) } catch { return { result: false, bk_error_msg: `non-json(${res.status})` } }
  }, { method, path, body })
  // cmdb-mongodb 被外部周期性重启,窗口期写入报 1199998/1199018,重试穿过
  const apiRetry = async (method, path, body) => {
    let res = await api(method, path, body)
    for (let i = 0; i < 3 && res.result === false && [1199998, 1199018].includes(res.bk_error_code); i += 1) {
      await new Promise((r) => setTimeout(r, 15000))
      res = await api(method, path, body)
    }
    return res
  }

  let createdChartId = null
  let createdModelRow = null
  let exportedZip = null
  let exportPayload = null
  let importPayload = null

  try {
    await page.goto(`${BASE}/#/index`, { waitUntil: 'load', timeout: 30000 })
    await page.waitForTimeout(600)

    // ========== Part A: 运营统计图表弹窗(老版 chart-detail 契约) ==========
    await page.goto(`${BASE}/#/analysis/operation`, { waitUntil: 'load' })
    await page.waitForSelector('.op-page', { timeout: 15000 })
    await page.waitForTimeout(1200)

    // 老版契约:已存在的内置图表禁选。为保证确定性,先删除种子 host_os_chart,再从 UI 重建
    const chartList = await api('GET', '/findmany/operation/chart')
    const allCharts = [
      ...((chartList?.data?.info || {}).host || []),
      ...((chartList?.data?.info || {}).model || []),
      ...((chartList?.data?.info || {}).nav || [])
    ]
    const seedChart = allCharts.find((c) => c.report_type === 'host_os_chart')
    if (seedChart) {
      await api('DELETE', `/delete/operation/chart/${seedChart.config_id}`)
      // 页面内已存在的图表列表需刷新,否则内置选项仍按已存在禁选
      await page.reload({ waitUntil: 'load' })
      await page.waitForTimeout(1500)
    }

    await page.click('button:has-text("新建图表")')
    await page.waitForSelector('.el-dialog:has-text("图表类型")', { timeout: 8000 })
    const dialogText = await page.locator('.el-dialog').innerText()
    assert(dialogText.includes('自定义') && dialogText.includes('内置'), '缺少图表类型 自定义/内置 单选')
    assert(dialogText.includes('统计维度') || dialogText.includes('统计对象') || dialogText.includes('图表宽度'), '缺少统计维度/宽度表单')
    assert(dialogText.includes('饼图') && dialogText.includes('柱状图'), '缺少饼图/柱状图选择')

    // 内置图表:选择 按操作系统类型统计 → 提交,断言 payload 为 repType 且剔除自定义字段
    let chartPayload = null
    await page.route('**/create/operation/chart', (route) => {
      try { chartPayload = route.request().postDataJSON() } catch {}
      route.continue()
    })
    await page.click('.el-dialog .el-radio:has-text("内置")')
    await page.waitForTimeout(500)
    await page.click('.el-dialog .el-select')
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      const opt = [...document.querySelectorAll('.el-select-dropdown__item')]
        .filter((o) => o.offsetParent !== null)
        .find((o) => o.textContent.includes('按操作系统类型统计'))
      if (!opt) throw new Error('内置图表下拉未找到 按操作系统类型统计')
      opt.click()
    })
    await page.click('.el-dialog button:has-text("提交")')
    await page.waitForTimeout(1500)
    assert(chartPayload, '提交未发出 create/operation/chart 请求')
    assert(chartPayload.report_type === 'host_os_chart', '内置图表 report_type 应为 repType: ' + chartPayload.report_type)
    assert(!('field' in chartPayload) && !('bk_obj_id' in chartPayload) && !('chart_type' in chartPayload), '内置图表应剔除自定义字段: ' + JSON.stringify(chartPayload))
    console.log('✓ 内置图表创建 payload 契约(host_os_chart,自定义字段剔除)')

    // 自定义图表:名称+宽度100 → 创建并断言字段齐全
    await page.click('button:has-text("新建图表")')
    await page.waitForTimeout(800)
    let customPayload = null
    await page.route('**/create/operation/chart', (route) => {
      try { customPayload = route.request().postDataJSON() } catch {}
      route.continue()
    })
    await page.locator('.el-dialog .form-row:has-text("图表名称") input').fill(`b27chart${TAG}`)
    await page.click('.el-dialog .el-radio-group:has(.el-radio:has-text("50%")) .el-radio:has-text("100%")')
    await page.click('.el-dialog button:has-text("提交")')
    await page.waitForTimeout(1500)
    assert(customPayload, '自定义图表创建未发请求')
    assert(customPayload.report_type === 'custom', '自定义图表 report_type 应为 custom')
    assert(String(customPayload.width) === '100', '自定义图表宽度应为 100: ' + customPayload.width)
    assert(Number(customPayload.x_axis_count) >= 1, '自定义图表应携带 x_axis_count')
    createdChartId = customPayload.config_id || null
    console.log('✓ 自定义图表创建 payload 契约(custom/宽度/横轴数量)')

    // ========== Part B: 模型导出向导(数字 id + 关联关系排除) ==========
    const modelRes = await apiRetry('POST', '/create/object', {
      bk_obj_id: `b27obj${TAG}`,
      bk_obj_name: `b27模型${TAG}`,
      bk_obj_icon: 'icon-cc-host',
      bk_classification_id: 'bk_network',
      bk_supplier_account: '0'
    })
    assert(modelRes.result !== false, '创建测试模型失败: ' + (modelRes.bk_error_msg || ''))
    createdModelRow = modelRes.data
    await page.goto(`${BASE}/#/model/management`, { waitUntil: 'load' })
    await page.waitForSelector('.model-management', { timeout: 15000 })
    await page.waitForTimeout(1000)

    // 导出选择模式:点导出 → 勾选测试模型(.model-item 内含 .model-checkbox) → 下一步
    await page.click('button:has-text("导出")')
    await page.waitForSelector('.export-action-bar', { timeout: 8000 })
    await page.evaluate((objId) => {
      const item = [...document.querySelectorAll('.model-item')]
        .find((el) => el.querySelector('.model-id')?.textContent.trim() === objId)
      if (!item) throw new Error('未找到模型卡片: ' + objId)
      const cb = item.querySelector('.model-checkbox input[type="checkbox"]')
      if (!cb) throw new Error('卡片内无勾选框')
      if (!cb.checked) cb.click()
    }, `b27obj${TAG}`)
    await page.waitForTimeout(500)
    await page.click('button:has-text("下一步")')
    await page.waitForSelector('.el-dialog:has-text("选择关联关系")', { timeout: 8000 })
    const wizardText = await page.locator('.el-dialog').innerText()
    assert(wizardText.includes('关联关系'), '导出向导缺少关联关系步骤')
    // 关联关系步骤 → 下一步 → 设置(填 ASCII 文件名) → 导出
    await page.route('**/object/exportmany', async (route) => {
      try { exportPayload = route.request().postDataJSON() } catch {}
      // octet-stream 会被浏览器当下载,response.body() 拿不到;在路由层 fetch 截获字节
      const resp = await route.fetch()
      try { exportedZip = await resp.body() } catch {}
      await route.fulfill({ response: resp })
    })
    await page.click('.el-dialog button:has-text("下一步")')
    await page.waitForTimeout(500)
    await page.locator('.el-dialog .export-form input').first().fill(`b27export_${TAG}`)
    await page.click('.el-dialog .step-actions .bk-primary:has-text("导出")')
    await page.waitForTimeout(2500)
    assert(exportPayload, '未发出 object/exportmany 请求')
    assert(Array.isArray(exportPayload.object_id) && exportPayload.object_id.every((n) => Number.isInteger(n)),
      'object_id 应为模型数字 id 数组: ' + JSON.stringify(exportPayload.object_id))
    assert(Array.isArray(exportPayload.excluded_asst_id), 'payload 应包含 excluded_asst_id 数组')
    assert(exportPayload.file_name === `b27export_${TAG}`, 'file_name 不符: ' + exportPayload.file_name)
    assert(exportedZip && exportedZip.length > 0, '导出响应非有效文件流')
    fs.writeFileSync('/tmp/b27-models.zip', exportedZip)
    console.log('✓ 导出向导 payload 契约(数字 id/排除关系/ASCII 文件名),zip', exportedZip.length, 'bytes')
    // 完成按钮退出选择模式
    await page.click('.el-dialog button:has-text("完成")')
    await page.waitForTimeout(500)

    // ========== Part C: 模型导入向导(须知 → 上传+解析 → 编辑器 → 提交) ==========
    // 注意:导出弹窗关闭后 DOM 仍在,所有选择器限定可见的导入弹窗
    const impDlg = page.locator('.el-dialog:visible', { hasText: '用户须知' })
    await page.click('button:has-text("导入")')
    await impDlg.waitFor({ state: 'visible', timeout: 8000 })
    const importNotice = await impDlg.innerText()
    assert(importNotice.includes('导入模型前请仔细阅读'), '缺少用户须知步骤')
    await impDlg.locator('button:has-text("我已了解,下一步")').click()
    await page.waitForTimeout(500)
    await page.setInputFiles('.el-dialog:visible .el-upload input[type="file"]', '/tmp/b27-models.zip')
    await impDlg.locator('button', { hasText: /^下一步$/ }).first().click()
    await impDlg.locator(':has-text("请确认需要导入的模型")').first().waitFor({ state: 'visible', timeout: 15000 })
    await page.waitForTimeout(800)
    const editorText = await impDlg.innerText()
    assert(editorText.includes('请确认需要导入的模型'), '未进入导入编辑器步骤')
    assert(editorText.includes('b27'), '编辑器未展示解析出的模型')
    // 确认导入 → 断言 importmany payload
    await page.route('**/object/importmany', (route) => {
      try { importPayload = route.request().postDataJSON() } catch {}
      route.continue()
    })
    await impDlg.locator('button:has-text("确认导入")').click()
    await page.waitForTimeout(2000)
    assert(importPayload, '未发出 object/importmany 请求')
    assert(Array.isArray(importPayload.import_object) && importPayload.import_object.length > 0, 'import_object 应为非空数组')
    assert(importPayload.import_object[0].bk_obj_id === `b27obj${TAG}`, 'import_object 模型标识不符')
    console.log('✓ 导入向导全流程(须知/上传解析/编辑器/提交 payload)')

    console.log('B27 全部通过')
  } catch (e) {
    errors.push('ASSERT: ' + (e.message || e))
  } finally {
    try { if (createdChartId) await api('DELETE', `/delete/operation/chart/${createdChartId}`) } catch {}
    try { await api('POST', '/find/operation/chart', {}) } catch {}
    try {
      if (createdModelRow?.id) {
        await api('DELETE', `/delete/object/${createdModelRow.id}`, { bk_supplier_account: '0', is_force: true })
      }
    } catch {}
    await browser.close()
  }

  if (errors.length) {
    console.error('\n✗ B27 失败:')
    errors.forEach((e) => console.error('  -', e))
    process.exit(1)
  }
})()
