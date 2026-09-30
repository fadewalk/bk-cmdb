// 老版 cmdb-property-value 的文本渲染契约(src/ui/src/filters/formatter.js + getPropertyCopyValue)
// 用于同步差异/详情等只读展示场景的类型化取值
import { formatTime } from './format-time'

export function formatPropertyValueDisplay(property, value) {
  const type = property?.bk_property_type
  const options = Array.isArray(property?.option) ? property.option : []

  if (type === 'bool') {
    // 老版 bool:仅 'true'/'false' 字符串原样,其余 '--'
    return ['true', 'false'].includes(String(value)) ? String(value) : '--'
  }
  if (value === null || value === undefined || value === '') return '--'

  if (type === 'enum') {
    const opt = options.find((o) => o.id === value)
    return opt ? opt.name : '--'
  }
  if (type === 'list') {
    // list 的 option 可能是字符串数组,此时原样输出
    if (!options.length || typeof options[0] === 'string') return String(value)
    const opt = options.find((o) => o.id === value)
    return opt ? opt.name : '--'
  }
  if (type === 'enummulti') {
    const arr = Array.isArray(value) ? value : [value]
    return arr.map((v) => options.find((o) => o.id === v)?.name ?? String(v)).join(', ')
  }
  if (type === 'date') return formatTime(value, 'YYYY-MM-DD') || '--'
  if (type === 'time') return formatTime(value, 'YYYY-MM-DD HH:mm:ss') || '--'
  if (type === 'foreignkey') {
    if (Array.isArray(value)) {
      return value.map((inst) => `${inst.bk_inst_name}[${inst.bk_inst_id}]`).join(',')
    }
    return String(value).length ? String(value) : '--'
  }
  if (Array.isArray(value)) return value.map((item) => String(item)).join(',')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
