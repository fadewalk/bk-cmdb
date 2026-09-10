<template>
  <div class="field-template-page">
    <div class="page-inner">
      <div v-if="tipsVisible" class="cmdb-tips ft-tips">
        <i class="bk-cmdb-icon icon-cc-exclamation-tips tips-icon" />
        <p class="tips-content">
          字段组合模板：通过在字段组合模板中设置多个字段，可以将模板绑定到不同的模型中。这样，模型将采用模板中设定的字段作为其属性字段，实现对具有相同设置需求的不同模型字段的集中管理。
          <a class="more">更多详情 &gt;&gt;</a>
        </p>
        <i class="bk-cmdb-icon icon-cc-tips-close tips-close" @click="tipsVisible = false" />
      </div>

      <div class="toolbar">
        <button class="bk-button bk-primary" @click="goCreate">新建</button>
        <div class="toolbar-right">
          <el-input
            v-model="searchKeyword"
            class="legacy-input search-input"
            placeholder="请输入模板名称/模型/更新人"
            clearable
            :suffix-icon="'Search'"
            @keyup.enter="reload"
            @clear="reload"
          />
        </div>
      </div>

      <el-table :data="rows" v-loading="loading" class="data-table" @row-click="(row) => showDetail(row)">
        <el-table-column prop="name" label="模板名称" min-width="230" show-overflow-tooltip>
          <template #default="{ row }"><span class="cell-link" @click.stop="showDetail(row)">{{ row.name }}</span></template>
        </el-table-column>
        <el-table-column label="字段数量" min-width="130">
          <template #default="{ row }">{{ row.field_count ?? '--' }}</template>
        </el-table-column>
        <el-table-column label="绑定的模型" min-width="150">
          <template #default="{ row }">
            <span v-if="row.model_count === 0" class="cell-unbind">0（未绑定）</span>
            <span v-else>{{ row.model_count ?? '--' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="290" show-overflow-tooltip>
          <template #default="{ row }">{{ row.description || '--' }}</template>
        </el-table-column>
        <el-table-column prop="modifier" label="最近更新人" min-width="170" show-overflow-tooltip>
          <template #default="{ row }">{{ row.modifier || row.creator || '--' }}</template>
        </el-table-column>
        <el-table-column prop="last_time" label="最近更新时间" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">{{ formatTime(row.last_time || row.create_time) }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="250" fixed="right" class-name="operation-column">
          <template #default="{ row }">
            <button class="bk-button bk-text op-btn" @click.stop="openBindDialog(row)">绑定新模型</button>
            <button class="bk-button bk-text op-btn" @click.stop="goEdit(row)">编辑</button>
            <button class="bk-button bk-text op-btn" @click.stop="openClone(row)">克隆</button>
            <el-tooltip content="已被模型绑定，不能删除" :disabled="!(row.model_count > 0)" placement="top">
              <button class="bk-button bk-text op-btn" :disabled="row.model_count > 0" @click.stop="removeTpl(row)">删除</button>
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
    </div>

    <!-- 模板详情：字段配置 / 唯一校验 / 绑定模型 -->
    <el-drawer v-model="detailVisible" :title="`字段组合模板详情【${detail?.name || ''}】`" size="62%">
      <div class="detail-head">
        <div><span class="detail-label">模板名称</span><strong>{{ detail?.name || '--' }}</strong></div>
        <div><span class="detail-label">描述</span>{{ detail?.description || '--' }}</div>
      </div>
      <el-tabs v-model="detailTab">
        <el-tab-pane :label="`字段配置 (${detailFields.length})`" name="fields">
          <el-table :data="detailFields" size="small">
            <el-table-column prop="bk_property_index" label="顺序" width="70" />
            <el-table-column prop="bk_property_id" label="字段 ID" min-width="150" />
            <el-table-column prop="bk_property_name" label="字段名称" min-width="140" />
            <el-table-column prop="bk_property_type" label="类型" width="110" />
            <el-table-column label="必填" width="80"><template #default="{ row }">{{ row.isrequired?.value ? '是' : '否' }}</template></el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane :label="`唯一校验 (${detailUniques.length})`" name="uniques">
          <el-table :data="detailUniques" size="small">
            <el-table-column label="唯一校验字段" min-width="280"><template #default="{ row }">{{ (row.keys || []).join('、') || '--' }}</template></el-table-column>
            <el-table-column prop="name" label="名称" min-width="160" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane :label="`绑定的模型 (${detailModels.length})`" name="models">
          <div class="detail-actions">
            <button class="bk-button bk-primary" @click="openBindDialog(detail)">绑定模型</button>
            <button class="bk-button" :disabled="!detailModels.length" @click="syncModels">同步到绑定模型</button>
          </div>
          <el-table :data="detailModels" size="small">
            <el-table-column prop="bk_obj_name" label="模型名称" min-width="180" />
            <el-table-column prop="bk_obj_id" label="模型 ID" min-width="160" />
            <el-table-column label="状态" width="110"><template #default="{ row }">{{ row.bk_ispaused ? '已停用' : '正常' }}</template></el-table-column>
            <el-table-column label="操作" width="100"><template #default="{ row }"><el-button link type="danger" @click="unbindModel(row)">解绑</el-button></template></el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-drawer>

    <!-- 克隆 -->
    <el-dialog v-model="cloneVisible" title="克隆字段组合模板" width="520px">
      <div class="legacy-form-row">
        <span class="label-title">模板名称<span class="color-danger">*</span></span>
        <el-input v-model="cloneForm.name" class="legacy-input row-input" maxlength="128" placeholder="请输入模板名称" />
      </div>
      <div class="legacy-form-row">
        <span class="label-title label-top">描述</span>
        <el-input v-model="cloneForm.description" type="textarea" :rows="3" maxlength="2000" class="legacy-textarea row-input" />
      </div>
      <template #footer>
        <button class="bk-button" @click="cloneVisible = false">取消</button>
        <button class="bk-button bk-primary" style="margin-left: 10px" :disabled="saving" @click="submitClone">克隆</button>
      </template>
    </el-dialog>

    <!-- 绑定模型 -->
    <el-dialog v-model="bindVisible" :title="`绑定模型到「${bindTarget?.name || ''}」`" width="620px">
      <div class="bound-list">
        <span class="detail-label">已绑定模型</span>
        <el-tag v-for="m in boundModels" :key="m.id" closable style="margin: 4px" @close="unbindModel(m)">{{ m.bk_obj_name || m.bk_obj_id }}</el-tag>
        <span v-if="!boundModels.length" class="hint">未绑定</span>
      </div>
      <el-divider />
      <el-select v-model="newBindModelId" filterable style="width: 100%" placeholder="选择要绑定的模型">
        <el-option v-for="m in bindableModels" :key="m.id" :label="`${m.bk_obj_name || m.bk_obj_id} (${m.bk_obj_id})`" :value="m.id" />
      </el-select>
      <template #footer>
        <button class="bk-button" @click="bindVisible = false">取消</button>
        <button class="bk-button bk-primary" style="margin-left: 10px" :disabled="saving || !newBindModelId" @click="doBind">绑定</button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
// 字段组合模板列表页:按旧版 src/ui/src/views/field-template/index.vue 复刻
// 新建/编辑进入两步向导路由(create/basic → create/field-settings)
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchFieldTemplates, getFieldTemplate, searchFieldTemplateAttributes, countFieldTemplateAttributes,
  searchFieldTemplateUniques, searchFieldTemplateModels,
  cloneFieldTemplate, deleteFieldTemplate, bindFieldTemplateModels, unbindFieldTemplateModel,
  syncFieldTemplateToModels, searchModels
} from '../../api/cmdb'

const route = useRoute()
const router = useRouter()
const rows = ref([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const searchKeyword = ref('')
const tipsVisible = ref(true)
const saving = ref(false)
const modelList = ref([])

const detailVisible = ref(false)
const detail = ref(null)
const detailTab = ref('fields')
const detailFields = ref([])
const detailUniques = ref([])
const detailModels = ref([])
const syncing = ref(false)

const cloneVisible = ref(false)
const cloneSource = ref(null)
const cloneForm = ref({ name: '', description: '' })

const bindVisible = ref(false)
const bindTarget = ref(null)
const boundModels = ref([])
const newBindModelId = ref(null)

const bindableModels = computed(() => modelList.value.filter((m) => !boundModels.value.some((b) => String(b.bk_obj_id || b.id) === String(m.bk_obj_id || m.id))))

function goCreate() {
  router.push('/model/field-template/create/basic')
}
function goEdit(row) {
  router.push(`/model/field-template/edit/${row.id}/basic`)
}
function formatTime(value) {
  if (!value) return '--'
  return String(value).replace('T', ' ').slice(0, 19)
}
async function load() {
  loading.value = true
  try {
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
    const data = await searchModels({ page: { start: 0, limit: 1000 } })
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
async function openClone(row) { cloneSource.value = row; cloneForm.value = { name: `${row.name}-副本`, description: row.description || '' }; cloneVisible.value = true }
async function submitClone() {
  if (!cloneForm.value.name.trim()) { ElMessage.warning('请输入模板名称'); return }
  saving.value = true
  try { await cloneFieldTemplate({ id: cloneSource.value.id, name: cloneForm.value.name.trim(), description: cloneForm.value.description }); ElMessage.success('克隆成功'); cloneVisible.value = false; await load() } catch (e) { ElMessage.error('克隆失败: ' + (e?.message || '后端异常')) } finally { saving.value = false }
}
async function removeTpl(row) {
  await ElMessageBox.confirm(`确定删除字段组合模板「${row.name}」?`, '删除确认', { type: 'warning' })
  try { await deleteFieldTemplate(row.id); ElMessage.success('删除成功'); await load() } catch (e) { ElMessage.error('删除失败: ' + (e?.message || '后端异常')) }
}
async function openBindDialog(row) {
  if (!row) return
  bindTarget.value = row
  newBindModelId.value = null
  await loadModels()
  try { const data = await searchFieldTemplateModels(row.id); boundModels.value = data?.info || data || [] } catch { boundModels.value = [] }
  bindVisible.value = true
}
async function doBind() {
  if (!newBindModelId.value) return
  saving.value = true
  try {
    await bindFieldTemplateModels(bindTarget.value.id, [...boundModels.value.map((m) => m.bk_obj_id || m.id), newBindModelId.value])
    ElMessage.success('绑定成功')
    newBindModelId.value = null
    await openBindDialog(bindTarget.value)
    await load()
    if (detail.value?.id === bindTarget.value.id) await loadDetailData(detail.value.id)
  } catch (e) { ElMessage.error('绑定失败: ' + (e?.message || '后端异常')) } finally { saving.value = false }
}
async function unbindModel(model) {
  await ElMessageBox.confirm(`确定解除「${model.bk_obj_name || model.bk_obj_id}」与模板的绑定?`, '解绑', { type: 'warning' })
  try {
    await unbindFieldTemplateModel(bindTarget.value?.id || detail.value.id, model.bk_obj_id || model.id)
    ElMessage.success('已解绑')
    if (bindTarget.value) await openBindDialog(bindTarget.value)
    if (detail.value?.id) await loadDetailData(detail.value.id)
    await load()
  } catch (e) { ElMessage.error('解绑失败: ' + (e?.message || '后端异常')) }
}
async function syncModels() {
  if (!detail.value?.id || !detailModels.value.length) return
  syncing.value = true
  try { await syncFieldTemplateToModels({ bk_template_id: detail.value.id, object_ids: detailModels.value.map((m) => m.bk_obj_id || m.id) }); ElMessage.success('同步任务已提交') } catch (e) { ElMessage.error('同步失败: ' + (e?.message || '后端异常')) } finally { syncing.value = false }
}

onMounted(async () => {
  await load()
  // 向导“立即绑定”回跳:打开对应模板的绑定弹窗
  const bindId = Number(route.query.bindId)
  if (bindId) {
    const row = rows.value.find((r) => Number(r.id) === bindId)
    if (row) await openBindDialog(row)
    router.replace({ query: { ...route.query, bindId: undefined } })
  }
})
</script>

<style scoped>
.field-template-page {
  height: 100%;
  overflow-y: auto;
  background: #fff;
}
.page-inner {
  padding: 15px 20px 0;
}
.ft-tips {
  margin-bottom: 10px;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.search-input {
  width: 300px;
}
.data-table {
  margin-top: 14px;
}
.cell-link {
  color: #3a84ff;
  cursor: pointer;
}
.cell-link:hover {
  text-decoration: underline;
}
.cell-unbind {
  color: #ff9c01;
}
.op-btn {
  font-size: 12px;
  margin-right: 12px;
}
.pagination {
  justify-content: flex-end;
  margin: 16px 0;
}
.detail-head { display: grid; gap: 10px; padding: 14px 18px; margin-bottom: 8px; background: #f5f7fa; color: #63656e; font-size: 13px; }
.detail-label { display: inline-block; min-width: 86px; color: #979ba5; }
.detail-actions { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 12px; }
.bound-list { display: flex; align-items: center; flex-wrap: wrap; }
.hint { color: #979ba5; font-size: 12px; }
.row-input {
  vertical-align: middle;
  margin-left: 10px;
  width: calc(100% - 105px);
}
.label-top {
  vertical-align: top;
}
</style>
