<template>
  <div class="res-index">
    <h1 class="page-title">资源目录</h1>
    <h1 class="page-title">资源目录</h1>
    <div class="res-body">
      <!-- 左:资源分类树(对齐旧版:分组 + 计数) -->
      <div class="tree-col">
        <el-input v-model="keyword" placeholder="请输入关键字" size="small" clearable style="margin-bottom: 10px" />
        <div v-for="group in groups" :key="group.name" class="res-group">
          <h4 class="group-name">{{ group.name }}</h4>
          <div
            v-for="item in group.items" :key="item.id"
            :class="['res-item', { active: activeType === item.id }]"
            @click="selectType(item)"
          >
            <el-icon class="res-icon"><component :is="item.icon || 'Files'" /></el-icon>
            <span class="res-name">{{ item.name }}</span>
            <span class="res-count">{{ item.count }}</span>
          </div>
        </div>
      </div>

      <!-- 右:选中类型的资源列表 -->
      <div class="main-col">
        <div class="toolbar">
          <span class="col-title">{{ activeName }}</span>
          <div class="spacer" />
          <el-button size="small" :icon="'Refresh'" @click="load">刷新</el-button>
        </div>

        <!-- 主机 -->
        <el-table v-if="activeType === 'host'" :data="hosts" v-loading="loading" size="small">
          <el-table-column label="内网IPv4" min-width="130">
            <template #default="{ row }">
              <el-link type="primary" :underline="false" @click="$router.push({ path: '/host-detail', query: { id: row.bk_host_id } })">
                {{ row.bk_host_innerip || '--' }}
              </el-link>
            </template>
          </el-table-column>
          <el-table-column label="主机名称" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ row.bk_host_name || '--' }}</template>
          </el-table-column>
          <el-table-column label="管控区域" width="130">
            <template #default="{ row }">{{ row.bk_cloud_id === 0 ? 'Default Area[0]' : (row.bk_cloud_id ?? '--') }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="activeType === 'host' && !loading && hosts.length === 0" description="暂无主机" :image-size="60" />

        <!-- 业务 -->
        <el-table v-if="activeType === 'biz'" :data="bizList" v-loading="loading" size="small">
          <el-table-column prop="bk_biz_id" label="业务 ID" width="110" />
          <el-table-column prop="bk_biz_name" label="业务名称" min-width="200" />
        </el-table>

        <!-- 其他模型:暂无实例时显示空态 -->
        <el-empty v-if="!['host', 'biz'].includes(activeType)" :description="`「${activeName}」暂无实例(可在模型管理中维护)`" :image-size="70" />
      </div>
    </div>
  </div>
</template>

<script setup>
// 资源目录:左分类树(带实例计数)+ 右侧列表,对齐旧版 resource/index
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  listHostsWithoutApp, searchBusiness, getModelStatistics,
  searchCloudAreas, searchCloudAccounts
} from '../../api/cmdb'
import { useBizStore } from '../../stores/biz'

const router = useRouter()
const bizStore = useBizStore()
const keyword = ref('')
const loading = ref(false)
const activeType = ref('host')
const activeName = ref('主机')
const hosts = ref([])
const bizList = ref([])
const modelCounts = ref({})

// 路由别名 → ui-v3 实际菜单路径
const routeMap = {
  host: '/resource/host',
  biz: '/business/topo',
  'biz-set': '/business/topo',
  'bk_switch': '/resource/host',
  'bk_router': '/resource/host',
  'bk_load_balance': '/resource/host',
  'bk_firewall': '/resource/host'
}

