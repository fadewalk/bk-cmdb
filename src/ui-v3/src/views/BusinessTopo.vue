<template>
  <div class="page-card">
    <div class="table-toolbar">
      <span class="page-title">业务拓扑 · {{ bizStore.currentBiz?.bk_biz_name || '未选择业务' }}</span>
      <div class="spacer" />
      <el-button :icon="'Plus'" type="primary" plain :disabled="!bizId" @click="openCreateSet">新建集群</el-button>
      <el-button :icon="'Refresh'" :disabled="!bizId" @click="load">刷新</el-button>
    </div>

    <el-row :gutter="16" v-if="bizId">
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>拓扑结构(业务 / 集群 / 模块)</template>
          <el-tree
            :data="treeData"
            :props="{ label: 'label', children: 'children' }"
            default-expand-all
            v-loading="loading"
            @node-click="onNodeClick"
          >
            <template #default="{ data }">
              <span class="tree-node">
                <el-icon v-if="data.type === 'biz'"><OfficeBuilding /></el-icon>
                <el-icon v-else-if="data.type === 'module'"><Files /></el-icon>
                <el-icon v-else><Folder /></el-icon>
                <span>{{ data.label }}</span>
                <el-tag v-if="data.type === 'module' && data.hostCount != null" size="small" style="margin-left: 8px">
                  {{ data.hostCount }} 台主机
                </el-tag>
                <el-tag v-if="data.isIdle" size="small" type="info" style="margin-left: 8px">空闲机池</el-tag>
                <span class="node-actions" @click.stop>
                  <el-button
                    v-if="data.type === 'set' && !data.isIdle"
                    link type="primary" size="small" @click="openCreateModule(data)"
                  >+模块</el-button>
                  <el-button
                    v-if="data.type === 'set' && !data.isIdle"
                    link type="primary" size="small" @click="openRename(data)"
                  >改名</el-button>
                  <el-button
                    v-if="data.type === 'module'"
                    link type="primary" size="small" @click="openRename(data)"
                  >改名</el-button>
                  <el-button
                    v-if="(data.type === 'set' && !data.isIdle) || data.type === 'module'"
                    link type="danger" size="small" @click="removeNode(data)"
                  >删除</el-button>
                </span>
              </span>
            </template>
          </el-tree>
          <el-empty v-if="!loading && treeData.length === 0" description="该业务暂无拓扑" :image-size="80" />
        </el-card>
      </el-col>
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>
            {{ currentNode ? `「${currentNode.label}」下的主机` : '业务下主机' }}
          </template>
          <el-table :data="hosts" v-loading="hostLoading" size="default" stripe>
            <el-table-column prop="bk_host_innerip" label="内网 IP" width="150" />
            <el-table-column prop="bk_host_name" label="主机名称" min-width="160" show-overflow-tooltip />
            <el-table-column prop="bk_os_name" label="操作系统" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ row.bk_os_name || '-' }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!hostLoading && hosts.length === 0" description="暂无主机" :image-size="80" />
        </el-card>
      </el-col>
    </el-row>
    <el-empty v-else description="请先选择业务" />

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

    <!-- 重命名集群 / 模块 -->
    <el-dialog v-model="renameDialog" :title="renameTarget?.type === 'set' ? '编辑集群' : '编辑模块'" width="440px">
      <el-form label-width="100px" @submit.prevent>
        <el-form-item :label="renameTarget?.type === 'set' ? '集群名称' : '模块名称'" required>
          <el-input v-model="renameName" />
        </el-form-item>
        <el-form-item v-if="renameTarget?.type === 'set'" label="集群描述">
          <el-input v-model="renameDesc" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item v-if="renameTarget?.type === 'module'" label="模块类型">
          <el-select v-model="renameModuleType" style="width: 100%">
            <el-option label="常规" value="1" />
            <el-option label="数据库" value="2" />
            <el-option label="中间件" value="3" />
            <el-option label="程序" value="4" />
            <el-option label="缓存" value="5" />
            <el-option label="其他" value="99" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRename">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchBusiness, getBizTopoTree, getBizInternalTopo, listBizHosts,
  createSet, deleteSet, createModule, deleteModule, updateSet, updateModule
} from '../api/cmdb'
import { useBizStore } from '../stores/biz'

const route = useRoute()
const bizStore = useBizStore()
const bizId = computed(() => bizStore.bizId)
const bizList = computed(() => bizStore.bizList)
const treeData = ref([])
const hosts = ref([])
const currentNode = ref(null)
const loading = ref(false)
const hostLoading = ref(false)

