<template>
  <div class="res-page">
    <div class="page-body">
      <el-alert type="info" :closable="true" style="margin-bottom: 14px">
        <template #title>
          录入云账户信息后，可同步<span class="link" @click="$router.push('/resource/cloud-discover')">云资源</span>到蓝鲸配置平台
        </template>
      </el-alert>

      <div class="table-toolbar">
        <el-button type="primary" @click="openCreate">新建</el-button>
        <div class="spacer" />
        <el-input
          v-model="keyword"
          placeholder="请输入账户名称"
          clearable
          style="width: 280px"
          :prefix-icon="'Search'"
          @keyup.enter="reloadFromFirst"
          @clear="reloadFromFirst"
        />
      </div>

      <el-table :data="rows" v-loading="loading" stripe @sort-change="onSortChange" @cell-click="onCellClick">
        <el-table-column prop="bk_account_name" label="账户名称" sortable="custom" min-width="180" show-overflow-tooltip>
          <template #default="{ row }"><span class="cell-link">{{ row.bk_account_name }}</span></template>
        </el-table-column>
        <el-table-column prop="bk_cloud_vendor" label="账户类型" sortable="custom" width="140">
          <template #default="{ row }">{{ vendorName(row.bk_cloud_vendor) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tooltip v-if="row.status === 'error' && row.error_message" :content="row.error_message" placement="top">
              <span class="row-status"><i class="status-dot err" />异常</span>
            </el-tooltip>
            <span v-else-if="row.status === 'normal'" class="row-status"><i class="status-dot" />正常</span>
            <span v-else>--</span>
          </template>
        </el-table-column>
        <el-table-column prop="bk_last_editor" label="修改人" width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.bk_last_editor || '--' }}</template>
        </el-table-column>
        <el-table-column prop="last_time" label="修改时间" sortable="custom" width="170">
          <template #default="{ row }">{{ fmtTime(row.last_time) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">查看</el-button>
            <el-tooltip :disabled="row.bk_can_delete_account !== false" content="云账户已被任务使用，不可删除" placement="top">
              <span>
                <el-button link type="danger" size="small" :disabled="row.bk_can_delete_account === false" @click="remove(row)">删除</el-button>
              </span>
            </el-tooltip>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无数据" :image-size="60">
            <el-button link type="primary" @click="openCreate">立即创建</el-button>
          </el-empty>
        </template>
      </el-table>

      <div v-if="total > 0" class="table-footer">
        <span>共计{{ total }}条</span>
        <span class="page-size">
          每页
          <el-select v-model="limit" size="small" style="width: 72px" @change="reloadFromFirst">
            <el-option v-for="n in [10, 20, 50, 100]" :key="n" :label="n" :value="n" />
          </el-select>
          条
        </span>
        <div class="spacer" />
        <el-pagination
          v-model:current-page="page"
          :page-size="limit"
          :total="total"
          layout="prev, pager, next"
          @current-change="load"
        />
      </div>
    </div>

    <!-- 新建/编辑账户(老版 account-sideslider:账户名称/账户类型/ID/Key+连通测试/备注) -->
    <el-drawer
      v-model="formVisible"
      :title="editingId ? '编辑账户' : '新建账户'"
      size="720px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" class="account-form">
        <el-form-item label="账户名称" required>
          <el-input v-model="form.bk_account_name" placeholder="请输入账户名称" />
        </el-form-item>
        <el-form-item label="账户类型" required>
          <el-select v-model="form.bk_cloud_vendor" :disabled="!!editingId" style="width: 100%">
            <el-option label="AWS" value="1" />
            <el-option label="腾讯云" value="2" />
            <el-option label="阿里云" value="4" />
          </el-select>
        </el-form-item>
        <el-form-item label="ID" required>
          <el-input v-model="form.bk_secret_id" :placeholder="editingId ? '留空则不修改' : '请输入ID'" />
        </el-form-item>
        <el-form-item label="Key" required>
          <div class="key-row">
            <el-input
              v-model="form.bk_secret_key"
              type="password"
              show-password
              :placeholder="editingId ? '留空则不修改' : '请输入Key'"
            />
            <el-button :loading="verifying" @click="verifyKey">连通测试</el-button>
          </div>
          <div v-if="verifyResult" :class="['verify-result', verifyResult.connected ? 'ok' : 'bad']">
            {{ verifyResult.connected ? '连通成功' : `连通失败: ${verifyResult.msg || '未知异常'}` }}
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.bk_description" type="textarea" :rows="3" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <div class="form-footer">
        <el-button type="primary" :loading="saving" @click="submitForm">提交</el-button>
        <el-button @click="formVisible = false">取消</el-button>
      </div>
    </el-drawer>

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
        <div class="detail-footer">
          <el-button @click="detailVisible = false">关闭</el-button>
          <el-button type="primary" @click="detailVisible = false; openEdit(detailRow)">编辑</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
// 云账户:独立页面对齐老版 resource/cloud-account(空态/新建/删除)
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchCloudAccounts, createCloudAccount, deleteCloudAccount,
  updateCloudAccount, searchCloudTasks, searchCloudAccountValidity, verifyCloudAccount
} from '../../api/cmdb'

