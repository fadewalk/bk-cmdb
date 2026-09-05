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

export const createModule = (bizId, setId, name) =>
  http.post(`/module/${bizId}/${setId}`, {
    bk_module_name: name, bk_parent_id: setId, bk_supplier_account: '0'
  })
export const deleteModule = (bizId, setId, moduleId) =>
  http.delete(`/module/${bizId}/${setId}/${moduleId}`)

// ---------- 服务实例与进程 ----------
export const searchServiceInstances = (bizId, page) =>
  http.post('/findmany/proc/service_instance', { bk_biz_id: bizId, page, with_name: true })
export const deleteServiceInstances = (bizId, ids) =>
  http.post('/deletemany/proc/service_instance', { bk_biz_id: bizId, service_instance_ids: ids })
export const searchProcessInstances = (bizId, serviceInstanceId, page) =>
  http.post('/findmany/proc/process_instance', {
    bk_biz_id: bizId, service_instance_id: serviceInstanceId, page
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
export const deleteModelAttribute = (id) => http.delete(`/delete/objectattr/${id}`)

// ---------- 关联类型 ----------
export const searchAssociationTypes = () =>
  http.post('/find/associationtype', { condition: {}, page: { start: 0, limit: 100 } })

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

// 集群模板
export const searchSetTemplates = (bizId, page) =>
  http.post(`/findmany/topo/set_template/bk_biz_id/${bizId}/`, { page })

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
