<template>
  <div class="field-template-flow" v-loading="loading">
    <div class="flow-head">
      <button class="back-link" type="button" @click="goBack">‹ 字段组合模板</button>
      <div>
        <h2>{{ isEditMode ? '编辑字段组合模板：模型信息确认' : '绑定新模型' }}</h2>
        <p v-if="template" class="sub-title">{{ template.name }}（模板 ID：{{ template.id }}）</p>
      </div>
    </div>

    <el-alert
      v-if="isEditMode"
      class="context-alert"
      type="info"
      :closable="false"
      show-icon
      title="编辑绑定上下文已保留：本页展示模板、字段、模型和差异；字段内容仍由前两步向导提交。"
    />
    <el-alert v-if="errorMessage" class="context-alert" type="error" :closable="false" show-icon :title="errorMessage" />

    <template v-if="template">
      <div class="summary-grid">
        <section class="flow-card">
          <div class="card-title">模板信息</div>
          <dl class="summary-list">
            <div><dt>模板名称</dt><dd>{{ template.name || '--' }}</dd></div>
            <div><dt>描述</dt><dd>{{ template.description || '--' }}</dd></div>
            <div><dt>字段数量</dt><dd>{{ fields.length }}</dd></div>
            <div><dt>唯一校验</dt><dd>{{ uniques.length }}</dd></div>
          </dl>
        </section>
        <section class="flow-card">
          <div class="card-title">绑定模型（{{ boundModels.length }}）</div>
          <el-table :data="boundModels" size="small" max-height="170">
            <el-table-column label="模型" min-width="160">
              <template #default="{ row }">{{ modelNameOf(row) }}</template>
            </el-table-column>
            <el-table-column label="模型 ID" width="140">
              <template #default="{ row }">{{ modelObjectIdOf(row) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="{ row }">{{ row.bk_ispaused ? '已停用' : '正常' }}</template>
            </el-table-column>
            <template #empty><span class="muted">该模板暂未绑定任何模型</span></template>
          </el-table>
        </section>
      </div>

      <section class="flow-card field-card">
        <div class="card-title">模板字段与唯一校验</div>
        <el-tabs v-model="activeTab">
          <el-tab-pane :label="`字段 (${fields.length})`" name="fields">
            <el-table :data="fields" size="small">
              <el-table-column prop="bk_property_index" label="顺序" width="70" />
              <el-table-column prop="bk_property_id" label="字段 ID" min-width="170" />
              <el-table-column prop="bk_property_name" label="字段名称" min-width="150" />
              <el-table-column prop="bk_property_type" label="类型" width="110" />
              <el-table-column label="必填" width="80">
                <template #default="{ row }">{{ requiredValue(row) ? '是' : '否' }}</template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane :label="`唯一校验 (${uniques.length})`" name="uniques">
            <el-table :data="uniques" size="small">
              <el-table-column label="唯一校验字段" min-width="300">
                <template #default="{ row }">{{ uniqueName(row) }}</template>
              </el-table-column>
              <el-table-column prop="id" label="校验 ID" width="120" />
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </section>

      <section class="flow-card selection-card">
        <div class="card-title">候选模型</div>
        <div class="selection-row">
          <el-select
            v-model="selectedModelId"
            class="model-select"
            filterable
            clearable
            placeholder="请选择要绑定的模型"
            @change="loadDiff"
          >
            <el-option
              v-for="model in candidateModels"
              :key="modelObjectIdOf(model)"
              :label="`${modelNameOf(model)} (${modelObjectIdOf(model)})${model.bk_ispaused ? ' 已停用' : ''}`"
              :value="modelObjectIdOf(model)"
              :disabled="!!model.bk_ispaused"
            />
          </el-select>
          <el-button type="primary" :loading="submitting" :disabled="!selectedModelId || diffLoading || hasConflict" @click="bindModel">
            绑定模型
          </el-button>
        </div>
        <div v-if="!candidateModels.length" class="muted empty-candidates">暂无可绑定模型</div>

        <div v-if="selectedModelId" v-loading="diffLoading" class="diff-panel">
          <div class="diff-title">差异预览（{{ selectedModelName }}）</div>
          <div class="diff-grid">
            <div class="diff-box">
              <strong>字段</strong>
              <span class="diff-new">新增 {{ attrDiff.counts.create }}</span>
              <span class="diff-update">更新 {{ attrDiff.counts.update }}</span>
              <span :class="{ 'diff-conflict': attrDiff.counts.conflict }">冲突 {{ attrDiff.counts.conflict }}</span>
            </div>
            <div class="diff-box">
              <strong>唯一校验</strong>
              <span class="diff-new">新增 {{ uniqueDiff.counts.create }}</span>
              <span class="diff-update">更新 {{ uniqueDiff.counts.update }}</span>
              <span :class="{ 'diff-conflict': uniqueDiff.counts.conflict }">冲突 {{ uniqueDiff.counts.conflict }}</span>
            </div>
          </div>
          <el-alert v-if="hasConflict" type="error" :closable="false" show-icon title="模型存在冲突，无法提交" />
          <div v-if="lastBoundModelId" class="sync-link-row">
            <span>绑定成功，新增 object_ids 仅包含 {{ lastBoundModelId }}。</span>
            <el-button link type="primary" @click="goSync(lastBoundModelId)">同步模板字段</el-button>
          </div>
        </div>
      </section>
    </template>
    <el-empty v-else-if="!loading" description="字段组合模板不存在或无法加载" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  bindFieldTemplateModels, compareFieldTemplateAttributes, compareFieldTemplateUniques,
  getFieldTemplate, searchFieldTemplateAttributes, searchFieldTemplateModels,
  searchFieldTemplateUniques, searchModels
} from '../../api/cmdb'
import {
  modelNameOf, modelObjectIdOf, normalizeTemplateDiff, responseList, uniqueFieldNames
} from '../../utils/field-template'

