import http from './http'

// 供个别页面直接调用未封装接口(如主机详情搜索)
export { http }

// ---------- 业务 ----------
// 搜索业务(owner 0;body 里的 condition 支持按 bk_biz_name 过滤)
export const searchBusiness = (page, condition = {}) =>
  http.post('/biz/search/0', { page, condition })

// ---------- 业务 ----------
// 按业务 ID 精确查询(带 condition)
export const searchBusinessById = (bizId) =>
  http.post('/biz/search/0', { page: { start: 0, limit: 1 }, condition: { bk_biz_id: bizId } })
// 新建业务(web_server table 入口,自动补默认字段;根路径,不在 /api/v3 下)
export const createBusiness = (params) => http.post('/table/biz/0', params, { baseURL: '' })
// 编辑业务
export const updateBusiness = (bizId, params) => http.put(`/biz/0/${bizId}`, params)
// 归档(disabled)/恢复(enable)
export const archiveBusiness = (bizId) => http.put(`/biz/status/disabled/0/${bizId}`)
export const recoverBusiness = (bizId, params = {}) => http.put(`/biz/status/enable/0/${bizId}`, params)
// 彻底删除已归档业务
export const deleteArchivedBiz = (bizIds) => http.post('/deletemany/biz', { bk_biz_id: bizIds })

// ---------- 业务拓扑 ----------
// 完整业务拓扑树(自定义集群/模块层级;?with_default 附带空闲机池)
export const getBizTopoTree = (bizId) =>
  http.post(`/find/topoinst_with_statistics/biz/${bizId}?with_default`, {})

// 空闲机池内部拓扑(集群/模块,含主机数统计)
export const getBizInternalTopo = (bizId) =>
  http.get(`/topo/internal/0/${bizId}/with_statistics`)

