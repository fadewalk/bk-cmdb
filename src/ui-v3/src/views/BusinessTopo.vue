<template>
  <div class="topo-page">
    <h1 class="page-title">业务拓扑</h1>
    <div class="topo-body">
      <!-- 左:拓扑树(对齐旧版:无卡片边框,顶部关键词过滤) -->
      <div class="tree-col">
        <el-input v-model="keyword" placeholder="请输入关键词" size="small" clearable style="margin-bottom: 8px" />
        <el-tree
          ref="treeRef"
          :data="treeData"
          :props="{ label: 'label', children: 'children' }"
          default-expand-all
          node-key="id"
          :current-node-key="currentKey"
          highlight-current
          :expand-on-click-node="false"
          v-loading="loading"
          @node-click="onNodeClick"
        >
          <template #default="{ data }">
            <span class="tree-node">
              <span class="node-badge" :class="data.type">{{ nodeBadge(data) }}</span>
              <span class="node-label">{{ data.label }}</span>
              <span class="node-count">{{ data.hostCount ?? data.instCount ?? '' }}</span>
            </span>
          </template>
        </el-tree>
      </div>

      <!-- 右:主机列表 / 服务实例 / 节点信息 -->
      <div class="main-col">
        <el-tabs v-model="rightTab" class="right-tabs">
          <el-tab-pane label="主机列表" name="host" />
          <el-tab-pane label="服务实例" name="instance" />
          <el-tab-pane label="节点信息" name="node" />
        </el-tabs>

        <!-- 工具栏 -->
        <div class="toolbar" v-if="rightTab !== 'node'">
          <el-button size="small" type="primary" :disabled="!bizId" @click="openCreateSet" v-if="rightTab === 'host'">新增</el-button>
          <el-button size="small" :disabled="!selectedHosts.length" @click="transferVisible = true">转移至</el-button>
          <el-button size="small" :disabled="!selectedHosts.length" @click="appendVisible = true">追加至</el-button>
          <el-button size="small" :disabled="!selectedHosts.length">复制</el-button>
          <el-button size="small">更多</el-button>
          <div class="spacer" />
          <el-button size="small" :icon="'Refresh'" @click="load">刷新</el-button>
          <span class="refresh-time">{{ refreshText }}</span>
          <el-input
            v-model="ipKeyword"
            placeholder="请输入IP或固资编号"
            size="small"
            clearable
            style="width: 220px; margin-left: 8px"
            @keyup.enter="loadHosts"
            @clear="loadHosts"
          />
        </div>

        <!-- 主机列表 -->
        <template v-if="rightTab === 'host'">
          <el-table
            :data="hosts"
            v-loading="hostLoading"
            size="small"
            class="bk-table"
            @selection-change="onHostSelect"
          >
            <el-table-column type="selection" width="36" />
            <el-table-column prop="bk_host_innerip" label="内网IPv4" min-width="130">
              <template #default="{ row }">
                <el-link type="primary" :underline="false" @click="goHostDetail(row)">{{ row.bk_host_innerip || '--' }}</el-link>
              </template>
            </el-table-column>
            <el-table-column label="内网IPv6" min-width="120">
              <template #default="{ row }">{{ row.bk_host_innerip_v6 || '--' }}</template>
            </el-table-column>
            <el-table-column label="管控区域" min-width="120">
              <template #default="{ row }">{{ cloudName(row.bk_cloud_id) }}</template>
            </el-table-column>
            <el-table-column label="模块名(模块)" min-width="140">
              <template #default="{ row }">{{ row.__moduleName || '--' }}</template>
            </el-table-column>
            <el-table-column label="集群名(集群)" min-width="140">
              <template #default="{ row }">{{ row.__setName || '--' }}</template>
            </el-table-column>
          </el-table>
          <div class="table-footer">
            <span>共计{{ hostTotal }}条</span>
            <span class="selected-info">已选择{{ selectedHosts.length }}条</span>
          </div>
        </template>

        <!-- 服务实例 -->
        <template v-if="rightTab === 'instance'">
          <el-table :data="svcInstances" v-loading="instLoading" size="small" class="bk-table">
            <el-table-column prop="name" label="实例名称" min-width="200" show-overflow-tooltip />
            <el-table-column label="主机" width="140">
              <template #default="{ row }">{{ row.bk_host_innerip || '-' }}</template>
            </el-table-column>
            <el-table-column label="进程数" width="90">
              <template #default="{ row }">{{ row.process_count ?? '-' }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!instLoading && svcInstances.length === 0" description="暂无服务实例" :image-size="60" />
        </template>

        <!-- 节点信息 -->
        <template v-if="rightTab === 'node'">
          <el-descriptions :column="1" border size="small" style="max-width: 560px" v-if="currentNode && currentNode.type !== 'biz'">
            <el-descriptions-item label="节点类型">{{ nodeTypeName(currentNode.type) }}</el-descriptions-item>
            <el-descriptions-item label="节点名称">{{ currentNode.label }}</el-descriptions-item>
            <el-descriptions-item label="实例 ID">{{ currentNode.setId || currentNode.moduleId || '-' }}</el-descriptions-item>
            <el-descriptions-item label="主机数量">{{ currentNode.hostCount ?? '-' }}</el-descriptions-item>
          </el-descriptions>
          <el-empty v-else description="请在左侧选择集群或模块节点" :image-size="60" />
        </template>

        <el-empty v-if="!bizId" description="请先在左侧顶部选择业务" :image-size="70" />
      </div>
    </div>

    <!-- 新建集群 / 模块 -->
    <el-dialog v-model="nodeDialog" :title="nodeDialogType === 'set' ? '新建集群' : '新建模块'" width="420px">
      <el-form label-width="90px" @submit.prevent>
        <el-form-item :label="nodeDialogType === 'set' ? '集群名称' : '模块名称'" required>
          <el-input v-model="nodeName" placeholder="输入名称" />
        </el-form-item>
        <el-form-item v-if="nodeDialogType === 'module'" label="所属集群">
          <span>{{ nodeParent?.label }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="nodeDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveNode">保存</el-button>
      </template>
    </el-dialog>

    <!-- 转移 / 追加 -->
    <el-dialog v-model="transferVisible" :title="transferMode === 'move' ? '转移主机' : '追加主机'" width="440px">
      <el-form label-width="90px">
        <el-form-item label="目标模块" required>
          <el-cascader
            v-model="targetModule"
            :options="moduleOptions"
            :props="{ value: 'value', label: 'label', children: 'children', emitPath: false }"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="主机">
          <span>{{ selectedHosts.length }} 台</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferVisible = false">取消</el-button>
        <el-button type="primary" :loading="transferring" @click="doTransfer">确定</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="appendVisible" title="追加主机" width="440px">
      <el-form label-width="90px">
        <el-form-item label="目标模块" required>
          <el-cascader
            v-model="appendModule"
            :options="moduleOptions"
            :props="{ value: 'value', label: 'label', children: 'children', emitPath: false }"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="主机">
          <span>{{ selectedHosts.length }} 台(保留原模块)</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="appendVisible = false">取消</el-button>
        <el-button type="primary" :loading="transferring" @click="doAppend">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getBizTopoTree, getBizInternalTopo, listBizHosts,
  createSet, deleteSet, createModule, deleteModule,
  transferHostModule, searchServiceInstances
} from '../api/cmdb'
import { useBizStore } from '../stores/biz'

