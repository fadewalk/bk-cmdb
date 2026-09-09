<template>
  <div class="page-card field-template-page">
    <h1 class="page-title sr-only">字段组合模板</h1>
    <p class="page-tips">字段组合模板：通过在字段组合模板中设置多个字段，可以将模板绑定到不同的模型中。这样，模型将采用模板中设定的字段作为其属性字段，实现对具有相同设置需求的不同模型字段的集中管理。</p>

    <div class="table-toolbar">
      <el-button type="primary" size="small" :icon="'Plus'" @click="openDialog()">新建</el-button>
      <div class="spacer" />
      <el-input
        v-model="searchKeyword"
        placeholder="请输入模板名称/模型/更新人"
        size="small"
        clearable
        style="width: 300px"
        :prefix-icon="'Search'"
        @keyup.enter="reload"
        @clear="reload"
      />
    </div>

    <el-table :data="rows" v-loading="loading" stripe @row-click="showDetail">
      <el-table-column prop="name" label="模板名称" min-width="220" show-overflow-tooltip>
        <template #default="{ row }"><el-link type="primary" :underline="false">{{ row.name }}</el-link></template>
      </el-table-column>
      <el-table-column label="字段数量" width="110"><template #default="{ row }">{{ row.field_count ?? '--' }}</template></el-table-column>
      <el-table-column label="绑定的模型" width="140"><template #default="{ row }">{{ row.model_count ?? '--' }}</template></el-table-column>
      <el-table-column prop="description" label="描述" min-width="260" show-overflow-tooltip>
        <template #default="{ row }">{{ row.description || '--' }}</template>
      </el-table-column>
      <el-table-column prop="modifier" label="最近更新人" width="140"><template #default="{ row }">{{ row.modifier || row.creator || '--' }}</template></el-table-column>
      <el-table-column label="最近更新时间" width="180"><template #default="{ row }">{{ formatTime(row.last_time || row.create_time) }}</template></el-table-column>
      <el-table-column label="操作" width="330" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="showDetail(row)">详情</el-button>
          <el-button link type="primary" @click.stop="openDialog(row)">编辑</el-button>
          <el-button link type="primary" @click.stop="openClone(row)">克隆</el-button>
          <el-button link type="primary" @click.stop="openBindDialog(row)">绑定模型</el-button>
          <el-tooltip :content="row.model_count > 0 ? '已被模型绑定，不能删除' : ''" :disabled="!(row.model_count > 0)">
            <el-button link type="danger" :disabled="row.model_count > 0" @click.stop="removeTpl(row)">删除</el-button>
          </el-tooltip>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="暂无字段组合模板" :image-size="80" />
      </template>
    </el-table>
    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      class="pagination"
      @current-change="load"
      @size-change="handleSizeChange"
    />

    <!-- 模板详情：字段配置 / 唯一校验 / 绑定模型 -->
    <el-drawer v-model="detailVisible" :title="`字段组合模板详情【${detail?.name || ''}】`" size="62%">
      <div class="detail-head">
        <div><span class="detail-label">模板名称</span><strong>{{ detail?.name || '--' }}</strong></div>
        <div><span class="detail-label">描述</span>{{ detail?.description || '--' }}</div>
      </div>
      <el-tabs v-model="detailTab">
        <el-tab-pane :label="`字段配置 (${detailFields.length})`" name="fields">
          <el-table :data="detailFields" size="small" stripe>
            <el-table-column prop="bk_property_index" label="顺序" width="70" />
            <el-table-column prop="bk_property_id" label="字段 ID" min-width="150" />
            <el-table-column prop="bk_property_name" label="字段名称" min-width="140" />
            <el-table-column prop="bk_property_type" label="类型" width="110" />
            <el-table-column prop="bk_property_group" label="分组" min-width="120" />
            <el-table-column label="必填" width="80"><template #default="{ row }">{{ row.isrequired?.value ? '是' : '否' }}</template></el-table-column>
          </el-table>
          <el-empty v-if="detailFields.length === 0" description="该模板暂无字段" :image-size="60" />
        </el-tab-pane>
        <el-tab-pane :label="`唯一校验 (${detailUniques.length})`" name="uniques">
          <el-table :data="detailUniques" size="small" stripe>
            <el-table-column label="唯一校验字段" min-width="280"><template #default="{ row }">{{ (row.keys || []).join('、') || '--' }}</template></el-table-column>
            <el-table-column prop="name" label="名称" min-width="160" />
            <el-table-column prop="description" label="描述" min-width="220" />
          </el-table>
          <el-empty v-if="detailUniques.length === 0" description="该模板暂无唯一校验" :image-size="60" />
        </el-tab-pane>
        <el-tab-pane :label="`绑定的模型 (${detailModels.length})`" name="models">
          <div class="detail-actions">
            <el-button type="primary" size="small" @click="openBindDialog(detail)">绑定模型</el-button>
            <el-button size="small" :disabled="!detailModels.length" :loading="syncing" @click="syncModels">同步到绑定模型</el-button>
          </div>
          <el-table :data="detailModels" size="small" stripe>
            <el-table-column prop="bk_obj_name" label="模型名称" min-width="180" />
            <el-table-column prop="bk_obj_id" label="模型 ID" min-width="160" />
            <el-table-column label="状态" width="110"><template #default="{ row }">{{ row.bk_ispaused ? '已停用' : '正常' }}</template></el-table-column>
            <el-table-column label="操作" width="100"><template #default="{ row }"><el-button link type="danger" @click="unbindModel(row)">解绑</el-button></template></el-table-column>
          </el-table>
          <el-empty v-if="detailModels.length === 0" description="未绑定模型" :image-size="60" />
        </el-tab-pane>
      </el-tabs>
    </el-drawer>

    <!-- 新建 / 编辑 -->
    <el-dialog v-model="formVisible" :title="form.id ? '编辑字段组合模板' : '新建字段组合模板'" width="720px" top="6vh">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="110px">
        <el-form-item label="模板名称" prop="name"><el-input v-model="form.name" maxlength="128" show-word-limit placeholder="请输入模板名称" /></el-form-item>
        <el-form-item label="描述" prop="description"><el-input v-model="form.description" type="textarea" :rows="3" maxlength="2000" show-word-limit /></el-form-item>
        <el-form-item label="字段来源" required>
          <el-select v-model="sourceModelId" filterable clearable style="width: 100%" placeholder="选择模型后加载可复用字段" @change="loadSourceAttributes">
            <el-option v-for="m in modelList" :key="m.id" :label="`${m.bk_obj_name || m.bk_obj_id} (${m.bk_obj_id})`" :value="m.bk_obj_id" />
          </el-select>
        </el-form-item>
        <el-form-item label="包含字段" required>
          <el-button size="small" @click="pickerVisible = true" :disabled="!availableAttrs.length">选择字段</el-button>
          <div class="picked-list">
            <el-tag v-for="p in form.attributes" :key="p.bk_property_id" closable style="margin: 4px" @close="removePick(p)">{{ p.bk_property_name }} ({{ p.bk_property_id }})</el-tag>
            <span v-if="!form.attributes.length" class="hint">请选择至少一个字段</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="formVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submitForm">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="pickerVisible" title="选择字段" width="760px" top="6vh">
      <el-input v-model="pickerKeyword" placeholder="搜索字段 ID 或名称" clearable size="small" style="margin-bottom: 10px" />
      <el-table ref="pickerTableRef" :data="filteredAttrs" max-height="420" size="small" border @selection-change="onPickChange">
        <el-table-column type="selection" width="44" />
        <el-table-column prop="bk_property_id" label="字段 ID" min-width="180" />
        <el-table-column prop="bk_property_name" label="字段名称" min-width="170" />
        <el-table-column prop="bk_property_type" label="类型" width="120" />
        <el-table-column prop="bk_property_group" label="分组" min-width="130" />
      </el-table>
      <template #footer><el-button @click="pickerVisible = false">完成</el-button></template>
    </el-dialog>

    <!-- 克隆 -->
    <el-dialog v-model="cloneVisible" title="克隆字段组合模板" width="520px">
      <el-form label-width="100px"><el-form-item label="模板名称" required><el-input v-model="cloneForm.name" maxlength="128" /></el-form-item><el-form-item label="描述"><el-input v-model="cloneForm.description" type="textarea" :rows="3" maxlength="2000" /></el-form-item></el-form>
      <template #footer><el-button @click="cloneVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submitClone">克隆</el-button></template>
    </el-dialog>

    <!-- 绑定模型 -->
    <el-dialog v-model="bindVisible" :title="`绑定模型到「${bindTarget?.name || ''}」`" width="620px">
      <el-alert type="info" :closable="false" title="字段模板只能绑定非主线模型;绑定前会由后端校验字段冲突" style="margin-bottom: 14px" />
      <div class="bound-list"><span class="detail-label">已绑定模型</span><el-tag v-for="m in boundModels" :key="m.id" closable style="margin: 4px" @close="unbindModel(m)">{{ m.bk_obj_name || m.bk_obj_id }}</el-tag><span v-if="!boundModels.length" class="hint">未绑定</span></div>
      <el-divider />
      <el-select v-model="newBindModelId" filterable style="width: 100%" placeholder="选择要绑定的模型"><el-option v-for="m in bindableModels" :key="m.id" :label="`${m.bk_obj_name || m.bk_obj_id} (${m.bk_obj_id})`" :value="m.id" /></el-select>
      <template #footer><el-button @click="bindVisible = false">取消</el-button><el-button type="primary" :loading="saving" :disabled="!newBindModelId" @click="doBind">绑定</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchFieldTemplates, getFieldTemplate, searchFieldTemplateAttributes, countFieldTemplateAttributes,
  searchFieldTemplateUniques, searchFieldTemplateModels, createFieldTemplate, updateFieldTemplate, updateFieldTemplateInfo,
  cloneFieldTemplate, deleteFieldTemplate, bindFieldTemplateModels, unbindFieldTemplateModel,
  syncFieldTemplateToModels, searchModels, searchModelAttributes
} from '../../api/cmdb'

