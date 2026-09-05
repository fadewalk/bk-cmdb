<template>
  <div class="page-card">
    <div class="table-toolbar">
      <span style="font-size:14px;font-weight:600;color:#313238">资源目录</span>
      <el-input
        v-model="keyword"
        placeholder="按内网 IP 过滤"
        clearable
        style="width: 260px"
        @keyup.enter="reload"
        @clear="reload"
      />
      <el-button type="primary" :icon="'Search'" @click="reload">查询</el-button>
      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="reload">刷新</el-button>
    </div>

    <el-table :data="rows" v-loading="loading" stripe>
      <el-table-column prop="bk_host_id" label="主机 ID" width="100" sortable />
      <el-table-column prop="bk_host_innerip" label="内网 IP" width="160" />
      <el-table-column prop="bk_host_name" label="主机名称" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.bk_host_name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="bk_os_name" label="操作系统" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.bk_os_name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="bk_cloud_id" label="云区域" width="110">
        <template #default="{ row }">{{ row.bk_cloud_id ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="goDetail(row)">详情</el-button>
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { listHostsWithoutApp } from '../api/cmdb'

const router = useRouter()

const keyword = ref('')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const rows = ref([])
const loading = ref(false)

function buildFilter() {
  if (!keyword.value) return undefined
  return {
    condition: 'AND',
    rules: [{ field: 'bk_host_innerip', operator: 'contains', value: keyword.value }]
  }
}

async function load() {
  loading.value = true
  try {
    const data = await listHostsWithoutApp(
      { start: (page.value - 1) * pageSize, limit: pageSize, sort: 'bk_host_id' },
      buildFilter()
    )
    rows.value = (data?.info || []).map((h) => h.host || h)
    total.value = data?.count || 0
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load()
}

function goDetail(row) {
  router.push({ path: '/host-detail', query: { id: row.bk_host_id } })
}

onMounted(load)
</script>
