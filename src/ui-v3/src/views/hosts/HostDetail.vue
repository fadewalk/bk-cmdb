<template>
  <div class="page-card" v-loading="loading">
    <el-page-header @back="$router.back()" style="margin-bottom: 16px">
      <template #content>主机详情 · {{ host?.bk_host_innerip || hostId }}</template>
    </el-page-header>

    <template v-if="host">
      <el-tabs v-model="tab" class="detail-tabs">
        <el-tab-pane label="主机属性" name="property" />
        <el-tab-pane :label="`服务实例 (${svcInstances.length})`" name="service" />
        <el-tab-pane :label="`关联实例 (${assocCount})`" name="association" />
        <el-tab-pane label="主机转移" name="transfer" />
      </el-tabs>

      <!-- 1. 主机属性(只读 + 编辑入口) -->
      <template v-if="tab === 'property'">
        <div class="toolbar">
          <el-button v-if="!editing" type="primary" size="small" @click="enterEdit">编辑属性</el-button>
          <template v-else>
            <el-button size="small" @click="cancelEdit">取消</el-button>
            <el-button size="small" type="primary" :loading="saving" @click="saveEdit">保存</el-button>
          </template>
        </div>
        <el-card v-if="!editing" shadow="never">
          <el-descriptions :column="2" border size="small" class="attrs">
            <el-descriptions-item v-for="(v, k) in hostAttrs" :key="k" :label="String(k)">
              {{ v === null || v === '' ? '-' : v }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
        <el-card v-else shadow="never">
          <el-form label-width="140px" class="edit-form">
            <el-row :gutter="12">
              <el-col v-for="f in editableAttrs" :key="f.id" :span="12">
                <el-form-item :label="f.bk_property_name || f.bk_property_id">
                  <el-input v-model="editMap[f.bk_property_id]" :placeholder="String(f.placeholder || '')" />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </el-card>
      </template>

      <!-- 2. 服务实例列表 -->
      <template v-if="tab === 'service'">
        <div class="toolbar">
          <el-button type="primary" size="small" @click="goToTopologyForAdd">前往业务拓扑新建服务实例</el-button>
          <el-input v-model="svcKeyword" placeholder="搜索实例名" size="small" clearable style="width: 240px" />
        </div>
        <el-table :data="filteredSvcInstances" v-loading="svcLoading" stripe size="default">
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column prop="name" label="实例名称" min-width="220" show-overflow-tooltip />
          <el-table-column label="所属模块" min-width="160">
            <template #default="{ row }">{{ row.bk_module_name || row.module?.bk_module_name || row.bk_module_id || '--' }}</template>
          </el-table-column>
          <el-table-column label="进程数" width="100">
            <template #default="{ row }">{{ row.process_count ?? row.proc_count ?? '--' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openSvcProcesses(row)">查看进程</el-button>
              <el-button link type="danger" size="small" @click="removeSvc(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!svcLoading && svcInstances.length === 0" description="该主机未关联服务实例" :image-size="80" />
      </template>

      <!-- 3. 关联实例(按模型分组) -->
      <template v-if="tab === 'association'">
        <el-card v-for="g in assocGroups" :key="g.objId" shadow="never" style="margin-bottom: 12px">
          <template #header>
            <div class="card-head">
              <span>{{ g.objName }} ({{ g.items.length }})</span>
              <span class="hint">{{ g.objId }}</span>
            </div>
          </template>
          <el-table :data="g.items" v-loading="assocLoading" size="small" stripe>
            <el-table-column v-for="col in g.cols" :key="col" :prop="col" :label="col" min-width="160" show-overflow-tooltip />
          </el-table>
          <el-empty v-if="!assocLoading && g.items.length === 0" :description="`无 ${g.objName} 关联`" :image-size="60" />
        </el-card>
        <el-empty v-if="!assocLoading && assocGroups.length === 0" description="无关联实例" :image-size="80" />
      </template>

      <!-- 4. 主机转移 -->
      <template v-if="tab === 'transfer'">
        <el-card shadow="never" style="max-width: 640px">
          <el-form label-width="100px">
            <el-form-item label="当前归属">
              <el-tag v-if="bizId" size="small">业务 {{ bizId }}</el-tag>
              <el-tag v-else size="small" type="info">资源池</el-tag>
            </el-form-item>
            <el-form-item v-if="!bizId" label="目标业务" required>
              <el-select v-model="targetBiz" filterable style="width: 100%" placeholder="选择业务">
                <el-option v-for="b in bizList" :key="b.bk_biz_id" :label="b.bk_biz_name" :value="b.bk_biz_id" />
              </el-select>
            </el-form-item>
            <el-form-item label="目标模块" required>
              <el-cascader
                v-model="targetModulePath"
                :options="moduleOptions"
                :props="{ value: 'value', label: 'label', children: 'children', emitPath: false }"
                placeholder="选择集群 / 模块"
                style="width: 100%"
                :disabled="!bizId && !targetBiz"
              />
            </el-form-item>
            <el-form-item label="追加模式">
              <el-switch v-model="isIncrement" />
              <span class="hint">开启后主机保留原模块归属</span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="transferring" @click="doTransfer">转移到所选模块</el-button>
              <el-button v-if="bizId" :loading="transferring" @click="toResource">转移到资源池</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </template>
    </template>
    <el-empty v-else-if="!loading" description="主机不存在" />

    <!-- 服务实例进程抽屉 -->
    <el-drawer v-model="procDrawer" :title="procInstName" size="55%">
      <div class="toolbar">
        <el-button type="primary" size="small" :icon="'Plus'" @click="openAddProcess">新增进程</el-button>
      </div>
      <el-table :data="processes" v-loading="procLoading" size="default">
        <el-table-column label="进程名称" min-width="130">
          <template #default="{ row }">{{ row.property?.bk_func_name || '--' }}</template>
        </el-table-column>
        <el-table-column label="监听 IP" width="130">
          <template #default="{ row }">{{ row.property?.bk_bind_ip || '--' }}</template>
        </el-table-column>
        <el-table-column label="端口" width="110">
          <template #default="{ row }">{{ row.property?.port || '--' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" size="small" @click="removeProcess(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!procLoading && processes.length === 0" description="该实例暂无进程" :image-size="60" />
    </el-drawer>
    <ProcessFormDialog
      :visible="procFormVisible"
      title="新增进程"
      mode="instance"
      :form="procForm"
      :saving="procSaving"
      @update:visible="procFormVisible = $event"
      @save="saveProcess"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import ProcessFormDialog from '../../components/ProcessFormDialog.vue'
import {
  http, searchBusiness, searchModelAttributes, getHostInstTopo, searchHostInstAssoc, searchInstAssociations,
  getBizTopoTree, getBizInternalTopo, transferHostModule, transferHostToResource,
  searchServiceInstances, searchProcessInstances, deleteServiceInstances, createProcessInstance,
  listHostsWithoutApp
} from '../../api/cmdb'

const route = useRoute()
const router = useRouter()
const hostId = Number(route.params.id || route.query.id)
const bizId = route.params.bizId || route.params.business || route.query.biz ? Number(route.params.bizId || route.params.business || route.query.biz) : null

const tab = ref('property')
const host = ref(null)
const loading = ref(false)

const editableAttrs = ref([]) // 字段元数据
const editMap = ref({})
const editing = ref(false)
const saving = ref(false)

// 服务实例
const svcInstances = ref([])
const svcLoading = ref(false)
const svcKeyword = ref('')

const filteredSvcInstances = computed(() => {
  const kw = svcKeyword.value.toLowerCase()
  if (!kw) return svcInstances.value
  return svcInstances.value.filter((r) => (r.name || '').toLowerCase().includes(kw))
})

// 关联实例
const assocGroups = ref([])
const assocLoading = ref(false)
const assocCount = computed(() => assocGroups.value.reduce((s, g) => s + g.items.length, 0))

// 进程抽屉
const procDrawer = ref(false)
const procLoading = ref(false)
const procInstName = ref('')
const procInstId = ref(null)
const processes = ref([])
const procFormVisible = ref(false)
const procSaving = ref(false)
const procForm = ref({})

// 转移
const bizList = ref([])
const targetBiz = ref(null)
const targetModulePath = ref(null)
const isIncrement = ref(false)
const transferring = ref(false)
const moduleOptions = ref([])

const hostAttrs = computed(() => {
  if (!host.value) return {}
  const out = {}
  for (const [k, v] of Object.entries(host.value)) {
    if (v === null || typeof v !== 'object') out[k] = v
  }
  return out
})

async function loadHost() {
  loading.value = true
  try {
    const filter = { condition: 'AND', rules: [{ field: 'bk_host_id', operator: 'equal', value: hostId }] }
    // 资源池主机 / 业务主机都走 list_hosts_without_app
    const data = await listHostsWithoutApp({ start: 0, limit: 1, sort: 'bk_host_id' }, filter)
    host.value = data?.info?.[0]?.host || data?.info?.[0] || null
  } catch (e) {
    // 业务主机:走 list_hosts
    try {
      const data = bizId
        ? await http.post(`/hosts/app/${bizId}/list_hosts`, { page: { start: 0, limit: 1 }, fields: ['bk_host_id', 'bk_host_innerip', 'bk_host_name', 'bk_cloud_id', 'bk_module_id'] })
        : null
      host.value = data?.info?.[0]?.host || data?.info?.[0] || null
    } catch (e2) {
      console.error('loadHost failed:', e2)
    }
  } finally {
    loading.value = false
  }
}

async function loadSvcInstances() {
  if (!bizId) {
    svcInstances.value = []
    return
  }
  svcLoading.value = true
  try {
    const data = await searchServiceInstances(bizId, { start: 0, limit: 200 })
    // 过滤:这台主机的服务实例(后端返回的 rows 含 host 内嵌信息不直接挂 host_id,只能前端 bk_host_id 匹配)
    const all = data?.info || []
    // 尝试关联查询 host_inst_topo,只过滤与本主机相关的
    try {
      const topo = await getHostInstTopo(hostId, { bk_biz_id: bizId, page: { start: 0, limit: 200 } })
      const ids = new Set((topo?.info || []).map((x) => x.bk_inst_id || x.id))
      svcInstances.value = all.filter((r) => ids.has(r.id) || (r.bk_host_id === hostId))
    } catch (e) {
      svcInstances.value = all.filter((r) => r.bk_host_id === hostId)
    }
  } finally {
    svcLoading.value = false
  }
}

async function loadAssoc() {
  if (!bizId) {
    assocGroups.value = []
    return
  }
  assocLoading.value = true
  try {
    // 老版契约: 按 obj_id/inst_id 查询关联(src+dst 合并)
    const data = await searchInstAssociations('host', hostId).catch(() => null)
    const assoc = data?.data?.association || {}
    const instMap = data?.data?.instance || {}
    const all = []
    for (const item of [...(assoc.src || []), ...(assoc.dst || [])]) {
      const peerId = item.bk_asst_id_1 || item.asst_inst_id
      const detail = instMap[peerId] || {}
      all.push({
        ...item,
        __peer: detail.bk_host_innerip || detail.bk_inst_name || peerId
      })
    }
    const byObj = {}
    for (const it of all) {
      const objId = it.bk_obj_id
      if (objId === 'host' || objId === 'process' || objId === 'service_instance') continue
      if (!byObj[objId]) byObj[objId] = []
      byObj[objId].push(it)
    }
    const groups = []
    for (const [objId, items] of Object.entries(byObj)) {
      const cols = items[0] ? Object.keys(items[0]).filter((k) => !k.startsWith('__') && !k.startsWith('_')).slice(0, 5) : []
      groups.push({ objId, objName: objId, items: items.map((it) => ({ ...it, __peer: it.__peer || it.bk_asst_id_1 || it.asst_inst_id })), cols: ['__peer'] })
    }
    assocGroups.value = groups
  } finally {
    assocLoading.value = false
  }
}

watch(tab, (v) => {
  if (v === 'service' && bizId && svcInstances.value.length === 0 && !svcLoading.value) loadSvcInstances()
  if (v === 'association' && assocGroups.value.length === 0 && !assocLoading.value) loadAssoc()
})

async function enterEdit() {
  if (!host.value) return
  editing.value = true
  // 加载字段元数据
  const list = await searchModelAttributes('host')
  editableAttrs.value = (list || []).filter((a) => !['bk_host_id'].includes(a.bk_property_id))
  editMap.value = {}
  for (const f of editableAttrs.value) {
    editMap.value[f.bk_property_id] = host.value[f.bk_property_id] ?? ''
  }
}

function cancelEdit() {
  editing.value = false
  editMap.value = {}
}

async function saveEdit() {
  saving.value = true
  try {
    const targetBizId = bizId || host.value?.bk_biz_id || 0
    // table 路由挂在根路径,不在 /api/v3 下
    await http.post(`/table/update/instance/object/host/bk_biz_id/${targetBizId}/inst/${hostId}`, editMap.value, { baseURL: '' })
    ElMessage.success('属性已更新')
    editing.value = false
    await loadHost()
  } catch (e) {
    ElMessage.error('更新失败: ' + (e?.message || '后端异常'))
  } finally {
    saving.value = false
  }
}

function goToTopologyForAdd() {
  if (!bizId) { ElMessage.warning('资源池主机无业务模块,请先转移到业务'); return }
  router.push({ path: '/business/topo', query: { biz: bizId } })
}

async function openSvcProcesses(row) {
  procInstId.value = row.id
  procInstName.value = row.name || `实例 ${row.id}`
  procDrawer.value = true
  procLoading.value = true
  try {
    const data = await searchProcessInstances(row.id, { start: 0, limit: 100 })
    processes.value = data?.info || []
  } finally {
    procLoading.value = false
  }
}

async function removeSvc(row) {
  await ElMessageBox.confirm(`确定删除服务实例「${row.name}」?`, '删除确认', { type: 'warning' })
  await deleteServiceInstances(bizId, [row.id])
  ElMessage.success('已删除')
  await loadSvcInstances()
}

function openAddProcess() {
  procForm.value = { bk_func_name: '', bk_process_name: '', bk_bind_ip: '127.0.0.1', port: '', user: 'root', work_path: '/tmp', start_cmd: '', stop_cmd: '', description: '' }
  procFormVisible.value = true
}

async function saveProcess() {
  if (!procForm.value.bk_func_name) { ElMessage.warning('请输入进程名称'); return }
  procSaving.value = true
  try {
    const info = { ...procForm.value }
    if (info.port) info.port = String(info.port)
    await createProcessInstance(bizId, procInstId.value, info)
    ElMessage.success('进程已创建')
    procFormVisible.value = false
    const data = await searchProcessInstances(bizId, procInstId.value, { start: 0, limit: 100 })
    processes.value = data?.info || []
  } catch (e) {
    ElMessage.error('创建进程失败: ' + (e?.message || '后端异常'))
  } finally {
    procSaving.value = false
  }
}

async function removeProcess(row) {
  const pid = row.property?.bk_process_id
  if (!pid) { ElMessage.warning('缺少 process id'); return }
  await ElMessageBox.confirm('确定删除该进程?', '删除确认', { type: 'warning' })
  await http.delete('/delete/proc/process_instance', { bk_biz_id: bizId, process_instance_ids: [pid] })
  ElMessage.success('已删除')
  const data = await searchProcessInstances(bizId, procInstId.value, { start: 0, limit: 100 })
  processes.value = data?.info || []
}

// 转移
async function loadBizList() {
  const data = await searchBusiness({ start: 0, limit: 200 })
  bizList.value = data?.info || []
}
async function loadModuleOptions() {
  const id = bizId || targetBiz.value
  if (!id) return
  const options = []
  const [mainTree, idleTopo] = await Promise.allSettled([getBizTopoTree(id), getBizInternalTopo(id)])
  const mapSet = (node) => ({
    value: node.bk_inst_id, label: node.bk_inst_name,
    children: (node.child || []).filter((c) => c.bk_obj_id === 'module' || c.child).map((c) => (c.bk_obj_id === 'module'
      ? { value: c.bk_inst_id, label: c.bk_inst_name } : mapSet(c)))
  })
  if (mainTree.status === 'fulfilled' && Array.isArray(mainTree.value)) {
    for (const bizNode of mainTree.value) options.push(...(bizNode.child || []).map(mapSet))
  }
  if (idleTopo.status === 'fulfilled' && idleTopo.value?.bk_set_id) {
    const s = idleTopo.value
    options.push({ value: s.bk_set_id, label: s.bk_set_name, children: (s.module || []).map((m) => ({ value: m.bk_module_id, label: m.bk_module_name })) })
  }
  moduleOptions.value = options
}
async function doTransfer() {
  const biz = bizId || targetBiz.value
  if (!biz || !targetModulePath.value) { ElMessage.warning('请选择目标业务与模块'); return }
  transferring.value = true
  try {
    await transferHostModule(biz, [hostId], [targetModulePath.value], isIncrement.value)
    ElMessage.success('转移成功')
    await loadHost()
  } finally {
    transferring.value = false
  }
}
async function toResource() {
  transferring.value = true
  try {
    await transferHostToResource(bizId, [hostId])
    ElMessage.success('已转移到资源池')
    await loadHost()
  } finally {
    transferring.value = false
  }
}

watch(targetBiz, loadModuleOptions)

onMounted(async () => {
  loadHost()
  loadBizList()
  if (bizId) loadModuleOptions()
})
</script>

<style scoped>
.detail-tabs { margin-bottom: 16px; }
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.attrs { max-height: 60vh; overflow: auto; }
.edit-form { padding: 8px 0; }
.card-head { display: flex; align-items: center; gap: 10px; }
.hint { color: #979ba5; font-size: 12px; margin-left: 10px; }
</style>