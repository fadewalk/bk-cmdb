<template>
  <el-drawer
    v-model="visible"
    class="advanced-host-filter"
    title="高级筛选"
    direction="rtl"
    size="400px"
    :modal="false"
    :close-on-click-modal="false"
    :before-close="handleBeforeClose"
  >
    <!-- 旧版 bk-sideslider 左缘收起条 -->
    <span class="sideslider-collapse" aria-label="收起侧栏" @click="visible = false">
      <svg viewBox="0 0 10 10" width="10" height="10"><path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
    </span>
    <div class="filter-layout">
      <el-form class="filter-form" label-position="top">
        <el-form-item label="IP" class="filter-ip">
          <el-input
            v-model="draft.IP.text"
            type="textarea"
            :rows="3"
            resize="vertical"
            placeholder="请输入IP或管控区域ID:IP,多个IP可使用换行分隔"
          />
          <p v-if="ipError" class="filter-error">{{ ipError }}</p>
          <div class="ip-options">
            <el-checkbox v-model="draft.IP.inner" @change="keepOneIpScope('outer')">内网IP</el-checkbox>
            <el-checkbox v-model="draft.IP.outer" @change="keepOneIpScope('inner')">外网IP</el-checkbox>
            <el-checkbox v-model="draft.IP.exact">精确</el-checkbox>
          </div>
          <div class="filter-operate">
            <el-select v-model="selectedFieldId" class="field-picker" clearable filterable placeholder="添加其他条件" @change="addField">
              <el-option-group v-for="group in propertyGroups" :key="group.label" :label="group.label">
                <el-option v-for="field in group.options" :key="field.id" :label="field.label" :value="field.id" />
              </el-option-group>
            </el-select>
            <el-button link type="primary" :disabled="!draft.conditions.length" @click="clearConditions">清空条件</el-button>
          </div>
        </el-form-item>

        <el-form-item v-for="item in draft.conditions" :key="item.id" class="filter-item">
          <template #label>
            {{ item.property.bk_property_name || item.property.bk_property_id }}
            <span class="item-label-suffix">({{ MODEL_NAMES[item.property.bk_obj_id] || item.property.bk_obj_id }})</span>
          </template>
          <div class="item-content-wrapper" :class="{ 'without-operator': WITHOUT_OPERATOR.includes(item.property.bk_property_type) }">
            <el-select v-if="!WITHOUT_OPERATOR.includes(item.property.bk_property_type)" v-model="item.operator" class="item-operator" @change="resetOperatorValue(item)">
              <el-option v-for="operator in operatorsFor(item.property)" :key="operator.value" :label="operator.label" :value="operator.value" />
            </el-select>
            <!-- 枚举/列表/时区:选项下拉(旧版 getBindProps 仅这几类传 option) -->
            <el-select
              v-if="controlKind(item) === 'enum'"
              v-model="item.value"
              class="item-value"
              filterable
              clearable
              :multiple="isMultiOperator(item.operator)"
              collapse-tags
              :placeholder="placeholderFor(item.property)"
            >
              <el-option v-for="option in item.property.option" :key="String(option.id ?? option.name ?? option)" :label="option.name ?? option.label ?? option" :value="option.id ?? option.name ?? option" />
            </el-select>
            <!-- 管控区域:云区域下拉(旧版 cmdb-search-foreignkey) -->
            <el-select
              v-else-if="controlKind(item) === 'cloud'"
              v-model="item.value"
              class="item-value"
              filterable
              clearable
              :multiple="isMultiOperator(item.operator)"
              collapse-tags
              :placeholder="placeholderFor(item.property)"
            >
              <el-option v-for="area in cloudAreas" :key="area.bk_cloud_id" :label="area.bk_cloud_name" :value="area.bk_cloud_id" />
            </el-select>
            <!-- bool:是/否选择(旧版 cmdb-search-bool,无操作符) -->
            <el-select v-else-if="controlKind(item) === 'bool'" v-model="item.value" class="item-value" :placeholder="placeholderFor(item.property)">
              <el-option label="是" :value="true" />
              <el-option label="否" :value="false" />
            </el-select>
            <el-date-picker v-else-if="controlKind(item) === 'date'" v-model="item.value" class="item-value" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" />
            <el-date-picker v-else-if="controlKind(item) === 'time'" v-model="item.value" class="item-value" type="datetimerange" value-format="YYYY-MM-DD HH:mm:ss" range-separator="至" start-placeholder="开始时间" end-placeholder="结束时间" />
            <!-- 数字范围:两个数字输入 - 连接(旧版 cmdb-search-int multiple) -->
            <span v-else-if="controlKind(item) === 'number-range'" class="item-value number-range">
              <el-input :model-value="item.value?.[0]" type="number" @update:model-value="setRangeBound(item, 0, $event)" />
              <span class="range-grep">-</span>
              <el-input :model-value="item.value?.[1]" type="number" @update:model-value="setRangeBound(item, 1, $event)" />
            </span>
            <el-input v-else-if="controlKind(item) === 'number'" v-model="item.value" class="item-value" type="number" :placeholder="placeholderFor(item.property)" />
            <!-- 多值 tag 输入(字符/用户/数字 in):旧版 bk-tag-input allow-create 形态 -->
            <el-select
              v-else-if="isTagKind(controlKind(item))"
              v-model="item.value"
              class="item-value tag-input"
              multiple
              filterable
              allow-create
              default-first-option
              collapse-tags
              :placeholder="placeholderFor(item.property)"
            />
            <el-input v-else v-model="item.value" class="item-value" clearable :placeholder="placeholderFor(item.property)" />
            <!-- 用户字段「我」快捷键(旧版 objuser 快捷填入当前用户) -->
            <el-button v-if="isUserKind(controlKind(item))" class="item-me" link type="primary" @click="fillCurrentUser(item)">我</el-button>
          </div>
          <span class="item-remove" aria-label="删除条件" @click="removeField(item)">×</span>
        </el-form-item>
      </el-form>

      <div class="filter-options">
        <el-button type="primary" class="search-btn" :disabled="!canSearch" @click="submit">查询</el-button>
        <el-button class="reset-btn" @click="resetAll">清空</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { searchCloudAreas } from '../api/cmdb'
