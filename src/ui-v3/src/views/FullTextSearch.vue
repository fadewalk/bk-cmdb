<template>
  <div class="page-card fulltext-page">
    <el-card shadow="never">
      <template #header>全文检索 <el-tag v-if="capabilities.es.healthy" type="success" size="small">ES 可用</el-tag></template>
      <template v-if="capabilities.es.healthy">
        <div class="search-row"><el-input v-model="keyword" clearable placeholder="请输入搜索内容(最多50个字符)" @keyup.enter="search" /><el-button type="primary" :loading="loading" @click="search">搜索</el-button></div>
        <el-empty v-if="searched && !hits.length && !loading" description="未搜索到结果" />
        <div v-for="hit in hits" :key="`${hit.kind}-${hit.key}`" class="result-item"><div class="result-head"><el-tag size="small">{{ hit.kind }}</el-tag><strong>{{ hit.key }}</strong></div><pre>{{ JSON.stringify(hit.source || {}, null, 2) }}</pre></div>
      </template>
      <DependencyBlocked v-else kind="es" :reason="capabilities.es.reason" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { searchFullText } from '../api/cmdb'
import { useCapabilityStore } from '../stores/capabilities'
import DependencyBlocked from './status/DependencyBlocked.vue'
const capabilities = useCapabilityStore(); const keyword = ref(''); const loading = ref(false); const searched = ref(false); const hits = ref([])
async function search() {
  if (!keyword.value.trim()) return
  loading.value = true; searched.value = true
  try {
    const data = await searchFullText({ bk_biz_id: Number(localStorage.getItem('selectedBusiness')) || 0, filter: { models: [], instances: [] }, query_string: keyword.value.trim().slice(0, 50), page: { start: 0, limit: 20 } })
    hits.value = data?.hits || []
  } catch { hits.value = [] } finally { loading.value = false }
}
onMounted(() => capabilities.ensureLoaded())
</script>
<style scoped>.search-row{display:flex;gap:8px;margin-bottom:16px}.search-row .el-input{max-width:520px}.result-item{padding:12px 0;border-bottom:1px solid #ebeef5}.result-head{display:flex;align-items:center;gap:8px}.result-item pre{white-space:pre-wrap;color:#606266;font-size:12px}</style>
