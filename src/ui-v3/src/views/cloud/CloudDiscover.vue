<template>
  <div class="page-card">
    <el-alert type="warning" :closable="false" style="margin-bottom: 16px"
      title="云资源发现依赖云供应商对接插件;独立部署模式下未对接云厂商,此功能无数据来源" />

    <div class="table-toolbar">
      <span style="font-size: 14px; font-weight: 600; color: #313238">发现任务</span>
      <div class="spacer" />
      <el-button type="primary" :icon="'Plus'" disabled>新建发现任务</el-button>
    </div>
    <el-empty description="暂无发现任务(需先创建云账户并对接云厂商)">
      <el-button type="primary" plain @click="$router.push('/resource/cloud-account')">前往云账户</el-button>
    </el-empty>

    <div class="table-toolbar" style="margin-top: 24px">
      <span style="font-size: 14px; font-weight: 600; color: #313238">云账户</span>
      <div class="spacer" />
      <el-button :icon="'Refresh'" size="small" @click="load">刷新</el-button>
    </div>
    <el-table :data="accounts" v-loading="loading" stripe>
      <el-table-column prop="bk_account_id" label="账户 ID" width="110" />
      <el-table-column prop="bk_account_name" label="账户名称" min-width="160" />
      <el-table-column prop="bk_cloud_vendor" label="云厂商" width="140" />
      <el-table-column prop="bk_desc" label="描述" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.bk_desc || '-' }}</template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && accounts.length === 0" description="暂无云账户" :image-size="60" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { http } from '../../api/cmdb'

const accounts = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await http.post('/findmany/cloud/account', { page: { start: 0, limit: 100 } }).catch(() => null)
    accounts.value = data?.info || []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
