<template>
  <div class="transfer-page">
    <!-- 已选主机 -->
    <div class="info-row">
      <span class="info-label">已选主机：</span>
      <div class="info-value">
        <b class="info-count">{{ resources.length }}</b> 台
      </div>
    </div>

    <!-- 转移到 -->
    <div v-if="type !== 'remove'" class="info-row">
      <span class="info-label">转移到：</span>
      <div class="info-value module-list">
        <el-tooltip
          v-for="id in targetModules"
          :key="id"
          :content="modulePath(id)"
          :disabled="!modulePath(id)"
          placement="top"
        >
          <span class="module-chip">
            <span v-if="type === 'idle'" class="module-icon">模</span>
            <span class="module-name">{{ moduleName(id) || id }}</span>
            <span v-if="type === 'idle'" class="module-mask" @click="openModuleSelector">点击修改</span>
          </span>
        </el-tooltip>
        <el-button
          v-if="type === 'idle' && !targetModules.length"
          size="small"
          @click="openModuleSelector"
        >选择空闲模块</el-button>
        <span v-if="type === 'business'" class="module-edit" @click="openModuleSelector">
          <el-icon><Edit /></el-icon>
        </span>
      </div>
    </div>
    <div v-else class="info-row">
      <span class="info-label">移除模块：</span>
      <div class="info-value">{{ moduleName(Number(route.query.sourceId)) || route.query.sourceId || '--' }}</div>
    </div>

    <!-- 变更确认 -->
    <div class="info-row change-row">
      <span class="info-label">变更确认：</span>
      <div class="info-value confirm-area" v-loading="loading">
        <el-empty v-if="!loading && !availableTabs.length" :description="previewPlans.length ? '无服务实例变更信息' : '无'" :image-size="90" />
        <template v-else>
          <ul class="tab-head">
            <li
              v-for="t in availableTabs"
              :key="t.id"
              :class="{ active: activeTab === t.id }"
              @click="handleTabClick(t.id)"
            >
              <span class="tab-label">{{ t.label }}</span>
              <span class="tab-count" :class="{ unconfirmed: !visitedTabs.has(t.id) }">{{ t.info.length > 999 ? '999+' : t.info.length }}</span>
            </li>
          </ul>

          <!-- 新增服务实例(老版 create-service-instance:逐实例进程编辑,提交 created/updated) -->
          <div v-if="activeTab === 'createServiceInstance'" class="svc-create-list">
            <div v-for="(entry, idx) in createEntries" :key="idx" class="svc-create-item" data-testid="transfer-create-entry">
              <div class="svc-create-head">
                <span class="svc-host">{{ hostIp(entry.bk_host_id) }}</span>
                <span class="svc-module">{{ modulePath(entry.bk_module_id) || entry.bk_module_id }}</span>
                <el-button v-if="!entry.service_template" link type="primary" size="small" @click="openCreateProcess(entry)">添加进程</el-button>
              </div>
              <el-table :data="entryRows(entry)" size="small" border max-height="240">
                <el-table-column label="进程名称" min-width="140">
                  <template #default="{ row }">{{ row.bk_func_name || '--' }}</template>
                </el-table-column>
                <el-table-column label="端口" width="110">
                  <template #default="{ row }">{{ row.port || '--' }}</template>
                </el-table-column>
                <el-table-column label="操作" width="90">
                  <template #default="{ row, $index }">
                    <el-button link type="primary" size="small" @click="openEditTransferProcess(entry, row, $index)">编辑</el-button>
                  </template>
                </el-table-column>
              </el-table>
              <div v-if="!entryRows(entry).length" class="svc-empty-tip">(未添加进程)</div>
            </div>
          </div>

          <!-- 删除服务实例 -->
          <el-table
            v-else-if="activeTab === 'deletedServiceInstance'"
            :data="tabs.deletedServiceInstance.info"
            size="small"
            border
            max-height="360"
          >
            <el-table-column label="操作" width="90">
              <template #default><span class="delete-flag">删除</span></template>
            </el-table-column>
            <el-table-column label="服务实例" prop="name" min-width="200" show-overflow-tooltip />
            <el-table-column label="所属模块" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">{{ modulePath(row.bk_module_id) || row.bk_module_id }}</template>
            </el-table-column>
            <el-table-column label="主机" min-width="140">
              <template #default="{ row }">{{ hostIp(row.bk_host_id) }}</template>
            </el-table-column>
          </el-table>

          <!-- 移动到空闲机的主机 -->
          <div v-else-if="activeTab === 'moveToIdleHost'" class="idle-hosts">
            <el-tag v-for="id in tabs.moveToIdleHost.info" :key="id" size="small" class="idle-tag">
              {{ hostIp(id) || `主机 ${id}` }}
            </el-tag>
          </div>

          <!-- 属性自动应用(老版 host-attrs-auto-apply:更新选项+冲突规则解决) -->
          <div v-else-if="activeTab === 'hostAttrsAutoApply'" class="apply-panel" data-testid="transfer-apply-panel">
            <div class="apply-option">
              <span class="apply-label" title="属性值与目标模块配置不一致的主机">是否更新主机属性</span>
              <el-radio-group v-model="applyChanged" @change="onApplyOptionChange">
                <el-radio :value="true">是将把转移的主机更新为目标模块配置</el-radio>
                <el-radio :value="false">否将保留主机原有配置</el-radio>
              </el-radio-group>
            </div>
            <div v-if="conflictSelects.length && applyChanged" class="apply-conflict">
              <span class="apply-label" title="目标模块配置了不同的自动应用属性，需要重新指定配置">冲突字段配置</span>
              <div v-for="c in conflictSelects" :key="c.bk_attribute_id" class="conflict-row">
                <span class="conflict-prop">{{ propName(c.bk_attribute_id) }}</span>
                <el-select v-model="c.selectedRuleId" size="small" style="width: 220px" @change="onConflictRuleChange(c)">
                  <el-option v-for="r in c.rules" :key="r.id" :label="modulePath(r.bk_module_id) || `模块 ${r.bk_module_id}`" :value="r.id" />
                </el-select>
              </div>
            </div>
            <el-table :data="applyRows" size="small" border max-height="360">
              <el-table-column label="内网IP" min-width="140">
                <template #default="{ row }">{{ hostIp(row.bk_host_id) }}</template>
              </el-table-column>
              <el-table-column label="当前值" min-width="240">
                <template #default="{ row }">
                  <template v-if="row.conflicts?.length">
                    <el-tag v-for="c in row.conflicts" :key="c.bk_attribute_id" type="danger" size="small" class="field-tag">
                      {{ propName(c.bk_attribute_id) }}: {{ displayValue(c.bk_property_value) }}
                    </el-tag>
                  </template>
                  <span v-else>--</span>
                </template>
              </el-table-column>
              <el-table-column label="目标值" min-width="260">
                <template #default="{ row }">
                  <template v-if="applyChanged && row.update_fields?.length">
                    <el-tag v-for="f in row.update_fields" :key="f.bk_attribute_id" size="small" class="field-tag">
                      {{ propName(f.bk_attribute_id) }} → {{ displayValue(f.bk_property_value) }}
                    </el-tag>
                  </template>
                  <template v-else-if="!applyChanged && row.conflicts?.length">
                    <el-tag v-for="c in row.conflicts" :key="c.bk_attribute_id" size="small" class="field-tag">
                      {{ propName(c.bk_attribute_id) }} → {{ displayValue(c.bk_property_value) }}
                    </el-tag>
                  </template>
                  <span v-else>--</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </template>
      </div>
    </div>

    <div class="transfer-footer">
      <el-button type="primary" :loading="confirming" :disabled="loading" @click="handleConfirm">{{ confirmText }}</el-button>
      <el-button @click="router.back()">取消</el-button>
    </div>

    <!-- 进程编辑(新增服务实例:无模板加进程/模板进程调整) -->
    <ProcessFormDialog
      :visible="processFormVisible"
      :title="processEditing ? '编辑进程' : '添加进程'"
      mode="instance"
      :form="processForm"
      :saving="false"
      @update:visible="processFormVisible = $event"
      @save="saveTransferProcess"
    />

    <!-- 模块选择(空闲模块/业务模块) -->
    <el-dialog v-model="moduleSelectorVisible" :title="moduleSelectorTitle" width="560px">
      <el-input v-model="moduleKeyword" placeholder="搜索模块名称" clearable size="small" style="margin-bottom: 8px" :prefix-icon="'Search'" />
      <el-tree
        ref="moduleTreeRef"
        :data="moduleTree"
        node-key="key"
        show-checkbox
        default-expand-all
        highlight-current
        :filter-node-method="filterModuleNode"
        :props="{ label: 'label', children: 'children' }"
        style="max-height: 380px; overflow: auto"
      />
      <template #footer>
        <el-button @click="moduleSelectorVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmModuleSelector">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
