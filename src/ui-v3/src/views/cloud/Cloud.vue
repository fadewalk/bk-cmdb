<template>
  <div class="page-card">
    <h1 class="page-title sr-only">云资源</h1>
    <el-alert type="warning" :closable="false" style="margin-bottom: 16px"
      title="云资源同步依赖云供应商对接插件;独立部署模式下未对接云厂商,此处仅有云区域(直连区域)可用" />

    <el-tabs v-model="tab">
      <el-tab-pane label="云区域" name="area" />
      <el-tab-pane label="云账户" name="account" />
    </el-tabs>

    <!-- 云区域 -->
    <template v-if="tab === 'area'">
      <div class="toolbar">
        <el-button size="small" type="primary" :icon="'Plus'" @click="openAreaDialog()">新建区域</el-button>
        <div class="spacer" />
        <el-input v-model="areaKeyword" size="small" clearable placeholder="按名称搜索" style="width: 220px"
          @input="filterAreas" />
        <el-button size="small" :icon="'Refresh'" @click="load">刷新</el-button>
      </div>
      <el-table :data="filteredAreas" v-loading="loading" stripe>
        <el-table-column prop="bk_cloud_id" label="云区域 ID" width="120" />
        <el-table-column prop="bk_cloud_name" label="云区域名称" min-width="180" />
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.bk_status === '1'" size="small" type="success">正常</el-tag>
            <el-tag v-else size="small" type="danger">异常</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="bk_created_at" label="创建时间" min-width="160">
          <template #default="{ row }">{{ (row.bk_created_at || '').replace('T', ' ').slice(0, 16) || '--' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openAreaDialog(row)">编辑</el-button>
            <el-button link type="danger" @click="removeArea(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && filteredAreas.length === 0" description="暂无云区域" :image-size="80" />
    </template>

    <!-- 云账户 -->
    <template v-if="tab === 'account'">
      <div class="toolbar">
        <el-button size="small" type="primary" :icon="'Plus'" disabled>新建账户(需对接云厂商)</el-button>
        <div class="spacer" />
        <el-button size="small" :icon="'Refresh'" @click="load">刷新</el-button>
      </div>
      <el-table :data="accounts" v-loading="loading" stripe>
        <el-table-column prop="bk_account_id" label="账户 ID" width="110" />
        <el-table-column prop="bk_account_name" label="账户名称" min-width="160" />
        <el-table-column prop="bk_cloud_vendor" label="云厂商" width="140" />
        <el-table-column prop="bk_desc" label="描述" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.bk_desc || '-' }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && accounts.length === 0" description="暂无云账户(需对接云厂商后创建)" :image-size="80" />
    </template>

    <!-- 云区域编辑对话框 -->
    <el-dialog v-model="areaDialog" :title="areaEditing ? '编辑云区域' : '新建云区域'" width="480px">
      <el-form :model="areaForm" label-width="100px" :rules="areaRules" ref="areaFormRef">
        <el-form-item label="区域 ID" prop="bk_cloud_id">
          <el-input v-model.number="areaForm.bk_cloud_id" :disabled="!!areaEditing" placeholder="数字,0 为默认区域" />
        </el-form-item>
        <el-form-item label="区域名称" prop="bk_cloud_name">
          <el-input v-model="areaForm.bk_cloud_name" placeholder="如:aliyun-华东1" />
        </el-form-item>
        <el-form-item label="状态" prop="bk_status">
          <el-select v-model="areaForm.bk_status" style="width: 100%">
            <el-option label="正常" value="1" />
            <el-option label="异常" value="2" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="areaDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitArea">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchCloudAreas, createCloudArea, updateCloudArea, deleteCloudArea,
  searchCloudAccounts
} from '../../api/cmdb'

const route = useRoute()
const tab = ref(route.meta.tab || 'area')
const areas = ref([])
const accounts = ref([])
const loading = ref(false)
const saving = ref(false)
const areaKeyword = ref('')

const areaDialog = ref(false)
const areaEditing = ref(null)
const areaFormRef = ref(null)
const areaForm = ref({ bk_cloud_id: undefined, bk_cloud_name: '', bk_status: '1' })
const areaRules = {
  bk_cloud_id: [{ required: true, message: '请输入区域 ID', trigger: 'blur' }],
  bk_cloud_name: [{ required: true, message: '请输入名称', trigger: 'blur' }]
}

const filteredAreas = computed(() => {
  const kw = areaKeyword.value.trim().toLowerCase()
  if (!kw) return areas.value
  return areas.value.filter((a) => (a.bk_cloud_name || '').toLowerCase().includes(kw))
})
function filterAreas() { /* computed 自动 */ }

function openAreaDialog(row) {
  areaEditing.value = row || null
  if (row) {
    areaForm.value = { bk_cloud_id: row.bk_cloud_id, bk_cloud_name: row.bk_cloud_name, bk_status: row.bk_status || '1' }
  } else {
    const nextId = Math.max(0, ...areas.value.map((a) => a.bk_cloud_id || 0)) + 1
    areaForm.value = { bk_cloud_id: nextId, bk_cloud_name: '', bk_status: '1' }
  }
  areaDialog.value = true
}

async function submitArea() {
  await areaFormRef.value.validate()
  saving.value = true
  try {
    const payload = { ...areaForm.value }
    if (areaEditing.value) {
      await updateCloudArea(areaEditing.value.bk_cloud_id, payload)
      ElMessage.success('已更新')
    } else {
      await createCloudArea(payload)
      ElMessage.success('已创建')
    }
    areaDialog.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function removeArea(row) {
  await ElMessageBox.confirm(`确定删除云区域「${row.bk_cloud_name || row.bk_cloud_id}」?`, '删除确认', { type: 'warning' })
  await deleteCloudArea(row.bk_cloud_id)
  ElMessage.success('已删除')
  load()
}

async function load() {
  loading.value = true
  try {
    const [a, acc] = await Promise.allSettled([
      searchCloudAreas({ start: 0, limit: 200 }),
      searchCloudAccounts({ start: 0, limit: 100 })
    ])
    if (a.status === 'fulfilled') areas.value = a.value?.info || []
    if (acc.status === 'fulfilled') accounts.value = acc.value?.info || []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.toolbar .spacer { flex: 1; }
</style>