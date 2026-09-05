import http from './http'

// 供个别页面直接调用未封装接口(如主机详情搜索)
export { http }

// ---------- 业务 ----------
// 搜索业务(owner 0;body 里的 condition 支持按 bk_biz_name 过滤)
export const searchBusiness = (page, condition = {}) =>
  http.post('/biz/search/0', { page, condition })

// ---------- 业务拓扑 ----------
// 完整业务拓扑树(自定义集群/模块层级;?with_default 附带空闲机池)
export const getBizTopoTree = (bizId) =>
  http.post(`/find/topoinst_with_statistics/biz/${bizId}?with_default`, {})

// 空闲机池内部拓扑(集群/模块,含主机数统计)
export const getBizInternalTopo = (bizId) =>
  http.get(`/topo/internal/0/${bizId}/with_statistics`)

// 集群 / 模块 CRUD
export const createSet = (bizId, name) =>
  http.post(`/set/${bizId}`, { bk_set_name: name, bk_parent_id: bizId, bk_supplier_account: '0' })
export const deleteSet = (bizId, setId) => http.delete(`/set/${bizId}/${setId}`)
export const updateSet = (bizId, setId, data) => http.put(`/set/${bizId}/${setId}`, data)

export const createModule = (bizId, setId, name) =>
  http.post(`/module/${bizId}/${setId}`, {
    bk_module_name: name, bk_parent_id: setId, bk_supplier_account: '0'
  })
export const deleteModule = (bizId, setId, moduleId) =>
  http.delete(`/module/${bizId}/${setId}/${moduleId}`)
export const updateModule = (bizId, setId, moduleId, data) =>
  http.put(`/module/${bizId}/${setId}/${moduleId}`, data)

// ---------- 服务实例与进程 ----------
export const searchServiceInstances = (bizId, page) =>
  http.post('/findmany/proc/service_instance', { bk_biz_id: bizId, page, with_name: true })
export const deleteServiceInstances = (bizId, ids) =>
  http.post('/deletemany/proc/service_instance', { bk_biz_id: bizId, service_instance_ids: ids })
export const searchProcessInstances = (serviceInstanceId, page) =>
  http.post('/findmany/proc/process_instance', {
    service_instance_id: serviceInstanceId, page
  })

// 模块下未绑定服务实例的主机
export const listHostsWithNoSvcInst = (bizId, moduleId) =>
  http.post('/findmany/proc/host/with_no_service_instance', {
    bk_biz_id: bizId, bk_module_id: moduleId, page: { start: 0, limit: 500 }
  })

// 创建服务实例(不带进程,后续可在实例下添加进程)
export const createServiceInstance = (bizId, moduleId, instances) =>
  http.post('/create/proc/service_instance', { bk_biz_id: bizId, bk_module_id: moduleId, instances })

// 创建进程实例(裸进程,不绑定模板)
export const createProcessInstance = (serviceInstanceId, processInfo) =>
  http.post('/create/proc/process_instance', {
    bk_supplier_account: '0',
    service_instance_id: serviceInstanceId,
    processes: [{ process_info: processInfo }]
  })

// ---------- 主机 ----------
function buildHostBody(page, fields, filter) {
  const body = { page, fields }
  if (filter && filter.rules && filter.rules.length > 0) body.host_property_filter = filter
  return body
}

// 业务下主机列表
export const listBizHosts = (bizId, page, filter) =>
  http.post(`/hosts/app/${bizId}/list_hosts`, buildHostBody(
    page,
    ['bk_host_id', 'bk_host_innerip', 'bk_host_name', 'bk_os_name', 'bk_cloud_id', 'bk_cpu', 'bk_mem', 'bk_disk'],
    filter
  ))

// 无业务归属(资源池)主机列表
export const listHostsWithoutApp = (page, filter) =>
  http.post('/hosts/list_hosts_without_app', buildHostBody(
    page,
    ['bk_host_id', 'bk_host_innerip', 'bk_host_name', 'bk_os_name', 'bk_cloud_id'],
    filter
  ))

