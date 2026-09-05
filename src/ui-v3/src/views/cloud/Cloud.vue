<template>
  <div class="page-card">
    <h1 class="page-title">云资源</h1>
    <el-alert type="warning" :closable="false" style="margin-bottom: 16px"
      title="云资源同步依赖云供应商对接插件;独立部署模式下未对接云厂商,此处仅有云区域(直连区域)可用" />

    <el-tabs v-model="tab">
      <el-tab-pane label="云区域" name="area" />
      <el-tab-pane label="云账户" name="account" />
    </el-tabs>

    <el-table v-if="tab === 'area'" :data="areas" v-loading="loading" stripe>
      <el-table-column prop="bk_cloud_id" label="云区域 ID" width="120" />
      <el-table-column prop="bk_cloud_name" label="云区域名称" min-width="180" />
      <el-table-column label="类型" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.bk_status === '1'" size="small" type="success">正常</el-tag>
          <el-tag v-else size="small" type="danger">异常</el-tag>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="tab === 'area' && !loading && areas.length === 0" description="暂无云区域" :image-size="80" />

    <el-table v-if="tab === 'account'" :data="accounts" v-loading="loading" stripe>
      <el-table-column prop="bk_account_id" label="账户 ID" width="110" />
      <el-table-column prop="bk_account_name" label="账户名称" min-width="160" />
      <el-table-column prop="bk_cloud_vendor" label="云厂商" width="140" />
      <el-table-column prop="bk_desc" label="描述" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.bk_desc || '-' }}</template>
      </el-table-column>
    </el-table>
    <el-empty v-if="tab === 'account' && !loading && accounts.length === 0" description="暂无云账户(需对接云厂商后创建)" :image-size="80" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { http } from '../../api/cmdb'

const route = useRoute()
const tab = ref(route.meta.tab || 'area')
// 管控区域/云账户为独立菜单入口,tab 由路由 meta 指定
const areas = ref([])
const accounts = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const [a, acc] = await Promise.allSettled([
      http.post('/findmany/cloud/area', { page: { start: 0, limit: 100 } }),
      http.post('/findmany/cloud/account', { page: { start: 0, limit: 100 } })
    ])
    if (a.status === 'fulfilled') areas.value = a.value?.info || []
    if (acc.status === 'fulfilled') accounts.value = acc.value?.info || []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
