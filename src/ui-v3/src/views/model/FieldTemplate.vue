<template>
  <div class="page-card">
    <h1 class="page-title">字段组合模板</h1>
    <p class="page-tips">将一组字段配置复用到多个模型,避免每个模型重复定义相同字段</p>

    <div class="table-toolbar">
      <el-input v-model="keyword" placeholder="搜索模板" size="small" clearable style="width: 240px" />
      <el-button type="primary" size="small" :icon="'Plus'" @click="openDialog()">新建模板</el-button>
      <div class="spacer" />
      <el-button size="small" :icon="'Refresh'" @click="load">刷新</el-button>
    </div>

    <el-table :data="filteredRows" v-loading="loading" stripe>
      <el-table-column prop="id" label="模板 ID" width="110" />
      <el-table-column prop="name" label="模板名称" min-width="200" />
      <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">{{ row.description || '-' }}</template>
      </el-table-column>
      <el-table-column label="绑定模型数" width="120">
        <template #default="{ row }">{{ row.bind_object_info?.length || 0 }}</template>
      </el-table-column>
      <el-table-column label="创建人" width="120">
        <template #default="{ row }">{{ row.creator || row.bk_created_by || '--' }}</template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="160">
        <template #default="{ row }">{{ (row.create_time || row.bk_created_at || '').replace('T', ' ').slice(0, 16) || '--' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="showDetail(row)">查看字段</el-button>
          <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button link type="primary" @click="openBindDialog(row)">绑定模型</el-button>
          <el-button link type="danger" @click="removeTpl(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && rows.length === 0" description="暂无字段组合模板" :image-size="80" />

    <!-- 模板字段预览 -->
    <el-drawer v-model="detailVisible" :title="`「${detail?.name}」模板字段`" size="45%">
      <el-table :data="detailFields" size="default">
        <el-table-column prop="field.bk_property_id" label="字段 ID" min-width="140" />
        <el-table-column prop="field.bk_property_name" label="字段名称" min-width="120" />
        <el-table-column prop="field.bk_property_type" label="类型" width="110" />
        <el-table-column prop="field.bk_property_group" label="分组" min-width="120" />
      </el-table>
      <el-empty v-if="detailFields.length === 0" description="该模板暂无字段" :image-size="80" />
    </el-drawer>

    <!-- 新建 / 编辑 模板 -->
    <el-dialog v-model="formVisible" :title="form.id ? '编辑字段组合模板' : '新建字段组合模板'" width="560px">
      <el-form label-width="100px" :model="form">
        <el-form-item label="模板名称" required>
          <el-input v-model="form.name" placeholder="如:通用基础字段" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="包含字段" required>
          <el-button size="small" @click="showFieldPicker = true">选择字段</el-button>
          <div class="picked-list">
            <el-tag v-for="p in form.properties" :key="p.bk_property_id" closable style="margin: 4px"
              @close="removePick(p)">
              {{ p.bk_property_name }} ({{ p.bk_property_id }})
            </el-tag>
            <span v-if="!form.properties.length" class="hint">未选择</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <!-- 字段选择 -->
    <el-dialog v-model="showFieldPicker" title="选择字段" width="640px" top="6vh" @close="pickerKeyword = ''">
      <el-input v-model="pickerKeyword" placeholder="搜索字段" size="small" clearable style="margin-bottom: 8px" />
      <el-table :data="filteredPickerAttrs" max-height="360" size="small" border @selection-change="onPickChange">
        <el-table-column type="selection" width="44" />
        <el-table-column prop="bk_property_id" label="字段 ID" min-width="200" />
        <el-table-column prop="bk_property_name" label="字段名" min-width="160" />
        <el-table-column prop="bk_property_type" label="类型" width="120" />
      </el-table>
      <template #footer>
        <el-button @click="showFieldPicker = false">完成</el-button>
      </template>
    </el-dialog>

    <!-- 绑定模型 -->
    <el-dialog v-model="bindVisible" :title="`绑定模型到「${bindTarget?.name}」`" width="540px">
      <el-form label-width="100px">
        <el-form-item label="已绑定模型">
          <el-tag v-for="o in bindTarget?.bind_object_info || []" :key="o.bk_obj_id" closable style="margin: 4px"
            @close="unbind(o.bk_obj_id)">{{ o.bk_obj_id }}</el-tag>
          <span v-if="!bindTarget?.bind_object_info?.length" class="hint">未绑定</span>
        </el-form-item>
        <el-form-item label="选择模型">
          <el-select v-model="newBindObj" filterable style="width: 100%" placeholder="选择要绑定的模型">
            <el-option v-for="m in modelList" :key="m.bk_obj_id" :label="`${m.bk_obj_name} (${m.bk_obj_id})`" :value="m.bk_obj_id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bindVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!newBindObj" @click="doBind">绑定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http, searchFieldTemplates, createFieldTemplate, updateFieldTemplate, deleteFieldTemplate, searchModels } from '../../api/cmdb'

const rows = ref([])
const keyword = ref('')
const loading = ref(false)

const detailVisible = ref(false)
const detail = ref(null)
const detailFields = ref([])

const formVisible = ref(false)
const saving = ref(false)
const form = ref({ id: null, name: '', description: '', properties: [] })
const originalPropIds = ref([])

const showFieldPicker = ref(false)
const pickerKeyword = ref('')
const pickerTableRef = ref()
const allAttrs = ref([])
const pickedIds = ref([])

const bindVisible = ref(false)
const bindTarget = ref(null)
const newBindObj = ref(null)
const modelList = ref([])

