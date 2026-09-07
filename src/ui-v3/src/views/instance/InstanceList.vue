<template>
  <div class="inst-page" v-loading="loading">
    <div class="inst-head">
      <span class="back-btn" @click="goBack">‹ 资源</span>
      <span class="inst-title">{{ model?.bk_obj_name || objId }} <span class="inst-sub">{{ objId }}</span></span>
      <div class="spacer" />
      <el-button type="primary" :icon="'Plus'" @click="openForm()">新建</el-button>
      <el-button :disabled="!selected.length" @click="batchRemove">删除</el-button>
    </div>

    <div class="inst-toolbar">
      <el-input
        v-model="keyword"
        placeholder="请输入实例名称"
        size="small"
        clearable
        style="width: 240px"
        :prefix-icon="'Search'"
        @keyup.enter="reload"
        @clear="reload"
      />
      <div class="spacer" />
      <el-button size="small" :icon="'Refresh'" @click="load">刷新</el-button>
    </div>

    <el-table :data="rows" size="small" stripe @selection-change="onSelect">
      <el-table-column type="selection" width="36" />
      <el-table-column label="实例 ID" prop="bk_inst_id" width="100" />
      <el-table-column label="实例名称" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <el-link type="primary" :underline="false" @click="openDetail(row)">
            {{ row.bk_inst_name || `#${row.bk_inst_id ?? row.id}` }}
          </el-link>
        </template>
      </el-table-column>
      <el-table-column
        v-for="col in displayCols"
        :key="col.bk_property_id"
        :label="col.bk_property_name"
        min-width="140"
        show-overflow-tooltip
      >
        <template #default="{ row }">{{ cellText(row[col.bk_property_id], col) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openForm(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="removeRow(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="inst-footer">
      <span>共计{{ total }}条</span>
      <span class="selected-info">已选择{{ selected.length }}条</span>
      <div class="spacer" />
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        @current-change="load"
      />
    </div>

    <!-- 新建/编辑实例 -->
    <el-dialog v-model="formVisible" :title="formInstId ? '编辑实例' : '新建实例'" width="560px">
      <el-form label-width="140px">
        <el-form-item label="实例名称" required>
          <el-input v-model="formMap.bk_inst_name" />
        </el-form-item>
        <el-form-item
          v-for="f in editableAttrs"
          :key="f.bk_property_id"
          :label="f.bk_property_name"
          :required="!!f.isrequired"
        >
          <el-select v-if="enumOptions(f).length" v-model="formMap[f.bk_property_id]" clearable style="width: 100%">
            <el-option v-for="o in enumOptions(f)" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
          <el-switch
            v-else-if="f.bk_property_type === 'bool'"
            v-model="formMap[f.bk_property_id]"
          />
          <el-date-picker
            v-else-if="f.bk_property_type === 'date'"
            v-model="formMap[f.bk_property_id]"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
          <el-date-picker
            v-else-if="f.bk_property_type === 'time'"
            v-model="formMap[f.bk_property_id]"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
          <el-input-number
            v-else-if="f.bk_property_type === 'int'"
            v-model="formMap[f.bk_property_id]"
            :controls="false"
            style="width: 100%"
          />
          <el-input v-else v-model="formMap[f.bk_property_id]" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <!-- 实例详情 -->
    <el-drawer v-model="detailVisible" :title="detailRow ? (detailRow.bk_inst_name || `实例 ${detailInstId}`) : '实例详情'" size="520px">
      <el-tabs v-model="detailTab">
        <el-tab-pane label="属性" name="props" />
        <el-tab-pane label="变更历史" name="history" />
      </el-tabs>
      <template v-if="detailTab === 'props'">
        <el-descriptions v-if="detailRow" :column="1" border size="small">
          <el-descriptions-item v-for="(v, k) in detailProps" :key="k" :label="attrName(k)">
            {{ v === null || v === '' || v === undefined ? '--' : v }}
          </el-descriptions-item>
        </el-descriptions>
      </template>
      <template v-else>
        <el-table :data="auditRows" v-loading="auditLoading" size="small">
          <el-table-column label="操作人" prop="user" width="110" />
          <el-table-column label="操作" width="90">
            <template #default="{ row }">{{ actionName(row.action) }}</template>
          </el-table-column>
          <el-table-column label="实例名称" prop="resource_name" min-width="140" show-overflow-tooltip />
          <el-table-column label="时间" min-width="150">
            <template #default="{ row }">{{ (row.operation_time || '').replace('T', ' ').slice(0, 19) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!auditLoading && auditRows.length === 0" description="暂无变更记录" :image-size="60" />
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchModels, searchModelAttributes,
  searchInstances, countInstances,
  createInstance, updateInstance, deleteInstance, deleteInstances,
  searchInstAudit
} from '../../api/cmdb'

