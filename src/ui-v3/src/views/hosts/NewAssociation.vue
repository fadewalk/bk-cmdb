<template>
  <div class="new-association" v-loading="typeLoading">
    <div class="assoc-filter">
      <label class="filter-label">关联列表</label>
      <el-select
        v-model="selectedIndex"
        filterable
        placeholder="请选择"
        style="width: 280px"
        @change="handleSelectObj"
      >
        <el-option v-for="(o, idx) in assocOptions" :key="idx" :label="o._label" :value="idx" />
      </el-select>
    </div>

    <div class="assoc-filter" v-if="currentAsstObj">
      <label class="filter-label">条件筛选</label>
      <el-select v-model="filter.id" placeholder="属性" clearable filterable style="width: 170px" @change="onPropertySelected">
        <el-option v-for="p in filterableProperties" :key="p.bk_property_id" :label="p.bk_property_name" :value="p.bk_property_id" />
      </el-select>
      <el-select v-model="filter.operator" placeholder="操作符" style="width: 130px; margin-left: 8px">
        <el-option v-for="op in OPERATORS" :key="op.value" :label="op.label" :value="op.value" />
      </el-select>
      <el-input
        v-model="filter.value"
        placeholder="值"
        clearable
        style="width: 200px; margin-left: 8px"
        @keyup.enter="search"
      />
      <el-button type="primary" class="btn-search" @click="search">搜索</el-button>
    </div>

    <el-table v-if="currentAsstObj" :data="table.list" v-loading="instLoading" size="default" class="assoc-table">
      <el-table-column :prop="instanceIdKey" label="ID" width="120" show-overflow-tooltip />
      <el-table-column v-if="currentAsstObj === 'host'" prop="bk_host_innerip_v6" label="内网IPv6" min-width="160" show-overflow-tooltip />
      <el-table-column :prop="instanceNameKey" :label="instanceName" min-width="180" show-overflow-tooltip />
      <el-table-column v-if="filter.id && !isBuiltinColumn(filter.id)" :prop="filter.id" :label="filter.name" min-width="160" show-overflow-tooltip />
      <el-table-column label="操作" width="110" fixed="right">
        <template #default="{ row }">
          <el-button v-if="isAssociated(row)" link type="primary" size="small" :loading="deleting" @click="removeAssociation(row)">
            取消关联
          </el-button>
          <el-button v-else link type="primary" size="small" :loading="creating" @click="beforeAdd(row)">
            添加关联
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="currentAsstObj && !instLoading && !table.list.length" description="暂无数据" :image-size="70" />
    <el-pagination
      v-if="currentAsstObj"
      v-model:current-page="page.current"
      v-model:page-size="page.limit"
      :total="table.count"
      layout="total, prev, pager, next"
      style="margin-top: 12px; justify-content: flex-end"
      @current-change="loadInstances"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchAssociationTypes, searchObjectAssociations, searchMainlineModels,
  searchInstanceAssociations, countInstanceAssociations,
  createInstAssociation, deleteInstAssociation,
  searchModelAttributes, searchHostsWithNoAuth, searchBusiness, searchBusinessSets,
  searchInstances, countInstances, searchModels
} from '../../api/cmdb'

const props = defineProps({
  hostId: { type: Number, required: true }
})
const emit = defineEmits(['change'])

// 老版契约: ID/名称字段按模型内置,其余模型 bk_inst_id/bk_inst_name
const ID_KEYS = { host: 'bk_host_id', biz: 'bk_biz_id', plat: 'bk_cloud_id', module: 'bk_module_id', set: 'bk_set_id' }
const NAME_KEYS = {
  bk_host_id: 'bk_host_innerip', bk_biz_id: 'bk_biz_name', bk_cloud_id: 'bk_cloud_name',
  bk_module_id: 'bk_module_name', bk_set_id: 'bk_set_name', bk_inst_id: 'bk_inst_name'
}
const NAME_LABELS = {
  bk_host_innerip: '内网IP', bk_biz_name: '业务名', bk_cloud_name: '管控区域',
  bk_module_name: '模块名', bk_set_name: '集群名', bk_inst_name: '实例名'
}
const OPERATORS = [
  { value: 'equal', label: '=' },
  { value: 'not_equal', label: '≠' },
  { value: 'in', label: 'in' },
  { value: 'not_in', label: 'not in' },
  { value: 'contains', label: 'contains' }
]
// 老版排除 INNER_TABLE/TIME/FOREIGNKEY 类型
const EXCLUDE_TYPES = ['inner_table', 'time', 'foreignkey']

const typeLoading = ref(false)
const instLoading = ref(false)
const creating = ref(false)
const deleting = ref(false)

const asstTypes = ref([])
const assocOptions = ref([])
const selectedIndex = ref('')
const currentOption = ref({})
const currentAsstObj = ref('')
const properties = ref([])
const existList = ref([])

const filter = reactive({ id: '', name: '', operator: 'equal', value: '' })
const page = reactive({ current: 1, limit: 10 })
const table = reactive({ list: [], count: 0 })