const route = useRoute()
const router = useRouter()
const bizStore = useBizStore()
const bizId = computed(() => bizStore.bizId)

const keyword = ref('')
const treeData = ref([])
const hosts = ref([])
const hostTotal = ref(0)
const selectedHosts = ref([])
const loading = ref(false)
const hostLoading = ref(false)
const rightTab = ref('host')
const svcInstances = ref([])
const instLoading = ref(false)
const refreshText = ref('')
const currentNode = ref(null)
const currentKey = ref('')

const nodeDialog = ref(false)
const nodeDialogType = ref('set')
const nodeName = ref('')
const nodeParent = ref(null)
const saving = ref(false)

const transferVisible = ref(false)
const appendVisible = ref(false)
const targetModule = ref(null)
const appendModule = ref(null)
const transferring = ref(false)
const moduleOptions = ref([])

const ipKeyword = ref('')
const treeRef = ref(null)

const names = { biz: '业务', set: '集群', module: '模块' }
const nodeTypeName = (t) => names[t] || t
function nodeBadge(data) {
  return { biz: '业', set: '集', module: '模' }[data.type] || '?'
}
const cloudNames = { 0: 'Default Area' }
function cloudName(id) {
  const n = cloudNames[id]
  return n ? `${n}[${id}]` : '--'
}

