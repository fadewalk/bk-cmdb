<template>
  <div class="host-page">
    <h1 class="page-title">主机</h1>
    <div class="host-body">
      <!-- 左:分组目录(未分配/已分配/全部 + 主机池树) -->
      <div class="group-col">
        <div class="group-tabs">
          <span
            v-for="t in groupTabs" :key="t.key"
            :class="['group-tab', { active: groupTab === t.key }]"
            @click="groupTab = t.key"
          >{{ t.label }}</span>
        </div>
        <el-input v-model="groupFilter" placeholder="分组目录" size="small" clearable style="margin: 10px 0 8px" />
        <div class="group-list">
          <div
            v-for="g in groupList" :key="g.id"
            :class="['group-item', { active: activeGroup === g.id }]"
            @click="activeGroup = g.id"
          >
            <span class="g-icon"><el-icon><Monitor /></el-icon></span>
            <span class="g-name">{{ g.name }}</span>
            <span class="g-count">{{ g.count }}</span>
          </div>
        </div>
      </div>

      <!-- 右:列表 -->
      <div class="main-col">
        <div class="toolbar">
          <el-button size="small" type="primary" :icon="'Plus'">导入主机</el-button>
          <el-button size="small" :disabled="!selectedHosts.length" @click="transferVisible = true">分配到</el-button>
          <el-button size="small" :disabled="!selectedHosts.length">编辑</el-button>
          <el-button size="small" :disabled="!selectedHosts.length">复制</el-button>
          <el-button size="small">更多</el-button>
          <div class="spacer" />
          <el-button size="small" :icon="'Refresh'" @click="reload">刷新</el-button>
          <span class="refresh-time">刚刚刷新</span>
          <el-input
            v-model="keyword"
            placeholder="请输入IP或固资编号"
            size="small"
            clearable
            style="width: 220px; margin-left: 8px"
            @keyup.enter="reload"
            @clear="reload"
          />
        </div>

        <el-table
          :data="pagedHosts"
          v-loading="loading"
          size="small"
          class="bk-table"
          @selection-change="onSelect"
        >
          <el-table-column type="selection" width="36" />
          <el-table-column label="内网IPv4" min-width="130">
            <template #default="{ row }">
              <el-link type="primary" :underline="false" @click="goDetail(row)">{{ row.bk_host_innerip || '--' }}</el-link>
            </template>
          </el-table-column>
          <el-table-column label="内网IPv6" min-width="120">
            <template #default="{ row }">{{ row.bk_host_innerip_v6 || '--' }}</template>
          </el-table-column>
          <el-table-column label="管控区域" min-width="120">
            <template #default="{ row }">{{ cloudName(row.bk_cloud_id) }}</template>
          </el-table-column>
          <el-table-column label="业务拓扑" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ row.__topo || '资源池 / 空闲机池 / 空闲机' }}</template>
          </el-table-column>
          <el-table-column label="主机名称" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.bk_host_name || '--' }}</template>
          </el-table-column>
        </el-table>

        <div class="table-footer">
          <span>共计{{ total }}条</span>
          <span>每页</span>
          <el-select v-model="pageSize" size="small" style="width: 76px" @change="reload">
            <el-option v-for="n in [20, 50, 100]" :key="n" :label="String(n)" :value="n" />
          </el-select>
          <span>条</span>
          <span class="spacer" />
          <span>已选择{{ selectedHosts.length }}条</span>
          <el-pagination
            v-model:current-page="page"
            :page-size="pageSize"
            :total="total"
            layout="prev, pager, next"
          />
        </div>
      </div>
    </div>

    <!-- 分配到 -->
    <el-dialog v-model="transferVisible" title="分配到业务模块" width="480px">
      <el-form label-width="90px">
        <el-form-item label="目标业务" required>
          <el-select v-model="targetBiz" filterable style="width: 100%">
            <el-option v-for="b in bizStore.bizList" :key="b.bk_biz_id" :label="b.bk_biz_name" :value="b.bk_biz_id" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标模块" required>
          <el-cascader
            v-model="targetModule"
            :options="moduleOptions"
            :props="{ value: 'value', label: 'label', children: 'children', emitPath: false }"
            style="width: 100%"
            :disabled="!targetBiz"
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  http, listHostsWithoutApp, transferHostModule,
  getBizTopoTree, getBizInternalTopo
} from '../api/cmdb'
import { useBizStore } from '../stores/biz'

