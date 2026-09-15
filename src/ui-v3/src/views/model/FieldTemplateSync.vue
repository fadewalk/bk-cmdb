<template>
  <div class="field-template-flow" v-loading="loading">
    <div class="flow-head">
      <button class="back-link" type="button" @click="goBack">‹ 字段组合模板</button>
      <div>
        <h2>同步模板字段</h2>
        <p v-if="template" class="sub-title">{{ template.name }} → {{ modelName }}（模板 ID：{{ template.id }}，模型 ID：{{ modelId }}）</p>
      </div>
    </div>
    <el-alert v-if="errorMessage" class="context-alert" type="error" :closable="false" show-icon :title="errorMessage" />
    <template v-if="template">
      <section class="flow-card">
        <div class="card-title">同步上下文</div>
        <div class="context-grid">
          <div><span>模板</span><strong>{{ template.name }}</strong></div>
          <div><span>模型</span><strong>{{ modelName }}</strong></div>
          <div><span>字段</span><strong>{{ fields.length }}</strong></div>
          <div><span>唯一校验</span><strong>{{ uniques.length }}</strong></div>
        </div>
      </section>
      <section class="flow-card">
        <div class="card-title">差异预览</div>
        <div v-loading="diffLoading" class="diff-grid">
          <div class="diff-box"><strong>字段</strong><span class="diff-new">新增 {{ attrDiff.counts.create }}</span><span class="diff-update">更新 {{ attrDiff.counts.update }}</span><span :class="{ 'diff-conflict': attrDiff.counts.conflict }">冲突 {{ attrDiff.counts.conflict }}</span></div>
          <div class="diff-box"><strong>唯一校验</strong><span class="diff-new">新增 {{ uniqueDiff.counts.create }}</span><span class="diff-update">更新 {{ uniqueDiff.counts.update }}</span><span :class="{ 'diff-conflict': uniqueDiff.counts.conflict }">冲突 {{ uniqueDiff.counts.conflict }}</span></div>
        </div>
        <el-alert v-if="hasConflict" class="context-alert" type="error" :closable="false" show-icon title="模型存在冲突，无法同步" />
        <el-alert v-else type="info" :closable="false" show-icon title="确认差异后提交同步。同步接口返回 task IDs 数组，页面会轮询直到 success 或 failure。" />
      </section>
      <section class="flow-card action-card">
        <el-button type="primary" :loading="submitting" :disabled="diffLoading || hasConflict || submitted" @click="sync">{{ submitted ? '同步任务已提交' : '提交同步' }}</el-button>
        <el-button @click="goBack">取消</el-button>
        <div v-if="taskRows.length" class="task-result">
          <span v-for="task in taskRows" :key="task.task_id" :class="['task-status', taskStatus(task)]">任务 {{ task.task_id }}：{{ taskStatusText(task) }}</span>
        </div>
      </section>
    </template>
    <el-empty v-else-if="!loading" description="同步上下文加载失败" />
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  compareFieldTemplateAttributes, compareFieldTemplateUniques, getFieldTemplate,
  getFieldTemplateTaskStatus, searchFieldTemplateAttributes, searchFieldTemplateModels,
  searchFieldTemplateUniques, syncFieldTemplateToModels
} from '../../api/cmdb'
import {
  extractTaskIds, extractTaskRows, isFailureTaskStatus, isTerminalTaskStatus,
  modelNameOf, modelObjectIdOf, normalizeTemplateDiff, responseList, taskStatusOf
} from '../../utils/field-template'

const route = useRoute()
const router = useRouter()
const templateId = computed(() => String(route.params.id || ''))
const modelId = computed(() => String(route.params.modelId || ''))
const loading = ref(false)
const diffLoading = ref(false)
const submitting = ref(false)
const submitted = ref(false)
const errorMessage = ref('')
const template = ref(null)
const model = ref(null)
const fields = ref([])
const uniques = ref([])
const attrDiff = ref(normalizeTemplateDiff({}))
const uniqueDiff = ref(normalizeTemplateDiff({}))
const taskRows = ref([])
let pollTimer = null
const modelName = computed(() => modelNameOf(model.value || { id: modelId.value }))
const hasConflict = computed(() => attrDiff.value.counts.conflict > 0 || uniqueDiff.value.counts.conflict > 0)

