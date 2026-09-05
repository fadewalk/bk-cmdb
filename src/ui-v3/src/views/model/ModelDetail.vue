<template>
  <div class="model-detail" v-loading="loading">
    <h1 class="page-title">
      <el-link :underline="false" @click="$router.push('/model/management')">
        <el-icon><ArrowLeft /></el-icon>
      </el-link>
      模型详情【{{ model?.bk_obj_name || objId }}】
      <el-tag v-if="model?.bk_ispre" size="small" type="info">内置</el-tag>
    </h1>

    <!-- 头部信息卡(对齐旧版) -->
    <div class="head-card">
      <span class="model-icon"><el-icon :size="26"><Grid /></el-icon></span>
      <div class="head-main">
        <div class="head-name">
          {{ model?.bk_obj_name || objId }}
          <span class="head-id">{{ objId }}</span>
        </div>
      </div>
      <el-descriptions :column="4" size="small" class="head-meta">
        <el-descriptions-item label="所属分组">{{ model?.bk_classification_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="实例数量">{{ model?.instCount ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ fmtTime(model?.last_time) }}</el-descriptions-item>
        <el-descriptions-item label="创建人">{{ model?.bk_supplier_account || '-' }}</el-descriptions-item>
      </el-descriptions>
    </div>

    <el-tabs v-model="tab" class="detail-tabs">
      <el-tab-pane label="模型字段" name="fields" />
      <el-tab-pane label="模型关联" name="assoc" />
      <el-tab-pane label="唯一校验" name="unique" />
    </el-tabs>

    <div class="tab-body">
      <!-- 模型字段:按分组展示(对齐旧版 基础信息 ( N )) -->
      <template v-if="tab === 'fields'">
        <div class="toolbar">
          <el-button size="small" type="primary" :icon="'Plus'" @click="openFieldForm">新建字段</el-button>
          <div class="spacer" />
          <el-input v-model="fieldKeyword" placeholder="请输入关键字" size="small" clearable style="width: 200px" />
        </div>
        <div v-for="g in filteredFieldGroups" :key="g.name" class="field-group">
          <div class="field-group-name">{{ g.name }} ( {{ g.items.length }} )</div>
          <div class="field-cards">
            <div v-for="f in g.items" :key="f.id" class="field-card">
              <div class="f-name">{{ f.bk_property_name }}</div>
              <div class="f-id">{{ f.bk_property_id }}</div>
              <el-tag v-if="f.__unique === 'single'" size="small" type="warning" class="f-unique">单独唯一</el-tag>
              <el-tag v-else-if="f.__unique === 'union'" size="small" type="warning" class="f-unique">联合唯一</el-tag>
              <div class="f-actions" v-if="!f.ispre">
                <el-button link type="danger" size="small" @click="removeField(f)">删除</el-button>
              </div>
            </div>
          </div>
        </div>
        <el-empty v-if="fieldGroups.length === 0 && !loading" description="暂无字段" :image-size="70" />
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
        <el-table :data="uniques" size="small" v-loading="uniqueLoading">
          <el-table-column label="ID" width="80">
            <template #default="{ row }">{{ row.id }}</template>
          </el-table-column>
          <el-table-column label="校验字段" min-width="240">
            <template #default="{ row }">
              <el-tag v-for="k in row.keys" :key="k.key_id" size="small" style="margin-right: 6px">
                {{ propName(k.key_id) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="预置" width="90">
            <template #default="{ row }">
              <el-tag v-if="row.ispre" size="small" type="info">内置</el-tag><span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>

    <!-- 新建字段 -->
    <el-dialog v-model="fieldFormVisible" title="新建字段" width="460px">
      <el-form label-width="90px">
        <el-form-item label="字段 ID" required>
          <el-input v-model="fieldForm.bk_property_id" placeholder="英文唯一标识" />
        </el-form-item>
        <el-form-item label="字段名称" required>
          <el-input v-model="fieldForm.bk_property_name" />
        </el-form-item>
        <el-form-item label="类型" required>
          <el-select v-model="fieldForm.bk_property_type" style="width: 100%">
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
  </div>
</template>

<script setup>
// 模型详情:头部信息卡 + 模型字段(分组)/模型关联/唯一校验,对齐旧版 details 页
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  http, searchModels, searchModelAttributes, createModelAttribute, deleteModelAttribute,
  getModelStatistics
} from '../../api/cmdb'

const route = useRoute()
const objId = String(route.params.objId || '')

const model = ref(null)
const loading = ref(false)
const saving = ref(false)
const tab = ref('fields')

const attrs = ref([])
const uniqueMap = ref({})
const fieldKeyword = ref('')
const fieldFormVisible = ref(false)
const fieldForm = ref({ bk_property_id: '', bk_property_name: '', bk_property_type: 'singlechar', isrequired: false })

const assocs = ref([])
const assocLoading = ref(false)
const uniques = ref([])
const uniqueLoading = ref(false)

function fmtTime(t) {
  return t ? String(t).replace('T', ' ').slice(0, 19) : '--'
}

function propName(keyId) {
  const a = attrs.value.find((x) => x.id === keyId)
  return a ? a.bk_property_name : `#${keyId}`
}

// 字段按分组属性聚合(bk_property_group 为分类 ID,空归入基础信息)
const fieldGroups = computed(() => {
  const kw = fieldKeyword.value.toLowerCase()
  const list = attrs.value.filter((f) => {
    if (!kw) return true
    return (
      (f.bk_property_id || '').toLowerCase().includes(kw) ||
      (f.bk_property_name || '').toLowerCase().includes(kw)
    )
  })
  const map = {}
  for (const f of list) {
    const g = f.bk_property_group || 'default'
    ;(map[g] = map[g] || []).push(f)
  }
  return Object.entries(map).map(([name, items]) => ({
    name: name === 'default' ? '基础信息' : name,
    items
  }))
})

const filteredFieldGroups = computed(() => fieldGroups.value)

async function load() {
  loading.value = true
  try {
    const [all, attrsData, stats] = await Promise.all([
      searchModels({ condition: { bk_obj_id: objId } }),
      searchModelAttributes(objId),
      getModelStatistics().catch(() => [])
    ])
    const m = (all || [])[0] || null
    if (m) {
      const st = (stats || []).find((s) => s.bk_obj_id === objId)
      m.instCount = st ? st.instance_count : 0
    }
    model.value = m
    attrs.value = attrsData || []
    loadUniques()
    loadAssocs()
  } finally {
    loading.value = false
  }
}

async function loadUniques() {
  uniqueLoading.value = true
  try {
    const data = await http.post(`/find/objectunique/object/${objId}`, {})
    const list = data || []
    // 标记字段唯一类型(单独/联合)
    const uniqCount = {}
    for (const u of list) {
      for (const k of u.keys || []) uniqCount[k.key_id] = (uniqCount[k.key_id] || 0) + 1
    }
    for (const f of attrs.value) {
      if (uniqCount[f.id] === 1) f.__unique = 'single'
      else if (uniqCount[f.id] > 1) f.__unique = 'union'
    }
    // 重新计算分组(带唯一标记后)
    uniques.value = list
  } finally {
    uniqueLoading.value = false
  }
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
  } finally {
    assocLoading.value = false
  }
}

function openFieldForm() {
  fieldForm.value = { bk_property_id: '', bk_property_name: '', bk_property_type: 'singlechar', isrequired: false }
  fieldFormVisible.value = true
}

async function saveField() {
  saving.value = true
  try {
    await createModelAttribute({ bk_obj_id: objId, ...fieldForm.value })
    ElMessage.success('字段已创建')
    fieldFormVisible.value = false
    const attrsData = await searchModelAttributes(objId)
    attrs.value = attrsData || []
  } finally {
    saving.value = false
  }
}

async function removeField(f) {
  await ElMessageBox.confirm(`确定删除字段「${f.bk_property_name}」?`, '删除确认', { type: 'warning' })
  await deleteModelAttribute(f.id)
  ElMessage.success('已删除')
  const attrsData = await searchModelAttributes(objId)
  attrs.value = attrsData || []
}

onMounted(load)
</script>

<style scoped>
.model-detail { height: 100%; display: flex; flex-direction: column; background: #fff; overflow-y: auto; }
.page-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 16px; color: #313238; font-weight: 400;
  padding: 0 20px; height: 50px; line-height: 50px;
  border-bottom: 1px solid #E7E9EF; margin: 0; flex: 0 0 50px;
}
.head-card {
  display: flex; align-items: center; gap: 16px;
  padding: 16px 20px;
}
.model-icon {
  width: 48px; height: 48px; border-radius: 4px;
  background: #E1ECFF; color: #3A84FF;
  display: flex; align-items: center; justify-content: center;
  flex: 0 0 48px;
}
.head-main { min-width: 140px; }
.head-name { font-size: 16px; color: #313238; font-weight: 600; }
.head-id { font-size: 12px; color: #979BA5; font-weight: 400; margin-left: 6px; }
.head-meta { flex: 1; }
.detail-tabs { padding: 0 20px; }
.tab-body { padding: 0 20px 20px; flex: 1; }
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.toolbar .spacer { flex: 1; }
.field-group { margin-bottom: 20px; }
.field-group-name {
  font-size: 13px; font-weight: 600; color: #313238;
  padding-bottom: 8px; border-bottom: 1px solid #E7E9EF; margin-bottom: 10px;
}
.field-cards { display: flex; flex-wrap: wrap; gap: 10px; }
.field-card {
  width: 190px; padding: 10px 12px;
  border: 1px solid #DCDEE5; border-radius: 2px;
  position: relative; cursor: default;
}
.field-card:hover { border-color: #3A84FF; }
.f-name { font-size: 13px; color: #313238; }
.f-id { font-size: 12px; color: #979BA5; margin-top: 4px; }
.f-unique { margin-top: 6px; }
.f-actions { display: none; position: absolute; top: 6px; right: 6px; background: #fff; }
.field-card:hover .f-actions { display: block; }
</style>