const route = useRoute()
const router = useRouter()
const objId = computed(() => String(route.params.objId || ''))

const SYSTEM_FIELDS = ['bk_inst_id', 'bk_inst_name', 'bk_supplier_account', 'bk_created_by', 'bk_created_at', 'bk_updated_by', 'bk_updated_at']

const model = ref(null)
const attrs = ref([])
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const keyword = ref('')
const selected = ref([])
const loading = ref(false)
const saving = ref(false)

const formVisible = ref(false)
const formInstId = ref(null)
const formMap = ref({})
const detailVisible = ref(false)
const detailRow = ref(null)
const detailInstId = ref(null)
const detailTab = ref('props')
const auditRows = ref([])
const auditLoading = ref(false)

const AUDIT_ACTIONS = {
  create: '新增', update: '修改', delete: '删除',
  assign_host: '分配主机', unassign_host: '回收主机',
  transfer_host_module: '转移模块', archive: '归档', recover: '恢复'
}
function actionName(a) { return AUDIT_ACTIONS[a] || a || '--' }

async function loadAudit() {
  if (!detailInstId.value) return
  auditLoading.value = true
  try {
    const data = await searchInstAudit({
      condition: { bk_obj_id: objId.value, resource_type: 'model_instance', resource_id: detailInstId.value },
      page: { start: 0, limit: 50, sort: '-operation_time' }
    })
    auditRows.value = data?.info || []
  } catch {
    auditRows.value = []
  } finally {
    auditLoading.value = false
  }
}

watch(detailTab, (v) => {
  if (v === 'history' && !auditRows.value.length && !auditLoading.value) loadAudit()
})

// 展示列:跳过系统字段,最多展示 6 个,长字符排后
const displayCols = computed(() => attrs.value
  .filter((f) => !SYSTEM_FIELDS.includes(f.bk_property_id))
  .sort((a, b) => (a.bk_property_type === 'longchar' ? 1 : 0) - (b.bk_property_type === 'longchar' ? 1 : 0))
  .slice(0, 6))

const editableAttrs = computed(() => attrs.value
  .filter((f) => !SYSTEM_FIELDS.includes(f.bk_property_id) && !f.ispre && f.bk_property_id !== 'bk_inst_name'))

const detailProps = computed(() => {
  if (!detailRow.value) return {}
  const out = {}
  for (const [k, v] of Object.entries(detailRow.value)) {
    if (v === null || typeof v !== 'object') out[k] = v
  }
  return out
})

function goBack() { router.push('/resource/index') }

function enumOptions(f) {
  const opt = f.option
  if (Array.isArray(opt)) return opt.filter((o) => o && o.id !== undefined)
  if (opt && typeof opt === 'object') {
    // 嵌套枚举:取叶子节点的 id/name
    const out = []
    const walk = (node) => {
      for (const child of Object.values(node)) {
        if (child && typeof child === 'object') {
          if (child.id !== undefined) out.push({ id: child.id, name: child.name })
          else walk(child)
        }
      }
    }
    walk(opt)
    return out
  }
  return []
}

function attrName(key) {
  if (key === 'bk_inst_id') return '实例 ID'
  if (key === 'bk_inst_name') return '实例名称'
  return attrs.value.find((f) => f.bk_property_id === key)?.bk_property_name || key
}

function cellText(value, col) {
  if (value === null || value === undefined || value === '') return '--'
  if (col.bk_property_type === 'bool') return value ? '是' : '否'
  if (col.bk_property_type === 'enum') {
    return enumOptions(col).find((o) => o.id === value)?.name ?? String(value)
  }
  return String(value)
}

function buildFilter() {
  if (!keyword.value.trim()) return undefined
  return {
    condition: 'AND',
    rules: [{ field: 'bk_inst_name', operator: 'contains', value: keyword.value.trim() }]
  }
}

async function loadModel() {
  const all = await searchModels({ condition: { bk_obj_id: objId.value } })
  model.value = (all || [])[0] || null
}

