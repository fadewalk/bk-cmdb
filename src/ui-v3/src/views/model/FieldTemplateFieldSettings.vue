<template>
  <div class="create-field-settings">
    <template v-if="!isCreateSuccess">
      <top-steps :current="1" />
      <div class="field-manage">
        <div class="toolbar">
          <button class="bk-button bk-primary" @click="handleAddField">添加字段</button>
          <button class="bk-button" style="margin-left: 8px" @click="importSliderVisible = true">从模型导入</button>
          <div class="filter">
            <el-input
              v-model="filterWord"
              class="legacy-input search-input"
              placeholder="请输入字段名称"
              clearable
              :suffix-icon="'Search'"
            />
            <button class="bk-button unique-button" @click="uniqueDrawerOpen = true">
              唯一校验
              <em class="num">{{ draft.uniqueList.length }}</em>
            </button>
          </div>
        </div>

        <div v-if="displayFieldList.length" class="field-grid">
          <div
            v-for="(item, index) in displayFieldList"
            :key="item.field.id"
            class="field-card"
            @click="handleEditField(item.field)"
          >
            <span class="drag-icon"><span class="bar" /><span class="bar" /></span>
            <div class="field-icon">
              <i class="bk-cmdb-icon" :class="`icon-cc-field-${item.field.bk_property_type || 'singlechar'}`" />
            </div>
            <div class="field-info">
              <div class="field-name-area">
                <span class="field-name" :title="item.field.bk_property_name">{{ item.field.bk_property_name }}</span>
                <span v-if="item.field.isrequired?.value ?? item.field.isrequired" class="field-required">*</span>
              </div>
              <div class="field-id-area">
                <span class="field-id">{{ item.field.bk_property_id }}</span>
              </div>
            </div>
            <div class="tags">
              <span v-if="uniqueTypeOf(item.field) === 'single'" class="tag unique"><em class="tag-text">单独唯一</em></span>
              <span v-else-if="uniqueTypeOf(item.field) === 'union'" class="tag unique union"><em class="tag-text">联合唯一</em></span>
            </div>
            <div class="field-action" @click.stop>
              <el-tooltip content="删除字段" placement="top">
                <button
                  :class="['field-delete', { 'is-disabled': fieldUniqueCount(item.field) > 0 }]"
                  :disabled="fieldUniqueCount(item.field) > 0"
                  title=""
                  @click="handleRemoveField(item.field)"
                >
                  <i class="bk-cmdb-icon icon-cc-delete" />
                </button>
              </el-tooltip>
            </div>
          </div>
        </div>

        <div v-else class="empty-set">
          <svg class="empty-img" width="140" height="100" viewBox="0 0 140 100" fill="none">
            <path d="M20 38 L70 22 L120 38 L120 72 L70 88 L20 72 Z" stroke="#DCDEE5" stroke-width="2" fill="#FAFBFD" />
            <path d="M20 38 L45 46 L45 82 L20 72 Z" stroke="#DCDEE5" stroke-width="2" fill="#F5F7FA" />
            <path d="M70 22 L45 46 M70 22 L95 46 M45 46 L95 46 L120 38" stroke="#DCDEE5" stroke-width="2" fill="none" />
          </svg>
          <p class="empty-text">尚未创建字段, <a class="empty-link" @click="handleAddField">立即创建</a></p>
        </div>
      </div>

      <div class="layout-footer">
        <button class="bk-button" @click="handlePrevStep">上一步</button>
        <button class="bk-button bk-primary" :disabled="submitDisabled" @click="handleSubmit">提交</button>
        <button class="bk-button" :disabled="submitDisabled" @click="previewVisible = true">预览</button>
        <button class="bk-button" @click="handleCancel">取消</button>
      </div>
    </template>

    <!-- 创建成功(旧版 create-success 复刻) -->
    <div v-else class="create-success">
      <i class="success-icon" />
      <div class="title">{{ draft.templateId ? '字段模板保存成功' : '字段模板创建成功' }}</div>
      <div class="summary">接下来，您可以绑定需要应用的模型</div>
      <div class="actions">
        <button class="bk-button bk-primary" @click="goBind">立即绑定</button>
        <button class="bk-button" @click="goBackList">返回列表</button>
      </div>
    </div>

    <!-- 新建/编辑字段滑窗 -->
    <el-drawer v-model="fieldSliderVisible" :title="editingFieldId ? '编辑字段' : '新建字段'" size="640px" :before-close="beforeFieldSliderClose">
      <div class="slider-form">
        <div class="legacy-form-row form-line">
          <span class="label-title">字段名称<span class="color-danger">*</span></span>
          <el-input v-model.trim="fieldForm.bk_property_name" class="legacy-input form-input" maxlength="256" placeholder="请输入字段名称" />
        </div>
        <div class="legacy-form-row form-line">
          <span class="label-title">字段标识<span class="color-danger">*</span></span>
          <el-input v-model.trim="fieldForm.bk_property_id" class="legacy-input form-input" :disabled="!!editingFieldId" placeholder="请输入字段标识" />
          <i class="bk-cmdb-icon icon-cc-exclamation-tips row-icon" title="可使用英文、数字、下划线，需以字母开头" />
        </div>
        <div class="legacy-form-row form-line">
          <span class="label-title">字段类型<span class="color-danger">*</span></span>
          <el-select v-model="fieldForm.bk_property_type" class="legacy-select form-input" :disabled="!!editingFieldId">
            <el-option v-for="t in FIELD_TYPES" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </div>
        <div class="legacy-form-row form-line">
          <span class="label-title">单位</span>
          <el-input v-model.trim="fieldForm.unit" class="legacy-input form-input" placeholder="请输入单位" />
        </div>
        <div class="legacy-form-row form-line">
          <span class="label-title">描述</span>
          <el-input v-model="fieldForm.placeholder" type="textarea" :rows="3" maxlength="2000" class="legacy-textarea form-input" placeholder="请输入用户提示" />
        </div>
        <div class="legacy-form-row form-line">
          <span class="label-title">必填</span>
          <el-switch v-model="fieldForm.isrequired" />
        </div>
        <div class="legacy-form-row form-line">
          <span class="label-title">可编辑</span>
          <el-switch v-model="fieldForm.editable" />
        </div>
      </div>
      <template #footer>
        <el-button @click="beforeFieldSliderClose(() => { fieldSliderVisible = false })">取消</el-button>
        <el-button type="primary" @click="handleFieldSave">保存</el-button>
      </template>
    </el-drawer>

    <!-- 从模型导入滑窗 -->
    <el-drawer v-model="importSliderVisible" title="从模型导入" size="640px">
      <div class="slider-form">
        <div class="legacy-form-row form-line">
          <span class="label-title">来源模型<span class="color-danger">*</span></span>
          <el-select v-model="importModelId" class="legacy-select form-input" filterable placeholder="请选择模型" @change="loadImportAttrs">
            <el-option v-for="m in importModels" :key="m.bk_obj_id" :label="`${m.bk_obj_name} (${m.bk_obj_id})`" :value="m.bk_obj_id" />
          </el-select>
        </div>
        <div class="import-attr-list">
          <el-checkbox
            v-for="attr in importAttrs"
            :key="attr.bk_property_id"
            :model-value="isImportChecked(attr)"
            @change="toggleImportAttr(attr, $event)"
          >
            {{ attr.bk_property_name }}（{{ attr.bk_property_id }}）
          </el-checkbox>
          <p v-if="importModelId && !importAttrs.length" class="import-empty">该模型暂无可导入字段</p>
        </div>
      </div>
      <template #footer>
        <el-button @click="importSliderVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!importSelected.length" @click="handleImportSave">确认导入</el-button>
      </template>
    </el-drawer>

    <!-- 唯一校验抽屉 -->
    <el-drawer v-model="uniqueDrawerOpen" title="唯一校验" size="520px">
      <div class="unique-manager">
        <button class="bk-button bk-primary add-unique" @click="addUnique">添加校验</button>
        <p v-if="!draft.uniqueList.length" class="unique-empty">暂无唯一校验，联合唯一与单独唯一均在此管理</p>
        <div v-for="(unique, uIndex) in draft.uniqueList" :key="unique.id" class="unique-item">
          <div class="unique-head">
            <span class="unique-title">校验 {{ uIndex + 1 }}</span>
            <el-button link type="danger" size="small" @click="removeUnique(unique.id)">删除</el-button>
          </div>
          <el-select v-model="unique.keys" multiple class="legacy-select unique-keys" placeholder="选择字段">
            <el-option v-for="f in pureFieldList" :key="f.id" :label="f.bk_property_name" :value="f.id" />
          </el-select>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="uniqueDrawerOpen = false">确定</el-button>
      </template>
    </el-drawer>

    <!-- 字段预览抽屉 -->
    <el-drawer v-model="previewVisible" title="字段预览" size="640px">
      <el-table :data="pureFieldList" size="small">
        <el-table-column type="index" label="顺序" width="60" />
        <el-table-column prop="bk_property_id" label="字段标识" min-width="140" />
        <el-table-column prop="bk_property_name" label="字段名称" min-width="140" />
        <el-table-column prop="bk_property_type" label="类型" width="100" />
        <el-table-column label="必填" width="70">
          <template #default="{ row }">{{ row.isrequired?.value ? '是' : '否' }}</template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup>
