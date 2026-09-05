<template>
  <div class="page-card">
    <div class="table-toolbar">
      <el-select v-model="bizId" placeholder="选择业务" filterable style="width: 260px" @change="load">
        <el-option v-for="b in bizList" :key="b.bk_biz_id" :label="b.bk_biz_name" :value="b.bk_biz_id" />
      </el-select>
      <div class="spacer" />
      <el-button :icon="'Refresh'" :disabled="!bizId" @click="load">刷新</el-button>
      <el-button type="primary" :icon="'Plus'" :disabled="!bizId" @click="openCreate">创建服务实例</el-button>
    </div>

    <template v-if="bizId">
      <el-table :data="rows" v-loading="loading" stripe>
        <el-table-column prop="id" label="实例 ID" width="100" />
        <el-table-column prop="name" label="服务实例名称" min-width="220" show-overflow-tooltip />
        <el-table-column label="主机" width="150">
          <template #default="{ row }">{{ row.bk_host_innerip || row.host?.bk_host_innerip || '-' }}</template>
        </el-table-column>
        <el-table-column label="进程数" width="100">
          <template #default="{ row }">
            <el-button link type="primary" @click="showProcesses(row)">{{ row.process_count ?? '查看' }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openClone(row)">克隆</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        style="margin-top: 16px; justify-content: flex-end"
        @current-change="load"
      />
      <el-empty v-if="!loading && rows.length === 0" description="该业务暂无服务实例(需先将主机转移到模块并创建)" :image-size="80" />
    </template>
    <el-empty v-else description="请先选择业务" />

    <!-- 创建服务实例 -->
    <el-dialog v-model="createDialog" title="创建服务实例" width="560px">
      <el-form label-width="90px">
        <el-form-item label="目标模块" required>
          <el-cascader
            v-model="createModulePath"
            :options="moduleOptions"
            :props="{ value: 'value', label: 'label', children: 'children', emitPath: false }"
            placeholder="选择集群 / 模块"
            style="width: 100%"
            @change="loadNoInstHosts"
          />
        </el-form-item>
        <el-form-item label="选择主机">
          <el-select v-model="createHostIds" multiple filterable style="width: 100%" placeholder="选择一台或多台主机">
            <el-option v-for="h in noInstHosts" :key="h.bk_host_id" :label="h.bk_host_innerip || `主机 ${h.bk_host_id}`" :value="h.bk_host_id" />
          </el-select>
          <div class="hint" v-if="createModulePath && noInstHosts.length === 0">该模块下没有未绑定服务实例的主机(可先在主机详情页把主机转移到该模块)</div>
        </el-form-item>
        <el-form-item label="实例名称">
          <el-input v-model="createName" placeholder="留空则自动生成(主机 IP)" />
        </el-form-item>
        <el-form-item label="进程名称" required>
          <el-input v-model="createProc.bk_func_name" placeholder="如 java / nginx(创建实例必须带一个进程)" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input v-model="createProc.port" placeholder="如 8080,可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" :disabled="createHostIds.length === 0" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="procDrawer" :title="`「${procInstName}」进程实例`" size="55%">
      <div class="table-toolbar">
        <div class="spacer" />
        <el-button :icon="'Plus'" type="primary" size="small" @click="openAddProcess">新增进程</el-button>
      </div>
      <el-table :data="processes" v-loading="procLoading" size="default">
        <el-table-column label="进程名称" min-width="130">
          <template #default="{ row }">{{ row.property?.bk_func_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="监听 IP" width="130">
          <template #default="{ row }">{{ row.property?.bk_bind_ip || '-' }}</template>
        </el-table-column>
        <el-table-column label="端口" width="110">
          <template #default="{ row }">{{ row.property?.port || '-' }}</template>
        </el-table-column>
        <el-table-column label="启动用户" width="110">
          <template #default="{ row }">{{ row.property?.user || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEditProcess(row)">编辑</el-button>
            <el-button link type="danger" @click="removeProcess(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!procLoading && processes.length === 0" description="该服务实例暂无进程,可点击右上角「新增进程」" :image-size="80" />
    </el-drawer>

    <!-- 进程实例新增/编辑(共享表单) -->
    <ProcessFormDialog
      :visible="procFormVisible"
      :title="procEditing ? '编辑进程' : '新增进程'"
      mode="instance"
      :form="procForm"
      :saving="procSaving"
      @update:visible="procFormVisible = $event"
      @save="saveProcess"
    />

    <!-- 克隆服务实例 -->
    <el-dialog v-model="cloneDialog" title="克隆服务实例" width="560px">
      <el-alert type="info" :closable="false" style="margin-bottom: 14px"
        :title="`将把「${cloneSource?.name}」的进程配置复制到目标模块的其他主机上`" />
      <el-form label-width="90px">
        <el-form-item label="目标模块">
          <el-cascader
            v-model="cloneModulePath"
            :options="moduleOptions"
            :props="{ value: 'value', label: 'label', children: 'children', emitPath: false }"
            style="width: 100%"
            @change="loadCloneHosts"
          />
        </el-form-item>
        <el-form-item label="目标主机" required>
          <el-select v-model="cloneHostId" filterable style="width: 100%" placeholder="选择一台主机">
            <el-option v-for="h in cloneHosts" :key="h.bk_host_id" :label="h.bk_host_innerip || `主机 ${h.bk_host_id}`" :value="h.bk_host_id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cloneDialog = false">取消</el-button>
        <el-button type="primary" :loading="cloning" :disabled="!cloneHostId || !cloneModulePath" @click="submitClone">克隆</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ProcessFormDialog from '../../components/ProcessFormDialog.vue'
import {
  searchBusiness, searchServiceInstances, deleteServiceInstances, searchProcessInstances,
  listHostsWithNoSvcInst, createServiceInstance, createProcessInstance,
  getBizTopoTree, getBizInternalTopo, listBizHosts, http
} from '../../api/cmdb'

const bizId = ref(null)
const bizList = ref([])
const rows = ref([])
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)

