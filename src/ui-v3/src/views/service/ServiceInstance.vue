<template>
  <div class="page-card">
    <div class="table-toolbar">
      <el-select v-model="bizId" placeholder="选择业务" filterable style="width: 260px" @change="load">
        <el-option v-for="b in bizList" :key="b.bk_biz_id" :label="b.bk_biz_name" :value="b.bk_biz_id" />
      </el-select>
      <div class="spacer" />
      <el-button :icon="'Refresh'" :disabled="!bizId" @click="load">刷新</el-button>
    </div>

    <template v-if="bizId">
      <el-table :data="rows" v-loading="loading" stripe>
        <el-table-column prop="id" label="实例 ID" width="100" />
        <el-table-column prop="name" label="服务实例名称" min-width="220" show-overflow-tooltip />
        <el-table-column label="主机" width="150">
          <template #default="{ row }">{{ row.bk_host_innerip || row.host?.bk_host_innerip || '-' }}</template>
        </el-table-column>
        <el-table-column label="进程数" width="100">
          <template #default="{ row }">
            <el-button link type="primary" @click="showProcesses(row)">{{ row.process_count ?? '查看' }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        style="margin-top: 16px; justify-content: flex-end"
        @current-change="load"
      />
      <el-empty v-if="!loading && rows.length === 0" description="该业务暂无服务实例(需先将主机转移到模块并创建)" :image-size="80" />
    </template>
    <el-empty v-else description="请先选择业务" />

    <el-drawer v-model="procDrawer" :title="`「${procInstName}」进程实例`" size="55%">
      <el-table :data="processes" v-loading="procLoading" size="default">
        <el-table-column label="进程名称" min-width="130">
          <template #default="{ row }">{{ row.process?.bk_func_name || row.bk_func_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="监听 IP" width="130">
          <template #default="{ row }">{{ row.process?.bk_bind_ip || '-' }}</template>
        </el-table-column>
        <el-table-column label="端口" width="110">
          <template #default="{ row }">{{ row.process?.port || '-' }}</template>
        </el-table-column>
        <el-table-column label="启动用户" width="110">
          <template #default="{ row }">{{ row.process?.user || '-' }}</template>
        </el-table-column>
        <el-table-column label="工作路径" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.process?.work_path || '-' }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!procLoading && processes.length === 0" description="该服务实例暂无进程" :image-size="80" />
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchBusiness, searchServiceInstances, deleteServiceInstances, searchProcessInstances
} from '../../api/cmdb'

const bizId = ref(null)
const bizList = ref([])
const rows = ref([])
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)

const procDrawer = ref(false)
const procInstName = ref('')
const procLoading = ref(false)
const processes = ref([])

async function load() {
  if (!bizId.value) return
  loading.value = true
  try {
    const data = await searchServiceInstances(bizId.value, {
      start: (page.value - 1) * pageSize, limit: pageSize
    })
    rows.value = data?.info || []
    total.value = data?.count || 0
  } finally {
    loading.value = false
  }
}

async function showProcesses(row) {
  procInstName.value = row.name || `实例 ${row.id}`
  procDrawer.value = true
  procLoading.value = true
  try {
    const data = await searchProcessInstances(bizId.value, row.id, { start: 0, limit: 100 })
    processes.value = data?.info || []
  } finally {
    procLoading.value = false
  }
}

async function remove(row) {
  await ElMessageBox.confirm(`确定删除服务实例「${row.name || row.id}」?`, '删除确认', { type: 'warning' })
  await deleteServiceInstances(bizId.value, [row.id])
  ElMessage.success('已删除')
  load()
}

onMounted(async () => {
  const data = await searchBusiness({ start: 0, limit: 200 })
  bizList.value = data?.info || []
  if (bizList.value.length > 0) {
    bizId.value = bizList.value[0].bk_biz_id
    load()
  }
})
</script>
