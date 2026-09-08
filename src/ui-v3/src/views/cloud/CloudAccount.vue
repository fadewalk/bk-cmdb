<template>
  <div class="res-page">
    <div class="page-head">
      <span class="page-name">云账户</span>
    </div>

    <div class="page-body">
      <el-alert type="info" :closable="true" style="margin-bottom: 14px">
        <template #title>
          录入云账户信息后，可同步<span class="link" @click="$router.push('/resource/cloud-discover')">云资源</span>到蓝鲸配置平台
        </template>
      </el-alert>

      <div class="table-toolbar">
        <el-button type="primary" @click="formVisible = true">新建</el-button>
        <div class="spacer" />
        <el-input
          v-model="keyword"
          placeholder="请输入账户名称"
          clearable
          style="width: 280px"
          :prefix-icon="'Search'"
          @keyup.enter="load"
          @clear="load"
        />
      </div>

      <el-table :data="filtered" v-loading="loading" stripe>
        <el-table-column prop="bk_account_name" label="账户名称" min-width="160" show-overflow-tooltip />
        <el-table-column label="账户类型" width="140">
          <template #default="{ row }">{{ vendorName(row.bk_cloud_vendor) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default>--</template>
        </el-table-column>
        <el-table-column label="修改人" prop="bk_updated_by" width="130">
          <template #default="{ row }">{{ row.bk_updated_by || '--' }}</template>
        </el-table-column>
        <el-table-column label="修改时间" width="170">
          <template #default="{ row }">{{ fmtTime(row.last_time) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!loading && filtered.length === 0" class="empty-block">
        <p class="empty-title">暂无数据</p>
        <p class="empty-sub">您还未创建云账户，<span class="link" @click="formVisible = true">立即创建</span></p>
      </div>

      <div class="table-footer">
        <span>共计{{ total }}条</span>
        <span class="page-size">每页 20 条</span>
        <div class="spacer" />
        <el-pagination
          v-model:current-page="page"
          :page-size="20"
          :total="total"
          layout="prev, pager, next"
          @current-change="load"
        />
      </div>
    </div>

    <!-- 新建云账户(独立模式无云厂商对接,仅录入名称/备注) -->
    <el-dialog v-model="formVisible" title="新建云账户" width="480px">
      <el-form label-width="100px">
        <el-form-item label="账户名称" required>
          <el-input v-model="form.bk_account_name" placeholder="请输入账户名称" />
        </el-form-item>
        <el-form-item label="云厂商" required>
          <el-select v-model="form.bk_cloud_vendor" style="width: 100%">
            <el-option label="AWS" value="1" />
            <el-option label="腾讯云" value="2" />
            <el-option label="阿里云" value="4" />
          </el-select>
        </el-form-item>
        <el-form-item label="认证类型" required>
          <el-select v-model="form.bk_account_type" style="width: 100%">
            <el-option label="密钥认证" value="api_secret_key" />
          </el-select>
        </el-form-item>
        <el-form-item label="SecretId" required>
          <el-input v-model="form.bk_secret_id" placeholder="云账户访问密钥 ID" />
        </el-form-item>
        <el-form-item label="SecretKey" required>
          <el-input v-model="form.bk_secret_key" type="password" show-password placeholder="云账户访问密钥 Key" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.bk_description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 编辑云账户(契约: PUT /update/cloud/account/{id};密钥留空则不修改) -->
    <el-dialog v-model="editVisible" title="编辑云账户" width="480px">
      <el-form label-width="100px">
        <el-form-item label="账户名称" required>
          <el-input v-model="editForm.bk_account_name" />
        </el-form-item>
        <el-form-item label="云厂商">
          <el-input :model-value="vendorName(editForm.bk_cloud_vendor)" disabled />
        </el-form-item>
        <el-form-item label="SecretId">
          <el-input v-model="editForm.bk_secret_id" placeholder="留空则不修改" />
        </el-form-item>
        <el-form-item label="SecretKey">
          <el-input v-model="editForm.bk_secret_key" type="password" show-password placeholder="留空则不修改" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editForm.bk_description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 账户详情(字段 + 关联的同步任务) -->
    <el-drawer v-model="detailVisible" :title="`账户详情 【${detailRow?.bk_account_name || ''}】`" size="560px">
      <template v-if="detailRow">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="账户名称">{{ detailRow.bk_account_name || '--' }}</el-descriptions-item>
          <el-descriptions-item label="云厂商">{{ vendorName(detailRow.bk_cloud_vendor) }}</el-descriptions-item>
          <el-descriptions-item label="认证类型">密钥认证</el-descriptions-item>
          <el-descriptions-item label="SecretId">{{ detailRow.bk_secret_id || '--' }}</el-descriptions-item>
          <el-descriptions-item label="备注">{{ detailRow.bk_description || '--' }}</el-descriptions-item>
          <el-descriptions-item label="创建人">{{ detailRow.bk_creator || '--' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ fmtTime(detailRow.create_time) }}</el-descriptions-item>
          <el-descriptions-item label="修改人">{{ detailRow.bk_last_editor || '--' }}</el-descriptions-item>
          <el-descriptions-item label="修改时间">{{ fmtTime(detailRow.last_time) }}</el-descriptions-item>
        </el-descriptions>
        <div class="detail-task-title">关联的同步任务</div>
        <el-table :data="detailTasks" v-loading="detailTasksLoading" size="small">
          <el-table-column label="任务名称" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.bk_task_name || row.bk_name || `#${row.bk_task_id ?? row.id}` }}</template>
          </el-table-column>
          <el-table-column label="资源" width="100">
            <template #default="{ row }">{{ row.bk_resource_type === 'host' ? '主机' : (row.bk_resource_type || '--') }}</template>
          </el-table-column>
          <el-table-column label="最近同步时间" width="160">
            <template #default="{ row }">{{ fmtTime(row.last_sync_time || row.last_time) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!detailTasksLoading && detailTasks.length === 0" description="该账户暂未创建同步任务" :image-size="60" />
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
// 云账户:独立页面对齐老版 resource/cloud-account(空态/新建/删除)
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchCloudAccounts, createCloudAccount, deleteCloudAccount,
  updateCloudAccount, searchCloudTasks
} from '../../api/cmdb'