const route = useRoute()
const router = useRouter()
const bizStore = useBizStore()

const groupTabs = [
  { key: 'unassigned', label: '未分配' },
  { key: 'assigned', label: '已分配' },
  { key: 'all', label: '全部' }
]
const groupTab = ref('all')
const groupFilter = ref('')
const activeGroup = ref('idle-pool')
const groupList = ref([
  { id: 'idle-pool', name: '空闲机', count: 0 },
  { id: 'host-pool', name: '主机池', count: 0 }
])

const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const rows = ref([])
const selectedHosts = ref([])
const loading = ref(false)

const transferVisible = ref(false)
const transferring = ref(false)
const targetBiz = ref(null)
const targetModule = ref(null)
const moduleOptions = ref([])

const cloudNames = { 0: 'Default Area' }
function cloudName(id) {
  const n = cloudNames[id]
  return n ? `${n}[${id}]` : '--'
}

const pagedHosts = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return rows.value.slice(start, start + pageSize.value)
})

async function load() {
  loading.value = true
  try {
    const body = {
      page: { start: 0, limit: 1000, sort: 'bk_host_id' },
      fields: ['bk_host_id', 'bk_host_innerip', 'bk_host_name', 'bk_cloud_id']
    }
    if (keyword.value) {
      body.host_property_filter = {
        condition: 'AND',
        rules: [{ field: 'bk_host_innerip', operator: 'contains', value: keyword.value }]
      }
    }
    const raw = await http.post('/hosts/list_hosts_without_app', body)
    const list = (raw?.info || []).map((h) => h.host || h)
    rows.value = list
    total.value = list.length
    groupList.value = [
      { id: 'idle-pool', name: '空闲机', count: list.length },
      { id: 'host-pool', name: '主机池', count: list.length }
    ]
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load()
}

function onSelect(rows) {
  selectedHosts.value = rows
}

function goDetail(row) {
  router.push({ path: '/host-detail', query: { id: row.bk_host_id } })
}

async function loadModuleOptions() {
  if (!targetBiz.value) { moduleOptions.value = []; return }
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
  const [mainTree, idleTopo] = await Promise.allSettled([getBizTopoTree(targetBiz.value), getBizInternalTopo(targetBiz.value)])
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
  if (!targetBiz.value || !targetModule.value) { ElMessage.warning('请选择目标业务与模块'); return }
  transferring.value = true
  try {
    await transferHostModule(targetBiz.value, selectedHosts.value.map((h) => h.bk_host_id), [targetModule.value], false)
    ElMessage.success('分配成功')
    transferVisible.value = false
    load()
  } finally {
    transferring.value = false
  }
}

watch(targetBiz, loadModuleOptions)
onMounted(() => {
  const ip = route.query.ip
  if (ip) keyword.value = String(ip)
  load()
})
</script>

<style scoped>
.host-page { height: 100%; display: flex; flex-direction: column; background: #fff; }
.page-title {
  font-size: 16px; color: #313238; font-weight: 400;
  padding: 0 20px; height: 50px; line-height: 50px;
  border-bottom: 1px solid #E7E9EF; margin: 0;
}
.host-body { flex: 1; display: flex; overflow: hidden; }
.group-col {
  width: 240px; flex: 0 0 240px;
  border-right: 1px solid #E7E9EF;
  padding: 12px; overflow: auto;
}
.group-tabs { display: flex; border-bottom: 1px solid #E7E9EF; }
.group-tab {
  flex: 1; text-align: center; padding: 6px 0; font-size: 12px;
  color: #63656E; cursor: pointer; border-bottom: 2px solid transparent;
}
.group-tab.active { color: #3A84FF; border-bottom-color: #3A84FF; }
.group-list { margin-top: 4px; }
.group-item {
  display: flex; align-items: center; gap: 8px;
  height: 32px; padding: 0 8px; font-size: 12px;
  color: #63656E; cursor: pointer; border-radius: 2px;
}
.group-item:hover { background: #F6F6F9; }
.group-item.active { background: #E1ECFF; color: #3A84FF; }
.g-icon { display: flex; }
.g-name { flex: 1; }
.g-count { color: #979BA5; }
.main-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 0 16px 12px; }
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.toolbar .spacer { flex: 1; }
.refresh-time { color: #979BA5; font-size: 12px; margin: 0 4px; }
.table-footer {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0 0; font-size: 12px; color: #63656E;
}
.table-footer .spacer { flex: 1; }
</style>