const nodeDialog = ref(false)
const nodeDialogType = ref('set')
const nodeName = ref('')
const nodeParent = ref(null)
const saving = ref(false)

function openCreateSet() {
  nodeDialogType.value = 'set'
  nodeParent.value = null
  nodeName.value = ''
  nodeDialog.value = true
}

function openCreateModule(setNode) {
  nodeDialogType.value = 'module'
  nodeParent.value = setNode
  nodeName.value = ''
  nodeDialog.value = true
}

// 重命名集群 / 模块
const renameDialog = ref(false)
const renameTarget = ref(null)
const renameName = ref('')
const renameDesc = ref('')
const renameModuleType = ref('1')

function openRename(node) {
  renameTarget.value = node
  renameName.value = node.label
  renameDesc.value = node.setDesc || node.moduleDesc || ''
  renameModuleType.value = node.moduleType || '1'
  renameDialog.value = true
}

async function saveRename() {
  if (!renameName.value) {
    ElMessage.warning('请输入名称')
    return
  }
  saving.value = true
  try {
    const t = renameTarget.value
    if (t.type === 'set') {
      await updateSet(bizId.value, t.setId, {
        bk_set_name: renameName.value,
        bk_set_desc: renameDesc.value
      })
    } else {
      await updateModule(bizId.value, t.setId, t.moduleId, {
        bk_module_name: renameName.value,
        bk_module_type: renameModuleType.value
      })
    }
    ElMessage.success('已更新')
    renameDialog.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function saveNode() {
  if (!nodeName.value) {
    ElMessage.warning('请输入名称')
    return
  }
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

async function removeNode(node) {
  const tip = node.type === 'set'
    ? `确定删除集群「${node.label}」?其下模块与主机转移关系将被删除`
    : `确定删除模块「${node.label}」?`
  await ElMessageBox.confirm(tip, '删除确认', { type: 'warning' })
  if (node.type === 'set') {
    await deleteSet(bizId.value, node.setId)
  } else {
    await deleteModule(bizId.value, node.setId, node.moduleId)
  }
  ElMessage.success('已删除')
  load()
}

async function loadBizList() {
  await bizStore.ensureLoaded()
  if (bizId.value) {
    const fromQuery = Number(route.query.biz)
    if (fromQuery && bizList.value.some((b) => b.bk_biz_id === fromQuery)) {
      bizStore.select(fromQuery)
    }
    load()
  }
}

watch(bizId, () => load())

// 把 find/topoinst 的通用主线节点(biz/set/自定义层/module)递归映射为树控件数据
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
    const [mainTree, idleTopo] = await Promise.allSettled([
      getBizTopoTree(bizId.value),
      getBizInternalTopo(bizId.value)
    ])

    const nodes = []
    // 用户自建的集群/模块层级
    if (mainTree.status === 'fulfilled' && Array.isArray(mainTree.value)) {
      for (const bizNode of mainTree.value) {
        nodes.push(...(bizNode.child || []).map((c) => mapTopoNode(c, undefined)))
      }
    }
    // 空闲机池(内部集群,不在主线拓扑接口里)
    if (idleTopo.status === 'fulfilled' && idleTopo.value && idleTopo.value.bk_set_id) {
      const s = idleTopo.value
      nodes.push({
        type: 'set',
        id: `set-${s.bk_set_id}`,
        setId: s.bk_set_id,
        label: s.bk_set_name,
        isIdle: true,
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
    await loadHosts()
  } finally {
    loading.value = false
  }
}

async function loadHosts() {
  hostLoading.value = true
  try {
    const data = await listBizHosts(bizId.value, { start: 0, limit: 200, sort: 'bk_host_id' })
    hosts.value = data?.info?.map((h) => h.host || h) || []
  } finally {
    hostLoading.value = false
  }
}

async function onNodeClick(node) {
  currentNode.value = node
  // 模块级主机过滤需要组合接口,当前展示业务全量主机
  await loadHosts()
}

onMounted(loadBizList)
</script>

<style scoped>
.page-title { font-size: 14px; font-weight: 600; color: #313238; }
.tree-node { display: flex; align-items: center; gap: 6px; }
.node-actions { visibility: hidden; margin-left: 8px; }
:deep(.el-tree-node__content:hover) .node-actions { visibility: visible; }
</style>