// 新建/编辑字段组合模板第二步(旧版 field-template/create-field-settings.vue + field-manage 复刻)
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import TopSteps from './field-template/TopSteps.vue'
import { useFieldTemplateDraft } from '../../stores/fieldTemplateDraft'
import {
  getFieldTemplate, searchFieldTemplateAttributes, searchFieldTemplateUniques,
  createFieldTemplate, updateFieldTemplate, searchModels, searchModelAttributes
} from '../../api/cmdb'

// 本地临时字段 id(提交时不会传给后端,仅作前端 key)
let uidSeq = 0
const uuidv4 = () => `f-${Date.now().toString(36)}-${(uidSeq += 1)}`

const FIELD_TYPES = [
  { id: 'singlechar', name: '短字符' },
  { id: 'longchar', name: '长字符' },
  { id: 'int', name: '数字' },
  { id: 'float', name: '浮点' },
  { id: 'enum', name: '枚举' },
  { id: 'date', name: '日期' },
  { id: 'time', name: '时间' },
  { id: 'timezone', name: '时区' },
  { id: 'bool', name: '布尔' },
  { id: 'objuser', name: '用户' }
]

const router = useRouter()
const route = useRoute()
const draft = useFieldTemplateDraft()

const filterWord = ref('')
const isCreateSuccess = ref(false)
const previewVisible = ref(false)
const uniqueDrawerOpen = ref(false)
const submitting = ref(false)

