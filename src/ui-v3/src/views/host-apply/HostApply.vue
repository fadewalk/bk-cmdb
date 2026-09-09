<template>
  <div class="host-apply-page">
    <div class="ha-body">
      <!-- 左:侧栏(模式切换 + 节点树 + 搜索 + 批量按钮 + 折叠按钮) -->
      <aside class="ha-sidebar" :class="{ 'is-collapse': sidebarCollapsed }">
        <div v-if="!sidebarCollapsed" class="sidebar-inner">
          <div class="mode-tabs">
            <button
              :class="['mode-btn', { active: mode === 'module' }]"
              @click="switchMode('module')">按业务拓扑</button>
            <button
              :class="['mode-btn', { active: mode === 'template' }]"
              @click="switchMode('template')">按服务模板</button>
          </div>

          <div class="searchbar">
            <el-input
              v-model="searchKw"
              placeholder="输入关键字搜索"
              clearable
              size="default"
              class="search-input"
              :prefix-icon="'Search'"
            />
            <el-dropdown
              size="default"
              trigger="click"
              :disabled="!selectedIds.length"
              @command="onBatch"
            >
              <button class="batch-trigger" :disabled="!selectedIds.length">
                <span>批量操作</span>
                <em v-if="selectedIds.length" class="count">({{ selectedIds.length }})</em>
                <i class="caret">▾</i>
              </button>
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
            class="ha-tree"
            :data="treeData"
            :props="{ label: 'label', children: 'children' }"
            node-key="id"
            default-expand-all
            highlight-current
            :filter-node-method="filterNode"
            :expand-on-click-node="false"
            show-checkbox
            :check-strictly="true"
            @node-click="onNodeClick"
            @check="onTreeCheck"
          >
            <template #default="{ data }">
              <span class="tree-row">
                <i :class="['bk-cmdb-icon node-icon', nodeIconClass(data)]" />
                <span class="lbl">{{ data.label }}</span>
                <el-tag v-if="data.__enabled" size="small" type="success" effect="plain">已启用</el-tag>
              </span>
            </template>
          </el-tree>

          <!-- 底部多选摘要(类似原版 checked-list panel 的简化版) -->
          <div v-if="selectedIds.length" class="selected-summary">
            <div class="ss-line">已选择 <em>{{ selectedIds.length }}</em> 个目标</div>
            <div class="ss-actions">
              <el-button link size="small" type="primary" @click="onBatch('edit')">去编辑</el-button>
              <el-button link size="small" type="danger" @click="onBatch('delete')">去删除</el-button>
              <el-button link size="small" @click="clearSelection">清空</el-button>
            </div>
          </div>
        </div>

        <button class="collapse-handle" @click="sidebarCollapsed = !sidebarCollapsed">
          <i class="bk-icon icon-angle-left" :class="{ flipped: sidebarCollapsed }" />
        </button>
      </aside>

      <!-- 右:详情面板 -->
      <main class="ha-main" v-loading="loading">
        <div v-if="!currentNode" class="empty-tip">
          <el-empty description="请在左侧选择模块 / 服务模板" :image-size="120" />
        </div>
        <template v-else>
          <div class="ha-head">
            <h2 class="ha-title">{{ currentNode.label }}</h2>
            <small v-if="lastEditTime" class="last-edit">( 上次编辑时间 {{ lastEditTime }} )</small>
            <div class="spacer" />
            <el-button type="primary" @click="openEdit()">编辑</el-button>
            <el-tooltip :disabled="!conflictCount" content="无未应用需处理" placement="top">
            <el-button :disabled="!conflictCount || unappliedLoading" @click="onShowUnapplied">
              未应用主机 <em v-if="conflictCount" class="conflict-num">{{ conflictCount }}</em>
            </el-button>
            </el-tooltip>
            <el-button v-if="currentNode.__enabled" type="warning" @click="onToggle(false)">关闭自动应用</el-button>
            <el-button v-else type="success" @click="onToggle(true)">立即启用</el-button>
          </div>

          <el-table :data="rules" v-loading="loading" stripe>
            <el-table-column prop="id" label="ID" width="80" />
            <el-table-column label="属性" min-width="180">
              <template #default="{ row }">{{ propName(row.bk_attribute_id) }}</template>
            </el-table-column>
            <el-table-column label="应用值" min-width="220">
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

    <!-- 未应用主机列表:复用后端 preview plans,对齐老版 conflict-list -->
    <el-dialog v-model="unappliedVisible" title="未应用主机" width="820px">
      <el-alert type="warning" :closable="false" style="margin-bottom: 10px"
        :title="`共 ${unappliedPlans.length} 台主机需要应用`" />
      <el-table :data="unappliedPlans" v-loading="unappliedLoading" max-height="420" size="small" border>
        <el-table-column label="主机" min-width="180">
          <template #default="{ row }">{{ row.bk_host_innerip || row.host?.bk_host_innerip || row.bk_host_id || '--' }}</template>
        </el-table-column>
        <el-table-column label="变更字段" min-width="260">
          <template #default="{ row }">
            <el-tag v-for="f in (row.update_fields || [])" :key="f.bk_attribute_id" size="small" style="margin-right: 4px">
              {{ propName(f.bk_attribute_id) }} → {{ f.bk_property_value }}
            </el-tag>
          </template>
        </el-table-column>
            <el-table-column label="冲突" width="100">
              <template #default="{ row }">{{ planHasConflict(row) ? '有冲突' : '无' }}</template>
            </el-table-column>
      </el-table>
      <el-empty v-if="!unappliedLoading && !unappliedPlans.length" description="暂无未应用主机" :image-size="60" />
    </el-dialog>
    <el-dialog v-model="wizardVisible" :title="wizardStep === 0 ? `编辑自动应用规则 - ${currentNode?.label}` : (wizardStep === 1 ? '预览变更' : '执行结果')" width="820px" top="6vh" :close-on-click-modal="false" @close="resetWizard">
      <el-steps :active="wizardStep" finish-status="success" simple style="margin-bottom: 16px">
        <el-step title="配置字段" />
        <el-step title="预览变更" />
        <el-step title="执行结果" />
      </el-steps>

      <template v-if="wizardStep === 0">
        <el-alert type="info" :closable="false" style="margin-bottom: 8px"
          :title="`为 ${currentNode?.label} 配置自动应用字段(可多选)${batchTargets.length > 1 ? `，将应用到 ${batchTargets.length} 个目标` : ''}`" />
        <div class="wizard-row">
          <el-input v-model="propKeyword" placeholder="搜索字段" size="small" clearable style="width: 240px" :prefix-icon="'Search'" />
          <el-button size="small" @click="loadAttrList">刷新字段</el-button>
        </div>
          <el-table :data="filteredAttrs" row-key="id" :reserve-selection="true" max-height="320" size="small" border @selection-change="onAttrSelect" ref="propTableRef">
          <el-table-column type="selection" width="44" />
          <el-table-column label="字段名" min-width="160">
            <template #default="{ row }">{{ row.bk_property_name }} ({{ row.bk_property_id }})</template>
          </el-table-column>
          <el-table-column label="类型" width="120">
            <template #default="{ row }">{{ row.bk_property_type }}</template>
          </el-table-column>
          <el-table-column label="应用值" min-width="240">
            <template #default="{ row }">
              <el-input v-model="draftMap[attrKey(row)]" size="small" placeholder="填入自动应用值" />
            </template>
          </el-table-column>
        </el-table>
      </template>

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
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Loading } from '@element-plus/icons-vue'
import { useBizStore } from '../../stores/biz'
import {
  getBizTopoTree, getBizInternalTopo,
  searchHostApplyRules, previewHostApplyModule,
  runHostApplyModule, getHostApplyModuleStatus, setHostApplyModuleEnabled,
  deleteHostApplyModuleRules,
  searchHostApplyTemplateRules, previewHostApplyTemplate, runHostApplyTemplate,
  getHostApplyTemplateStatus, setHostApplyTemplateEnabled, deleteHostApplyTemplateRules,
  getInvalidHostCount, getInvalidTemplateHostCount,
  searchModelAttributes,
  searchServiceTemplates
} from '../../api/cmdb'

