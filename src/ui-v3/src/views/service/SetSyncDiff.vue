<template>
  <!-- 旧版 set-sync/sync-index.vue + set-instance.vue 复刻:集群模板同步差异确认整页 -->
  <div class="set-sync-page" v-loading="pageLoading">
    <div class="sync-head">
      <p class="title">
        <!-- 旧版 i18n:单个「请确认实例更改信息：」/多个「请确认以下{count}个实例更改信息：」 -->
        <template v-if="diffList.length === 1">请确认实例更改信息：</template>
        <template v-else>请确认以下 <b>{{ diffList.length }}</b> 个实例更改信息：</template>
      </p>
      <div class="type-legend">
        <span class="legend-item"><i class="dot changed" />变更</span>
        <span class="legend-item"><i class="dot added" />新增</span>
        <span class="legend-item"><i class="dot removed" />删除</span>
      </div>
    </div>

      <el-alert v-if="initError" class="init-error" type="error" :closable="false" show-icon>
        {{ initError }} <el-button link type="primary" @click="initialize">重试</el-button>
      </el-alert>
      <div class="sync-main">
      <div v-for="diff in diffList" :key="diff.setId" class="set-container">
        <!-- 旧版契约:单个同步不渲染折叠头(无展开/移除操作) -->
        <div v-if="diffList.length > 1" class="set-head" @click="toggleSet(diff)">
          <i :class="['bk-cmdb-icon icon-cc-triangle set-arrow', { collapsed: !setGroup[diff.setId]?.expanded }]" />
          <span class="topopath">{{ setGroup[diff.setId]?.topoPath || `Set #${diff.setId}` }}</span>
          <span v-if="diff.denySync" class="deny-sync"><i class="deny-icon">!</i>不可同步</span>
          <el-tooltip content="本次不同步" placement="top">
            <i class="remove-btn" @click.stop="removeSet(diff)">×</i>
          </el-tooltip>
        </div>
        <div v-show="diffList.length === 1 || setGroup[diff.setId]?.expanded" class="set-body" v-loading="setGroup[diff.setId]?.loading">
          <!-- 属性变更 -->
          <div v-if="setGroup[diff.setId]?.propertyDiff?.length" class="diff-section">
            <div class="section-title">属性变更</div>
            <div class="diff-table">
              <div class="table-head">
                <div class="col">属性同步前</div>
                <div class="col">属性同步后</div>
              </div>
              <div class="table-body">
                <div class="col">
                  <div v-for="attr in setGroup[diff.setId].propertyDiff" :key="`b-${attr.id}`" class="diff-item">
                    <span class="property-name">{{ attr.property?.bk_property_name || attr.id }}：</span>
                    <span class="property-value">{{ displayValue(attr.inst_value, attr.property) }}</span>
                  </div>
                </div>
                <div class="col">
                  <div v-for="attr in setGroup[diff.setId].propertyDiff" :key="`a-${attr.id}`" class="diff-item">
                    <span class="property-name">{{ attr.property?.bk_property_name || attr.id }}：</span>
                    <span :class="['property-value', { changed: isPropChanged(attr) }]">{{ displayValue(attr.template_value, attr.property) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- 拓扑结构变更 -->
          <div v-if="setGroup[diff.setId]?.moduleDiff?.module_diffs?.length" class="diff-section">
            <div class="section-title">拓扑结构变更</div>
            <div class="diff-table">
              <div class="table-head">
                <div class="col">拓扑同步前</div>
                <div class="col">拓扑同步后</div>
              </div>
              <div class="table-body">
                <div class="col">
                  <div class="node-root">
                    <i class="node-icon">集</i>
                    <span class="node-name">{{ setGroup[diff.setId]?.moduleDiff?.set_detail?.bk_set_name }}</span>
                  </div>
                  <div v-for="node in beforeModules(diff.setId)" :key="`b-${node.bk_module_id}`" class="node-child">
                    <i class="node-icon">模</i>
                    <span class="node-name">{{ node.bk_module_name }}</span>
                  </div>
                </div>
                <div class="col">
                  <div class="node-root">
                    <i class="node-icon">集</i>
                    <span class="node-name">{{ setGroup[diff.setId]?.moduleDiff?.set_detail?.bk_set_name }}</span>
                  </div>
                  <div
                    v-for="node in setGroup[diff.setId]?.moduleDiff?.module_diffs || []"
                    :key="`a-${node.bk_module_id}`"
                    :class="['node-child', node.diff_type]"
                  >
                    <i class="node-icon">模</i>
                    <span class="node-name">{{ node.bk_module_name }}</span>
                    <span class="diff-tag" :class="node.diff_type">{{ diffLabel(node.diff_type) }}</span>
                    <div v-if="node.diff_type === 'remove' && hasHost(node.bk_module_id, diff.setId)" class="remove-tip">
                      <!-- 旧版 i18n「存在主机不可同步提示」:不可同步，模块存在主机，{跳转查看} 可点 -->
                      不可同步，模块存在主机，<a class="view-btn" @click.stop="goModuleTopo(node.bk_module_id)">跳转查看</a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="setGroup[diff.setId]?.error" class="diff-error">
            {{ setGroup[diff.setId].error }} <el-button link type="primary" @click.stop="loadDiff(diff.setId)">重试</el-button>
          </div>
          <div v-else-if="!setGroup[diff.setId]?.loading && !setGroup[diff.setId]?.propertyDiff?.length && !setGroup[diff.setId]?.moduleDiff?.module_diffs?.length" class="no-diff">
            暂无变更，集群与模板保持一致
          </div>
        </div>
      </div>
    </div>

    <div class="sync-footer">
      <el-alert v-if="syncError" class="sync-submit-error" type="error" :closable="false" show-icon>{{ syncError }}</el-alert>
      <el-tooltip
        :content="diffList.length === 1 ? '不可同步' : '请先删除不可同步的实例'"
        :disabled="!denySync"
        placement="top"
      >
        <span>
          <el-button type="primary" :loading="syncing" :disabled="denySync || !diffList.length" @click="confirmSync">确认同步</el-button>
        </span>
      </el-tooltip>
      <el-button @click="goBack">取消</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  diffSetTemplateWithInstances, getSetTemplateRemovedModuleStatus,
  syncSetTemplateToInstances, getTopoPath, searchModelAttributes
} from '../../api/cmdb'

const route = useRoute()
const router = useRouter()

const bizId = computed(() => Number(route.params.bizId))
const setTemplateId = computed(() => Number(route.params.setTemplateId))

// 旧版契约:同步集合经 store/sessionStorage setSyncIdMap 传递(key `${biz}_${templateId}`);
// ?sets= 保留作深链兼容
const setIds = computed(() => {
  const fromQuery = String(route.query.sets || '').split(',').map(Number).filter(Boolean)
  if (fromQuery.length) return fromQuery
  try {
    const map = JSON.parse(sessionStorage.getItem('setSyncIdMap') || '{}')
    return (map[`${bizId.value}_${setTemplateId.value}`] || []).map(Number).filter(Boolean)
  } catch {
    return []
  }
})

const pageLoading = ref(false)
const syncing = ref(false)
const initError = ref('')
const syncError = ref('')
const setProperties = ref([])
const setGroup = reactive({})
const diffList = ref([])

const denySync = computed(() => diffList.value.some((item) => item.denySync))

function isPropChanged(attr) {
  return JSON.stringify(attr.inst_value) !== JSON.stringify(attr.template_value)
}
function displayValue(value, property) {
  if (value === null || value === undefined || value === '') return '--'
  if (property?.bk_property_type === 'enum' && typeof value === 'string') return value
  return String(value)
}
function diffLabel(type) {
  return { add: '新增', remove: '删除', changed: '变更' }[type] || ''
}
function beforeModules(setId) {
  return (setGroup[setId]?.moduleDiff?.module_diffs || []).filter((m) => m.diff_type !== 'add')
}
function hasHost(moduleId, setId) {
  return Boolean(setGroup[setId]?.moduleHostCount?.[moduleId])
}

function toggleSet(diff) {
  const group = setGroup[diff.setId]
  group.expanded = !group.expanded
  if (group.expanded && !group.loaded && !group.loading) loadDiff(diff.setId)
}

function removeSet(diff) {
  diffList.value = diffList.value.filter((item) => item.setId !== diff.setId)
}

// 旧版 module-difference 跳转查看:跳业务拓扑定位到模块节点
function goModuleTopo(moduleId) {
  router.push(`/business/${bizId.value}/index?node=module-${moduleId}`)
}

async function loadDiff(setId) {
  const group = setGroup[setId]
  group.loading = true
  group.error = ''
  group.loaded = false
  try {
    const data = await diffSetTemplateWithInstances(bizId.value, setTemplateId.value, { bk_set_id: setId })
    group.moduleHostCount = data?.module_host_count || {}
    const { attributes, ...moduleDiff } = data?.difference || {}
    group.propertyDiff = (attributes || []).map((attr) => ({ property: setProperties.value.find((prop) => prop.id === attr.id), ...attr }))
    group.moduleDiff = moduleDiff
    group.loaded = true
  } catch (e) {
    group.error = e?.message || '差异加载失败'
    group.propertyDiff = []
    group.moduleDiff = {}
  } finally { group.loading = false }
}

async function confirmSync() {
  syncing.value = true
  syncError.value = ''
  try {
    await syncSetTemplateToInstances(bizId.value, setTemplateId.value, { bk_set_ids: diffList.value.map((item) => item.setId) })
    ElMessage.success('提交同步成功，请等待执行完成')
    router.push(`/business/${bizId.value}/set/template?action=details&templateId=${setTemplateId.value}&tab=instance`)
  } catch (e) {
    syncError.value = e?.message || '同步提交失败'
  } finally { syncing.value = false }
}

function goBack() {
  // 旧版 handleGoback:带 moduleId 时回业务拓扑对应集群节点
  const moduleId = Number(route.params.moduleId)
  if (moduleId) {
    router.push(`/business/${bizId.value}/index?node=set-${moduleId}`)
    return
  }
  router.push(`/business/${bizId.value}/set/template?action=details&templateId=${setTemplateId.value}&tab=instance`)
}

async function initialize() {
  initError.value = ''
  pageLoading.value = true
  try {
    const props = await searchModelAttributes('set')
    const removedStatus = await getSetTemplateRemovedModuleStatus(bizId.value, setTemplateId.value, { bk_set_ids: setIds.value })
    const topo = await getTopoPath(bizId.value, { topo_nodes: setIds.value.map((id) => ({ bk_obj_id: 'set', bk_inst_id: id })) }).catch(() => ({ nodes: [] }))
    setProperties.value = props || []
    const removedMap = new Map((Array.isArray(removedStatus) ? removedStatus : removedStatus?.info || []).map((item) => [item.id, item.has_host]))
    diffList.value = setIds.value.map((setId) => ({ setId, denySync: Boolean(removedMap.get(setId)) })).sort((a, b) => Number(b.denySync) - Number(a.denySync))
    const pathMap = {}
    for (const node of topo?.nodes || []) pathMap[node.topo_node?.bk_inst_id] = (node.topo_path || []).slice().reverse().map((p) => p.bk_inst_name).join(' / ')
    for (const diff of diffList.value) setGroup[diff.setId] = { topoPath: pathMap[diff.setId] || `Set #${diff.setId}`, propertyDiff: [], moduleDiff: {}, moduleHostCount: {}, expanded: false, loaded: false, loading: false, error: '' }
    if (diffList.value.length) { const first = diffList.value[0]; setGroup[first.setId].expanded = true; loadDiff(first.setId) }
  } catch (e) {
    diffList.value = []
    initError.value = e?.message || '同步差异初始化失败'
  } finally { pageLoading.value = false }
}

onMounted(async () => {
  if (!setIds.value.length) { router.replace(`/business/${bizId.value}/set/template?action=sync&templateId=${setTemplateId.value}`); return }
  await initialize()
})
</script>

<style scoped>
.set-sync-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #F5F7FA;
  overflow-y: auto;
}
.sync-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 24px 24px 0;
}
.title {
  font-size: 14px;
  color: #313238;
}
.type-legend {
  display: flex;
  gap: 24px;
  font-size: 12px;
  color: #63656E;
}
.legend-item .dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
  background-color: #2DCB56;
}
.legend-item .dot.changed { background-color: #FF9C01; }
.legend-item .dot.removed { background-color: #FF5656; }
.sync-main {
  margin: 16px 24px 24px;
}
.set-container {
  background: #fff;
  border-radius: 2px;
  padding: 0 24px;
  margin-bottom: 16px;
}
.set-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  cursor: pointer;
  user-select: none;
}
.set-arrow { font-size: 12px; color: #63656E; transition: transform .2s; }
.set-arrow.collapsed { transform: rotate(-90deg); }
.topopath { font-size: 14px; color: #313238; }
.deny-sync {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #FF5656;
  font-size: 12px;
}
.deny-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 12px;
  font-style: normal;
  color: #fff;
  background: #FF5656;
  border-radius: 50%;
}
.remove-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: auto;
  font-size: 18px;
  font-style: normal;
  color: #979BA5;
  cursor: pointer;
}
.remove-btn:hover { color: #3A84FF; }
.set-body { padding: 4px 0 24px 20px; }
.diff-section { margin-bottom: 20px; }
.section-title { font-size: 14px; font-weight: bold; color: #313238; margin-bottom: 12px; }
.diff-table {
  border: 1px solid #DCDEE5;
  border-radius: 2px;
}
.table-head {
  display: flex;
  background: #F0F1F5;
  font-size: 12px;
  color: #63656E;
}
.table-head .col { flex: 1; padding: 8px 16px; font-weight: bold; }
.table-body { display: flex; }
.table-body .col { flex: 1; padding: 8px 16px; }
.table-body .col + .col { border-left: 1px solid #DCDEE5; }
.diff-item {
  display: flex;
  height: 28px;
  line-height: 28px;
  font-size: 12px;
  color: #63656E;
}
.property-name { flex: 0 0 110px; text-align: right; }
.property-value.changed { color: #FF9C01; }
.node-root, .node-child {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  line-height: 28px;
  font-size: 12px;
  color: #63656E;
}
.node-child.remove .node-name { text-decoration: line-through; color: #FF5656; }
.node-child.add .node-name { color: #2DCB56; }
.node-child.changed .node-name { color: #FF9C01; }
.diff-tag { font-size: 12px; }
.diff-tag.add { color: #2DCB56; }
.diff-tag.remove { color: #FF5656; }
.diff-tag.changed { color: #FF9C01; }
.remove-tip { color: #FF5656; font-size: 12px; margin-left: 8px; }
.remove-tip .view-btn { color: #3A84FF; cursor: pointer; }
.no-diff { color: #979BA5; font-size: 12px; padding: 8px 0; }
.sync-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 24px;
  background: #fff;
  border-top: 1px solid #DCDEE5;
}
.sync-footer .el-button { min-width: 86px; }
</style>