const route = useRoute()
const router = useRouter()
const rows = ref([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const searchKeyword = ref('')
const modelList = ref([])

const detailVisible = ref(false)
const detail = ref(null)
const detailTab = ref('fields')
const detailFields = ref([])
const detailUniques = ref([])
const detailModels = ref([])
const syncing = ref(false)

const formVisible = ref(false)
const formRef = ref(null)
const saving = ref(false)
const form = ref({ id: null, name: '', description: '', attributes: [], uniques: [] })
const sourceModelId = ref('')
const availableAttrs = ref([])
const pickerVisible = ref(false)
const pickerKeyword = ref('')
const pickerTableRef = ref(null)
const cloneVisible = ref(false)
const cloneSource = ref(null)
const cloneForm = ref({ name: '', description: '' })

const bindVisible = ref(false)
const bindTarget = ref(null)
const boundModels = ref([])
const newBindModelId = ref(null)
const formRules = { name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }, { max: 128, message: '长度不能超过 128 个字符', trigger: 'blur' }], description: [{ max: 2000, message: '长度不能超过 2000 个字符', trigger: 'blur' }] }
const filteredAttrs = computed(() => {
  const kw = pickerKeyword.value.trim().toLowerCase()
  if (!kw) return availableAttrs.value
  return availableAttrs.value.filter((a) => `${a.bk_property_id} ${a.bk_property_name}`.toLowerCase().includes(kw))
})
const bindableModels = computed(() => modelList.value.filter((m) => !boundModels.value.some((b) => String(b.bk_obj_id || b.id) === String(m.bk_obj_id || m.id))))

