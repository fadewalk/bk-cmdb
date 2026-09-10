import http from '../api/http'

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/
const IPV6_RE = /^[0-9a-fA-F:]+$/
const IP_WITH_CLOUD_RE = /^(\d+):\[([^\]]+)\]$/

export const MODEL_NAMES = { host: '主机', module: '模块', set: '集群', biz: '业务', node: '节点' }

// 旧版 FilterStore defaultConditionProperties(NORMAL):无用户行为时的默认条件行
export const DEFAULT_CONDITION_FIELDS = [
  ['bk_set_name', 'set'],
  ['bk_module_name', 'module'],
  ['operator', 'host'],
  ['bk_bak_operator', 'host'],
  ['bk_cloud_id', 'host']
]

export const RESOURCE_FILTER_USERCUSTOM_KEY = 'resource_host_common_filter'

// 旧版 getProperties 契约:一次拉 host/module/set/biz 四个模型属性,并按 legacy propertyFilter 过滤隐藏/未知类型
const KNOWN_PROPERTY_TYPES = ['singlechar', 'longchar', 'int', 'float', 'enum', 'enummulti', 'enumquote', 'date', 'time', 'bool', 'objuser', 'timezone', 'list', 'organization', 'foreignkey']
export async function fetchHostFilterProperties() {
  const attrs = await http.post('/find/objectattr/web', {
    bk_obj_id: { $in: ['host', 'module', 'set', 'biz'] },
    bk_supplier_account: '0'
  }).catch(() => [])
  const list = Array.isArray(attrs) ? attrs : (attrs?.info || [])
  return list.filter((prop) => KNOWN_PROPERTY_TYPES.includes(prop.bk_property_type) && prop.is_hidden !== true)
}

// 旧版 setupNormalProperty:优先用户保存的行为,否则取默认条件行
export function resolveInitialConditions(properties, usercustom = null) {
  let fields = null
  try {
    const saved = usercustom?.[RESOURCE_FILTER_USERCUSTOM_KEY]
    if (Array.isArray(saved) && saved.length) fields = saved
  } catch { /* ignore */ }
  if (!fields) fields = DEFAULT_CONDITION_FIELDS
  const conditions = []
  for (const [propertyId, modelId] of fields) {
    const property = properties.find((item) => item.bk_obj_id === modelId && item.bk_property_id === propertyId)
    if (!property) continue
    conditions.push({
      id: String(property.id ?? `${modelId}.${propertyId}`),
      property,
      operator: 'in',
      value: []
    })
  }
  return conditions
}

export function toUserBehavior(conditions = []) {
  return conditions.map((item) => [item.property?.bk_property_id, item.property?.bk_obj_id])
}

export function splitSearchText(text = '') {
  return String(text).split(/\n|;|；|,|，/).map((item) => item.trim()).filter(Boolean)
}

export function parseHostSearch(text = '') {
  const IPv4List = []
  const IPv6List = []
  const IPv4WithCloudList = []
  const IPv6WithCloudList = []
  const assetList = []
  const cloudIdSet = new Set()

  for (const value of splitSearchText(text)) {
    const cloud = value.match(IP_WITH_CLOUD_RE)
    if (cloud) {
      const cloudId = Number(cloud[1])
      const ip = cloud[2]
      cloudIdSet.add(cloudId)
      if (IPV4_RE.test(ip)) IPv4WithCloudList.push([cloudId, ip, 0])
      else if (IPV6_RE.test(ip) && ip.includes(':')) IPv6WithCloudList.push([cloudId, ip])
      else assetList.push(value)
      continue
    }
    if (IPV4_RE.test(value) && value.split('.').every((part) => Number(part) <= 255)) IPv4List.push(value)
    else if (IPV6_RE.test(value) && value.includes(':')) IPv6List.push(value)
    else assetList.push(value)
  }

  return { IPv4List, IPv6List, IPv4WithCloudList, IPv6WithCloudList, assetList, cloudIdSet }
}

export function hasValidHostIp(text = '') {
  const parsed = parseHostSearch(text)
  return parsed.IPv4List.length + parsed.IPv6List.length
    + parsed.IPv4WithCloudList.length + parsed.IPv6WithCloudList.length > 0
}

export function defaultIpCondition(text = '') {
  return { text: String(text || ''), inner: true, outer: true, exact: true }
}

export function serializeIpCondition(condition = {}) {
  const entries = Object.entries(condition).filter(([, value]) => value !== undefined && value !== null && value !== '')
  return new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()
}

export function serializeFilterConditions(conditions = []) {
  return conditions.filter((item) => item && item.field && item.value !== '' && item.value !== null && item.value !== undefined)
    .map((item) => {
      const value = Array.isArray(item.value) ? item.value.join(',') : item.value
      return `${item.field}.${String(item.operator || 'eq').replace(/^\$/, '')}=${value}`
    }).join('&')
}

// 前端操作符 → 后端 host_property_filter 操作符(旧版 transformCondition 契约)
const OPERATOR_TO_API = {
  eq: 'equal',
  ne: 'not_equal',
  in: 'in',
  nin: 'not_in',
  gt: 'greater',
  lt: 'less',
  gte: 'greater_or_equal',
  lte: 'less_or_equal',
  like: 'regex',
  contains: 'contains'
}

export function conditionToHostPropertyFilter(conditions = []) {
  const rules = []
  for (const item of conditions) {
    if (!item || !item.field || item.value === '' || item.value === null || item.value === undefined) continue
    const operator = OPERATOR_TO_API[String(item.operator || 'eq').replace(/^\$/, '')] || item.operator
    if (operator === 'range') {
      // 旧版 $range 前端拆分为 gte/lte 两条
      const [start, end] = Array.isArray(item.value) ? item.value : [item.value, item.value]
      if (start !== '' && start !== null && start !== undefined) rules.push({ field: item.field, operator: 'greater_or_equal', value: start })
      if (end !== '' && end !== null && end !== undefined) rules.push({ field: item.field, operator: 'less_or_equal', value: end })
      continue
    }
    rules.push({ field: item.field, operator, value: item.value })
  }
  return rules.length ? { condition: 'AND', rules } : undefined
}