// 字段滑窗
const fieldSliderVisible = ref(false)
const editingFieldId = ref(null)
const fieldFormBefore = ref(null)
const fieldForm = ref(defaultFieldForm())
function defaultFieldForm() {
  return {
    bk_property_name: '',
    bk_property_id: '',
    bk_property_type: 'singlechar',
    unit: '',
    placeholder: '',
    isrequired: false,
    editable: true
  }
}

// 导入滑窗
const importSliderVisible = ref(false)
const importModels = ref([])
const importModelId = ref('')
const importAttrs = ref([])
const importSelected = ref([])

const pureFieldList = computed(() => draft.fieldList.map((item) => item.field))
const displayFieldList = computed(() => {
  if (!filterWord.value) return draft.fieldList
  const reg = filterWord.value.toLowerCase()
  return draft.fieldList.filter((item) => (item.field.bk_property_name || '').toLowerCase().includes(reg))
})
const submitDisabled = computed(() => !draft.basic.name?.length || !draft.fieldList.length)

function uniqueTypeOf(field) {
  const rules = draft.uniqueList.filter((u) => u.keys.includes(field.id))
  if (!rules.length) return ''
  return rules.some((u) => u.keys.length > 1) ? 'union' : 'single'
}
function fieldUniqueCount(field) {
  return draft.uniqueList.filter((u) => u.keys.includes(field.id)).length
}

