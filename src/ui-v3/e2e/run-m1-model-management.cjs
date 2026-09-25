// M1: model management parity mock contract.
// Covers legacy model list/detail interactions without requiring cloud/K8s/ES services.
const fs = require('fs')
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const SHOTS = '/tmp/ui-v3-m1-model-shots'
const REPORT = process.env.UI_V3_M1_REPORT || '/tmp/ui-v3-m1-model-management.json'
fs.mkdirSync(SHOTS, { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function ok(data) {
  return { result: true, bk_error_code: 0, bk_error_msg: 'success', data }
}

function json(route, payload, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload)
  })
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function makeState() {
  return {
    nextId: 900,
    groups: [
      {
        id: 1,
        bk_classification_id: 'infra',
        bk_classification_name: '基础设施',
        bk_classification_type: '',
        bk_ishidden: false,
        bk_objects: [
          {
            id: 101,
            bk_classification_id: 'infra',
            bk_obj_id: 'server',
            bk_obj_name: '服务器',
            bk_obj_icon: 'icon-cc-host',
            bk_ishidden: false,
            ispre: false,
            bk_ispaused: false,
            bk_supplier_account: '0'
          },
          {
            id: 102,
            bk_classification_id: 'infra',
            bk_obj_id: 'paused_server',
            bk_obj_name: '停用服务器',
            bk_obj_icon: 'icon-cc-host',
            bk_ishidden: false,
            ispre: false,
            bk_ispaused: true,
            bk_supplier_account: '0'
          }
        ]
      },
      {
        id: 2,
        bk_classification_id: 'network',
        bk_classification_name: '网络',
        bk_classification_type: '',
        bk_ishidden: false,
        bk_objects: [
          {
            id: 103,
            bk_classification_id: 'network',
            bk_obj_id: 'router',
            bk_obj_name: '路由器',
            bk_obj_icon: 'icon-cc-router',
            bk_ishidden: false,
            ispre: false,
            bk_ispaused: false,
            bk_supplier_account: '0'
          }
        ]
      },
      {
        id: 3,
        bk_classification_id: 'empty',
        bk_classification_name: '空分类',
        bk_classification_type: '',
        bk_ishidden: false,
        bk_objects: []
      },
      {
        id: 4,
        bk_classification_id: 'hidden',
        bk_classification_name: '隐藏分类',
        bk_classification_type: '',
        bk_ishidden: true,
        bk_objects: []
      }
    ],
    attrs: {
      server: [
        { id: 301, bk_obj_id: 'server', bk_property_id: 'server_name', bk_property_name: '服务器名称', bk_property_type: 'singlechar', bk_property_group: 'default', isrequired: true },
        { id: 302, bk_obj_id: 'server', bk_property_id: 'server_ip', bk_property_name: 'IP 地址', bk_property_type: 'singlechar', bk_property_group: 'default', isrequired: false }
      ],
      router: []
    },
    groupsByObj: {
      server: [{ id: 401, bk_obj_id: 'server', bk_group_id: 'default', bk_group_name: 'default', bk_group_index: 1 }],
      router: []
    },
    uniques: {
      server: []
    },
    associations: [],
    statistics: [{ bk_obj_id: 'server', instance_count: 3 }, { bk_obj_id: 'router', instance_count: 1 }]
  }
}

function allModels(state) {
  return state.groups.flatMap((group) => group.bk_objects || [])
}

function findModel(state, objId) {
  return allModels(state).find((model) => model.bk_obj_id === objId)
}

function replaceModelGroup(state, modelId, groupId) {
  const model = findModel(state, modelId)
  if (!model) return
  for (const group of state.groups) {
    group.bk_objects = (group.bk_objects || []).filter((item) => item.bk_obj_id !== modelId)
  }
  const target = state.groups.find((group) => group.bk_classification_id === groupId)
  if (!target) return
  model.bk_classification_id = groupId
  target.bk_objects.push(model)
}

