import http from './http'

// ---------- 业务 ----------
// 搜索业务(owner 0;body 里的 condition 支持按 bk_biz_name 过滤)
export const searchBusiness = (page, condition = {}) =>
  http.post('/biz/search/0', { page, condition })

// ---------- 主机 ----------
// 业务下主机列表(host_property_filter 为空时必须整体省略,后端校验不允许空 rules)
export const listBizHosts = (bizId, page, filter) => {
  const body = {
    page,
    fields: ['bk_host_id', 'bk_host_innerip', 'bk_host_name', 'bk_os_name', 'bk_cloud_id', 'bk_cpu', 'bk_mem', 'bk_disk']
  }
  if (filter && filter.rules && filter.rules.length > 0) body.host_property_filter = filter
  return http.post(`/hosts/app/${bizId}/list_hosts`, body)
}

// 无业务归属(资源池)主机列表
export const listHostsWithoutApp = (page, filter) => {
  const body = {
    page,
    fields: ['bk_host_id', 'bk_host_innerip', 'bk_host_name', 'bk_os_name', 'bk_cloud_id']
  }
  if (filter && filter.rules && filter.rules.length > 0) body.host_property_filter = filter
  return http.post('/hosts/list_hosts_without_app', body)
}

// ---------- 业务拓扑 ----------
// 完整业务拓扑树(自定义集群/模块层级;?with_default 附带空闲机池)
export const getBizTopoTree = (bizId) =>
  http.post(`/find/topoinst_with_statistics/biz/${bizId}?with_default`, {})

// 空闲机池内部拓扑(集群/模块,含主机数统计)
export const getBizInternalTopo = (bizId) =>
  http.get(`/topo/internal/0/${bizId}/with_statistics`)

// ---------- 模型 ----------
// 全量模型列表
export const searchModels = (condition = {}) =>
  http.post('/find/object', condition)

// 模型属性列表
export const searchModelAttributes = (objId) =>
  http.post('/find/objectattr', { bk_obj_id: objId, bk_supplier_account: '0' })

// 模型实例统计(仪表盘)
export const getModelStatistics = () =>
  http.get('/object/statistics')