const procDrawer = ref(false)
const procInstName = ref('')
const procInstId = ref(null)
const procLoading = ref(false)
const processes = ref([])

// ---------- 创建服务实例 ----------
const createDialog = ref(false)
const creating = ref(false)
const createModulePath = ref(null)
const createHostIds = ref([])
const createName = ref('')
const noInstHosts = ref([])
const moduleOptions = ref([])
const createProc = ref({ bk_func_name: '', port: '' })

async function loadModuleOptions() {
  const [mainTree, idleTopo] = await Promise.allSettled([getBizTopoTree(bizId.value), getBizInternalTopo(bizId.value)])
  const mapSet = (node) => ({
    value: node.bk_inst_id,
    label: node.bk_inst_name,
    children: (node.child || [])
      .filter((c) => c.bk_obj_id === 'module' || c.child)
      .map((c) => (c.bk_obj_id === 'module'
        ? { value: c.bk_inst_id, label: c.bk_inst_name }
        : mapSet(c)))
  })
  const options = []
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

function openCreate() {
  createModulePath.value = null
  createHostIds.value = []
  createName.value = ''
  createProc.value = { bk_func_name: '', port: '' }
  noInstHosts.value = []
  createDialog.value = true
  loadModuleOptions()
}

async function loadNoInstHosts() {
  createHostIds.value = []
  noInstHosts.value = []
  if (!createModulePath.value) return
  const data = await listHostsWithNoSvcInst(bizId.value, createModulePath.value)
  const ids = data?.bk_host_ids || []
  if (ids.length > 0) {
    const hostData = await listBizHosts(bizId.value, { start: 0, limit: 500 })
    const all = hostData?.info?.map((h) => h.host || h) || []
    noInstHosts.value = all.filter((h) => ids.includes(h.bk_host_id))
  }
}

async function submitCreate() {
  if (!createProc.value.bk_func_name) {
    ElMessage.warning('请输入进程名称(CMDB 要求服务实例至少绑定一个进程)')
    return
  }
  creating.value = true
  try {
    await createServiceInstance(
      bizId.value,
      createModulePath.value,
      createHostIds.value.map((hid) => ({
        bk_host_id: hid,
        service_instance_name: createName.value || '',
        processes: [{
          process_info: {
            bk_process_name: createProc.value.bk_func_name,
            bk_func_name: createProc.value.bk_func_name,
            port: createProc.value.port || '',
            user: 'root',
            work_path: '/tmp',
            bk_bind_ip: '127.0.0.1'
          }
        }]
      }))
    )
    ElMessage.success('服务实例已创建')
    createDialog.value = false
    load()
  } finally {
    creating.value = false
  }
}

// ---------- 新增/编辑进程实例 ----------
const procFormVisible = ref(false)
const procSaving = ref(false)
const procEditing = ref(null)
const procForm = ref({})

function openAddProcess() {
  procEditing.value = null
  procForm.value = { bk_func_name: '', bk_process_name: '', bk_bind_ip: '127.0.0.1', port: '', user: 'root', work_path: '/tmp', start_cmd: '', stop_cmd: '', description: '' }
  procFormVisible.value = true
}

function openEditProcess(row) {
  procEditing.value = row
  procForm.value = {
    bk_process_id: row.property?.bk_process_id,
    bk_func_name: row.property?.bk_func_name || '',
    bk_process_name: row.property?.bk_process_name || '',
    bk_bind_ip: row.property?.bk_bind_ip || '127.0.0.1',
    port: row.property?.port || '',
    user: row.property?.user || 'root',
    work_path: row.property?.work_path || '/tmp',
    start_cmd: row.property?.start_cmd || '',
    stop_cmd: row.property?.stop_cmd || '',
    description: row.property?.description || ''
  }
  procFormVisible.value = true
}

async function saveProcess() {
  if (!procForm.value.bk_func_name) {
    ElMessage.warning('请输入进程名称')
    return
  }
  procSaving.value = true
  try {
    const info = { ...procForm.value }
    if (info.port) info.port = String(info.port)
    if (procEditing.value) {
      const pid = info.bk_process_id
      delete info.bk_process_id
      await http.post('/update/proc/process_instance/by_ids', {
        bk_biz_id: bizId.value,
        process_ids: [pid],
        update_data: info
      })
      ElMessage.success('进程已更新')
    } else {
      delete info.bk_process_id
      await createProcessInstance(bizId.value, procInstId.value, info)
      ElMessage.success('进程已创建')
    }
    procFormVisible.value = false
    const data = await searchProcessInstances(bizId.value, procInstId.value, { start: 0, limit: 100 })
    processes.value = data?.info || data || []
  } finally {
    procSaving.value = false
  }
}

async function removeProcess(row) {
  const pid = row.property?.bk_process_id
  await ElMessageBox.confirm(`确定删除进程「${row.property?.bk_func_name || pid}」?`, '删除确认', { type: 'warning' })
  await http.delete('/delete/proc/process_instance', {
    bk_biz_id: bizId.value,
    process_instance_ids: [pid]
  })
  ElMessage.success('已删除')
  const data = await searchProcessInstances(bizId.value, procInstId.value, { start: 0, limit: 100 })
  processes.value = data?.info || data || []
}

// ---------- 克隆服务实例 ----------
const cloneDialog = ref(false)
const cloning = ref(false)
const cloneSource = ref(null)
const cloneModulePath = ref(null)
const cloneHostId = ref(null)
const cloneHosts = ref([])
const cloneSourceProcesses = ref([])

async function openClone(row) {
  cloneSource.value = row
  cloneModulePath.value = row.bk_module_id ?? null
  cloneHostId.value = null
  cloneHosts.value = []
  cloneDialog.value = true
  await loadModuleOptions()
  // 拉取源实例的进程配置
  const data = await searchProcessInstances(bizId.value, row.id, { start: 0, limit: 100 })
  cloneSourceProcesses.value = ((data?.info || data || [])).map((p) => p.property || {})
  if (row.bk_module_id) loadCloneHosts()
}

async function loadCloneHosts() {
  cloneHostId.value = null
  cloneHosts.value = []
  if (!cloneModulePath.value) return
  const data = await listHostsWithNoSvcInst(bizId.value, cloneModulePath.value)
  const ids = data?.bk_host_ids || []
  if (ids.length > 0) {
    const hostData = await listBizHosts(bizId.value, { start: 0, limit: 500 })
    const all = hostData?.info?.map((h) => h.host || h) || []
    cloneHosts.value = all.filter((h) => ids.includes(h.bk_host_id))
  }
}

async function submitClone() {
  cloning.value = true
  try {
    await createServiceInstance(bizId.value, cloneModulePath.value, [{
      bk_host_id: cloneHostId.value,
      service_instance_name: `${cloneSource.value.name || cloneSource.value.id}-clone`,
      processes: cloneSourceProcesses.value.map((p) => ({
        process_info: {
          bk_process_name: p.bk_process_name || p.bk_func_name || '',
          bk_func_name: p.bk_func_name || '',
          bk_bind_ip: p.bk_bind_ip || '127.0.0.1',
          port: p.port || '',
          user: p.user || 'root',
          work_path: p.work_path || '/tmp',
          start_cmd: p.start_cmd || '',
          stop_cmd: p.stop_cmd || '',
          description: p.description || ''
        }
      }))
    }])
    ElMessage.success('克隆成功')
    cloneDialog.value = false
    load()
  } finally {
    cloning.value = false
  }
}

async function load() {
  if (!bizId.value) return
  loading.value = true
  try {
    const data = await searchServiceInstances(bizId.value, {
      start: (page.value - 1) * pageSize, limit: pageSize
    })
    rows.value = data?.info || []
    total.value = data?.count || 0
  } finally {
    loading.value = false
  }
}

async function showProcesses(row) {
  procInstName.value = row.name || `实例 ${row.id}`
  procInstId.value = row.id
  procDrawer.value = true
  procLoading.value = true
  try {
    const data = await searchProcessInstances(bizId.value, row.id, { start: 0, limit: 100 })
    processes.value = data?.info || []
  } finally {
    procLoading.value = false
  }
}
async function remove(row) {
  await ElMessageBox.confirm(`确定删除服务实例「${row.name || row.id}」?`, '删除确认', { type: 'warning' })
  await deleteServiceInstances(bizId.value, [row.id])
  ElMessage.success('已删除')
  load()
}

onMounted(async () => {
  const data = await searchBusiness({ start: 0, limit: 200 })
  bizList.value = data?.info || []
  if (bizList.value.length > 0) {
    bizId.value = bizList.value[0].bk_biz_id
    load()
  }
})
</script>
