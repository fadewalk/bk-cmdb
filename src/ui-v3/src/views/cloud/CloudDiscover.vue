<template>
  <div class="res-page">
    <div class="page-body">
      <el-alert type="info" :closable="true" style="margin-bottom: 14px" title="配置云主机任务，自动发现并同步新增或属性有更改的主机到主机池" />

      <div class="table-toolbar">
        <el-button type="primary" :icon="'Plus'" @click="openCreate">新建</el-button>
        <div class="spacer" />
        <el-input
          v-model="keyword"
          placeholder="请输入任务名称"
          clearable
          style="width: 280px"
          :prefix-icon="'Search'"
          @keyup.enter="reloadFromFirst"
          @clear="reloadFromFirst"
        />
      </div>

      <el-table :data="rows" v-loading="loading" @sort-change="onSortChange" @cell-click="onCellClick">
        <el-table-column prop="bk_task_name" label="任务名称" sortable="custom" min-width="180" show-overflow-tooltip>
          <template #default="{ row }"><span class="cell-link">{{ row.bk_task_name }}</span></template>
        </el-table-column>
        <el-table-column prop="bk_resource_type" label="资源" width="100">
          <template #default="{ row }">{{ row.bk_resource_type === 'host' ? '主机' : (row.bk_resource_type || '--') }}</template>
        </el-table-column>
        <el-table-column prop="bk_account_name" label="账户名称" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ accountName(row.bk_account_id) }}</template>
        </el-table-column>
        <el-table-column prop="bk_cloud_vendor" label="账户类型" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ vendorName(row.bk_cloud_vendor) }}</template>
        </el-table-column>
        <el-table-column prop="bk_sync_status" label="最近同步状态" sortable="custom" width="130">
          <template #default="{ row }">
            <el-tooltip
              v-if="row.bk_sync_status && row.bk_sync_status !== 'cloud_sync_success' && row.bk_status_description?.error_info"
              :content="row.bk_status_description.error_info"
              placement="top"
            >
              <span class="row-status"><i class="status-dot err" />失败</span>
            </el-tooltip>
            <span v-else-if="row.bk_sync_status === 'cloud_sync_success'" class="row-status"><i class="status-dot" />成功</span>
            <span v-else-if="row.bk_sync_status" class="row-status"><i class="status-dot err" />失败</span>
            <span v-else>--</span>
          </template>
        </el-table-column>
        <el-table-column prop="bk_last_sync_time" label="最近同步时间" sortable="custom" min-width="170" show-overflow-tooltip>
          <template #default="{ row }">{{ fmtTime(row.bk_last_sync_time) }}</template>
        </el-table-column>
        <el-table-column prop="bk_last_editor" label="编辑人" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.bk_last_editor || '--' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click.stop="openEdit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click.stop="remove(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无数据" :image-size="60">
            <el-button link type="primary" @click="openCreate">立即创建</el-button>
          </el-empty>
        </template>
      </el-table>

      <div v-if="total > 0" class="table-footer">
        <span>共计{{ total }}条</span>
        <div class="spacer" />
        <el-pagination
          v-model:current-page="page"
          :page-size="20"
          :total="total"
          layout="prev, pager, next"
          @current-change="load"
        />
      </div>
    </div>

    <!-- 任务详情(老版 task-details:属性 + VPC 同步列表) -->
    <el-drawer v-model="detailsVisible" title="任务详情" size="640px">
      <template v-if="detailTask">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="任务名称">{{ detailTask.bk_task_name || '--' }}</el-descriptions-item>
          <el-descriptions-item label="云账户">{{ accountName(detailTask.bk_account_id) }}</el-descriptions-item>
          <el-descriptions-item label="云厂商">{{ vendorName(detailTask.bk_cloud_vendor) }}</el-descriptions-item>
          <el-descriptions-item label="资源类型">{{ detailTask.bk_resource_type === 'host' ? '主机' : (detailTask.bk_resource_type || '--') }}</el-descriptions-item>
          <el-descriptions-item label="最近同步状态">{{ syncStatusText(detailTask.bk_sync_status) }}</el-descriptions-item>
          <el-descriptions-item label="最近同步时间">{{ fmtTime(detailTask.bk_last_sync_time) }}</el-descriptions-item>
          <el-descriptions-item label="创建人">{{ detailTask.bk_creator || '--' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ fmtTime(detailTask.create_time) }}</el-descriptions-item>
          <el-descriptions-item label="编辑人">{{ detailTask.bk_last_editor || '--' }}</el-descriptions-item>
          <el-descriptions-item label="编辑时间">{{ fmtTime(detailTask.last_time) }}</el-descriptions-item>
        </el-descriptions>
        <div class="detail-section-title">VPC 同步列表</div>
        <el-table :data="detailTask.bk_sync_vpcs || []" size="small" border>
          <el-table-column label="VPC ID" prop="bk_vpc_id" min-width="130" show-overflow-tooltip />
          <el-table-column label="VPC 名称" prop="bk_vpc_name" min-width="130" show-overflow-tooltip />
          <el-table-column label="地域" prop="bk_region" width="120" show-overflow-tooltip />
          <el-table-column label="管控区域" width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ areaName(row.bk_cloud_id) }}</template>
          </el-table-column>
          <el-table-column label="主机录入到" width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ dirName(row.bk_sync_dir) }}</template>
          </el-table-column>
          <el-table-column label="主机数量" prop="bk_host_count" width="90" />
        </el-table>
        <el-empty
          v-if="!(detailTask.bk_sync_vpcs || []).length"
          description="暂无同步 VPC"
          :image-size="60"
        />
      </template>
    </el-drawer>

    <!-- 新建/编辑任务(老版 task-form:名称/账户/资源类型 + VPC 表格) -->
    <el-drawer v-model="formVisible" :title="formMode === 'create' ? '新建任务' : '编辑任务'" size="720px">
      <el-form label-width="110px">
        <el-form-item label="任务名称" required>
          <el-input v-model="form.bk_task_name" placeholder="请输入任务名称" style="width: 420px" />
        </el-form-item>
        <el-form-item label="云账户" required>
          <el-select v-model="form.bk_account_id" filterable placeholder="请选择云账户" style="width: 420px" @change="onAccountChange">
            <el-option v-for="a in accounts" :key="a.bk_account_id" :label="a.bk_account_name" :value="a.bk_account_id" />
          </el-select>
          <div class="form-tip">
            没有云账户？<span class="link" @click="goCloudAccount">去云账户新建</span>
          </div>
        </el-form-item>
        <el-form-item label="资源类型" required>
          <el-select v-model="form.bk_resource_type" style="width: 420px">
            <el-option label="主机" value="host" />
          </el-select>
        </el-form-item>
      </el-form>

      <div class="vpc-section">
        <div class="vpc-section-head">
          <span class="vpc-title">VPC 同步列表</span>
          <el-button size="small" :icon="'Plus'" @click="openVpcDialog">添加VPC</el-button>
        </div>
        <el-table :data="syncRows" size="small" border empty-text="暂无数据,请点击「添加VPC」选择需要同步的 VPC">
          <el-table-column label="管控区域" min-width="170">
            <template #default="{ row }">
              <el-select
                v-if="!row.destroyed"
                v-model="row.bk_cloud_id"
                filterable
                allow-create
                default-first-option
                placeholder="选择已有区域或输入新建区域名"
                size="small"
                style="width: 100%"
              >
                <el-option v-for="a in areaOptions" :key="a.bk_cloud_id" :label="a.bk_cloud_name" :value="a.bk_cloud_id" />
              </el-select>
              <span v-else>{{ areaName(row.bk_cloud_id) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="VPC" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.bk_vpc_id }}{{ row.bk_vpc_name && row.bk_vpc_name !== row.bk_vpc_id ? `(${row.bk_vpc_name})` : '' }}</template>
          </el-table-column>
          <el-table-column label="地域" prop="bk_region" width="110" show-overflow-tooltip />
          <el-table-column label="主机数量" prop="bk_host_count" width="90" />
          <el-table-column label="主机录入到" min-width="170">
            <template #default="{ row }">
              <el-select
                v-if="!row.destroyed"
                v-model="row.bk_sync_dir"
                placeholder="请选择主机池目录"
                size="small"
                style="width: 100%"
              >
                <el-option v-for="d in dirs" :key="d.bk_module_id" :label="d.bk_module_name" :value="d.bk_module_id" />
              </el-select>
              <span v-else>{{ dirName(row.bk_sync_dir) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="70">
            <template #default="{ $index }">
              <el-button link type="danger" size="small" @click="removeSyncRow($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-drawer>

    <!-- VPC 选择(老版 region/vpc-selector 契约) -->
    <el-dialog v-model="vpcDialog" title="添加VPC" width="560px" append-to-body>
      <el-form label-width="70px">
        <el-form-item label="地域" required>
          <el-select
            v-model="vpcRegion"
            :loading="regionsLoading"
            placeholder="请选择地域"
            style="width: 100%"
            @change="loadVpcList"
          >
            <el-option v-for="r in vpcRegions" :key="r.bk_region" :label="r.bk_region_name || r.bk_region" :value="r.bk_region" />
          </el-select>
          <div v-if="!regionsLoading && !vpcRegions.length" class="form-tip">未能获取该账户的地域信息，请检查账户连通性</div>
        </el-form-item>
      </el-form>
      <el-table
        ref="vpcTableRef"
        :data="vpcList"
        v-loading="vpcLoading"
        size="small"
        border
        max-height="320"
        empty-text="当前地域下暂无 VPC"
        @selection-change="vpcSelection = $event"
      >
        <el-table-column type="selection" width="45" />
        <el-table-column label="VPC ID" prop="bk_vpc_id" min-width="150" show-overflow-tooltip />
        <el-table-column label="VPC 名称" prop="bk_vpc_name" min-width="150" show-overflow-tooltip />
        <el-table-column label="主机数量" prop="bk_host_count" width="90" />
      </el-table>
      <template #footer>
        <el-button @click="vpcDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmVpcSelection">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
// 云资源发现:对齐老版 resource/cloud-resource(任务列表/详情/表单+VPC 同步/管控区域联动创建)
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchCloudAccounts, searchCloudAreas, listCloudSyncTask,
  createCloudSyncTask, updateCloudSyncTask, deleteCloudSyncTask,
  findCloudSyncRegion, findCloudAccountVPC, batchCreateCloudArea,
  listResourceDirectory
} from '../../api/cmdb'

const router = useRouter()

const keyword = ref('')
const rows = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const sort = ref('bk_task_id')
const accounts = ref([])

const detailsVisible = ref(false)
const detailTask = ref(null)
const areas = ref([])
const dirs = ref([])

const formVisible = ref(false)
const formMode = ref('create')
const saving = ref(false)
const editingTask = ref(null)
const form = ref({ bk_task_name: '', bk_account_id: '', bk_resource_type: 'host' })
const syncRows = ref([])

const vpcDialog = ref(false)
const vpcRegions = ref([])
const vpcRegion = ref('')
const vpcList = ref([])
const vpcSelection = ref([])
const regionsLoading = ref(false)
const vpcLoading = ref(false)

const VENDORS = { '1': 'AWS', '2': '腾讯云', '4': '阿里云' }
function vendorName(v) { return VENDORS[String(v)] || '--' }
function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 19) : '--' }