const objId = 'host'
const isSource = computed(() => currentOption.value.bk_obj_id === objId)
const instanceIdKey = computed(() => ID_KEYS[currentAsstObj.value] || 'bk_inst_id')
const instanceNameKey = computed(() => NAME_KEYS[instanceIdKey.value] || 'bk_inst_name')
const instanceName = computed(() => NAME_LABELS[instanceNameKey.value] || '实例名')
const multiple = computed(() => currentOption.value.mapping !== '1:1')
const filterableProperties = computed(() =>
  properties.value.filter((p) => !EXCLUDE_TYPES.includes(p.bk_property_type) && p.is_hidden !== true)
)

function isBuiltinColumn(id) {
  return id === instanceIdKey.value || id === instanceNameKey.value
}

onMounted(async () => {
  typeLoading.value = true
  try {
    const [types, asSource, asTarget, mainline] = await Promise.all([
      searchAssociationTypes({}).catch(() => ({ info: [] })),
      searchObjectAssociations({ condition: { bk_obj_id: objId } }).catch(() => []),
      searchObjectAssociations({ condition: { bk_asst_obj_id: objId } }).catch(() => []),
      searchMainlineModels().catch(() => [])
    ])
    asstTypes.value = types?.info || []
    // 老版契约: 主线模型(除 biz/host)不参与实例关联创建;独立后端无 bk_mainline 边,回退内置列表
    const mainlineRaw = Array.isArray(mainline) ? mainline : []
    const mainlineIds = (mainlineRaw.length ? mainlineRaw.map((m) => m.bk_obj_id) : ['biz', 'set', 'module', 'host'])
      .filter((id) => !['biz', 'host'].includes(id))
    const available = (list) => (list || []).filter(
      (r) => !mainlineIds.includes(r.bk_obj_id) && !mainlineIds.includes(r.bk_asst_obj_id)
    )
    const all = [...available(asSource), ...available(asTarget)]
    // 老版契约: label = 方向描述-目标模型名,按 label 去重
    const models = await searchModels({}).catch(() => [])
    const withLabel = all.map((option) => {
      const src = option.bk_obj_id === objId
      const type = asstTypes.value.find((t) => t.bk_asst_id === option.bk_asst_id) || {}
      const targetModelId = src ? option.bk_asst_obj_id : option.bk_obj_id
      const model = (Array.isArray(models) ? models : models?.info || []).find((m) => m.bk_obj_id === targetModelId)
      return { ...option, __target_model: targetModelId, _label: `${src ? type.src_des : type.dest_des}-${model?.bk_obj_name || targetModelId}` }
    })
    const seen = new Set()
    assocOptions.value = withLabel.filter((o) => {
      if (seen.has(o._label)) return false
      seen.add(o._label)
      return true
    })
  } finally {
    typeLoading.value = false
  }
})

async function handleSelectObj(idx) {
  const option = assocOptions.value[idx]
  if (!option) return
  currentOption.value = option
  currentAsstObj.value = option.bk_obj_id === objId ? option.bk_asst_obj_id : option.bk_obj_id
  filter.id = ''
  filter.name = ''
  filter.value = ''
  page.current = 1
  table.list = []
  table.count = 0
  instLoading.value = true
  try {
    const [props, exist] = await Promise.all([
      searchModelAttributes(currentAsstObj.value).catch(() => []),
      loadExistAssociations()
    ])
    properties.value = props || []
    existList.value = exist
  } finally {
    instLoading.value = false
  }
  loadInstances()
}

async function loadExistAssociations() {
  const option = currentOption.value
  // 老版契约: equal 规则按 asst 定义 + 当前实例 id 查已存在关联
  const conditions = {
    condition: 'AND',
    rules: [
      { field: 'bk_asst_id', operator: 'equal', value: option.bk_asst_id },
      { field: 'bk_obj_asst_id', operator: 'equal', value: option.bk_obj_asst_id },
      { field: 'bk_asst_obj_id', operator: 'equal', value: isSource.value ? option.bk_asst_obj_id : objId },
      { field: isSource.value ? 'bk_inst_id' : 'bk_asst_inst_id', operator: 'equal', value: props_hostId() }
    ]
  }
  const countRes = await countInstanceAssociations(isSource.value ? objId : option.bk_obj_id, { conditions }).catch(() => null)
  const count = countRes?.count || 0
  if (!count) return []
  // 后端 page.limit 上限 200,分页拉全
  const PAGE_LIMIT = 200
  const pages = Math.ceil(count / PAGE_LIMIT)
  const all = []
  for (let i = 0; i < pages; i += 1) {
    const res = await searchInstanceAssociations(isSource.value ? objId : option.bk_obj_id, {
      conditions,
      page: { start: i * PAGE_LIMIT, limit: PAGE_LIMIT }
    }).catch(() => ({ info: [] }))
    all.push(...(res?.info || []))
  }
  return all
}

function props_hostId() {
  return props.hostId
}

