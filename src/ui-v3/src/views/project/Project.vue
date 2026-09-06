<template>
  <div class="page-card">
    <div class="table-toolbar">
      <el-input v-model="keyword" placeholder="请输入关键字" clearable style="width: 260px" :prefix-icon="'Search'" />
      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="load">刷新</el-button>
    </div>

    <el-table :data="filtered" v-loading="loading" stripe>
      <el-table-column prop="bk_project_id" label="项目 ID" width="110" />
      <el-table-column prop="bk_project_name" label="项目名称" min-width="200" show-overflow-tooltip />
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
// 项目列表(资源导航「项目」):老版 MENU_RESOURCE_PROJECT,走通用实例查询
import { ref, computed, onMounted } from 'vue'
import { http } from '../../api/cmdb'

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

async function load() {
  loading.value = true
  try {
    // 项目是独立模型(bk_project),按通用模型实例查询
    const data = await http.post('/create/generalmodel/query', {}).catch(() => null)
    if (data?.info) { rows.value = data.info; return }
    // fallback: 尝试通用实例搜索
    const alt = await http.post('/find/instance', {
      bk_obj_id: 'project',
      page: { start: 0, limit: 200 }
    }).catch(() => null)
    rows.value = alt?.info || []
  } finally { loading.value = false }
}

onMounted(load)
</script>