function accountName(id) {
  return accounts.value.find((a) => a.bk_account_id === id)?.bk_account_name || '--'
}

function syncStatusText(s) {
  if (!s) return '--'
  return s === 'cloud_sync_success' ? '成功' : '失败'
}

function areaName(id) {
  const hit = areas.value.find((a) => a.bk_cloud_id === id)
  return hit ? hit.bk_cloud_name : (id || '--')
}

function dirName(id) {
  const hit = dirs.value.find((d) => d.bk_module_id === id)
  return hit ? hit.bk_module_name : (id || '--')
}

const areaOptions = computed(() =>
  areas.value.filter((a) => Number(a.bk_cloud_id) !== 0 && Number(a.bk_cloud_id) !== 90000001)
)

function reloadFromFirst() {
  page.value = 1
  load()
}

function onSortChange({ prop, order }) {
  sort.value = order ? (order === 'descending' ? '-' : '') + prop : 'bk_task_id'
  reloadFromFirst()
}

function onCellClick(row, column) {
  if (column.property === 'bk_task_name') openDetail(row)
}

async function load() {
  loading.value = true
  try {
    const kw = keyword.value.trim()
    const body = {
      page: { start: (page.value - 1) * 20, limit: 20, sort: sort.value },
      condition: kw ? { bk_task_name: kw } : {},
      ...(kw ? { is_fuzzy: true } : {})
    }
    const data = await listCloudSyncTask(body)
    rows.value = data?.info || []
    total.value = data?.count ?? rows.value.length
  } catch {
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function loadAccounts() {
  try {
    const data = await searchCloudAccounts({ page: { start: 0, limit: 100 } })
    accounts.value = data?.info || []
  } catch {
    accounts.value = []
  }
}

async function loadAreasAndDirs() {
  try {
    const [areaRes, dirRes] = await Promise.allSettled([
      searchCloudAreas({ page: { start: 0, limit: 500 }, condition: {} }),
      listResourceDirectory({})
    ])
    if (areaRes.status === 'fulfilled') areas.value = areaRes.value?.info || []
    if (dirRes.status === 'fulfilled') dirs.value = dirRes.value?.info || []
  } catch { /* 名称映射失败时展示原始 ID */ }
}

function openDetail(row) {
  detailTask.value = row
  detailsVisible.value = true
  loadAreasAndDirs()
}

function openCreate() {
  formMode.value = 'create'
  editingTask.value = null
  form.value = { bk_task_name: '', bk_account_id: '', bk_resource_type: 'host' }
  syncRows.value = []
  formVisible.value = true
  loadAreasAndDirs()
}

function openEdit(row) {
  formMode.value = 'edit'
  editingTask.value = row
  form.value = {
    bk_task_name: row.bk_task_name || '',
    bk_account_id: row.bk_account_id,
    bk_resource_type: row.bk_resource_type || 'host'
  }
  syncRows.value = (row.bk_sync_vpcs || []).map((v) => ({ ...v, destroyed: !!v.destroyed }))
  formVisible.value = true
  loadAreasAndDirs()
}

function removeSyncRow(index) {
  const row = syncRows.value[index]
  if (formMode.value === 'edit' && row?.bk_vpc_id) {
    syncRows.value[index] = { ...row, destroyed: true }
  } else {
    syncRows.value.splice(index, 1)
  }
}

function goCloudAccount() {
  router.push('/resource/cloud-account')
}

function onAccountChange() {
  vpcRegions.value = []
  vpcRegion.value = ''
  vpcList.value = []
}

async function openVpcDialog() {
  if (!form.value.bk_account_id) {
    ElMessage.warning('请先选择云账户')
    return
  }
  vpcDialog.value = true
  vpcRegion.value = ''
  vpcList.value = []
  vpcSelection.value = []
  regionsLoading.value = true
  try {
    const regions = await findCloudSyncRegion({ bk_account_id: form.value.bk_account_id, with_host_count: false })
    vpcRegions.value = regions || []
  } catch {
    vpcRegions.value = []
    ElMessage.error('获取地域信息失败，请检查账户连通性')
  } finally {
    regionsLoading.value = false
  }
}

async function loadVpcList() {
  if (!vpcRegion.value) return
  vpcLoading.value = true
  try {
    const data = await findCloudAccountVPC(form.value.bk_account_id, {
      bk_account_id: form.value.bk_account_id,
      bk_region: vpcRegion.value
    })
    vpcList.value = data?.info || []
  } catch {
    vpcList.value = []
    ElMessage.error('获取 VPC 列表失败，请检查账户连通性')
  } finally {
    vpcLoading.value = false
  }
}

function confirmVpcSelection() {
  const exist = new Set(syncRows.value.map((r) => r.bk_vpc_id))
  const append = (vpcSelection.value || [])
    .filter((v) => !exist.has(v.bk_vpc_id))
    .map((v) => ({
      bk_vpc_id: v.bk_vpc_id,
      bk_vpc_name: v.bk_vpc_name,
      bk_region: v.bk_region,
      bk_host_count: v.bk_host_count || 0,
      bk_sync_dir: null,
      bk_cloud_id: null,
      destroyed: false
    }))
  if (!append.length) {
    ElMessage.warning('请选择需要同步的 VPC')
    return
  }
  syncRows.value.push(...append)
  vpcDialog.value = false
}

async function submit() {
  if (!form.value.bk_task_name.trim()) { ElMessage.warning('请输入任务名称'); return }
  if (!form.value.bk_account_id) { ElMessage.warning('请选择云账户'); return }
  if (!syncRows.value.length) { ElMessage.warning('请添加需要同步的 VPC'); return }
  const missingDir = syncRows.value.find((r) => !r.destroyed && !r.bk_sync_dir)
  if (missingDir) { ElMessage.warning('请为 VPC 选择主机录入到的目录'); return }

  const account = accounts.value.find((a) => a.bk_account_id === form.value.bk_account_id) || {}
  saving.value = true
  try {
    // 契约对齐老版 task-form-table:未绑定管控区域的行先批量建区域,响应按行回填 bk_cloud_id
    const newAreaRows = syncRows.value.filter((r) => typeof r.bk_cloud_id === 'string' && r.bk_cloud_id)
    if (newAreaRows.length) {
      const results = await batchCreateCloudArea(newAreaRows.map((r) => ({
        bk_cloud_name: r.bk_cloud_id,
        bk_vpc_id: r.bk_vpc_id,
        bk_vpc_name: r.bk_vpc_name,
        bk_region: r.bk_region,
        bk_cloud_vendor: account.bk_cloud_vendor,
        bk_account_id: form.value.bk_account_id
      })))
      const list = Array.isArray(results) ? results : []
      let hasError = false
      newAreaRows.forEach((row, index) => {
        const result = list[index]
        if (!result || result.bk_cloud_id === -1) {
          hasError = true
          ElMessage.error(`创建管控区域「${row.bk_cloud_id}」失败: ${result?.err_msg || '后端异常'}`)
        } else {
          row.bk_cloud_id = result.bk_cloud_id
        }
      })
      if (hasError) return
    }

    const bk_sync_vpcs = syncRows.value.map((r) => ({
      bk_vpc_id: r.bk_vpc_id,
      bk_vpc_name: r.bk_vpc_name,
      bk_region: r.bk_region,
      bk_host_count: r.bk_host_count,
      bk_sync_dir: r.bk_sync_dir,
      bk_cloud_id: r.bk_cloud_id,
      destroyed: r.destroyed
    }))

    if (formMode.value === 'create') {
      await createCloudSyncTask({ ...form.value, bk_sync_vpcs })
      ElMessage.success('任务已创建')
    } else {
      await updateCloudSyncTask(editingTask.value.bk_task_id, {
        bk_task_id: editingTask.value.bk_task_id,
        bk_task_name: form.value.bk_task_name,
        bk_sync_vpcs
      })
      ElMessage.success('任务已更新')
    }
    formVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确认删除 ${row.bk_task_name}?`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    await deleteCloudSyncTask(row.bk_task_id)
    ElMessage.success('删除成功')
    await load()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}

onMounted(() => {
  load()
  loadAccounts()
})
</script>

<style scoped>
.res-page { height: 100%; display: flex; flex-direction: column; background: #fff; overflow-y: auto; }
.page-head {
  display: flex; align-items: center;
  padding: 0 20px; height: 50px; flex: 0 0 50px;
  border-bottom: 1px solid #E7E9EF;
}
.page-name { font-size: 14px; color: #313238; font-weight: 700; }
.page-body { padding: 16px 20px; }
.table-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.table-toolbar .spacer { flex: 1; }
.cell-link { color: #3A84FF; cursor: pointer; }
.row-status { display: inline-flex; align-items: center; }
.status-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: #2DCB56; margin-right: 6px;
}
.status-dot.err { background: #EA3636; }
.table-footer {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 0 0; font-size: 12px; color: #63656E;
}
.table-footer .spacer { flex: 1; }
.detail-section-title { font-size: 14px; font-weight: 700; color: #313238; margin: 18px 0 10px; }
.vpc-section { margin: 8px 24px 0; }
.vpc-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.vpc-title { font-size: 14px; font-weight: 700; color: #313238; }
.form-tip { font-size: 12px; color: #979BA5; line-height: 20px; }
.link { color: #3A84FF; cursor: pointer; }
</style>
