<template>
  <div class="page-card">
    <div class="table-toolbar">
      <el-input v-model="keyword" placeholder="按模型 ID / 名称过滤" clearable style="width: 240px" />
      <div class="spacer" />
      <el-button :icon="'Plus'" type="primary" plain @click="clsDialog = true">新建分类</el-button>
      <el-button :icon="'Plus'" type="primary" @click="openCreateModel">新建模型</el-button>
    </div>

    <el-collapse v-model="expanded" v-loading="loading">
      <el-collapse-item v-for="cls in filteredGroups" :key="cls.clsId" :name="cls.clsId">
        <template #title>
          <span class="cls-title">
            {{ cls.clsName }}
            <span class="cls-id">{{ cls.clsId }}</span>
            <el-button
              v-if="!cls.bk_ispre" link type="danger" size="small"
              @click.stop="removeClassification(cls)"
            >删除分类</el-button>
          </span>
        </template>
        <el-table :data="cls.models" size="default">
          <el-table-column prop="bk_obj_id" label="模型 ID" width="180" />
          <el-table-column prop="bk_obj_name" label="模型名称" min-width="160" />
          <el-table-column label="类型" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.bk_ispre" size="small" type="info">内置</el-tag>
              <el-tag v-else size="small" type="success">自定义</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="300" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openAttrs(row)">字段管理</el-button>
              <el-button link type="primary" @click="openUniques(row)">唯一校验</el-button>
              <el-button v-if="!row.bk_ispre" link type="primary" @click="openEditModel(row)">编辑</el-button>
              <el-button v-if="!row.bk_ispre" link type="danger" @click="removeModel(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-collapse-item>
    </el-collapse>

    <!-- 新建/编辑模型 -->
    <el-dialog v-model="modelDialog" :title="editing ? '编辑模型' : '新建模型'" width="480px">
      <el-form :model="modelForm" label-width="90px">
        <el-form-item label="模型 ID" required>
          <el-input v-model="modelForm.bk_obj_id" :disabled="editing" placeholder="英文唯一标识" />
        </el-form-item>
        <el-form-item label="模型名称" required>
          <el-input v-model="modelForm.bk_obj_name" />
        </el-form-item>
        <el-form-item label="所属分类" required>
          <el-select v-model="modelForm.bk_classification_id" style="width: 100%">
            <el-option v-for="c in classifications" :key="c.bk_classification_id"
              :label="c.bk_classification_name" :value="c.bk_classification_id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="modelDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveModel">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新建分类 -->
    <el-dialog v-model="clsDialog" title="新建分类" width="440px">
      <el-form label-width="90px">
        <el-form-item label="分类 ID" required>
          <el-input v-model="clsForm.bk_classification_id" placeholder="英文唯一标识" />
        </el-form-item>
        <el-form-item label="分类名称" required>
          <el-input v-model="clsForm.bk_classification_name" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="clsDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveClassification">保存</el-button>
      </template>
    </el-dialog>

    <!-- 字段管理 -->
    <el-drawer v-model="attrDrawer" :title="`「${attrModel?.bk_obj_name}」字段管理`" size="50%">
      <div class="table-toolbar">
        <div class="spacer" />
        <el-button :icon="'Plus'" type="primary" @click="attrFormVisible = true">新增字段</el-button>
      </div>
      <el-table :data="attrs" v-loading="attrLoading" size="default">
        <el-table-column prop="bk_property_id" label="字段 ID" width="170" />
        <el-table-column prop="bk_property_name" label="字段名称" min-width="140" />
        <el-table-column prop="bk_property_type" label="类型" width="110" />
        <el-table-column label="必填" width="70">
          <template #default="{ row }">
            <el-tag v-if="row.isrequired" size="small" type="danger">是</el-tag><span v-else>否</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-button v-if="!row.ispre" link type="danger" @click="removeAttr(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-dialog v-model="attrFormVisible" title="新增字段" width="440px" append-to-body>
        <el-form label-width="90px">
          <el-form-item label="字段 ID" required>
            <el-input v-model="attrForm.bk_property_id" placeholder="英文唯一标识" />
          </el-form-item>
          <el-form-item label="字段名称" required>
            <el-input v-model="attrForm.bk_property_name" />
          </el-form-item>
          <el-form-item label="类型" required>
            <el-select v-model="attrForm.bk_property_type" style="width: 100%">
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
            <el-switch v-model="attrForm.isrequired" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="attrFormVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveAttr">保存</el-button>
        </template>
      </el-dialog>
    </el-drawer>

    <!-- 唯一校验 -->
    <el-drawer v-model="uniqueDrawer" :title="`「${uniqueModel?.bk_obj_name}」唯一校验`" size="45%">
      <el-table :data="uniques" v-loading="uniqueLoading" size="default">
        <el-table-column label="ID" width="70">
          <template #default="{ row }">{{ row.id }}</template>
        </el-table-column>
        <el-table-column label="校验字段" min-width="220">
          <template #default="{ row }">
            <el-tag v-for="k in row.keys" :key="k.key_id" size="small" style="margin-right: 6px">
              {{ propName(attrModel?.bk_obj_id || uniqueModel?.bk_obj_id, k.key_id) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="预置" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.ispre" size="small" type="info">内置</el-tag><span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchClassificationWithObjects, searchClassifications, createClassification, deleteClassification,
  createModel, updateModel, deleteModel,
  searchModelAttributes, createModelAttribute, deleteModelAttribute,
  http
} from '../../api/cmdb'

const keyword = ref('')
const loading = ref(false)
const saving = ref(false)
const groups = ref([])
const classifications = ref([])
const expanded = ref([])

const modelDialog = ref(false)
const editing = ref(null)
const modelForm = ref({ bk_obj_id: '', bk_obj_name: '', bk_classification_id: '' })
const clsDialog = ref(false)
const clsForm = ref({ bk_classification_id: '', bk_classification_name: '' })

const attrDrawer = ref(false)
const attrModel = ref(null)
const attrLoading = ref(false)
const attrs = ref([])
const attrFormVisible = ref(false)
const attrForm = ref({ bk_property_id: '', bk_property_name: '', bk_property_type: 'singlechar', isrequired: false })

const filteredGroups = computed(() => {
  if (!keyword.value) return groups.value
  const kw = keyword.value.toLowerCase()
  return groups.value.map((g) => ({
    ...g,
    models: g.models.filter((m) =>
      (m.bk_obj_id || '').toLowerCase().includes(kw) ||
      (m.bk_obj_name || '').toLowerCase().includes(kw))
  })).filter((g) => g.models.length > 0)
})

async function load() {
  loading.value = true
  try {
    const [groupData, clsData] = await Promise.all([searchClassificationWithObjects(), searchClassifications()])
    classifications.value = clsData || []
    groups.value = (groupData || []).map((item) => ({
      clsId: item.bk_classification_id,
      clsName: item.bk_classification_name,
      bk_ispre: item.bk_ispre,
      models: item.objects || []
    }))
    expanded.value = groups.value.map((g) => g.clsId)
  } finally {
    loading.value = false
  }
}

async function saveModel() {
  saving.value = true
  try {
    if (editing.value) {
      await updateModel(editing.value.id, {
        bk_obj_name: modelForm.value.bk_obj_name,
        bk_classification_id: modelForm.value.bk_classification_id
      })
      ElMessage.success('模型已更新')
    } else {
      await createModel(modelForm.value)
      ElMessage.success('模型已创建')
    }
    modelDialog.value = false
    load()
  } finally {
    saving.value = false
  }
}

function openCreateModel() {
  editing.value = null
  modelForm.value = { bk_obj_id: '', bk_obj_name: '', bk_classification_id: groups.value[0]?.clsId || '' }
  modelDialog.value = true
}

function openEditModel(row) {
  editing.value = row
  modelForm.value = {
    bk_obj_id: row.bk_obj_id,
    bk_obj_name: row.bk_obj_name,
    bk_classification_id: row.bk_classification_id
  }
  modelDialog.value = true
}

async function removeModel(row) {
  await ElMessageBox.confirm(`确定删除模型「${row.bk_obj_name}」?其下字段与实例将被删除`, '删除确认', { type: 'warning' })
  await deleteModel(row.id)
  ElMessage.success('已删除')
  load()
}

async function saveClassification() {
  saving.value = true
  try {
    await createClassification(clsForm.value)
    ElMessage.success('分类已创建')
    clsDialog.value = false
    clsForm.value = { bk_classification_id: '', bk_classification_name: '' }
    load()
  } finally {
    saving.value = false
  }
}

async function removeClassification(cls) {
  await ElMessageBox.confirm(`确定删除分类「${cls.clsName}」?`, '删除确认', { type: 'warning' })
  await deleteClassification(cls.clsId)
  ElMessage.success('已删除')
  load()
}

async function openAttrs(row) {
  attrModel.value = row
  attrDrawer.value = true
  loadAttrs()
}

async function loadAttrs() {
  attrLoading.value = true
  try {
    const data = await searchModelAttributes(attrModel.value.bk_obj_id)
    attrs.value = Array.isArray(data) ? data : []
  } finally {
    attrLoading.value = false
  }
}

async function saveAttr() {
  saving.value = true
  try {
    await createModelAttribute({ bk_obj_id: attrModel.value.bk_obj_id, ...attrForm.value })
    ElMessage.success('字段已创建')
    attrFormVisible.value = false
    attrForm.value = { bk_property_id: '', bk_property_name: '', bk_property_type: 'singlechar', isrequired: false }
    loadAttrs()
  } finally {
    saving.value = false
  }
}

async function removeAttr(row) {
  await ElMessageBox.confirm(`确定删除字段「${row.bk_property_name}」?`, '删除确认', { type: 'warning' })
  await deleteModelAttribute(row.id)
  ElMessage.success('已删除')
  loadAttrs()
}

// ---------- 唯一校验 ----------
const uniqueDrawer = ref(false)
const uniqueModel = ref(null)
const uniqueLoading = ref(false)
const uniques = ref([])
// 缓存各模型的属性 ID -> 名称映射
const propNameCache = ref({})

function propName(objId, keyId) {
  const map = propNameCache.value[objId] || {}
  return map[keyId] || `#${keyId}`
}

async function openUniques(row) {
  uniqueModel.value = row
  uniqueDrawer.value = true
  uniqueLoading.value = true
  try {
    const [u, attrs] = await Promise.all([
      http.post(`/find/objectunique/object/${row.bk_obj_id}`, {}),
      searchModelAttributes(row.bk_obj_id)
    ])
    const map = {}
    for (const a of attrs || []) map[a.id] = a.bk_property_name
    propNameCache.value[row.bk_obj_id] = map
    uniques.value = u || []
  } finally {
    uniqueLoading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.cls-title { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; }
.cls-id { color: #979ba5; font-size: 12px; font-weight: 400; }
</style>