import { parseHostSearch, serializeFilterConditions } from '../utils/host-filter'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  properties: { type: Array, default: () => [] },
  initial: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['update:modelValue', 'submit', 'reset'])

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 旧版 QUERY_OPERATOR_HOST_SYMBOL:操作符下拉显示符号而非中文
const operators = [
  { value: 'eq', label: '=' },
  { value: 'ne', label: '≠' },
  { value: 'in', label: 'in' },
  { value: 'nin', label: 'not in' },
  { value: 'contains', label: 'contains' },
  { value: 'like', label: 'contains(CS)' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'range', label: '≤ ≥' }
]
const draft = ref(makeDraft(props.initial))
const selectedFieldId = ref('')

const MODEL_NAMES = { host: '主机', module: '模块', set: '集群', biz: '业务', node: '节点' }

const propertyGroups = computed(() => {
  const groups = new Map()
  for (const property of props.properties) {
    if (!property?.bk_property_id || property.bk_property_id.startsWith('__')) continue
    const label = property.bk_obj_name || MODEL_NAMES[property.bk_obj_id] || property.bk_obj_id || '主机'
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push({ ...property, id: String(property.id ?? `${property.bk_obj_id}.${property.bk_property_id}`), label: property.bk_property_name || property.bk_property_id })
  }
  return [...groups.entries()].map(([label, options]) => ({ label, options }))
})

