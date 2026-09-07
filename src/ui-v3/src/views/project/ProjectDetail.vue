<template>
  <div class="page-card biz-detail" v-loading="loading">
    <div class="crumb-row">
      <span class="back-btn" @click="goBack">‹ 项目</span>
      <span class="crumb-title">项目详情【{{ detail?.bk_project_name || id }}】</span>
    </div>

    <el-tabs v-model="tab" class="detail-tabs">
      <el-tab-pane label="属性" name="property" />
      <el-tab-pane label="变更历史" name="history" />
    </el-tabs>

    <template v-if="tab === 'property'">
      <el-descriptions v-if="detail" :column="2" border size="small" class="props">
        <el-descriptions-item v-for="(v, k) in props" :key="k" :label="k">
          {{ v === null || v === '' || v === undefined ? '--' : v }}
        </el-descriptions-item>
      </el-descriptions>
      <el-empty v-else-if="!loading" description="项目不存在" />
    </template>

    <template v-else>
      <el-table :data="auditRows" v-loading="auditLoading" size="small" stripe>
        <el-table-column label="操作人" prop="user" width="120" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">{{ row.action || '--' }}</template>
        </el-table-column>
        <el-table-column label="对象" prop="resource_name" min-width="160" show-overflow-tooltip />
        <el-table-column label="时间" min-width="160">
          <template #default="{ row }">{{ (row.operation_time || '').replace('T', ' ').slice(0, 19) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!auditLoading && auditRows.length === 0" description="暂无变更记录" :image-size="70" />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { http, searchInstAudit } from '../../api/cmdb'

const route = useRoute()
const router = useRouter()
const id = computed(() => Number(route.params.projectId) || null)

const tab = ref('property')
const detail = ref(null)
const loading = ref(false)
const auditLoading = ref(false)
const auditRows = ref([])

const props = computed(() => {
  if (!detail.value) return {}
  const out = {}
  for (const [k, v] of Object.entries(detail.value)) {
    if (v === null || typeof v !== 'object') out[k] = v
  }
  return out
})

function goBack() { router.push('/resource/project') }

async function loadDetail() {
  if (!id.value) return
  loading.value = true
  try {
    const data = await http.post('/findmany/project', { page: { start: 0, limit: 200 } })
    detail.value = ((data?.info || []).find((p) => p.bk_project_id === id.value)) || null
  } finally { loading.value = false }
}

async function loadAudit() {
  if (!id.value) return
  auditLoading.value = true
  try {
    const data = await searchInstAudit({
      condition: { bk_obj_id: 'project', resource_type: 'project', resource_id: id.value },
      page: { start: 0, limit: 50, sort: '-operation_time' }
    })
    auditRows.value = data?.info || []
  } catch {
    auditRows.value = []
  } finally { auditLoading.value = false }
}

watch(tab, (v) => {
  if (v === 'history' && !auditRows.value.length && !auditLoading.value) loadAudit()
})

onMounted(loadDetail)
</script>

<style scoped>
.biz-detail { height: 100%; overflow-y: auto; }
.crumb-row { display: flex; align-items: center; gap: 10px; padding: 0 4px; height: 50px; line-height: 50px; }
.back-btn { cursor: pointer; color: #3A84FF; font-size: 14px; }
.crumb-title { font-size: 14px; color: #313238; }
.detail-tabs { margin-bottom: 14px; }
</style>
