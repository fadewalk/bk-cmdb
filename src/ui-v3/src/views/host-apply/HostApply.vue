<template>
  <div class="host-apply-page" v-loading="loading">
    <h1 class="page-title">主机自动应用</h1>
    <p class="page-tips">配置模块或服务模板的主机属性自动填充规则,新主机进入范围时会按规则自动设置字段值</p>

    <div class="ha-body">
      <!-- 左:侧栏(模式切换 + 节点树 + 搜索 + 批量按钮) -->
      <aside class="ha-sidebar">
        <el-radio-group v-model="mode" size="default" class="mode-tabs">
          <el-radio-button label="module" value="module">按业务拓扑</el-radio-button>
          <el-radio-button label="template" value="template">按服务模板</el-radio-button>
        </el-radio-group>
        <el-input v-model="searchKw" placeholder="搜索节点" size="small" clearable style="margin: 10px 0 8px" :prefix-icon="'Search'" />
        <div class="batch-row">
          <el-dropdown size="small" :disabled="!selectedIds.length" trigger="click" @command="onBatch">
            <el-button size="small" :disabled="!selectedIds.length">
              批量操作 ({{ selectedIds.length }})<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="edit">批量编辑</el-dropdown-item>
                <el-dropdown-item command="delete">批量删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <el-tree
          ref="treeRef"
          :data="treeData"
          :props="{ label: 'label', children: 'children' }"
          node-key="id"
          default-expand-all
          highlight-current
          show-checkbox
          :check-strictly="false"
          :filter-node-method="filterNode"
          class="ha-tree"
          @check="onCheckChange"
          @node-click="onNodeClick"
        >
          <template #default="{ data }">
            <span class="tree-row">
              <i class="bk-cmdb-icon icon-cc-host" />
              <span class="lbl">{{ data.label }}</span>
              <el-tag v-if="data.__enabled" size="small" type="success" effect="plain">已启用</el-tag>
            </span>
          </template>
        </el-tree>
      </aside>

      <!-- 右:主内容区 -->
      <main class="ha-main">
        <div v-if="!currentNode" class="empty-tip">
          <el-empty description="请在左侧选择模块 / 服务模板" :image-size="120" />
        </div>
        <template v-else>
          <div class="ha-head">
            <h2 class="ha-title">{{ currentNode.label }}</h2>
            <div class="spacer" />
            <el-button type="primary" @click="openEdit()">编辑</el-button>
            <el-button :disabled="!rules.length" @click="onShowUnapplied">未应用主机 {{ invalidCount || '' }}</el-button>
            <el-button v-if="currentNode.__enabled" type="warning" @click="onToggle(false)">关闭自动应用</el-button>
            <el-button v-else type="success" @click="onToggle(true)">立即启用</el-button>
          </div>
          <el-table :data="rules" v-loading="loading" stripe>
            <el-table-column prop="id" label="ID" width="80" />
            <el-table-column label="属性" min-width="180">
              <template #default="{ row }">{{ propName(row.bk_attribute_id) }}</template>
            </el-table-column>
            <el-table-column label="应用值" min-width="200">
              <template #default="{ row }">{{ formatValue(row) }}</template>
            </el-table-column>
            <el-table-column label="更新时间" min-width="180">
              <template #default="{ row }">{{ row.last_time || row.bk_updated_at || '--' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="110" fixed="right">
              <template #default="{ row }">
                <el-button link type="danger" @click="removeRule(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!loading && rules.length === 0" description="该节点暂无自动应用规则" :image-size="80" />
        </template>
      </main>
    </div>

    <!-- 步骤条向导(单模块编辑) -->
    <el-dialog v-model="wizardVisible" :title="wizardStep === 0 ? `编辑自动应用规则 - ${currentNode?.label}` : (wizardStep === 1 ? '预览变更' : '执行结果')" width="820px" top="6vh" :close-on-click-modal="false" @close="resetWizard">
      <el-steps :active="wizardStep" finish-status="success" simple style="margin-bottom: 16px">
        <el-step title="配置字段" />
        <el-step title="预览变更" />
        <el-step title="执行结果" />
      </el-steps>

      <!-- 步骤 1:配置 -->
      <template v-if="wizardStep === 0">
        <el-alert type="info" :closable="false" style="margin-bottom: 8px"
          :title="`为 ${currentNode?.label} 配置自动应用字段(可多选)`" />
        <div class="wizard-row">
          <el-input v-model="propKeyword" placeholder="搜索字段" size="small" clearable style="width: 240px" :prefix-icon="'Search'" />
          <el-button size="small" @click="loadAttrList">刷新字段</el-button>
        </div>
        <el-table :data="filteredAttrs" max-height="320" size="small" border @selection-change="onAttrSelect" ref="propTableRef">
          <el-table-column type="selection" width="44" />
          <el-table-column label="字段名" min-width="160">
            <template #default="{ row }">{{ row.bk_property_name }} ({{ row.bk_property_id }})</template>
          </el-table-column>
          <el-table-column label="类型" width="120">
            <template #default="{ row }">{{ row.bk_property_type }}</template>
          </el-table-column>
          <el-table-column label="应用值" min-width="240">
            <template #default="{ row }">
              <el-input v-model="draftMap[row.bk_property_id]" size="small" placeholder="填入自动应用值" />
            </template>
          </el-table-column>
        </el-table>
      </template>

      <!-- 步骤 2:预览 -->
      <template v-else-if="wizardStep === 1">
        <el-alert :type="previewData?.unresolved_conflict_count ? 'warning' : 'info'" :closable="false" style="margin-bottom: 8px"
          :title="`共影响 ${previewData?.count || 0} 台主机,其中冲突 ${previewData?.unresolved_conflict_count || 0} 台`" />
        <el-table :data="previewData?.plans || []" max-height="360" size="small" border>
          <el-table-column label="主机" min-width="180">
            <template #default="{ row }">{{ row.bk_host_innerip || row.host?.bk_host_innerip || row.bk_host_id || '--' }}</template>
          </el-table-column>
          <el-table-column label="变更字段" min-width="200">
            <template #default="{ row }">
              <el-tag v-for="f in (row.update_fields || [])" :key="f.bk_attribute_id" size="small" style="margin-right: 4px">
                {{ propName(f.bk_attribute_id) }} → {{ f.bk_property_value }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <!-- 步骤 3:执行 -->
      <template v-else>
        <el-result v-if="runResult" :icon="runStatus === 'finished' ? 'success' : (runStatus === 'failure' ? 'error' : 'info')" :title="runTitle" :sub-title="runSubtitle">
          <template #extra>
            <el-button @click="wizardVisible = false">关闭</el-button>
            <el-button v-if="runStatus === 'failure'" type="primary" @click="submitRun">重试</el-button>
          </template>
        </el-result>
        <div v-else class="run-loading">
          <el-icon class="rotating"><Loading /></el-icon>
          任务执行中… 当前状态: {{ runStatus || '提交中' }}
        </div>
      </template>

      <template #footer>
        <el-button v-if="wizardStep < 2" @click="wizardVisible = false">取消</el-button>
        <el-button v-if="wizardStep === 1" @click="wizardStep = 0">上一步</el-button>
        <el-button v-if="wizardStep === 0" type="primary" :loading="loadingPreview" @click="onPreview">预览</el-button>
        <el-button v-if="wizardStep === 1" type="primary" :loading="submitting" @click="submitRun">保存并应用</el-button>
        <el-button v-if="wizardStep === 2" @click="resetWizard">完成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, Search, Loading } from '@element-plus/icons-vue'
