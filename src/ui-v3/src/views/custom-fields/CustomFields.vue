<template>
  <div class="custom-fields-page" v-bkloading="{ isLoading: loading }">
    <!-- 顶部功能提示(对齐原版 cmdb-tips) -->
    <div class="cmdb-tips" v-if="featureTips">
      <span>自定义字段：创建的业务专有字段，仅在业务内生效 <i class="req-star">*</i>为必填字段</span>
      <i class="bk-cmdb-icon icon-cc-tips-close close-x" @click="featureTips = false" />
    </div>

    <!-- Tab 切换:主线模型(原版 ['host', 'set', 'module']) -->
    <div class="bk-tab-header">
      <div
        v-for="m in mainLine"
        :key="m.bk_obj_id"
        :class="['bk-tab-item', { active: tab === m.bk_obj_id }]"
        @click="switchTab(m.bk_obj_id)">
        {{ m.bk_obj_name }}
      </div>
    </div>

    <!-- 工具栏(对齐原版 field-options) -->
    <div class="field-options">
      <el-button type="primary" :icon="'Plus'" :disabled="!activeModel || activeModel.bk_ispaused" @click="handleAddField(null)">新建字段</el-button>

      <el-dropdown trigger="click" @command="onImportDropdown">
        <el-button :icon="'ArrowDown'">
          导入<i class="caret">▾</i>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <!-- 老版业务自定义字段页 hideImport=false,不提供导入字段入口(仅模型详情页有) -->
            <el-dropdown-item command="export">导出字段</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <el-button :disabled="!activeModel || activeModel.bk_ispaused" @click="handleAddGroup">新建分组</el-button>

      <el-button :disabled="!properties.length" @click="previewShow = true">字段预览</el-button>

      <el-input
        class="filter-input"
        v-model.trim="keyword"
        placeholder="请输入关键字"
        clearable
        :prefix-icon="'Search'"
      />

      <div class="setting-btn" @click="configShow = true" title="实例表格字段排序设置">
        <i class="bk-icon icon-cog" />
      </div>
    </div>

    <!-- 分组 + 字段列表(对齐原版 group-list) -->
    <div class="group-list">
      <div
        v-for="(group, groupIndex) in groupedProperties"
        :key="group.bk_classification_id || group.info.bk_group_id"
        :class="['group-item', { 'is-collapse': !!groupCollapse[group.info.bk_group_id] }]"
      >
        <div class="group-header">
          <div class="collapse-group-title" @click="toggleGroup(group)">
            <i :class="['bk-icon toggle-icon', groupCollapse[group.info.bk_group_id] ? 'icon-angle-right' : 'icon-angle-down']" />
            <span class="group-name">{{ group.info.bk_group_name }}</span>
            <span class="group-count">( {{ group.properties.length }} )</span>
            <span v-if="group.info.bk_isdefault" class="default-tag">默认</span>

            <div class="group-actions" @click.stop>
              <el-button link size="small" :disabled="!isEditableGroup(group.info) || group.info.bk_isdefault" @click="handleEditGroup(group)">编辑分组</el-button>
              <el-button link size="small" type="danger" :disabled="!isEditableGroup(group.info) || group.info.bk_isdefault" @click="handleDeleteGroup(group, groupIndex)">删除分组</el-button>
            </div>
          </div>
        </div>

        <transition name="collapse">
          <ul v-show="!groupCollapse[group.info.bk_group_id]" class="field-list">
            <li
              v-for="(property, fieldIndex) in group.properties"
              :key="property.id || property.bk_property_id"
              class="field-item"
              @click="handleViewField({ group, groupIndex, fieldIndex, property })"
            >
              <div class="field-card">
                <div class="field-card-main">
                  <div class="field-name">{{ property.bk_property_name }}</div>
                  <div class="field-id">({{ property.bk_property_id }})</div>
                  <el-tag v-if="property.isrequired" size="small" type="danger" effect="plain">必填</el-tag>
                  <el-tag size="small" effect="plain">{{ property.bk_property_type }}</el-tag>
                </div>
                <div class="field-card-actions" @click.stop>
                  <el-button link :icon="'Edit'" :disabled="!isEditableField(property, false)" @click="handleEditField(group, property)">编辑</el-button>
                  <el-button link type="danger" :icon="'Delete'" :disabled="!isEditableField(property) || property.ispre" @click="handleDeleteField({ property, groupIndex, fieldIndex })">删除</el-button>
                </div>
              </div>
            </li>

            <li class="field-add" v-if="isEditableGroup(group.info)">
              <el-button link :icon="'Plus'" @click.stop="handleAddField(group)">添加字段</el-button>
            </li>
            <li v-else-if="!group.properties.length" class="property-empty">暂无字段</li>
          </ul>
        </transition>
      </div>

      <div class="add-group" v-if="activeModel && !activeModel.bk_ispaused">
        <el-button link :icon="'Plus'" @click="handleAddGroup">新建分组</el-button>
      </div>

      <el-empty
        v-if="!groupedProperties.length && !loading"
        :description="keyword ? '没有匹配的字段' : '该模型暂无自定义字段'"
        :image-size="80"
      />
    </div>

    <!-- 字段预览 -->
    <el-drawer v-model="previewShow" title="字段预览" size="640px" direction="rtl">
      <preview-field
        v-if="previewShow"
        :properties="properties"
        :property-groups="groups"
      />
    </el-drawer>

    <!-- 字段详情/编辑抽屉 -->
    <el-drawer
      v-model="fieldDrawer"
      :title="fieldDrawerTitle"
      size="640px"
      direction="rtl"
      :before-close="onFieldDrawerClose"
    >
      <field-detail-form
        v-if="fieldDrawer"
        :mode="fieldDrawerMode"
        :property="editingField"
        :properties="properties"
        :groups="groups"
        :is-main-line-model="isMainLine"
        @save="onFieldSave"
        @cancel="fieldDrawer = false"
      />
    </el-drawer>

    <!-- 字段选择 dialog(从已有字段添加) -->
    <el-dialog v-model="selectDialog" title="新建字段" width="600px" :close-on-click-modal="false">
      <div class="dialog-filter">
        <el-input v-model="selectFilter" placeholder="搜索字段名" clearable :prefix-icon="'Search'" />
      </div>
      <ul class="dialog-property">
        <li v-for="(p, i) in filteredSelectable" :key="i" class="property-item">
          <label :class="['property-label', { checked: selectSelected.includes(p) }]" :title="p.bk_property_name" @click="toggleSelect(p)">
            {{ p.bk_property_name }}
          </label>
        </li>
      </ul>
      <template #footer>
        <el-button @click="selectDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!selectSelected.length" @click="confirmSelectProperty">确定</el-button>
      </template>
    </el-dialog>

    <!-- 新建/编辑分组 dialog -->
    <el-dialog v-model="groupDialog" :title="groupEditing ? '编辑分组' : '新建分组'" width="480px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="分组名称" required>
          <el-input v-model="groupForm.name" placeholder="请输入分组名称" />
        </el-form-item>
        <el-form-item label="是否默认折叠">
          <el-switch v-model="groupForm.collapse" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="groupDialog = false">取消</el-button>
        <el-button type="primary" :loading="savingGroup" @click="confirmGroup">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, h } from 'vue'
