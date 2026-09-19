<template>
  <div class="template-instance">
    <el-alert v-if="error" type="error" :closable="false" show-icon>
      {{ error }} <el-button link type="primary" @click="reload">重试</el-button>
    </el-alert>
    <div class="toolbar">
      <el-button type="primary" :disabled="!selected.length" @click="goSync(selected)">批量同步</el-button>
      <el-select v-model="statusFilter" style="width: 150px" @change="page.current = 1"><el-option v-for="item in statusFilters" :key="item.value" :label="item.label" :value="item.value" /></el-select>
      <el-input v-model="search" clearable placeholder="请输入模块名称或拓扑路径" style="width: 240px" />
      <span class="spacer" />
      <el-button @click="reload">刷新</el-button>
    </div>
    <el-table :data="pagedRows" v-loading="loading" @selection-change="(rows) => (selected = rows)">
      <el-table-column type="selection" width="48" :selectable="(row) => !isSyncDisabled(row.status)" />
      <el-table-column label="模块" min-width="150" prop="bk_module_name" />
      <el-table-column label="拓扑路径" min-width="220"><template #default="{ row }"><el-button link type="primary" @click="goTopo(row)">{{ row.topoText || '--' }}</el-button></template></el-table-column>
      <el-table-column label="主机数量" width="100" prop="host_count" />
      <el-table-column label="服务实例数" width="110" prop="service_instance_count" />
      <el-table-column label="状态" width="110"><template #default="{ row }"><span :class="['status', row.status]">{{ statusText(row.status) }}</span></template></el-table-column>
      <el-table-column label="最近同步" width="170"><template #default="{ row }">{{ row.last_time || '--' }}</template></el-table-column>
      <el-table-column label="操作" width="180"><template #default="{ row }"><el-button link type="primary" :disabled="isSyncDisabled(row.status)" @click="goSync([row])">{{ row.status === 'failure' ? '重试' : '去同步' }}</el-button><el-tooltip content="目标包含主机或由集群模板生成,不允许删除" :disabled="!isDeleteDisabled(row)"><span><el-button link type="danger" :disabled="isDeleteDisabled(row)" @click="remove(row)">删除</el-button></span></el-tooltip></template></el-table-column>
    </el-table>
    <el-empty v-if="!loading && !error && !filteredRows.length" description="该服务模板尚未绑定模块" :image-size="70" />
    <el-pagination v-model:current-page="page.current" :page-size="page.limit" :total="filteredRows.length" layout="total,prev,pager,next,sizes" :page-sizes="[10,20,50]" @size-change="(size) => { page.limit = size; page.current = 1 }" />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { listModulesByServiceTemplate, getTopoPath, getTopoNodeHostServiceInstanceCount, getServiceTemplateInstanceStatus, deleteModule } from '../../api/cmdb'