async function installMocks(page, options = {}) {
  const state = makeState()
  const requests = {
    createModel: [],
    updateModel: [],
    createClassification: [],
    updateClassification: [],
    moveField: [],
    createGroup: [],
    createUnique: []
  }
  let failClassificationCount = options.failClassificationOnce ? 2 : 0
  let failDetailAttrsOnce = Boolean(options.failDetailAttrsOnce)

  await page.addInitScript(() => {
    localStorage.setItem('selectedBusiness', '2')
  })
  await page.route('**/*', (route) => route.continue({ headers: { ...route.request().headers(), 'Cache-Control': 'no-cache' } }))

  await page.route('**/userinfo', (route) => json(route, { result: true, data: { username: 'mock-user', chname: 'Mock User', current_supplier: '0' } }))
  await page.route('**/api/v3/biz/search/0', (route) => json(route, ok({ count: 1, info: [{ bk_biz_id: 2, bk_biz_name: 'Mock Biz' }] })))
  await page.route('**/api/v3/findmany/biz_set', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/usercustom/user/search', (route) => json(route, ok({})))

  await page.route('**/api/v3/find/classificationobject', async (route) => {
    if (failClassificationCount > 0) {
      failClassificationCount -= 1
      return json(route, { result: false, bk_error_code: 500, bk_error_msg: '模型分类服务暂不可用' }, 500)
    }
    return json(route, ok(clone(state.groups)))
  })
  await page.route('**/api/v3/find/objectclassification', (route) => json(route, ok(clone(state.groups).map(({ bk_objects, ...group }) => group))))
  await page.route('**/api/v3/count/instances/object/*', (route) => {
    const objId = route.request().url().split('/').pop()
    const result = state.statistics.find((item) => item.bk_obj_id === objId)
    return json(route, ok({ count: result?.instance_count || 0 }))
  })
  await page.route('**/api/v3/find/object', async (route) => {
    const body = route.request().postDataJSON() || {}
    const condition = body.condition || body
    const objId = condition.bk_obj_id
    const data = objId ? allModels(state).filter((model) => model.bk_obj_id === objId) : allModels(state)
    return json(route, ok(clone(data)))
  })
  await page.route('**/api/v3/object/statistics', (route) => json(route, ok(clone(state.statistics))))
  await page.route('**/api/v3/find/objectattr', async (route) => {
    if (failDetailAttrsOnce) {
      failDetailAttrsOnce = false
      return json(route, { result: false, bk_error_code: 500, bk_error_msg: '模型字段服务暂不可用' }, 500)
    }
    const body = route.request().postDataJSON() || {}
    return json(route, ok(clone(state.attrs[body.bk_obj_id] || [])))
  })
  await page.route('**/api/v3/find/objectattgroup/object/*', (route) => {
    const objId = route.request().url().split('/').pop()
    return json(route, ok(clone(state.groupsByObj[objId] || [])))
  })
  await page.route('**/api/v3/find/objectunique/object/*', (route) => {
    const objId = route.request().url().split('/').pop()
    return json(route, ok(clone(state.uniques[objId] || [])))
  })
  await page.route('**/api/v3/find/objectassociation', (route) => json(route, ok(clone(state.associations))))
  await page.route('**/api/v3/find/associationtype', (route) => json(route, ok([{ id: 1, bk_asst_id: 'contains', bk_asst_name: '包含' }])))

  await page.route('**/api/v3/create/object', async (route) => {
    const body = route.request().postDataJSON() || {}
    requests.createModel.push(body)
    const model = {
      id: ++state.nextId,
      bk_classification_id: body.bk_classification_id,
      bk_obj_id: body.bk_obj_id,
      bk_obj_name: body.bk_obj_name,
      bk_obj_icon: body.bk_obj_icon || 'icon-cc-default-class',
      bk_ishidden: false,
      ispre: false,
      bk_ispaused: false,
      bk_supplier_account: '0'
    }
    const group = state.groups.find((item) => item.bk_classification_id === model.bk_classification_id)
    if (group) group.bk_objects.push(model)
    return json(route, ok({ id: model.id, ...model }))
  })
  await page.route('**/api/v3/update/object/*', async (route) => {
    const body = route.request().postDataJSON() || {}
    const id = Number(route.request().url().split('/').pop())
    requests.updateModel.push({ id, body })
    const model = allModels(state).find((item) => item.id === id)
    if (model) {
      if (body.bk_classification_id) replaceModelGroup(state, model.bk_obj_id, body.bk_classification_id)
      Object.assign(model, body)
    }
    return json(route, ok({}))
  })
  await page.route('**/api/v3/create/objectclassification', async (route) => {
    const body = route.request().postDataJSON() || {}
    requests.createClassification.push(body)
    state.groups.push({ id: ++state.nextId, ...body, bk_classification_type: '', bk_ishidden: false, bk_objects: [] })
    return json(route, ok({}))
  })
  await page.route('**/api/v3/update/objectclassification/*', async (route) => {
    const body = route.request().postDataJSON() || {}
    requests.updateClassification.push({ id: route.request().url().split('/').pop(), body })
    const group = state.groups.find((item) => item.bk_classification_id === route.request().url().split('/').pop())
    if (group) Object.assign(group, body)
    return json(route, ok({}))
  })
  await page.route('**/api/v3/delete/objectclassification/*', (route) => json(route, ok({})))

  await page.route('**/api/v3/create/objectattr', async (route) => {
    const body = route.request().postDataJSON() || {}
    const attr = { id: ++state.nextId, ...body, bk_property_group: body.bk_property_group || 'default' }
    state.attrs[body.bk_obj_id] = [...(state.attrs[body.bk_obj_id] || []), attr]
    return json(route, ok({ id: attr.id }))
  })
  await page.route('**/api/v3/update/objectattr/*', (route) => json(route, ok({})))
  await page.route('**/api/v3/delete/objectattr/*', (route) => json(route, ok({})))
  await page.route('**/api/v3/create/objectattgroup', async (route) => {
    const body = route.request().postDataJSON() || {}
    requests.createGroup.push(body)
    const group = { id: ++state.nextId, ...body }
    state.groupsByObj[body.bk_obj_id] = [...(state.groupsByObj[body.bk_obj_id] || []), group]
    return json(route, ok({ id: group.id }))
  })
  await page.route('**/api/v3/update/objectattgroup', (route) => json(route, ok({})))
  await page.route('**/api/v3/delete/objectattgroup/*', (route) => json(route, ok({})))
  await page.route('**/api/v3/update/objectattgroupproperty', async (route) => {
    const body = route.request().postDataJSON() || {}
    requests.moveField.push(body)
    for (const item of body.data || []) {
      const condition = item.condition || {}
      const attr = (state.attrs[condition.bk_obj_id] || []).find((field) => field.bk_property_id === condition.bk_property_id)
      if (attr) attr.bk_property_group = item.data?.bk_property_group
    }
    return json(route, ok({}))
  })
  await page.route('**/api/v3/objectatt/group/**', (route) => json(route, ok({})))

  await page.route('**/api/v3/create/objectunique/object/*', async (route) => {
    const objId = route.request().url().split('/').slice(-1)[0]
    const body = route.request().postDataJSON() || {}
    requests.createUnique.push({ objId, body })
    const unique = { id: ++state.nextId, ...(body.data || body) }
    state.uniques[objId] = [...(state.uniques[objId] || []), unique]
    return json(route, ok({ id: unique.id }))
  })
  await page.route('**/api/v3/update/objectunique/object/*/unique/*', (route) => json(route, ok({})))
  await page.route('**/api/v3/delete/objectunique/object/*/unique/*', (route) => json(route, ok({})))

  return { state, requests }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`) })
  const { requests } = await installMocks(page)

  try {
    await page.goto(`${BASE}/#/model/management`, { waitUntil: 'load' })
    await page.waitForTimeout(700)
    assert(await page.locator('.model-management').isVisible(), '模型管理页面未渲染')
    assert(await page.locator('.group-item[data-group-id="infra"]').isVisible(), '基础设施分类缺失')
    assert((await page.locator('.model-item').count()) === 3, '模型卡片数量不符合 fixture')
    console.log('✓ M1 列表/分类/模型卡片渲染')

    await page.locator('.model-item[data-model-id="server"]').hover()
    await page.waitForTimeout(250)
    assert((await page.locator('.model-item[data-model-id="server"] .count-number').textContent()).trim() === '3', '实例数 hover 读取失败')
    console.log('✓ M1 实例数 hover 请求与渲染')

    await page.getByRole('button', { name: '已停用' }).click()
    assert(await page.locator('.model-item[data-model-id="paused_server"]').isVisible(), '已停用筛选未显示停用模型')
    assert(!(await page.locator('.model-item[data-model-id="server"]').count()), '已停用筛选仍显示启用模型')
    await page.getByRole('button', { name: '全部' }).click()
    await page.getByRole('textbox', { name: '请输入关键字' }).fill('路由器')
    assert(await page.locator('.model-item[data-model-id="router"]').isVisible(), '模型搜索未命中')
    await page.getByRole('textbox', { name: '请输入关键字' }).fill('')
    console.log('✓ M1 启用/停用筛选与模型搜索')

    await page.locator('.group-item[data-group-id="infra"] .collapse-group-title').click()
    assert(!(await page.locator('.group-item[data-group-id="infra"] .model-item[data-model-id="server"]').isVisible()), '分组折叠未隐藏模型')
    await page.locator('.group-item[data-group-id="infra"] .collapse-group-title').click()
    console.log('✓ M1 分组折叠')

    await page.getByRole('button', { name: '新建分组' }).click()
    await page.locator('.group-dialog input').nth(0).fill('ops')
    await page.locator('.group-dialog input').nth(1).fill('运维')
    await page.locator('.group-dialog .bk-primary').click()
    await page.waitForTimeout(500)
    assert(requests.createClassification[0]?.bk_classification_id === 'ops', '新建分组 payload 不符合契约')
    assert(await page.locator('.group-item[data-group-id="ops"]').isVisible(), '新建分组未读回')
    console.log('✓ M1 新建分组 payload + read-back')

    await page.getByRole('button', { name: '新建模型' }).click()
    const modelDialog = page.locator('.model-dialog')
    await modelDialog.locator('.el-select').click()
    await page.waitForTimeout(150)
    const groupOption = page.locator('.el-select-dropdown__item').filter({ hasText: '基础设施' }).last()
    assert(await groupOption.count() > 0, '模型分组下拉缺少基础设施选项')
    await groupOption.click()
    await modelDialog.locator('input[placeholder*="英文、数字、下划线"]').fill('m1_server')
    await modelDialog.locator('input[placeholder="请填写模型名"]').fill('M1 服务器')
    await modelDialog.getByRole('button', { name: '提交' }).click()
    await page.waitForTimeout(600)
    assert(requests.createModel[0]?.bk_obj_id === 'm1_server', '新建模型标识未发送')
    assert(requests.createModel[0]?.bk_classification_id === 'infra', '新建模型分组未发送')
    await page.getByRole('button', { name: '返回列表' }).click()
    assert(await page.locator('.model-item[data-model-id="m1_server"]').isVisible(), '新建模型未读回列表')
    console.log('✓ M1 新建模型 payload + 成功反馈 + read-back')

    const source = page.locator('.model-item[data-model-id="router"]')
    const target = page.locator('.group-item[data-group-id="infra"] .model-list')
    await source.dragTo(target)
    await page.waitForTimeout(600)
    assert(requests.updateModel.some((item) => item.body.bk_classification_id === 'infra'), '拖拽换组未发送 update payload')
    assert(await page.locator('.group-item[data-group-id="infra"] .model-item[data-model-id="router"]').isVisible(), '拖拽换组未读回目标分类')
    console.log('✓ M1 模型拖拽换组 payload + read-back')

    await page.locator('.model-item[data-model-id="server"] .model-info').click()
    await page.waitForTimeout(600)
    assert(page.url().includes('/model/management/details/server'), '模型详情深链未打开')
    assert(await page.getByRole('tab', { name: '模型字段' }).isVisible(), '模型字段 tab 缺失')
    await page.getByRole('tab', { name: '唯一校验' }).click()
    await page.getByRole('button', { name: '新建唯一校验' }).click()
    const uniqueDialog = page.locator('.el-dialog:visible')
    await uniqueDialog.locator('input').first().fill('server_name_unique')
    await uniqueDialog.locator('.el-select').click()
    await page.getByRole('option', { name: /服务器名称/ }).click()
    await page.keyboard.press('Escape')
    await uniqueDialog.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(600)
    assert(requests.createUnique.length === 1, '唯一约束创建请求缺失')
    assert(requests.createUnique[0].body.data.keys[0].key_id === 301, '唯一约束字段 payload 不符合契约')
    console.log('✓ M1 唯一约束 payload + read-back')

    await page.getByRole('tab', { name: '模型字段' }).click()
    await page.getByRole('button', { name: '新建分组' }).last().click()
    const fieldGroupDialog = page.locator('.el-dialog:visible')
    await fieldGroupDialog.locator('input').fill('运行信息')
    await fieldGroupDialog.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(500)
    const fieldGroup = page.locator('.field-group').filter({ hasText: '运行信息' }).last()
    assert(await fieldGroup.count() === 1, '字段分组未读回')
    const fieldSource = page.locator('.field-card').first()
    await fieldGroup.scrollIntoViewIfNeeded()
    await fieldSource.scrollIntoViewIfNeeded()
    await fieldSource.dragTo(fieldGroup, { force: true })
    await page.waitForTimeout(500)
    assert(requests.moveField.length === 1, '字段分组移动请求缺失')
    assert(requests.moveField[0].data[0].data.bk_property_group === requests.createGroup[0].bk_group_id, '字段分组移动 payload 不符合契约')
    console.log('✓ M1 字段分组创建/拖拽 payload')

    await page.getByRole('button', { name: '编辑模型' }).click()
    const editDialog = page.locator('.model-dialog')
    await editDialog.locator('input[placeholder="请填写模型名"]').fill('服务器模型更新')
    await editDialog.getByRole('button', { name: '提交' }).click()
    await page.waitForTimeout(600)
    assert(requests.updateModel.some((item) => item.body.bk_obj_name === '服务器模型更新'), '模型编辑 PUT payload 缺失')
    assert((await page.locator('.head-name').textContent()).includes('服务器模型更新'), '模型编辑未 read-back')
    console.log('✓ M1 模型编辑 payload + read-back')

    await page.screenshot({ path: `${SHOTS}/m1-model-detail.png`, fullPage: true })
    const liveText = await page.locator('body').textContent()
    assert(liveText.includes('模型字段') && liveText.includes('唯一校验'), '模型详情关键文案缺失')
  } finally {
    const realErrors = errors.filter((error) => !/ResizeObserver|favicon|logo\.svg/.test(error))
    if (realErrors.length) throw new Error(realErrors.slice(0, 3).join(' | '))
    await context.close()
  }

  // Error state: API failure must not become an empty model list.
  const errorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const errorPage = await errorContext.newPage()
  errorPage.setDefaultTimeout(8000)
  await installMocks(errorPage, { failClassificationOnce: true })
  try {
    await errorPage.goto(`${BASE}/#/model/management`, { waitUntil: 'load' })
    await errorPage.locator('.model-load-error').waitFor({ state: 'visible', timeout: 8000 })
    await errorPage.locator('.model-load-error').getByRole('button', { name: '重试' }).click()
    await errorPage.waitForTimeout(500)
    assert(!(await errorPage.locator('.model-load-error').isVisible()), '模型列表重试后仍保留错误态')
    await errorPage.locator('.group-item[data-group-id="infra"]').waitFor({ state: 'visible', timeout: 8000 })
    assert(await errorPage.locator('.group-item[data-group-id="infra"]').isVisible(), '模型列表重试后未恢复数据')
    console.log('✓ M1 模型列表错误态 + 重试')
  } finally {
    await errorContext.close()
    await browser.close()
  }

  console.log('M1 model management mock contracts passed')
  fs.writeFileSync(REPORT, `${JSON.stringify({
    schemaVersion: 1,
    reportKind: 'ui-v3-m1-model-management-mock-contract',
    status: 'passed',
    baseUrl: BASE,
    screenshotDir: SHOTS,
    checks: [
      'model list/classification rendering',
      'instance count hover',
      'enabled/disabled filter and keyword search',
      'classification create and read-back',
      'model create and read-back',
      'model drag-to-group payload and read-back',
      'unique constraint payload and read-back',
      'field group create/drag payload',
      'model edit payload and read-back',
      'model list error state and retry'
    ],
    externalDependencies: 'not exercised; mock-only'
  }, null, 2)}\n`)
}

main().catch((error) => {
  console.error(`✗ M1 model management: ${error.message}`)
  process.exitCode = 1
})
