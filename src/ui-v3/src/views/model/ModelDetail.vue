<template>
  <div class="model-detail" v-loading="loading">
    <div class="crumb-row">
      <span class="back-btn" @click="goBack">‹ 模型管理</span>
      <span class="crumb-title">模型详情【{{ model?.bk_obj_name || objId }}】</span>
    </div>

    <div v-if="model" class="head-card">
      <div class="big-icon">
        <span>{{ model.bk_obj_name?.slice(0, 1) || 'M' }}</span>
        <span v-if="model.ispre" class="pre-badge">预置</span>
      </div>
      <div class="head-name-wrap">
        <div class="head-name">{{ model.bk_obj_name }}</div>
        <div class="head-id">{{ model.bk_obj_id }}</div>
      </div>
      <div class="head-meta">
        <div class="meta-row">
          <div class="meta-item">
            <div class="meta-label">分类</div>
            <div class="meta-value">{{ model.bk_classification_id || '--' }}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">实例数</div>
            <div class="meta-value">{{ model.instCount || 0 }}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">创建人</div>
            <div class="meta-value">{{ model.bk_created_by || '--' }}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">最近更新</div>
            <div class="meta-value">{{ model.bk_updated_by || '--' }}</div>
          </div>
        </div>
      </div>
    </div>

    <el-tabs v-model="tab" class="detail-tabs">
      <el-tab-pane label="模型字段" name="fields" />
      <el-tab-pane label="模型关联" name="assoc" />
      <el-tab-pane label="唯一校验" name="unique" />
    </el-tabs>

    <div class="tab-body">
      <!-- 模型字段 -->
      <template v-if="tab === 'fields'">
        <div class="toolbar">
          <el-button type="primary" @click="openFieldForm()">新建字段</el-button>
          <el-button @click="openGroupForm()">新建分组</el-button>
          <div class="spacer" />
          <el-input v-model="fieldKeyword" placeholder="请输入关键字" size="small" clearable style="width: 260px" :prefix-icon="'Search'" />
        </div>
        <div v-for="g in filteredFieldGroups" :key="g.id || g.name" class="field-group">
          <div class="group-title" @click="g.collapsed = !g.collapsed">
            <el-icon class="fold" :class="{ folded: g.collapsed }"><CaretBottom /></el-icon>
            <span class="g-name">{{ g.name }} ( {{ g.items.length }} )</span>
            <el-dropdown trigger="click" @command="(c) => onGroupCmd(c, g)" @click.stop>
              <el-icon class="more-op" @click.stop><MoreFilled /></el-icon>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="rename">重命名分组</el-dropdown-item>
                  <el-dropdown-item command="delete" :disabled="g.id === 'default'">删除分组</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          <div class="field-grid" v-show="!g.collapsed">
            <div v-for="f in g.items" :key="f.id" class="field-card">
              <span class="type-icon" :class="typeClass(f.bk_property_type)">{{ typeChar(f.bk_property_type) }}</span>
              <div class="f-info">
                <div class="f-name">{{ f.bk_property_name }}</div>
                <div class="f-id">{{ f.bk_property_id }}</div>
              </div>
              <span v-if="f.__unique === 'single'" class="unique-tag">单独唯一</span>
              <span v-else-if="f.__unique === 'union'" class="unique-tag">联合唯一</span>
              <span v-if="f.isrequired" class="required-tag">必填</span>
              <el-icon v-if="!f.ispre" class="f-edit" @click.stop="openFieldForm(f)"><Edit /></el-icon>
              <div v-if="!f.ispre" class="f-del" @click.stop="removeField(f)"><el-icon><Close /></el-icon></div>
            </div>
          </div>
        </div>
        <el-empty v-if="fieldGroups.length === 0" description="暂无字段" :image-size="70" />
      </template>

      <!-- 模型关联 -->
      <template v-if="tab === 'assoc'">
        <el-table :data="assocs" size="small" v-loading="assocLoading">
          <el-table-column label="源模型" width="140">
            <template #default="{ row }">{{ row.bk_obj_id }}</template>
          </el-table-column>
          <el-table-column label="关联类型" width="120">
            <template #default="{ row }">{{ row.bk_asst_id }}</template>
          </el-table-column>
          <el-table-column label="目标模型" width="140">
            <template #default="{ row }">{{ row.bk_asst_obj_id }}</template>
          </el-table-column>
          <el-table-column prop="bk_obj_asst_id" label="关联标识" min-width="180" />
        </el-table>
        <el-empty v-if="!assocLoading && assocs.length === 0" description="暂无关联关系" :image-size="70" />
      </template>

      <!-- 唯一校验 -->
      <template v-if="tab === 'unique'">
        <div class="toolbar">
          <el-button type="primary" @click="openUniqueDialog()">新建唯一校验</el-button>
          <div class="spacer" />
        </div>
        <el-table :data="uniques" size="small" v-loading="uniqueLoading">
          <el-table-column label="ID" prop="id" width="80" />
          <el-table-column label="约束名" prop="bk_unique_id" min-width="200" />
          <el-table-column label="约束字段" min-width="320">
            <template #default="{ row }">
              <el-tag v-for="k in row.keys || []" :key="k.key_id" size="small" style="margin-right: 6px">
                {{ propName(k.key_id) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openUniqueDialog(row)">编辑</el-button>
              <el-button link type="danger" size="small" @click="removeUnique(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!uniqueLoading && uniques.length === 0" description="暂无唯一校验" :image-size="70" />
      </template>
    </div>

    <!-- 新建/编辑字段 -->
    <el-dialog v-model="fieldFormVisible" :title="fieldForm.id ? '编辑字段' : '新建字段'" width="460px">
      <el-form label-width="90px">
        <el-form-item label="字段 ID" required>
          <el-input v-model="fieldForm.bk_property_id" :disabled="!!fieldForm.id" placeholder="英文唯一标识" />
        </el-form-item>
        <el-form-item label="字段名称" required>
          <el-input v-model="fieldForm.bk_property_name" />
        </el-form-item>
        <el-form-item label="所属分组">
          <el-select v-model="fieldForm.bk_property_group" style="width: 100%">
            <el-option v-for="g in fieldGroups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型" required>
          <el-select v-model="fieldForm.bk_property_type" style="width: 100%" :disabled="!!fieldForm.id">
            <el-option label="短字符 singlechar" value="singlechar" />
            <el-option label="长字符 longchar" value="longchar" />
            <el-option label="数字 int" value="int" />
            <el-option label="枚举 enum" value="enum" />
            <el-option label="布尔 bool" value="bool" />
            <el-option label="日期 date" value="date" />
            <el-option label="时间 time" value="time" />
          </el-select>
        </el-form-item>
        <el-form-item label="必填">
          <el-switch v-model="fieldForm.isrequired" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="fieldFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveField">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新建/重命名分组 -->
    <el-dialog v-model="groupFormVisible" :title="groupForm.id ? '重命名分组' : '新建分组'" width="400px">
      <el-form label-width="80px">
        <el-form-item label="分组名" required>
          <el-input v-model="groupForm.name" placeholder="如:网络信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="groupFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveGroup">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新建/编辑唯一校验 -->
    <el-dialog v-model="uniqueDialog" :title="uniqueForm.id ? '编辑唯一校验' : '新建唯一校验'" width="540px">
      <el-form label-width="100px">
        <el-form-item label="约束名" required>
          <el-input v-model="uniqueForm.bk_unique_id" placeholder="英文唯一,如:host_innerip_unique" />
        </el-form-item>
        <el-form-item label="约束字段" required>
          <el-select v-model="uniqueForm.keyIds" multiple style="width: 100%" placeholder="可多选(多字段为联合唯一)">
            <el-option v-for="f in attrs" :key="f.id" :label="`${f.bk_property_name} (${f.bk_property_id})`" :value="f.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uniqueDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitUnique">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit, Close, CaretBottom, MoreFilled, Search } from '@element-plus/icons-vue'
import {
  http, searchModels, searchModelAttributes,
  createModelAttribute, updateModelAttribute, deleteModelAttribute,
  searchFieldGroups, createFieldGroup, updateFieldGroup, deleteFieldGroup,
  searchUniques, createUnique, updateUnique, deleteUnique,
  getModelStatistics
} from '../../api/cmdb'

const route = useRoute()
const router = useRouter()
const objId = String(route.params.objId || '')

const model = ref(null)
const loading = ref(false)
const saving = ref(false)
const tab = ref('fields')

const attrs = ref([])
const fieldGroups = ref([])
const fieldKeyword = ref('')
const fieldFormVisible = ref(false)
const fieldForm = ref({
  id: null, bk_property_id: '', bk_property_name: '',
  bk_property_type: 'singlechar', bk_property_group: 'default', isrequired: false
})

const groupFormVisible = ref(false)
const groupForm = ref({ id: null, name: '' })

const assocs = ref([])
const assocLoading = ref(false)
const uniques = ref([])
const uniqueLoading = ref(false)
const uniqueDialog = ref(false)
const uniqueForm = ref({ id: null, bk_unique_id: '', keyIds: [] })

function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 19) : '--' }
function goBack() { router.push('/model/management') }

