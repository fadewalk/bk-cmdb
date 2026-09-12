// 老版表格表头契约共享工具(HostList/BusinessList/Project/BizSet 共用)
// 契约来源: src/ui/src/utils/tools.js(getHeaderProperties/getHeaderPropertyName/getHeaderPropertyMinWidth)
// + src/ui/src/views/business/index.vue(setTableHeader/固定列前置)
export const LEGACY_MODEL_NAMES = { host: '主机', module: '模块', set: '集群', biz: '业务', biz_set: '业务集', project: '项目' }

// 老版 getPropertyPriority:index 越小越靠前,唯一/必须字段再提前
export function propertyPriority(property) {
  let priority = property.bk_property_index ?? 0
  if (property.isonly) priority -= 1
  if (property.isrequired) priority -= 1
  return priority
}

// 老版 getHeaderPropertyName:带单位时补 (unit);nameResolver 支持注入属性改名(如模块名→目录名)
export function legacyHeaderName(property, nameResolver) {
  const name = nameResolver ? nameResolver(property) : property.bk_property_name
  if (property.unit && !name.endsWith(`(${property.unit})`)) return `${name}(${property.unit})`
  return name
}

// 老版 getHeaderPropertyMinWidth 简化移植
export function legacyColMinWidth(property, sortable, preset = {}) {
  const presets = { bk_host_innerip: 120, bk_cloud_id: 120, __bk_host_topology__: 200, ...preset }
  if (presets[property.bk_property_id]) return presets[property.bk_property_id]
  const name = legacyHeaderName(property)
  const letterCount = (name.match(/[\w\s\\(\\)]/g) ?? []).length
  const contentWidth = ((name.length - letterCount) * 12) + (letterCount * 12 * 0.7)
  return Math.ceil(contentWidth + (sortable ? 22 : 0) + 30)
}

function uniqueById(columns) {
  const seen = new Set()
  return columns.filter((item) => {
    if (!item || seen.has(item.bk_property_id)) return false
    seen.add(item.bk_property_id)
    return true
  })
}

/**
 * 老版表头计算:
 * - 有自定义列:固定列前置 + 自定义列(不再截断)
 * - 无自定义列:固定列前置 + 属性池按优先级取前 defaultLimit,再按 totalLimit 截断
 *   (主机页 totalLimit=6 含固定列;业务等页面固定列不计入总数)
 */
export function computeLegacyHeader({ pool, customIds, fixedProperties, defaultLimit = 6, totalLimit = null }) {
  const find = (id) => pool.find((p) => p.bk_property_id === id)
  let columns
  if (Array.isArray(customIds) && customIds.length) {
    columns = customIds.map(find).filter(Boolean)
  } else {
    columns = [...pool]
      .sort((a, b) => propertyPriority(a) - propertyPriority(b))
      .slice(0, defaultLimit)
  }
  const merged = uniqueById([...fixedProperties, ...columns])
  // 老版语义:仅"默认表头"按 totalLimit 截断;自定义配置不截断
  const hasCustom = Array.isArray(customIds) && customIds.length
  return totalLimit && !hasCustom ? merged.slice(0, totalLimit) : merged
}

/**
 * 单元格取值(老版 hostValueFilter + cmdb-property-value 展示契约):
 * getRaw 缺省直取 row[propertyId](业务/项目等扁平行);主机等包装行传入自定义取值
 */
export function legacyCellValue(row, property, getRaw) {
  const raw = getRaw
    ? getRaw(row, property)
    : row[property.bk_property_id]
  if (raw === null || raw === undefined || raw === '') return '--'
  switch (property.bk_property_type) {
    case 'enum': {
      const option = (property.option || []).find((item) => item.id === raw)
      return option ? option.name : '--'
    }
    case 'bool':
      return raw ? '是' : '否'
    case 'date':
      return String(raw).slice(0, 10)
    case 'time':
      return String(raw).replace('T', ' ').slice(0, 19)
    default:
      if (Array.isArray(raw)) {
        // 外键类返回 [{bk_inst_name,bk_inst_id}],老版展示 名称[ID]
        return raw.map((item) => {
          if (item && typeof item === 'object') {
            if (item.bk_inst_name !== undefined) return `${item.bk_inst_name}[${item.bk_inst_id ?? item.id}]`
            return item.bk_inst_name ?? '--'
          }
          return item
        }).join(',') || '--'
      }
      return String(raw)
  }
}

// 老版 isPropertySortable:排除 foreignkey/topology/innertable
export function legacyIsSortable(property) {
  return !['foreignkey', 'topology', 'innertable'].includes(property.bk_property_type)
}
