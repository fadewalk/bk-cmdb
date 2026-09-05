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
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
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
        <el-button :icon="'Plus'" type="primary" size="small" @click="procFormVisible = true">新增进程</el-button>
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
        <el-table-column label="工作路径" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.property?.work_path || '-' }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!procLoading && processes.length === 0" description="该服务实例暂无进程,可点击右上角「新增进程」" :image-size="80" />

      <el-dialog v-model="procFormVisible" title="新增进程" width="480px" append-to-body>
        <el-form label-width="90px">
          <el-form-item label="进程名称" required>
            <el-input v-model="procForm.bk_process_name" placeholder="如 java / nginx" />
          </el-form-item>
          <el-form-item label="监听 IP">
            <el-input v-model="procForm.bk_bind_ip" />
          </el-form-item>
          <el-form-item label="端口">
            <el-input v-model="procForm.port" placeholder="如 8080,多个用逗号分隔" />
          </el-form-item>
          <el-form-item label="启动用户">
            <el-input v-model="procForm.user" />
          </el-form-item>
          <el-form-item label="工作路径">
            <el-input v-model="procForm.work_path" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="procFormVisible = false">取消</el-button>
          <el-button type="primary" @click="addProcess">创建</el-button>
        </template>
      </el-dialog>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
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

// ---------- 新增进程实例 ----------
const procFormVisible = ref(false)
const procForm = ref({ bk_process_name: '', bk_bind_ip: '127.0.0.1', port: '', user: 'root', work_path: '/tmp' })

async function addProcess() {
  if (!procForm.value.bk_process_name) {
    ElMessage.warning('请输入进程名称')
    return
  }
  const info = { ...procForm.value, bk_func_name: procForm.value.bk_process_name }
  if (info.port) info.port = String(info.port)
  await createProcessInstance(bizId.value, procInstId.value, info)
  ElMessage.success('进程已创建')
  procFormVisible.value = false
  const data = await searchProcessInstances(bizId.value, procInstId.value, { start: 0, limit: 100 })
  processes.value = data?.info || data || []
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