function propName(keyId) {
  const a = attrs.value.find((x) => x.id === keyId)
  return a ? a.bk_property_name : `#${keyId}`
}

function typeChar(t) {
  return {
    singlechar: 'A', longchar: 'A', int: '#', float: '#',
    enum: '≡', bool: '◑', date: '◷', time: '🕑',
    objuser: '👤', user: '👤', timezone: '🌐', organization: '🏛',
    table: '▦', row: '▤', list: '≡', map: '🗺', array: '≡',
    service_template: '⚙'
  }[t] || 'A'
}
function typeClass(t) {
  return {
    singlechar: 't-char', longchar: 't-char', int: 't-num', float: 't-num',
    date: 't-time', time: 't-time', objuser: 't-user', user: 't-user',
    enum: 't-enum', bool: 't-bool'
  }[t] || 't-char'
}

// 字段按分组聚合
const filteredFieldGroups = computed(() => {
  const kw = fieldKeyword.value.toLowerCase()
  return fieldGroups.value.map((g) => ({
    ...g,
    items: g.items.filter((f) => {
      if (!kw) return true
      return (f.bk_property_id || '').toLowerCase().includes(kw) ||
             (f.bk_property_name || '').toLowerCase().includes(kw)
    })
  })).filter((g) => g.items.length > 0 || !kw)
})

