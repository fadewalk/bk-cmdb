<template>
  <div class="template-config" v-loading="loading">
    <el-alert v-if="error" type="error" :closable="false" show-icon :title="error" />
    <section class="detail-section">
      <div class="section-title">基础信息</div>
      <div class="detail-grid"><span>模板名称</span><strong>{{ info.name || '--' }}</strong></div>
      <div class="detail-grid"><span>服务分类</span><strong>{{ categoryName }}</strong></div>
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
            <span class="attribute-value">{{ row.value ?? '--' }}</span>
            <el-button link @click="startEdit(row)">编辑</el-button>
            <el-popconfirm title="确认删除该字段设置？" confirm-button-text="删除" cancel-button-text="取消" @confirm="removeAttribute(row)">
              <template #reference><el-button link type="danger">删除</el-button></template>
            </el-popconfirm>
          </template>
        </div>
      </template>
      <el-empty v-else-if="!loading" description="当前模板未配置属性" :image-size="60" />
    </section>
    <section class="detail-section">
      <div class="section-title process-title"><span>服务进程</span><el-button type="primary" size="small" @click="openCreateProcess">新增进程模板</el-button></div>
      <el-table :data="processRows" size="small" border>
        <el-table-column label="进程名称" min-width="160"><template #default="{ row }">{{ row.bk_func_name || '--' }}</template></el-table-column>
        <el-table-column label="端口" width="110"><template #default="{ row }">{{ row.port || '--' }}</template></el-table-column>
        <el-table-column label="启动用户" width="120"><template #default="{ row }">{{ row.user || '--' }}</template></el-table-column>
        <el-table-column label="工作路径" min-width="180"><template #default="{ row }">{{ row.work_path || '--' }}</template></el-table-column>
        <el-table-column label="操作" width="130"><template #default="{ row }"><el-button link type="primary" @click="openEditProcess(row)">编辑</el-button><el-button link type="danger" @click="removeProcess(row)">删除</el-button></template></el-table-column>
      </el-table>
      <el-empty v-if="!loading && !processRows.length" description="该模板暂无进程" :image-size="60" />
    </section>
    <ProcessFormDialog :visible="processDialog" title="进程模板" mode="template" :form="processForm" :attrs="processAttrs" :saving="saving" @update:visible="processDialog = $event" @save="saveProcess" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import ProcessFormDialog from '../../components/ProcessFormDialog.vue'
import { getServiceTemplateAllInfo, searchModelAttributes, searchServiceCategories, searchProcTemplates, createProcTemplate, updateProcTemplate, deleteProcTemplate, updateServiceTemplateProperty, deleteServiceTemplateProperty } from '../../api/cmdb'

