<template>
  <div class="page-card">
    <h1 class="page-title sr-only">操作审计</h1>

    <!-- 对象分类 tab(对齐老版: 主机/业务/资源/其他) -->
    <el-tabs v-model="activeTab" @tab-change="onTypeChange">
      <el-tab-pane label="主机" name="host" />
      <el-tab-pane label="业务" name="business" />
      <el-tab-pane label="资源" name="resource" />
      <el-tab-pane label="其他" name="other" />
    </el-tabs>

    <!-- 双行筛选(对齐老版 audit-host-options) -->
    <table class="audit-options">
      <tr>
        <td class="lbl">业务</td>
        <td>
          <el-select v-model="bizId" placeholder="请选择业务" clearable filterable style="width: 100%">
            <el-option v-for="b in bizList" :key="b.bk_biz_id" :label="`[${b.bk_biz_id}] ${b.bk_biz_name}`" :value="b.bk_biz_id" />
          </el-select>
        </td>
        <td class="lbl">动作</td>
        <td>
          <el-select v-model="actionId" placeholder="请选择动作" clearable style="width: 100%">
            <el-option v-for="a in actionOptions" :key="a.id" :label="a.name" :value="a.id" />
          </el-select>
        </td>
        <td class="lbl">时间</td>
        <td>
          <el-date-picker
            v-model="timeRange"
            type="datetimerange"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
        </td>
      </tr>
      <tr>
        <td class="lbl">账号</td>
        <td>
          <el-select v-model="userFilter" placeholder="包含" clearable allow-create filterable style="width: 100%">
            <el-option v-for="u in knownUsers" :key="u" :label="u" :value="u" />
          </el-select>
        </td>
        <td class="lbl">主机</td>
        <td>
          <div class="ip-filter">
            <el-select v-model="ipScope" style="width: 96px" :disabled="activeTab !== 'host'">
              <el-option label="IP" value="ip" />
            </el-select>
            <el-input v-model="ipKeyword" placeholder="请输入IP" :disabled="activeTab !== 'host'" style="flex: 1" />
          </div>
        </td>
        <td colspan="2" class="btn-cell">
          <el-button type="primary" :icon="'Search'" @click="reload">查询</el-button>
          <el-button @click="clearFilter">清空</el-button>
        </td>
      </tr>
    </table>

    <el-table :data="rows" v-loading="loading" stripe :default-sort="{ prop: 'operation_time', order: 'descending' }">
      <el-table-column prop="resource_type" label="操作对象" width="140">
        <template #default="{ row }">{{ typeName(row.resource_type) }}</template>
      </el-table-column>
      <el-table-column prop="action" label="动作" width="120">
        <template #default="{ row }">{{ actionLabel(row) }}</template>
      </el-table-column>
      <el-table-column v-if="['host', 'business'].includes(activeTab)" prop="bk_biz_id" label="所属业务" width="140">
        <template #default="{ row }">{{ bizName(row.bk_biz_id) }}</template>
      </el-table-column>
      <el-table-column prop="resource_name" label="实例" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.resource_name || row.bk_resource_name || '--' }}</template>
      </el-table-column>
      <el-table-column label="操作描述" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ actionLabel(row) }}{{ typeName(row.resource_type) }}</template>
      </el-table-column>
      <el-table-column prop="operation_time" label="时间" width="170" sortable>
        <template #default="{ row }">{{ (row.operation_time || row.operate_time || '').replace('T', ' ').slice(0, 19) }}</template>
      </el-table-column>
      <el-table-column prop="user" label="操作账号" width="120" />
      <el-table-column label="" width="70" fixed="right">
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
const activeTab = ref('host')
const resourceType = ref('')
const actionId = ref('')
const bizId = ref(null)
const userFilter = ref('')
const ipScope = ref('ip')
const ipKeyword = ref('')
const bizList = ref([])
const knownUsers = ref(['admin'])
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

function bizName(id) {
  const b = bizList.value.find((x) => x.bk_biz_id === id)
  return b ? b.bk_biz_name : (id || '-')
}

function buildCondition() {
  const [start, end] = timeRange.value || defaultTimeRange()
  // 操作对象按 tab 归类(对齐老版四个 options 组件的 resource_type 过滤域)
  const tabTypes = {
    host: ['host'],
    business: ['biz', 'business', 'biz_set'],
    other: ['model', 'instance', 'association', 'service_instance', 'service_template', 'set_template', 'service_category', 'plat']
  }
  const cond = {
    condition: [],
    user: userFilter.value || '',
    resource_name: '',
    resource_type_id: resourceType.value || '',
    action_id: actionId.value || '',
    bk_biz_id: bizId.value || null,
    operation_time: { start, end }
  }
  // 资源 tab: 也可以从资源类型下拉指定;其他 tab 未指定类型时用归类集合(后端支持数组时传数组)
  if (!cond.resource_type_id && activeTab.value !== 'resource' && tabTypes[activeTab.value]?.length) {
    cond.resource_type_id = tabTypes[activeTab.value]
  }
  if (ipKeyword.value.trim() && activeTab.value === 'host') {
    cond.condition.push({ field: 'bk_host_innerip', operator: '$in', value: ipKeyword.value.split(',').map((s) => s.trim()).filter(Boolean) })
  }
  return cond
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

function clearFilter() {
  bizId.value = null
  actionId.value = ''
  userFilter.value = ''
  ipKeyword.value = ''
  timeRange.value = []
  reload()
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
  try {
    const { searchBusiness } = await import('../../api/cmdb')
    const res = await searchBusiness({ start: 0, limit: 200 })
    bizList.value = res?.info || []
  } catch { bizList.value = [] }
})
</script>

<style scoped>
/* 双行筛选表(对齐老版 audit-host-options) */
.audit-options {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 14px;
}
.audit-options td { padding: 6px 8px; }
.audit-options td.lbl { text-align: right; color: #63656E; font-size: 14px; width: 64px; }
.audit-options td.btn-cell { text-align: left; }
.ip-filter { display: flex; gap: 0; }
.ip-filter .el-select :deep(.el-select__wrapper) { border-radius: 2px 0 0 2px; }
.ip-filter .el-input :deep(.el-input__wrapper) { border-radius: 0 2px 2px 0; }

.detail-pre {
  background: #f5f7fa; padding: 12px; border-radius: 4px;
  font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-all;
  max-height: 60vh; overflow: auto;
}
.audit-desc { margin-bottom: 16px; }
.mono { font-family: Menlo, Monaco, 'Courier New', monospace; font-size: 12px; }
</style>
