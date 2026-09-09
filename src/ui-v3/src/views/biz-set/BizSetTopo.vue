<template>
  <div class="biz-set-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">业务集拓扑</h1>
        <p class="page-tips">选择业务集和拓扑节点，查看其下主机、服务实例及节点信息。</p>
      </div>
      <el-button :icon="Refresh" :loading="setsLoading" @click="loadSets">刷新</el-button>
    </div>

    <div class="bs-body">
      <aside class="bs-left">
        <el-input v-model="setKeyword" placeholder="搜索业务集" clearable :prefix-icon="Search" />
        <div v-if="setsError" class="side-state error-state">{{ setsError }}</div>
        <el-scrollbar v-else v-loading="setsLoading" class="set-scroll">
          <div
            v-for="item in filteredSets"
            :key="item.bk_biz_set_id"
            :class="['bs-item', { active: activeSetId === item.bk_biz_set_id }]"
            @click="selectSet(item)"
          >
            <i class="bk-cmdb-icon icon-cc-nav-business" />
            <span class="bs-name" :title="item.bk_biz_set_name">{{ item.bk_biz_set_name }}</span>
            <span class="bs-id">{{ item.bk_biz_set_id }}</span>
          </div>
          <el-empty v-if="!setsLoading && !filteredSets.length" description="暂无业务集" :image-size="64" />
        </el-scrollbar>
      </aside>

      <main class="bs-right">
        <template v-if="activeSet">
          <div class="content-header">
            <div>
              <div class="content-title">{{ activeSet.bk_biz_set_name }}</div>
              <div class="content-subtitle">业务集 ID：{{ activeSetId }}<span v-if="bizCount !== null"> · {{ bizCount }} 个业务</span></div>
            </div>
            <el-button link type="primary" :loading="detailLoading" @click="loadSetData">重新加载</el-button>
          </div>

          <div v-if="detailError" class="state-panel error-state">{{ detailError }}</div>
          <template v-else>
            <div class="topology-layout">
              <section class="topology-panel">
                <div class="panel-title">拓扑节点</div>
                <div v-loading="topologyLoading" class="topology-tree-wrap">
                  <el-tree
                    v-if="topologyTree.length"
                    :data="topologyTree"
                    node-key="key"
                    default-expand-all
                    highlight-current
                    :props="treeProps"
                    @node-click="selectNode"
                  >
                    <template #default="{ data }">
                      <div class="tree-node">
                        <span class="tree-node-name" :title="data.label">{{ data.label }}</span>
                        <span class="tree-node-count" v-if="data.count">主机 {{ data.count.host_count || 0 }} · 服务 {{ data.count.service_instance_count || 0 }}</span>
                      </div>
                    </template>
                  </el-tree>
                  <el-empty v-else-if="!topologyLoading" description="业务集下暂无拓扑节点" :image-size="80" />
                </div>
              </section>

              <section class="detail-panel">
                <el-tabs v-model="activeTab" @tab-change="handleTabChange">
                  <el-tab-pane label="主机" name="hosts">
                    <el-table v-loading="hostsLoading" :data="hosts" stripe border size="small" height="calc(100vh - 300px)">
                      <el-table-column prop="bk_host_id" label="主机 ID" width="100" />
                      <el-table-column prop="bk_host_innerip" label="内网 IP" min-width="150" show-overflow-tooltip />
                      <el-table-column prop="bk_host_name" label="主机名" min-width="150" show-overflow-tooltip />
                      <el-table-column prop="bk_os_name" label="操作系统" min-width="140" show-overflow-tooltip />
                      <el-table-column label="业务拓扑" min-width="220" show-overflow-tooltip>
                        <template #default="{ row }">{{ hostPath(row) }}</template>
                      </el-table-column>
                    </el-table>
                    <el-empty v-if="!hostsLoading && !hosts.length && !hostsError" description="该节点下暂无主机" :image-size="80" />
                    <div v-if="hostsError" class="inline-error">{{ hostsError }}</div>
                  </el-tab-pane>

                  <el-tab-pane label="服务实例" name="services">
                    <el-table
                      v-loading="servicesLoading"
                      :data="services"
                      row-key="id"
                      stripe
                      border
                      size="small"
                      height="calc(100vh - 300px)"
                      @expand-change="handleServiceExpand"
                    >
                      <el-table-column type="expand" width="46">
                        <template #default="{ row }">
                          <div v-loading="row.processLoading" class="process-wrap">
                            <el-table v-if="row.processes?.length" :data="row.processes" size="small" border>
                              <el-table-column prop="bk_process_id" label="进程 ID" width="110" />
                              <el-table-column prop="bk_process_name" label="进程名称" min-width="180" show-overflow-tooltip />
                              <el-table-column prop="pid" label="PID" width="100" />
                              <el-table-column prop="port" label="端口" width="100" />
                              <el-table-column prop="bk_host_id" label="主机 ID" width="110" />
                            </el-table>
                            <el-empty v-else-if="!row.processLoading && !row.processError" description="该服务实例下暂无进程" :image-size="60" />
                            <div v-if="row.processError" class="inline-error">{{ row.processError }}</div>
                          </div>
                        </template>
                      </el-table-column>
                      <el-table-column prop="name" label="服务实例" min-width="220" show-overflow-tooltip>
                        <template #default="{ row }">{{ serviceName(row) }}</template>
                      </el-table-column>
                      <el-table-column prop="bk_biz_id" label="业务 ID" width="100" />
                      <el-table-column prop="bk_module_id" label="模块 ID" width="110" />
                      <el-table-column prop="bk_host_id" label="主机 ID" width="110" />
                      <el-table-column label="进程数" width="100">
                        <template #default="{ row }">{{ row.processCount === null ? '—' : row.processCount }}</template>
                      </el-table-column>
                    </el-table>
                    <el-empty v-if="!servicesLoading && !services.length && !servicesError" description="该节点下暂无服务实例" :image-size="80" />
                    <div v-if="servicesError" class="inline-error">{{ servicesError }}</div>
                  </el-tab-pane>

                  <el-tab-pane label="节点信息" name="node">
                    <el-descriptions v-if="selectedNode" :column="2" border size="small" class="node-descriptions">
                      <el-descriptions-item label="节点类型">{{ selectedNode.bk_obj_id }}</el-descriptions-item>
                      <el-descriptions-item label="节点 ID">{{ selectedNode.bk_inst_id }}</el-descriptions-item>
                      <el-descriptions-item label="节点名称" :span="2">{{ selectedNode.bk_inst_name || selectedNode.label }}</el-descriptions-item>
                      <el-descriptions-item label="主机数量">{{ selectedNode.count?.host_count ?? '—' }}</el-descriptions-item>
                      <el-descriptions-item label="服务实例数量">{{ selectedNode.count?.service_instance_count ?? '—' }}</el-descriptions-item>
                    </el-descriptions>
                    <el-empty v-else description="请选择拓扑节点" :image-size="80" />
                  </el-tab-pane>
                </el-tabs>
              </section>
            </div>
          </template>
        </template>
        <el-empty v-else-if="!setsLoading" description="请在左侧选择业务集" :image-size="100" />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh } from '@element-plus/icons-vue'
