<template>
  <div class="page-card">
    <div class="table-toolbar">
      <span class="hint">字段组合模板:将一组字段配置复用到多个模型</span>
      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="load">刷新</el-button>
    </div>
    <el-table :data="rows" v-loading="loading" stripe>
      <el-table-column prop="id" label="模板 ID" width="110" />
      <el-table-column prop="name" label="模板名称" min-width="200" />
      <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">{{ row.description || '-' }}</template>
      </el-table-column>
      <el-table-column label="绑定模型数" width="120">
        <template #default="{ row }">{{ row.bind_object_info?.length || 0 }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="showDetail(row)">查看字段</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && rows.length === 0" description="暂无字段组合模板" :image-size="80" />

    <el-drawer v-model="detailVisible" :title="`「${detail?.name}」模板字段`" size="45%">
      <el-table :data="detailFields" size="default">
        <el-table-column prop="field.bk_property_id" label="字段 ID" min-width="140" />
        <el-table-column prop="field.bk_property_name" label="字段名称" min-width="120" />
        <el-table-column prop="field.bk_property_type" label="类型" width="110" />
      </el-table>
      <el-empty v-if="detailFields.length === 0" description="该模板暂无字段" :image-size="80" />
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { http } from '../../api/cmdb'

const rows = ref([])
const loading = ref(false)
const detailVisible = ref(false)
const detail = ref(null)
const detailFields = ref([])

async function load() {
  loading.value = true
  try {
    const data = await http.post('/findmany/field_template', { page: { start: 0, limit: 100 } })
    rows.value = data?.info || []
  } finally {
    loading.value = false
  }
}

async function showDetail(row) {
  detail.value = row
  detailVisible.value = true
  const data = await http.get(`/find/field_template/${row.id}`)
  detailFields.value = data?.attributes || data?.fields || []
}

onMounted(load)
</script>

<style scoped>
.hint { color: #979BA5; }
</style>
