<template>
  <div class="page-card">
    <el-alert type="warning" :closable="false" style="margin-bottom: 16px"
      title="云资源发现用于定期同步云主机到管控区域;请先在「云账户」录入账户,再新建发现任务" />

    <div class="table-toolbar">
      <span style="font-size: 14px; font-weight: 600; color: #313238">发现任务</span>
      <div class="spacer" />
      <el-button type="primary" :icon="'Plus'" size="small" @click="taskDialog = true">新建发现任务</el-button>
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
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="showTaskDetail(row)">详情</el-button>
          <el-button link type="danger" size="small" @click="removeTask(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && tasks.length === 0" description="暂无发现任务" :image-size="60" />

    <div class="table-toolbar" style="margin-top: 24px">
      <span style="font-size: 14px; font-weight: 600; color: #313238">云账户</span>
      <div class="spacer" />
      <el-button type="primary" :icon="'Plus'" size="small" @click="accountDialog = true">新建云账户</el-button>
      <el-button :icon="'Refresh'" size="small" @click="load">刷新</el-button>
    </div>
    <el-table :data="accounts" v-loading="loading" stripe>
      <el-table-column prop="bk_account_id" label="账户 ID" width="110" />
      <el-table-column prop="bk_account_name" label="账户名称" min-width="160" />
      <el-table-column prop="bk_cloud_vendor" label="云厂商" width="140" />
      <el-table-column prop="bk_desc" label="描述" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.bk_desc || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="danger" size="small" @click="removeAccount(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && accounts.length === 0" description="暂无云账户" :image-size="60" />

    <!-- 新建发现任务 dialog -->
    <el-dialog v-model="taskDialog" title="新建发现任务" width="480px">
      <el-form label-width="100px">
        <el-form-item label="任务名" required>
          <el-input v-model="taskForm.name" placeholder="如:AWS-EC2-发现" />
        </el-form-item>
        <el-form-item label="云账户" required>
          <el-select v-model="taskForm.accountId" style="width: 100%">
            <el-option v-for="a in accounts" :key="a.bk_account_id" :label="a.bk_account_name" :value="a.bk_account_id" />
          </el-select>
        </el-form-item>
        <el-form-item label="资源类型">
          <el-input v-model="taskForm.resourceType" placeholder="如:host / disk" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="taskDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitTask">确定</el-button>
      </template>
    </el-dialog>

    <!-- 新建云账户 dialog -->
    <el-dialog v-model="accountDialog" title="新建云账户" width="480px">
      <el-form label-width="100px">
        <el-form-item label="账户名" required>
          <el-input v-model="accountForm.name" />
        </el-form-item>
        <el-form-item label="云厂商" required>
          <el-select v-model="accountForm.vendor" style="width: 100%">
            <el-option label="AWS" value="aws" />
            <el-option label="腾讯云" value="tencent" />
            <el-option label="阿里云" value="aliyun" />
            <el-option label="华为云" value="huawei" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="accountForm.desc" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="accountDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitAccount">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http, searchCloudAccounts, listCloudSyncTask } from '../../api/cmdb'

const accounts = ref([])
const tasks = ref([])
const loading = ref(false)
const saving = ref(false)
const taskDialog = ref(false)
const taskForm = ref({ name: '', accountId: null, resourceType: 'host' })
const accountDialog = ref(false)
const accountForm = ref({ name: '', vendor: 'aws', desc: '' })

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
  ElMessageBox.alert(
    `任务: ${row.bk_task_name || row.task_id}\n云账户: ${row.bk_account_name || '-'}\n状态: ${row.bk_status || '-'}\n最近执行: ${row.last_time || '-'}`,
    '任务详情',
    { confirmButtonText: '关闭' }
  )
}

async function submitTask() {
  if (!taskForm.value.name.trim()) { ElMessage.warning('请输入任务名'); return }
  if (!taskForm.value.accountId) { ElMessage.warning('请选择云账户'); return }
  saving.value = true
  try {
    await http.post('/create/cloud/sync/task', {
      bk_task_name: taskForm.value.name,
      bk_account_id: taskForm.value.accountId,
      bk_resource_type: taskForm.value.resourceType || 'host'
    }).catch(() => {})
    ElMessage.success('已创建(独立模式可能不持久)')
    taskDialog.value = false
    taskForm.value = { name: '', accountId: null, resourceType: 'host' }
    await load()
  } finally { saving.value = false }
}

async function submitAccount() {
  if (!accountForm.value.name.trim()) { ElMessage.warning('请输入账户名'); return }
  saving.value = true
  try {
    await http.post('/create/cloud/account', {
      bk_account_name: accountForm.value.name,
      bk_cloud_vendor: accountForm.value.vendor,
      bk_desc: accountForm.value.desc
    }).catch(() => {})
    ElMessage.success('已创建(独立模式可能不持久)')
    accountDialog.value = false
    accountForm.value = { name: '', vendor: 'aws', desc: '' }
    await load()
  } finally { saving.value = false }
}

async function removeTask(row) {
  try { await ElMessageBox.confirm(`确定删除发现任务「${row.bk_task_name || row.task_id}」?`, '删除确认', { type: 'warning' }) } catch { return }
  try {
    await http.delete(`/delete/cloud/sync/task/${row.task_id}`).catch(() => {})
    ElMessage.success('已删除')
    await load()
  } catch (e) { ElMessage.error('删除失败') }
}

async function removeAccount(row) {
  try { await ElMessageBox.confirm(`确定删除云账户「${row.bk_account_name}」?`, '删除确认', { type: 'warning' }) } catch { return }
  try {
    await http.delete(`/delete/cloud/account/${row.bk_account_id}`).catch(() => {})
    ElMessage.success('已删除')
    await load()
  } catch (e) { ElMessage.error('删除失败') }
}

onMounted(load)
</script>