const bizStore = useBizStore()
const route = useRoute()
const mode = ref('module')
const sidebarCollapsed = ref(false)
const searchKw = ref('')
const treeRef = ref()
const propTableRef = ref()
const propKeyword = ref('')

const treeData = ref([])
const selectedIds = ref([])
const batchTargets = ref([])
const currentNode = ref(null)
const rules = ref([])
const attrList = ref([])
const draftMap = ref({})
const selectedAttrIds = ref([])
const loading = ref(false)
const loadingPreview = ref(false)
const submitting = ref(false)
const conflictCount = ref(0)
const lastEditTime = ref('')
const unappliedVisible = ref(false)
const unappliedLoading = ref(false)
const unappliedPlans = ref([])

const wizardVisible = ref(false)
const wizardStep = ref(0)
const previewData = ref(null)
const runResult = ref(null)
const runStatus = ref('')
const pollToken = ref(0)
const wizardContext = ref(null)

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

// 与原版 topology-tree 内部节点图标一致:空闲机池/故障机/待回收
const INTERNAL_NODE_CLASSES = {
  '1': 'icon-cc-host-free-pool',
  '2': 'icon-cc-host-breakdown',
  'default': 'icon-cc-host-free-pool'
}
const MODEL_ICON_CLASS = {
  set: 'icon-cc-nav-set-topo',
  module: 'icon-cc-module',
  biz: 'icon-cc-business',
  host: 'icon-cc-host',
  template: 'icon-cc-nav-service-topo'
}
function nodeIconClass(data) {
  if (data.type === 'set') return MODEL_ICON_CLASS.set
  if (data.type === 'module') return MODEL_ICON_CLASS.module
  if (data.type === 'template') return MODEL_ICON_CLASS.template
  // 内部空闲模块(原版 default !== 0 时的 internal node)
  return INTERNAL_NODE_CLASSES[data.bk_obj_id] || INTERNAL_NODE_CLASSES.default
}

