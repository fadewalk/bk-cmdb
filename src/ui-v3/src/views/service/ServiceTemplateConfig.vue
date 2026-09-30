<template>
  <div class="template-config" v-loading="loading">
    <el-alert v-if="error" type="error" :closable="false" show-icon>
      {{ error }} <el-button link type="primary" @click="load">重试</el-button>
    </el-alert>
    <section class="detail-section">
      <div class="section-title">基础信息</div>
      <!-- 模板名称:悬停出编辑笔,回车/失焦触发,修改需二次确认(老版 确认修改名称) -->
      <div class="detail-grid">
        <span>模板名称</span>
        <div class="editable-content">
          <template v-if="nameEditing">
            <span class="name-form">
              <el-input
                ref="nameInput"
                v-model.trim="nameDraft"
                size="small"
                maxlength="256"
                placeholder="模板名称将作为实例化后的模块名"
                :class="{ 'is-name-error': !!nameError }"
                @keyup.enter="trySaveName"
                @blur="trySaveName"
              />
              <p v-if="nameError" class="form-error">{{ nameError }}</p>
            </span>
          </template>
          <template v-else>
            <strong>{{ info.name || '--' }}</strong>
            <i class="bk-cmdb-icon icon-cc-edit-shape property-edit-button" @click="startEditName" />
          </template>
        </div>
      </div>
      <!-- 服务分类:悬停出编辑笔,一级/二级两个下拉,二级变更即保存 -->
      <div class="detail-grid">
        <span>服务分类</span>
        <div class="editable-content">
          <template v-if="categoryEditing">
            <div class="category-container">
              <el-select
                v-model="primaryDraft"
                size="small"
                placeholder="请选择一级分类"
                filterable
                @change="onPrimaryChange"
              >
                <el-option v-for="c in primaryCategories" :key="c.id" :label="`${c.name}（#${c.id}）`" :value="c.id" />
              </el-select>
              <el-select
                v-model="secDraft"
                size="small"
                placeholder="请选择二级分类"
                filterable
                @change="saveCategory"
              >
                <el-option v-for="c in currentSecCategories" :key="c.id" :label="`${c.name}（#${c.id}）`" :value="c.id" />
              </el-select>
            </div>
          </template>
          <template v-else>
            <strong>{{ categoryName }}</strong>
            <i class="bk-cmdb-icon icon-cc-edit-shape property-edit-button" @click="startEditCategory" />
          </template>
        </div>
      </div>
      <div class="section-actions"><el-button type="primary" @click="goEdit">编辑</el-button></div>
    </section>
    <section class="detail-section">
      <div class="section-title">属性设置</div>
      <template v-if="attributeRows.length">
        <div v-for="row in attributeRows" :key="row.attribute.id" class="attribute-row">
          <span class="attribute-name">{{ row.attribute.bk_property_name || row.attribute.bk_property_id }}</span>
          <template v-if="editingId === row.attribute.id">
            <el-input v-model="editingValue" size="small" class="attribute-input" @keyup.enter="saveAttribute(row)" />
            <el-button link type="primary" @click="saveAttribute(row)">保存</el-button>
            <el-button link @click="cancelEdit">取消</el-button>
          </template>
          <template v-else>
            <span class="attribute-value">{{ formatAttrValue(row) }}</span>
            <el-button link @click="startEdit(row)">编辑</el-button>
            <el-popconfirm title="确认删除该字段设置？" confirm-button-text="删除" cancel-button-text="取消" @confirm="removeAttribute(row)">
              <template #reference><el-button link type="danger">删除</el-button></template>
            </el-popconfirm>
          </template>
        </div>
      </template>
      <div v-else-if="!loading && !error" class="attribute-empty">
        当前模板未配置，<el-button link type="primary" @click="goEdit">立即配置</el-button>
      </div>
    </section>
    <section class="detail-section">
      <div class="section-title process-title">
        <span>服务进程</span>
      </div>
      <!-- 老版契约:新建进程按钮 + 提示文案 -->
      <div class="process-create-container">
        <el-button @click="openCreateProcess">新建进程</el-button>
        <span class="create-tips">模板中第一个进程默认为关键进程，服务实例化后的名称会包含此进程的基本信息</span>
      </div>
      <!-- 老版 process.vue 列契约:功能名称/进程别名/启动参数匹配规则/绑定信息 + 查看/编辑/删除 -->
      <el-table v-if="processRows.length" :data="processRows" size="small" border>
        <el-table-column
          v-for="head in processHeaders"
          :key="head.id"
          :label="head.name"
          :min-width="head.id === 'bind_info' ? 200 : 150"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ formatProcessCell(row, head.id) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openViewProcess(row)">查看</el-button>
            <el-button link type="primary" @click="openEditProcess(row)">编辑</el-button>
            <el-button link type="danger" @click="removeProcess(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !error && !processRows.length" description="该模板暂无进程" :image-size="60" />
    </section>
    <ProcessFormDialog
      :visible="processDialog"
      :title="processTitle"
      mode="template"
      :form="processForm"
      :attrs="processAttrs"
      :saving="saving"
      :editing-existing="!!processEditing && !processViewing"
      :info-mode="processViewing"
      @update:visible="processDialog = $event"
      @save="saveProcess"
    />
  </div>