// ---------- 编辑模式加载 ----------
onMounted(async () => {
  const editId = Number(route.params.id) || draft.templateId
  if (!editId) return
  draft.templateId = editId
  if (!draft.fieldList.length) {
    try {
      const [base, attrs, uniques] = await Promise.all([
        getFieldTemplate(editId),
        searchFieldTemplateAttributes(editId),
        searchFieldTemplateUniques(editId)
      ])
      draft.setBasic({ name: base?.name || '', description: base?.description || '' })
      const attrList = attrs?.info || attrs || []
      draft.setFields(attrList.map((f) => ({ field: normalizeIn(f), extra: {} })))
      const fieldIds = attrList.map((f) => f.bk_property_id)
      const uniqueList = (uniques?.info || uniques || []).map((u, i) => ({
        id: u.id ?? `u-${i}`,
        keys: (u.keys || []).map((key) => (typeof key === 'string' ? fieldIds.indexOf(key) : key))
          .map((idx) => (idx === -1 ? null : attrList[idx]?.bk_property_id && attrList[idx]))
          .filter(Boolean)
          .map((f) => f.id ?? f.bk_property_id)
      }))
      // keys 存储字段内部 id(uuid/属性 id),统一按 bk_property_id 匹配
      draft.setUniques(uniqueList.map((u, i) => ({
        id: u.id ?? `u-${i}`,
        keys: (uniques?.info || uniques || [])[i]?.keys?.map((k) => findFieldInternalId(k, attrList)) ?? u.keys
      })))
    } catch (e) {
      ElMessage.error('模板加载失败: ' + (e?.message || '后端异常'))
    }
  }
})
function normalizeIn(f) {
  return {
    id: f.bk_property_id || f.id,
    bk_property_id: f.bk_property_id,
    bk_property_name: f.bk_property_name,
    bk_property_type: f.bk_property_type,
    unit: f.unit || '',
    placeholder: f.placeholder ?? '',
    isrequired: typeof f.isrequired === 'object' ? (f.isrequired?.value ?? false) : !!f.isrequired,
    editable: typeof f.editable === 'object' ? (f.editable?.value ?? true) : !!f.editable,
    ismultiple: !!f.ismultiple,
    option: f.option || '',
    default: f.default ?? ''
  }
}
function findFieldInternalId(key, attrList) {
  // 后端 unique.keys 是属性 id 字符串;映射到本地字段内部 id
  const attr = attrList.find((f) => f.bk_property_id === key)
  return attr ? (attr.bk_property_id || attr.id) : key
}

// ---------- 字段增删改 ----------
function handleAddField() {
  editingFieldId.value = null
  fieldForm.value = defaultFieldForm()
  fieldFormBefore.value = null
  fieldSliderVisible.value = true
}
function handleEditField(field) {
  editingFieldId.value = field.id
  fieldForm.value = {
    bk_property_name: field.bk_property_name,
    bk_property_id: field.bk_property_id,
    bk_property_type: field.bk_property_type,
    unit: field.unit || '',
    placeholder: typeof field.placeholder === 'object' ? (field.placeholder?.value || '') : (field.placeholder || ''),
    isrequired: typeof field.isrequired === 'object' ? !!field.isrequired?.value : !!field.isrequired,
    editable: typeof field.editable === 'object' ? field.editable?.value !== false : field.editable !== false
  }
  fieldFormBefore.value = JSON.stringify(fieldForm.value)
  fieldSliderVisible.value = true
}
function beforeFieldSliderClose(done) {
  if (fieldFormBefore.value && fieldFormBefore.value !== JSON.stringify(fieldForm.value)) {
    ElMessage.warning('修改未保存')
  }
  done?.()
}
function handleFieldSave() {
  const f = fieldForm.value
  if (!f.bk_property_name || !f.bk_property_id) {
    ElMessage.warning('请输入字段名称和字段标识')
    return
  }
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(f.bk_property_id)) {
    ElMessage.warning('字段标识需以英文开头，可使用英文、数字、下划线')
    return
  }
  const existed = draft.fieldList.find((item) => item.field.bk_property_id === f.bk_property_id)
  if (existed && existed.field.id !== editingFieldId.value) {
    ElMessage.error('与已有字段的唯一标识或名称重复，请修改')
    return
  }
  const fieldData = { id: editingFieldId.value || uuidv4(), ...f }
  if (editingFieldId.value) {
    const idx = draft.fieldList.findIndex((item) => item.field.id === editingFieldId.value)
    if (idx !== -1) draft.fieldList[idx] = { field: fieldData, extra: {} }
  } else {
    draft.setFields([...draft.fieldList, { field: fieldData, extra: {} }])
  }
  fieldSliderVisible.value = false
}
function handleRemoveField(field) {
  draft.setFields(draft.fieldList.filter((item) => item.field.id !== field.id))
  draft.setUniques(draft.uniqueList
    .map((u) => ({ ...u, keys: u.keys.filter((k) => k !== field.id) }))
    .filter((u) => u.keys.length))
}

