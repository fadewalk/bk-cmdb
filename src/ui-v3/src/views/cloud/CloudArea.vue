<template>
  <div class="res-page">
    <div class="page-body">
      <el-alert type="info" :closable="true" style="margin-bottom: 14px">
        <template #title>
          管控区域来源于<span class="link" @click="$router.push('/resource/cloud-discover')">云资源发现</span>后同步录入或者节点管理中新建。未分配管控区域下的主机可在节点管理中重新指定并安装Agent。
        </template>
      </el-alert>

      <div class="table-toolbar">
        <el-input
          v-model="keyword"
          placeholder="请输入管控区域名称"
          clearable
          style="width: 280px"
          :prefix-icon="'Search'"
          @input="scheduleSearch"
          @clear="reloadFromFirst"
        />
      </div>

      <el-table :data="rows" v-loading="loading" @sort-change="onSortChange">
        <el-table-column prop="bk_cloud_name" label="管控区域名称" sortable="custom" min-width="170" show-overflow-tooltip>
          <template #default="{ row }">
            <template v-if="editingId === row.bk_cloud_id">
              <el-input
                :ref="setNameInput"
                v-model="editName"
                size="small"
                @keyup.enter="saveName(row)"
                @blur="saveName(row)"
              />
            </template>
            <span
              v-else
              class="cell-name"
              :class="{ editable: !isLimited(row), pending: row._pending_ }"
              @click="startEdit(row)"
            >
              <span class="cell-name-text">{{ row.bk_cloud_name }}</span>
              <el-icon v-if="!isLimited(row)" class="cell-name-icon"><Edit /></el-icon>
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="bk_status" label="状态" sortable="custom" width="90">
          <template #default="{ row }">
            <el-tooltip
              v-if="!isUnassigned(row) && row.bk_status !== '1' && row.bk_status_detail"
              :content="row.bk_status_detail"
              placement="top"
            >
              <span class="row-status"><i class="status-dot err" />异常</span>
            </el-tooltip>
            <span v-else-if="!isUnassigned(row)" class="row-status"><i class="status-dot" />正常</span>
            <span v-else>--</span>
          </template>
        </el-table-column>
        <el-table-column prop="bk_cloud_vendor" label="所属云厂商" sortable="custom" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ vendorName(row.bk_cloud_vendor) }}</template>
        </el-table-column>
        <el-table-column prop="bk_region" label="地域" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ regionName(row) }}</template>
        </el-table-column>
        <el-table-column prop="bk_vpc_name" label="VPC" width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ vpcInfo(row) }}</template>
        </el-table-column>
        <el-table-column prop="host_count" label="主机数量" width="90" show-overflow-tooltip />
        <el-table-column prop="last_time" label="最近编辑" sortable="custom" width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ fmtTime(row.last_time) }}</template>
        </el-table-column>
        <el-table-column prop="bk_last_editor" label="编辑人" min-width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ row.bk_last_editor || '--' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-tooltip :disabled="isRemovable(row)" :content="removeTips(row)" placement="top">
              <span>
                <el-button link type="danger" size="small" :disabled="!isRemovable(row)" @click="remove(row)">删除</el-button>
              </span>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="total > 0" class="table-footer">
        <span>共计{{ total }}条</span>
        <span class="page-size">
          每页
          <el-select v-model="limit" size="small" style="width: 72px" @change="onLimitChange">
            <el-option v-for="n in [10, 20, 50, 100]" :key="n" :label="n" :value="n" />
          </el-select>
          条
        </span>
        <div class="spacer" />
        <el-pagination
          v-model:current-page="page"
          :page-size="limit"
          :total="total"
          layout="prev, pager, next"
          @current-change="load"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
// 管控区域:对齐老版 resource/cloud-area(行内改名/服务端模糊搜索/排序/删除保护/未分配置顶)
import { ref, nextTick, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { searchCloudAreas, updateCloudArea, deleteCloudArea, findCloudSyncRegion, searchCloudAreaHostCount } from '../../api/cmdb'

// 0 默认区域,90000000-99999999 系统限定,90000001 为"未分配"(老版 UNASSIGNED_CLOUD_ID)
const UNASSIGNED_CLOUD_ID = 90000001

const keyword = ref('')
const rows = ref([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const loading = ref(false)
const sort = ref('-default, bk_cloud_id')
const editingId = ref(null)
const editName = ref('')
const nameInput = ref(null)
const regionMap = ref({})
let searchTimer = null

const VENDORS = { '1': 'AWS', '2': '腾讯云', '4': '阿里云' }
function vendorName(v) { return VENDORS[String(v)] || '--' }
function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 19) : '--' }

function setNameInput(el) {
  nameInput.value = el
}

function isLimited(row) {
  const id = Number(row.bk_cloud_id)
  return id === 0 || (id >= 90000000 && id <= 99999999)
}

function isUnassigned(row) {
  return Number(row.bk_cloud_id) === UNASSIGNED_CLOUD_ID
}

function isRemovable(row) {
  return Number(row.host_count) === 0 && !isLimited(row) && !(row.sync_task_ids || []).length
}

function removeTips(row) {
  if (isLimited(row)) return '系统限定，不能删除'
  if (Number(row.host_count) !== 0) return '主机不为空，不能删除'
  if ((row.sync_task_ids || []).length !== 0) return '已关联同步任务，不能删除'
  return ''
}

function regionName(row) {
  const regions = regionMap.value[row.bk_account_id] || []
  const hit = regions.find((r) => r.bk_region === row.bk_region)
  return (hit && hit.bk_region_name) || row.bk_region || '--'
}

function vpcInfo(row) {
  const id = row.bk_vpc_id
  const name = row.bk_vpc_name
  if (!id && !name) return '--'
  if (name && id !== name) return `${id}(${name})`
  return id || name
}

function scheduleSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => reloadFromFirst(), 800)
}

