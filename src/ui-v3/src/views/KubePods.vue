<template>
  <div class="page-card kube-page kube-detail-page" v-loading="loading">
    <el-card shadow="never">
      <template #header>
        <div class="detail-header">
          <el-page-header v-if="isDetail" @back="goBack">
            <template #content>Pod详情<span v-if="detailName">【{{ detailName }}】</span></template>
          </el-page-header>
          <span v-else>Pod列表</span>
          <el-tag v-if="capabilities.k8s.healthy" type="success" size="small">K8s 可用</el-tag>
          <el-tag v-else type="warning" size="small">依赖阻塞</el-tag>
        </div>
      </template>

      <DependencyBlocked v-if="!capabilities.k8s.healthy" kind="pod" :reason="capabilities.k8s.reason" />

      <template v-else-if="!isDetail">
        <div class="toolbar">
          <el-input v-model="keyword" clearable placeholder="Pod 名称" style="width:260px" @keyup.enter="loadPods" />
          <el-button type="primary" @click="loadPods">查询</el-button>
        </div>
        <el-alert v-if="listError" type="error" :closable="false" show-icon style="margin: 12px 0">
          {{ listError }} <el-button link type="primary" @click="loadPods">重试</el-button>
        </el-alert>
        <el-table v-else :data="pods" v-loading="listLoading" size="small" border>
          <el-table-column prop="name" label="Pod 名称" min-width="180" />
          <el-table-column prop="namespace" label="命名空间" min-width="120" />
          <el-table-column prop="ip" label="IP" min-width="140" />
          <el-table-column prop="status" label="状态" min-width="100" />
          <el-table-column label="操作" width="90">
            <template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">详情</el-button></template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!listLoading && !listError && !pods.length" description="暂无 Pod" />
      </template>

      <template v-else-if="loadError">
        <el-alert type="error" :closable="false" show-icon>
          {{ loadError }} <el-button link type="primary" @click="loadDetail">重试</el-button>
        </el-alert>
      </template>

      <template v-else-if="podDetail">
        <div class="topology-strip">
          <span class="topology-label">拓扑路径</span>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item v-for="(item, index) in topologyItems" :key="`${item.label}-${index}`">{{ item.label }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <el-tabs v-model="activeTab" class="detail-tabs">
          <el-tab-pane label="Pod属性" name="property">
            <KubeProperties object="pod" :detail="podDetail" :attributes="podAttributes" />
          </el-tab-pane>
          <el-tab-pane label="Container(s)" name="containers">
            <KubeContainerList
              :containers="containers"
              :loading="containersLoading"
              :error="containersError"
              @open="openContainer"
              @retry="loadContainers"
            />
            <KubeProperties
              v-if="selectedContainer"
              object="container"
              :detail="selectedContainer"
              :attributes="containerAttributes"
              class="container-selected-detail"
            />
          </el-tab-pane>
        </el-tabs>
      </template>
      <el-empty v-else-if="!loading" description="未找到 Pod 详情" />
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCapabilityStore } from '../stores/capabilities'
import {
  getKubePodPath,
  searchKubeAttributes,
  searchKubeContainers,
  searchKubePods
} from '../api/cmdb'
import DependencyBlocked from './status/DependencyBlocked.vue'
import KubeProperties from './kube/KubeProperties.vue'
import KubeContainerList from './kube/KubeContainerList.vue'
import {
  KUBE_CONTAINER_DETAIL_FIELDS,
  KUBE_POD_DETAIL_FIELDS,
  KUBE_POD_LIST_FIELDS,
  normalizeKubeAttributes
} from '../utils/kube-detail'

const route = useRoute()
const router = useRouter()
const capabilities = useCapabilityStore()
const bizId = computed(() => Number(route.params.bizId || route.query.biz || localStorage.getItem('selectedBusiness')) || 0)
const podId = computed(() => Number(route.params.podId) || 0)
const containerId = computed(() => Number(route.query.containerId || route.params.containerId) || 0)
const isDetail = computed(() => !!podId.value)
const isContainerDetail = computed(() => !!containerId.value)
const activeTab = ref(isContainerDetail.value ? 'containers' : (route.query.tab || 'property'))

const pods = ref([])
const keyword = ref('')
const listLoading = ref(false)
const listError = ref('')
const podDetail = ref(null)
const podAttributes = ref([])
const containerAttributes = ref([])
const topology = ref([])
const containers = ref([])
const selectedContainer = ref(null)
const loading = ref(false)
const containersLoading = ref(false)
const containersError = ref('')
const loadError = ref('')