// ---------- 从模型导入 ----------
async function loadImportAttrs(objId) {
  importAttrs.value = []
  importSelected.value = []
  if (!objId) return
  try {
    const data = await searchModelAttributes(objId)
    importAttrs.value = (data?.info || data || []).filter((a) => a.bk_property_id && a.bk_property_id !== 'bk_obj_id')
  } catch { importAttrs.value = [] }
}
function isImportChecked(attr) {
  return importSelected.value.some((a) => a.bk_property_id === attr.bk_property_id)
}
function toggleImportAttr(attr, checked) {
  if (checked) importSelected.value = [...importSelected.value, attr]
  else importSelected.value = importSelected.value.filter((a) => a.bk_property_id !== attr.bk_property_id)
}
function handleImportSave() {
  const appended = importSelected.value.map((attr) => ({
    field: {
      id: uuidv4(),
      bk_property_id: attr.bk_property_id,
      bk_property_name: attr.bk_property_name,
      bk_property_type: attr.bk_property_type,
      unit: attr.unit || '',
      placeholder: attr.placeholder ?? '',
      isrequired: typeof attr.isrequired === 'object' ? (attr.isrequired?.value ?? false) : !!attr.isrequired,
      editable: typeof attr.editable === 'object' ? (attr.editable?.value ?? true) : attr.editable !== false,
      ismultiple: !!attr.ismultiple,
      option: attr.option || '',
      default: attr.default ?? ''
    },
    extra: {}
  }))
  draft.setFields([...draft.fieldList, ...appended])
  importSliderVisible.value = false
  importSelected.value = []
}

// ---------- 唯一校验 ----------
function addUnique() {
  draft.setUniques([...draft.uniqueList, { id: uuidv4(), keys: [] }])
}
function removeUnique(id) {
  draft.setUniques(draft.uniqueList.filter((u) => u.id !== id))
}

// ---------- 步骤流转 ----------
function handlePrevStep() {
  router.push(draft.templateId
    ? `/model/field-template/edit/${draft.templateId}/basic`
    : '/model/field-template/create/basic')
}
function handleCancel() {
  draft.clear()
  router.push('/model/field-template')
}
async function handleSubmit() {
  if (submitDisabled.value || submitting.value) return
  submitting.value = true
  try {
    const attributes = draft.fieldList.map((item) => normalizeOut(item.field))
    const uniques = draft.uniqueList
      .filter((u) => u.keys.length)
      .map((u) => ({
        keys: [...new Set(u.keys)]
          .map((key) => draft.fieldList.find((item) => item.field.id === key)?.field.bk_property_id)
          .filter(Boolean)
      }))
    if (draft.templateId) {
      await updateFieldTemplate({ id: draft.templateId, name: draft.basic.name, description: draft.basic.description, attributes, uniques })
    } else {
      await createFieldTemplate({ name: draft.basic.name, description: draft.basic.description, attributes, uniques })
    }
    isCreateSuccess.value = true
  } catch (e) {
    ElMessage.error('提交失败: ' + (e?.message || '后端异常'))
  } finally { submitting.value = false }
}
function normalizeOut(f) {
  return {
    bk_property_id: f.bk_property_id,
    bk_property_name: f.bk_property_name,
    bk_property_type: f.bk_property_type,
    unit: f.unit || '',
    option: f.option || '',
    default: f.default || null,
    ismultiple: !!f.ismultiple,
    placeholder: { lock: true, value: typeof f.placeholder === 'object' ? (f.placeholder?.value || '') : (f.placeholder || '') },
    isrequired: { lock: true, value: typeof f.isrequired === 'object' ? !!f.isrequired?.value : !!f.isrequired },
    editable: { lock: true, value: typeof f.editable === 'object' ? f.editable?.value !== false : f.editable !== false }
  }
}
function goBind() {
  const id = draft.templateId
  draft.clear()
  if (id) router.push(`/model/field-template?bindId=${id}`)
  else router.push('/model/field-template')
}
function goBackList() {
  draft.clear()
  router.push('/model/field-template')
}

watch(importSliderVisible, (visible) => {
  if (visible && !importModels.value.length) {
    searchModels({ page: { start: 0, limit: 1000 } })
      .then((data) => { importModels.value = data?.info || data || [] })
      .catch(() => { importModels.value = [] })
  }
})
</script>