import { Plus, Edit, Delete, ArrowDown, Search, Loading } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useBizStore } from '../../stores/biz'
import {
  http,
  searchModels,
  searchModelAttributes,
  createModelAttribute,
  updateModelAttribute,
  deleteModelAttribute,
  searchFieldGroups,
  createFieldGroup,
  updateFieldGroup,
  deleteFieldGroup
} from '../../api/cmdb'
import PreviewField from './PreviewField.vue'
import FieldDetailForm from './FieldDetailForm.vue'

const bizStore = useBizStore()

const featureTips = ref(true)
const mainLine = ref([])
const tab = ref('set')
const activeModel = computed(() => mainLine.value.find((m) => m.bk_obj_id === tab.value) || null)

const keyword = ref('')
const properties = ref([])
const groups = ref([])
const groupedProperties = ref([])
const groupCollapse = ref({})
const loading = ref(false)
const previewShow = ref(false)
const configShow = ref(false)

const fieldDrawer = ref(false)
const fieldDrawerMode = ref('view') // view | edit | create
const editingField = ref(null)
const fieldDrawerTitle = computed(() => {
  if (fieldDrawerMode.value === 'create') return '新建字段'
  if (fieldDrawerMode.value === 'edit') return '编辑字段'
  return '字段详情'
})

