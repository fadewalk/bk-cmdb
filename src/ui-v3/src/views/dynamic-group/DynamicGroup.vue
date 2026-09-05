<template>
  <div class="page-card">
    <h1 class="page-title">动态分组</h1>
    <p class="page-tips">动态分组主要用于定义常用的条件查询，在其他SaaS中可以根据动态分组快速检索目标主机</p>
    <div class="table-toolbar">
      <div class="spacer" />
      <el-button :icon="'Refresh'" :disabled="!bizId" @click="load">刷新</el-button>
    </div>

    <template v-if="bizId">
      <el-table :data="groups" v-loading="loading" stripe>
        <el-table-column prop="id" label="分组 ID" width="110" />
        <el-table-column prop="name" label="动态分组名称" min-width="200" />
        <el-table-column prop="bk_user" label="创建人" width="140">
          <template #default="{ row }">{{ row.bk_user || '-' }}</template>
        </el-table-column>
        <el-table-column prop="create_time" label="创建时间" width="180">
          <template #default="{ row }">{{ (row.create_time || '').replace('T', ' ').slice(0, 19) || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="preview(row)">预览结果</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && groups.length === 0" description="该业务暂无动态分组" :image-size="80" />
    </template>
    <el-empty v-else description="请先选择业务" />

    <el-drawer v-model="previewVisible" :title="`「${previewName}」主机预览`" size="45%">
      <el-table :data="previewHosts" v-loading="previewLoading" size="default">
        <el-table-column prop="host.bk_host_id" label="主机 ID" width="100" />
        <el-table-column label="内网 IP" min-width="150">
          <template #default="{ row }">{{ row.host?.bk_host_innerip || '-' }}</template>
        </el-table-column>
        <el-table-column label="主机名称" min-width="150">
          <template #default="{ row }">{{ row.host?.bk_host_name || '-' }}</template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchDynamicGroups, deleteDynamicGroup, executeDynamicGroup
} from '../../api/cmdb'
import { useBizStore } from '../../stores/biz'

const bizStore = useBizStore()
const bizId = computed(() => bizStore.bizId)
const bizList = computed(() => bizStore.bizList)
const groups = ref([])
const loading = ref(false)

const previewVisible = ref(false)
const previewName = ref('')
const previewHosts = ref([])
const previewLoading = ref(false)

async function load() {
  if (!bizId.value) return
  loading.value = true
  try {
    const data = await searchDynamicGroups(bizId.value, { start: 0, limit: 200 })
    groups.value = data?.info || []
  } finally { loading.value = false }
}

async function preview(row) {
  previewName.value = row.name
  previewVisible.value = true
  previewLoading.value = true
  try {
    const data = await executeDynamicGroup(bizId.value, row.id, { start: 0, limit: 100 })
    previewHosts.value = data?.info || []
  } finally { previewLoading.value = false }
}

async function remove(row) {
  await ElMessageBox.confirm(`确定删除动态分组「${row.name}」?`, '删除确认', { type: 'warning' })
  await deleteDynamicGroup(bizId.value, row.id)
  ElMessage.success('已删除')
  load()
}

watch(bizId, () => { if (bizId.value) load() })

onMounted(async () => {
  const data = await searchBusiness({ start: 0, limit: 200 })
  bizList.value = data?.info || []
  if (bizList.value.length > 0) {
    load()
  }
})
</script>