function propName(attrId) {
  const a = attrList.value.find((x) => String(x.id) === String(attrId) || String(x.bk_property_id) === String(attrId))
  return a ? a.bk_property_name : `#${attrId}`
}
function normalizeRuleList(res) {
  return (res?.info || [])
    .flatMap((entry) => Array.isArray(entry?.rules) ? entry.rules : [entry])
    .filter((r) => r && !r.is_deleted)
}
function validTarget(node) {
  return node && ((isModule.value && node.type === 'module' && node.moduleId) ||
    (!isModule.value && node.type === 'template' && node.templateId))
}
function targetNodeById(id) {
  const node = treeRef.value?.getNode(id)
  return node?.data && validTarget(node.data) ? node.data : null
}
function selectedTargetNodes() {
  const seen = new Set()
  return selectedIds.value.map(targetNodeById).filter((node) => {
    if (!node || seen.has(node.id)) return false
    seen.add(node.id)
    return true
  })
}
function syncTreeSelection() {
  const validIds = selectedTargetNodes().map((node) => node.id)
  selectedIds.value = validIds
  treeRef.value?.setCheckedKeys(validIds)
  batchTargets.value = selectedTargetNodes()
}
function onTreeCheck(_, checked) {
  const nodes = checked?.checkedNodes || []
  selectedIds.value = nodes.filter(validTarget).map((node) => node.id)
  batchTargets.value = selectedTargetNodes()
}
function planHasConflict(plan) {
  return Boolean(plan?.unresolved_conflict_count || plan?.conflicts?.some((f) => f?.unresolved_conflict_exist))
}
function planHasChanges(plan) {
  return Array.isArray(plan?.update_fields) && plan.update_fields.length > 0
}
function attrKey(attr) {
  return String(attr?.id)
}
function ruleAttrKey(rule) {
  return String(rule?.bk_attribute_id)
}
function initialValue(attr, value) {
  if (value !== undefined && value !== null) return value
  return attr?.bk_property_type === 'bool' ? false : (['int', 'float'].includes(attr?.bk_property_type) ? undefined : '')
}
function normalizeValue(attr, value) {
  if (attr?.bk_property_type === 'bool') return Boolean(value)
  if (value === '' || value === null || value === undefined) return value
  if (attr?.bk_property_type === 'int') return Number(value)
  if (attr?.bk_property_type === 'float') return Number(value)
  return value
}
function valueIsBlank(value) {
  return value === '' || value === null || value === undefined
}
function formatValue(rule) {
  if (rule.bk_property_value_display) return rule.bk_property_value_display
  return rule.bk_property_value ?? '-'
}
function findAttr(id) {
  return attrList.value.find((attr) => String(attr.id) === String(id) || String(attr.bk_property_id) === String(id))
}

