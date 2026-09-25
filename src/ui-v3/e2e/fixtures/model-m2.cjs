function ok(data) {
  return { result: true, bk_error_code: 0, bk_error_msg: 'success', data }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function json(route, payload, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
}

function makeM2State() {
  return {
    groups: [
      { id: 1, bk_classification_id: 'main', bk_classification_name: '主线模型', bk_ishidden: false, bk_objects: [] },
      { id: 2, bk_classification_id: 'custom', bk_classification_name: '自定义模型', bk_ishidden: false, bk_objects: [] }
    ],
    models: [
      { id: 1, bk_obj_id: 'biz', bk_obj_name: '业务', bk_obj_icon: 'icon-cc-business', bk_classification_id: 'main', ispre: true, bk_ispaused: false, bk_ishidden: false },
      { id: 2, bk_obj_id: 'host', bk_obj_name: '主机', bk_obj_icon: 'icon-cc-host', bk_classification_id: 'main', ispre: true, bk_ispaused: false, bk_ishidden: false },
      { id: 3, bk_obj_id: 'server', bk_obj_name: '服务器', bk_obj_icon: 'icon-cc-host', bk_classification_id: 'custom', ispre: false, bk_ispaused: false, bk_ishidden: false },
      { id: 4, bk_obj_id: 'router', bk_obj_name: '路由器', bk_obj_icon: 'icon-cc-router', bk_classification_id: 'custom', ispre: false, bk_ispaused: false, bk_ishidden: false }
    ],
    topology: [
      { node_type: 'obj', bk_obj_id: 'biz', bk_inst_id: 0, position: { x: 500, y: 80 } },
      { node_type: 'obj', bk_obj_id: 'host', bk_inst_id: 0, position: { x: 500, y: 260 } },
      { node_type: 'obj', bk_obj_id: 'server', bk_inst_id: 0, position: { x: 820, y: 120 } },
      { node_type: 'obj', bk_obj_id: 'router', bk_inst_id: 0, position: { x: 820, y: 300 } }
    ],
    relationTypes: [
      { id: 11, bk_asst_id: 'connects', bk_asst_name: '连接', src_des: '连接', dest_des: '被连接', direction: 'bidirectional', ispre: false },
      { id: 12, bk_asst_id: 'bk_mainline', bk_asst_name: '主线', src_des: '组成', dest_des: '被组成', direction: 'src_to_dest', ispre: true }
    ],
    associations: [
      { id: 21, bk_obj_id: 'server', bk_asst_obj_id: 'router', bk_asst_id: 'connects', bk_obj_asst_id: 'server_connects_router', mapping: 'n:n', bk_obj_asst_name: '服务器连接路由器', ispre: false }
    ],
    attrs: {
      server: [{ id: 101, bk_obj_id: 'server', bk_property_id: 'server_name', bk_property_name: '服务器名称', bk_property_type: 'singlechar', bk_property_group: 'default' }]
    },
    instances: {
      server: [{ bk_inst_id: 1001, bk_inst_name: '服务器 A', server_name: '服务器 A' }, { bk_inst_id: 1002, bk_inst_name: '服务器 B', server_name: '服务器 B' }],
      router: [{ bk_inst_id: 2001, bk_inst_name: '路由器 A' }, { bk_inst_id: 2002, bk_inst_name: '路由器 B' }]
    },
    instanceAssociations: [
      { id: 31, bk_obj_id: 'server', bk_inst_id: 1001, bk_asst_obj_id: 'router', bk_asst_inst_id: 2001, bk_asst_id: 'connects' },
      { id: 32, bk_obj_id: 'router', bk_inst_id: 2001, bk_asst_obj_id: 'server', bk_asst_inst_id: 1002, bk_asst_id: 'connects' }
    ],
    nextId: 100
  }
}

function modelGroups(state) {
  return state.groups.map((group) => ({ ...group, bk_objects: state.models.filter((model) => model.bk_classification_id === group.bk_classification_id) }))
}

function modelById(state, id) {
  return state.models.find((model) => model.bk_obj_id === id)
}

async function installCommon(page, state, records, options = {}) {
  let failTopology = Boolean(options.failTopology)
  let failAssocTypes = Boolean(options.failAssocTypes)
  await page.addInitScript(() => {
    localStorage.removeItem('bk-cmdb-topology-positions-v2')
    localStorage.setItem('selectedBusiness', '2')
  })
  await page.route('**/*', (route) => route.continue({ headers: { ...route.request().headers(), 'Cache-Control': 'no-cache' } }))
  await page.route('**/userinfo', (route) => json(route, ok({ username: 'mock-user', chname: 'Mock User', current_supplier: '0' })))
  await page.route('**/api/v3/biz/search/0', (route) => json(route, ok({ count: 1, info: [{ bk_biz_id: 2, bk_biz_name: 'Mock Biz' }] })))
  await page.route('**/api/v3/findmany/biz_set', (route) => json(route, ok({ count: 0, info: [] })))
  await page.route('**/api/v3/usercustom/user/search', (route) => json(route, ok({})))
  await page.route('**/api/v3/usercustom', async (route) => {
    records.usercustom.push(route.request().postDataJSON() || {})
    return json(route, ok({}))
  })
  await page.route('**/api/v3/find/object', (route) => json(route, ok(clone(state.models))))
  await page.route('**/api/v3/find/classificationobject', (route) => json(route, ok(clone(modelGroups(state)))))
  await page.route('**/api/v3/find/objectclassification', (route) => json(route, ok(clone(state.groups).map(({ bk_objects, ...group }) => group))))
  await page.route('**/api/v3/find/objecttopo/scope_type/global/scope_id/0', (route) => {
    if (failTopology) {
      failTopology = false
      return json(route, { result: false, bk_error_code: 500, bk_error_msg: '拓扑服务不可用' }, 500)
    }
    return json(route, ok(clone(state.topology)))
  })
  await page.route('**/api/v3/update/objecttopo/scope_type/global/scope_id/0', async (route) => {
    const body = route.request().postDataJSON() || {}
    records.topologyUpdates.push(body)
    for (const item of body.origin || []) {
      const existing = state.topology.find((node) => node.bk_obj_id === item.bk_obj_id)
      if (existing) existing.position = item.position
      else state.topology.push(item)
    }
    return json(route, ok(null))
  })
  await page.route('**/api/v3/find/associationtype', async (route) => {
    if (failAssocTypes) {
      failAssocTypes = false
      return json(route, { result: false, bk_error_code: 500, bk_error_msg: '关联类型服务不可用' }, 500)
    }
    const body = route.request().postDataJSON() || {}
    records.assocTypeQueries.push(body)
    const id = body.condition?.id
    const rows = id ? state.relationTypes.filter((item) => item.id === id) : state.relationTypes
    return json(route, ok({ count: rows.length, info: clone(rows) }))
  })
  await page.route('**/api/v3/count/topoassociationtype', async (route) => {
    const body = route.request().postDataJSON() || {}
    records.assocTypeCounts.push(body)
    return json(route, ok({ associations: (body.asst_ids || []).map((bk_asst_id) => ({ bk_asst_id, count: state.associations.filter((item) => item.bk_asst_id === bk_asst_id).length })) }))
  })
  await page.route('**/api/v3/create/associationtype', async (route) => {
    const body = route.request().postDataJSON() || {}
    records.assocTypeCreates.push(body)
    const row = { id: ++state.nextId, ispre: false, ...body }
    state.relationTypes.push(row)
    return json(route, ok({ id: row.id }))
  })
  await page.route('**/api/v3/update/associationtype/*', async (route) => {
    const body = route.request().postDataJSON() || {}
    const id = Number(route.request().url().split('/').pop())
    records.assocTypeUpdates.push({ id, body })
    Object.assign(state.relationTypes.find((row) => row.id === id) || {}, body)
    return json(route, ok({}))
  })
  await page.route('**/api/v3/delete/associationtype/*', async (route) => {
    const id = Number(route.request().url().split('/').pop())
    records.assocTypeDeletes.push(id)
    state.relationTypes = state.relationTypes.filter((row) => row.id !== id)
    return json(route, ok({}))
  })
  await page.route('**/api/v3/find/objectattr', (route) => {
    const body = route.request().postDataJSON() || {}
    return json(route, ok(clone(state.attrs[body.bk_obj_id] || [])))
  })
  await page.route('**/api/v3/find/objectattgroup/object/*', (route) => json(route, ok([])))
  await page.route('**/api/v3/find/objectunique/object/*', (route) => json(route, ok([])))
  await page.route('**/api/v3/object/statistics', (route) => json(route, ok([])))
  await page.route('**/api/v3/search/instances/object/*', async (route) => {
    const objId = route.request().url().split('/').pop()
    const body = route.request().postDataJSON() || {}
    records.instanceListQueries.push({ objId, body })
    const rows = state.instances[objId] || []
    return json(route, ok({ count: rows.length, info: clone(rows) }))
  })
  await page.route('**/api/v3/count/instances/object/*', async (route) => {
    const objId = route.request().url().split('/').pop()
    return json(route, ok({ count: (state.instances[objId] || []).length }))
  })

  await page.route('**/api/v3/find/objectassociation', async (route) => {
    const body = route.request().postDataJSON() || {}
    records.assocQueries.push(body)
    const id = body.condition?.id
    const directSource = body.condition?.bk_obj_id
    const directTarget = body.condition?.bk_asst_obj_id
    const rows = id
      ? state.associations.filter((item) => item.id === id)
      : directSource
        ? state.associations.filter((item) => item.bk_obj_id === directSource)
        : directTarget
          ? state.associations.filter((item) => item.bk_asst_obj_id === directTarget)
          : state.associations.filter((item) => {
      const ors = body.condition?.$or || []
      return !ors.length || ors.some((cond) => cond.bk_obj_id?.$in?.includes(item.bk_obj_id) || cond.bk_asst_obj_id?.$in?.includes(item.bk_asst_obj_id) || cond.bk_obj_id === item.bk_obj_id || cond.bk_asst_obj_id === item.bk_asst_obj_id)
    })
    return json(route, ok({ count: rows.length, info: clone(rows) }))
  })
  await page.route('**/api/v3/create/objectassociation', async (route) => {
    const body = route.request().postDataJSON() || {}
    records.assocCreates.push(body)
    const row = { id: ++state.nextId, ...body, ispre: false }
    state.associations.push(row)
    return json(route, ok({ id: row.id }))
  })
  await page.route('**/api/v3/update/objectassociation/*', async (route) => {
    const body = route.request().postDataJSON() || {}
    const id = Number(route.request().url().split('/').pop())
    records.assocUpdates.push({ id, body })
    Object.assign(state.associations.find((row) => row.id === id) || {}, body)
    return json(route, ok({}))
  })
  await page.route('**/api/v3/delete/objectassociation/*', async (route) => {
    const id = Number(route.request().url().split('/').pop())
    records.assocDeletes.push(id)
    state.associations = state.associations.filter((row) => row.id !== id)
    return json(route, ok({}))
  })
}

function installInstanceRoutes(page, state, records) {
  page.route('**/api/v3/search/instances/object/*', async (route) => {
    const objId = route.request().url().split('/').pop()
    const body = route.request().postDataJSON() || {}
    records.targetQueries.push({ objId, body })
    return json(route, ok({ count: (state.instances[objId] || []).length, info: clone(state.instances[objId] || []) }))
  })
  page.route('**/api/v3/findmany/inst/association/object/*/inst_id/*/offset/*/limit/*/web', async (route) => {
    const url = route.request().url()
    const objId = url.match(/object\/([^/]+)/)?.[1]
    const instId = Number(url.match(/inst_id\/(\d+)/)?.[1])
    records.instanceQueries.push({ objId, instId })
    const src = state.instanceAssociations.filter((row) => row.bk_obj_id === objId && row.bk_inst_id === instId)
    const dst = state.instanceAssociations.filter((row) => row.bk_asst_obj_id === objId && row.bk_asst_inst_id === instId)
    const allObjs = [...new Set([...src.map((row) => row.bk_asst_obj_id), ...dst.map((row) => row.bk_obj_id)])]
    const instance = Object.fromEntries(allObjs.map((id) => [id, clone(state.instances[id] || [])]))
    return json(route, ok({ count: src.length + dst.length, association: { src, dst }, instance }))
  })
  page.route('**/api/v3/create/instassociation', async (route) => {
    const body = route.request().postDataJSON() || {}
    records.instanceCreates.push(body)
    state.instanceAssociations.push({ id: ++state.nextId, bk_obj_id: 'server', bk_asst_obj_id: 'router', bk_asst_id: 'connects', ...body })
    return json(route, ok({ id: state.nextId }))
  })
  page.route('**/api/v3/delete/instassociation/*/*', async (route) => {
    const id = Number(route.request().url().split('/').pop())
    records.instanceDeletes.push(id)
    state.instanceAssociations = state.instanceAssociations.filter((row) => row.id !== id)
    return json(route, ok({}))
  })
}

module.exports = { clone, json, makeM2State, modelGroups, modelById, installCommon, installInstanceRoutes, ok }