import {
  searchBusinessSets,
  listBizSetBusinesses,
  listBizSetTopoChildren,
  countBizSetTopoNodes,
  listBizSetHosts,
  listBizSetServiceInstances,
  listBizSetProcesses
} from '../../api/cmdb'

const sets = ref([])
const activeSet = ref(null)
const setKeyword = ref('')
const setsLoading = ref(false)
const setsError = ref('')
const detailLoading = ref(false)
const detailError = ref('')
const topologyLoading = ref(false)
const topologyTree = ref([])
const selectedNode = ref(null)
const activeTab = ref('hosts')
const hosts = ref([])
const hostsLoading = ref(false)
const hostsError = ref('')
const services = ref([])
const servicesLoading = ref(false)
const servicesError = ref('')
const bizCount = ref(null)
const treeProps = { children: 'children', label: 'label' }

const activeSetId = computed(() => activeSet.value?.bk_biz_set_id)
const filteredSets = computed(() => {
  const keyword = setKeyword.value.trim().toLowerCase()
  if (!keyword) return sets.value
  return sets.value.filter((item) => String(item.bk_biz_set_name || '').toLowerCase().includes(keyword))
})

function responseList(data) {
  if (Array.isArray(data)) return data
  return data?.info || data?.data?.info || data?.data || []
}
function responseCount(data) {
  return data?.count ?? data?.data?.count ?? null
}
function nodeKey(item) {
  return `${item.bk_obj_id || 'node'}-${item.bk_inst_id}`
}
function nodeLabel(item) {
  return item.bk_inst_name || item.bk_obj_name || item.name || `${item.bk_obj_id}-${item.bk_inst_id}`
}
function normalizeNode(item) {
  return { ...item, key: nodeKey(item), label: nodeLabel(item), children: [] }
}
function nodeField(node) {
  if (node.bk_obj_id === 'biz') return 'bk_biz_id'
  if (node.bk_obj_id === 'set') return 'bk_set_id'
  if (node.bk_obj_id === 'module') return 'bk_module_id'
  return 'bk_inst_id'
}
function nodeCondition(node) {
  return [{
    bk_obj_id: node.bk_obj_id,
    condition: [{ field: nodeField(node), operator: '$eq', value: node.bk_inst_id }]
  }]
}
function serviceName(row) {
  return row.name || row.bk_service_instance_name || row.service_instance_name || row.id || '--'
}
function hostPath(row) {
  const parts = [...(row.set || []), ...(row.module || [])]
  return parts.map((item) => item.bk_set_name || item.bk_module_name).filter(Boolean).join(' / ') || '--'
}
function requestPage(limit = 200) {
  return { start: 0, limit }
}
function resetDetail() {
  topologyTree.value = []
  selectedNode.value = null
  hosts.value = []
  services.value = []
  hostsError.value = ''
  servicesError.value = ''
  bizCount.value = null
}

