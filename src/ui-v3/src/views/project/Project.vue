<template>
  <div class="page-card">
    <div class="table-toolbar">
      <el-input v-model="keyword" placeholder="请输入关键字" clearable style="width: 260px" :prefix-icon="'Search'" />
      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="load">刷新</el-button>
    </div>

    <el-table :data="filtered" v-loading="loading" stripe>
      <el-table-column prop="bk_project_id" label="项目 ID" width="110" />
      <el-table-column prop="bk_project_name" label="项目名称" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <el-link type="primary" :underline="false" @click="goDetail(row)">{{ row.bk_project_name }}</el-link>
        </template>
      </el-table-column>
      <el-table-column prop="project_desc" label="描述" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">{{ row.project_desc || row.bk_project_desc || '-' }}</template>
      </el-table-column>
      <el-table-column prop="bk_project_maintainer" label="维护人" width="160">
        <template #default="{ row }">{{ row.bk_project_maintainer || '-' }}</template>
      </el-table-column>
      <el-table-column prop="create_time" label="创建时间" width="170">
        <template #default="{ row }">{{ (row.create_time || '').replace('T', ' ').slice(0, 19) || '-' }}</template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && filtered.length === 0" description="暂无项目" :image-size="80" />
  </div>
</template>

<script setup>
// 项目列表(资源导航「项目」):专用接口 /findmany/project
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { http } from '../../api/cmdb'

const router = useRouter()
const keyword = ref('')
const loading = ref(false)
const rows = ref([])

const filtered = computed(() => {
  if (!keyword.value.trim()) return rows.value
  const k = keyword.value.trim().toLowerCase()
  return rows.value.filter((r) =>
    (r.bk_project_name || '').toLowerCase().includes(k) ||
    (r.project_desc || r.bk_project_desc || '').toLowerCase().includes(k)
  )
})

function goDetail(row) {
  router.push({ path: `/resource/project/details/${row.bk_project_id}` })
}

async function load() {
  loading.value = true
  try {
    const data = await http.post('/findmany/project', { page: { start: 0, limit: 200 } })
    rows.value = data?.info || []
  } catch {
    rows.value = []
  } finally { loading.value = false }
}

onMounted(load)
</script>
