<template>
  <div class="page-card">
    <el-tabs v-model="tab">
      <el-tab-pane label="业务集" name="bizset" />
      <el-tab-pane label="归档业务" name="archived" />
    </el-tabs>

    <!-- 业务集 -->
    <template v-if="tab === 'bizset'">
      <el-table :data="bizSets" v-loading="loading" stripe>
        <el-table-column prop="bk_biz_set_id" label="业务集 ID" width="130" />
        <el-table-column prop="bk_biz_set_name" label="业务集名称" min-width="200" />
        <el-table-column prop="bk_biz_set_desc" label="描述" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.bk_biz_set_desc || '-' }}</template>
        </el-table-column>
        <el-table-column prop="bk_biz_maintainer" label="维护人" width="140">
          <template #default="{ row }">{{ row.bk_biz_maintainer || '-' }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && bizSets.length === 0" description="暂无业务集(业务集用于将多个业务聚合管理)" :image-size="80" />
    </template>

    <!-- 归档业务 -->
    <template v-if="tab === 'archived'">
      <el-table :data="archived" v-loading="loading" stripe>
        <el-table-column prop="bk_biz_id" label="业务 ID" width="110" />
        <el-table-column prop="bk_biz_name" label="业务名称" min-width="200" />
        <el-table-column prop="bk_biz_maintainer" label="运维人员" width="160">
          <template #default="{ row }">{{ row.bk_biz_maintainer || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :loading="recovering === row.bk_biz_id" @click="recover(row)">恢复归档</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && archived.length === 0" description="暂无归档业务" :image-size="80" />
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { http } from '../../api/cmdb'

const tab = ref('bizset')
const bizSets = ref([])
const archived = ref([])
const loading = ref(false)
const recovering = ref(null)

async function load() {
  loading.value = true
  try {
    const [bs, ar] = await Promise.allSettled([
      http.post('/findmany/biz_set', { page: { start: 0, limit: 100 } }),
      http.post('/biz/search/archived', { page: { start: 0, limit: 100 } })
    ])
    if (bs.status === 'fulfilled') bizSets.value = bs.value?.info || []
    if (ar.status === 'fulfilled') archived.value = ar.value?.info || []
  } finally {
    loading.value = false
  }
}

async function recover(row) {
  recovering.value = row.bk_biz_id
  try {
    await http.put(`/biz/status/enable/${row.bk_biz_id}`)
    ElMessage.success(`业务「${row.bk_biz_name}」已恢复`)
    load()
  } finally {
    recovering.value = null
  }
}

onMounted(load)
</script>
