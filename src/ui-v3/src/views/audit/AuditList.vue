<template>
  <div class="page-card">
    <h1 class="page-title sr-only">操作审计</h1>
    <div class="table-toolbar">
      <el-select v-model="resourceType" placeholder="资源类型" clearable style="width: 180px" @change="onTypeChange">
        <el-option v-for="t in dict" :key="t.id" :label="t.name" :value="t.id" />
      </el-select>
      <el-select v-model="actionId" placeholder="动作" clearable style="width: 160px">
        <el-option v-for="a in actionOptions" :key="a.id" :label="a.name" :value="a.id" />
      </el-select>
      <el-date-picker
        v-model="timeRange"
        type="datetimerange"
        start-placeholder="开始时间"
        end-placeholder="结束时间"
        value-format="YYYY-MM-DD HH:mm:ss"
        style="width: 380px"
      />
      <el-button type="primary" :icon="'Search'" @click="reload">查询</el-button>
      <div class="spacer" />
    </div>

    <el-table :data="rows" v-loading="loading" stripe :default-sort="{ prop: 'operation_time', order: 'descending' }">
      <el-table-column prop="id" label="ID" width="90" />
      <el-table-column prop="user" label="操作人" width="140" />
      <el-table-column prop="resource_type" label="资源类型" width="130">
        <template #default="{ row }">{{ typeName(row.resource_type) }}</template>
      </el-table-column>
      <el-table-column prop="action" label="操作" width="110" />
      <el-table-column prop="resource_name" label="资源名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="bk_biz_id" label="业务 ID" width="100">
        <template #default="{ row }">{{ row.bk_biz_id || '-' }}</template>
      </el-table-column>
      <el-table-column prop="operation_time" label="操作时间" width="180" sortable />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="showDetail(row)">详情</el-button>
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

    <el-drawer v-model="detailVisible" :title="`审计详情 #${detailRow?.id || ''}`" size="55%">
      <template v-if="detailRow">
        <el-descriptions :column="2" border size="default" class="audit-desc">
          <el-descriptions-item label="操作人">{{ detailRow.user || detailRow.bk_user_name || '--' }}</el-descriptions-item>
          <el-descriptions-item label="资源类型">{{ detailRow.resource_type_name || typeName(detailRow.resource_type) }}</el-descriptions-item>
          <el-descriptions-item label="操作动作">{{ detailRow.action_name || actionLabel(detailRow) }}</el-descriptions-item>
          <el-descriptions-item label="资源 ID">{{ detailRow.resource_id || '--' }}</el-descriptions-item>
          <el-descriptions-item label="操作时间" :span="2">{{ (detailRow.operate_time || detailRow.create_time || '').replace('T', ' ').slice(0, 19) || '--' }}</el-descriptions-item>
          <el-descriptions-item label="操作结果" :span="2">
            <el-tag v-if="detailRow.status === 'success' || !detailRow.status" type="success" size="small">成功</el-tag>
            <el-tag v-else type="danger" size="small">{{ detailRow.status }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>
        <el-divider>操作明细</el-divider>
        <template v-if="parsedDetails.length">
          <el-table :data="parsedDetails" size="default" border>
            <el-table-column prop="field" label="字段" min-width="180" />
            <el-table-column prop="before" label="变更前" min-width="180" show-overflow-tooltip>
              <template #default="{ row }"><span class="mono">{{ row.before }}</span></template>
            </el-table-column>
            <el-table-column prop="after" label="变更后" min-width="180" show-overflow-tooltip>
              <template #default="{ row }"><span class="mono">{{ row.after }}</span></template>
            </el-table-column>
          </el-table>
        </template>
        <pre v-else class="detail-pre">{{ detailJson }}</pre>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getAuditDict, searchAuditList } from '../../api/cmdb'

const dict = ref([])
const resourceType = ref('')
const actionId = ref('')
const timeRange = ref([])
const page = ref(1)
const pageSize = 20
const total = ref(0)
const rows = ref([])
const loading = ref(false)
const detailVisible = ref(false)
const detailJson = ref('')
const detailRow = ref(null)
const parsedDetails = ref([])

function actionLabel(row) {
  if (row.action) return row.action
  const t = dict.value.find((d) => d.id === row.resource_type)
  const op = t?.operations?.find((o) => o.id === row.action_id)
  return op ? op.name : row.action_id || '--'
}

const actionOptions = computed(() => {
  const t = dict.value.find((d) => d.id === resourceType.value)
  return t ? t.operations || [] : []
})

function onTypeChange() {
  actionId.value = ''
}

function typeName(id) {
  return dict.value.find((d) => d.id === id)?.name || id
}

function defaultTimeRange() {
  const end = new Date()
  const start = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ')
  return [fmt(start), fmt(end)]
}

function buildCondition() {
  const [start, end] = timeRange.value || defaultTimeRange()
  return {
    condition: [],
    user: '',
    resource_name: '',
    resource_type_id: resourceType.value || '',
    action_id: actionId.value || '',
    bk_biz_id: null,
    operation_time: { start, end }
  }
}

async function load() {
  loading.value = true
  try {
    const data = await searchAuditList(buildCondition(), {
      start: (page.value - 1) * pageSize, limit: pageSize, sort: '-operation_time'
    })
    rows.value = data?.info || []
    total.value = data?.count || 0
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load()
}

async function showDetail(row) {
  detailRow.value = row
  detailVisible.value = true
  detailJson.value = ''
  parsedDetails.value = []
  try {
    const { searchAuditDetail } = await import('../../api/cmdb')
    const data = await searchAuditDetail(row.id)
    detailJson.value = JSON.stringify(data, null, 2)
    // 解析 audit.cur_data / pre_data 提取字段差异
    const cur = data?.cur_data || data?.audit_data?.cur_data
    const pre = data?.pre_data || data?.audit_data?.pre_data
    if (cur && pre && typeof cur === 'object' && typeof pre === 'object') {
      const keys = new Set([...Object.keys(cur), ...Object.keys(pre)])
      parsedDetails.value = [...keys].map((k) => ({
        field: k,
        before: JSON.stringify(pre[k] ?? ''),
        after: JSON.stringify(cur[k] ?? '')
      })).filter((r) => r.before !== r.after)
    } else if (cur && typeof cur === 'object') {
      parsedDetails.value = Object.keys(cur).map((k) => ({
        field: k, before: '--', after: JSON.stringify(cur[k] ?? '')
      }))
    }
  } catch (e) { /* 容忍:用 default 字段 */ }
  detailVisible.value = true
}

onMounted(async () => {
  timeRange.value = defaultTimeRange()
  const d = await getAuditDict()
  dict.value = d || []
  load()
})
</script>

<style scoped>
.detail-pre {
  background: #f5f7fa; padding: 12px; border-radius: 4px;
  font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-all;
  max-height: 60vh; overflow: auto;
}
.audit-desc { margin-bottom: 16px; }
.mono { font-family: Menlo, Monaco, 'Courier New', monospace; font-size: 12px; }
</style>