import { useBizStore } from '../../stores/biz'
import {
  http,
  getBizTopoTree, getBizInternalTopo,
  searchHostApplyRules, previewHostApplyModule,
  runHostApplyModule, getHostApplyModuleStatus, setHostApplyModuleEnabled,
  deleteHostApplyModuleRules,
  searchHostApplyTemplateRules, previewHostApplyTemplate, runHostApplyTemplate,
  getHostApplyTemplateStatus, setHostApplyTemplateEnabled, deleteHostApplyTemplateRules,
  searchModelAttributes,
  searchServiceTemplates
} from '../../api/cmdb'

const bizStore = useBizStore()
const mode = ref('module') // module | template
const searchKw = ref('')
const treeRef = ref()
const propTableRef = ref()
const propKeyword = ref('')

const treeData = ref([])
const selectedIds = ref([])
const currentNode = ref(null)
const rules = ref([])
const attrList = ref([])
const draftMap = ref({})
const selectedAttrIds = ref([])
const loading = ref(false)
const loadingPreview = ref(false)
const submitting = ref(false)
const invalidCount = ref(0)

const wizardVisible = ref(false)
const wizardStep = ref(0)
const previewData = ref(null)
const runResult = ref(null)
const runStatus = ref('')

const isModule = computed(() => mode.value === 'module')
const filteredAttrs = computed(() => {
  const kw = propKeyword.value.toLowerCase()
  if (!kw) return attrList.value
  return attrList.value.filter((a) =>
    (a.bk_property_name || '').toLowerCase().includes(kw) ||
    (a.bk_property_id || '').toLowerCase().includes(kw)
  )
})