const selectDialog = ref(false)
const selectFilter = ref('')
const selectSelected = ref([])
const targetGroup = ref(null)

const groupDialog = ref(false)
const groupEditing = ref(null)
const groupForm = ref({ name: '', collapse: false })
const savingGroup = ref(false)

const isMainLine = computed(() => ['host', 'set', 'module', 'biz', 'process'].includes(tab.value))

function isEditableGroup(g) {
  if (!g) return false
  return !g.bk_isdefault && g.bk_owner_id !== '0'
}
function isEditableField(p, considerIspre = true) {
  if (!p) return false
  if (considerIspre && p.ispre) return false
  return true
}

function filterGroup(arr) {
  if (!keyword.value) return arr
  const reg = new RegExp(keyword.value, 'i')
  return arr.map((g) => ({
    ...g,
    properties: g.properties.filter((p) =>
      reg.test(p.bk_property_name) || reg.test(p.bk_property_id)
    )
  })).filter((g) => g.properties.length || g.info.bk_group_name.includes(keyword.value))
}

async function loadMainLine() {
  try {
    const data = await searchModels()
    mainLine.value = (data || [])
      .filter((m) => ['set', 'module', 'host'].includes(m.bk_obj_id))
      .sort((a, b) => ['set', 'module', 'host'].indexOf(a.bk_obj_id) - ['set', 'module', 'host'].indexOf(b.bk_obj_id))
    if (!mainLine.value.find((m) => m.bk_obj_id === tab.value) && mainLine.value[0]) {
      tab.value = mainLine.value[0].bk_obj_id
    }
  } catch (e) {
    mainLine.value = []
  }
}

async function loadGroups() {
  if (!tab.value) return
  try {
    const data = await searchFieldGroups(tab.value, bizStore.bizId ? { bk_biz_id: bizStore.bizId } : {})
    groups.value = (data?.info || []).map((g) => ({ info: g, properties: [] }))
  } catch (e) {
    groups.value = []
  }
}

async function loadProperties() {
  if (!tab.value) return
  loading.value = true
  try {
    // 业务维度字段(带 bk_biz_id,对齐老版自定义字段视图)
    const data = await searchModelAttributes(tab.value, bizStore.bizId)
    properties.value = data || []
    const byGroup = new Map()
    for (const g of groups.value) byGroup.set(g.info.bk_group_id, g)
    for (const p of properties.value) {
      const gid = p.bk_property_group || (groups.value[0] && groups.value[0].info.bk_group_id) || 'default'
      if (!byGroup.has(gid)) {
        const g = { info: { bk_group_id: gid, bk_group_name: gid, bk_isdefault: true }, properties: [] }
        byGroup.set(gid, g)
        groups.value.push(g)
      }
      byGroup.get(gid).properties.push(p)
    }
    groupedProperties.value = filterGroup(groups.value)
  } finally {
    loading.value = false
  }
}

function switchTab(objId) {
  if (tab.value === objId) return
  tab.value = objId
  fieldDrawer.value = false
  previewShow.value = false
}

function toggleGroup(g) {
  groupCollapse.value[g.info.bk_group_id] = !groupCollapse.value[g.info.bk_group_id]
}

watch(keyword, () => {
  groupedProperties.value = filterGroup(groups.value)
})

function handleViewField({ property }) {
  fieldDrawerMode.value = 'view'
  editingField.value = property
  fieldDrawer.value = true
}

function handleAddField(group) {
  targetGroup.value = group
  selectSelected.value = []
  selectFilter.value = ''
  selectDialog.value = true
}

const filteredSelectable = computed(() => {
  if (!selectFilter.value) return properties.value
  const k = selectFilter.value.toLowerCase()
  return properties.value.filter((p) =>
    (p.bk_property_name || '').toLowerCase().includes(k) || (p.bk_property_id || '').toLowerCase().includes(k)
  )
})