const ipError = computed(() => {
  const parsed = parseHostSearch(draft.value.IP.text)
  const count = parsed.IPv4List.length + parsed.IPv6List.length + parsed.IPv4WithCloudList.length + parsed.IPv6WithCloudList.length
  if (count > 10000) return '最多支持搜索10000条数据'
  if (parsed.cloudIdSet.size > 50) return '最多支持50个不同管控区域的混合搜索'
  return ''
})
const canSearch = computed(() => !ipError.value && (draft.value.IP.text.trim() || draft.value.conditions.some((item) => !isEmpty(item.value))))

watch(() => props.initial, (value) => { draft.value = makeDraft(value) }, { deep: true })

function makeDraft(initial = {}) {
  const conditions = (initial.conditions || []).map((item) => {
    const operator = item.operator || getDefaultOperator(item.property)
    let { value } = item
    if (isMultiOperator(operator) && !Array.isArray(value) && value !== '' && value !== null && value !== undefined) {
      value = [value]
    }
    if (!isMultiOperator(operator) && Array.isArray(value)) {
      value = value[0] ?? ''
    }
    return {
      id: String(item.id ?? `${item.property?.bk_obj_id}.${item.property?.bk_property_id}`),
      property: item.property,
      operator,
      value: value ?? initialValueFor(item.property, operator)
    }
  }).filter((item) => item.property)
  return {
    IP: { text: initial.IP?.text || '', inner: initial.IP?.inner !== false, outer: initial.IP?.outer !== false, exact: initial.IP?.exact !== false },
    conditions
  }
}
function isEmpty(value) { return value === '' || value === null || value === undefined || (Array.isArray(value) && !value.length) }
// 旧版 getDefaultData:字符/枚举类默认「属于」,数值/布尔默认「等于」,日期/时间默认「范围」
function getDefaultOperator(property) {
  const type = property?.bk_property_type
  if (['date', 'time'].includes(type)) return 'range'
  if (['singlechar', 'longchar', 'list', 'enum', 'enummulti', 'enumquote', 'objuser', 'timezone', 'organization'].includes(type)) return 'in'
  return 'eq'
}
function initialValueFor(property, operator) {
  const type = property.bk_property_type
  if (type === 'bool') return ''
  if (type === 'date' || type === 'time' || operator === 'range') return []
  return isMultiOperator(operator) ? [] : ''
}
// 旧版 getComponentType 契约:按「属性类型 + 操作符」分派值控件,而不是按 option 有无
function controlKind(item) {
  const type = item.property.bk_property_type
  const operator = item.operator
  if (type === 'bool') return 'bool'
  if (type === 'date') return 'date'
  if (type === 'time') return 'time'
  if (['enum', 'enummulti', 'enumquote', 'list', 'timezone'].includes(type)) return 'enum'
  if (type === 'foreignkey') return 'cloud'
  if (type === 'objuser') return isMultiOperator(operator) ? 'user-tag' : 'user-input'
  if (['int', 'float'].includes(type)) {
    if (operator === 'range') return 'number-range'
    if (operator === 'in') return 'number-tag'
    return 'number'
  }
  return isMultiOperator(operator) ? 'tag' : 'input'
}
const TAG_KINDS = ['tag', 'number-tag', 'user-tag']
function isTagKind(kind) { return TAG_KINDS.includes(kind) }
function isUserKind(kind) { return kind === 'user-tag' || kind === 'user-input' }
// 旧版 getPlaceholder:选择类「请选择xx」,其余「请输入xx」
const SELECT_PLACEHOLDER_TYPES = ['list', 'enum', 'enummulti', 'enumquote', 'timezone', 'bool']
function placeholderFor(property) {
  const name = property.bk_property_name || property.bk_property_id
  return SELECT_PLACEHOLDER_TYPES.includes(property.bk_property_type) ? `请选择${name}` : `请输入${name}`
}
const cloudAreas = ref([])
async function loadCloudAreas() {
  if (cloudAreas.value.length) return
  const res = await searchCloudAreas({ page: { start: 0, limit: 200 }, condition: {} }).catch(() => [])
  cloudAreas.value = res?.info || []
}
watch(() => props.modelValue, (open) => { if (open) loadCloudAreas() })
function fillCurrentUser(item) {
  if (Array.isArray(item.value)) {
    if (!item.value.includes('admin')) item.value = [...item.value, 'admin']
  } else {
    item.value = 'admin'
  }
}
function setRangeBound(item, index, event) {
  const bounds = Array.isArray(item.value) ? [...item.value] : ['', '']
  bounds[index] = event
  item.value = bounds
}
// 旧版 filter-form customOperatorTypeMap + defaultTypeMap 契约
const OPERATOR_TYPE_MAP = {
  int: ['eq', 'ne', 'gte', 'lte', 'range', 'in'],
  float: ['eq', 'ne', 'gte', 'lte', 'range', 'in'],
  singlechar: ['in', 'nin', 'contains', 'like'],
  longchar: ['in', 'nin', 'contains', 'like'],
  list: ['in', 'nin'],
  enum: ['in', 'nin'],
  enummulti: ['in', 'nin'],
  enumquote: ['in', 'nin'],
  foreignkey: ['in', 'nin'],
  objuser: ['in', 'nin'],
  organization: ['in', 'nin'],
  timezone: ['in', 'nin']
}
// 旧版 withoutOperator:这些类型不渲染操作符下拉
const WITHOUT_OPERATOR = ['date', 'time', 'bool', 'service-template']
function operatorsFor(property) {
  return (OPERATOR_TYPE_MAP[property.bk_property_type] || ['in', 'nin']).map((value) => operators.find((item) => item.value === value)).filter(Boolean)
}
function isMultiOperator(operator) { return ['in', 'nin', 'range'].includes(operator) }
function addField(id) {
  if (!id) return
  const property = propertyGroups.value.flatMap((group) => group.options).find((item) => item.id === id)
  if (property && !draft.value.conditions.some((item) => item.id === property.id)) {
    const operator = getDefaultOperator(property)
    draft.value.conditions.push({ id: property.id, property, operator, value: initialValueFor(property, operator) })
  }
  selectedFieldId.value = ''
}
function removeField(item) { draft.value.conditions = draft.value.conditions.filter((candidate) => candidate.id !== item.id) }
function clearConditions() { draft.value.conditions = [] }
function resetOperatorValue(item) { item.value = initialValueFor(item.property, item.operator) }
function keepOneIpScope(other) { if (!draft.value.IP.inner && !draft.value.IP.outer) draft.value.IP[other] = true }
function resetAll() {
  draft.value = makeDraft({})
  emit('reset')
}
function cloneDraft() {
  return JSON.parse(JSON.stringify(draft.value))
}
function submit() {
  if (!canSearch.value) return
  const filter = serializeFilterConditions(draft.value.conditions.map((item) => ({
    field: item.property.bk_property_id,
    operator: item.operator,
    value: item.value
  })))
  emit('submit', { ...cloneDraft(), filter })
  visible.value = false
}
async function handleBeforeClose(done) {
  if (JSON.stringify(draft.value) === JSON.stringify(makeDraft(props.initial))) { done(); return }
  try {
    await ElMessageBox.confirm('离开将会导致表单填写的内容丢失', '提示', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
    done()
  } catch { /* 保留表单 */ }
}
</script>

<!-- el-drawer 经 teleport 挂载,根元素不带 scoped data-v,链式 :deep 选择器无法命中,故用全局样式(类名前缀在本组件内唯一) -->
<style>
.advanced-host-filter.el-drawer .el-drawer__header { margin-bottom: 0; padding: 18px 20px; border-bottom: 1px solid #DCDEE5; color: #313238; }
.advanced-host-filter.el-drawer .el-drawer__headerbtn, .advanced-host-filter.el-drawer .el-drawer__close-btn { display: none; }
.advanced-host-filter.el-drawer { overflow: visible; }
.advanced-host-filter .sideslider-collapse {
  position: absolute;
  left: -28px;
  top: 6px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 44px;
  background: #3A84FF;
  color: #fff;
  border-radius: 2px 0 0 2px;
  cursor: pointer;
}
.advanced-host-filter .el-drawer__body { padding: 0; overflow: hidden; }
.advanced-host-filter .filter-layout { height: 100%; display: flex; flex-direction: column; }
.advanced-host-filter .filter-form { flex: 1; overflow-y: auto; padding: 0 14px 12px; }
.advanced-host-filter .filter-ip { position: sticky; top: 0; z-index: 2; margin: 0 -14px; padding: 10px 24px 8px; background: #fff; border-bottom: 1px solid #F0F1F5; }
.advanced-host-filter .filter-ip .el-form-item__label, .advanced-host-filter .filter-item .el-form-item__label { color: #313238; font-size: 14px; line-height: 24px; padding-bottom: 4px; }
.advanced-host-filter .filter-ip .el-textarea__inner { min-height: 82px !important; font-size: 12px; line-height: 24px; }
.advanced-host-filter .filter-error { margin: 4px 0; color: #EA3636; font-size: 12px; }
.advanced-host-filter .ip-options { display: flex; align-items: center; height: 30px; }
.advanced-host-filter .ip-options .el-checkbox { margin-right: 20px; }
.advanced-host-filter .filter-operate { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
.advanced-host-filter .field-picker { width: 160px; }
/* 旧版「添加其他条件」为蓝色链接样式 */
.advanced-host-filter .field-picker .el-select__wrapper { background: transparent; box-shadow: none !important; padding-left: 0; min-height: 24px; }
.advanced-host-filter .field-picker .el-select__wrapper.is-focused, .advanced-host-filter .field-picker .el-select__wrapper.is-hovering { background: transparent; }
.advanced-host-filter .field-picker .el-select__placeholder, .advanced-host-filter .field-picker .el-select__selected-item { color: #3A84FF; font-size: 12px; }
.advanced-host-filter .field-picker .el-select__caret { display: none; }
.advanced-host-filter .filter-item { position: relative; margin: 0 -4px; padding: 5px 10px 10px; }
.advanced-host-filter .filter-item:hover { background: #F5F6FA; }
.advanced-host-filter .item-label-suffix { margin-left: 4px; color: #979BA5; font-size: 12px; }
.advanced-host-filter .item-content-wrapper { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 8px; min-height: 32px; padding-right: 18px; }
/* 旧版 item-operator flex:128px 0 0 */
.advanced-host-filter .item-operator { flex: 128px 0 0; }
/* 值区显式撑满,防止 el-select 收缩为箭头宽 */
.advanced-host-filter .item-value { min-width: 0; flex: 1; }
.advanced-host-filter .item-value.el-select, .advanced-host-filter .item-value.el-input, .advanced-host-filter .item-value.el-date-editor { width: 100%; }
.advanced-host-filter .item-value input[type='number']::-webkit-outer-spin-button,
.advanced-host-filter .item-value input[type='number']::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.advanced-host-filter .item-value.number-range { display: flex; align-items: center; gap: 8px; }
.advanced-host-filter .item-value.number-range .el-input { flex: 1; }
.advanced-host-filter .tag-input .el-select__caret { display: none; }
.advanced-host-filter .item-me { flex: 0 0 auto; padding: 0; height: 32px; }
/* 旧版 item-remove:行右上角,灰字 hover 变红 */
.advanced-host-filter .item-remove { position: absolute; right: -10px; top: 3px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #63656E; cursor: pointer; opacity: 0; }
.advanced-host-filter .item-remove:hover { color: #EA3636; }
.advanced-host-filter .filter-item:hover .item-remove { opacity: 1; }
.advanced-host-filter .filter-options { display: flex; align-items: center; padding: 10px 24px; border-top: 1px solid #DCDEE5; background: #fff; }
.advanced-host-filter .filter-options .search-btn { margin-right: 10px; }
.advanced-host-filter .filter-options .reset-btn { margin-left: auto; }
</style>