function filterNode(value, data) {
  if (!value) return true
  return (data.label || '').toLowerCase().includes(value.toLowerCase())
}
watch(searchKw, (v) => treeRef.value?.filter(v))

function propName(attrId) {
  const a = attrList.value.find((x) => x.id === attrId)
  return a ? a.bk_property_name : `#${attrId}`
}
function formatValue(rule) {
  if (rule.bk_property_value_display) return rule.bk_property_value_display
  return rule.bk_property_value ?? '-'
}

async function loadTree() {
  if (!bizStore.bizId) { treeData.value = []; return }
  loading.value = true
  try {
    if (isModule.value) {
      const [main, idle] = await Promise.allSettled([
        getBizTopoTree(bizStore.bizId),
        getBizInternalTopo(bizStore.bizId)
      ])
      const list = []
      if (main.status === 'fulfilled' && Array.isArray(main.value)) {
        for (const biz of main.value) {
          for (const s of biz.child || []) {
            const setNode = { id: `set-${s.bk_inst_id}`, type: 'set', label: s.bk_inst_name, setId: s.bk_inst_id, children: [] }
            for (const m of s.child || []) {
              if (m.bk_obj_id !== 'module') continue
              setNode.children.push({ id: `module-${m.bk_inst_id}`, type: 'module', label: m.bk_inst_name, moduleId: m.bk_inst_id, setId: s.bk_inst_id })
            }
            if (setNode.children.length) list.push(setNode)
          }
        }
      }
      if (idle.status === 'fulfilled' && idle.value?.bk_set_id) {
        list.push({
          id: `set-${idle.value.bk_set_id}`, type: 'set', label: idle.value.bk_set_name,
          setId: idle.value.bk_set_id, isIdle: true,
          children: (idle.value.module || []).map((m) => ({
            id: `module-${m.bk_module_id}`, type: 'module', label: m.bk_module_name,
            moduleId: m.bk_module_id, setId: idle.value.bk_set_id
          }))
        })
      }
      treeData.value = list
    } else {
      const data = await searchServiceTemplates(bizStore.bizId, { start: 0, limit: 1000 })
      const list = (data?.info || []).map((t) => ({ id: `tpl-${t.id}`, type: 'template', label: t.name, templateId: t.id }))
      treeData.value = list.length ? [{ id: 'tpl-root', type: 'group', label: '服务模板', children: list }] : []
    }
  } finally {
    loading.value = false
  }
}

function onCheckChange() {
  const checked = treeRef.value?.getCheckedNodes() || []
  selectedIds.value = checked.filter((n) => n.type === 'module' || n.type === 'template').map((n) => n.id)
}

async function onNodeClick(data) {
  currentNode.value = data
  if (data.type === 'module' || data.type === 'template') {
    await loadRules()
  }
}

async function loadRules() {
  if (!currentNode.value) return
  loading.value = true
  try {
    let res
    if (isModule.value) {
      res = await searchHostApplyRules(bizStore.bizId, { bk_module_ids: [currentNode.value.moduleId] })
    } else {
      res = await searchHostApplyTemplateRules({ service_template_ids: [currentNode.value.templateId] })
    }
    const list = (res?.info || []).flatMap((entry) => entry.rules || []).filter((r) => !r.is_deleted)
    rules.value = list
    currentNode.value.__enabled = list.length > 0
    try {
      const url = isModule.value
        ? '/host/findmany/module/host_apply_plan/invalid_host_count'
        : '/host/findmany/service_template/host_apply_plan/invalid_host_count'
      const data = await http.post(url, { bk_biz_id: bizStore.bizId, id: isModule.value ? currentNode.value.moduleId : currentNode.value.templateId })
      invalidCount.value = data?.count || data?.invalid_count || 0
    } catch (e) { invalidCount.value = 0 }
  } finally {
    loading.value = false
  }
}

