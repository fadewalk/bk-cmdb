<template>
  <div class="res-page">
    <div class="page-body">
      <div class="table-toolbar">
        <el-button type="primary" @click="openForm()">新建</el-button>
        <el-button :disabled="!selected.length" @click="batchEdit">批量编辑</el-button>
        <el-dropdown trigger="click" @command="onMore">
          <el-button :disabled="!selected.length">更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="delete">删除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <div class="spacer" />
        <el-input
          v-model="keyword"
          placeholder="请输入项目名称"
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

      <el-table :data="filtered" v-loading="loading" stripe @selection-change="onSelect">
        <el-table-column type="selection" width="40" />
        <el-table-column prop="bk_project_id" label="ID" width="100" sortable />
        <el-table-column prop="bk_project_name" label="项目名称" min-width="180" show-overflow-tooltip />
        <el-table-column
          v-for="col in displayCols"
          :key="col.bk_property_id"
          :label="headerName(col)"
          min-width="140"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ cellText(row[col.bk_property_id], col) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
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

    <!-- 新建/编辑项目 -->
    <el-dialog v-model="formVisible" :title="formId ? '编辑项目' : '新建项目'" width="520px">
      <el-form label-width="100px">
        <el-form-item label="项目名称" required>
          <el-input v-model="form.bk_project_name" />
        </el-form-item>
        <el-form-item label="项目英文名" required>
          <el-input v-model="form.bk_project_code" :disabled="!!formId" placeholder="英文唯一标识" />
        </el-form-item>
        <el-form-item label="项目负责人" required>
          <el-input v-model="form.bk_project_owner" placeholder="多个用逗号分隔" />
        </el-form-item>
        <el-form-item label="项目类型" required>
          <el-select v-model="form.bk_project_type" style="width: 100%">
            <el-option v-for="o in projectTypeOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input v-model="form.bk_project_desc" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量编辑(契约与单条编辑相同: PUT /updatemany/project {ids, data},只提交修改过的字段) -->
    <el-drawer v-model="batchVisible" title="批量编辑" size="480px">
      <el-form label-width="110px">
        <el-form-item v-for="f in batchAttrs" :key="f.bk_property_id" :label="f.bk_property_name">
          <el-select v-if="enumOptions(f).length" v-model="batchMap[f.bk_property_id]" clearable style="width: 100%">
            <el-option v-for="o in enumOptions(f)" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
          <el-switch v-else-if="f.bk_property_type === 'bool'" v-model="batchMap[f.bk_property_id]" />
          <el-input-number
            v-else-if="f.bk_property_type === 'int'"
            v-model="batchMap[f.bk_property_id]"
            :controls="false"
            style="width: 100%"
          />
          <el-input v-else v-model="batchMap[f.bk_property_id]" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchSaving" @click="submitBatch">保存</el-button>
      </template>
    </el-drawer>

    <!-- 列配置(对齐老版 pro_custom_table_columns,固定列 ID/项目名称不可配) -->
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
// 项目列表:对齐老版 resource/project(新建/批量编辑/删除,类型枚举来自模型属性)
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import { http, searchModelAttributes } from '../../api/cmdb'

const router = useRouter()
const keyword = ref('')
const rows = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const saving = ref(false)
const selected = ref([])
const projectTypeOptions = computed(() => attrs.value.find((a) => a.bk_property_id === 'bk_project_type')?.option || [])

const formVisible = ref(false)
const formId = ref(null)
const form = ref({})

const filtered = computed(() => rows.value)

function onSelect(rows) { selected.value = rows }

// ---------- 模型属性(列配置候选与批量编辑表单共用) ----------
const attrs = ref([])

async function loadTypeOptions() {
  try {
    attrs.value = (await searchModelAttributes('bk_project')) || []
  } catch { attrs.value = [] }
}

function enumOptions(f) {
  const opt = f.option
  if (Array.isArray(opt)) return opt.filter((o) => o && o.id !== undefined)
  if (opt && typeof opt === 'object') {
    const out = []
    const walk = (node) => {
      for (const child of Object.values(node)) {
        if (child && typeof child === 'object') {
          if (child.id !== undefined) out.push({ id: child.id, name: child.name })
          else walk(child)
        }
      }
    }
    walk(opt)
    return out
  }
  return []
}

// ---------- 批量编辑 ----------
const SYSTEM_FIELDS = ['id', 'bk_project_id', 'bk_created_by', 'bk_created_at', 'bk_updated_by', 'bk_updated_at', 'create_time', 'last_time']
const batchAttrs = computed(() => attrs.value.filter((f) => !SYSTEM_FIELDS.includes(f.bk_property_id)))
const batchVisible = ref(false)
const batchSaving = ref(false)
const batchMap = ref({})
const batchInit = ref({})