const filteredRows = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return rows.value
  return rows.value.filter((r) => (r.name || '').toLowerCase().includes(kw) || (r.description || '').toLowerCase().includes(kw))
})
const filteredPickerAttrs = computed(() => {
  const kw = pickerKeyword.value.trim().toLowerCase()
  if (!kw) return allAttrs.value
  return allAttrs.value.filter((a) => (a.bk_property_name || '').toLowerCase().includes(kw) || (a.bk_property_id || '').toLowerCase().includes(kw))
})

async function load() {
  loading.value = true
  try {
    const data = await searchFieldTemplates({ page: { start: 0, limit: 200 } })
    rows.value = data?.info || []
  } catch (e) {
    ElMessage.error('加载失败: ' + (e?.message || '后端异常'))
  } finally { loading.value = false }
}

async function showDetail(row) {
  detail.value = row
  detailVisible.value = true
  try {
    const data = await http.get(`/find/field_template/${row.id}`)
    detailFields.value = data?.attributes || data?.fields || []
  } catch (e) { detailFields.value = [] }
}

async function openDialog(row) {
  form.value = { id: null, name: '', description: '', properties: [] }
  originalPropIds.value = []
  if (row) {
    form.value.id = row.id
    form.value.name = row.name || ''
    form.value.description = row.description || ''
    // 拉详情填字段
    try {
      const data = await http.get(`/find/field_template/${row.id}`)
      const arr = (data?.attributes || data?.fields || []).map((a) => ({ ...a.field, __raw: a }))
      form.value.properties = arr
      originalPropIds.value = arr.map((a) => a.bk_property_id)
    } catch (e) { /* 容忍 */ }
  }
  // 拉 host 模型字段(独立模式默认有 host)
  try {
    const data = await http.post('/find/objectattr', { bk_obj_id: 'host', bk_supplier_account: '0' })
    allAttrs.value = (data?.data || data?.info || []).map((a) => ({ bk_property_id: a.bk_property_id, bk_property_name: a.bk_property_name, bk_property_type: a.bk_property_type }))
  } catch (e) { allAttrs.value = [] }
  formVisible.value = true
  nextTick(() => {
    if (form.value.id && pickerTableRef.value) {
      pickedIds.value = originalPropIds.value.slice()
      for (const a of allAttrs.value) {
        if (pickedIds.value.includes(a.bk_property_id)) pickerTableRef.value.toggleRowSelection(a, true)
      }
    }
  })
}

function onPickChange(rows) {
  pickedIds.value = rows.map((r) => r.bk_property_id)
  form.value.properties = rows
}

function removePick(p) {
  form.value.properties = form.value.properties.filter((x) => x.bk_property_id !== p.bk_property_id)
  pickedIds.value = pickedIds.value.filter((id) => id !== p.bk_property_id)
}

async function submitForm() {
  if (!form.value.name) { ElMessage.warning('请填写模板名称'); return }
  if (!form.value.properties.length) { ElMessage.warning('请至少选择一个字段'); return }
  saving.value = true
  try {
    const attributes = form.value.properties.map((p) => ({
      bk_property_id: p.bk_property_id,
      bk_property_name: p.bk_property_name,
      bk_property_type: p.bk_property_type
    }))
    const payload = { name: form.value.name, description: form.value.description, attributes }
    if (form.value.id) {
      await updateFieldTemplate(form.value.id, payload)
      ElMessage.success('已更新')
    } else {
      await createFieldTemplate(payload)
      ElMessage.success('已创建')
    }
    formVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}

async function removeTpl(row) {
  await ElMessageBox.confirm(`确定删除字段组合模板「${row.name}」?`, '删除确认', { type: 'warning' })
  try {
    await deleteFieldTemplate(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}

async function openBindDialog(row) {
  bindTarget.value = row
  newBindObj.value = null
  bindVisible.value = true
  if (!modelList.value.length) {
    try {
      const data = await searchModels({})
      modelList.value = data || []
    } catch (e) { modelList.value = [] }
  }
}

function unbind(objId) {
  if (!bindTarget.value) return
  ElMessageBox.confirm(`确定解除「${objId}」与模板的绑定?`, '解绑', { type: 'warning' })
    .then(async () => {
      const cur = (bindTarget.value.bind_object_info || []).map((o) => o.bk_obj_id).filter((id) => id !== objId)
      try {
        await updateFieldTemplate(bindTarget.value.id, { bind: cur })
        ElMessage.success('已解绑')
        await load()
      } catch (e) { ElMessage.error('解绑失败: ' + (e?.message || '后端异常')) }
    }).catch(() => {})
}

async function doBind() {
  if (!newBindObj.value || !bindTarget.value) return
  saving.value = true
  try {
    const cur = (bindTarget.value.bind_object_info || []).map((o) => o.bk_obj_id)
    if (!cur.includes(newBindObj.value)) cur.push(newBindObj.value)
    await updateFieldTemplate(bindTarget.value.id, { bind: cur })
    ElMessage.success('绑定成功')
    bindVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error('绑定失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}

onMounted(load)
</script>

<style scoped>
.page-title { font-size: 16px; color: #313238; font-weight: 400; padding: 0 20px; height: 50px; line-height: 50px; border-bottom: 1px solid #E7E9EF; margin: 0; }
.page-tips { margin: 0; padding: 10px 20px; font-size: 12px; color: #979BA5; background: #F0F5FF; border-bottom: 1px solid #E7E9EF; }
.table-toolbar { display: flex; align-items: center; gap: 8px; margin: 12px 0; }
.table-toolbar .spacer { flex: 1; }
.picked-list { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.hint { color: #979BA5; font-size: 12px; }
</style>