function clearLegacyQuery() {
  const query = { ...route.query }
  delete query.action
  delete query.id
  delete query.modelId
  router.replace({ path: route.path, query })
}
async function applyLegacyAction() {
  const action = String(route.query.action || '')
  const id = Number(route.query.id)
  if (!action) return
  try {
    if (action === 'create') {
      await openDialog()
    } else if (id) {
      const row = rows.value.find((item) => Number(item.id) === id) || { id }
      if (action === 'edit') await openDialog(row)
      if (action === 'bind') await openBindDialog(row)
      if (action === 'sync') {
        detail.value = row
        await loadDetailData(id)
        detailVisible.value = true
        detailTab.value = 'models'
        await syncModels()
      }
    }
  } finally {
    clearLegacyQuery()
  }
}
function formatTime(value) {
  if (!value) return '--'
  return String(value).replace('T', ' ').slice(0, 19)
}
async function load() {
  loading.value = true
  try {
    // 老版为单搜索框(模板名称/模型/更新人):有关键字时取全量在前端做 OR 过滤,否则服务端分页
    const kw = searchKeyword.value.trim()
    const searchMode = !!kw
    const data = await searchFieldTemplates({
      page: { start: searchMode ? 0 : (page.value - 1) * pageSize.value, limit: searchMode ? 200 : pageSize.value, sort: '-last_time' }
    })
    let list = data?.info || []
    if (list.length) {
      const ids = list.map((r) => r.id)
      const [fieldCounts, modelCounts] = await Promise.allSettled([countFieldTemplateAttributes(ids), Promise.all(ids.map((id) => searchFieldTemplateModels(id)))])
      const fieldMap = new Map((fieldCounts.value?.info || fieldCounts.value || []).map((x) => [x.bk_template_id, x.count]))
      const modelMap = new Map()
      if (modelCounts.status === 'fulfilled') {
        modelCounts.value.forEach((result, index) => {
          const models = result?.info || []
          modelMap.set(ids[index], { count: result?.count ?? models.length, names: models.map((m) => m.bk_obj_name || m.bk_obj_id) })
        })
      }
      list = list.map((r) => {
        const m = modelMap.get(r.id)
        return { ...r, field_count: fieldMap.get(r.id) ?? r.field_count ?? 0, model_count: m?.count ?? r.model_count ?? 0, model_names: m?.names || [] }
      })
    }
    if (searchMode) {
      const needle = kw.toLowerCase()
      list = list.filter((r) =>
        (r.name || '').toLowerCase().includes(needle)
        || (r.modifier || r.creator || '').toLowerCase().includes(needle)
        || (r.model_names || []).some((n) => String(n).toLowerCase().includes(needle)))
      total.value = list.length
      rows.value = list.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
    } else {
      total.value = data?.count || 0
      rows.value = list
    }
  } catch (e) { ElMessage.error('加载失败: ' + (e?.message || '后端异常')) } finally { loading.value = false }
}
function reload() { page.value = 1; load() }
function handleSizeChange(size) { pageSize.value = size; page.value = 1; load() }
async function loadModels() {
  try {
    const data = await searchModels({ page: { start: 0, limit: 1000 }, fields: ['bk_obj_id', 'bk_obj_name', 'bk_ispaused'] })
    modelList.value = data?.info || data || []
  } catch { modelList.value = [] }
}
async function loadDetailData(id) {
  const [base, attrs, uniques, models] = await Promise.all([getFieldTemplate(id), searchFieldTemplateAttributes(id), searchFieldTemplateUniques(id), searchFieldTemplateModels(id)])
  detail.value = base || detail.value
  detailFields.value = attrs?.info || attrs || []
  detailUniques.value = uniques?.info || uniques || []
  detailModels.value = models?.info || models || []
}
async function showDetail(row) {
  detail.value = row
  detailTab.value = 'fields'
  detailVisible.value = true
  try { await loadDetailData(row.id) } catch (e) { ElMessage.error('详情加载失败: ' + (e?.message || '后端异常')) }
}
async function openDialog(row) {
  await loadModels()
  form.value = { id: row?.id || null, name: row?.name || '', description: row?.description || '', attributes: [], uniques: [] }
  sourceModelId.value = ''
  availableAttrs.value = []
  if (row) {
    try {
      const [attrs, uniques, models] = await Promise.all([searchFieldTemplateAttributes(row.id), searchFieldTemplateUniques(row.id), searchFieldTemplateModels(row.id)])
      form.value.attributes = attrs?.info || attrs || []
      form.value.uniques = uniques?.info || uniques || []
      sourceModelId.value = models?.info?.[0]?.bk_obj_id || ''
      if (sourceModelId.value) await loadSourceAttributes(sourceModelId.value)
    } catch (e) { ElMessage.error('模板详情加载失败: ' + (e?.message || '后端异常')) }
  }
  formVisible.value = true
}
async function loadSourceAttributes(objId) {
  if (!objId) { availableAttrs.value = []; return }
  try {
    const data = await searchModelAttributes(objId)
    availableAttrs.value = (data?.info || data || []).filter((a) => a.bk_property_id && a.bk_property_id !== 'bk_obj_id')
    await nextTick()
    pickerTableRef.value?.clearSelection()
    form.value.attributes.forEach((picked) => {
      const row = availableAttrs.value.find((a) => a.bk_property_id === picked.bk_property_id)
      if (row) pickerTableRef.value?.toggleRowSelection(row, true)
    })
  } catch { availableAttrs.value = [] }
}
function onPickChange(selected) { form.value.attributes = selected.map((a, index) => ({ ...a, bk_property_index: index + 1 })) }
function removePick(p) { form.value.attributes = form.value.attributes.filter((a) => a.bk_property_id !== p.bk_property_id); const row = availableAttrs.value.find((a) => a.bk_property_id === p.bk_property_id); if (row) pickerTableRef.value?.toggleRowSelection(row, false) }
async function submitForm() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  if (!form.value.attributes.length) { ElMessage.warning('请至少选择一个字段'); return }
  saving.value = true
  try {
    const attrs = form.value.attributes.map((a, index) => ({
      bk_property_id: a.bk_property_id, bk_property_name: a.bk_property_name, bk_property_type: a.bk_property_type,
      bk_property_index: index + 1, bk_property_group: a.bk_property_group || '', unit: a.unit || '', option: a.option || null,
      default: a.default ?? null, isrequired: a.isrequired || { lock: false, value: false }, editable: a.editable || { lock: false, value: true }, ismultiple: !!a.ismultiple
    }))
    if (form.value.id) {
      await updateFieldTemplateInfo({ id: form.value.id, name: form.value.name, description: form.value.description })
      await updateFieldTemplate({ id: form.value.id, name: form.value.name, description: form.value.description, attributes: attrs, uniques: form.value.uniques || [] })
      ElMessage.success('已更新')
    } else {
      await createFieldTemplate({ name: form.value.name, description: form.value.description, attributes: attrs, uniques: form.value.uniques || [] })
      ElMessage.success('已创建')
    }
    formVisible.value = false
    await load()
  } catch (e) { ElMessage.error('保存失败: ' + (e?.message || '后端异常')) } finally { saving.value = false }
}
async function openClone(row) { cloneSource.value = row; cloneForm.value = { name: `${row.name}-副本`, description: row.description || '' }; cloneVisible.value = true }
async function submitClone() {
  if (!cloneForm.value.name.trim()) { ElMessage.warning('请输入模板名称'); return }
  saving.value = true
  try { await cloneFieldTemplate({ id: cloneSource.value.id, name: cloneForm.value.name.trim(), description: cloneForm.value.description }); ElMessage.success('克隆成功'); cloneVisible.value = false; await load() } catch (e) { ElMessage.error('克隆失败: ' + (e?.message || '后端异常')) } finally { saving.value = false }
}
async function removeTpl(row) {
  await ElMessageBox.confirm(`确定删除字段组合模板「${row.name}」?`, '删除确认', { type: 'warning' })
  try { await deleteFieldTemplate(row.id); ElMessage.success('已删除'); await load() } catch (e) { ElMessage.error('删除失败: ' + (e?.message || '后端异常')) }
}
async function openBindDialog(row) {
  bindTarget.value = row
  newBindModelId.value = null
  await loadModels()
  try { const data = await searchFieldTemplateModels(row.id); boundModels.value = data?.info || data || [] } catch { boundModels.value = [] }
  bindVisible.value = true
}
async function doBind() {
  if (!newBindModelId.value) return
  saving.value = true
  try { await bindFieldTemplateModels(bindTarget.value.id, [...boundModels.value.map((m) => m.bk_obj_id || m.id), newBindModelId.value]); ElMessage.success('绑定成功'); newBindModelId.value = null; await openBindDialog(bindTarget.value); await load(); if (detail.value?.id === bindTarget.value.id) await loadDetailData(detail.value.id) } catch (e) { ElMessage.error('绑定失败: ' + (e?.message || '后端异常')) } finally { saving.value = false }
}
async function unbindModel(model) {
  await ElMessageBox.confirm(`确定解除「${model.bk_obj_name || model.bk_obj_id}」与模板的绑定?`, '解绑', { type: 'warning' })
  try { await unbindFieldTemplateModel(bindTarget.value?.id || detail.value.id, model.bk_obj_id || model.id); ElMessage.success('已解绑'); if (bindTarget.value) await openBindDialog(bindTarget.value); if (detail.value?.id) await loadDetailData(detail.value.id); await load() } catch (e) { ElMessage.error('解绑失败: ' + (e?.message || '后端异常')) }
}
async function syncModels() {
  if (!detail.value?.id || !detailModels.value.length) return
  syncing.value = true
  try { await syncFieldTemplateToModels({ bk_template_id: detail.value.id, object_ids: detailModels.value.map((m) => m.bk_obj_id || m.id) }); ElMessage.success('同步任务已提交') } catch (e) { ElMessage.error('同步失败: ' + (e?.message || '后端异常')) } finally { syncing.value = false }
}
onMounted(async () => {
  await loadModels()
  await load()
  await applyLegacyAction()
})
</script>

<style scoped>
.field-template-page { min-height: 100%; }
.page-title { font-size: 16px; color: #313238; font-weight: 400; padding: 0 20px; height: 50px; line-height: 50px; border-bottom: 1px solid #E7E9EF; margin: 0; }
.page-tips { margin: 0; padding: 10px 20px; font-size: 12px; color: #979BA5; background: #F0F5FF; border-bottom: 1px solid #E7E9EF; }
.table-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.table-toolbar .spacer { flex: 1; }
.pagination { justify-content: flex-end; margin-top: 16px; }
.detail-head { display: grid; gap: 10px; padding: 14px 18px; margin-bottom: 8px; background: #F5F7FA; color: #63656E; font-size: 13px; }
.detail-label { display: inline-block; min-width: 86px; color: #979BA5; }
.detail-actions { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 12px; }
.picked-list { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 8px; }
.bound-list { display: flex; align-items: center; flex-wrap: wrap; }
.hint { color: #979BA5; font-size: 12px; }
</style>