async function loadAttrs() {
  attrs.value = (await searchModelAttributes(objId.value).catch(() => [])) || []
}

async function load() {
  loading.value = true
  try {
    const conditions = buildFilter()
    const body = { page: { start: (page.value - 1) * pageSize, limit: pageSize }, fields: [] }
    if (conditions) body.conditions = conditions
    const [data, count] = await Promise.all([
      searchInstances(objId.value, body),
      countInstances(objId.value, { conditions })
    ])
    rows.value = data?.info || []
    total.value = count?.count ?? rows.value.length
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load()
}

function onSelect(rows) {
  selected.value = rows
}

function instIdOf(row) {
  return row.bk_inst_id ?? row.id
}

function openForm(row) {
  if (row) {
    formInstId.value = instIdOf(row)
    formMap.value = { bk_inst_name: row.bk_inst_name }
    for (const f of editableAttrs.value) {
      formMap.value[f.bk_property_id] = row[f.bk_property_id] ?? (f.bk_property_type === 'bool' ? false : '')
    }
  } else {
    formInstId.value = null
    formMap.value = { bk_inst_name: '' }
    for (const f of editableAttrs.value) {
      formMap.value[f.bk_property_id] = f.bk_property_type === 'bool' ? false : ''
    }
  }
  formVisible.value = true
}

async function submitForm() {
  if (!String(formMap.value.bk_inst_name || '').trim()) {
    ElMessage.warning('请填写实例名称')
    return
  }
  const missing = editableAttrs.value.filter((f) => {
    if (!f.isrequired) return false
    const v = formMap.value[f.bk_property_id]
    return v === '' || v === null || v === undefined
  })
  if (missing.length) {
    ElMessage.warning(`请填写必填字段: ${missing.map((f) => f.bk_property_name).join('、')}`)
    return
  }
  saving.value = true
  try {
    if (formInstId.value) {
      await updateInstance(objId.value, formInstId.value, { ...formMap.value })
      ElMessage.success('实例已更新')
    } else {
      await createInstance(objId.value, { ...formMap.value, bk_supplier_account: '0' })
      ElMessage.success('实例已创建')
    }
    formVisible.value = false
    await load()
  } finally {
    saving.value = false
  }
}

async function removeRow(row) {
  try {
    await ElMessageBox.confirm(`确定删除实例「${row.bk_inst_name || instIdOf(row)}」?`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  await deleteInstance(objId.value, instIdOf(row))
  ElMessage.success('已删除')
  await load()
}

async function batchRemove() {
  const ids = selected.value.map(instIdOf)
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${ids.length} 个实例?`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  await deleteInstances(objId.value, ids)
  ElMessage.success('已删除')
  selected.value = []
  await load()
}

function openDetail(row) {
  detailRow.value = row
  detailInstId.value = instIdOf(row)
  detailTab.value = 'props'
  auditRows.value = []
  detailVisible.value = true
}

watch(objId, () => {
  if (objId.value) {
    model.value = null
    attrs.value = []
    reload()
    loadModel()
    loadAttrs()
  }
})

onMounted(async () => {
  await Promise.all([loadModel(), loadAttrs()])
  await load()
  // 旧版深链 /resource/instance/:objId/:instId → 重定向带 query,打开详情抽屉
  const fromQuery = Number(route.query.instId)
  if (fromQuery) {
    const row = rows.value.find((r) => instIdOf(r) === fromQuery)
    if (row) openDetail(row)
  }
})
</script>

<style scoped>
.inst-page { height: 100%; display: flex; flex-direction: column; background: #fff; overflow: hidden; }
.inst-head {
  display: flex; align-items: center; gap: 10px;
  padding: 0 20px; height: 50px; flex: 0 0 50px;
  border-bottom: 1px solid #E7E9EF;
}
.back-btn { cursor: pointer; color: #3A84FF; font-size: 14px; }
.inst-title { font-size: 14px; color: #313238; font-weight: 600; }
.inst-sub { font-size: 12px; color: #979BA5; font-weight: 400; margin-left: 4px; }
.inst-head .spacer { flex: 1; }
.inst-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 20px 0;
}
.inst-toolbar .spacer { flex: 1; }
.inst-footer {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 20px; font-size: 12px; color: #63656E;
}
.inst-footer .spacer { flex: 1; }
.selected-info { color: #979BA5; }
</style>