async function loadModel() {
  const [all, stats] = await Promise.all([
    searchModels({ condition: { bk_obj_id: objId } }),
    getModelStatistics().catch(() => [])
  ])
  const m = (all || [])[0] || null
  if (m) {
    const st = (stats || []).find((s) => s.bk_obj_id === objId)
    m.instCount = st ? st.instance_count : 0
  }
  model.value = m
}

async function loadFieldGroups() {
  // 拉分组列表
  let groups = []
  try {
    const list = await searchFieldGroups(objId, {})
    groups = (list || []).map((g) => ({ id: g.id, name: g.bk_group_name, bk_obj_id: g.bk_obj_id, _raw: g, items: [], collapsed: false }))
  } catch (e) { /* 容忍 */ }
  // 确保 default 分组存在
  if (!groups.find((g) => g.name === 'default')) {
    groups.unshift({ id: 'default', name: 'default', items: [], collapsed: false, _virtual: true })
  }
  fieldGroups.value = groups
}

async function loadAttrs() {
  const list = await searchModelAttributes(objId)
  attrs.value = list || []
  // 把字段按分组塞进 groups
  for (const g of fieldGroups.value) g.items = []
  for (const f of attrs.value) {
    const gname = f.bk_property_group || 'default'
    let g = fieldGroups.value.find((x) => x.name === gname)
    if (!g) {
      g = { id: 'virtual-' + gname, name: gname, items: [], collapsed: false, _virtual: true }
      fieldGroups.value.push(g)
    }
    g.items.push(f)
  }
}

async function loadUniques() {
  uniqueLoading.value = true
  try {
    const list = await searchUniques(objId, {})
    const arr = list || []
    const uniqCount = {}
    for (const u of arr) for (const k of u.keys || []) uniqCount[k.key_id] = (uniqCount[k.key_id] || 0) + 1
    for (const f of attrs.value) {
      if (uniqCount[f.id] === 1) f.__unique = 'single'
      else if (uniqCount[f.id] > 1) f.__unique = 'union'
    }
    uniques.value = arr
  } finally { uniqueLoading.value = false }
}

async function loadAssocs() {
  assocLoading.value = true
  try {
    const data = await http.post('/find/objectassociation', {
      condition: { bk_obj_id: { $in: [objId] } }
    }).catch(() => [])
    assocs.value = (Array.isArray(data) ? data : []).filter(
      (a) => a.bk_obj_id === objId || a.bk_asst_obj_id === objId
    )
  } finally { assocLoading.value = false }
}

async function load() {
  loading.value = true
  try {
    await loadModel()
    await loadFieldGroups()
    await loadAttrs()
    await Promise.all([loadUniques(), loadAssocs()])
  } finally { loading.value = false }
}

function openFieldForm(field) {
  if (field) {
    fieldForm.value = {
      id: field.id,
      bk_property_id: field.bk_property_id,
      bk_property_name: field.bk_property_name,
      bk_property_type: field.bk_property_type || 'singlechar',
      bk_property_group: field.bk_property_group || 'default',
      isrequired: !!field.isrequired
    }
  } else {
    fieldForm.value = { id: null, bk_property_id: '', bk_property_name: '', bk_property_type: 'singlechar', bk_property_group: 'default', isrequired: false }
  }
  fieldFormVisible.value = true
}

