<template>
  <div class="page-card">
    <el-row :gutter="16">
      <el-col :span="8" v-for="card in cards" :key="card.title">
        <el-card shadow="never">
          <div class="stat">
            <div class="stat-icon" :style="{ background: card.color }">
              <el-icon :size="24" color="#fff"><component :is="card.icon" /></el-icon>
            </div>
            <div>
              <div class="stat-value">{{ card.value ?? '...' }}</div>
              <div class="stat-title">{{ card.title }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" style="margin-top: 16px">
      <template #header>模型实例统计</template>
      <el-table :data="stats" v-loading="loading" size="default">
        <el-table-column prop="bk_obj_id" label="模型 ID" width="200" />
        <el-table-column prop="bk_obj_name" label="模型名称" min-width="180" />
        <el-table-column prop="instance_count" label="实例数量" width="140" sortable />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { searchBusiness, listHostsWithoutApp, getModelStatistics } from '../api/cmdb'

const cards = ref([
  { title: '业务总数', value: null, icon: 'OfficeBuilding', color: '#3a84ff' },
  { title: '资源池主机', value: null, icon: 'Monitor', color: '#2dcb56' },
  { title: '模型总数', value: null, icon: 'Grid', color: '#ff9c01' }
])
const stats = ref([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const [biz, host, modelStat] = await Promise.allSettled([
      searchBusiness({ start: 0, limit: 1 }),
      listHostsWithoutApp({ start: 0, limit: 1 }),
      getModelStatistics()
    ])
    if (biz.status === 'fulfilled') cards.value[0].value = biz.value?.count ?? 0
    if (host.status === 'fulfilled') cards.value[1].value = host.value?.count ?? 0
    if (modelStat.status === 'fulfilled') {
      const list = Array.isArray(modelStat.value) ? modelStat.value : []
      cards.value[2].value = list.length
      stats.value = [...list].sort((a, b) => (b.instance_count || 0) - (a.instance_count || 0))
    }
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.stat { display: flex; align-items: center; gap: 14px; }
.stat-icon {
  width: 48px; height: 48px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
}
.stat-value { font-size: 24px; font-weight: 700; line-height: 1.2; }
.stat-title { color: #979ba5; font-size: 13px; }
</style>
