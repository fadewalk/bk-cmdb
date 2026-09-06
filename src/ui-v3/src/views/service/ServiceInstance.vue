<template>
  <div class="page-card">
    <div class="table-toolbar">
      <el-select v-model="bizId" placeholder="选择业务" filterable style="width: 260px" :disabled="!bizStore.bizId" @change="load">
        <el-option v-for="b in bizStore.bizList" :key="b.bk_biz_id" :label="b.bk_biz_name" :value="b.bk_biz_id" />
      </el-select>
      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="load">刷新</el-button>
      <el-button type="primary" :icon="'Plus'" :disabled="!bizId" @click="goCreate">新建服务实例</el-button>
    </div>

    <template v-if="bizId">
      <el-table :data="rows" v-loading="loading" stripe>
        <el-table-column prop="id" label="实例 ID" width="100" />
        <el-table-column prop="name" label="服务实例名称" min-width="220" show-overflow-tooltip />
        <el-table-column label="所属模块" min-width="140">
          <template #default="{ row }">
            {{ row.bk_module_name || row.module?.bk_module_name || row.bk_module_id || '--' }}
          </template>
        </el-table-column>
        <el-table-column label="服务模板" min-width="100">
          <template #default="{ row }">
            <span v-if="row.service_template_id">{{ row.service_template_id }}</span>
            <span v-else>--</span>
          </template>
        </el-table-column>
        <el-table-column label="主机" min-width="140">
          <template #default="{ row }">{{ row.bk_host_innerip || row.host?.bk_host_innerip || row.bk_host_id || '--' }}</template>
        </el-table-column>
        <el-table-column label="进程数" width="100">
          <template #default="{ row }">
            <el-button link type="primary" @click="showProcesses(row)">{{ row.process_count ?? '查看' }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="创建人" width="100">
          <template #default="{ row }">{{ row.bk_created_by || row.creator || '--' }}</template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">{{ (row.bk_created_at || row.create_time || '').replace('T', ' ').slice(0, 16) || '--' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
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
    <el-drawer v-model="procDrawer" :title="`「${procInstName}」进程实例`" size="55%">
      <el-tabs v-model="procTab">
        <el-tab-pane label="进程列表" name="proc">
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
                <el-button link type="danger" size="small" @click="removeProcess(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!procLoading && processes.length === 0" description="该实例暂无进程" :image-size="60" />
        </el-tab-pane>
        <el-tab-pane :label="`标签 (${labels.length})`" name="label">
          <div class="table-toolbar">
            <div class="spacer" />
            <el-button :icon="'Plus'" type="primary" size="small" @click="openAddLabel">新增标签</el-button>
          </div>
          <el-table :data="labels" v-loading="labelLoading" size="default">
            <el-table-column prop="key" label="键" min-width="160" />
            <el-table-column prop="value" label="值" min-width="200" show-overflow-tooltip />
            <el-table-column prop="creator" label="创建人" width="140" />
            <el-table-column prop="create_time" label="创建时间" min-width="160" />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button link type="danger" size="small" @click="removeLabel(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!labelLoading && labels.length === 0" description="该实例暂无标签" :image-size="60" />
        </el-tab-pane>
      </el-tabs>
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

    <!-- 新增标签 -->
    <el-dialog v-model="labelFormVisible" title="新增标签" width="420px">
      <el-form label-width="80px">
        <el-form-item label="键" required><el-input v-model="labelForm.key" placeholder="如 env" /></el-form-item>
        <el-form-item label="值" required><el-input v-model="labelForm.value" placeholder="如 prod" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="labelFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="submitLabel">保存</el-button>
      </template>
    </el-dialog>

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
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import ProcessFormDialog from '../../components/ProcessFormDialog.vue'
import {
  searchBusiness, searchServiceInstances, deleteServiceInstances, searchProcessInstances,
  listHostsWithNoSvcInst, createProcessInstance,
  listInstanceLabels, createInstanceLabels, deleteInstanceLabels,
  getBizTopoTree, getBizInternalTopo, http
} from '../../api/cmdb'
import { useBizStore } from '../../stores/biz'

const router = useRouter()
const bizStore = useBizStore()
const bizId = ref(bizStore.bizId || null)
const bizList = ref([])
const rows = ref([])
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)

const procDrawer = ref(false)
const procTab = ref('proc')
const procInstName = ref('')
const procInstId = ref(null)
const procLoading = ref(false)
const processes = ref([])

// 实例标签
const labels = ref([])
const labelLoading = ref(false)
const labelFormVisible = ref(false)
const labelForm = ref({ key: '', value: '' })

// ---------- 创建服务实例(已移至业务拓扑向导) ----------
const moduleOptions = ref([])

async function loadProcesses(id) {
  procLoading.value = true
  try {
    const data = await searchProcessInstances(id, { start: 0, limit: 100 })
    processes.value = data?.info || []
  } finally { procLoading.value = false }
}

async function loadModuleOptions() {
  const id = bizStore.bizId || bizId.value
  if (!id) { moduleOptions.value = []; return }
  const [mainTree, idleTopo] = await Promise.allSettled([getBizTopoTree(id), getBizInternalTopo(id)])
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

function goCreate() {
  router.push({ path: '/business/topo', query: { action: 'new-svc-instance' } })
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
      await createProcessInstance(procInstId.value, info)
      ElMessage.success('进程已创建')
    }
    procFormVisible.value = false
    const data = await searchProcessInstances(procInstId.value, { start: 0, limit: 100 })
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
  const data = await searchProcessInstances(procInstId.value, { start: 0, limit: 100 })
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
  const data = await searchProcessInstances(row.id, { start: 0, limit: 100 })
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
  procTab.value = 'proc'
  procInstName.value = row.name || `实例 ${row.id}`
  procInstId.value = row.id
  procDrawer.value = true
  loadProcesses(row.id)
  loadLabels(row.id)
}

async function loadLabels(id) {
  labelLoading.value = true
  try {
    const data = await listInstanceLabels({ bk_biz_id: bizId.value, service_instance_id: id })
    const list = (data?.info || data?.data || []).map((l) => ({
      key: l.key, value: l.value, creator: l.creator, create_time: l.create_time, id: l.id
    }))
    labels.value = list
  } catch (e) { labels.value = [] }
  finally { labelLoading.value = false }
}

function openAddLabel() {
  labelForm.value = { key: '', value: '' }
  labelFormVisible.value = true
}

async function submitLabel() {
  if (!labelForm.value.key || !labelForm.value.value) {
    ElMessage.warning('请输入键和值')
    return
  }
  try {
    await createInstanceLabels({
      bk_biz_id: bizId.value,
      labels: [{ service_instance_id: procInstId.value, key: labelForm.value.key, value: labelForm.value.value }]
    })
    ElMessage.success('已新增')
    labelFormVisible.value = false
    loadLabels(procInstId.value)
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  }
}

async function removeLabel(row) {
  await ElMessageBox.confirm(`确定删除标签 ${row.key} = ${row.value}?`, '删除', { type: 'warning' })
  try {
    await deleteInstanceLabels({
      bk_biz_id: bizId.value,
      service_instance_ids: [procInstId.value],
      keys: [row.key]
    })
    ElMessage.success('已删除')
    loadLabels(procInstId.value)
  } catch (e) { ElMessage.error('删除失败: ' + (e?.message || '后端异常')) }
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