</template>

<script setup>
import { computed, h, nextTick, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import ProcessFormDialog from '../../components/ProcessFormDialog.vue'
import { getServiceTemplateAllInfo, searchModelAttributes, searchServiceCategories, searchProcTemplates, createProcTemplate, updateProcTemplate, deleteProcTemplate, updateServiceTemplateProperty, deleteServiceTemplateProperty, updateServiceTemplate } from '../../api/cmdb'
import { formatPropertyValueDisplay, PROCESS_BIND_IP_OPTIONS } from '../../utils/property-display'

const props = defineProps({ bizId: { type: Number, required: true }, templateId: { type: Number, required: true } })
const emit = defineEmits(['sync-change', 'active-change'])
const router = useRouter()
const loading = ref(true); const saving = ref(false); const error = ref('')
const info = ref({ name: '', service_category_id: 0, attributes: [], processes: [] })
const categories = ref([]); const moduleAttrs = ref([]); const processAttrs = ref([]); const processRows = ref([])
const editingId = ref(null); const editingValue = ref('')
const processDialog = ref(false); const processForm = ref({}); const processEditing = ref(null); const processViewing = ref(false)

// 老版 processTableHeader 列契约
const processHeaders = [
  { id: 'bk_func_name', name: '功能名称' },
  { id: 'bk_process_name', name: '进程别名' },
  { id: 'bk_start_param_regex', name: '启动参数匹配规则' },
  { id: 'bind_info', name: '绑定信息' }
]

// 老版成功提示:内嵌「同步功能」链接切实例 tab
function showSyncTips(kind) {
  const prefix = kind === 'process' ? '成功更新模板进程，您可以通过' : '成功更新模板，您可以通过'
  ElMessage({
    type: 'success',
    duration: 5000,
    message: h('span', { class: 'success-message' }, [
      prefix,
      h('a', { class: 'msg-link', onClick: () => emit('active-change', 'instance') }, '同步功能'),
      '更新服务实例'
    ])
  })
}

const primaryCategories = computed(() => categories.value.filter((c) => !c.bk_parent_id))
const currentSecCategories = computed(() => categories.value.filter((c) => c.bk_parent_id === primaryDraft.value))
const categoryName = computed(() => {
  const current = categories.value.find((item) => item.id === info.value.service_category_id)
  if (!current) return '--'
  const parent = categories.value.find((item) => item.id === current.bk_parent_id)
  return parent ? `${parent.name} / ${current.name}` : current.name
})
const attributeRows = computed(() => (info.value.attributes || []).map((item) => ({
  attribute: moduleAttrs.value.find((attr) => attr.id === item.bk_attribute_id) || { id: item.bk_attribute_id, bk_property_id: item.bk_attribute_id },
  value: item.bk_property_value
})))
function formatAttrValue(row) {
  return formatPropertyValueDisplay(row.attribute, row.value)
}
function formatProcessCell(row, id) {
  if (id === 'bind_info') {
    // 老版 process-bind-info-value:ip 枚举 id 解析为展示值
    return (row.bindRows || []).map((b) => `${PROCESS_BIND_IP_OPTIONS[b.ip] ?? b.ip}:${b.port}`).join('；') || '--'
  }
  return formatPropertyValueDisplay({ bk_property_type: 'singlechar' }, row[id]) ?? '--'
}

// ---------- 名称行内编辑(老版:修改需二次确认) ----------
const nameInput = ref(null)
const nameEditing = ref(false)
const nameDraft = ref('')
const nameError = ref('')
const nameConfirming = ref(false)
function startEditName() {
  nameDraft.value = info.value.name || ''
  nameError.value = ''
  nameEditing.value = true
  nextTick(() => nameInput.value?.focus?.())
}
function validateNameDraft() {
  const value = String(nameDraft.value ?? '').trim()
  if (!value) return '请输入模板名称'
  if (new TextEncoder().encode(value).length > 256) return '模板名称长度不能超过256个字符'
  return ''
}
async function trySaveName() {
  if (!nameEditing.value || nameConfirming.value) return
  nameError.value = validateNameDraft()
  if (nameError.value) return
  if (nameDraft.value === info.value.name) {
    nameEditing.value = false
    return
  }
  // 老版 $bkInfo 二次确认
  nameConfirming.value = true
  try {
    await ElMessageBox.confirm(
      '修改服务模板名称会立刻应用到所有的模块实例，如果您配置了按照名称的筛选条件，可能会影响查询结果。是否确认修改？',
      '确认修改名称',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    nameConfirming.value = false
    nameEditing.value = false
    return
  }
  nameConfirming.value = false
  try {
    await updateServiceTemplate(props.bizId, props.templateId, { name: nameDraft.value })
    info.value.name = nameDraft.value
    emit('sync-change')
  } catch (e) {
    ElMessage.error('名称修改失败: ' + (e?.message || '后端异常'))
  } finally {
    nameEditing.value = false
  }
}

// ---------- 服务分类行内编辑(老版:二级变更即保存) ----------
const categoryEditing = ref(false)
const primaryDraft = ref('')
const secDraft = ref('')
function startEditCategory() {
  const current = categories.value.find((item) => item.id === info.value.service_category_id)
  primaryDraft.value = current?.bk_parent_id || ''
  secDraft.value = info.value.service_category_id || ''
  categoryEditing.value = true
}
function onPrimaryChange() {
  secDraft.value = ''
}
async function saveCategory() {
  if (!secDraft.value) return
  if (secDraft.value === info.value.service_category_id) {
    categoryEditing.value = false
    return
  }
  try {
    await updateServiceTemplate(props.bizId, props.templateId, { service_category_id: secDraft.value })
    info.value.service_category_id = secDraft.value
    categoryEditing.value = false
    emit('sync-change')
    ElMessage.success('修改成功！服务分类调整后无需同步')
  } catch (e) {
    ElMessage.error('分类修改失败: ' + (e?.message || '后端异常'))
  }
}

function normalizeBindRows(bindInfo) {
  return (bindInfo?.value || []).map((row) => ({
    row_id: row.row_id || 1,
    ip: row.ip?.value ?? row.ip ?? '1',
    protocol: row.protocol?.value ?? row.protocol ?? '1',
    port: row.port?.value?.value ?? row.port?.value ?? row.port ?? '',
    enable: row.enable?.value ?? row.enable ?? true,
    // 老版契约:锁定状态随模板行 as_default_value 还原
    __lock: {
      ip: !!row.ip?.as_default_value,
      port: !!row.port?.as_default_value,
      protocol: !!row.protocol?.as_default_value,
      enable: !!row.enable?.as_default_value
    }
  }))
}
function flattenProcess(row) {
  const value = (key) => row.property?.[key]?.value
  return {
    id: row.id,
    serviceTemplateId: row.service_template_id,
    ...Object.fromEntries(Object.entries(row.property || {}).map(([key, val]) => [key, val?.value])),
    bk_func_name: value('bk_func_name') || '-',
    bindRows: normalizeBindRows(row.property?.bind_info),
    rawProperty: row.property || {}
  }
}
function processFormFromRow(row) {
  // __init_locks:字段级锁(as_default_value);__initial_property:老版 changedValues 对比基线
  const initLocks = {}
  Object.entries(row.rawProperty || {}).forEach(([key, val]) => { initLocks[key] = !!val?.as_default_value })
  return {
    ...row,
    __bind_rows: row.bindRows?.length ? row.bindRows.map((item) => ({ ...item })) : [],
    __init_locks: initLocks,
    __initial_property: row.rawProperty
  }
}
async function load() {
  loading.value = true; error.value = ''
  try {
    const [detail, attrs, procAttrs, categoryData, processes] = await Promise.all([
      getServiceTemplateAllInfo(props.bizId, props.templateId),
      searchModelAttributes('module', props.bizId),
      searchModelAttributes('process', props.bizId),
      searchServiceCategories(props.bizId),
      searchProcTemplates(props.bizId, { service_template_id: props.templateId, page: { start: 0, limit: 100 } })
    ])
    info.value = detail || info.value; moduleAttrs.value = attrs || []; processAttrs.value = procAttrs || []
    categories.value = categoryData?.info || categoryData || []; processRows.value = (processes?.info || []).map(flattenProcess)
  } catch (e) { error.value = e?.message || '服务模板详情加载失败' } finally { loading.value = false }
}
function goEdit() { router.push(`/business/${props.bizId}/service/template/edit/${props.templateId}`) }
function startEdit(row) { editingId.value = row.attribute.id; editingValue.value = row.value ?? '' }
function cancelEdit() { editingId.value = null; editingValue.value = '' }
async function saveAttribute(row) { try { const saveValue = ['int', 'float'].includes(row.attribute.bk_property_type) ? Number(editingValue.value) : editingValue.value; await updateServiceTemplateProperty({ id: props.templateId, bk_biz_id: props.bizId, attributes: [{ bk_attribute_id: row.attribute.id, bk_property_value: saveValue }] }); row.value = saveValue; cancelEdit(); emit('sync-change'); showSyncTips('config') } catch (e) { ElMessage.error(`属性更新失败: ${e?.message || '后端异常'}`) } }
async function removeAttribute(row) { try { await deleteServiceTemplateProperty({ id: props.templateId, bk_biz_id: props.bizId, bk_attribute_ids: [row.attribute.id] }); info.value.attributes = info.value.attributes.filter((item) => item.bk_attribute_id !== row.attribute.id); emit('sync-change'); ElMessage.success('成功更新模板') } catch (e) { ElMessage.error(`属性删除失败: ${e?.message || '后端异常'}`) } }
function openCreateProcess() {
  processViewing.value = false
  processEditing.value = null
  processForm.value = { __bind_rows: [{ ip: '1', protocol: '1', port: '', enable: true }] }
  processDialog.value = true
}
function openEditProcess(row) {
  processViewing.value = false
  processEditing.value = row
  processForm.value = processFormFromRow(row)
  processDialog.value = true
}
function openViewProcess(row) {
  processEditing.value = row
  processViewing.value = true
  processForm.value = processFormFromRow(row)
  processDialog.value = true
}
const processTitle = computed(() => {
  if (processEditing.value && processEditing.value.bk_func_name && processEditing.value.bk_func_name !== '-') return processEditing.value.bk_func_name
  return '添加进程'
})
async function saveProcess(payload) {
  const { property } = payload || {}
  saving.value = true
  try {
    if (processEditing.value) await updateProcTemplate(props.bizId, processEditing.value.id, property)
    else await createProcTemplate(props.bizId, props.templateId, property)
    processDialog.value = false
    await load()
    emit('sync-change')
    showSyncTips('process')
  } catch (e) {
    ElMessage.error(`进程模板保存失败: ${e?.message || '后端异常'}`)
  } finally { saving.value = false }
}
async function removeProcess(row) {
  try {
    await ElMessageBox.confirm('确认删除模板进程？', '确认删除模板进程', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' })
    await deleteProcTemplate(props.bizId, row.id)
    await load()
    emit('sync-change')
    ElMessage.success('成功更新模板')
  } catch (e) { if (e !== 'cancel') ElMessage.error(`删除失败: ${e?.message || '后端异常'}`) }
}
onMounted(load)
</script>

<style scoped>
.template-config { padding: 16px 0; }
.detail-section { background: #fff; padding: 18px 22px; margin-bottom: 14px; }
.section-title { font-size: 15px; color: #313238; margin-bottom: 14px; font-weight: 500; }
.process-title { display: flex; justify-content: space-between; align-items: center; }
.detail-grid, .attribute-row { display: flex; align-items: center; min-height: 38px; gap: 14px; border-bottom: 1px solid #f0f1f5; }
.detail-grid span, .attribute-name { width: 180px; color: #63656e; }
.attribute-value { flex: 1; color: #313238; }
.attribute-input { width: 280px; }
.section-actions { margin-top: 16px; }
.attribute-empty { color: #63656E; font-size: 12px; display: flex; align-items: center; }
/* 行内编辑(老版 editable-content:hover 出编辑笔) */
.editable-content { display: flex; align-items: center; flex: 1; gap: 8px; min-width: 0; }
.property-edit-button { display: none; font-size: 14px; color: #979BA5; cursor: pointer; }
.editable-content:hover .property-edit-button { display: inline-block; }
.property-edit-button:hover { color: #3A84FF; }
.name-form { width: 300px; }
.name-form .form-error, .form-error { margin-top: 4px; font-size: 12px; color: #EA3636; line-height: 16px; }
.is-name-error :deep(.el-input__wrapper) { box-shadow: 0 0 0 1px #EA3636 inset; }
.category-container { display: flex; flex: 1; gap: 8px; }
.category-container .el-select { flex: 1; }
.process-create-container { display: flex; align-items: center; gap: 8px; padding-bottom: 14px; }
.create-tips { color: #63656E; font-size: 12px; }
:global(.success-message .msg-link) { color: #3A84FF; cursor: pointer; margin: 0 2px; }
</style>