async function saveField() {
  if (!fieldForm.value.bk_property_id || !fieldForm.value.bk_property_name) {
    ElMessage.warning('请填写字段 ID 和名称')
    return
  }
  saving.value = true
  try {
    if (fieldForm.value.id) {
      await updateModelAttribute(fieldForm.value.id, {
        bk_obj_id: objId,
        bk_property_name: fieldForm.value.bk_property_name,
        bk_property_group: fieldForm.value.bk_property_group,
        isrequired: fieldForm.value.isrequired
      })
      ElMessage.success('字段已更新')
    } else {
      await createModelAttribute({ bk_obj_id: objId, ...fieldForm.value })
      ElMessage.success('字段已创建')
    }
    fieldFormVisible.value = false
    await loadFieldGroups()
    await loadAttrs()
    await loadUniques()
  } finally { saving.value = false }
}

async function removeField(f) {
  await ElMessageBox.confirm(`确定删除字段「${f.bk_property_name}」?`, '删除确认', { type: 'warning' })
  await deleteModelAttribute(f.id)
  ElMessage.success('已删除')
  await loadAttrs()
  await loadUniques()
}

// ---- 分组管理 ----
function openGroupForm(group) {
  if (group && group.id !== 'default') {
    groupForm.value = { id: group.id, name: group.name }
  } else {
    groupForm.value = { id: null, name: '' }
  }
  groupFormVisible.value = true
}

async function saveGroup() {
  if (!groupForm.value.name) { ElMessage.warning('请输入分组名'); return }
  saving.value = true
  try {
    if (groupForm.value.id) {
      const realGroup = fieldGroups.value.find((g) => g.id === groupForm.value.id)
      if (realGroup && realGroup._raw) {
        await updateFieldGroup({
          id: realGroup._raw.id,
          bk_obj_id: objId,
          bk_group_id: realGroup._raw.bk_group_id,
          bk_group_name: groupForm.value.name
        })
      }
      ElMessage.success('已重命名')
    } else {
      const id = 'grp_' + Date.now()
      await createFieldGroup({
        bk_obj_id: objId,
        bk_group_id: id,
        bk_group_name: groupForm.value.name,
        bk_group_index: Date.now() % 10000,
        bk_supplier_account: '0'
      })
      ElMessage.success('已创建')
    }
    groupFormVisible.value = false
    await loadFieldGroups()
    await loadAttrs()
  } catch (e) {
    ElMessage.error('保存分组失败: ' + (e?.message || '后端异常'))
    groupFormVisible.value = false
  } finally { saving.value = false }
}

async function onGroupCmd(cmd, g) {
  if (cmd === 'rename') openGroupForm(g)
  else if (cmd === 'delete') {
    await ElMessageBox.confirm(`确定删除分组「${g.name}」?该分组下字段会回到 default`, '删除确认', { type: 'warning' })
    if (g._raw) await deleteFieldGroup(g._raw.id)
    ElMessage.success('已删除')
    await loadFieldGroups()
    await loadAttrs()
  }
}

// ---- 唯一校验 ----
function openUniqueDialog(row) {
  if (row) {
    uniqueForm.value = {
      id: row.id,
      bk_unique_id: row.bk_unique_id,
      keyIds: (row.keys || []).map((k) => k.key_id)
    }
  } else {
    uniqueForm.value = { id: null, bk_unique_id: '', keyIds: [] }
  }
  uniqueDialog.value = true
}

async function submitUnique() {
  if (!uniqueForm.value.bk_unique_id || !uniqueForm.value.keyIds.length) {
    ElMessage.warning('请填写约束名并选择至少一个字段')
    return
  }
  saving.value = true
  try {
    const keys = uniqueForm.value.keyIds.map((id) => ({ key_id: id, key_kind: 'property' }))
    const data = { bk_obj_id: objId, keys, must_check: false, bk_template_id: 0 }
    if (uniqueForm.value.id) {
      await updateUnique(objId, uniqueForm.value.id, data)
      ElMessage.success('已更新')
    } else {
      await createUnique(objId, { from_template: false, data: { ...data, bk_unique_id: uniqueForm.value.bk_unique_id } })
      ElMessage.success('已创建')
    }
    uniqueDialog.value = false
    await loadUniques()
    await loadAttrs()
  } catch (e) {
    ElMessage.error('保存唯一约束失败: ' + (e?.message || '后端异常'))
    uniqueDialog.value = false
  } finally { saving.value = false }
}