function toggleSelect(p) {
  const i = selectSelected.value.indexOf(p)
  if (i >= 0) selectSelected.value.splice(i, 1)
  else selectSelected.value.push(p)
}

async function confirmSelectProperty() {
  // 简化:不调用 create API,直接打开字段详情抽屉让用户填值
  const p = selectSelected.value[0]
  if (!p) return
  selectDialog.value = false
  fieldDrawerMode.value = 'create'
  editingField.value = { ...p, bk_obj_id: tab.value, bk_property_group: targetGroup.value?.info?.bk_group_id || (groups.value[0] && groups.value[0].info.bk_group_id) }
  fieldDrawer.value = true
}

function handleEditField(group, property) {
  fieldDrawerMode.value = 'edit'
  editingField.value = { ...property, bk_property_group: group?.info?.bk_group_id }
  fieldDrawer.value = true
}

function handleDeleteField({ property, groupIndex, fieldIndex }) {
  ElMessageBox.confirm(`确定删除字段「${property.bk_property_name}」?`, '删除确认', { type: 'warning' })
    .then(async () => {
      try {
        await deleteModelAttribute(property.id)
        ElMessage.success('已删除')
        await loadProperties()
      } catch (e) { ElMessage.error('删除失败') }
    })
    .catch(() => {})
}