// 主机转移页:对齐老版 host-operation(已选主机/转移到/变更确认 tabs/预览+执行)
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  listBizHosts, getTopoPath, getBizTopoTree, getBizInternalTopo,
  transferPreview, transferExecute, searchModelAttributes
} from '../../api/cmdb'
import { useBizStore } from '../../stores/biz'
import ProcessFormDialog from '../../components/ProcessFormDialog.vue'

const route = useRoute()
const router = useRouter()
const bizStore = useBizStore()

// 老版契约:按 URL 业务操作(路由 :bizId 优先),避免 URL 业务与实际操作业务不一致
const transferBizId = computed(() => Number(route.params.bizId) || bizStore.bizId)

const type = ref(route.params.type)
const resources = ref([])
const targetModules = ref([])
const loading = ref(false)
const confirming = ref(false)
const hostMap = ref({})
const moduleMap = ref({})
const attrMap = ref({})
const idleModuleId = ref(null)
const previewPlans = ref([])

const activeTab = ref('')
// 老版"已确认"语义:tab 被访问过一次即取消红标(unconfirmed)
const visitedTabs = ref(new Set())
const tabs = ref({
  createServiceInstance: { label: '新增服务实例', info: [] },
  deletedServiceInstance: { label: '删除服务实例', info: [] },
  moveToIdleHost: { label: '移动到空闲机的主机', info: [] },
  hostAttrsAutoApply: { label: '属性自动应用', info: [] }
})