async function removeUnique(row) {
  await ElMessageBox.confirm(`确定删除唯一约束「${row.bk_unique_id}」?`, '删除确认', { type: 'warning' })
  await deleteUnique(objId, row.id)
  ElMessage.success('已删除')
  await loadUniques()
  await loadAttrs()
}

onMounted(load)
</script>

<style scoped>
.model-detail { height: 100%; display: flex; flex-direction: column; background: #fff; overflow-y: auto; }
.crumb-row {
  display: flex; align-items: center; gap: 10px;
  padding: 0 20px; height: 50px; line-height: 50px; flex: 0 0 50px;
  border-bottom: 1px solid #E7E9EF;
}
.back-btn { display: flex; align-items: center; cursor: pointer; color: #3A84FF; font-size: 14px; }
.crumb-title { font-size: 14px; color: #313238; }

.head-card { display: flex; align-items: flex-start; gap: 16px; padding: 24px 32px 20px; }
.big-icon {
  position: relative;
  width: 64px; height: 64px; border-radius: 2px;
  background: #F0F1F5;
  display: flex; align-items: center; justify-content: center;
  flex: 0 0 64px;
  font-size: 22px; color: #6B7BAE; font-weight: 600;
}
.pre-badge {
  position: absolute; top: -7px; left: 50%; transform: translateX(-50%);
  background: #FF9C01; color: #fff; font-size: 11px;
  line-height: 16px; padding: 0 5px; border-radius: 2px; white-space: nowrap;
}
.head-name-wrap { min-width: 120px; padding-top: 6px; }
.head-name { font-size: 18px; color: #313238; font-weight: 700; }
.head-id { font-size: 12px; color: #979BA5; margin-top: 4px; }
.head-meta { flex: 1; }
.meta-row { display: flex; gap: 56px; margin-bottom: 14px; }
.meta-item { min-width: 120px; }
.meta-label { font-size: 12px; color: #979BA5; margin-bottom: 4px; }
.meta-value { font-size: 12px; color: #313238; display: flex; align-items: center; gap: 4px; }

.detail-tabs { padding: 0 32px; }
.tab-body { padding: 0 32px 24px; flex: 1; }
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; }
.toolbar .spacer { flex: 1; }

.field-group { margin-bottom: 22px; }
.group-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 14px; color: #313238; cursor: pointer; margin-bottom: 12px;
  user-select: none; font-weight: 600;
}
.group-title:hover { background: #F6F6F9; }
.g-name { flex: 1; }
.fold { transition: transform 0.2s; color: #63656E; }
.fold.folded { transform: rotate(-90deg); }
.more-op { margin-left: 6px; color: #C4C6CC; }

.field-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.field-card {
  display: flex; align-items: center; gap: 10px;
  background: #F5F7FA;
  border-radius: 2px;
  padding: 12px 14px;
  position: relative;
  min-height: 56px;
}
.type-icon {
  width: 28px; height: 28px; border-radius: 50%;
  background: #EAEFF7; color: #6B7BAE;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600; flex: 0 0 28px;
}
.t-char { color: #6B7BAE; }
.t-num { color: #B47F3F; background: #FDF2E5; }
.t-time { color: #4F7AB8; background: #E8F0FA; }
.t-user { color: #5C8B5C; background: #EAF3EA; }
.t-enum { color: #8E6CB0; background: #F1EAF6; }
.t-bool { color: #C57B3F; background: #FDF0E5; }
.f-info { flex: 1; min-width: 0; }
.f-name { font-size: 14px; color: #313238; }
.f-id { font-size: 12px; color: #979BA5; }
.unique-tag {
  background: #FFF6E5; color: #C58800;
  font-size: 12px; padding: 0 4px; border-radius: 2px;
}
.required-tag {
  background: #FDECF0; color: #EA3636;
  font-size: 12px; line-height: 18px; padding: 0 6px; border-radius: 2px;
}
.f-del, .f-edit {
  display: none; position: absolute; top: 8px;
  background: #fff; border-radius: 2px; padding: 0 4px;
  color: #979BA5; cursor: pointer;
}
.f-del { right: 8px; }
.f-edit { right: 30px; }
.field-card:hover .f-del, .field-card:hover .f-edit { display: inline-flex; }
.f-del:hover { color: #EA3636; }
.f-edit:hover { color: #3A84FF; }
</style>