function handleAddGroup() {
  groupEditing.value = null
  groupForm.value = { name: '', collapse: false }
  groupDialog.value = true
}
function handleEditGroup(g) {
  groupEditing.value = g
  groupForm.value = { name: g.info.bk_group_name, collapse: !!g.info.bk_iscollapse }
  groupDialog.value = true
}
async function confirmGroup() {
  if (!groupForm.value.name.trim()) { ElMessage.warning('请输入分组名称'); return }
  savingGroup.value = true
  try {
    if (groupEditing.value) {
      await updateFieldGroup(tab.value, groupEditing.value.info.id, groupForm.value.name)
    } else {
      await createFieldGroup({
        bk_obj_id: tab.value,
        bk_group_name: groupForm.value.name,
        bk_isdefault: false,
        bk_supplier_account: '0'
      })
    }
    ElMessage.success('已保存')
    groupDialog.value = false
    await loadGroups()
    await loadProperties()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally {
    savingGroup.value = false
  }
}
async function handleDeleteGroup(g, idx) {
  try {
    await ElMessageBox.confirm(`确定删除分组「${g.info.bk_group_name}」?`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    await deleteFieldGroup(g.info.id)
    ElMessage.success('已删除')
    groups.value.splice(idx, 1)
    groupedProperties.value = filterGroup(groups.value)
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}

function onFieldDrawerClose(done) {
  fieldDrawer.value = false
  done?.()
}

async function onFieldSave(payload) {
  try {
    if (fieldDrawerMode.value === 'edit') {
      await updateModelAttribute(editingField.value.id, payload)
      ElMessage.success('已保存')
    } else if (fieldDrawerMode.value === 'create') {
      await createModelAttribute({ ...payload, bk_obj_id: tab.value })
      ElMessage.success('已创建')
    }
    fieldDrawer.value = false
    await loadProperties()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  }
}

function onImportDropdown(cmd) {
  if (cmd === 'import') {
    ElMessage.info('导入字段(独立模式暂未对接,可用 export 模板)')
  } else if (cmd === 'export') {
    exportFields()
  }
}

function exportFields() {
  const rows = properties.value.map((p) => ({
    字段ID: p.bk_property_id,
    字段名称: p.bk_property_name,
    类型: p.bk_property_type,
    必填: p.isrequired ? '是' : '否',
    分组: p.bk_property_group || ''
  }))
  if (!rows.length) { ElMessage.warning('暂无字段可导出'); return }
  const csv = ['\uFEFF' + Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).map((v) => `"${v}"`).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${tab.value}_fields.csv`
  a.click()
  ElMessage.success('已导出')
}

watch(() => bizStore.bizId, () => { loadGroups().then(loadProperties) })
watch(tab, () => { loadGroups().then(loadProperties) })

onMounted(async () => {
  await loadMainLine()
  await loadGroups()
  await loadProperties()
})
</script>

<style scoped>
.custom-fields-page { padding: 15px 20px 20px; min-height: 100%; background: #fff; }

.cmdb-tips {
  display: flex; align-items: center; gap: 6px;
  background: #F0F8FF; border: 1px solid #A3C5FD; padding: 8px 32px 8px 16px;
  border-radius: 2px; margin: 15px 20px 10px; position: relative; font-size: 12px; color: #63656E;
}
.cmdb-tips::before {
  content: "\e2f0";
  font-family: 'bk-cmdb' !important;
  font-style: normal;
  font-size: 16px;
  line-height: 16px;
  color: #3A84FF;
}
.cmdb-tips .close-x { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #979BA5; font-size: 18px; }
.cmdb-tips .close-x:hover { color: #3a84ff; }

.bk-tab-header {
  display: flex; padding: 0; margin: 0 0 12px 0; border-bottom: 1px solid #DCDEE5;
}
.bk-tab-item {
  padding: 10px 20px; cursor: pointer; font-size: 14px; color: #63656e;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.bk-tab-item:hover { color: #3a84ff; }
.bk-tab-item.active { color: #3a84ff; border-bottom-color: #3a84ff; font-weight: 500; }

.field-options { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.field-options .filter-input { width: 240px; margin-left: auto; }
.field-options .caret { font-style: normal; margin-left: 4px; font-size: 12px; }
.setting-btn {
  width: 32px; height: 32px; line-height: 32px; text-align: center;
  border: 1px solid #c4c6cc; border-radius: 2px; cursor: pointer; color: #63656e;
}
.setting-btn:hover { border-color: #3a84ff; color: #3a84ff; }
.setting-btn .icon-cog { font-size: 16px; }

.group-list { background: #fafbfd; border: 1px solid #DCDEE5; border-radius: 2px; padding: 12px; min-height: 300px; }
.group-item { margin-bottom: 14px; background: #fff; border: 1px solid #DCDEE5; border-radius: 2px; }
.group-item:last-child { margin-bottom: 0; }
.group-header { padding: 0; }
.collapse-group-title {
  display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 14px;
  background: #fafbfd; cursor: pointer; border-bottom: 1px solid #DCDEE5;
  user-select: none;
}
.toggle-icon { font-size: 16px; color: #63656e; transition: transform 0.15s; }
.group-name { font-weight: 500; color: #313238; font-size: 14px; }
.group-count { color: #979BA5; font-size: 12px; }
.default-tag { background: #d3d5dd; color: #fff; font-size: 12px; padding: 0 6px; border-radius: 2px; margin-left: 4px; }
.group-actions { margin-left: auto; display: flex; gap: 4px; }

.field-list { padding: 0; list-style: none; margin: 0; }
.field-item { border-bottom: 1px solid #F0F1F5; padding: 0; }
.field-item:last-child { border-bottom: none; }
.field-card {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px;
  transition: background 0.15s;
}
.field-card:hover { background: #F0F8FF; }
.field-card-main { display: flex; align-items: center; gap: 8px; flex: 1; }
.field-name { font-weight: 500; color: #313238; }
.field-id { color: #C4C6CC; font-size: 12px; }
.field-card-actions { display: flex; gap: 4px; }

.field-add { padding: 8px 14px; }
.field-add .el-button { color: #979BA5; }
.field-add .el-button:hover { color: #3a84ff; }
.property-empty { padding: 16px 14px; color: #979BA5; font-size: 12px; text-align: center; }

.add-group { text-align: center; padding: 12px; }

.dialog-filter { margin-bottom: 12px; }
.dialog-property {
  list-style: none; margin: 0; padding: 0;
  max-height: 320px; overflow-y: auto;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
}
.property-item { list-style: none; }
.property-label {
  display: block; padding: 6px 10px; border: 1px solid #DCDEE5; border-radius: 2px;
  cursor: pointer; font-size: 13px; color: #63656e;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.property-label:hover { border-color: #3a84ff; color: #3a84ff; }
.property-label.checked { background: #3a84ff; color: #fff; border-color: #3a84ff; }
</style>
