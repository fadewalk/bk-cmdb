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
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
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
      <el-alert type="info" :closable="false" style="margin-bottom: 12px"
        title="独立部署模式未对接云厂商插件,此处仅保存账户基础信息" />
      <el-form label-width="100px">
        <el-form-item label="账户名称" required>
          <el-input v-model="form.bk_account_name" />
        </el-form-item>
        <el-form-item label="云厂商">
          <el-select v-model="form.bk_cloud_vendor" style="width: 100%">
            <el-option label="AWS" value="1" />
            <el-option label="腾讯云" value="2" />
            <el-option label="阿里云" value="4" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.bk_desc" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
// 云账户:独立页面对齐老版 resource/cloud-account(空态/新建/删除)
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { searchCloudAccounts, createCloudAccount, deleteCloudAccount } from '../../api/cmdb'

const keyword = ref('')
const rows = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const saving = ref(false)
const formVisible = ref(false)
const form = ref({ bk_account_name: '', bk_cloud_vendor: '2', bk_desc: '' })

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
    // core profile 无 cmdb_cloudserver,云账户接口不可用(依赖阻塞)
    rows.value = []
    total.value = 0
  } finally { loading.value = false }
}

async function submitCreate() {
  if (!String(form.value.bk_account_name || '').trim()) { ElMessage.warning('请填写账户名称'); return }
  saving.value = true
  try {
    await createCloudAccount({
      bk_account_name: form.value.bk_account_name,
      bk_cloud_vendor: form.value.bk_cloud_vendor,
      bk_desc: form.value.bk_desc
    })
    ElMessage.success('云账户已创建')
    formVisible.value = false
    form.value = { bk_account_name: '', bk_cloud_vendor: '2', bk_desc: '' }
    await load()
  } catch (e) {
    ElMessage.error('创建失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
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
</style>
