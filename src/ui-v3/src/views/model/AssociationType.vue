<template>
  <div class="page-card association-page">
    <h1 class="page-title sr-only">关联类型</h1>
    <div class="feature-tip cmdb-tips" v-if="tipVisible">
      <i class="bk-cmdb-icon icon-cc-exclamation-tips tips-icon" />
      <p class="tips-content">
        “关联类型”是模型关联的分类，如主机于交换机、路由之间的关系都可以分类为“上联”类型
        <a class="more">更多详情 &gt;&gt;</a>
      </p>
      <i class="bk-cmdb-icon icon-cc-tips-close tips-close" @click="tipVisible = false" />
    </div>

    <div class="relation-toolbar">
      <button class="bk-button bk-primary" @click="openCreate">新建</button>
      <div class="toolbar-spacer" />
      <el-input
        v-model="keyword"
        clearable
        class="legacy-input search-input"
        placeholder="请输入关联类型名称"
        :suffix-icon="'Search'"
        @keyup.enter="reload"
        @clear="reload"
      />
    </div>

    <el-table
      :data="rows"
      v-loading="loading"
      stripe
      row-key="id"
      class="relation-table"
      @row-click="handleRowClick"
    >
      <el-table-column prop="bk_asst_id" label="唯一标识" min-width="150">
        <template #default="{ row }"><span class="cell-link">{{ row.bk_asst_id }}</span></template>
      </el-table-column>
      <el-table-column prop="bk_asst_name" label="名称" min-width="140">
        <template #default="{ row }">{{ row.bk_asst_name || '--' }}</template>
      </el-table-column>
      <el-table-column prop="src_des" label="源→目标描述" min-width="180" show-overflow-tooltip />
      <el-table-column prop="dest_des" label="目标→源描述" min-width="180" show-overflow-tooltip />
      <el-table-column prop="count" label="使用数" width="90">
        <template #default="{ row }">{{ row.count ?? '--' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-tooltip v-if="row.ispre" content="禁止操作内置关联类型" placement="top">
            <span class="disabled-action">编辑</span>
          </el-tooltip>
          <el-button v-else link type="primary" size="small" @click.stop="openEdit(row)">编辑</el-button>
          <el-tooltip v-if="row.ispre" content="禁止操作内置关联类型" placement="top">
            <span class="disabled-action">删除</span>
          </el-tooltip>
          <el-button v-else link type="danger" size="small" @click.stop="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && rows.length === 0" :description="keyword ? '没有匹配的关联类型' : '暂无关联类型'" :image-size="80">
      <el-button v-if="keyword" link type="primary" @click="clearFilter">清空筛选</el-button>
    </el-empty>
    <el-pagination
      v-model:current-page="page"
      :page-size="pageSize"
      :page-sizes="[10, 20, 50]"
      :total="total"
      layout="total, sizes, prev, pager, next, jumper"
      class="pagination"
      @current-change="load"
      @size-change="handleSizeChange"
    />

    <el-drawer
      v-model="drawerVisible"
      :title="drawerMode === 'view' ? '关联类型详情' : (form.id ? '编辑关联类型' : '新建关联类型')"
      size="450px"
      :before-close="beforeDrawerClose"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="relation-form">
        <el-form-item label="唯一标识" prop="bk_asst_id">
          <el-input v-model.trim="form.bk_asst_id" :disabled="drawerMode === 'view' || !!form.id || form.ispre" placeholder="请输入英文标识" />
        </el-form-item>
        <el-form-item label="名称" prop="bk_asst_name">
          <el-input v-model.trim="form.bk_asst_name" :disabled="drawerMode === 'view' || form.ispre" placeholder="请输入名称" />
        </el-form-item>
        <el-form-item label="源→目标描述" prop="src_des">
          <el-input v-model.trim="form.src_des" :disabled="drawerMode === 'view' || form.ispre" placeholder="请输入关联描述，如：连接、运行" />
        </el-form-item>
        <el-form-item label="目标→源描述" prop="dest_des">
          <el-input v-model.trim="form.dest_des" :disabled="drawerMode === 'view' || form.ispre" placeholder="请输入关联描述，如：属于、上联" />
        </el-form-item>
        <el-form-item label="是否有方向" prop="direction">
          <el-radio-group v-model="form.direction" :disabled="drawerMode === 'view' || form.ispre">
            <el-radio value="src_to_dest">有，源指向目标</el-radio>
            <el-radio value="none">无方向</el-radio>
            <el-radio value="bidirectional">双向</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <div v-if="drawerMode !== 'view'" class="drawer-footer">
        <el-button @click="beforeDrawerClose(() => { drawerVisible = false })">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!!form.ispre" @click="submit">{{ form.id ? '保存' : '提交' }}</el-button>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchAssociationTypes,
  countAssociationTypes,
  createAssociationType,
  updateAssociationType,
  deleteAssociationType
} from '../../api/cmdb'