const detailName = computed(() => podDetail.value?.name || (podId.value ? `Pod ${podId.value}` : ''))
const topologyItems = computed(() => {
  const path = topology.value?.[0]
  if (!path) return [{ label: '拓扑路径不可用' }]
  return [
    path.biz_name,
    path.cluster_name,
    path.namespace,
    path.workload_name,
    path.pod_name || detailName.value
  ].filter(Boolean).map((label) => ({ label: String(label) }))
})

function unwrapInfo(data) {
  if (Array.isArray(data)) return data
  return Array.isArray(data?.info) ? data.info : []
}

function detailRequest(fields, filter, extra = {}) {
  return {
    bk_biz_id: bizId.value,
    ...extra,
    fields,
    filter,
    page: { start: 0, limit: 1, sort: 'id', enable_count: false }
  }
}

async function loadPods() {
  if (!bizId.value || isDetail.value) return
  listLoading.value = true
  listError.value = ''
  try {
    const rules = keyword.value
      ? [{ field: 'name', operator: 'equal', value: keyword.value }]
      : []
    const data = await searchKubePods({
      bk_biz_id: bizId.value,
      filter: { condition: 'AND', rules },
      fields: KUBE_POD_LIST_FIELDS,
      page: { start: 0, limit: 100, sort: 'name', enable_count: false }
    })
    pods.value = unwrapInfo(data)
  } catch (error) {
    pods.value = []
    listError.value = error?.message || 'K8s 查询失败'
  } finally { listLoading.value = false }
}

async function loadContainers() {
  if (!isDetail.value) return
  containersLoading.value = true
  containersError.value = ''
  try {
    const data = await searchKubeContainers({
      bk_biz_id: bizId.value,
      bk_pod_id: podId.value,
      fields: KUBE_CONTAINER_DETAIL_FIELDS,
      page: { start: 0, limit: 100, sort: 'id', enable_count: false }
    })
    containers.value = unwrapInfo(data)
    selectedContainer.value = isContainerDetail.value
      ? containers.value.find((row) => Number(row.id) === containerId.value) || null
      : null
    if (isContainerDetail.value && !selectedContainer.value) {
      throw new Error('Container 不存在或不属于当前 Pod')
    }
    if (isContainerDetail.value) {
      const attributes = await searchKubeAttributes('container', bizId.value)
      containerAttributes.value = normalizeKubeAttributes(attributes, 'container')
    }
  } catch (error) {
    containers.value = []
    selectedContainer.value = null
    containersError.value = error?.message || 'Container 查询失败'
    if (isContainerDetail.value) throw error
  } finally { containersLoading.value = false }
}

async function loadDetail() {
  if (!isDetail.value || !bizId.value) return
  loading.value = true
  loadError.value = ''
  try {
    const filter = { condition: 'AND', rules: [{ field: 'id', operator: 'equal', value: podId.value }] }
    const data = await searchKubePods(detailRequest(KUBE_POD_DETAIL_FIELDS, filter))
    podDetail.value = unwrapInfo(data)[0] || null
    if (!podDetail.value) throw new Error('Pod 不存在或不属于当前业务')
    const [attributes, path] = await Promise.all([
      searchKubeAttributes('pod', bizId.value),
      getKubePodPath({ bk_biz_id: bizId.value, ids: [podId.value] })
    ])
    podAttributes.value = normalizeKubeAttributes(attributes, 'pod')
    topology.value = unwrapInfo(path)
    await loadContainers()
  } catch (error) {
    podDetail.value = null
    loadError.value = error?.message || 'K8s 查询失败'
  } finally { loading.value = false }
}

function openDetail(row) { router.push(`/business/${bizId.value}/pod/${row.id}`) }
function openContainer(row) {
  router.push(`/business/${bizId.value}/pod/${podId.value}?containerId=${row.id}&tab=containers`)
}
function goBack() {
  router.push(isContainerDetail.value ? `/business/${bizId.value}/pod/${podId.value}` : `/business/${bizId.value}/pod`)
}

watch(() => route.query.tab, (tab) => {
  if (tab) activeTab.value = tab
})
watch([podId, containerId], () => {
  if (capabilities.k8s.healthy) loadDetail()
})

onMounted(async () => {
  await capabilities.ensureLoaded()
  if (!capabilities.k8s.healthy) return
  if (isDetail.value) loadDetail()
  else loadPods()
})
</script>

<style scoped>
.kube-detail-page { min-height: 100%; }
.detail-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.topology-strip { display: flex; align-items: center; gap: 16px; padding: 4px 0 18px; color: #63656e; }
.topology-label { color: #313238; font-weight: 600; white-space: nowrap; }
.detail-tabs :deep(.el-tabs__content) { min-height: 320px; }
.container-selected-detail { margin-top: 18px; }
</style>