async function loadTree() {
  if (!bizStore.bizId) {
    treeData.value = []
    selectedIds.value = []
    batchTargets.value = []
    return
  }
  loading.value = true
  try {
    const previousSelectedIds = [...selectedIds.value]
    if (isModule.value) {
      const [main, idle] = await Promise.allSettled([
        getBizTopoTree(bizStore.bizId),
        getBizInternalTopo(bizStore.bizId)
      ])
      const list = []
      if (main.status === 'fulfilled' && Array.isArray(main.value)) {
        for (const biz of main.value) {
          for (const s of biz.child || []) {
            const setNode = {
              id: `set-${s.bk_inst_id}`,
              type: 'set',
              label: s.bk_inst_name,
              setId: s.bk_inst_id,
              children: []
            }
            for (const m of s.child || []) {
              if (m.bk_obj_id !== 'module') continue
              setNode.children.push({
                id: `module-${m.bk_inst_id}`,
                type: 'module',
                label: m.bk_inst_name,
                moduleId: m.bk_inst_id,
                setId: s.bk_inst_id,
                __enabled: Boolean(m.host_apply_enabled),
                serviceTemplateId: m.service_template_id,
                serviceTemplateHostApplyEnabled: m.service_template_host_apply_enabled
              })
            }
            if (setNode.children.length) list.push(setNode)
          }
        }
      }
      if (idle.status === 'fulfilled' && idle.value?.bk_set_id) {
        const idleSetId = `set-${idle.value.bk_set_id}`
        if (!list.some((node) => node.id === idleSetId)) {
          list.push({
            id: idleSetId,
            type: 'set',
            label: idle.value.bk_set_name,
            setId: idle.value.bk_set_id,
            isIdle: true,
            children: (idle.value.module || []).map((m) => ({
              id: `module-${m.bk_module_id}`,
              type: 'module',
              label: m.bk_module_name,
              moduleId: m.bk_module_id,
              setId: idle.value.bk_set_id,
              __enabled: Boolean(m.host_apply_enabled),
              serviceTemplateId: m.service_template_id,
              serviceTemplateHostApplyEnabled: m.service_template_host_apply_enabled
            }))
          })
        }
      }
      treeData.value = list
    } else {
      const data = await searchServiceTemplates(bizStore.bizId, { start: 0, limit: 1000 })
      const list = (data?.info || []).map((t) => ({
        id: `tpl-${t.id}`,
        type: 'template',
        label: t.name,
        templateId: t.id,
        __enabled: Boolean(t.host_apply_enabled)
      }))
      treeData.value = list.length
        ? [{ id: 'tpl-root', type: 'group', label: '服务模板', children: list }]
        : []
    }
    await nextTick()
    selectedIds.value = previousSelectedIds
    syncTreeSelection()
  } catch (e) {
    treeData.value = []
    selectedIds.value = []
    batchTargets.value = []
    ElMessage.error('自动应用节点加载失败: ' + (e?.message || '后端异常'))
  } finally {
    loading.value = false
  }
}

async function onNodeClick(data) {
  if (data.type === 'group') return
  if (data.type !== 'module' && data.type !== 'template') return
  currentNode.value = data
  await loadRules()
}

async function loadRules() {
  if (!currentNode.value) return
  const node = currentNode.value
  const modeAtStart = isModule.value
  const bizId = bizStore.bizId
  loading.value = true
  try {
    let res
    if (modeAtStart) {
      res = await searchHostApplyRules(bizId, { bk_module_ids: [node.moduleId] })
    } else {
      res = await searchHostApplyTemplateRules({ bk_biz_id: bizId, service_template_ids: [node.templateId] })
    }
    const list = normalizeRuleList(res)
    if (currentNode.value !== node || bizStore.bizId !== bizId || isModule.value !== modeAtStart) return
    rules.value = list
    lastEditTime.value = list.map((r) => r.last_time || r.bk_updated_at).filter(Boolean).sort().slice(-1)[0] || ''
    try {
      const id = modeAtStart ? node.moduleId : node.templateId
      const data = modeAtStart
        ? await getInvalidHostCount(bizId, { id })
        : await getInvalidTemplateHostCount(bizId, { id })
      if (currentNode.value === node && bizStore.bizId === bizId && isModule.value === modeAtStart) {
        conflictCount.value = data?.count || data?.invalid_count || 0
      }
    } catch (e) {
      if (currentNode.value === node) conflictCount.value = 0
    }
  } catch (e) {
    if (currentNode.value === node) {
      rules.value = []
      lastEditTime.value = ''
      conflictCount.value = 0
      ElMessage.error('规则加载失败: ' + (e?.message || '后端异常'))
    }
  } finally {
    loading.value = false
  }
}