function taskStatus(task) {
  const status = taskStatusOf(task)
  return isFailureTaskStatus(task) ? 'failure' : status
}
function taskStatusText(task) {
  const status = taskStatusOf(task)
  return status === 'success' || status === 'finished' ? '同步成功' : status === 'failure' ? '同步失败' : '执行中'
}
function goBack() { router.push('/model/field-template') }
async function loadDiff() {
  diffLoading.value = true
  try {
    const [attrResult, uniqueResult] = await Promise.all([
      compareFieldTemplateAttributes({ bk_template_id: Number(templateId.value), object_id: modelObjectIdOf({ id: modelId.value }), attributes: fields.value }),
      compareFieldTemplateUniques({ bk_template_id: Number(templateId.value), object_id: modelObjectIdOf({ id: modelId.value }), uniques: uniques.value })
    ])
    attrDiff.value = normalizeTemplateDiff(attrResult)
    uniqueDiff.value = normalizeTemplateDiff(uniqueResult)
  } catch (error) {
    errorMessage.value = `差异加载失败：${error?.message || '后端异常'}`
  } finally {
    diffLoading.value = false
  }
}
async function pollTasks(taskIds) {
  for (let index = 0; index < 30; index += 1) {
    const result = await getFieldTemplateTaskStatus({ task_ids: taskIds })
    const rows = extractTaskRows(result)
    if (rows.length) {
      taskRows.value = rows
      if (rows.every(isTerminalTaskStatus)) return rows
    }
    await new Promise((resolve) => { pollTimer = setTimeout(resolve, 2000) })
  }
  return null
}
async function sync() {
  if (hasConflict.value || submitted.value) return
  submitting.value = true
  try {
    const result = await syncFieldTemplateToModels({ bk_template_id: Number(templateId.value), object_ids: [modelObjectIdOf({ id: modelId.value })] })
    const taskIds = extractTaskIds(result)
    submitted.value = true
    if (!taskIds.length) {
      ElMessage.success('同步任务已提交')
      return
    }
    const finished = await pollTasks(taskIds)
    if (!finished) ElMessage.info('任务仍在执行，请稍后刷新查看')
    else if (finished.some(isFailureTaskStatus)) ElMessage.error('同步完成，但存在失败任务')
    else ElMessage.success('同步完成')
  } catch (error) {
    ElMessage.error(`同步失败：${error?.message || '后端异常'}`)
  } finally {
    submitting.value = false
  }
}
async function load() {
  loading.value = true
  try {
    const [base, attrs, uniqueList, bound] = await Promise.all([
      getFieldTemplate(templateId.value),
      searchFieldTemplateAttributes(templateId.value),
      searchFieldTemplateUniques(templateId.value),
      searchFieldTemplateModels(templateId.value)
    ])
    template.value = base
    fields.value = responseList(attrs)
    uniques.value = responseList(uniqueList)
    model.value = responseList(bound).find((item) => String(modelObjectIdOf(item)) === modelId.value) || { id: modelId.value }
    await loadDiff()
  } catch (error) {
    errorMessage.value = `同步上下文加载失败：${error?.message || '后端异常'}`
  } finally {
    loading.value = false
  }
}
onMounted(load)
onBeforeUnmount(() => { if (pollTimer) clearTimeout(pollTimer) })
</script>

<style scoped>
.field-template-flow { height: 100%; overflow-y: auto; padding: 24px 32px 40px; background: #f5f7fa; color: #313238; }
.flow-head { display: flex; align-items: flex-start; gap: 18px; margin-bottom: 18px; }
.back-link { border: 0; background: transparent; color: #3a84ff; cursor: pointer; font-size: 14px; padding: 4px 0; }
h2 { margin: 0; font-size: 20px; font-weight: 600; }.sub-title { margin: 8px 0 0; color: #979ba5; font-size: 13px; }.context-alert { margin-bottom: 14px; }
.flow-card { background: #fff; border: 1px solid #dcdee5; border-radius: 2px; padding: 18px; margin-bottom: 16px; }.card-title { font-size: 14px; font-weight: 600; margin-bottom: 14px; }
.context-grid, .diff-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }.context-grid div { display: flex; flex-direction: column; gap: 7px; padding: 14px; background: #f5f7fa; }.context-grid span { color: #979ba5; font-size: 12px; }.context-grid strong { font-size: 14px; }
.diff-grid { grid-template-columns: 1fr 1fr; }.diff-box { display: flex; align-items: center; gap: 14px; padding: 16px; background: #f5f7fa; font-size: 13px; }.diff-new { color: #2dcb56; }.diff-update { color: #3a84ff; }.diff-conflict, .failure { color: #ea3636; }.action-card { display: flex; align-items: center; gap: 10px; }.task-result { display: flex; gap: 14px; margin-left: 20px; font-size: 13px; }.task-status.success, .task-status.finished { color: #2dcb56; }.task-status { color: #63656e; }
@media (max-width: 900px) { .context-grid, .diff-grid { grid-template-columns: 1fr 1fr; }.field-template-flow { padding: 16px; } }
</style>