function isAssociated(row) {
  const targetId = row[instanceIdKey.value]
  return existList.value.some((exist) => (isSource.value ? exist.bk_asst_inst_id : exist.bk_inst_id) === targetId)
}

function buildFilterRule() {
  if (!filter.id || !String(filter.value ?? '').length) return null
  const property = properties.value.find((p) => p.bk_property_id === filter.id)
  let value = filter.value
  if (['in', 'not_in'].includes(filter.operator)) {
    value = String(value).split(',').map((s) => s.trim()).filter(Boolean)
  } else if (property && ['int', 'float'].includes(property.bk_property_type)) {
    const num = Number(value)
    if (!Number.isNaN(num)) value = num
  }
  return { field: filter.id, operator: filter.operator, value }
}

function normalizePage() {
  return { start: (page.current - 1) * page.limit, limit: page.limit, sort: '' }
}

async function loadInstances() {
  const obj = currentAsstObj.value
  if (!obj) return
  instLoading.value = true
  try {
    if (obj === 'host') {
      const rule = buildFilterRule()
      const condition = [
        { bk_obj_id: 'host', condition: rule ? [rule] : [], fields: [] },
        { bk_obj_id: 'biz', condition: [], fields: [] },
        { bk_obj_id: 'module', condition: [], fields: [] },
        { bk_obj_id: 'set', condition: [], fields: [] }
      ]
      const ipFields = ['bk_host_innerip', 'bk_host_outerip']
      const res = await searchHostsWithNoAuth({
        condition,
        ip: {
          flag: ipFields.includes(filter.id) ? filter.id : 'bk_host_innerip|bk_host_outerip',
          exact: 0,
          data: ipFields.includes(filter.id) && String(filter.value).length ? String(filter.value).split(',') : []
        },
        page: normalizePage()
      })
      table.count = res?.count || 0
      table.list = (res?.info || []).map((item) => item.host)
    } else if (obj === 'biz') {
      const rule = buildFilterRule()
      const condition = { bk_data_status: { $ne: 'disabled' } }
      if (rule) condition[rule.field] = { value: rule.value, operator: rule.operator }
      const res = await searchBusiness(normalizePage(), condition)
      table.count = res?.count || 0
      table.list = res?.info || []
    } else if (obj === 'biz_set') {
      const res = await searchBusinessSets(normalizePage())
      table.count = res?.count || 0
      table.list = res?.list || res?.info || []
    } else {
      const rule = buildFilterRule()
      const body = { page: normalizePage(), fields: [] }
      if (rule) body.conditions = { condition: 'AND', rules: [rule] }
      const res = await searchInstances(obj, body)
      table.count = res?.count || 0
      table.list = res?.info || []
    }
  } catch (e) {
    table.list = []
    table.count = 0
  } finally {
    instLoading.value = false
  }
}

function search() {
  page.current = 1
  loadInstances()
}

function onPropertySelected(id) {
  const property = properties.value.find((p) => p.bk_property_id === id)
  filter.name = property?.bk_property_name || ''
}

async function beforeAdd(row) {
  const targetId = row[instanceIdKey.value]
  if (multiple.value || !existList.value.length) {
    return addAssociation(targetId)
  }
  // 老版契约: 1:1 且已有关联时弹出「更新确认」,先删旧再建新
  try {
    await ElMessageBox.confirm('更新确认', '提示', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }
  const old = existList.value[0]
  await deleteInstAssociation(objId, old.id)
  await addAssociation(targetId)
}

async function addAssociation(targetId) {
  creating.value = true
  try {
    await createInstAssociation({
      bk_obj_asst_id: currentOption.value.bk_obj_asst_id,
      bk_inst_id: isSource.value ? props.hostId : targetId,
      bk_asst_inst_id: isSource.value ? targetId : props.hostId
    })
    ElMessage.success('添加关联成功')
    existList.value = await loadExistAssociations()
    emit('change')
  } catch (e) {
    // http 拦截器已提示错误
  } finally {
    creating.value = false
  }
}

async function removeAssociation(row) {
  const targetId = row[instanceIdKey.value]
  const record = existList.value.find((exist) => (isSource.value ? exist.bk_asst_inst_id : exist.bk_inst_id) === targetId)
  if (!record) return
  deleting.value = true
  try {
    await deleteInstAssociation(objId, record.id)
    ElMessage.success('取消关联成功')
    existList.value = await loadExistAssociations()
    emit('change')
  } catch (e) {
    // http 拦截器已提示错误
  } finally {
    deleting.value = false
  }
}
</script>

<style>
.new-association {
  padding: 10px 4px;
  font-size: 14px;
}
.new-association .assoc-filter {
  margin: 10px 0 0;
  display: flex;
  align-items: center;
}
.new-association .filter-label {
  text-align: right;
  width: 56px;
  margin: 0 10px 0 0;
  flex: none;
}
.new-association .btn-search {
  margin-left: 8px;
}
.new-association .assoc-table {
  margin-top: 20px;
}
</style>