// 主机详情(全部属性)
export const searchHostDetail = (condition) =>
  http.post('/host/search', { page: { start: 0, limit: 1 }, condition })

// 主机转移(业务内模块间/资源池进业务)
export const transferHostModule = (bizId, hostIds, moduleIds, isIncrement = false) =>
  http.post('/hosts/modules', {
    bk_biz_id: bizId,
    bk_host_id: hostIds,
    bk_module_id: moduleIds,
    is_increment: isIncrement
  })

// 转移主机至资源池
export const transferHostToResource = (bizId, hostIds) =>
  http.post('/hosts/modules/resource', { bk_biz_id: bizId, bk_host_id: hostIds })

// 跨业务转移
export const transferHostAcrossBiz = (params) =>
  http.post('/hosts/resource/cross/biz', params)
// 转移到空闲机
export const transferHostToIdle = (bizId, hostIds) =>
  http.post('/hosts/modules/resource/idle', { bk_biz_id: bizId, bk_host_id: hostIds })

// 主机详情 + 快照
export const getHostBase = (hostId) => http.get(`/hosts/0/${hostId}`)
export const getHostSnapshot = (hostId) => http.get(`/hosts/snapshot/${hostId}`)
// 复杂条件搜索
export const searchHosts = (data) => http.post('/hosts/search', data)
// 主机实例关联查询
export const getHostInstTopo = (hostId, data) =>
  http.post(`/find/instassttopo/host/${hostId}`, data)
export const searchHostInstAssoc = (data) =>
  http.post('/findmany/inst/association', data)
// 主机收藏
export const listHostFavorites = (data) => http.post('/hosts/favorites/search', data)
export const createHostFavorite = (data) => http.post('/hosts/favorites', data)
export const updateHostFavorite = (id, data) => http.put(`/hosts/favorites/${id}`, data)
export const deleteHostFavorite = (id) => http.delete(`/hosts/favorites/${id}`)
export const incrHostFavorite = (id) => http.put(`/hosts/favorites/${id}/incr`)

// 资源目录 CRUD
export const listResourceDirectory = (data) =>
  http.post('/findmany/resource/directory', data || {})
export const createResourceDirectory = (data) =>
  http.post('/create/resource/directory', data)
export const updateResourceDirectory = (moduleId, data) =>
  http.put(`/update/resource/directory/${moduleId}`, data)
export const deleteResourceDirectory = (moduleId) =>
  http.delete(`/delete/resource/directory/${moduleId}`)
export const transferHostsToDirectory = (data) =>
  http.post('/host/transfer/resource/directory', data)
// 主机属性更新
export const updateHostProperties = (hostId, bizId, data) =>
  http.post(`/table/update/instance/object/host/bk_biz_id/${bizId || 0}/inst/${hostId}`, data)

// ---------- 资源池主机列表 ----------
export const searchHostsResource = (data) =>
  http.post('/findmany/hosts/search/resource', data)
export const listHostsInIdle = (bizId, data) =>
  http.post(`/hosts/app/${bizId}/list_hosts`, data)