async function loadAttrList() {
  try {
    const list = await searchModelAttributes('host')
    attrList.value = (list || []).filter((a) => a.bk_property_id !== 'bk_host_id' && a.id !== undefined)
  } catch (e) {
    attrList.value = []
    ElMessage.error('字段加载失败: ' + (e?.message || '后端异常'))
  }
}

function currentTargets() {
  const contextTargets = wizardContext.value?.targets
  const targets = contextTargets?.length ? contextTargets : (batchTargets.value.length ? batchTargets.value : (currentNode.value ? [currentNode.value] : []))
  return targets.filter(validTarget)
}

function getRemovedRuleIds(target) {
  const selected = new Set(selectedAttrIds.value.map(String))
  const originalRules = wizardContext.value?.rulesByTarget?.[String(target.id)] || []
  return originalRules.filter((rule) => !selected.has(ruleAttrKey(rule))).map((rule) => rule.id).filter(Boolean)
}

function buildAdditionalRules(target) {
  return selectedAttrIds.value.map((id) => {
    const attr = findAttr(id)
    const key = attr ? attrKey(attr) : String(id)
    const value = normalizeValue(attr, draftMap.value[key])
    const rule = { bk_attribute_id: attr?.id ?? id, bk_property_value: value }
    const modeAtStart = wizardContext.value?.mode ?? mode.value
    if (modeAtStart === 'module') rule.bk_module_id = target.moduleId
    else rule.service_template_id = target.templateId
    return rule
  })
}

function buildPlanPayload(changed = false) {
  const targets = currentTargets()
  if (!targets.length) return null
  const payload = {
    bk_biz_id: wizardContext.value?.bizId ?? bizStore.bizId,
    additional_rules: targets.flatMap(buildAdditionalRules),
    remove_rule_ids: targets.flatMap(getRemovedRuleIds)
  }
  if (changed) payload.changed = true
  const modeAtStart = wizardContext.value?.mode ?? mode.value
  if (modeAtStart === 'module') payload.bk_module_ids = [...new Set(targets.map((target) => target.moduleId))]
  else payload.service_template_ids = [...new Set(targets.map((target) => target.templateId))]
  return payload
}

function openEdit() {
  const targets = currentTargets()
  if (!targets.length) return
  const first = targets[0]
  const rulesByTarget = wizardContext.value?.rulesByTarget || {}
  wizardContext.value = {
    bizId: bizStore.bizId,
    mode: mode.value,
    targets: targets.map((target) => ({ ...target })),
    rulesByTarget: { ...rulesByTarget, [String(first.id)]: [...rules.value] }
  }
  wizardStep.value = 0
  wizardVisible.value = true
  runResult.value = null
  runStatus.value = ''
  previewData.value = null
  draftMap.value = {}
  selectedAttrIds.value = rules.value.map((r) => ruleAttrKey(r))
  for (const r of rules.value) draftMap.value[ruleAttrKey(r)] = r.bk_property_value
  loadAttrList().then(() => {
    nextTick(() => {
      propTableRef.value?.clearSelection()
      for (const id of selectedAttrIds.value) toggleAttr(id, true)
    })
  })
}

function toggleAttr(id, on = true) {
  const row = findAttr(id)
  if (!row) return
  propTableRef.value?.toggleRowSelection(row, on)
}

function onAttrSelect(rows) {
  const visibleIds = new Set(filteredAttrs.value.map((row) => attrKey(row)))
  const selectedVisibleIds = new Set(rows.map((row) => attrKey(row)))
  selectedAttrIds.value = [
    ...selectedAttrIds.value.map(String).filter((id) => !visibleIds.has(id)),
    ...selectedVisibleIds
  ]
}

function additionalRules() {
  const targets = currentTargets()
  return targets.flatMap(buildAdditionalRules)
}