<style scoped>
.create-field-settings {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  overflow-y: auto;
}
.field-manage {
  padding: 24px 108px;
  flex: 1;
}
.toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 30px;
}
.toolbar .filter {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.toolbar .search-input {
  width: 430px;
}
.unique-button .num {
  font-style: normal;
  font-size: 12px;
  background: #f0f1f5;
  border-radius: 2px;
  padding: 0 .5em;
  color: #979ba5;
  margin-left: 2px;
}

.field-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  width: 100%;
  align-content: flex-start;
}
.field-card {
  display: flex;
  align-items: center;
  position: relative;
  height: 60px;
  border: 1px solid transparent;
  background: #fff;
  box-shadow: 0 2px 4px 0 rgba(25, 25, 41, .05);
  border-radius: 2px;
  padding: 0 12px;
  user-select: none;
  cursor: pointer;
}
.field-card:hover {
  background: #f0f5ff;
  border: 1px solid #3a84ff;
}
.field-card:hover .drag-icon,
.field-card:hover .field-delete {
  visibility: visible;
}
.drag-icon {
  visibility: hidden;
  margin: 0 4px 0 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.drag-icon .bar {
  width: 3px;
  height: 10px;
  background-image: radial-gradient(circle, #c4c6cc 1px, transparent 1.2px);
  background-size: 3px 4px;
}
.field-icon {
  color: #989ca8;
  width: 24px;
  height: 24px;
  font-size: 18px;
  text-align: center;
  line-height: 24px;
  flex: 0 0 24px;
}
.field-info {
  flex: 1;
  margin-left: 12px;
  width: 0;
}
.field-name-area {
  display: flex;
  gap: 4px;
  position: relative;
  top: 4px;
}
.field-name {
  font-size: 12px;
  color: #313238;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.field-required {
  font-size: 12px;
  color: #ff5656;
}
.field-id-area {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: #c4c6cc;
}
.field-id {
  font-size: 12px;
}
.tags {
  display: flex;
  position: absolute;
  gap: 2px;
  right: 0;
  top: 0;
}
.tag {
  background: #f0f5ff;
  color: #3a84ff;
  border-radius: 2px;
  padding: 1px 4px;
  height: 16px;
  line-height: 16px;
  white-space: nowrap;
  display: flex;
  align-items: center;
}
.tag .tag-text {
  display: block;
  font-size: 12px;
  font-style: normal;
  transform: scale(.875);
}
.field-action {
  margin-left: 8px;
}
.field-delete {
  visibility: hidden;
  border: none;
  background: transparent;
  color: #63656e;
  cursor: pointer;
  font-size: 14px;
  padding: 2px;
}
.field-delete:hover {
  color: #3a84ff;
}
.field-delete.is-disabled {
  color: #c4c6cc;
  cursor: not-allowed;
}

.empty-set {
  padding: 80px 0 40px;
  text-align: center;
}
.empty-img {
  display: inline-block;
}
.empty-text {
  margin: 16px 0 0;
  font-size: 14px;
  color: #63656e;
}
.empty-link {
  color: #3a84ff;
  cursor: pointer;
}

.layout-footer {
  padding: 0 0 30px 108px;
  display: flex;
  gap: 10px;
}
.create-success {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
  min-height: 420px;
  background: #fff;
  flex: 1;
}
.success-icon {
  position: relative;
  width: 64px;
  height: 64px;
  background: #2dcb56;
  border-radius: 50%;
  margin-bottom: 18px;
}
.success-icon::before {
  content: '';
  position: absolute;
  left: 19px;
  top: 25px;
  width: 28px;
  height: 14px;
  border-bottom: 5px solid #fff;
  border-left: 5px solid #fff;
  transform: rotate(-45deg);
}
.create-success .title {
  color: #313238;
  font-size: 24px;
}
.create-success .summary {
  font-size: 14px;
  color: #63656e;
  margin-bottom: 8px;
}
.create-success .actions {
  display: flex;
  gap: 8px;
}

.slider-form {
  padding: 20px 24px;
}
.form-line {
  display: flex;
  align-items: flex-start;
}
.slider-form .label-title {
  flex: 0 0 110px;
  font-size: 14px;
  line-height: 32px;
  color: #63656e;
}
.form-input {
  flex: 1;
}
.import-attr-list {
  margin: 16px 0 0 110px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 480px;
  overflow-y: auto;
}
.import-empty {
  color: #979ba5;
  font-size: 12px;
}
.unique-manager {
  padding: 16px 24px;
}
.add-unique {
  margin-bottom: 16px;
}
.unique-empty {
  font-size: 12px;
  color: #979ba5;
}
.unique-item {
  border: 1px solid #dcdee5;
  border-radius: 2px;
  padding: 12px;
  margin-bottom: 12px;
}
.unique-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.unique-title {
  font-size: 14px;
  color: #313238;
  font-weight: 600;
}
.unique-keys {
  width: 100%;
}
</style>