// 批量导入主机(走 multipart/form-data,file + params)
export const importHosts = (file, params) => {
  const form = new FormData()
  form.append('file', file)
  form.append('params', JSON.stringify(params))
  return http.post('/hosts/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  })
}

// ---------- 主机自动应用(host-apply) ----------
// 模块模式规则查询
export const searchHostApplyRules = (bizId, data) =>
  http.post(`/findmany/host_apply_rule/bk_biz_id/${bizId}`, data)
// 模板模式规则查询
export const searchHostApplyTemplateRules = (data) =>
  http.post('/host/findmany/service_template/host_apply_rule', data)
// 主机相关规则
export const searchHostRelatedRules = (bizId, data) =>
  http.post(`/findmany/host_apply_rule/bk_biz_id/${bizId}/host_related_rules`, data)
// 应用预览(模块)
export const previewHostApplyModule = (data) =>
  http.post('/host/createmany/module/host_apply_plan/preview', data)
// 应用预览(模板)
export const previewHostApplyTemplate = (data) =>
  http.post('/host/createmany/service_template/host_apply_plan/preview', data)
// 执行应用(模块)
export const runHostApplyModule = (data) =>
  http.post('/host/updatemany/module/host_apply_plan/run', data)
// 执行应用(模板)
export const runHostApplyTemplate = (data) =>
  http.post('/updatemany/proc/service_template/host_apply_plan/run', data)
// 任务状态(模块)
export const getHostApplyModuleStatus = (data) =>
  http.post('/host/findmany/module/host_apply_plan/status', data)
// 任务状态(模板)
export const getHostApplyTemplateStatus = (data) =>
  http.post('/findmany/proc/service_template/host_apply_plan/status', data)
// 启用/禁用自动应用(模块)
export const setHostApplyModuleEnabled = (bizId, data) =>
  http.put(`/module/host_apply_enable_status/bk_biz_id/${bizId}`, data)
// 启用/禁用自动应用(模板)
export const setHostApplyTemplateEnabled = (bizId, data) =>
  http.put(`/updatemany/proc/service_template/host_apply_enable_status/biz/${bizId}`, data)
// 未应用主机数
export const getInvalidHostCount = (bizId, data) =>
  http.post('/host/findmany/module/host_apply_plan/invalid_host_count', data)
// 删除规则(模块)
export const deleteHostApplyModuleRules = (bizId, data) =>
  http.delete(`/host/deletemany/module/host_apply_rule/bk_biz_id/${bizId}`, { data })
// 删除规则(模板)
export const deleteHostApplyTemplateRules = (bizId, data) =>
  http.delete(`/deletemany/proc/service_template/host_apply_rule/biz/${bizId}`, { data })
// 节点查询(规则关联)— 拓扑 / 模板
export const searchHostApplyRelatedTopo = (bizId, data) =>
  http.post(`/find/topoinst/bk_biz_id/${bizId}/host_apply_rule_related`, data)
export const searchHostApplyRelatedTemplate = (data) =>
  http.post('/find/proc/service_template/host_apply_rule_related', data)
// 拓扑路径(节点名 → 路径)
export const getTopoPath = (bizId, data) =>
  http.post(`/find/topopath/biz/${bizId}`, data)
// 模块最终规则(模板+模块合并)
export const getModuleFinalRules = (data) =>
  http.post('/host/findmany/module/get_module_final_rules', data)

// ---------- 云区域 / 云账户 ----------
// 独立模式只读云区域,后端 findmany/cloudarea 返回所有区域
export const searchCloudAreas = (page) =>
  http.post('/findmany/cloudarea', { page })
export const createCloudArea = (info) =>
  http.post('/createmany/cloudarea', { info: [info] })
export const updateCloudArea = (id, info) =>
  http.put(`/update/cloudarea/${id}`, info)
export const deleteCloudArea = (id) =>
  http.delete(`/delete/cloudarea/${id}`)
export const searchCloudAccounts = (page) =>
  http.post('/findmany/cloud/account', { page })
export const listCloudSyncTask = (data) =>
  http.post('/findmany/cloud/sync/task', data)
export const createCloudAccount = (params) =>
  http.post('/create/cloud/account', params)

// ---------- 模型 ----------
// 全量模型列表
export const searchModels = (condition = {}) =>
  http.post('/find/object', condition)

// 分类 + 模型(分类分组展示用)
export const searchClassificationWithObjects = () =>
  http.post('/find/classificationobject', {})

// 模型属性列表
export const searchModelAttributes = (objId) =>
  http.post('/find/objectattr', { bk_obj_id: objId, bk_supplier_account: '0' })

// 模型实例统计(仪表盘)
export const getModelStatistics = () =>
  http.get('/object/statistics')

// 模型 CRUD
export const createModel = (data) => http.post('/create/object', {
  bk_supplier_account: '0',
  bk_obj_icon: 'icon-cc-default-class',
  ...data
})
export const updateModel = (id, data) => http.put(`/update/object/${id}`, data)
export const deleteModel = (id) => http.delete(`/delete/object/${id}`)

// 模型分类
export const searchClassifications = () => http.post('/find/objectclassification', {})
export const createClassification = (data) => http.post('/create/objectclassification', {
  bk_supplier_account: '0', ...data
})
export const deleteClassification = (id) => http.delete(`/delete/objectclassification/${id}`)

// 模型属性 CRUD
export const createModelAttribute = (data) => http.post('/create/objectattr', {
  bk_supplier_account: '0', ...data
})
export const updateModelAttribute = (id, data) =>
  http.put(`/update/objectattr/${id}`, { bk_supplier_account: '0', ...data })
export const deleteModelAttribute = (id) => http.delete(`/delete/objectattr/${id}`)
// 属性排序
export const updateAttributeSort = (objId, propId, data) =>
  http.post(`/update/objectattr/index/${objId}/${propId}`, data)

// ---------- 字段分组 ----------
export const searchFieldGroups = (objId, data) =>
  http.post(`/find/objectattgroup/object/${objId}`, data || {})
export const createFieldGroup = (data) =>
  http.post('/create/objectattgroup', data)
export const updateFieldGroup = (data) =>
  http.put('/update/objectattgroup', data)
export const deleteFieldGroup = (id) =>
  http.delete(`/delete/objectattgroup/${id}`)
// 交换分组顺序
export const switchFieldGroupIndex = (data) =>
  http.put('/update/objectattgroup/groupindex', data)
// 移动字段到分组
export const moveAttributeToGroup = (data) =>
  http.put('/objectatt/group/property', data)
export const deleteAttributeGroupAssoc = (objId, propId, groupId) =>
  http.delete(`/delete/objectattgroupasst/object/${objId}/property/${propId}/group/${groupId}`)

// ---------- 唯一约束 ----------
export const searchUniques = (objId, data) =>
  http.post(`/find/objectunique/object/${objId}`, data || {})
export const createUnique = (objId, data) =>
  http.post(`/create/objectunique/object/${objId}`, data)
export const updateUnique = (objId, id, data) =>
  http.put(`/update/objectunique/object/${objId}/unique/${id}`, data)
export const deleteUnique = (objId, id) =>
  http.post(`/delete/objectunique/object/${objId}/unique/${id}`, {})

// ---------- 关联类型 ----------
export const searchAssociationTypes = () =>
  http.post('/find/associationtype', { condition: {}, page: { start: 0, limit: 100 } })
export const createAssociationType = (data) =>
  http.post('/create/associationtype', { ...data })
export const updateAssociationType = (id, data) =>
  http.put(`/update/associationtype/${id}`, { ...data })
export const deleteAssociationType = (id) =>
  http.delete(`/delete/associationtype/${id}`)

// ---------- 集群模板 ----------
export const searchSetTemplates = (bizId, page) =>
  http.post(`/findmany/topo/set_template/bk_biz_id/${bizId}/web`, { page })
export const getSetTemplateDetail = (bizId, templateId) =>
  http.get(`/find/topo/set_template/${templateId}/bk_biz_id/${bizId}`)
export const createSetTemplate = (bizId, data) =>
  http.post(`/create/topo/set_template/bk_biz_id/${bizId}`, data)
export const updateSetTemplate = (bizId, templateId, data) =>
  http.put(`/update/topo/set_template/${templateId}/bk_biz_id/${bizId}`, data)
export const deleteSetTemplates = (bizId) =>
  http.post(`/deletemany/topo/set_template/bk_biz_id/${bizId}`, { data: { ids: [bizId] } })
export const getSetTemplateServices = (bizId, templateId) =>
  http.get(`/findmany/topo/set_template/${templateId}/bk_biz_id/${bizId}/service_templates`)
export const searchSetTemplateStatus = (bizId, data) =>
  http.post(`/findmany/topo/set_template/bk_biz_id/${bizId}/set_template_status`, data)
export const searchSetTemplateSyncHistory = (bizId, data) =>
  http.post(`/findmany/topo/set_template_sync_history/bk_biz_id/${bizId}`, data)
export const syncSetTemplateToInstances = (bizId, templateId, data) =>
  http.post(`/updatemany/topo/set_template/${templateId}/bk_biz_id/${bizId}/sync_to_instances`, data)

// ---------- 业务集 ----------
export const searchBusinessSetTopology = (bizSetId, data) =>
  http.post(`/find/topoinst/bk_biz_id/${bizSetId}`, data)

// ---------- 字段组合模板 ----------
export const searchFieldTemplates = (data) =>
  http.post('/findmany/field_template', data)
export const getFieldTemplate = (id) =>
  http.get(`/find/field_template/${id}`)
export const createFieldTemplate = (data) =>
  http.post('/create/field_template', data)
export const updateFieldTemplate = (id, data) =>
  http.put(`/update/field_template/${id}`, data)
export const deleteFieldTemplate = (id) =>
  http.delete(`/delete/field_template/${id}`)

// ---------- 服务模板 ----------
export const searchServiceTemplates = (bizId, page) =>
  http.post('/findmany/proc/service_template', { bk_biz_id: bizId, page })
export const getServiceTemplateDetail = (templateId) =>
  http.get(`/find/proc/service_template/${templateId}/detail`)

// 服务分类(含使用统计)
export const searchServiceCategories = (bizId) =>
  http.post('/findmany/proc/service_category/with_statistics', { bk_biz_id: bizId })
export const createServiceCategory = (bizId, name, parentId) =>
  http.post('/create/proc/service_category', { bk_biz_id: bizId, name, parent_id: parentId })

// ---------- 动态分组 ----------
export const searchDynamicGroups = (bizId, page) =>
  http.post(`/dynamicgroup/search/${bizId}`, { page })
export const deleteDynamicGroup = (bizId, id) =>
  http.delete(`/dynamicgroup/${bizId}/${id}`)
export const executeDynamicGroup = (bizId, id, page) =>
  http.post(`/dynamicgroup/data/${bizId}/${id}`, { page })

// ---------- 操作审计 ----------
export const getAuditDict = () => http.get('/find/audit_dict')
export const searchAuditList = (condition, page) =>
  http.post('/findmany/audit_list', { condition, page })
export const searchAuditDetail = (id) =>
  http.post('/find/audit', { condition: { audit_id: id } })

// ---------- 运营统计 ----------
export const getOperationCharts = () => http.get('/findmany/operation/chart')
export const getOperationChartData = (config) =>
  http.post('/find/operation/chart/data', config)
export const createOperationChart = (data) =>
  http.post('/create/operation/chart', data)
export const updateOperationChart = (data) =>
  http.post('/update/operation/chart', data)
export const deleteOperationChart = (id) =>
  http.delete(`/delete/operation/chart/${id}`)
export const updateOperationChartPosition = (data) =>
  http.post('/update/operation/chart/position', data)

// ---------- 进程模板 CRUD ----------
export const searchProcTemplates = (bizId, data) =>
  http.post('/findmany/proc/proc_template', { bk_biz_id: bizId, ...(data || {}) })
export const createProcTemplate = (bizId, data) =>
  http.post(`/create/proc/proc_template/bk_biz_id/${bizId}`, data)
export const updateProcTemplate = (bizId, id, data) =>
  http.put(`/update/proc/proc_template/bk_biz_id/${bizId}/id/${id}`, data)
export const deleteProcTemplate = (bizId, id) =>
  http.delete(`/delete/proc/proc_template/bk_biz_id/${bizId}/id/${id}`)
