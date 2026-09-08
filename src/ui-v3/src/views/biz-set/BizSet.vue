<template>
  <div class="res-page">
    <div class="page-head">
      <span class="back-arrow" @click="$router.push('/resource/index')">←</span>
      <span class="page-name">业务集</span>
      <el-tooltip content="在新窗口打开业务集帮助文档" placement="bottom">
        <i class="bk-cmdb-icon icon-cc-external-link head-link" />
      </el-tooltip>
    </div>

    <div class="page-body">
      <div class="table-toolbar">
        <el-button type="primary" @click="openForm()">新建</el-button>
        <div class="spacer" />
        <el-input
          v-model="keyword"
          placeholder="请输入业务集名"
          clearable
          style="width: 300px"
          :prefix-icon="'Search'"
          @keyup.enter="load"
          @clear="load"
        />
      </div>

      <el-table :data="filtered" v-loading="loading" stripe>
        <el-table-column prop="bk_biz_set_id" label="ID" width="100" sortable />
        <el-table-column prop="bk_biz_set_name" label="业务集名" min-width="180" show-overflow-tooltip />
        <el-table-column prop="bk_biz_set_desc" label="业务集描述" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.bk_biz_set_desc || '--' }}</template>
        </el-table-column>
        <el-table-column prop="bk_biz_maintainer" label="运维人员" width="140">
          <template #default="{ row }">{{ row.bk_biz_maintainer || '--' }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ fmtTime(row.create_time) }}</template>
        </el-table-column>
        <el-table-column label="创建人" width="120">
          <template #default="{ row }">{{ row.bk_created_by || '--' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="goDetail(row)">预览</el-button>
            <el-button link type="primary" size="small" @click="openForm(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

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

    <!-- 新建/编辑业务集 -->
    <el-dialog v-model="formVisible" :title="formId ? '编辑业务集' : '新建业务集'" width="520px">
      <el-form label-width="100px">
        <el-form-item label="业务集名" required>
          <el-input v-model="form.bk_biz_set_name" />
        </el-form-item>
        <el-form-item label="业务集描述">
          <el-input v-model="form.bk_biz_set_desc" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="运维人员" required>
          <el-input v-model="form.bk_biz_maintainer" placeholder="多个用逗号分隔" />
        </el-form-item>
        <el-form-item label="包含业务">
          <el-select v-model="form.bizIds" multiple filterable style="width: 100%" placeholder="选择业务(可多选)">
            <el-option v-for="b in bizList" :key="b.bk_biz_id" :label="`[${b.bk_biz_id}] ${b.bk_biz_name}`" :value="b.bk_biz_id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
// 业务集列表:对齐老版 resource/business-set(新建/编辑/删除/预览)
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http, searchBusiness } from '../../api/cmdb'

const router = useRouter()
const keyword = ref('')
const rows = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const saving = ref(false)
const bizList = ref([])

const formVisible = ref(false)
const formId = ref(null)
const form = ref({ bk_biz_set_name: '', bk_biz_set_desc: '', bk_biz_maintainer: '', bizIds: [] })

const filtered = computed(() =>
  keyword.value.trim()
    ? rows.value.filter((r) => (r.bk_biz_set_name || '').includes(keyword.value.trim()))
    : rows.value
)

function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 19) : '--' }
function goDetail(row) {
  router.push({ path: `/resource/biz-set/details/${row.bk_biz_set_id}` })
}

async function load() {
  loading.value = true
  try {
    const data = await http.post('/findmany/biz_set', { page: { start: (page.value - 1) * 20, limit: 20 } })
    rows.value = data?.info || []
    total.value = data?.count ?? rows.value.length
  } catch {
    rows.value = []
    total.value = 0
  } finally { loading.value = false }
}

function openForm(row) {
  if (row) {
    formId.value = row.bk_biz_set_id
    form.value = {
      bk_biz_set_name: row.bk_biz_set_name || '',
      bk_biz_set_desc: row.bk_biz_set_desc || '',
      bk_biz_maintainer: row.bk_biz_maintainer || '',
      bizIds: []
    }
  } else {
    formId.value = null
    form.value = { bk_biz_set_name: '', bk_biz_set_desc: '', bk_biz_maintainer: 'admin', bizIds: [] }
  }
  formVisible.value = true
}

async function submitForm() {
  if (!String(form.value.bk_biz_set_name || '').trim()) { ElMessage.warning('请填写业务集名'); return }
  if (!String(form.value.bk_biz_maintainer || '').trim()) { ElMessage.warning('请填写运维人员'); return }
  saving.value = true
  try {
    const attr = {
      bk_biz_set_name: form.value.bk_biz_set_name,
      bk_biz_set_desc: form.value.bk_biz_set_desc,
      bk_biz_maintainer: form.value.bk_biz_maintainer
    }
    if (formId.value) {
      // 契约: PUT /updatemany/biz_set {bk_biz_set_ids, data:{bk_biz_set_attr}}
      await http.put('/updatemany/biz_set', {
        bk_biz_set_ids: [formId.value],
        data: { bk_biz_set_attr: attr }
      })
      ElMessage.success('业务集已更新')
    } else {
      // 契约: POST /create/biz_set {bk_biz_set_attr, bk_scope}
      const scope = form.value.bizIds.length
        ? { match_all: false, filter: { biz_ids: form.value.bizIds } }
        : { match_all: true }
      await http.post('/create/biz_set', { bk_biz_set_attr: attr, bk_scope: scope })
      ElMessage.success('业务集已创建')
    }
    formVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除业务集「${row.bk_biz_set_name}」?`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    // 契约: POST /deletemany/biz_set {bk_biz_set_ids}
    await http.post('/deletemany/biz_set', { bk_biz_set_ids: [row.bk_biz_set_id] })
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}

onMounted(async () => {
  load()
  try {
    const data = await searchBusiness({ start: 0, limit: 200 })
    bizList.value = data?.info || []
  } catch { bizList.value = [] }
})
</script>

<style scoped>
.res-page { height: 100%; display: flex; flex-direction: column; background: #fff; overflow-y: auto; }
.page-head {
  display: flex; align-items: center; gap: 8px;
  padding: 0 20px; height: 50px; flex: 0 0 50px;
  border-bottom: 1px solid #E7E9EF;
}
.back-arrow { cursor: pointer; color: #3A84FF; font-size: 18px; font-weight: 700; }
.page-name { font-size: 14px; color: #313238; font-weight: 700; }
.head-link { color: #3A84FF; cursor: pointer; font-size: 14px; }
.page-body { padding: 16px 20px; }
.table-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.table-toolbar .spacer { flex: 1; }
.table-footer {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 0 0; font-size: 12px; color: #63656E;
}
.table-footer .spacer { flex: 1; }
</style>
