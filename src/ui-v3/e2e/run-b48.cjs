// B48: 模型详情 deleteModel caller gap —— 真实删除确认、实例/内置保护、错误反馈与删除后 read-back。
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const errors = []
const stamp = String(Date.now()).slice(-7)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    route.continue({ headers })
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`) })

  const api = (method, path, body) => page.evaluate(async ({ method, path, body }) => {
    const response = await fetch(`/api/v3${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await response.text()
    let payload = null
    try { payload = JSON.parse(text) } catch { payload = { raw: text.slice(0, 200) } }
    return { status: response.status, ...payload }
  }, { method, path, body })

  let modelId = null
  let objId = `b48_delete_${stamp}`
  let instanceId = null
  try {
    await page.goto(`${BASE}/#/index`, { waitUntil: 'load' })
    await page.waitForTimeout(700)

    const classifications = await api('POST', '/find/objectclassification', {})
    const groups = classifications.data?.info || classifications.data || []
    const group = groups.find((item) => item.bk_classification_id === 'bk_uncategorized') || groups[0]
    assert(group?.bk_classification_id, '没有可用模型分组')

    const created = await api('POST', '/create/object', {
      bk_obj_id: objId,
      bk_obj_name: `B48删除模型${stamp}`,
      bk_obj_icon: 'icon-cc-default',
      bk_classification_id: group.bk_classification_id,
      bk_supplier_account: '0'
    })
    assert(created.result !== false, `创建删除夹具失败: ${created.bk_error_msg || JSON.stringify(created)}`)
    modelId = created.data?.id
    assert(modelId, `创建响应缺少模型 id: ${JSON.stringify(created)}`)

    // 真实的实例保护：模型详情在实例存在时仍显示删除入口，但后端拒绝 DELETE，页面必须显示错误且停留原页。
    const instance = await api('POST', `/create/instance/object/${objId}`, {
      bk_inst_name: `B48实例${stamp}`,
      bk_supplier_account: '0'
    })
    assert(instance.result !== false, `创建实例夹具失败: ${instance.bk_error_msg || JSON.stringify(instance)}`)
    instanceId = instance.data?.bk_inst_id ?? instance.data?.id
    assert(instanceId, `创建实例响应缺少实例 id: ${JSON.stringify(instance)}`)

    await page.goto(`${BASE}/#/model/management/details/${objId}`, { waitUntil: 'load' })
    await page.waitForSelector('[data-testid="delete-model-button"]', { timeout: 15000 })
    const deleteButton = page.locator('[data-testid="delete-model-button"]')
    assert(await deleteButton.isVisible(), '自定义模型缺少删除入口')

    await deleteButton.click()
    const confirm = page.locator('.el-message-box:visible')
    await confirm.waitFor({ state: 'visible', timeout: 5000 })
    assert((await confirm.innerText()).includes('删除模型和其下所有实例'), '删除确认文案未复刻 legacy 契约')
    await confirm.locator('.el-button--primary').click()
    await page.waitForTimeout(1000)
    const protectedToast = page.locator('.el-message:visible').filter({ hasText: '删除失败' })
    await protectedToast.waitFor({ state: 'visible', timeout: 5000 })
    assert((await page.locator('.model-detail').count()) === 1, '实例保护失败后不应离开模型详情页')
    const protectedRead = await api('POST', '/find/object', { bk_obj_id: objId })
    assert((protectedRead.data || []).some((item) => item.bk_obj_id === objId), '实例保护失败后模型不应被删除')
    console.log('✓ deleteModel 实例保护 + confirm + error feedback')

    // 清掉实例后再走 UI 删除，断言 DELETE 路径、成功提示和删除后的 find read-back。
    const deletedInstance = await api('DELETE', `/delete/instance/object/${objId}/inst/${instanceId}`)
    assert(deletedInstance.result !== false, `清理实例夹具失败: ${deletedInstance.bk_error_msg || JSON.stringify(deletedInstance)}`)
    let deleteRequest = null
    await page.on('request', (request) => {
      if (request.method() === 'DELETE' && request.url().includes(`/delete/object/${modelId}`)) deleteRequest = request.url()
    })
    await deleteButton.click()
    await page.locator('.el-message-box:visible .el-button--primary').click()
    await page.waitForTimeout(1600)
    assert(deleteRequest?.endsWith(`/api/v3/delete/object/${modelId}`), `未发出真实模型 DELETE: ${deleteRequest}`)
    assert((await page.locator('.el-message:visible').filter({ hasText: '删除成功' }).count()) > 0, '删除成功提示缺失')
    const readBack = await api('POST', '/find/object', { bk_obj_id: objId })
    assert(!(readBack.data || []).some((item) => item.bk_obj_id === objId), `删除后 read-back 仍找到模型: ${JSON.stringify(readBack.data)}`)
    assert(page.url().includes('#/model/management'), `删除成功后未返回模型管理: ${page.url()}`)
    console.log('✓ deleteModel DELETE + 成功反馈 + 删除后 read-back')

    // 内置模型不渲染删除按钮，且直接 API 删除仍由后端拒绝，覆盖双层保护。
    await page.goto(`${BASE}/#/model/management/details/host`, { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    assert((await page.locator('[data-testid="delete-model-button"]').count()) === 0, '内置模型不应渲染删除入口')
    const builtinDelete = await api('DELETE', '/delete/object/1')
    assert(builtinDelete.result === false, `内置模型 DELETE 未被拒绝: ${JSON.stringify(builtinDelete)}`)
    console.log('✓ 内置模型 UI/API 双层保护')
  } catch (error) {
    errors.push(`ASSERT: ${error.message}`)
  } finally {
    try {
      if (instanceId && objId) await api('DELETE', `/delete/instance/object/${objId}/inst/${instanceId}`)
    } catch {}
    try {
      if (modelId) await api('DELETE', `/delete/object/${modelId}`)
    } catch {}
    const realErrors = errors.filter((item) => !/favicon|ResizeObserver/.test(item))
    realErrors.forEach((item) => console.error(`✗ ${item}`))
    await browser.close()
  }
  if (errors.length) process.exitCode = 1
  else console.log('B48 E2E 全部通过')
}

main().catch((error) => {
  console.error(`✗ B48: ${error.message}`)
  process.exitCode = 1
})