async function onPreview() {
  if (!selectedAttrIds.value.length) { ElMessage.warning('请至少选择一个字段'); return }
  const payload = buildPlanPayload(false)
  if (!payload || !payload.additional_rules.length) { ElMessage.warning('请至少配置一个字段'); return }
  loadingPreview.value = true
  try {
    const data = isModule.value ? await previewHostApplyModule(payload) : await previewHostApplyTemplate(payload)
    previewData.value = data
    wizardStep.value = 1
  } catch (e) {
    ElMessage.error('预览失败: ' + (e?.message || '后端异常'))
  } finally {
    loadingPreview.value = false
  }
}

async function submitRun() {
  const payload = buildPlanPayload(true)
  if (!payload || !payload.additional_rules.length) { ElMessage.warning('请至少配置一个字段'); return }
  submitting.value = true
  runStatus.value = '提交中'
  try {
    const context = wizardContext.value
    const resp = context?.mode === 'module' ? await runHostApplyModule(payload) : await runHostApplyTemplate(payload)
    const taskId = resp?.task_id || resp?.data?.task_id
    if (!taskId) throw new Error('后端未返回任务 ID')
    runResult.value = { taskId }
    wizardStep.value = 2
    await pollStatus(taskId, context)
  } catch (e) {
    runStatus.value = 'failure'
    runResult.value = { error: e?.message || '后端异常' }
    wizardStep.value = 2
    ElMessage.error('执行失败')
  } finally {
    submitting.value = false
  }
}

async function pollStatus(taskId, context) {
  const token = ++pollToken.value
  runStatus.value = 'executing'
  const fn = context?.mode === 'module' ? getHostApplyModuleStatus : getHostApplyTemplateStatus
  const bizId = context?.bizId ?? bizStore.bizId
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    if (token !== pollToken.value || !wizardVisible.value) return
    try {
      const response = await fn({ bk_biz_id: bizId, task_ids: [taskId] })
      const tasks = response?.task_info || response?.info || []
      const stat = tasks.find((task) => String(task.task_id) === String(taskId)) || tasks[0] || response
      const status = stat?.status || 'executing'
      runStatus.value = status
      if (status === 'finished' || status === 'failure') {
        if (status === 'finished' && token === pollToken.value) {
          await loadRules()
        }
        return
      }
    } catch (e) {
      runStatus.value = '查询状态失败'
    }
  }
  if (token === pollToken.value) runStatus.value = 'timeout'
}

const runTitle = computed(() => {
  if (runStatus.value === 'finished') return '应用完成'
  if (runStatus.value === 'failure') return '应用失败'
  if (runStatus.value === 'timeout') return '应用状态未知'
  return '应用执行中'
})
const runSubtitle = computed(() => {
  if (runStatus.value === 'failure' && runResult.value?.error) return runResult.value.error
  if (runStatus.value === 'finished') return '可关闭本对话框,规则已生效'
  if (runStatus.value === 'timeout') return '任务状态查询超时，请稍后刷新确认结果，勿重复提交'
  return '请稍候,正在处理主机…'
})

async function onToggle(enable) {
  if (!currentNode.value) return
  const node = currentNode.value
  const bizId = bizStore.bizId
  try {
    if (isModule.value) {
      await setHostApplyModuleEnabled(bizId, { ids: [node.moduleId], enabled: enable, clear_rules: false })
    } else {
      await setHostApplyTemplateEnabled(bizId, { ids: [node.templateId], enabled: enable, clear_rules: false })
    }
    node.__enabled = enable
    const treeNode = targetNodeById(node.id)
    if (treeNode) treeNode.__enabled = enable
    ElMessage.success(enable ? '已启用' : '已关闭')
    await loadRules()
  } catch (e) { ElMessage.error('操作失败: ' + (e?.message || '后端异常')) }
}

async function removeRule(row) {
  await ElMessageBox.confirm(`确定删除规则「${propName(row.bk_attribute_id)}」?`, '删除确认', { type: 'warning' })
  try {
    if (isModule.value) {
      await deleteHostApplyModuleRules(bizStore.bizId, { host_apply_rule_ids: [row.id], bk_module_ids: [currentNode.value.moduleId] })
    } else {
      await deleteHostApplyTemplateRules(bizStore.bizId, { host_apply_rule_ids: [row.id], service_template_ids: [currentNode.value.templateId] })
    }
    ElMessage.success('已删除')
    await loadRules()
  } catch (e) { ElMessage.error('删除失败') }
}