const TABS_BY_TYPE = {
  remove: ['deletedServiceInstance', 'moveToIdleHost', 'hostAttrsAutoApply'],
  idle: ['deletedServiceInstance', 'hostAttrsAutoApply'],
  business: ['createServiceInstance', 'deletedServiceInstance', 'hostAttrsAutoApply'],
  increment: ['createServiceInstance', 'hostAttrsAutoApply'],
  add: ['createServiceInstance', 'hostAttrsAutoApply']
}

const moduleSelectorVisible = ref(false)
const moduleSelectorTitle = ref('转移主机到业务模块')
const moduleKeyword = ref('')
const moduleTree = ref([])
const moduleTreeRef = ref(null)

const confirmText = computed(() => ({
  remove: '确认移除', idle: '确认转移', business: '确认转移', increment: '确认追加', add: '确认添加'
}[type.value] || '确认转移'))

const availableTabs = computed(() =>
  (TABS_BY_TYPE[type.value] || []).map((id) => ({ id, label: tabs.value[id].label, info: tabs.value[id].info }))
    .filter((t) => t.info.length > 0)
)

watch(availableTabs, (list) => {
  if (!list.some((t) => t.id === activeTab.value)) activeTab.value = list[0]?.id || ''
}, { immediate: true })

watch(activeTab, (id) => {
  if (id) visitedTabs.value.add(id)
})

function handleTabClick(id) {
  visitedTabs.value.add(id)
  activeTab.value = id
}

// ---------- 新增服务实例(老版 create-service-instance 契约) ----------
// entry: {bk_host_id, bk_module_id, service_template, templateProcesses, edited: Map<index,{process_template_id,process_info}>, added: [{process_info}]}
const createEntries = ref([])
const processFormVisible = ref(false)
const processEditing = ref(null)
const processForm = ref({})
let processTarget = null

function flattenTemplateProperty(property = {}) {
  const out = {}
  for (const [key, tpl] of Object.entries(property)) {
    if (key === 'bind_info') {
      const first = (tpl.value || [])[0] || {}
      out.port = first.port?.value ?? ''
      out.bk_bind_ip = typeof first.ip?.value === 'string' ? first.ip.value : '127.0.0.1'
    } else {
      out[key] = typeof tpl === 'object' && tpl !== null && 'value' in tpl ? tpl.value : tpl
    }
  }
  return out
}