function openBatchEdit() {
  const init = {}
  for (const f of batchAttrs.value) {
    init[f.bk_property_id] = f.bk_property_type === 'bool' ? false : ''
  }
  batchInit.value = init
  batchMap.value = { ...init }
  batchVisible.value = true
}

async function submitBatch() {
  // 对齐老版 changedValues 语义:只提交修改过的字段
  const changed = {}
  for (const [k, v] of Object.entries(batchMap.value)) {
    if (String(v ?? '') !== String(batchInit.value[k] ?? '')) changed[k] = v
  }
  if (!Object.keys(changed).length) {
    ElMessage.warning('请先修改字段后再保存')
    return
  }
  batchSaving.value = true
  try {
    await http.put('/updatemany/project', { ids: selected.value.map((r) => r.id ?? r.bk_project_id), data: changed })
    ElMessage.success(`已批量更新 ${selected.value.length} 个项目`)
    batchVisible.value = false
    selected.value = []
    await load()
  } catch (e) {
    ElMessage.error('批量编辑失败: ' + (e?.message || '后端异常'))
  } finally { batchSaving.value = false }
}

// ---------- 列配置(候选为模型属性,固定 ID/项目名称;默认表头=按 index-isonly-isrequired 排序取前 6,对齐老版 getHeaderProperties) ----------
const COL_KEY = 'pro_custom_table_columns'
const DISABLED_COLS = ['id', 'bk_project_id', 'bk_project_name']
const colPickerVisible = ref(false)
const colDraft = ref([])

const colPool = computed(() => attrs.value.filter((f) => !DISABLED_COLS.includes(f.bk_property_id)))

function propPriority(p) {
  return (p.bk_property_index ?? 0) - (p.isonly ? 1 : 0) - (p.isrequired ? 1 : 0)
}
function defaultCols() {
  return [...colPool.value]
    .sort((a, b) => propPriority(a) - propPriority(b))
    .slice(0, 6)
    .map((c) => c.bk_property_id)
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
function cellText(value, p) {
  if (value === null || value === undefined || value === '') return '--'
  if (p.bk_property_type === 'bool') return value ? '是' : '否'
  if (p.bk_property_type === 'enum') return enumOptions(p).find((o) => o.id === value)?.name ?? String(value)
  if (p.bk_property_type === 'date' || p.bk_property_type === 'time') {
    return value ? String(value).replace('T', ' ').slice(0, 19) : '--'
  }
  return String(value)
}

async function load() {
  loading.value = true
  try {
    const keywordValue = keyword.value.trim()
    const payload = {
      page: { start: (page.value - 1) * 20, limit: 20 },
      ...(keywordValue ? { condition: { bk_project_name: keywordValue }, is_fuzzy: true } : {})
    }
    const data = await http.post('/findmany/project', payload)
    rows.value = data?.info || []
    total.value = data?.count ?? rows.value.length
  } catch {
    rows.value = []
    total.value = 0
  } finally { loading.value = false }
}

function openForm(row) {
  if (row) {
    formId.value = row.id ?? row.bk_project_id
    form.value = {
      bk_project_name: row.bk_project_name || '',
      bk_project_code: row.bk_project_code || '',
      bk_project_owner: row.bk_project_owner || '',
      bk_project_type: row.bk_project_type || '',
      bk_project_desc: row.bk_project_desc || ''
    }
  } else {
    formId.value = null
    form.value = { bk_project_name: '', bk_project_code: '', bk_project_owner: 'admin', bk_project_type: projectTypeOptions.value[0]?.id || '', bk_project_desc: '' }
  }
  formVisible.value = true
}

async function submitForm() {
  if (!String(form.value.bk_project_name || '').trim()) { ElMessage.warning('请填写项目名称'); return }
  if (!String(form.value.bk_project_code || '').trim()) { ElMessage.warning('请填写项目英文名'); return }
  saving.value = true
  try {
    if (formId.value) {
    // 契约: PUT /updatemany/project {ids, data};ids 为数字 id(传 hash 会被后端拒绝)
    await http.put('/updatemany/project', {
      ids: [formId.value],
      data: { ...form.value }
    })
      ElMessage.success('项目已更新')
    } else {
      await http.post('/createmany/project', { data: [{ ...form.value }] })
      ElMessage.success('项目已创建')
    }
    formVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}

function batchEdit() {
  openBatchEdit()
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除项目「${row.bk_project_name}」?`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    // 契约: DELETE /deletemany/project {ids};ids 为数字 id(传 hash 会被后端拒绝)
    await http.delete('/deletemany/project', { data: { ids: [row.id ?? row.bk_project_id] } })
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}

async function onMore(cmd) {
  if (cmd !== 'delete') return
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${selected.value.length} 个项目?`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    await http.delete('/deletemany/project', { data: { ids: selected.value.map((r) => r.id ?? r.bk_project_id) } })
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}

onMounted(async () => {
  load()
  await loadTypeOptions()
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