async function onShowUnapplied() {
  if (!currentNode.value) return
  unappliedVisible.value = true
  unappliedLoading.value = true
  unappliedPlans.value = []
  try {
    const payload = isModule.value
      ? { bk_biz_id: bizStore.bizId, bk_module_ids: [currentNode.value.moduleId] }
      : { bk_biz_id: bizStore.bizId, service_template_ids: [currentNode.value.templateId] }
    await loadAttrList()
    const data = isModule.value ? await previewHostApplyModule(payload) : await previewHostApplyTemplate(payload)
    unappliedPlans.value = (data?.plans || []).filter(planHasChanges)
  } catch (e) {
    ElMessage.error('未应用主机查询失败: ' + (e?.message || '后端异常'))
  } finally { unappliedLoading.value = false }
}

async function onBatch(cmd) {
  const targets = selectedTargetNodes()
  if (!targets.length) { ElMessage.warning('请先在左侧选择模块或服务模板'); return }
  if (cmd === 'edit') {
    const first = targets[0]
    currentNode.value = first
    const results = await Promise.all(targets.map(async (node) => {
      const target = isModule.value ? { bk_module_ids: [node.moduleId] } : { service_template_ids: [node.templateId] }
      const res = isModule.value
        ? await searchHostApplyRules(bizStore.bizId, target)
        : await searchHostApplyTemplateRules({ bk_biz_id: bizStore.bizId, ...target })
      return [String(node.id), normalizeRuleList(res)]
    }))
    rules.value = results[0]?.[1] || []
    wizardContext.value = {
      bizId: bizStore.bizId,
      mode: mode.value,
      targets: targets.map((node) => ({ ...node })),
      rulesByTarget: Object.fromEntries(results)
    }
    openEdit()
    ElMessage.info(`已载入 ${targets.length} 个目标,保存时将应用到当前选择目标`)
  } else if (cmd === 'delete') {
    await ElMessageBox.confirm(`确定批量删除 ${targets.length} 个目标的规则?`, '删除确认', { type: 'warning' })
    const results = await Promise.allSettled(targets.map(async (node) => {
      const target = isModule.value ? { bk_module_ids: [node.moduleId] } : { service_template_ids: [node.templateId] }
      const res = isModule.value
        ? await searchHostApplyRules(bizStore.bizId, target)
        : await searchHostApplyTemplateRules({ bk_biz_id: bizStore.bizId, ...target })
      const ids = normalizeRuleList(res).map((rule) => rule.id).filter(Boolean)
      if (!ids.length) return { node, skipped: true }
      if (isModule.value) await deleteHostApplyModuleRules(bizStore.bizId, { host_apply_rule_ids: ids, ...target })
      else await deleteHostApplyTemplateRules(bizStore.bizId, { host_apply_rule_ids: ids, ...target })
      return { node }
    }))
    const failed = results.filter((result) => result.status === 'rejected')
    if (failed.length) ElMessage.warning(`批量删除完成,${failed.length} 个目标失败`)
    else ElMessage.success('批量删除完成')
    await loadTree()
    const next = targets.find((node) => node.id === currentNode.value?.id)
    if (next) {
      currentNode.value = targetNodeById(next.id)
      await loadRules()
    } else {
      clearSelection()
    }
  }
}

function clearSelection() {
  selectedIds.value = []
  batchTargets.value = []
  treeRef.value?.setCheckedKeys([])
  currentNode.value = null
  rules.value = []
  conflictCount.value = 0
  lastEditTime.value = ''
}

function switchMode(m) {
  if (m === mode.value) return
  mode.value = m
}

function resetWizard() {
  pollToken.value++
  wizardVisible.value = false
  wizardStep.value = 0
  previewData.value = null
  runResult.value = null
  runStatus.value = ''
  propKeyword.value = ''
  selectedAttrIds.value = []
  draftMap.value = {}
  wizardContext.value = null
  propTableRef.value?.clearSelection()
}

watch(() => bizStore.bizId, () => { resetWizard(); clearSelection(); loadTree() })
watch(mode, () => { resetWizard(); clearSelection(); loadTree() })

onMounted(async () => {
  const legacyBiz = Number(route.params.bizId || route.query.biz)
  if (legacyBiz && bizStore.bizList.some((b) => b.bk_biz_id === legacyBiz)) bizStore.select(legacyBiz)
  const legacyMode = route.query.mode
  if (legacyMode === 'template' || legacyMode === 'module') mode.value = legacyMode
  await bizStore.ensureLoaded()
  if (bizStore.bizId) await loadTree()
})
</script>

