<template>
  <div class="page-card">
    <el-alert type="warning" :closable="false" style="margin-bottom: 16px"
      title="云资源发现依赖云供应商对接插件;独立部署模式下未对接云厂商,此功能无数据来源" />

    <div class="table-toolbar">
      <span style="font-size: 14px; font-weight: 600; color: #313238">发现任务</span>
      <div class="spacer" />
      <el-button :icon="'Refresh'" size="small" @click="load">刷新</el-button>
    </div>
    <el-table :data="tasks" v-loading="loading" stripe>
      <el-table-column prop="task_id" label="任务 ID" width="120" />
      <el-table-column prop="bk_task_name" label="任务名" min-width="180" show-overflow-tooltip />
      <el-table-column prop="bk_account_name" label="云账户" min-width="140" />
      <el-table-column prop="bk_status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="statusTag(row.bk_status)">{{ statusText(row.bk_status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="last_time" label="最近执行" min-width="160" />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="showTaskDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && tasks.length === 0" description="暂无发现任务" :image-size="60" />

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
import { ElMessage } from 'element-plus'
import { http, searchCloudAccounts, listCloudSyncTask } from '../../api/cmdb'

const accounts = ref([])
const tasks = ref([])
const loading = ref(false)

function statusText(s) {
  return { running: '执行中', success: '成功', failed: '失败', waiting: '等待' }[s] || s || '--'
}
function statusTag(s) {
  return { success: 'success', failed: 'danger', running: 'warning', waiting: 'info' }[s] || 'info'
}

async function load() {
  loading.value = true
  try {
    const [acc, tk] = await Promise.allSettled([
      searchCloudAccounts({ start: 0, limit: 100 }),
      listCloudSyncTask({ page: { start: 0, limit: 100 } })
    ])
    accounts.value = acc.status === 'fulfilled' ? (acc.value?.info || []) : []
    tasks.value = tk.status === 'fulfilled' ? (tk.value?.info || []) : []
  } catch (e) {
    ElMessage.error('加载失败: ' + (e?.message || '后端异常'))
  } finally {
    loading.value = false
  }
}

function showTaskDetail(row) {
  ElMessage.info(`任务 ${row.task_id}: ${row.bk_status} / ${row.bk_message || '无消息'}`)
}

onMounted(load)
</script>