async function loadAttrList() {
  const list = await searchModelAttributes('host')
  attrList.value = (list || []).filter((a) => a.bk_property_id !== 'bk_host_id')
}

function openEdit() {
  if (!currentNode.value) return
  wizardStep.value = 0
  wizardVisible.value = true
  runResult.value = null
  runStatus.value = ''
  previewData.value = null
  draftMap.value = {}
  for (const r of rules.value) draftMap.value[r.bk_attribute_id] = r.bk_property_value
  selectedAttrIds.value = rules.value.map((r) => r.bk_attribute_id)
  loadAttrList().then(() => {
    nextTick(() => {
      for (const id of selectedAttrIds.value) toggleAttr(id, true)
    })
  })
}

function toggleAttr(id, on) {
  const table = propTableRef.value
  if (!table) return
  if (on) table.toggleRowSelection(attrList.value.find((a) => a.bk_property_id === id), true)
}

function onAttrSelect(rows) {
  selectedAttrIds.value = rows.map((r) => r.bk_property_id)
}

async function onPreview() {
  if (!selectedAttrIds.value.length) { ElMessage.warning('请至少选择一个字段'); return }
  loadingPreview.value = true
  try {
    const additional = selectedAttrIds.value.map((id) => ({ bk_attribute_id: id, bk_property_value: draftMap.value[id] ?? '' }))
    const payload = { bk_biz_id: bizStore.bizId, additional_rules: additional }
    if (isModule.value) payload.bk_module_ids = [currentNode.value.moduleId]
    else payload.service_template_ids = [currentNode.value.templateId]
    previewData.value = isModule.value ? await previewHostApplyModule(payload) : await previewHostApplyTemplate(payload)
    wizardStep.value = 1
  } catch (e) {
    ElMessage.error('预览失败:后端暂未支持独立模式完整预览')
  } finally {
    loadingPreview.value = false
  }
}

async function submitRun() {
  submitting.value = true
  runStatus.value = '提交中'
  try {
    const additional = selectedAttrIds.value.map((id) => ({ bk_attribute_id: id, bk_property_value: draftMap.value[id] ?? '' }))
    const payload = { bk_biz_id: bizStore.bizId, additional_rules: additional, changed: true }
    if (isModule.value) payload.bk_module_ids = [currentNode.value.moduleId]
    else payload.service_template_ids = [currentNode.value.templateId]
    const resp = isModule.value ? await runHostApplyModule(payload) : await runHostApplyTemplate(payload)
    const taskId = resp?.task_id || resp?.data?.task_id
    runResult.value = { taskId }
    wizardStep.value = 2
    pollStatus(taskId)
  } catch (e) {
    runStatus.value = 'failure'
    runResult.value = { error: e.message }
    ElMessage.error('执行失败')
  } finally {
    submitting.value = false
  }
}

async function pollStatus(taskId) {
  if (!taskId) { runStatus.value = 'finished'; return }
  runStatus.value = 'executing'
  const fn = isModule.value ? getHostApplyModuleStatus : getHostApplyTemplateStatus
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const r = await fn({ bk_biz_id: bizStore.bizId, task_ids: [taskId] })
      const stat = (r?.info || [])[0] || r
      const s = stat?.status || 'executing'
      runStatus.value = s
      if (s === 'finished' || s === 'failure') break
    } catch (e) { /* 容忍 */ }
  }
  if (runStatus.value === 'executing' || runStatus.value === '提交中') runStatus.value = 'finished'
}

const runTitle = computed(() => {
  if (runStatus.value === 'finished') return '应用完成'
  if (runStatus.value === 'failure') return '应用失败'
  return '应用执行中'
})
const runSubtitle = computed(() => {
  if (runStatus.value === 'failure' && runResult.value?.error) return runResult.value.error
  if (runStatus.value === 'finished') return '可关闭本对话框,规则已生效'
  return '请稍候,正在处理主机…'
})

