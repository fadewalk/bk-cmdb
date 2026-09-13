<template>
  <div class="page-card kube-page">
    <el-card shadow="never">
      <template #header>
        <div class="page-title-row"><span>{{ podId ? 'Pod 详情' : 'Pod 列表' }}</span><el-tag v-if="capabilities.k8s.healthy" type="success" size="small">K8s 可用</el-tag><el-tag v-else type="warning" size="small">依赖阻塞</el-tag></div>
      </template>
      <template v-if="capabilities.k8s.healthy">
        <div class="toolbar"><el-input v-model="keyword" clearable placeholder="Pod 名称" style="width:260px" @keyup.enter="loadPods" /><el-button type="primary" @click="loadPods">查询</el-button></div>
        <el-table :data="pods" v-loading="loading" size="small" border>
          <el-table-column prop="name" label="Pod 名称" min-width="180" />
          <el-table-column prop="namespace" label="命名空间" min-width="120" />
          <el-table-column prop="ip" label="IP" min-width="140" />
          <el-table-column prop="status" label="状态" min-width="100" />
          <el-table-column label="操作" width="90"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">详情</el-button></template></el-table-column>
        </el-table>
        <el-empty v-if="!loading && !pods.length" description="暂无 Pod" />
      </template>
      <DependencyBlocked v-else kind="pod" :reason="capabilities.k8s.reason" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { searchKubePods } from '../api/cmdb'
import { useCapabilityStore } from '../stores/capabilities'
import DependencyBlocked from './status/DependencyBlocked.vue'

const route = useRoute(); const router = useRouter(); const capabilities = useCapabilityStore()
const pods = ref([]); const loading = ref(false); const keyword = ref(''); const podId = Number(route.params.podId || 0) || null
const bizId = Number(route.params.bizId || route.query.biz || localStorage.getItem('selectedBusiness')) || 0
async function loadPods() {
  loading.value = true
  try {
    const rules = keyword.value ? [{ field: 'name', operator: 'equal', value: keyword.value }] : (podId ? [{ field: 'id', operator: 'equal', value: podId }] : [])
    const data = await searchKubePods({ bk_biz_id: bizId, filter: { condition: 'AND', rules }, fields: ['id', 'name', 'namespace', 'labels', 'ip', 'ips', 'status'], page: { start: 0, limit: 100, sort: 'name', enable_count: false } })
    pods.value = data?.info || []
  } catch { pods.value = [] } finally { loading.value = false }
}
function openDetail(row) { router.push(`/business/${bizId}/index/pod/${row.id}`) }
onMounted(async () => { await capabilities.ensureLoaded(); if (capabilities.k8s.healthy) loadPods() })
</script>
<style scoped>.page-title-row{display:flex;align-items:center;justify-content:space-between}.toolbar{display:flex;gap:8px;margin-bottom:12px}</style>
