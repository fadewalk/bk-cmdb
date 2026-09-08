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
        <el-tooltip content="列表显示属性配置" placement="top">
          <el-button text circle :icon="'Setting'" @click="openColPicker" />
        </el-tooltip>
      </div>

      <el-table :data="filtered" v-loading="loading" stripe>
        <el-table-column prop="bk_biz_set_id" label="ID" width="100" sortable />
        <el-table-column prop="bk_biz_set_name" label="业务集名" min-width="180" show-overflow-tooltip />
        <el-table-column
          v-for="col in displayCols"
          :key="col.bk_property_id"
          :label="headerName(col)"
          min-width="140"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ cellText(row[col.bk_property_id], col) }}</template>
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

    <!-- 列配置(对齐老版 biz_set_custom_table_columns,固定列 ID/业务集名不可配) -->
    <el-drawer v-model="colPickerVisible" title="列表显示属性配置" size="420px">
      <el-checkbox-group v-model="colDraft">
        <div class="col-grid">
          <el-checkbox v-for="c in colPool" :key="c.bk_property_id" :value="c.bk_property_id">
            {{ c.bk_property_name }}
          </el-checkbox>
        </div>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="resetCols">恢复默认</el-button>
        <el-button @click="colPickerVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!colDraft.length" @click="applyCols">确定</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
// 业务集列表:对齐老版 resource/business-set(新建/编辑/删除/预览)
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http, searchBusiness, searchBizSetAttributes } from '../../api/cmdb'

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

// ---------- 列配置(候选为业务集模型属性 bk_biz_set_obj,固定 ID/业务集名) ----------
// 默认表头与老版可见列一致(描述/运维人员/创建时间/创建人);更新时间/更新人可通过列配置加入
const COL_KEY = 'biz_set_custom_table_columns'
const DISABLED_COLS = ['bk_biz_set_id', 'bk_biz_set_name']
const DEFAULT_COLS = ['bk_biz_set_desc', 'bk_biz_maintainer', 'bk_created_at', 'bk_created_by']
const attrs = ref([])
const colPickerVisible = ref(false)
const colDraft = ref([])

const colPool = computed(() => attrs.value.filter((f) => !DISABLED_COLS.includes(f.bk_property_id)))

function propPriority(p) {
  return (p.bk_property_index ?? 0) - (p.isonly ? 1 : 0) - (p.isrequired ? 1 : 0)
}
function defaultCols() {
  const ids = colPool.value.map((c) => c.bk_property_id)
  const preset = DEFAULT_COLS.filter((id) => ids.includes(id))
  return preset.length ? preset : [...colPool.value].sort((a, b) => propPriority(a) - propPriority(b)).slice(0, 6).map((c) => c.bk_property_id)
}

const pickedColIds = ref([])
const displayCols = computed(() => {
  const map = new Map(attrs.value.map((c) => [c.bk_property_id, c]))
  return pickedColIds.value.map((id) => map.get(id)).filter(Boolean)
})

function loadPickedCols() {
  let saved = null
  try { saved = JSON.parse(localStorage.getItem(COL_KEY) || 'null') } catch { saved = null }
  pickedColIds.value = Array.isArray(saved)
    ? saved.filter((id) => colPool.value.some((c) => c.bk_property_id === id))
    : defaultCols()
}
function savePickedCols() {
  try { localStorage.setItem(COL_KEY, JSON.stringify(pickedColIds.value)) } catch { /* ignore */ }
}
function openColPicker() {
  colDraft.value = [...pickedColIds.value]
  colPickerVisible.value = true
}
function applyCols() {
  pickedColIds.value = [...colDraft.value]
  savePickedCols()
  colPickerVisible.value = false
}
function resetCols() {
  pickedColIds.value = defaultCols()
  savePickedCols()
  colPickerVisible.value = false
}

function headerName(p) {
  return p.unit && !String(p.bk_property_name).endsWith(`(${p.unit})`)
    ? `${p.bk_property_name}(${p.unit})`
    : p.bk_property_name
}
function enumOptionName(option, value) {
  const flat = []
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach((o) => {
        if (o && o.id !== undefined) flat.push(o)
        else if (o && typeof o === 'object') walk(o)
      })
    } else if (node && typeof node === 'object') {
      Object.values(node).forEach(walk)
    }
  }
  walk(option)
  return flat.find((o) => o.id === value)?.name ?? String(value)
}
function cellText(value, p) {
  if (value === null || value === undefined || value === '') return '--'
  if (p.bk_property_type === 'bool') return value ? '是' : '否'
  if (p.bk_property_type === 'enum') return enumOptionName(p.option, value)
  if (p.bk_property_type === 'date' || p.bk_property_type === 'time') return fmtTime(value)
  return String(value)
}

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
  attrs.value = (await searchBizSetAttributes().catch(() => [])) || []
  loadPickedCols()
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
.col-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 12px; }
</style>