function entryRows(entry) {
  if (entry.service_template) {
    return entry.templateProcesses.map((tpl, index) => {
      const edited = entry.edited.get(index)
      if (edited) return { ...edited.process_info, __process_template_id: edited.process_template_id }
      return flattenTemplateProperty(tpl.property)
    })
  }
  return entry.added.map((item) => item.process_info)
}

function openCreateProcess(entry) {
  processTarget = { entry, kind: 'added' }
  processEditing.value = null
  processForm.value = { bk_func_name: '', bk_process_name: '', bk_bind_ip: '127.0.0.1', port: '', user: 'root', work_path: '/tmp', start_cmd: '', stop_cmd: '', description: '' }
  processFormVisible.value = true
}

function openEditTransferProcess(entry, row, index) {
  processTarget = { entry, kind: entry.service_template ? 'edited' : 'added', index }
  processEditing.value = row
  // 编辑已改过的模板进程时,行对象已带 process_info(展示层解包)
  processForm.value = { ...(row.process_info || row) }
  processFormVisible.value = true
}

function saveTransferProcess(form) {
  if (!processTarget) return
  if (!form.bk_func_name) { ElMessage.warning('请输入进程名称'); return }
  const info = { ...form }
  if (info.port) info.port = String(info.port)
  const { entry, kind, index } = processTarget
  if (kind === 'added') {
    if (index === undefined || index === null) entry.added.push({ process_info: info })
    else entry.added[index] = { process_info: info }
  } else {
    const tpl = entry.templateProcesses[index]
    entry.edited.set(index, { process_template_id: tpl?.process_template_id, process_info: info })
  }
  processFormVisible.value = false
}

// 老版 getServiceInstanceOptions:模板实例 created 不带 processes(空进程不能作为添加项),编辑过的进 updated;无模板 added 进 created
function getServiceInstanceOptions() {
  const created = []
  const updated = []
  for (const entry of createEntries.value) {
    const changed = [...entry.edited.values()]
    if (entry.service_template) {
      if (entry.added.length) created.push({ bk_module_id: entry.bk_module_id, bk_host_id: entry.bk_host_id })
      if (changed.length) updated.push({ bk_module_id: entry.bk_module_id, bk_host_id: entry.bk_host_id, processes: changed })
    } else if (entry.added.length) {
      created.push({
        bk_module_id: entry.bk_module_id,
        bk_host_id: entry.bk_host_id,
        processes: entry.added.map((item) => ({ process_info: item.process_info }))
      })
    }
  }
  return { created, updated }
}

// ---------- 属性自动应用(老版 host-attrs-auto-apply 契约) ----------
const applyChanged = ref(true)
// conflictSelects: 每个冲突字段一条规则选择(默认第一条),final_rules 随选择同步
const conflictSelects = ref([])
const finalRules = ref([])

function seedConflictResolvers() {
  conflictSelects.value = []
  finalRules.value = []
  const byAttr = new Map()
  for (const plan of tabs.value.hostAttrsAutoApply.info || []) {
    for (const conflict of plan.conflicts || []) {
      if (!byAttr.has(conflict.bk_attribute_id)) byAttr.set(conflict.bk_attribute_id, [])
      const rules = conflict.host_apply_rules || []
      const list = byAttr.get(conflict.bk_attribute_id)
      for (const rule of rules) {
        if (!list.some((item) => item.id === rule.id)) list.push(rule)
      }
    }
  }
  for (const [bkAttributeId, rules] of byAttr.entries()) {
    if (!rules.length) continue
    const selected = rules[0]
    conflictSelects.value.push({ bk_attribute_id: bkAttributeId, rules, selectedRuleId: selected.id })
    finalRules.value.push({ id: selected.id, bk_attribute_id: bkAttributeId, bk_property_value: selected.bk_property_value })
  }
}

const applyRows = computed(() => (tabs.value.hostAttrsAutoApply.info || []).filter((item) => (item.unresolved_conflict_count || 0) > 0))