<style scoped>
.host-apply-page { height: 100%; display: flex; flex-direction: column; background: #fff; }
.ha-body { flex: 1; display: flex; overflow: hidden; min-height: 0; }

.ha-sidebar {
  position: relative;
  width: 310px; flex: 0 0 310px;
  border-right: 1px solid #DCDEE5;
  background: #fafbfd;
  transition: width 0.18s, flex-basis 0.18s;
}
.ha-sidebar.is-collapse { width: 0; flex-basis: 0; border-right: none; }
.ha-sidebar.is-collapse .collapse-handle { left: 0; border-radius: 0 12px 12px 0; }
.ha-sidebar.is-collapse .collapse-handle .icon-angle-left { transform: rotate(180deg); }
.sidebar-inner { padding: 10px 10px 0; height: 100%; overflow-y: auto; display: flex; flex-direction: column; }

.mode-tabs {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0;
  border: 1px solid #c4c6cc; border-radius: 2px; overflow: hidden;
  margin-bottom: 12px;
}
.mode-btn {
  background: #fff; border: none; padding: 6px 8px;
  font-size: 13px; color: #63656e; cursor: pointer; line-height: 20px;
  border-right: 1px solid #c4c6cc;
}
.mode-btn:last-child { border-right: none; }
.mode-btn:hover { color: #3a84ff; }
.mode-btn.active { background: #3a84ff; color: #fff; }

.searchbar { display: flex; gap: 8px; margin-bottom: 8px; }
.searchbar .search-input { flex: 1; }
.batch-trigger {
  border: 1px solid #c4c6cc; border-radius: 2px; background: #fff;
  padding: 0 8px; height: 32px; line-height: 30px; cursor: pointer; font-size: 13px; color: #63656e;
  display: inline-flex; align-items: center; gap: 4px;
}
.batch-trigger:hover { border-color: #979ba5; color: #63656e; }
.batch-trigger:disabled { background: #fafbfd; color: #c4c6cc; cursor: not-allowed; }
.batch-trigger .count { color: #2dcb56; font-weight: bold; font-style: normal; }
.batch-trigger .caret { font-style: normal; font-size: 16px; }

.ha-tree {
  background: transparent; flex: 1; min-height: 200px;
}
:deep(.ha-tree .el-tree-node__content) { height: 32px; }
.tree-row { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; width: 100%; }
.node-icon { font-size: 14px; color: #3a84ff; width: 16px; text-align: center; }
.tree-row .lbl { flex: 1; }

.selected-summary {
  border-top: 1px solid #DCDEE5; padding: 8px 4px;
  background: #fafbfd; font-size: 12px; color: #63656e;
}
.selected-summary em { font-style: normal; font-weight: bold; color: #2dcb56; padding: 0 4px; }
.selected-summary .ss-actions { display: flex; gap: 4px; margin-top: 4px; }

.collapse-handle {
  position: absolute; left: 100%; top: 50%; transform: translateY(-50%);
  width: 16px; height: 100px; line-height: 100px; text-align: center;
  background: #DCDEE5; border: none; cursor: pointer; padding: 0;
  border-radius: 0 12px 12px 0; color: #fff; font-size: 20px;
}
.collapse-handle:hover { background: #699DF4; }
.collapse-handle .icon-angle-left { display: inline-block; transition: transform 0.18s; }
.collapse-handle .flipped { transform: rotate(180deg); }

.ha-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 0 20px 12px; min-width: 0; }
.ha-head { display: flex; align-items: center; gap: 8px; padding: 12px 0; border-bottom: 1px solid #F0F1F5; margin-bottom: 8px; }
.ha-title { margin: 0; font-size: 16px; color: #313238; font-weight: 500; }
.ha-head .last-edit { color: #979BA5; font-size: 12px; }
.ha-head .spacer { flex: 1; }
.conflict-num { font-style: normal; color: #ea3636; font-weight: bold; padding-left: 4px; }
.empty-tip { padding: 80px 0; text-align: center; }

.wizard-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.run-loading {
  text-align: center; padding: 32px 0;
  color: #63656E; font-size: 14px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.rotating { animation: rotate 1.2s linear infinite; }
@keyframes rotate { to { transform: rotate(360deg); } }
</style>