const keyword = ref('')
const rows = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const saving = ref(false)
const formVisible = ref(false)
const form = ref({ bk_account_name: '', bk_cloud_vendor: '2', bk_account_type: 'api_secret_key', bk_secret_id: '', bk_secret_key: '', bk_description: '' })

const editVisible = ref(false)
const editForm = ref({ id: null, bk_account_name: '', bk_cloud_vendor: '', bk_secret_id: '', bk_secret_key: '', bk_description: '' })

const detailVisible = ref(false)
const detailRow = ref(null)
const detailTasks = ref([])
const detailTasksLoading = ref(false)

const VENDORS = { '1': 'AWS', '2': '腾讯云', '4': '阿里云' }
function vendorName(v) { return VENDORS[String(v)] || '--' }
function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 19) : '--' }

const filtered = computed(() =>
  keyword.value.trim()
    ? rows.value.filter((r) => (r.bk_account_name || '').includes(keyword.value.trim()))
    : rows.value
)

async function load() {
  loading.value = true
  try {
    const data = await searchCloudAccounts({ start: (page.value - 1) * 20, limit: 20 })
    rows.value = data?.info || []
    total.value = data?.count ?? rows.value.length
  } catch {
    rows.value = []
    total.value = 0
  } finally { loading.value = false }
}

async function submitCreate() {
  if (!String(form.value.bk_account_name || '').trim()) { ElMessage.warning('请填写账户名称'); return }
  saving.value = true
  try {
    await createCloudAccount({ ...form.value })
    ElMessage.success('云账户已创建')
    formVisible.value = false

    await load()
  } catch (e) {
    ElMessage.error('创建失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}

function openEdit(row) {
  editForm.value = {
    id: row.bk_account_id,
    bk_account_name: row.bk_account_name || '',
    bk_cloud_vendor: row.bk_cloud_vendor || '',
    bk_secret_id: '',
    bk_secret_key: '',
    bk_description: row.bk_description || ''
  }
  editVisible.value = true
}

async function submitEdit() {
  if (!String(editForm.value.bk_account_name || '').trim()) { ElMessage.warning('请填写账户名称'); return }
  saving.value = true
  try {
    const data = { bk_account_name: editForm.value.bk_account_name, bk_description: editForm.value.bk_description }
    if (String(editForm.value.bk_secret_id || '').trim()) data.bk_secret_id = editForm.value.bk_secret_id
    if (String(editForm.value.bk_secret_key || '').trim()) data.bk_secret_key = editForm.value.bk_secret_key
    await updateCloudAccount(editForm.value.id, data)
    ElMessage.success('云账户已更新')
    editVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error('更新失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}

async function openDetail(row) {
  detailRow.value = row
  detailTasks.value = []
  detailVisible.value = true
  detailTasksLoading.value = true
  try {
    // 契约: mongo 风格条件按账户过滤任务
    const data = await searchCloudTasks({ bk_account_id: { $eq: [row.bk_account_id] } })
    detailTasks.value = data?.info || []
  } catch { detailTasks.value = [] } finally { detailTasksLoading.value = false }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除云账户「${row.bk_account_name}」?`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    await deleteCloudAccount(row.bk_account_id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}

onMounted(load)
</script>

<style scoped>
.res-page { height: 100%; display: flex; flex-direction: column; background: #fff; overflow-y: auto; }
.page-head {
  display: flex; align-items: center;
  padding: 0 20px; height: 50px; flex: 0 0 50px;
  border-bottom: 1px solid #E7E9EF;
}
.page-name { font-size: 14px; color: #313238; font-weight: 700; }
.page-body { padding: 16px 20px; }
.link { color: #3A84FF; cursor: pointer; }
.table-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.table-toolbar .spacer { flex: 1; }
.empty-block { text-align: center; padding: 60px 0 40px; }
.empty-title { font-size: 14px; color: #63656E; margin: 0 0 8px; }
.empty-sub { font-size: 12px; color: #979BA5; margin: 0; }
.table-footer {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 0 0; font-size: 12px; color: #63656E;
}
.table-footer .spacer { flex: 1; }
.detail-task-title { font-size: 13px; font-weight: 600; color: #313238; margin: 16px 0 8px; }
</style>