async function loadSets() {
  setsLoading.value = true
  setsError.value = ''
  try {
    const data = await searchBusinessSets()
    sets.value = responseList(data)
    if (sets.value.length) {
      const current = sets.value.find((item) => String(item.bk_biz_set_id) === String(activeSetId.value)) || sets.value[0]
      await selectSet(current)
    } else {
      activeSet.value = null
      resetDetail()
    }
  } catch (error) {
    sets.value = []
    activeSet.value = null
    setsError.value = `业务集加载失败：${error?.message || '后端异常'}`
  } finally {
    setsLoading.value = false
  }
}

async function selectSet(item) {
  activeSet.value = item
  resetDetail()
  await loadSetData()
}

async function loadSetData() {
  if (!activeSetId.value) return
  detailLoading.value = true
  detailError.value = ''
  topologyLoading.value = true
  try {
    const [bizData, rootData] = await Promise.all([
      listBizSetBusinesses(activeSetId.value, requestPage()),
      listBizSetTopoChildren(activeSetId.value, 'bk_biz_set_obj', activeSetId.value)
    ])
    bizCount.value = responseCount(bizData) ?? responseList(bizData).length
    const roots = responseList(rootData).map(normalizeNode)
    topologyTree.value = roots
    await loadNodeCounts(roots)
    if (roots.length) await selectNode(roots[0])
  } catch (error) {
    detailError.value = `业务集拓扑加载失败：${error?.message || '后端异常'}`
  } finally {
    topologyLoading.value = false
    detailLoading.value = false
  }
}

async function loadNodeCounts(nodes) {
  if (!nodes.length) return
  try {
    const data = await countBizSetTopoNodes(activeSetId.value, nodes.map((node) => ({
      bk_obj_id: node.bk_obj_id,
      bk_inst_id: node.bk_inst_id
    })))
    const counts = responseList(data)
    nodes.forEach((node) => {
      node.count = counts.find((item) => String(item.bk_obj_id) === String(node.bk_obj_id) && String(item.bk_inst_id) === String(node.bk_inst_id)) || null
    })
  } catch (error) {
    ElMessage.warning(`节点数量加载失败：${error?.message || '后端异常'}`)
  }
}

async function selectNode(node) {
  selectedNode.value = node
  if (!node.children?.length && node.bk_obj_id !== 'module') {
    try {
      const children = responseList(await listBizSetTopoChildren(activeSetId.value, node.bk_obj_id, node.bk_inst_id)).map(normalizeNode)
      node.children = children
      await loadNodeCounts(children)
    } catch (error) {
      ElMessage.error(`拓扑子节点加载失败：${error?.message || '后端异常'}`)
    }
  }
  if (activeTab.value === 'hosts') await loadHosts()
  if (activeTab.value === 'services') await loadServices()
}

async function loadHosts() {
  if (!activeSetId.value || !selectedNode.value) return
  hostsLoading.value = true
  hostsError.value = ''
  try {
    const node = selectedNode.value
    const condition = nodeCondition(node)
    const data = await listBizSetHosts(activeSetId.value, {
      condition,
      fields: ['bk_host_id', 'bk_host_innerip', 'bk_host_name', 'bk_os_name', 'bk_cloud_id'],
      page: requestPage(100)
    })
    hosts.value = responseList(data)
  } catch (error) {
    hosts.value = []
    hostsError.value = `主机加载失败：${error?.message || '后端异常'}`
  } finally {
    hostsLoading.value = false
  }
}