const keyword = ref('')
const rows = ref([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const loading = ref(false)
const saving = ref(false)
const sort = ref('bk_account_id')
const formVisible = ref(false)
const editingId = ref(null)
const verifying = ref(false)
const verifyResult = ref(null)
const form = ref({ bk_account_name: '', bk_cloud_vendor: '2', bk_secret_id: '', bk_secret_key: '', bk_description: '' })

const detailVisible = ref(false)
const detailRow = ref(null)
const detailTasks = ref([])
const detailTasksLoading = ref(false)

const VENDORS = { '1': 'AWS', '2': '腾讯云', '4': '阿里云' }
function vendorName(v) { return VENDORS[String(v)] || '--' }
function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 19) : '--' }

function reloadFromFirst() {
  page.value = 1
  load()
}

function onSortChange({ prop, order }) {
  sort.value = order ? (order === 'descending' ? '-' : '') + prop : 'bk_account_id'
  reloadFromFirst()
}

function onCellClick(row, column) {
  if (column.property === 'bk_account_name') openDetail(row)
}

async function load() {
  loading.value = true
  try {
    const kw = keyword.value.trim()
    const data = await searchCloudAccounts({
      page: { start: (page.value - 1) * limit.value, limit: limit.value, sort: sort.value },
      condition: kw ? { bk_account_name: kw } : {},
      ...(kw ? { is_fuzzy: true } : {})
    })
    // 老版契约:行先带 pending 态,再异步取连通性回填状态列
    rows.value = (data?.info || []).map((r) => ({ ...r, status: 'pending', error_message: '' }))
    total.value = data?.count ?? rows.value.length
    loadStatus()
  } catch {
    rows.value = []
    total.value = 0
  } finally { loading.value = false }
}

// 连通性状态(老版 getStatus 契约:err_msg 非空即异常)
async function loadStatus() {
  if (!rows.value.length) return
  try {
    const results = await searchCloudAccountValidity(rows.value.map((r) => r.bk_account_id))
    rows.value.forEach((row) => {
      const status = (results || []).find((r) => r.bk_account_id === row.bk_account_id)
      if (status && status.err_msg) {
        row.status = 'error'
        row.error_message = status.err_msg
      } else {
        row.status = 'normal'
        row.error_message = ''
      }
    })
  } catch {
    rows.value.forEach((row) => { row.status = 'fail'; row.error_message = '' })
  }
}

function openCreate() {
  editingId.value = null
  form.value = {
    bk_account_name: '', bk_cloud_vendor: '2',
    bk_secret_id: '', bk_secret_key: '', bk_description: ''
  }
  verifyResult.value = null
  formVisible.value = true
}

function openEdit(row) {
  editingId.value = row.bk_account_id
  form.value = {
    bk_account_name: row.bk_account_name || '',
    bk_cloud_vendor: row.bk_cloud_vendor || '2',
    bk_secret_id: '',
    bk_secret_key: '',
    bk_description: row.bk_description || ''
  }
  verifyResult.value = null
  formVisible.value = true
}

// 连通测试(老版 verify 契约)
async function verifyKey() {
  const { bk_cloud_vendor: vendor, bk_secret_id: sid, bk_secret_key: key } = form.value
  if (!String(sid || '').trim() || !String(key || '').trim()) { ElMessage.warning('请先填写 ID 和 Key'); return }
  verifying.value = true
  try {
    const resp = await verifyCloudAccount({ bk_cloud_vendor: vendor, bk_secret_id: sid, bk_secret_key: key })
    verifyResult.value = { connected: !!resp?.result, msg: resp?.bk_error_msg }
  } catch (e) {
    verifyResult.value = { connected: false, msg: e?.message || '后端异常' }
  } finally { verifying.value = false }
}

async function submitForm() {
  if (!String(form.value.bk_account_name || '').trim()) { ElMessage.warning('请填写账户名称'); return }
  if (!editingId.value && (!String(form.value.bk_secret_id || '').trim() || !String(form.value.bk_secret_key || '').trim())) {
    ElMessage.warning('请填写 ID 和 Key'); return
  }
  saving.value = true
  try {
    if (editingId.value) {
      const data = { bk_account_name: form.value.bk_account_name, bk_description: form.value.bk_description }
      if (String(form.value.bk_secret_id || '').trim()) data.bk_secret_id = form.value.bk_secret_id
      if (String(form.value.bk_secret_key || '').trim()) data.bk_secret_key = form.value.bk_secret_key
      await updateCloudAccount(editingId.value, data)
      ElMessage.success('云账户已更新')
    } else {
      await createCloudAccount({
        ...form.value,
        bk_account_type: 'api_secret_key'
      })
      ElMessage.success('云账户已创建')
    }
    formVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error('提交失败: ' + (e?.message || '后端异常'))
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
.cell-link { color: #3A84FF; cursor: pointer; }
.row-status { display: inline-flex; align-items: center; }
.status-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: #2DCB56; margin-right: 6px;
}
.status-dot.err { background: #EA3636; }
.detail-footer { display: flex; justify-content: center; gap: 8px; padding-top: 20px; }
.account-form { max-width: 460px; }
.account-form :deep(.el-form-item__label) { color: #63656e; }
.key-row { display: flex; gap: 8px; width: 100%; }
.verify-result { font-size: 12px; line-height: 20px; margin-top: 4px; }
.verify-result.ok { color: #2dcb56; }
.verify-result.bad { color: #ea3636; }
.form-footer { margin-top: 10px; }
</style>