const props = defineProps({ bizId: { type: Number, required: true }, templateId: { type: Number, required: true } })
const emit = defineEmits(['sync-change'])
const router = useRouter()
const loading = ref(true); const saving = ref(false); const error = ref('')
const info = ref({ name: '', service_category_id: 0, attributes: [], processes: [] })
const categories = ref([]); const moduleAttrs = ref([]); const processAttrs = ref([]); const processRows = ref([])
const editingId = ref(null); const editingValue = ref('')
const processDialog = ref(false); const processForm = ref({}); const processEditing = ref(null)

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
function normalizeBindRows(bindInfo) {
  return (bindInfo?.value || []).map((row) => ({
    row_id: row.row_id || 1,
    ip: row.ip?.value ?? row.ip ?? '1',
    protocol: row.protocol?.value ?? row.protocol ?? '1',
    port: row.port?.value?.value ?? row.port?.value ?? row.port ?? '',
    enable: row.enable?.value ?? row.enable ?? true
  }))
}
function flattenProcess(row) {
  const bind = row.property?.bind_info
  const value = (key) => row.property?.[key]?.value
  return {
    id: row.id,
    serviceTemplateId: row.service_template_id,
    ...Object.fromEntries(Object.entries(row.property || {}).map(([key, val]) => [key, val?.value])),
    bk_func_name: value('bk_func_name') || '-', user: value('user') || '-', work_path: value('work_path') || '-',
    port: normalizeBindRows(bind)[0]?.port || '-', bindRows: normalizeBindRows(bind)
  }
}
function processFormFromRow(row) {
  const form = { ...row, __bind_rows: row.bindRows?.length ? row.bindRows.map((item) => ({ ...item })) : [{ ip: '1', protocol: '1', port: '', enable: true }] }
  if (form.bk_func_name === '-') form.bk_func_name = ''
  if (form.user === '-') form.user = ''
  if (form.work_path === '-') form.work_path = ''
  return form
}
function buildProcessProperty(form) {
  const property = {}
  for (const attr of processAttrs.value) {
    if (attr.bk_property_id === 'bind_info') continue
    const value = form[attr.bk_property_id]
    const hasValue = value !== '' && value !== null && value !== undefined
    property[attr.bk_property_id] = { value: hasValue ? value : (attr.bk_property_type === 'bool' ? false : null), as_default_value: hasValue }
  }
  if (!processAttrs.value.length) {
    for (const key of ['bk_func_name', 'bk_process_name', 'user', 'work_path', 'start_cmd', 'stop_cmd', 'description']) {
      if (form[key] !== undefined) property[key] = { value: form[key] || null, as_default_value: Boolean(form[key]) }
    }
  }
  const rows = (form.__bind_rows || []).filter((row) => row.port !== '' && row.port !== null && row.port !== undefined)
  property.bind_info = { value: rows.map((row, index) => ({ row_id: row.row_id || index + 1, ip: { value: row.ip || '1', as_default_value: true }, port: { value: String(row.port), as_default_value: true }, protocol: { value: row.protocol || '1', as_default_value: true }, enable: { value: row.enable !== false, as_default_value: true } })), as_default_value: true }
  return property
}
async function load() {
  loading.value = true; error.value = ''
  try {
    const [detail, attrs, procAttrs, categoryData, processes] = await Promise.all([
      getServiceTemplateAllInfo(props.bizId, props.templateId),
      searchModelAttributes('module', props.bizId).catch(() => []),
      searchModelAttributes('process', props.bizId).catch(() => []),
      searchServiceCategories(props.bizId).catch(() => []),
      searchProcTemplates(props.bizId, { service_template_id: props.templateId, page: { start: 0, limit: 100 } })
    ])
    info.value = detail || info.value; moduleAttrs.value = attrs || []; processAttrs.value = procAttrs || []
    categories.value = categoryData?.info || categoryData || []; processRows.value = (processes?.info || []).map(flattenProcess)
  } catch (e) { error.value = e?.message || '服务模板详情加载失败' } finally { loading.value = false }
}
function goEdit() { router.push(`/business/${props.bizId}/service/template/edit/${props.templateId}`) }
function startEdit(row) { editingId.value = row.attribute.id; editingValue.value = row.value ?? '' }
function cancelEdit() { editingId.value = null; editingValue.value = '' }
async function saveAttribute(row) { try { await updateServiceTemplateProperty({ id: props.templateId, bk_biz_id: props.bizId, attributes: [{ bk_attribute_id: row.attribute.id, bk_property_value: editingValue.value }] }); row.value = editingValue.value; cancelEdit(); emit('sync-change'); ElMessage.success('属性更新成功') } catch (e) { ElMessage.error(`属性更新失败: ${e?.message || '后端异常'}`) } }
async function removeAttribute(row) { try { await deleteServiceTemplateProperty({ id: props.templateId, bk_biz_id: props.bizId, bk_attribute_ids: [row.attribute.id] }); info.value.attributes = info.value.attributes.filter((item) => item.bk_attribute_id !== row.attribute.id); emit('sync-change'); ElMessage.success('属性删除成功') } catch (e) { ElMessage.error(`属性删除失败: ${e?.message || '后端异常'}`) } }
function openCreateProcess() { processEditing.value = null; processForm.value = { __bind_rows: [{ ip: '1', protocol: '1', port: '', enable: true }] }; processDialog.value = true }
function openEditProcess(row) { processEditing.value = row; processForm.value = processFormFromRow(row); processDialog.value = true }
async function saveProcess(form) { const currentForm = form || processForm.value; saving.value = true; try { const property = buildProcessProperty(currentForm); if (processEditing.value) await updateProcTemplate(props.bizId, processEditing.value.id, property); else await createProcTemplate(props.bizId, props.templateId, property); processDialog.value = false; await load(); emit('sync-change'); ElMessage.success('进程模板保存成功') } catch (e) { ElMessage.error(`进程模板保存失败: ${e?.message || '后端异常'}`) } finally { saving.value = false } }
async function removeProcess(row) { try { await ElMessageBox.confirm(`确定删除进程模板「${row.bk_func_name}」?`, '删除确认', { type: 'warning' }); await deleteProcTemplate(props.bizId, row.id); await load(); emit('sync-change'); ElMessage.success('删除成功') } catch (e) { if (e !== 'cancel') ElMessage.error(`删除失败: ${e?.message || '后端异常'}`) } }
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
.tab-label { position: relative; }
</style>
