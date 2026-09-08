<template>
  <div class="res-page">
    <div class="page-head">
      <span class="back-arrow" @click="$router.push('/resource/index')">←</span>
      <span class="page-name">项目</span>
      <el-tooltip content="在新窗口打开项目帮助文档" placement="bottom">
        <i class="bk-cmdb-icon icon-cc-external-link head-link" />
      </el-tooltip>
    </div>

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
      </div>

      <el-table :data="filtered" v-loading="loading" stripe @selection-change="onSelect">
        <el-table-column type="selection" width="40" />
        <el-table-column prop="bk_project_id" label="ID" width="100" sortable />
        <el-table-column prop="bk_project_name" label="项目名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="bk_project_code" label="项目英文名" min-width="140" show-overflow-tooltip />
        <el-table-column prop="bk_project_owner" label="项目负责人" width="140">
          <template #default="{ row }">{{ row.bk_project_owner || '--' }}</template>
        </el-table-column>
        <el-table-column label="项目类型" width="140">
          <template #default="{ row }">{{ typeName(row.bk_project_type) }}</template>
        </el-table-column>
        <el-table-column label="项目描述" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.project_desc || row.bk_project_desc || '--' }}</template>
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
            <el-option v-for="o in typeOptions" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input v-model="form.project_desc" type="textarea" :rows="2" />
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
const typeOptions = ref([])

const formVisible = ref(false)
const formId = ref(null)
const form = ref({})

const filtered = computed(() =>
  keyword.value.trim()
    ? rows.value.filter((r) => (r.bk_project_name || '').includes(keyword.value.trim()))
    : rows.value
)

function typeName(id) {
  return typeOptions.value.find((o) => o.id === id)?.name || id || '--'
}
function onSelect(rows) { selected.value = rows }

async function load() {
  loading.value = true
  try {
    const data = await http.post('/findmany/project', { page: { start: (page.value - 1) * 20, limit: 20 } })
    rows.value = data?.info || []
    total.value = data?.count ?? rows.value.length
  } catch {
    rows.value = []
    total.value = 0
  } finally { loading.value = false }
}

async function loadTypeOptions() {
  try {
    const attrs = await searchModelAttributes('bk_project')
    typeOptions.value = (attrs || []).find((a) => a.bk_property_id === 'bk_project_type')?.option || []
  } catch { typeOptions.value = [] }
}

function openForm(row) {
  if (row) {
    formId.value = row.bk_project_id
    form.value = {
      bk_project_name: row.bk_project_name || '',
      bk_project_code: row.bk_project_code || '',
      bk_project_owner: row.bk_project_owner || '',
      bk_project_type: row.bk_project_type || '',
      project_desc: row.project_desc || row.bk_project_desc || ''
    }
  } else {
    formId.value = null
    form.value = { bk_project_name: '', bk_project_code: '', bk_project_owner: 'admin', bk_project_type: typeOptions.value[0]?.id || '', project_desc: '' }
  }
  formVisible.value = true
}

async function submitForm() {
  if (!String(form.value.bk_project_name || '').trim()) { ElMessage.warning('请填写项目名称'); return }
  if (!String(form.value.bk_project_code || '').trim()) { ElMessage.warning('请填写项目英文名'); return }
  saving.value = true
  try {
    if (formId.value) {
      // 契约: PUT /updatemany/project {ids, data}
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
  ElMessage.info(`已选择 ${selected.value.length} 个项目,批量编辑(对齐老版列编辑)后续接入`)
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除项目「${row.bk_project_name}」?`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    // 契约: DELETE /deletemany/project {ids}
    await http.delete('/deletemany/project', { data: { ids: [row.bk_project_id] } })
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
    await http.delete('/deletemany/project', { data: { ids: selected.value.map((r) => r.bk_project_id) } })
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}

onMounted(async () => {
  load()
  loadTypeOptions()
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
