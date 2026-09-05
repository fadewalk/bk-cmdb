<template>
  <div class="page-card">
    <h1 class="page-title">操作审计</h1>
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

    <el-table :data="rows" v-loading="loading" stripe>
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

    <el-drawer v-model="detailVisible" title="审计详情" size="45%">
      <pre class="detail-pre">{{ detailJson }}</pre>
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
  const { searchAuditDetail } = await import('../../api/cmdb')
  const data = await searchAuditDetail(row.id)
  detailJson.value = JSON.stringify(data, null, 2)
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
}
</style>
