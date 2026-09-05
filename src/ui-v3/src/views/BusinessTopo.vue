<template>
  <div class="page-card">
    <div class="table-toolbar">
      <el-select v-model="bizId" placeholder="选择业务" filterable style="width: 280px" @change="load">
        <el-option v-for="b in bizList" :key="b.bk_biz_id" :label="b.bk_biz_name" :value="b.bk_biz_id" />
      </el-select>
      <div class="spacer" />
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { searchBusiness, getBizTopoTree, getBizInternalTopo, listBizHosts } from '../api/cmdb'

const route = useRoute()
const bizId = ref(null)
const bizList = ref([])
const treeData = ref([])
const hosts = ref([])
const currentNode = ref(null)
const loading = ref(false)
const hostLoading = ref(false)

async function loadBizList() {
  const data = await searchBusiness({ start: 0, limit: 200 })
  bizList.value = data?.info || []
  const fromQuery = Number(route.query.biz)
  if (fromQuery && bizList.value.some((b) => b.bk_biz_id === fromQuery)) {
    bizId.value = fromQuery
    await load()
  } else if (bizList.value.length > 0) {
    bizId.value = bizList.value[0].bk_biz_id
    await load()
  }
}

// 把 find/topoinst 的通用主线节点(biz/set/自定义层/module)递归映射为树控件数据
function mapTopoNode(node) {
  return {
    type: node.bk_obj_id,
    id: `${node.bk_obj_id}-${node.bk_inst_id}`,
    label: node.bk_inst_name,
    children: (node.child || []).map(mapTopoNode)
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
        nodes.push(...(bizNode.child || []).map(mapTopoNode))
      }
    }
    // 空闲机池(内部集群,不在主线拓扑接口里)
    if (idleTopo.status === 'fulfilled' && idleTopo.value && idleTopo.value.bk_set_id) {
      const s = idleTopo.value
      nodes.push({
        type: 'set',
        id: `set-${s.bk_set_id}`,
        label: s.bk_set_name,
        isIdle: true,
        children: (s.module || []).map((m) => ({
          type: 'module',
          id: `module-${m.bk_module_id}`,
          label: m.bk_module_name,
          hostCount: m.host_count,
          moduleId: m.bk_module_id
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
.tree-node { display: flex; align-items: center; gap: 6px; }
</style>
