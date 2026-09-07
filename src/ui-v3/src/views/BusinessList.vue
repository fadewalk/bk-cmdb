<template>
  <div class="page-card">
    <div class="table-toolbar">
      <el-input
        v-model="keyword"
        placeholder="按业务名称过滤"
        clearable
        style="width: 260px"
        :prefix-icon="'Search'"
      />
      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="load">刷新</el-button>
    </div>

    <el-table :data="filtered" v-loading="loading" stripe>
      <el-table-column prop="bk_biz_id" label="业务 ID" width="110" sortable />
      <el-table-column prop="bk_biz_name" label="业务名称" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <el-link type="primary" :underline="false" @click="goDetail(row)">{{ row.bk_biz_name }}</el-link>
        </template>
      </el-table-column>
      <el-table-column prop="bk_biz_maintainer" label="运维人员" width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.bk_biz_maintainer || '-' }}</template>
      </el-table-column>
      <el-table-column prop="bk_biz_developer" label="开发人员" width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.bk_biz_developer || '-' }}</template>
      </el-table-column>
      <el-table-column prop="life_cycle" label="生命周期" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.life_cycle === '1'" size="small">测试中</el-tag>
          <el-tag v-else-if="row.life_cycle === '2'" size="small" type="success">已上线</el-tag>
          <el-tag v-else-if="row.life_cycle === '3'" size="small" type="info">停运</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="time_zone" label="时区" width="150" />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="goTopo(row)">查看拓扑</el-button>
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
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { searchBusiness } from '../api/cmdb'

const router = useRouter()
const keyword = ref('')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const rows = ref([])
const loading = ref(false)

const filtered = computed(() =>
  keyword.value
    ? rows.value.filter((r) => (r.bk_biz_name || '').includes(keyword.value))
    : rows.value
)

async function load() {
  loading.value = true
  try {
    const data = await searchBusiness({ start: (page.value - 1) * pageSize, limit: pageSize })
    rows.value = data?.info || []
    total.value = data?.count || 0
  } finally {
    loading.value = false
  }
}

function goDetail(row) {
  router.push({ path: `/resource/business/details/${row.bk_biz_id}` })
}

function goTopo(row) {
  router.push({ path: '/business/topo', query: { biz: row.bk_biz_id } })
}


onMounted(load)
</script>