const props = defineProps({ bizId: { type: Number, required: true }, templateId: { type: Number, required: true }, active: { type: Boolean, default: false } })
const emit = defineEmits(['sync-change'])
const router = useRouter()
const loading = ref(false); const error = ref(''); const rows = ref([]); const selected = ref([]); const search = ref(''); const statusFilter = ref('all'); const page = ref({ current: 1, limit: 20 }); let timer = null
const statusFilters = [{ value: 'all', label: '全部' }, { value: 'need_sync', label: '待同步' }, { value: 'syncing', label: '同步中' }, { value: 'failure', label: '同步失败' }, { value: 'finished', label: '已同步' }]
const statusText = (status) => ({ need_sync: '待同步', new: '同步中', waiting: '同步中', executing: '同步中', failure: '同步失败', finished: '已同步' }[status] || '--')
const isSyncing = (status) => ['new', 'waiting', 'executing'].includes(status)
const isSyncDisabled = (status) => isSyncing(status) || status === 'finished'
const isDeleteDisabled = (row) => Number(row.host_count || 0) > 0 || !!row.set_template_id
const filteredRows = computed(() => rows.value.filter((row) => {
  const text = search.value.trim().toLowerCase(); const matchesText = !text || `${row.bk_module_name || ''} ${row.topoText || ''}`.toLowerCase().includes(text)
  const matchesStatus = statusFilter.value === 'all' || (statusFilter.value === 'syncing' ? isSyncing(row.status) : row.status === statusFilter.value)
  return matchesText && matchesStatus
}))
const pagedRows = computed(() => filteredRows.value.slice((page.value.current - 1) * page.value.limit, page.value.current * page.value.limit))
function topoText(path) { return [...(path || [])].reverse().map((item) => item.bk_inst_name).join(' / ') }
async function load() {
  loading.value = true; error.value = ''
  try {
    const moduleData = await listModulesByServiceTemplate(props.bizId, props.templateId, { start: 0, limit: 200 })
    const modules = moduleData?.info || []
    const ids = modules.map((item) => item.bk_module_id || item.id).filter(Boolean)
    const [topos, counts, statuses] = await Promise.all([
      ids.length ? getTopoPath(props.bizId, { topo_nodes: ids.map((id) => ({ bk_obj_id: 'module', bk_inst_id: id })) }) : { nodes: [] },
      ids.length ? getTopoNodeHostServiceInstanceCount(props.bizId, ids) : [],
      ids.length ? getServiceTemplateInstanceStatus(props.bizId, { bk_module_ids: ids, service_template_id: props.templateId }) : []
    ])
    const topoNodes = topos?.nodes || topos?.data?.nodes || []
    rows.value = modules.map((item) => {
      const id = item.bk_module_id || item.id; const topo = topoNodes.find((node) => String(node.topo_node?.bk_inst_id ?? node.bk_inst_id) === String(id)); const count = (counts || []).find((entry) => String(entry.bk_inst_id) === String(id)); const status = (statuses || []).find((entry) => String(entry.bk_inst_id) === String(id))
      return { ...item, bk_module_id: id, topoText: topoText(topo?.topo_path || topo?.path), host_count: count?.host_count ?? item.host_count ?? 0, service_instance_count: count?.service_instance_count ?? 0, status: status?.status || item.status, last_time: status?.last_time || item.last_time, fail_tips: status?.fail_tips || '' }
    })
    emit('sync-change'); startPolling()
  } catch (e) { rows.value = []; error.value = e?.message || '服务模板实例加载失败'; stopPolling() } finally { loading.value = false }
}
function startPolling() { stopPolling(); if (props.active && rows.value.some((row) => isSyncing(row.status))) timer = setInterval(() => load(), 5000) }
function stopPolling() { if (timer) { clearInterval(timer); timer = null } }
function reload() { page.value.current = 1; load() }
function goSync(targets) { const ids = targets.map((row) => row.bk_module_id).join(','); router.push({ path: `/business/${props.bizId}/sync`, query: { template: String(props.templateId), modules: ids, source: 'service-template' } }) }
function goTopo(row) { router.push(`/business/${props.bizId}/index?node=module-${row.bk_module_id}`) }
async function remove(row) { try { await ElMessageBox.confirm(`确定删除模块「${row.bk_module_name || row.bk_module_id}」?`, '删除确认', { type: 'warning' }); await deleteModule(props.bizId, row.bk_set_id, row.bk_module_id); ElMessage.success('删除成功'); await load() } catch (e) { if (e !== 'cancel') ElMessage.error(`删除失败: ${e?.message || '后端异常'}`) } }
watch(() => props.active, (active) => { if (active) load(); else stopPolling() })
onMounted(() => { if (props.active) load() })
onBeforeUnmount(stopPolling)
</script>

<style scoped>
.template-instance { padding: 16px 0; }
.toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; }
.spacer { flex: 1; }
.status { display: inline-flex; align-items: center; gap: 5px; }
.status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #979ba5; }
.status.need_sync::before { background: #ff9c01; }.status.finished::before { background: #2dcb56; }.status.failure::before { background: #ea3636; }
.el-pagination { justify-content: flex-end; margin-top: 14px; }
</style>