function displayValue(value) {
  if (value === undefined || value === null || value === '') return '--'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function onApplyOptionChange() {
  // 老版语义:否=保留主机当前值(目标值回落为 conflicts 值);final_rules 仅在 changed 时提交
  if (!applyChanged.value) return
  seedConflictResolvers()
}

function onConflictRuleChange(select) {
  const rule = select.rules.find((item) => item.id === select.selectedRuleId) || select.rules[0]
  const target = finalRules.value.find((item) => item.bk_attribute_id === select.bk_attribute_id)
  if (target) {
    target.id = rule.id
    target.bk_property_value = rule.bk_property_value
  }
  for (const plan of tabs.value.hostAttrsAutoApply.info || []) {
    const field = (plan.update_fields || []).find((item) => item.bk_attribute_id === select.bk_attribute_id)
    if (field) field.bk_property_value = rule.bk_property_value
  }
}

function getHostApplyConflictResolvers() {
  if (!applyChanged.value) return { changed: false }
  return {
    changed: true,
    final_rules: finalRules.value.map(({ id, bk_attribute_id, bk_property_value }) => ({ id, bk_attribute_id, bk_property_value }))
  }
}

watch(moduleKeyword, (kw) => moduleTreeRef.value?.filter(kw))

function hostIp(id) {
  const h = hostMap.value[id]
  return h?.bk_host_innerip || (id ? `#${id}` : '--')
}

function moduleName(id) {
  const info = moduleMap.value[id] || []
  const hit = info.find((n) => n.bk_obj_id === 'module' && Number(n.bk_inst_id) === Number(id))
  return hit?.bk_inst_name || ''
}

function modulePath(id) {
  const info = moduleMap.value[id] || []
  return info.map((n) => n.bk_inst_name).reverse().join(' / ')
}

function propName(id) {
  const hit = attrMap.value.find((a) => String(a.id) === String(id))
  return hit ? `${hit.bk_property_name}` : `字段 ${id}`
}

function resolveData() {
  type.value = route.params.type
  resources.value = String(route.query.resources || '').split(',').filter(Boolean).map(Number)
  targetModules.value = String(route.query.targetModules || '').split(',').filter(Boolean).map(Number)

  const isTransfer = ['idle', 'business'].includes(type.value)
  const params = { bk_host_ids: resources.value, is_remove_from_all: isTransfer }
  if (type.value === 'idle') {
    params.default_internal_module = targetModules.value[0]
  } else if (type.value === 'remove') {
    params.remove_from_modules = [Number(route.query.sourceId)]
  } else if (targetModules.value.length) {
    params.add_to_modules = targetModules.value
  }
  return params
}

async function loadHosts() {
  if (!resources.value.length) return
  try {
    const data = await listBizHosts(transferBizId.value, { start: 0, limit: 500 }, {
      condition: 'AND',
      rules: [{ field: 'bk_host_id', operator: '$in', value: resources.value }]
    })
    const map = {}
    for (const h of data?.info || []) map[h.bk_host_id] = h
    hostMap.value = map
  } catch { /* 主机名/IP 展示失败不阻断流程 */ }
}

async function loadModulePaths(moduleIds) {
  const unique = [...new Set(moduleIds.filter(Boolean).map(Number))]
  if (!unique.length) return
  try {
    const result = await getTopoPath(transferBizId.value, {
      topo_nodes: unique.map((id) => ({ bk_obj_id: 'module', bk_inst_id: id }))
    })
    const map = { ...moduleMap.value }
    for (const node of result?.nodes || []) {
      map[node.topo_node.bk_inst_id] = node.topo_path
    }
    moduleMap.value = map
  } catch { /* 路径展示失败不阻断流程 */ }
}

async function loadAttrList() {
  if (attrMap.value.length) return
  try {
    const list = await searchModelAttributes('host')
    attrMap.value = list || []
  } catch { attrMap.value = [] }
}

async function loadIdleModule() {
  if (type.value !== 'remove') return
  try {
    const topo = await getBizInternalTopo(transferBizId.value)
    const idle = (topo?.module || []).find((m) => Number(m.default) === 1)
    idleModuleId.value = idle?.bk_module_id || null
  } catch { idleModuleId.value = null }
}

async function loadPreview() {
  const params = resolveData()
  loading.value = true
  try {
    const data = await transferPreview(transferBizId.value, params)
    previewPlans.value = data || []

    // 变更确认 tabs(老版 setXxxServiceInstance 语义)
    const entries = []
    const deletedInfo = []
    const applyInfo = []
    for (const item of previewPlans.value) {
      for (const m of item.to_add_to_modules || []) {
        entries.push({
          bk_host_id: item.bk_host_id,
          bk_module_id: m.bk_module_id,
          service_template: m.service_template || null,
          templateProcesses: m.service_template?.process_templates || [],
          edited: new Map(),
          added: []
        })
      }
      for (const m of item.to_remove_from_modules || []) {
        deletedInfo.push(...(m.service_instances || []).map((s) => ({ ...s, bk_module_id: m.bk_module_id })))
      }
      const plan = item.host_apply_plan
      if (plan && ((plan.conflicts?.length) || (plan.update_fields?.length))) applyInfo.push(plan)
    }
    createEntries.value = entries
    tabs.value.createServiceInstance.info = entries
    tabs.value.deletedServiceInstance.info = deletedInfo
    tabs.value.hostAttrsAutoApply.info = applyInfo
    visitedTabs.value = new Set()
    seedConflictResolvers()

    // 模块路径:目标 + 涉及模块
    const moduleIds = [...targetModules.value]
    for (const item of previewPlans.value) {
      moduleIds.push(...(item.to_add_to_modules || []).map((m) => m.bk_module_id))
      moduleIds.push(...(item.to_remove_from_modules || []).map((m) => m.bk_module_id))
    }
    if (type.value === 'remove') moduleIds.push(Number(route.query.sourceId))
    loadModulePaths(moduleIds)
    loadIdleModule().then(() => {
      // 移动到空闲机的主机(仅 remove 类型):final_modules 落在空闲机的
      if (type.value === 'remove' && idleModuleId.value) {
        tabs.value.moveToIdleHost.info = previewPlans.value
          .filter((item) => (item.final_modules || [])[0] === idleModuleId.value)
          .map((item) => item.bk_host_id)
      }
    })
    loadAttrList()
  } catch (e) {
    ElMessage.error('转移预览失败: ' + (e?.message || '后端异常'))
  } finally {
    loading.value = false
  }
}

async function openModuleSelector() {
  moduleSelectorTitle.value = type.value === 'idle' ? '转移主机到空闲模块' : '转移主机到业务模块'
  moduleSelectorVisible.value = true
  if (!moduleTree.value.length) {
    const [mainTree, idleTopo] = await Promise.allSettled([
      getBizTopoTree(transferBizId.value),
      getBizInternalTopo(transferBizId.value)
    ])
    const tree = []
    if (mainTree.status === 'fulfilled' && Array.isArray(mainTree.value)) {
      for (const biz of mainTree.value) {
        for (const s of biz.child || []) {
          tree.push({
            key: `set-${s.bk_inst_id}`,
            label: s.bk_inst_name,
            children: (s.child || []).map((m) => ({
              key: `module-${m.bk_inst_id}`,
              label: m.bk_inst_name,
              isModule: true,
              moduleId: m.bk_inst_id,
              children: []
            }))
          })
        }
      }
    }
    if (idleTopo.status === 'fulfilled' && idleTopo.value?.bk_set_id) {
      tree.push({
        key: `set-${idleTopo.value.bk_set_id}`,
        label: idleTopo.value.bk_set_name,
        children: (idleTopo.value.module || []).map((m) => ({
          key: `module-${m.bk_module_id}`,
          label: m.bk_module_name,
          isModule: true,
          moduleId: m.bk_module_id,
          children: []
        }))
      })
    }
    moduleTree.value = tree
  }
  nextTick(() => {
    moduleTreeRef.value?.setCheckedKeys(targetModules.value.map((id) => `module-${id}`))
  })
}

function filterModuleNode(value, data) {
  const kw = (value || '').trim()
  if (!kw) return true
  if (data.label.includes(kw)) return true
  return (data.children || []).some((c) => filterModuleNode(value, c))
}

function confirmModuleSelector() {
  const checked = moduleTreeRef.value?.getCheckedKeys(true) || []
  const moduleIds = checked.filter((k) => String(k).startsWith('module-')).map((k) => Number(String(k).replace('module-', '')))
  if (!moduleIds.length) { ElMessage.warning('请选择目标模块'); return }
  moduleSelectorVisible.value = false
  router.replace({
    params: { ...route.params, type: type.value },
    query: { ...route.query, targetModules: moduleIds.join(',') }
  })
}

async function handleConfirm() {
  const params = resolveData()
  confirming.value = true
  try {
    // 老版契约:tab 有数据时经 ref 收集 options(实例 created/updated + 冲突规则 final_rules)
    if (tabs.value.createServiceInstance.info.length) {
      params.options = { ...(params.options || {}), service_instance_options: getServiceInstanceOptions() }
    }
    if (tabs.value.hostAttrsAutoApply.info.length) {
      params.options = { ...(params.options || {}), host_apply_trans_rule: getHostApplyConflictResolvers() }
    }
    await transferExecute(transferBizId.value, params)
    ElMessage.success(({ remove: '移除成功', add: '添加成功' })[type.value] || '转移成功')
    router.back()
  } catch (e) {
    ElMessage.error('转移失败: ' + (e?.message || '后端异常'))
  } finally {
    confirming.value = false
  }
}

watch(() => route.fullPath, () => {
  if (route.name !== 'HostTransfer') return
  const sameResources = String(route.query.resources || '') === resources.value.join(',')
  const sameTargets = String(route.query.targetModules || '') === targetModules.value.join(',')
  const sameType = route.params.type === type.value
  if (sameResources && sameTargets && sameType) return
  loadPreview()
  loadHosts()
})

onMounted(() => {
  loadPreview()
  loadHosts()
})
</script>

<style scoped>
.transfer-page { padding: 20px 24px; background: #fff; min-height: 100%; overflow-y: auto; }
.info-row { display: flex; margin-bottom: 18px; }
.info-label { width: 110px; flex: 0 0 110px; font-size: 14px; font-weight: 700; color: #313238; line-height: 32px; }
.info-value { font-size: 14px; color: #313238; line-height: 32px; }
.info-count { color: #3a84ff; }
.module-list { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.module-chip {
  position: relative; display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 10px; border: 1px solid #c4c6cc; border-radius: 2px;
  background: #f0f1f5; font-size: 13px; cursor: default;
}
.module-icon { width: 18px; height: 18px; line-height: 18px; text-align: center; background: #3a84ff; color: #fff; border-radius: 2px; font-size: 12px; }
.module-mask {
  position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.5); color: #fff; font-size: 12px; cursor: pointer;
}
.module-chip:hover .module-mask { display: inline-flex; }
.module-edit { color: #3a84ff; cursor: pointer; display: inline-flex; align-items: center; }
.change-row .confirm-area { min-width: 0; flex: 1; max-width: 1100px; }
.tab-head { list-style: none; margin: 0 0 10px; padding: 0; display: flex; align-items: center; }
.tab-head li {
  display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px;
  font-size: 13px; color: #63656e; cursor: pointer; border: 1px solid #dcdee5; border-right: none;
}
.tab-head li:last-child { border-right: 1px solid #dcdee5; }
.tab-head li.active { color: #3a84ff; border-color: #3a84ff; }
.tab-head li.active + li { border-left: none; }
.tab-count { min-width: 20px; height: 18px; line-height: 18px; text-align: center; background: #a2b1c6; border-radius: 9px; color: #fff; font-size: 12px; padding: 0 4px; }
.tab-head li.active .tab-count { background: #3a84ff; }
.tab-head .tab-count.unconfirmed { background: #ff5656; }
.svc-create-list { display: flex; flex-direction: column; gap: 12px; max-height: 420px; overflow-y: auto; }
.svc-create-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; font-size: 13px; color: #313238; }
.svc-host { font-weight: 600; }
.svc-module { color: #979ba5; }
.svc-empty-tip { font-size: 12px; color: #979ba5; padding: 4px 0; }
.delete-flag { color: #ff5656; font-weight: 600; }
.apply-option, .apply-conflict { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
.apply-label { flex: 0 0 auto; line-height: 30px; font-size: 13px; color: #63656e; }
.conflict-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.conflict-prop { min-width: 90px; font-size: 13px; color: #313238; }
.idle-hosts { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 0; }
.idle-tag { font-size: 12px; }
.field-tag { margin: 2px 6px 2px 0; }
.transfer-footer { margin-top: 26px; padding-left: 110px; }
</style>