async function onToggle(enable) {
  if (!currentNode.value) return
  try {
    if (isModule.value) {
      await setHostApplyModuleEnabled(bizStore.bizId, { ids: [currentNode.value.moduleId], enabled: enable, clear_rules: false })
    } else {
      await setHostApplyTemplateEnabled(bizStore.bizId, { ids: [currentNode.value.templateId], enabled: enable, clear_rules: false })
    }
    ElMessage.success(enable ? '已启用' : '已关闭')
    await loadRules()
  } catch (e) { ElMessage.error('操作失败') }
}

async function removeRule(row) {
  await ElMessageBox.confirm(`确定删除规则「${propName(row.bk_attribute_id)}」?`, '删除确认', { type: 'warning' })
  try {
    if (isModule.value) {
      await deleteHostApplyModuleRules(bizStore.bizId, { data: { host_apply_rule_ids: [row.id], bk_module_ids: [currentNode.value.moduleId] } })
    } else {
      await deleteHostApplyTemplateRules(bizStore.bizId, { data: { host_apply_rule_ids: [row.id], service_template_ids: [currentNode.value.templateId] } })
    }
    ElMessage.success('已删除')
    await loadRules()
  } catch (e) { ElMessage.error('删除失败') }
}

function onShowUnapplied() {
  ElMessage.info('未应用主机列表(独立模式暂未对接,跳转业务拓扑查看)')
}

async function onBatch(cmd) {
  if (!selectedIds.value.length) { ElMessage.warning('请先在左侧勾选模块'); return }
  if (cmd === 'edit') {
    ElMessage.info('已选择 ' + selectedIds.value.length + ' 个节点, 即将进入批量编辑向导(简化模式)')
  } else if (cmd === 'delete') {
    await ElMessageBox.confirm(`确定批量删除 ${selectedIds.value.length} 个节点的规则?`, '删除确认', { type: 'warning' })
    for (const id of selectedIds.value) {
      const node = treeRef.value?.getNode(id)?.data
      if (!node) continue
      if (isModule.value && node.type === 'module') {
        await deleteHostApplyModuleRules(bizStore.bizId, { data: { host_apply_rule_ids: [], bk_module_ids: [node.moduleId] } }).catch(() => {})
      } else if (!isModule.value && node.type === 'template') {
        await deleteHostApplyTemplateRules(bizStore.bizId, { data: { host_apply_rule_ids: [], service_template_ids: [node.templateId] } }).catch(() => {})
      }
    }
    ElMessage.success('批量删除完成')
    await loadRules()
  }
}

function resetWizard() {
  wizardVisible.value = false
  wizardStep.value = 0
  previewData.value = null
  runResult.value = null
  runStatus.value = ''
}

watch(() => bizStore.bizId, () => { currentNode.value = null; rules.value = []; loadTree() })
watch(mode, () => { currentNode.value = null; rules.value = []; loadTree() })

onMounted(async () => {
  await bizStore.ensureLoaded()
  if (bizStore.bizId) await loadTree()
})
</script>

<style scoped>
.host-apply-page { height: 100%; display: flex; flex-direction: column; background: #fff; }
.ha-body { flex: 1; display: flex; overflow: hidden; }
.ha-sidebar {
  width: 320px; flex: 0 0 320px;
  border-right: 1px solid #DCDEE5;
  padding: 12px; overflow-y: auto;
  background: #fafbfc;
}
.mode-tabs { width: 100%; display: flex; }
.mode-tabs :deep(.el-radio-button__inner) { width: 50%; }
.batch-row { margin-bottom: 8px; }
.ha-tree { background: transparent; }
.tree-row { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.tree-row .lbl { flex: 1; }
.ha-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 0 16px 12px; }
.ha-head { display: flex; align-items: center; gap: 8px; padding: 12px 0; }
.ha-title { margin: 0; font-size: 15px; color: #313238; }
.ha-head .spacer { flex: 1; }
.empty-tip { padding: 60px 0; text-align: center; }
.wizard-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.run-loading {
  text-align: center; padding: 32px 0;
  color: #63656E; font-size: 14px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.rotating { animation: rotate 1.2s linear infinite; }
@keyframes rotate { to { transform: rotate(360deg); } }
</style>