const route = useRoute()
const router = useRouter()
const templateId = computed(() => String(route.params.id || ''))
const isEditMode = computed(() => route.name === 'FieldTemplateEditBinding')
const loading = ref(false)
const diffLoading = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const template = ref(null)
const fields = ref([])
const uniques = ref([])
const boundModels = ref([])
const allModels = ref([])
const selectedModelId = ref(null)
const attrDiff = ref(normalizeTemplateDiff({}))
const uniqueDiff = ref(normalizeTemplateDiff({}))
const lastBoundModelId = ref(null)
const activeTab = ref('fields')

const boundIds = computed(() => new Set(boundModels.value.map((model) => String(modelObjectIdOf(model)))))
const candidateModels = computed(() => allModels.value.filter((model) => !boundIds.value.has(String(modelObjectIdOf(model)))))
const selectedModel = computed(() => allModels.value.find((model) => String(modelObjectIdOf(model)) === String(selectedModelId.value)) || { id: selectedModelId.value })
const selectedModelName = computed(() => modelNameOf(selectedModel.value))
const hasConflict = computed(() => attrDiff.value.counts.conflict > 0 || uniqueDiff.value.counts.conflict > 0)

function requiredValue(field) {
  return typeof field?.isrequired === 'object' ? !!field.isrequired.value : !!field?.isrequired
}
function uniqueName(unique) {
  return uniqueFieldNames(unique, fields.value).join('、') || '--'
}
function goBack() {
  router.push('/model/field-template')
}
function goSync(modelId) {
  router.push(`/model/field-template/sync/${templateId.value}/model/${modelId}`)
}
async function loadDiff() {
  if (!selectedModelId.value) {
    attrDiff.value = normalizeTemplateDiff({})
    uniqueDiff.value = normalizeTemplateDiff({})
    return
  }
  diffLoading.value = true
  try {
    const [attrResult, uniqueResult] = await Promise.all([
      compareFieldTemplateAttributes({ bk_template_id: Number(templateId.value), object_id: modelObjectIdOf({ id: selectedModelId.value }), attributes: fields.value }),
      compareFieldTemplateUniques({ bk_template_id: Number(templateId.value), object_id: modelObjectIdOf({ id: selectedModelId.value }), uniques: uniques.value })
    ])
    attrDiff.value = normalizeTemplateDiff(attrResult)
    uniqueDiff.value = normalizeTemplateDiff(uniqueResult)
  } catch (error) {
    errorMessage.value = `差异加载失败：${error?.message || '后端异常'}`
    attrDiff.value = normalizeTemplateDiff({})
    uniqueDiff.value = normalizeTemplateDiff({})
  } finally {
    diffLoading.value = false
  }
}
async function bindModel() {
  const objectId = modelObjectIdOf({ id: selectedModelId.value })
  if (objectId === undefined || hasConflict.value) return
  submitting.value = true
  try {
    // 绑定接口只接收本次新增模型，已绑定模型不会被重复发送。
    await bindFieldTemplateModels(Number(templateId.value), [objectId])
    lastBoundModelId.value = objectId
    ElMessage.success('绑定成功')
    boundModels.value = responseList(await searchFieldTemplateModels(templateId.value))
    selectedModelId.value = null
    attrDiff.value = normalizeTemplateDiff({})
    uniqueDiff.value = normalizeTemplateDiff({})
  } catch (error) {
    ElMessage.error(`绑定失败：${error?.message || '后端异常'}`)
  } finally {
    submitting.value = false
  }
}
async function load() {
  loading.value = true
  try {
    const [base, attrs, uniqueList, models, all] = await Promise.all([
      getFieldTemplate(templateId.value),
      searchFieldTemplateAttributes(templateId.value),
      searchFieldTemplateUniques(templateId.value),
      searchFieldTemplateModels(templateId.value),
      searchModels({ page: { start: 0, limit: 1000 } })
    ])
    template.value = base
    fields.value = responseList(attrs)
    uniques.value = responseList(uniqueList)
    boundModels.value = responseList(models)
    allModels.value = responseList(all)
  } catch (error) {
    errorMessage.value = `模板加载失败：${error?.message || '后端异常'}`
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<style scoped>
.field-template-flow { height: 100%; overflow-y: auto; padding: 24px 32px 40px; background: #f5f7fa; color: #313238; }
.flow-head { display: flex; align-items: flex-start; gap: 18px; margin-bottom: 18px; }
.back-link { border: 0; background: transparent; color: #3a84ff; cursor: pointer; font-size: 14px; padding: 4px 0; }
h2 { margin: 0; font-size: 20px; font-weight: 600; }
.sub-title { margin: 8px 0 0; color: #979ba5; font-size: 13px; }
.context-alert { margin-bottom: 14px; }
.summary-grid { display: grid; grid-template-columns: minmax(340px, 1fr) minmax(460px, 1.5fr); gap: 16px; margin-bottom: 16px; }
.flow-card { background: #fff; border: 1px solid #dcdee5; border-radius: 2px; padding: 18px; margin-bottom: 16px; }
.card-title { font-size: 14px; font-weight: 600; margin-bottom: 14px; }
.summary-list { margin: 0; }
.summary-list > div { display: flex; padding: 7px 0; border-bottom: 1px solid #f0f1f5; font-size: 13px; }
.summary-list > div:last-child { border-bottom: 0; }
dt { width: 90px; color: #979ba5; }
dd { flex: 1; margin: 0; color: #313238; word-break: break-all; }
.field-card :deep(.el-tabs__header) { margin-top: -8px; }
.selection-row { display: flex; gap: 12px; align-items: center; }
.model-select { max-width: 520px; flex: 1; }
.muted { color: #979ba5; font-size: 13px; }
.empty-candidates { margin-top: 12px; }
.diff-panel { margin-top: 18px; padding-top: 16px; border-top: 1px solid #f0f1f5; }
.diff-title { font-size: 13px; font-weight: 600; margin-bottom: 12px; }
.diff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
.diff-box { display: flex; align-items: center; gap: 12px; padding: 14px; background: #f5f7fa; font-size: 13px; }
.diff-new { color: #2dcb56; }
.diff-update { color: #3a84ff; }
.diff-conflict { color: #ea3636; }
.sync-link-row { display: flex; align-items: center; gap: 10px; margin-top: 14px; font-size: 13px; color: #63656e; }
@media (max-width: 900px) { .summary-grid, .diff-grid { grid-template-columns: 1fr; } .field-template-flow { padding: 16px; } }
</style>