// 按服务模板查询已绑定的业务模块
export const listModulesByServiceTemplate = (bizId, serviceTemplateId, page = { start: 0, limit: 200 }) =>
  http.post(`/module/bk_biz_id/${bizId}/service_template_id/${serviceTemplateId}`, { page })

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
  http.delete('/deletemany/proc/service_instance', {
    data: { bk_biz_id: bizId, service_instance_ids: ids }
  })
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
export const updateProcessInstance = (bizId, processIds, updateData) =>
  http.put('/update/proc/process_instance/by_ids', {
    bk_biz_id: bizId,
    process_ids: processIds,
    update_data: updateData
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
// 业务内主机跨业务转移(删除原业务模块关系)
export const transferBizHostAcrossBiz = (srcBizId, dstBizId, hostIds, moduleId) =>
  http.post('/hosts/modules/across/biz', {
    src_bk_biz_id: srcBizId,
    dst_bk_biz_id: dstBizId,
    bk_host_id: hostIds,
    bk_module_id: moduleId
  })
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
// 实例关联(老版契约: 按 obj_id/inst_id 分页查询关联关系及对端实例)
export const searchInstAssociations = (objId, instId, start = 0, limit = 50) =>
  http.post(`/findmany/inst/association/object/${objId}/inst_id/${instId}/offset/${start}/limit/${limit}/web`, {})
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
// 主机属性更新(table 路由挂在根路径,不在 /api/v3 下)
export const updateHostProperties = (hostId, bizId, data) =>
  http.post(`/table/update/instance/object/host/bk_biz_id/${bizId || 0}/inst/${hostId}`, data, { baseURL: '' })

// ---------- 资源池主机列表 ----------
export const searchHostsResource = (data) =>
  http.post('/findmany/hosts/search/resource', data)
export const listHostsInIdle = (bizId, data) =>
  http.post(`/hosts/app/${bizId}/list_hosts`, data)

// 主机 Excel 导入(新增): multipart file + params {bk_module_id,op};根路径
export const importHosts = (file, params) => {
  const form = new FormData()
  form.append('file', file)
  form.append('params', JSON.stringify(params))
  return http.post('/hosts/import', form, {
    baseURL: '',
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  })
}
// 主机 Excel 导入编辑: multipart file + params {bk_biz_id,op};根路径
export const updateHostsByExcel = (file, params) => {
  const form = new FormData()
  form.append('file', file)
  form.append('params', JSON.stringify(params))
  return http.post('/hosts/update', form, {
    baseURL: '',
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  })
}

// 删除资源池主机(契约: DeleteHostBatchOpt 顶层 {bk_host_id:"1,2",bk_supplier_account:"0"},不要 data 包装)
export const deleteHostsBatch = (hostIds) =>
  http.delete('/hosts/batch', {
    data: { bk_host_id: hostIds.join(','), bk_supplier_account: '0' }
  })

// 下载主机导入模板(web_server 生成真实 xlsx;根路径)
export const downloadHostTemplate = async () => {
  const res = await http.post('/importtemplate/host', {}, {
    baseURL: '',
    responseType: 'blob',
    timeout: 60000
  })
  const url = URL.createObjectURL(res)
  const a = document.createElement('a')
  a.href = url
  a.download = 'bk_cmdb_host_template.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

// 导出主机(web_server 生成真实 xlsx;根路径)
export const exportHosts = async (hostIds, customFields = []) => {
  const res = await http.post('/hosts/export', {
    export_custom_fields: customFields,
    bk_host_ids: hostIds,
    export_condition: { page: { start: 0, limit: Math.max(hostIds.length, 500) } }
  }, {
    baseURL: '',
    responseType: 'blob',
    timeout: 120000
  })
  const url = URL.createObjectURL(res)
  const a = document.createElement('a')
  a.href = url
  a.download = `bk_cmdb_host_${Date.now()}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
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
  http.post('/host/findmany/module/host_apply_plan/invalid_host_count', { bk_biz_id: bizId, ...data })
// 未应用主机数(服务模板)
export const getInvalidTemplateHostCount = (bizId, data) =>
  http.post('/host/findmany/service_template/host_apply_plan/invalid_host_count', { bk_biz_id: bizId, ...data })
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

// ---------- 主机转移(老版 host-operation 页契约) ----------
// 预览变更:响应为逐主机数组(to_add_to_modules/to_remove_from_modules/host_apply_plan)
export const transferPreview = (bizId, data) =>
  http.post(`/host/transfer_with_auto_clear_service_instance/bk_biz_id/${bizId}/preview`, data)
// 执行转移:可带 options.service_instance_options / options.host_apply_trans_rule
export const transferExecute = (bizId, data) =>
  http.post(`/host/transfer_with_auto_clear_service_instance/bk_biz_id/${bizId}`, data)

// ---------- 云区域 / 云账户 ----------
// 契约对齐老版:page+condition(+is_fuzzy),host_count/sync_task_ids 由服务端合并返回
export const searchCloudAreas = (params) =>
  http.post('/findmany/cloudarea', params)
// 批量建管控区域(老版任务表单契约:{data:[...]},响应按行返回 bk_cloud_id/err_msg)
export const batchCreateCloudArea = (areas) =>
  http.post('/createmany/cloudarea', { data: areas })
export const createCloudArea = (info) =>
  http.post('/createmany/cloudarea', { data: [info] })
export const updateCloudArea = (id, info) =>
  http.put(`/update/cloudarea/${id}`, info)
export const deleteCloudArea = (id) =>
  http.delete(`/delete/cloudarea/${id}`)
// 区域主机计数(老版契约:搜索接口不返回 host_count,需单独按批拉取合并)
export const searchCloudAreaHostCount = (ids) =>
  http.post('/findmany/cloudarea/hostcount', { bk_cloud_ids: ids })
export const searchCloudAccounts = (params) =>
  http.post('/findmany/cloud/account', params)
// 账户连通性状态(老版状态列契约:err_msg 非空即异常)
export const searchCloudAccountValidity = (accountIds) =>
  http.post('/findmany/cloud/account/validity', { account_ids: accountIds })
// 连通测试(老版账户表单 Key 旁按钮)
export const verifyCloudAccount = (data) =>
  http.post('/cloud/account/verify', data)
export const deleteCloudAccount = (id) =>
  http.delete(`/delete/cloud/account/${id}`)
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

// 模型属性列表(bizId 传业务 ID 时查询业务维度自定义字段)
export const searchModelAttributes = (objId, bizId = null) =>
  http.post('/find/objectattr', { bk_obj_id: objId, bk_supplier_account: '0', ...(bizId ? { bk_biz_id: bizId } : {}) })

// 业务集模型属性(老版契约:属性挂在 bk_biz_set_obj 下,走 web 路由;普通 /find/objectattr 查 biz_set 返回空)
export const searchBizSetAttributes = () =>
  http.post('/find/objectattr/web', { bk_obj_id: 'bk_biz_set_obj', bk_supplier_account: '0' })

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
export const updateClassification = (id, data) => http.put(`/update/objectclassification/${id}`, data)
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
export const searchObjectAttributeGroups = (objId) =>
  http.post('/find/objectattributeparent', { bk_obj_id: objId, bk_supplier_account: '0' })
export const createObjectAttributeGroup = (objId, data) =>
  http.post('/create/objectattributeparent', { bk_obj_id: objId, bk_supplier_account: '0', ...data })
export const updateObjectAttributeGroup = (objId, id, data) =>
  http.put(`/update/objectattributeparent/${id}`, { bk_obj_id: objId, bk_supplier_account: '0', ...data })
export const deleteObjectAttributeGroup = (objId, id) =>
  http.delete(`/delete/objectattributeparent/${id}`)
export const searchFieldGroups = (objId, data) =>
  http.post(`/find/objectattgroup/object/${objId}`, data || {})
export const createFieldGroup = (data) =>
  http.post('/create/objectattgroup', data)
export const updateFieldGroup = (objId, id, name) =>
  http.put('/update/objectattgroup', {
    bk_obj_id: objId,
    condition: { id },
    data: { bk_group_name: name }
  })
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
export const searchAssociationTypes = (data = {}) =>
  http.post('/find/associationtype', data)
export const countAssociationTypes = (asstIds) =>
  http.post('/count/topoassociationtype', { asst_ids: asstIds })
export const getAssociationType = (id) =>
  http.post('/find/associationtype', { condition: { id }, page: { start: 0, limit: 1 } })
export const createAssociationType = (data) =>
  http.post('/create/associationtype', { ...data })
export const updateAssociationType = (id, data) =>
  http.put(`/update/associationtype/${id}`, { ...data })
export const deleteAssociationType = (id) =>
  http.delete(`/delete/associationtype/${id}`)

// ---------- 模型关联关系 ----------
export const searchObjectAssociations = (data = {}) =>
  http.post('/find/objectassociation', data)
export const createObjectAssociation = (data) =>
  http.post('/create/objectassociation', data)
export const updateObjectAssociation = (id, data) =>
  http.put(`/update/objectassociation/${id}`, data)
export const deleteObjectAssociation = (id) =>
  http.delete(`/delete/objectassociation/${id}`)

// ---------- 通用模型实例(自定义模型;内置模型后端拒绝) ----------
export const searchInstances = (objId, data = {}) =>
  http.post(`/search/instances/object/${objId}`, data)
export const countInstances = (objId, data = {}) =>
  http.post(`/count/instances/object/${objId}`, data)
export const createInstance = (objId, data) =>
  http.post(`/create/instance/object/${objId}`, data)
export const updateInstance = (objId, instId, data) =>
  http.put(`/update/instance/object/${objId}/inst/${instId}`, data)
export const deleteInstance = (objId, instId) =>
  http.delete(`/delete/instance/object/${objId}/inst/${instId}`)
export const deleteInstances = (objId, ids) =>
  http.delete(`/deletemany/instance/object/${objId}`, { data: { delete: { inst_ids: ids } } })

// 实例变更历史
export const getAuditDictionary = () => http.get('/find/audit_dict')
export const searchInstAudit = (data) => http.post('/find/inst_audit', data)

// 实例导入(multipart,file + params,走 web_server excel 解析;根路径,不在 /api/v3 下)
export const importInstances = (objId, file, params = {}) => {
  const form = new FormData()
  form.append('file', file)
  form.append('params', JSON.stringify(params))
  return http.post(`/insts/object/${objId}/import`, form, {
    baseURL: '',
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  })
}

// 下载实例导入模板(web_server 生成真实 xlsx;根路径)
export const downloadInstTemplate = async (objId) => {
  const res = await http.post(`/importtemplate/${objId}`, {}, {
    baseURL: '',
    responseType: 'blob'
  })
  const url = URL.createObjectURL(res)
  const a = document.createElement('a')
  a.href = url
  a.download = `bk_cmdb_inst_${objId}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// 导出模型实例(web_server 生成真实 xlsx;根路径;object_unique_id=0 即可)
export const exportInstances = async (objId, params = {}) => {
  const res = await http.post(`/insts/object/${objId}/export`, {
    bk_obj_id: objId,
    export_custom_fields: [],
    object_unique_id: 0,
    association_condition: {},
    ...params
  }, {
    baseURL: '',
    responseType: 'blob',
    timeout: 120000
  })
  const url = URL.createObjectURL(res)
  const a = document.createElement('a')
  a.href = url
  a.download = `bk_cmdb_inst_${objId}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

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
// 业务集列表及其专用拓扑契约
export const searchBusinessSets = (page = { start: 0, limit: 200 }) =>
  http.post('/findmany/biz_set', { page })
export const listBizSetBusinesses = (bizSetId, page = { start: 0, limit: 200 }, fields = []) =>
  http.post('/find/biz_set/biz_list', {
    bk_biz_set_id: bizSetId,
    fields,
    page
  })
export const listBizSetTopoChildren = (bizSetId, parentObjId, parentId) =>
  http.post('/find/biz_set/topo_path', {
    bk_biz_set_id: bizSetId,
    bk_parent_obj_id: parentObjId,
    bk_parent_id: parentId
  })
export const countBizSetTopoNodes = (bizSetId, condition) =>
  http.post(`/count/topoinst/host_service_inst/biz_set/${bizSetId}`, { condition })
export const listBizSetHosts = (bizSetId, params = {}) =>
  http.post(`/findmany/hosts/biz_set/${bizSetId}`, params)
export const listBizSetServiceInstances = (bizSetId, params) =>
  http.post(`/findmany/proc/biz_set/${bizSetId}/service_instance`, params)
export const listBizSetProcesses = (bizSetId, params) =>
  http.post(`/findmany/proc/biz_set/${bizSetId}/process_instance`, params)

// 旧版调用保留，供其它页面使用
export const searchBusinessSetTopology = (bizSetId, data) =>
  http.post(`/find/topoinst/bk_biz_id/${bizSetId}`, data)

// ---------- 字段组合模板 ----------
export const searchFieldTemplates = (data = {}) =>
  http.post('/findmany/field_template', data)
export const getFieldTemplate = (id) =>
  http.get(`/find/field_template/${id}`)
export const searchFieldTemplateAttributes = (id, page = { start: 0, limit: 100, sort: 'bk_property_index' }) =>
  http.post('/findmany/field_template/attribute', { bk_template_id: id, page })
export const countFieldTemplateAttributes = (ids) =>
  http.post('/findmany/field_template/attribute/count', { bk_template_ids: ids })
export const searchFieldTemplateUniques = (id, page = { start: 0, limit: 100 }) =>
  http.post('/findmany/field_template/unique', { bk_template_id: id, page })
export const searchFieldTemplateModels = (id, page = { start: 0, limit: 100 }) =>
  http.post('/findmany/object/by_field_template', { bk_template_id: id, page })
export const createFieldTemplate = (data) =>
  http.post('/create/field_template', data)
export const updateFieldTemplate = (data) =>
  http.put('/update/field_template', data)
export const updateFieldTemplateInfo = (data) =>
  http.put('/update/field_template/info', data)
export const cloneFieldTemplate = (data) =>
  http.post('/create/field_template/clone', data)
export const deleteFieldTemplate = (id) =>
  http.delete('/delete/field_template', { data: { id } })
export const bindFieldTemplateModels = (templateId, objectIds) =>
  http.post('/update/field_template/bind/object', { bk_template_id: templateId, object_ids: objectIds })
export const unbindFieldTemplateModel = (templateId, objectId) =>
  http.post('/update/field_template/unbind/object', { bk_template_id: templateId, object_id: objectId })
export const compareFieldTemplateAttributes = (data) =>
  http.post('/find/field_template/attribute/difference', data)
export const compareFieldTemplateUniques = (data) =>
  http.post('/find/field_template/unique/difference', data)
export const syncFieldTemplateToModels = (data) =>
  http.post('/update/topo/field_template/sync', data)
export const getFieldTemplateTaskStatus = (data) =>
  http.post('/find/field_template/tasks_status', data)
export const getFieldTemplateSyncStatus = (data) =>
  http.post('/find/field_template/sync/status', data)

// ---------- 服务模板 ----------
export const searchServiceTemplates = (bizId, page) =>
  http.post('/findmany/proc/service_template', { bk_biz_id: bizId, page })
export const getServiceTemplateDetail = (templateId) =>
  http.get(`/find/proc/service_template/${templateId}/detail`)

// 服务模板实例同步状态(契约: {bk_module_ids, service_template_id} → [{bk_inst_id,status,last_time,fail_tips}])
export const getServiceTemplateSyncStatus = (bizId, data) =>
  http.post(`/findmany/proc/service_template/sync_status/biz/${bizId}`, data)

// 服务分类(含使用统计)
export const searchServiceCategories = (bizId) =>
  http.post('/findmany/proc/service_category/with_statistics', { bk_biz_id: bizId })
export const createServiceCategory = (bizId, name, parentId) =>
  http.post('/create/proc/service_category', { bk_biz_id: bizId, name, parent_id: parentId })
export const updateServiceCategory = (bizId, id, name) =>
  http.put('/update/proc/service_category', { bk_biz_id: bizId, id, name })
export const deleteServiceCategory = (bizId, id) =>
  http.delete('/delete/proc/service_category', { data: { id, bk_biz_id: bizId } })

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
  // 注意: 后端 SearchChartData 接收单个对象(不是数组),传数组会反序列化失败
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
export const searchProcTemplates = (bizId, data = {}) =>
  http.post('/findmany/proc/proc_template', { bk_biz_id: bizId, ...data })
export const createProcTemplate = (bizId, serviceTemplateId, property) =>
  http.post('/createmany/proc/proc_template', {
    bk_biz_id: bizId,
    service_template_id: serviceTemplateId,
    processes: [{ spec: property }]
  })
export const updateProcTemplate = (bizId, id, property) =>
  http.put('/update/proc/proc_template', {
    bk_biz_id: bizId,
    process_template_id: id,
    process_property: property
  })
export const deleteProcTemplate = (bizId, ids) =>
  http.delete('/deletemany/proc/proc_template', {
    data: { bk_biz_id: bizId, process_templates: Array.isArray(ids) ? ids : [ids] }
  })

// ---------- 实例标签 ----------
export const createInstanceLabels = (data) =>
  http.post('/createmany/proc/service_instance/labels', data)
export const updateInstanceLabels = (data) =>
  http.post('/updatemany/proc/service_instance/labels', data)
export const deleteInstanceLabels = (data) =>
  http.delete('/deletemany/proc/service_instance/labels', { data })
// 后端以 aggregation 接口返回业务下实例标签，data 为 { key: uniqueValues[] }。
export const listInstanceLabels = (data) =>
  http.post('/findmany/proc/service_instance/labels/aggregation', data)
export const getLabelHistory = (data) =>
  http.post('/findmany/proc/service_instance/labels/aggregation', data)

// ---------- 业务同步 ----------
export const getServiceTemplateDiff = (data) =>
  http.post('/find/proc/service_template/general_difference', data)
export const syncServiceInstances = (data) =>
  http.put('/update/proc/service_instance/sync', data)
// ---------- 动态分组(契约对齐老版 dynamicGroup store) ----------
export const createDynamicGroup = (bizId, name, objId, condition) =>
  http.post('/dynamicgroup', { bk_biz_id: bizId, bk_obj_id: objId, name, info: { condition } })
export const updateDynamicGroup = (bizId, id, name, objId, condition) =>
  http.put(`/dynamicgroup/${bizId}/${id}`, { bk_biz_id: bizId, bk_obj_id: objId, name, info: { condition } })
export const getDynamicGroupDetail = (bizId, id) =>
  http.get(`/dynamicgroup/${bizId}/${id}`)
export const previewHostsByCondition = (condition, page = { start: 0, limit: 20 }) =>
  // 契约: host_server HostCommonSearch(资源池视角,UI 专用)
  http.post('/findmany/hosts/search/resource', { condition, page })
export const searchSetsByFilter = (bizId, filter, page = { start: 0, limit: 20 }) =>
  // 契约: topo set/search,filter 为通用模型条件规则
  http.post(`/set/search/0/${bizId}`, { page, filter })

// ---------- 云账户(契约对齐老版 cloud store) ----------
export const updateCloudAccount = (id, data) => http.put(`/update/cloud/account/${id}`, data)
export const searchCloudTasks = (condition, page = { start: 0, limit: 50 }) =>
  http.post('/findmany/cloud/sync/task', { page, ...(condition ? { condition } : {}) })
// ---------- 云资源发现任务(契约对齐老版 cloud/resource store) ----------
export const createCloudSyncTask = (params) => http.post('/create/cloud/sync/task', params)
export const updateCloudSyncTask = (id, params) => http.put(`/update/cloud/sync/task/${id}`, params)
export const deleteCloudSyncTask = (id) => http.delete(`/delete/cloud/sync/task/${id}`)
export const findCloudSyncRegion = (params) => http.post('/findmany/cloud/sync/region', params)
export const findCloudAccountVPC = (accountId, params) =>
  http.post(`/findmany/cloud/account/vpc/${accountId}`, params)

// ---------- 用户自定义配置(契约对齐老版 userCustom store) ----------
// 保存为增量合并语义(老版 saveUsercustom 同名接口),读取当前用户全量自定义配置
export const saveUserCustom = (data) => http.post('/usercustom', data)
export const searchUserCustom = () => http.post('/usercustom/user/search', {})
