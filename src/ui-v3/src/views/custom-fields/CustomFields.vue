<template>
  <div class="custom-fields-page" v-bkloading="{ isLoading: loading }">
    <!-- 顶部功能提示(对齐原版 cmdb-tips) -->
    <div class="cmdb-tips" v-if="featureTips">
      <span>自定义字段：创建的业务专有字段，仅在业务内生效（*为必填字段）</span>
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

    <!-- 工具栏(对齐原版 field-options:新建字段/新建分组/字段预览 左,搜索右) -->
    <div class="field-options">
      <el-button type="primary" :disabled="!activeModel || activeModel.bk_ispaused" @click="handleAddField(null)">新建字段</el-button>
      <el-button :disabled="!activeModel || activeModel.bk_ispaused" @click="handleAddGroup">新建分组</el-button>
      <el-button :disabled="!properties.length" @click="previewShow = true">字段预览</el-button>
      <div class="spacer" />
      <el-input
        class="filter-input"
        v-model.trim="keyword"
        placeholder="请输入关键字"
        clearable
        :prefix-icon="'Search'"
        style="width: 320px"
      />
    </div>

    <!-- 分组 + 字段列表(对齐原版 group-list) -->
    <div class="group-list">
      <div
        v-for="(group, groupIndex) in groupedProperties"
        :key="group.bk_classification_id || group.info.bk_group_id"
        :class="['group-item', { 'is-collapse': !!groupCollapse[group.info.bk_group_id] }]"
      >
        <div class="group-header" @click="toggleGroup(group)">
          <i :class="['bk-cmdb-icon icon-cc-triangle group-arrow', { collapsed: groupCollapse[group.info.bk_group_id] }]" />
          <span class="group-name">{{ group.info.bk_group_name }}（ {{ group.properties.length }} ）</span>

          <div class="group-actions" @click.stop>
            <el-button link size="small" :disabled="groupIndex === 0" @click="moveGroup(groupIndex, -1)">上移</el-button>
            <el-button link size="small" :disabled="groupIndex === groupedProperties.length - 1" @click="moveGroup(groupIndex, 1)">下移</el-button>
            <el-button link size="small" :disabled="!isEditableGroup(group.info) || group.info.bk_isdefault" @click="handleEditGroup(group)">编辑分组</el-button>
            <el-button link size="small" type="danger" :disabled="!isEditableGroup(group.info) || group.info.bk_isdefault" @click="handleDeleteGroup(group, groupIndex)">删除分组</el-button>
          </div>
        </div>

        <transition name="collapse">
          <div v-show="!groupCollapse[group.info.bk_group_id]" class="field-grid">
            <div
              v-for="(property, fieldIndex) in group.properties"
              :key="property.id || property.bk_property_id"
              class="field-card"
              @click="handleViewField({ group, groupIndex, fieldIndex, property })"
            >
              <i :class="['bk-cmdb-icon', `icon-cc-field-${property.bk_property_type}`, 'field-type-icon']" />
              <div class="field-info">
                <div class="field-name">
                  {{ property.bk_property_name }}
                  <span v-if="property.isrequired" class="req-star">*</span>
                </div>
                <div class="field-id">{{ property.bk_property_id }}</div>
              </div>
              <div class="card-actions" @click.stop>
                <el-dropdown trigger="click" @command="(gid) => moveField(group, property, gid)">
                  <el-button link size="small" :disabled="!isEditableField(property, false)">移动</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        v-for="g in groupedProperties.filter((x) => x.info.bk_group_id !== group.info.bk_group_id)"
                        :key="g.info.bk_group_id" :command="g.info.bk_group_id"
                      >{{ g.info.bk_group_name }}</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-button link size="small" :disabled="!isEditableField(property, false)" @click="handleEditField(group, property)">编辑</el-button>
                <el-button link size="small" type="danger" :disabled="!isEditableField(property) || property.ispre" @click="handleDeleteField({ property, groupIndex, fieldIndex })">删除</el-button>
              </div>
            </div>
          </div>
        </transition>
      </div>

      <div class="add-group" v-if="activeModel && !activeModel.bk_ispaused">
        <el-button link type="primary" :icon="'Plus'" @click="handleAddGroup">新建业务分组</el-button>
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
        :groups="groupedProperties"
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
  deleteFieldGroup,
  updateAttributeSort,
  switchFieldGroupIndex
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