const filteredTree = computed(() => {
  if (!keyword.value) return treeData.value
  const kw = keyword.value.toLowerCase()
  const filter = (nodes) => nodes
    .map((n) => {
      const children = filter(n.children || [])
      if ((n.label || '').toLowerCase().includes(kw) || children.length) return { ...n, children }
      return null
    })
    .filter(Boolean)
  return filter(treeData.value)
})

function mapTopoNode(node, parentSetId) {
  const setId = node.bk_obj_id === 'set' ? node.bk_inst_id : parentSetId
  return {
    type: node.bk_obj_id,
    id: `${node.bk_obj_id}-${node.bk_inst_id}`,
    setId,
    moduleId: node.bk_obj_id === 'module' ? node.bk_inst_id : undefined,
    label: node.bk_inst_name,
    children: (node.child || []).map((c) => mapTopoNode(c, setId))
  }
}

async function load() {
  if (!bizId.value) return
  loading.value = true
  currentNode.value = null
  try {
    const [mainTree, idleTopo] = await Promise.allSettled([getBizTopoTree(bizId.value), getBizInternalTopo(bizId.value)])
    const nodes = []
    if (mainTree.status === 'fulfilled' && Array.isArray(mainTree.value)) {
      for (const bizNode of mainTree.value) {
        nodes.push(...(bizNode.child || []).map((c) => mapTopoNode(c, undefined)))
      }
    }
    if (idleTopo.status === 'fulfilled' && idleTopo.value?.bk_set_id) {
      const s = idleTopo.value
      nodes.push({
        type: 'set',
        id: `set-${s.bk_set_id}`,
        setId: s.bk_set_id,
        label: s.bk_set_name,
        isIdle: true,
        hostCount: (s.module || []).reduce((a, m) => a + (m.host_count || 0), 0),
        children: (s.module || []).map((m) => ({
          type: 'module',
          id: `module-${m.bk_module_id}`,
          moduleId: m.bk_module_id,
          setId: s.bk_set_id,
          label: m.bk_module_name,
          hostCount: m.host_count
        }))
      })
    }
    treeData.value = nodes
    await Promise.all([loadHosts(), loadInstances()])
  } finally {
    loading.value = false
  }
}

// 构建模块/集群名称映射,用于表格列展示
const moduleNameMap = ref({})
const setNameMap = ref({})

async function loadHosts() {
  if (!bizId.value) return
  hostLoading.value = true
  try {
    const filter = ipKeyword.value
      ? { condition: 'AND', rules: [{ field: 'bk_host_innerip', operator: 'contains', value: ipKeyword.value }] }
      : undefined
    const body = { page: { start: 0, limit: 500, sort: 'bk_host_id' }, fields: ['bk_host_id', 'bk_host_innerip', 'bk_host_name', 'bk_cloud_id'] }
    if (filter) body.host_property_filter = filter
    const { default: http } = await import('../api/http')
    const data = await http.post(`/hosts/app/${bizId.value}/list_hosts`, body)
    const list = (data?.info || []).map((h) => {
      const host = h.host || h
      const mod = (h.module || [])[0] || {}
      const set = (h.set || [])[0] || {}
      host.__moduleName = mod.bk_module_name || '--'
      host.__setName = set.bk_set_name || '--'
      return host
    })
    hosts.value = list
    hostTotal.value = data?.count || 0
    refreshText.value = '刚刚刷新'
  } finally {
    hostLoading.value = false
  }
}

async function loadInstances() {
  instLoading.value = true
  try {
    const data = await searchServiceInstances(bizId.value, { start: 0, limit: 200 })
    svcInstances.value = data?.info || []
  } finally {
    instLoading.value = false
  }
}

function onNodeClick(node) {
  currentNode.value = node
  currentKey.value = node.id
  if (rightTab.value === 'host') loadHosts()
}

function onHostSelect(rows) {
  selectedHosts.value = rows
}

function goHostDetail(row) {
  router.push({ path: '/host-detail', query: { id: row.bk_host_id, biz: bizId.value } })
}