const tipVisible = ref(true)
const keyword = ref('')
const sentKeyword = ref('')
const rows = ref([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const formRef = ref(null)
const drawerVisible = ref(false)
const drawerMode = ref('edit')
const saving = ref(false)
const originalForm = ref(null)

const form = reactive({
  id: null,
  ispre: false,
  bk_asst_id: '',
  bk_asst_name: '',
  src_des: '',
  dest_des: '',
  direction: 'src_to_dest'
})
const rules = {
  bk_asst_id: [
    { required: true, message: '请输入英文标识', trigger: 'blur' },
    { pattern: /^[A-Za-z][A-Za-z0-9_]*$/, message: '只能使用英文、数字和下划线，且以英文开头', trigger: 'blur' },
    { max: 128, message: '长度不能超过 128 个字符', trigger: 'blur' }
  ],
  bk_asst_name: [
    { required: true, message: '请输入名称', trigger: 'blur' },
    { max: 20, message: '长度不能超过 20 个字符', trigger: 'blur' }
  ],
  src_des: [
    { required: true, message: '请输入源→目标描述', trigger: 'blur' },
    { max: 256, message: '长度不能超过 256 个字符', trigger: 'blur' }
  ],
  dest_des: [
    { required: true, message: '请输入目标→源描述', trigger: 'blur' },
    { max: 256, message: '长度不能超过 256 个字符', trigger: 'blur' }
  ],
  direction: [{ required: true, message: '请选择方向', trigger: 'change' }]
}

const condition = computed(() => {
  const c = {}
  if (sentKeyword.value.trim()) c.bk_asst_name = { $regex: sentKeyword.value.trim() }
  return c
})

async function load() {
  loading.value = true
  try {
    const data = await searchAssociationTypes({
      condition: condition.value,
      page: { start: (page.value - 1) * pageSize.value, limit: pageSize.value, sort: '-ispre' }
    })
    rows.value = data?.info || []
    total.value = data?.count || 0
    if (rows.value.length) {
      const ids = rows.value.map((r) => r.bk_asst_id)
      try {
        const usage = await countAssociationTypes(ids)
        const counts = usage?.associations || []
        rows.value = rows.value.map((r) => ({
          ...r,
          count: counts.find((c) => c.bk_asst_id === r.bk_asst_id)?.count ?? '--'
        }))
      } catch { /* 使用数失败不阻断列表 */ }
    }
  } catch (e) {
    ElMessage.error('关联类型加载失败: ' + (e?.message || '后端异常'))
  } finally { loading.value = false }
}
function reload() {
  sentKeyword.value = keyword.value
  page.value = 1
  load()
}
function clearFilter() {
  keyword.value = ''
  reload()
}
function handleSizeChange(size) {
  pageSize.value = size
  page.value = 1
  load()
}
function resetForm(row = null) {
  Object.assign(form, row ? {
    id: row.id,
    ispre: !!row.ispre,
    bk_asst_id: row.bk_asst_id || '',
    bk_asst_name: row.bk_asst_name || '',
    src_des: row.src_des || '',
    dest_des: row.dest_des || '',
    direction: row.direction || 'src_to_dest'
  } : {
    id: null, ispre: false, bk_asst_id: '', bk_asst_name: '', src_des: '', dest_des: '', direction: 'src_to_dest'
  })
  originalForm.value = JSON.stringify({ ...form })
}
function openCreate() {
  drawerMode.value = 'edit'
  resetForm()
  drawerVisible.value = true
}
function openEdit(row) {
  drawerMode.value = 'edit'
  resetForm(row)
  drawerVisible.value = true
}
function handleRowClick(row, column) {
  if (column?.property === 'operation') return
  drawerMode.value = 'view'
  resetForm(row)
  drawerVisible.value = true
}
function hasChanges() {
  return originalForm.value !== JSON.stringify({ ...form })
}
async function beforeDrawerClose(done) {
  if (drawerMode.value !== 'view' && hasChanges()) {
    try {
      await ElMessageBox.confirm('离开将会导致未保存信息丢失', '确认离开当前页？', { type: 'warning', confirmButtonText: '离开', cancelButtonText: '取消' })
      done?.()
    } catch { /* stay */ }
  } else done?.()
}
async function submit() {
  if (form.ispre) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    const payload = {
      bk_asst_id: form.bk_asst_id,
      bk_asst_name: form.bk_asst_name,
      src_des: form.src_des,
      dest_des: form.dest_des,
      direction: form.direction
    }
    if (form.id) {
      delete payload.bk_asst_id
      await updateAssociationType(form.id, payload)
      ElMessage.success('编辑成功')
    } else {
      await createAssociationType(payload)
      ElMessage.success('创建成功')
    }
    drawerVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error((form.id ? '编辑' : '创建') + '失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}
async function remove(row) {
  if (row.ispre) return
  try {
    await ElMessageBox.confirm(`确定删除关联类型「${row.bk_asst_name || row.bk_asst_id}」?`, '确认删除关联类型', { type: 'warning' })
    await deleteAssociationType(row.id)
    ElMessage.success('删除成功')
    await load()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}

onMounted(load)
</script>

<style scoped>
.association-page { padding: 15px 20px 0; background: #fff; }
.feature-tip { margin-bottom: 12px; }
.feature-tip .tips-icon { font-size: 16px; color: #3A84FF; margin-right: 5px; }
.feature-tip .tips-content { color: #63656E; font-size: 12px; }
.feature-tip .tips-content .more { color: #3A84FF; margin-left: 20px; cursor: pointer; }
.feature-tip .tips-close { color: #979BA5; cursor: pointer; font-size: 12px; }
.relation-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.toolbar-spacer { flex: 1; }
.search-input { width: 300px; }
.relation-table :deep(.el-table__row) { cursor: pointer; }
.disabled-action { color: #C4C6CC; font-size: 12px; margin-right: 12px; cursor: not-allowed; }
.cell-link { color: #3A84FF; cursor: pointer; }
.pagination { margin-top: 16px; justify-content: flex-end; }
.relation-form { padding: 10px 4px 80px; }
.drawer-footer {
  position: absolute; bottom: 0; left: 0; right: 0;
  padding: 12px 20px; border-top: 1px solid #DCDEE5; background: #fff; text-align: right;
}
</style>