// 老版契约:分组排序走 update/objectattgroup/groupindex(condition.id 恰好两个)
async function moveGroup(groupIndex, delta) {
  const a = groupedProperties.value[groupIndex]
  const b = groupedProperties.value[groupIndex + delta]
  if (!a || !b) return
  try {
    await switchFieldGroupIndex({ condition: { id: [a.info.id, b.info.id] } })
    const list = groupedProperties.value
    list.splice(groupIndex, 1, b)
    list.splice(groupIndex + delta, 1, a)
    ElMessage.success('分组顺序已调整')
  } catch (e) { ElMessage.error('调整分组顺序失败: ' + (e?.message || '后端异常')) }
}

// 老版契约:字段跨组移动走 update/objectattr/index/{objId}/{propertyId}(分组+序号一并提交)
async function moveField(group, property, targetGroupId) {
  try {
    const targetGroup = groupedProperties.value.find((g) => g.info.bk_group_id === targetGroupId)
    await updateAttributeSort(tab.value, property.id, {
      bk_property_group: targetGroupId,
      bk_property_index: (targetGroup?.properties.length || 0) + 1
    })
    ElMessage.success(`已移动到「${targetGroup?.info.bk_group_name || targetGroupId}」`)
    await loadProperties()
  } catch (e) { ElMessage.error('移动失败: ' + (e?.message || '后端异常')) }
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
    // 旧版按属性序展示
    for (const g of groups.value) {
      g.properties.sort((a, b) => (a.bk_property_index ?? 999) - (b.bk_property_index ?? 999))
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
  display: flex; align-items: center; gap: 5px;
  min-height: 30px;
  background: #F0F8FF; border: 1px solid #A3C5FD; padding: 0 32px 0 16px;
  border-radius: 2px; margin: 0 0 10px; position: relative; font-size: 12px; color: #63656E;
}
.cmdb-tips::before {
  content: "\e2f0";
  font-family: 'bk-cmdb' !important;
  font-style: normal;
  font-size: 16px;
  line-height: 16px;
  color: #3A84FF;
}
.cmdb-tips .close-x { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #979BA5; font-size: 12px; width: 12px; height: 12px; line-height: 12px; }
.cmdb-tips .close-x:hover { color: #3a84ff; }

.bk-tab-header {
  display: flex; padding: 0; margin: 0 0 12px 0;
}
.bk-tab-item {
  padding: 0 24px; line-height: 36px; cursor: pointer; font-size: 14px; color: #63656e;
}
.bk-tab-item:first-child { padding-left: 0; }
.bk-tab-item:hover { color: #3a84ff; }
.bk-tab-item.active { color: #3a84ff; }

.field-options { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.field-options .filter-input { width: 240px; margin-left: auto; }
.field-options .caret { font-style: normal; margin-left: 4px; font-size: 12px; }
.setting-btn {
  width: 32px; height: 32px; line-height: 32px; text-align: center;
  border: 1px solid #c4c6cc; border-radius: 2px; cursor: pointer; color: #63656e;
}
.setting-btn:hover { border-color: #3a84ff; color: #3a84ff; }
.setting-btn .icon-cog { font-size: 16px; }

.group-list { padding: 0; min-height: 300px; }
.group-item { margin-bottom: 18px; }
.group-item:last-child { margin-bottom: 0; }
/* 旧版分组头:实心三角 + 名称(数量),操作悬停显示 */
.group-header {
  display: flex; align-items: center; gap: 8px;
  padding: 0 0 10px;
  cursor: pointer; user-select: none;
}
.group-arrow { font-size: 12px; color: #63656E; transition: transform 0.15s; }
.group-arrow.collapsed { transform: rotate(-90deg); }
.group-name { font-weight: 400; color: #313238; font-size: 14px; }
.group-actions { margin-left: auto; display: flex; gap: 4px; visibility: hidden; }
.group-header:hover .group-actions { visibility: visible; }

/* 旧版字段卡片网格 */
.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 8px;
}
.field-card {
  display: flex; align-items: center; gap: 12px;
  height: 68px; padding: 0 16px;
  min-width: 0;
  background: #F5F7FA;
  border-radius: 2px;
  cursor: pointer;
  transition: background 0.15s;
}
.field-card:hover { background: #F0F8FF; }
.field-type-icon { flex: 0 0 20px; font-size: 20px; color: #979BA5; }
.field-info { flex: 1; min-width: 0; overflow: hidden; }
.field-name {
  font-weight: 400; color: #313238; font-size: 14px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.req-star { color: #EA3636; margin-left: 2px; }
.field-id { color: #C4C6CC; font-size: 12px; }
.card-actions { display: none; flex: 0 0 auto; }
.field-card:hover .card-actions { display: flex; gap: 4px; }

.add-group { padding: 6px 0 0; }

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