async function loadServices() {
  const node = selectedNode.value
  if (!activeSetId.value || !node) return
  if (node.bk_obj_id !== 'module') {
    services.value = []
    servicesError.value = '请选择模块节点查看服务实例'
    return
  }
  servicesLoading.value = true
  servicesError.value = ''
  try {
    const data = await listBizSetServiceInstances(activeSetId.value, {
      bk_biz_id: node.bk_biz_id,
      bk_module_id: node.bk_inst_id,
      page: requestPage(100),
      with_name: true
    })
    services.value = responseList(data).map((row) => ({ ...row, processCount: null, processes: [] }))
  } catch (error) {
    services.value = []
    servicesError.value = `服务实例加载失败：${error?.message || '后端异常'}`
  } finally {
    servicesLoading.value = false
  }
}

async function handleTabChange(tab) {
  if (tab === 'hosts' && !hosts.value.length) await loadHosts()
  if (tab === 'services' && !services.value.length) await loadServices()
}

async function handleServiceExpand(row, expandedRows) {
  if (!expandedRows.includes(row) || row.processLoading || row.processesLoaded) return
  row.processLoading = true
  row.processError = ''
  try {
    const data = await listBizSetProcesses(activeSetId.value, {
      service_instance_id: row.id,
      bk_biz_id: row.bk_biz_id,
      page: requestPage(200)
    })
    row.processes = responseList(data)
    row.processCount = responseCount(data) ?? row.processes.length
    row.processesLoaded = true
  } catch (error) {
    row.processError = `进程加载失败：${error?.message || '后端异常'}`
    row.processes = []
  } finally {
    row.processLoading = false
  }
}

onMounted(loadSets)
</script>

<style scoped>
.biz-set-page { height: 100%; display: flex; flex-direction: column; background: #fff; }
.page-header { min-height: 64px; padding: 0 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e7e9ef; }
.page-title { margin: 0; color: #313238; font-size: 16px; font-weight: 400; }
.page-tips { margin: 5px 0 0; color: #979ba5; font-size: 12px; }
.bs-body { min-height: 0; flex: 1; display: flex; overflow: hidden; }
.bs-left { width: 240px; flex: 0 0 240px; padding: 12px; display: flex; flex-direction: column; gap: 10px; overflow: hidden; border-right: 1px solid #e7e9ef; background: #fafbfc; }
.set-scroll { min-height: 0; flex: 1; }
.bs-item { height: 36px; padding: 0 8px; display: flex; align-items: center; gap: 7px; color: #63656e; font-size: 13px; cursor: pointer; border-radius: 2px; }
.bs-item:hover { background: #f0f1f5; }.bs-item.active { color: #3a84ff; background: #e1ecff; }.bs-name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.bs-id, .content-subtitle, .tree-node-count { color: #979ba5; font-size: 12px; }
.bs-right { min-width: 0; flex: 1; padding: 16px 20px; overflow: auto; }.content-header { min-height: 52px; display: flex; align-items: flex-start; justify-content: space-between; }.content-title { color: #313238; font-size: 16px; }.topology-layout { min-height: 520px; display: flex; gap: 16px; }.topology-panel { width: 300px; flex: 0 0 300px; border: 1px solid #e7e9ef; }.detail-panel { min-width: 0; flex: 1; border: 1px solid #e7e9ef; }.panel-title { height: 42px; padding: 0 14px; display: flex; align-items: center; color: #313238; font-size: 14px; border-bottom: 1px solid #e7e9ef; }.topology-tree-wrap { min-height: 460px; padding: 8px; }.tree-node { min-width: 0; width: 100%; display: flex; align-items: center; gap: 8px; }.tree-node-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.tree-node-count { margin-left: auto; white-space: nowrap; }.detail-panel :deep(.el-tabs__header) { margin: 0; padding: 0 16px; }.detail-panel :deep(.el-tabs__content) { padding: 14px 16px; }.process-wrap { padding: 12px 40px 12px 48px; background: #fafbfc; }.node-descriptions { margin-top: 8px; }.state-panel { padding: 40px; }.side-state, .inline-error { padding: 12px; color: #ea3636; font-size: 12px; }.error-state { color: #ea3636; }
</style>
