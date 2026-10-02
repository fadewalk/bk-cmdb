<template>
  <div class="page-card iam-page">
    <div class="iam-header">
      <div>
        <div class="page-title">权限管理</div>
        <div class="page-subtitle">
          独立授权(Casbin 边缘 RBAC)策略与用户角色绑定
          <template v-if="subject"> · 当前身份 <b>{{ subject }}</b></template>
        </div>
      </div>
      <el-button :loading="loading" @click="loadAll">刷新</el-button>
    </div>

    <el-alert v-if="loadError" type="error" :closable="false" show-icon class="state-alert">
      {{ loadError }}
      <el-button link type="primary" @click="loadAll">重试</el-button>
    </el-alert>
    <el-empty v-else-if="!iamEnabled && !loading" description="独立授权未开启(webServer.auth.enabled=false),当前为开放模式" />

    <template v-else>
      <!-- 策略 -->
      <section class="iam-section">
        <div class="section-head">
          <h2>策略(p)</h2>
          <span class="section-tip">五元组:主体 / 业务域 / 对象 / 动作 / 效果;admin 为内置全权角色</span>
        </div>
        <el-table :data="policies" size="small" border data-testid="iam-policy-table">
          <el-table-column prop="0" label="主体" min-width="110" />
          <el-table-column prop="1" label="业务域" width="90" />
          <el-table-column prop="2" label="对象" min-width="120" />
          <el-table-column prop="3" label="动作" min-width="110" />
          <el-table-column prop="4" label="效果" width="90">
            <template #default="{ row }">
              <el-tag :type="row[4] === 'deny' ? 'danger' : 'success'" size="small">{{ row[4] }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80">
            <template #default="{ row }">
              <el-button link type="danger" data-testid="iam-policy-remove" @click="removePolicy(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="add-form" data-testid="iam-policy-add">
          <el-input v-model="policyForm.subject" placeholder="主体,如 bob" class="w130" />
          <el-input v-model="policyForm.domain" placeholder="业务域,如 2 或 *" class="w90" />
          <el-input v-model="policyForm.object" placeholder="对象,如 biz" class="w110" />
          <el-input v-model="policyForm.action" placeholder="动作,如 create" class="w110" />
          <el-select v-model="policyForm.effect" class="w90">
            <el-option value="allow" label="allow" />
            <el-option value="deny" label="deny" />
          </el-select>
          <el-button type="primary" :loading="saving" v-perm="{ object: 'iam', action: 'admin' }" @click="addPolicy">添加策略</el-button>
        </div>
      </section>

      <!-- 角色绑定 -->
      <section class="iam-section">
        <div class="section-head">
          <h2>角色绑定(g)</h2>
          <span class="section-tip">用户 → 角色(带业务域);绑定 admin 即授予全权</span>
        </div>
        <el-table :data="groupings" size="small" border data-testid="iam-grouping-table">
          <el-table-column prop="0" label="用户" min-width="140" />
          <el-table-column prop="1" label="角色" min-width="120" />
          <el-table-column prop="2" label="业务域" width="90" />
          <el-table-column label="操作" width="80">
            <template #default="{ row }">
              <el-button link type="danger" data-testid="iam-grouping-remove" @click="removeGrouping(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="add-form" data-testid="iam-grouping-add">
          <el-input v-model="groupingForm.subject" placeholder="用户,如 carol" class="w130" />
          <el-input v-model="groupingForm.role" placeholder="角色,如 dev" class="w110" />
          <el-input v-model="groupingForm.domain" placeholder="业务域,如 2 或 *" class="w90" />
          <el-button type="primary" :loading="saving" v-perm="{ object: 'iam', action: 'admin' }" @click="addGrouping">添加绑定</el-button>
        </div>
      </section>

      <!-- 申请审批 -->
      <section class="iam-section">
        <div class="section-head">
          <h2>权限申请审批</h2>
          <span class="section-tip">用户站内提交的权限申请;通过即写入持久化 allow 策略</span>
        </div>
        <el-table :data="applications" size="small" border data-testid="iam-apply-table">
          <el-table-column prop="subject" label="申请人" min-width="110" />
          <el-table-column prop="object" label="对象" min-width="110" />
          <el-table-column prop="action" label="动作" min-width="100" />
          <el-table-column prop="domain" label="业务域" width="80" />
          <el-table-column prop="reason" label="理由" min-width="140">
            <template #default="{ row }">{{ row.reason || '--' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'pending' ? 'warning' : (row.status === 'approved' ? 'success' : 'info')" size="small">
                {{ { pending: '待审批', approved: '已通过', rejected: '已拒绝' }[row.status] || row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130">
            <template #default="{ row }">
              <template v-if="row.status === 'pending'">
                <el-button link type="primary" :data-testid="`iam-apply-approve-${row.id}`" @click="decide(row, true)">通过</el-button>
                <el-button link type="danger" :data-testid="`iam-apply-reject-${row.id}`" @click="decide(row, false)">拒绝</el-button>
              </template>
              <span v-else class="decided-at">{{ formatDate(row.decided_at) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'

const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const iamEnabled = ref(false)
const subject = ref('')
const policies = ref([])
const groupings = ref([])
const applications = ref([])
const policyForm = ref({ subject: '', domain: '*', object: '', action: '', effect: 'allow' })
const groupingForm = ref({ subject: '', role: '', domain: '*' })

// 管理端点挂 web_server 根路径(同 /iam 家族,不在 /api/v3 代理下)
const iamGet = async (url) => {
  const res = await axios.get(url, { baseURL: '', withCredentials: true, validateStatus: () => true, timeout: 8000 })
  return res
}

async function loadAll() {
  loading.value = true
  loadError.value = ''
  try {
    // 先探测开关(/iam/status 恒 200),未开启时不打 me/permissions,避免资源 404 噪音
    const status = await iamGet('/iam/status')
    if (status.status !== 200 || status.data?.enabled !== true) {
      iamEnabled.value = false
      return
    }
    const res = await iamGet('/iam/me/permissions')
    if (res.status === 403) {
      iamEnabled.value = true
      loadError.value = '需要授权管理员权限(iam:admin)查看策略'
      return
    }
    if (res.status !== 200) {
      loadError.value = `加载失败(HTTP ${res.status})`
      return
    }
    iamEnabled.value = true
    subject.value = res.data?.subject || ''
    policies.value = res.data?.policies || []
    groupings.value = res.data?.groupings || []
    // 申请列表管理员专属:403 时静默隐藏(非 admin 打开管理页本就罕见)
    const applyRes = await iamGet('/iam/apply/list')
    if (applyRes.status === 200) {
      applications.value = applyRes.data?.applications || []
    }
  } catch (error) {
    loadError.value = error?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function addPolicy() {
  const form = policyForm.value
  if (!form.subject || !form.object || !form.action) {
    ElMessage.warning('主体、对象、动作必填')
    return
  }
  saving.value = true
  try {
    await axios.post('/iam/policies', [form.subject, form.domain || '*', form.object, form.action, form.effect || 'allow'], {
      baseURL: '', withCredentials: true, timeout: 8000
    })
    ElMessage.success('策略已添加')
    policyForm.value = { subject: '', domain: '*', object: '', action: '', effect: 'allow' }
    await loadAll()
  } catch (error) {
    ElMessage.error(error?.response?.data?.error || '添加失败')
  } finally {
    saving.value = false
  }
}

async function removePolicy(row) {
  try {
    await axios.delete('/iam/policies', { data: [...row], baseURL: '', withCredentials: true, timeout: 8000 })
    ElMessage.success('策略已删除')
    await loadAll()
  } catch (error) {
    ElMessage.error(error?.response?.data?.error || '删除失败')
  }
}

async function addGrouping() {
  const form = groupingForm.value
  if (!form.subject || !form.role) {
    ElMessage.warning('用户与角色必填')
    return
  }
  saving.value = true
  try {
    await axios.post('/iam/groupings', { subject: form.subject, role: form.role, domain: form.domain || '*' }, {
      baseURL: '', withCredentials: true, timeout: 8000
    })
    ElMessage.success('绑定已添加')
    groupingForm.value = { subject: '', role: '', domain: '*' }
    await loadAll()
  } catch (error) {
    ElMessage.error(error?.response?.data?.error || '添加失败')
  } finally {
    saving.value = false
  }
}

async function removeGrouping(row) {
  try {
    await axios.delete('/iam/groupings', { data: { subject: row[0], role: row[1], domain: row[2] }, baseURL: '', withCredentials: true, timeout: 8000 })
    ElMessage.success('绑定已删除')
    await loadAll()
  } catch (error) {
    ElMessage.error(error?.response?.data?.error || '删除失败')
  }
}

// 审批决策:通过即由后端写入持久化 allow 策略并立即生效
async function decide(row, approve) {
  try {
    await axios.post('/iam/apply/decision', { id: row.id, approve }, { baseURL: '', withCredentials: true, timeout: 8000 })
    ElMessage.success(approve ? '已通过,策略已生效' : '已拒绝')
    await loadAll()
  } catch (error) {
    ElMessage.error(error?.response?.data?.error || '操作失败')
  }
}

function formatDate(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

onMounted(loadAll)
</script>

<style scoped>
.iam-page { min-height: calc(100vh - 110px); }
.iam-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 18px; }
.page-title { color: #313238; font-size: 20px; font-weight: 600; line-height: 28px; }
.page-subtitle { color: #979ba5; font-size: 13px; margin-top: 4px; }
.page-subtitle b { color: #63656e; }
.state-alert { margin-bottom: 16px; }
.iam-section { margin-bottom: 28px; }
.section-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
.section-head h2 { margin: 0; color: #313238; font-size: 15px; font-weight: 600; }
.section-tip { color: #979ba5; font-size: 12px; }
.add-form { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
.w90 { width: 90px; }
.w110 { width: 110px; }
.w130 { width: 130px; }
.decided-at { color: #979ba5; font-size: 12px; }
</style>