const groups = computed(() => {
  const hostCount = modelCounts.value.host ?? 0
  const bizCount = bizList.value.length
  const areaCount = modelCounts.value['bk_cloud_area'] || 0
  const acctCount = modelCounts.value['bk_cloud_account'] || 0
  return [
    { name: '主机管理', items: [
      { id: 'host', name: '主机', count: hostCount, icon: 'Monitor' }
    ]},
    {
      name: '组织架构',
      items: [
        { id: 'biz', name: '业务', count: bizCount, icon: 'OfficeBuilding' },
        { id: 'biz-set', name: '业务集', count: 0, icon: 'Files' },
        { id: 'project', name: '项目', count: 0, icon: 'Folder' }
      ]
    },
    {
      name: '网络',
      items: ['bk_switch:交换机', 'bk_router:路由器', 'bk_load_balance:负载均衡', 'bk_firewall:防火墙'].map((s) => {
        const [id, name] = s.split(':')
        return { id, name, count: modelCounts.value[id] || 0, icon: 'Connection' }
      })
    },
    {
      name: '云资源',
      items: [
        { id: 'cloud-area', name: '管控区域', count: areaCount, icon: 'CirclePlus', route: '/resource/cloud-area' },
        { id: 'cloud-account', name: '云账户', count: acctCount, icon: 'User', route: '/resource/cloud-account' },
        { id: 'cloud-discover', name: '云资源发现', count: 0, icon: 'View', route: '/resource/cloud-discover' }
      ]
    }
  ]
})

const flatItems = computed(() => groups.value.flatMap((g) => g.items))

function selectType(item) {
  activeType.value = item.id
  activeName.value = item.name
  // 联动到独立页:管控区域 / 云账户 / 资源池主机
  if (item.route) {
    router.push(item.route)
    return
  }
  // 通用分类页面:跳到 /resource/catalog/{objId}
  if (item.id !== 'host' && item.id !== 'biz') {
    router.push(`/resource/catalog/${item.id}`)
    return
  }
  // host / biz 维持内嵌切换
  if (item.id === 'host') loadHosts()
  if (item.id === 'biz') loadBiz()
}

async function loadHosts() {
  loading.value = true
  try {
    const data = await listHostsWithoutApp({ start: 0, limit: 500, sort: 'bk_host_id' })
    hosts.value = (data?.info || []).map((h) => h.host || h)
  } finally {
    loading.value = false
  }
}

async function loadBiz() {
  loading.value = true
  try {
    const data = await searchBusiness({ start: 0, limit: 200 })
    bizList.value = data?.info || []
  } finally {
    loading.value = false
  }
}

async function load() {
  loading.value = true
  try {
    await Promise.allSettled([loadHosts(), loadBiz(), loadModelCounts(), loadCloudCounts()])
  } finally {
    loading.value = false
  }
}

async function loadCloudCounts() {
  const [a, acc] = await Promise.allSettled([
    searchCloudAreas({ start: 0, limit: 1000 }),
    searchCloudAccounts({ start: 0, limit: 1000 })
  ])
  const next = { ...modelCounts.value }
  if (a.status === 'fulfilled') next['bk_cloud_area'] = (a.value?.info || []).length
  if (acc.status === 'fulfilled') next['bk_cloud_account'] = (acc.value?.info || []).length
  modelCounts.value = next
}

async function loadModelCounts() {
  try {
    const stats = await getModelStatistics()
    const map = {}
    for (const s of stats || []) map[s.bk_obj_id] = s.instance_count
    modelCounts.value = map
  } catch (e) { /* 忽略 */ }
}

onMounted(async () => {
  await bizStore.ensureLoaded()
  load()
})
</script>

<style scoped>
.res-index { height: 100%; display: flex; flex-direction: column; background: #fff; }
.page-title {
  font-size: 16px; color: #313238; font-weight: 400;
  padding: 0 20px; height: 50px; line-height: 50px;
  border-bottom: 1px solid #E7E9EF; margin: 0;
}
.res-body { flex: 1; display: flex; overflow: hidden; }
.tree-col {
  width: 260px; flex: 0 0 260px;
  border-right: 1px solid #E7E9EF;
  padding: 12px; overflow: auto;
}
.group-name {
  margin: 10px 0 4px; font-size: 13px; color: #313238; font-weight: 600;
}
.res-item {
  display: flex; align-items: center; gap: 8px;
  height: 32px; padding: 0 8px; font-size: 12px;
  color: #63656E; cursor: pointer; border-radius: 2px;
}
.res-item:hover { background: #F6F6F9; }
.res-item.active { background: #E1ECFF; color: #3A84FF; }
.res-icon { display: flex; }
.res-name { flex: 1; }
.res-count { color: #979BA5; }
.main-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 0 16px 12px; }
.toolbar { display: flex; align-items: center; margin-bottom: 10px; }
.toolbar .spacer { flex: 1; }
.col-title { font-size: 14px; font-weight: 600; color: #313238; }
</style>