async function loadModuleOptions() {
  const options = []
  const mapSet = (node) => ({
    value: node.bk_inst_id,
    label: node.bk_inst_name,
    children: (node.child || [])
      .filter((c) => c.bk_obj_id === 'module' || c.child)
      .map((c) => (c.bk_obj_id === 'module'
        ? { value: c.bk_inst_id, label: c.bk_inst_name }
        : mapSet(c)))
  })
  const [mainTree, idleTopo] = await Promise.allSettled([getBizTopoTree(bizId.value), getBizInternalTopo(bizId.value)])
  if (mainTree.status === 'fulfilled' && Array.isArray(mainTree.value)) {
    for (const bizNode of mainTree.value) options.push(...(bizNode.child || []).map(mapSet))
  }
  if (idleTopo.status === 'fulfilled' && idleTopo.value?.bk_set_id) {
    const s = idleTopo.value
    options.push({
      value: s.bk_set_id,
      label: s.bk_set_name,
      children: (s.module || []).map((m) => ({ value: m.bk_module_id, label: m.bk_module_name }))
    })
  }
  moduleOptions.value = options
}

async function doTransfer() {
  if (!targetModule.value) { ElMessage.warning('请选择目标模块'); return }
  transferring.value = true
  try {
    await transferHostModule(bizId.value, selectedHosts.value.map((h) => h.bk_host_id), [targetModule.value], false)
    ElMessage.success('转移成功')
    transferVisible.value = false
    loadHosts()
  } finally {
    transferring.value = false
  }
}

async function doAppend() {
  if (!appendModule.value) { ElMessage.warning('请选择目标模块'); return }
  transferring.value = true
  try {
    await transferHostModule(bizId.value, selectedHosts.value.map((h) => h.bk_host_id), [appendModule.value], true)
    ElMessage.success('追加成功')
    appendVisible.value = false
    loadHosts()
  } finally {
    transferring.value = false
  }
}

// ---- 新建集群 / 模块 ----
function openCreateSet() {
  nodeDialogType.value = 'set'
  nodeParent.value = null
  nodeName.value = ''
  nodeDialog.value = true
}

async function saveNode() {
  if (!nodeName.value) { ElMessage.warning('请输入名称'); return }
  saving.value = true
  try {
    if (nodeDialogType.value === 'set') {
      await createSet(bizId.value, nodeName.value)
    } else {
      await createModule(bizId.value, nodeParent.value.setId, nodeName.value)
    }
    ElMessage.success('创建成功')
    nodeDialog.value = false
    load()
  } finally {
    saving.value = false
  }
}

watch(bizId, () => { if (bizId.value) { load(); loadModuleOptions() } })

onMounted(async () => {
  await bizStore.ensureLoaded()
  if (bizId.value) {
    const fromQuery = Number(route.query.biz)
    if (fromQuery && bizList.value.some((b) => b.bk_biz_id === fromQuery)) bizStore.select(fromQuery)
    load()
    loadModuleOptions()
  }
})
</script>

<style scoped>
.topo-page { height: 100%; display: flex; flex-direction: column; background: #fff; }
.page-title {
  font-size: 16px; color: #313238; font-weight: 400;
  padding: 0 20px; height: 50px; line-height: 50px;
  border-bottom: 1px solid #E7E9EF; margin: 0;
}
.topo-body { flex: 1; display: flex; overflow: hidden; }
.tree-col {
  width: 280px; flex: 0 0 280px;
  border-right: 1px solid #E7E9EF;
  padding: 12px; overflow: auto;
}
.tree-node { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.node-badge {
  width: 16px; height: 16px; line-height: 16px; text-align: center;
  border-radius: 2px; font-size: 11px; color: #fff; background: #C4C6CC; flex: 0 0 16px;
}
.node-badge.biz { background: #3A84FF; }
.node-badge.set { background: #30d878; }
.node-badge.module { background: #ff9c01; }
.node-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node-count { color: #979BA5; font-size: 12px; }
.main-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 0 16px 12px; }
.right-tabs { margin-bottom: 4px; }
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.toolbar .spacer { flex: 1; }
.refresh-time { color: #979BA5; font-size: 12px; margin: 0 4px; }
.table-footer {
  display: flex; align-items: center; gap: 16px;
  padding: 10px 0 0; font-size: 12px; color: #63656E;
}
</style>
