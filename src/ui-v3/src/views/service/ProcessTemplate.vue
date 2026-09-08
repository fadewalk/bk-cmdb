<template>
  <div class="page-card process-template-page">
    <h1 class="page-title">进程模板</h1>
    <p class="page-tips">进程模板定义服务的启动、停止和端口配置，绑定到服务模板后可批量同步到业务模块。</p>

    <div class="toolbar">
      <el-select v-model="selectedBizId" placeholder="选择业务" filterable style="width: 240px" @change="loadTemplates">
        <el-option v-for="biz in bizStore.bizList" :key="biz.bk_biz_id" :label="biz.bk_biz_name" :value="biz.bk_biz_id" />
      </el-select>
      <el-select v-model="selectedServiceTemplateId" placeholder="选择服务模板" filterable clearable style="width: 260px" :disabled="!selectedBizId" @change="loadTemplates">
        <el-option v-for="template in serviceTemplates" :key="template.id" :label="template.name" :value="template.id" />
      </el-select>
      <el-input v-model="keyword" placeholder="搜索进程名称" clearable style="width: 220px" @keyup.enter="loadTemplates" @clear="loadTemplates" />
      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="loadTemplates">刷新</el-button>
      <el-button type="primary" :icon="'Plus'" :disabled="!selectedServiceTemplateId" @click="openCreate">新建进程模板</el-button>
    </div>

    <el-table :data="filteredTemplates" v-loading="loading" stripe class="process-table">
      <el-table-column prop="id" label="ID" width="90" />
      <el-table-column prop="service_template_name" label="服务模板" min-width="180" show-overflow-tooltip />
      <el-table-column prop="bk_func_name" label="功能名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="bk_process_name" label="进程名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="port" label="端口" width="110" />
      <el-table-column prop="user" label="启动用户" width="120" />
      <el-table-column prop="work_path" label="工作路径" min-width="160" show-overflow-tooltip />
      <el-table-column label="启用" width="90">
        <template #default="{ row }">
          <el-tag :type="row.auto_start ? 'success' : 'info'" size="small">{{ row.auto_start ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && filteredTemplates.length === 0" description="暂无进程模板" :image-size="80" />

    <ProcessFormDialog
      :visible="formVisible"
      :title="editing ? '编辑进程模板' : '新建进程模板'"
      mode="template"
      :form="form"
      :attrs="processAttrs"
      :saving="saving"
      @update:visible="formVisible = $event"
      @save="save"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ProcessFormDialog from '../../components/ProcessFormDialog.vue'
import {
  searchServiceTemplates,
  searchProcTemplates,
  createProcTemplate,
  updateProcTemplate,
  deleteProcTemplate,
  searchModelAttributes
} from '../../api/cmdb'
import { useBizStore } from '../../stores/biz'

const bizStore = useBizStore()
const selectedBizId = ref(null)
const selectedServiceTemplateId = ref(null)
const serviceTemplates = ref([])
const processTemplates = ref([])
const keyword = ref('')
const loading = ref(false)
const saving = ref(false)
const formVisible = ref(false)
const editing = ref(null)

// 进程模型属性(动态渲染全量字段,对齐老版)
const processAttrs = ref([])

const form = reactive({
  __bind_rows: []
})

const filteredTemplates = computed(() => {
  const value = keyword.value.trim().toLowerCase()
  if (!value) return processTemplates.value
  return processTemplates.value.filter((item) =>
    [item.bk_func_name, item.bk_process_name, item.user, item.work_path]
      .some((field) => String(field || '').toLowerCase().includes(value))
  )
})

function readProperty(property, name, fallback = '') {
  const value = property?.[name]?.value
  return value === undefined || value === null ? fallback : value
}

function flattenTemplate(item) {
  const property = item.property || {}
  const bind = property.bind_info?.value?.[0]
  // 展开全量 property 值(供动态表单编辑)
  const flat = {}
  for (const [k, v] of Object.entries(property)) {
    if (v && typeof v === 'object' && 'value' in v) flat[k] = (v.value && typeof v.value === 'object' && 'value' in v.value) ? v.value.value : v.value
    else flat[k] = v
  }
  return {
    id: item.id,
    service_template_id: item.service_template_id,
    service_template_name: serviceTemplates.value.find((template) => template.id === item.service_template_id)?.name || `模板 ${item.service_template_id}`,
    ...flat,
    bk_func_name: readProperty(property, 'bk_func_name', '-'),
    bk_process_name: readProperty(property, 'bk_process_name', '-'),
    user: readProperty(property, 'user', '-'),
    work_path: readProperty(property, 'work_path', '-'),
    start_cmd: readProperty(property, 'start_cmd'),
    stop_cmd: readProperty(property, 'stop_cmd'),
    description: readProperty(property, 'description'),
    auto_start: Boolean(readProperty(property, 'auto_start', false)),
    port: bind?.port?.value?.value || bind?.port?.value || '-',
    bindIp: bind?.ip?.value?.value || bind?.ip?.value || '1',
    bindProtocol: bind?.protocol?.value?.value || bind?.protocol?.value || '1',
    bindRowId: bind?.row_id,
    property
  }
}

function propertyForForm(row) {
  const next = { __bind_rows: [] }
  for (const f of processAttrs.value) {
    if (f.bk_property_id === 'bind_info') continue
    const v = row?.[f.bk_property_id]
    if (f.bk_property_type === 'bool') {
      next[f.bk_property_id] = v === undefined ? false : Boolean(v)
    } else if (['int', 'float'].includes(f.bk_property_type)) {
      // 数值控件初始 undefined:el-input-number 会把 '' 规整为 0,导致 0 被误提交
      next[f.bk_property_id] = v === undefined || v === null || v === '' ? undefined : v
    } else {
      next[f.bk_property_id] = v === undefined || v === null ? '' : v
    }
  }
  if (!processAttrs.value.length) {
    next.bk_func_name = row?.bk_func_name === '-' ? '' : row?.bk_func_name || ''
    next.bk_process_name = row?.bk_process_name === '-' ? '' : row?.bk_process_name || row?.bk_func_name || ''
    next.user = row?.user === '-' ? '' : row?.user || ''
    next.work_path = row?.work_path === '-' ? '' : row?.work_path || ''
    next.start_cmd = row?.start_cmd || ''
    next.stop_cmd = row?.stop_cmd || ''
    next.description = row?.description || ''
  }
  if (next.bk_func_name === '-') next.bk_func_name = ''
  // bind_info 多行回显(property.bind_info.value 为 {ip:{value},port:{value},...} 数组)
  const bindRows = row?.property?.bind_info?.value
  if (Array.isArray(bindRows)) {
    next.__bind_rows = bindRows.map((r) => ({
      row_id: r.row_id,
      ip: String(r.ip?.value?.value ?? r.ip?.value ?? '1'),
      protocol: String(r.protocol?.value?.value ?? r.protocol?.value ?? '1'),
      port: String(r.port?.value?.value ?? r.port?.value ?? ''),
      enable: r.enable?.value?.value ?? r.enable?.value ?? true
    }))
  }
  return next
}

function buildProperty() {
  const property = {}
  for (const f of processAttrs.value) {
    if (f.bk_property_id === 'bind_info') continue
    const v = form[f.bk_property_id]
    const hasValue = v !== '' && v !== null && v !== undefined
    // 空值直接省略:后端对 int 等类型的 null 值会校验拒绝
    if (!hasValue && f.bk_property_type !== 'bool') continue
    property[f.bk_property_id] = {
      value: hasValue ? v : (f.bk_property_type === 'bool' ? false : null),
      as_default_value: hasValue
    }
  }
  property.bind_info = {
    value: (form.__bind_rows || [])
      .filter((r) => String(r.port || '').trim() !== '')
      .map((r, i) => ({
        row_id: r.row_id ?? i + 1,
        ip: { value: r.ip || '1', as_default_value: true },
        port: { value: String(r.port), as_default_value: true },
        protocol: { value: r.protocol || '1', as_default_value: true },
        enable: { value: r.enable !== false, as_default_value: true }
      })),
    as_default_value: true
  }
  return property
}

async function loadTemplates() {
  processTemplates.value = []
  if (!selectedBizId.value) return
  loading.value = true
  try {
    const data = await searchProcTemplates(selectedBizId.value, {
      service_template_id: selectedServiceTemplateId.value || undefined,
      page: { start: 0, limit: 200 }
    })
    processTemplates.value = (data?.info || []).map(flattenTemplate)
  } catch (error) {
    ElMessage.error('进程模板加载失败: ' + (error?.message || '后端异常'))
  } finally {
    loading.value = false
  }
}

async function loadServiceTemplates() {
  if (!selectedBizId.value) return
  try {
    const data = await searchServiceTemplates(selectedBizId.value, { start: 0, limit: 200 })
    serviceTemplates.value = data?.info || []
  } catch {
    serviceTemplates.value = []
  }
}

function openCreate() {
  editing.value = null
  Object.assign(form, propertyForForm())
  formVisible.value = true
}

function openEdit(row) {
  editing.value = row
  Object.assign(form, propertyForForm(row))
  formVisible.value = true
}

async function save() {
  if (!selectedBizId.value || !selectedServiceTemplateId.value) {
    ElMessage.warning('请先选择业务和服务模板')
    return
  }
  if (!form.bk_func_name) {
    ElMessage.warning('请输入进程名称')
    return
  }
  const missing = processAttrs.value.filter((f) => {
    if (!f.isrequired || f.bk_property_id === 'bk_func_name') return false
    // 进程别名跟随进程名称(对齐老版自动带出),不单独校验
    if (f.bk_property_id === 'bk_process_name') return false
    const v = form[f.bk_property_id]
    return v === '' || v === null || v === undefined
  })
  if (missing.length) {
    ElMessage.warning(`请填写必填字段: ${missing.map((f) => f.bk_property_name).join('、')}`)
    return
  }
  if (!String(form.bk_process_name || '').trim()) form.bk_process_name = form.bk_func_name
  saving.value = true
  try {
    const property = buildProperty()
    if (editing.value) {
      await updateProcTemplate(selectedBizId.value, editing.value.id, property)
      ElMessage.success('进程模板已更新')
    } else {
      await createProcTemplate(selectedBizId.value, selectedServiceTemplateId.value, property)
      ElMessage.success('进程模板已创建')
    }
    formVisible.value = false
    await loadTemplates()
  } catch (error) {
    ElMessage.error('进程模板保存失败: ' + (error?.message || '后端异常'))
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  await ElMessageBox.confirm(`确定删除进程模板「${row.bk_func_name}」?`, '删除确认', { type: 'warning' })
  try {
    await deleteProcTemplate(selectedBizId.value, row.id)
    ElMessage.success('进程模板已删除')
    await loadTemplates()
  } catch (error) {
    ElMessage.error('删除失败: ' + (error?.message || '后端异常'))
  }
}

watch(() => bizStore.bizId, async (value) => {
  selectedBizId.value = value
  selectedServiceTemplateId.value = null
  await loadServiceTemplates()
  await loadTemplates()
})

async function loadProcessAttrs() {
  try {
    processAttrs.value = (await searchModelAttributes('process')) || []
  } catch {
    processAttrs.value = []
  }
}

onMounted(async () => {
  await bizStore.ensureLoaded()
  loadProcessAttrs()
  selectedBizId.value = bizStore.bizId
  await loadServiceTemplates()
  await loadTemplates()
})
</script>

<style scoped>
.process-template-page { padding: 0 20px 20px; }
.page-title { margin: 0 -20px; padding: 0 20px; height: 50px; line-height: 50px; border-bottom: 1px solid #E7E9EF; color: #313238; font-size: 16px; font-weight: 400; }
.page-tips { margin: 0 -20px 14px; padding: 10px 20px; color: #979BA5; background: #F0F5FF; border-bottom: 1px solid #E7E9EF; font-size: 12px; }
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.spacer { flex: 1; }
.process-table { width: 100%; }
.drawer-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.drawer-count { color: #979BA5; font-size: 12px; }
</style>