function reloadFromFirst() {
  page.value = 1
  load()
}

function onSortChange({ prop, order }) {
  if (!order) {
    sort.value = '-default, bk_cloud_id'
  } else {
    sort.value = (order === 'descending' ? '-' : '') + prop
  }
  reloadFromFirst()
}

function onLimitChange() {
  reloadFromFirst()
}

async function load() {
  loading.value = true
  try {
    const params = {
      page: { start: (page.value - 1) * limit.value, limit: limit.value, sort: sort.value },
      host_count: true,
      condition: {},
      sync_task_ids: true
    }
    const kw = keyword.value.trim()
    if (kw) {
      params.condition.bk_cloud_name = kw
      params.is_fuzzy = true
    }
    const data = await searchCloudAreas(params)
    const info = data?.info || []
    // 空页回退(老版契约:count 有值但当前页为空时回退一页)
    if (data?.count && !info.length && page.value > 1) {
      page.value -= 1
      loading.value = false
      return load()
    }
    // 置顶"未分配"管控区域(老版行为)
    const unassignedIndex = info.findIndex((item) => isUnassigned(item))
    if (unassignedIndex !== -1) {
      const [unassigned] = info.splice(unassignedIndex, 1)
      info.unshift(unassigned)
    }
    rows.value = info
    total.value = data?.count ?? info.length
    loadHostCount()
    loadRegions()
  } catch {
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

// 主机数量:老版在搜索后按批(≤50)拉取 hostcount 合并到行
async function loadHostCount() {
  if (!rows.value.length) return
  const ids = rows.value.map((r) => r.bk_cloud_id)
  const batches = []
  for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50))
  try {
    const results = await Promise.all(batches.map((chunk) => searchCloudAreaHostCount(chunk)))
    const countMap = new Map(results.flat().map((item) => [item.bk_cloud_id, item.host_count]))
    rows.value = rows.value.map((row) => ({ ...row, host_count: countMap.get(row.bk_cloud_id) ?? 0 }))
  } catch { /* 计数失败保持当前显示 */ }
}

// 地域列:按账户拉取地域映射显示地域名,失败时回退显示地域编码(老版 region-selector 行为)
async function loadRegions() {
  const accountIds = [...new Set(rows.value.map((r) => r.bk_account_id).filter((id) => id > 0))]
  accountIds.forEach(async (accountId) => {
    if (regionMap.value[accountId]) return
    try {
      const regions = await findCloudSyncRegion({ bk_account_id: accountId, with_host_count: false })
      regionMap.value = { ...regionMap.value, [accountId]: regions || [] }
    } catch {
      regionMap.value = { ...regionMap.value, [accountId]: [] }
    }
  })
}

function startEdit(row) {
  if (isLimited(row) || loading.value) return
  editingId.value = row.bk_cloud_id
  editName.value = row.bk_cloud_name
  nextTick(() => nameInput.value?.focus?.())
}

async function saveName(row) {
  if (editingId.value !== row.bk_cloud_id) return
  const value = editName.value.trim()
  editingId.value = null
  if (!value || row.bk_cloud_name === value) return
  row._pending_ = true
  try {
    await updateCloudArea(row.bk_cloud_id, { bk_cloud_name: value })
    row.bk_cloud_name = value
    ElMessage.success('修改成功')
  } catch (e) {
    ElMessage.error('修改失败: ' + (e?.message || '后端异常'))
    editName.value = row.bk_cloud_name
  } finally {
    row._pending_ = false
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确认删除 ${row.bk_cloud_name}?`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    await deleteCloudArea(row.bk_cloud_id)
    ElMessage.success('删除成功')
    await load()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}

onMounted(load)
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
.link { color: #3A84FF; cursor: pointer; }
.table-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.cell-name { display: inline-flex; align-items: center; cursor: default; }
.cell-name.editable { cursor: pointer; }
.cell-name .cell-name-icon { margin-left: 6px; font-size: 14px; color: #3A84FF; visibility: hidden; }
.cell-name.editable:hover .cell-name-icon { visibility: visible; }
.cell-name.pending { opacity: 0.6; pointer-events: none; }
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
.page-size { display: inline-flex; align-items: center; gap: 4px; }
</style>
