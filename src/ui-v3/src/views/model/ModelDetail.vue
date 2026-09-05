<template>
  <div class="model-detail" v-loading="loading">
    <div class="crumb-row">
      <span class="back-btn" @click="$router.push('/model/management')"><el-icon><ArrowLeft /></el-icon></span>
      <span class="crumb-title">模型详情【{{ model?.bk_obj_name || objId }}】</span>
    </div>

    <!-- 头部信息卡(对齐旧版截图:大图标+内置角标+名称/ID+两行四列元信息) -->
    <div class="head-card">
      <div class="big-icon">
        <span class="pre-badge" v-if="model?.bk_ispre">内置</span>
        <el-icon :size="30" color="#979BA5"><Notebook /></el-icon>
      </div>
      <div class="head-name-wrap">
        <div class="head-name">{{ model?.bk_obj_name || objId }}</div>
        <div class="head-id">{{ objId }}</div>
      </div>
      <div class="head-meta">
        <div class="meta-row">
          <div class="meta-item">
            <div class="meta-label">所属分组</div>
            <div class="meta-value link">{{ model?.bk_classification_id || '--' }} <el-icon size="12"><Edit /></el-icon></div>
          </div>
          <div class="meta-item">
            <div class="meta-label">实例数量</div>
            <div class="meta-value link">{{ model?.instCount ?? 0 }}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">绑定的字段组合模板</div>
            <div class="meta-value">--</div>
          </div>
        </div>
        <div class="meta-row">
          <div class="meta-item">
            <div class="meta-label">更新时间</div>
            <div class="meta-value">{{ fmtTime(model?.last_time) }}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">更新人</div>
            <div class="meta-value">{{ model?.bk_updated_by || '--' }}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">创建时间</div>
            <div class="meta-value">{{ fmtTime(model?.create_time) }}</div>
          </div>
          <div class="meta-item">
            <div class="meta-label">创建人</div>
            <div class="meta-value">{{ model?.bk_created_by || '--' }}</div>
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
          <el-button type="primary" @click="openFieldForm">新建字段</el-button>
          <el-button>新建分组</el-button>
          <el-button>字段预览</el-button>
          <div class="spacer" />
          <el-input v-model="fieldKeyword" placeholder="请输入关键字" size="small" clearable style="width: 260px" :prefix-icon="'Search'" />
        </div>
        <div v-for="g in filteredFieldGroups" :key="g.name" class="field-group">
          <div class="group-title" @click="g.collapsed = !g.collapsed">
            <el-icon class="fold" :class="{ folded: g.collapsed }"><CaretBottom /></el-icon>
            {{ g.name }} ( {{ g.items.length }})
            <el-icon class="more-op"><MoreFilled /></el-icon>
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
              <div class="f-del" v-if="!f.ispre" @click="removeField(f)"><el-icon><Close /></el-icon></div>
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
// 模型详情:逐像素对齐旧版(灰底字段卡 3 列网格 / 类型图标 / 唯一标记 / 折叠分组)
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

// 字段类型 → 图标字符/类
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
    items,
    collapsed: false
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
    const uniqCount = {}
    for (const u of list) {
      for (const k of u.keys || []) uniqCount[k.key_id] = (uniqCount[k.key_id] || 0) + 1
    }
    for (const f of attrs.value) {
      if (uniqCount[f.id] === 1) f.__unique = 'single'
      else if (uniqCount[f.id] > 1) f.__unique = 'union'
    }
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
.crumb-row {
  display: flex; align-items: center; gap: 10px;
  padding: 0 20px; height: 50px; line-height: 50px; flex: 0 0 50px;
  border-bottom: 1px solid #E7E9EF;
}
.back-btn { display: flex; align-items: center; cursor: pointer; color: #3A84FF; font-size: 16px; }
.crumb-title { font-size: 14px; color: #313238; }

/* 头部信息卡 */
.head-card { display: flex; align-items: flex-start; gap: 16px; padding: 24px 32px 20px; }
.big-icon {
  position: relative;
  width: 64px; height: 64px; border-radius: 8px;
  background: #F0F1F5;
  display: flex; align-items: center; justify-content: center;
  flex: 0 0 64px;
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
.meta-value.link { color: #3A84FF; cursor: pointer; }

/* Tabs */
.detail-tabs { padding: 0 32px; }

/* 工具栏 */
.tab-body { padding: 0 32px 24px; flex: 1; }
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; }
.toolbar .spacer { flex: 1; }
.toolbar :deep(.el-input__wrapper) { border-radius: 2px; }

/* 字段分组 */
.field-group { margin-bottom: 22px; }
.group-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: #63656E; cursor: pointer; margin-bottom: 12px;
  user-select: none;
}
.fold { transition: transform 0.2s; color: #63656E; }
.fold.folded { transform: rotate(-90deg); }
.more-op { margin-left: 6px; color: #C4C6CC; }

/* 字段卡:3 列网格,灰底无边框 */
.field-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.field-card {
  display: flex; align-items: center; gap: 10px;
  background: #F5F7FA;
  border-radius: 4px;
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
.type-icon.t-time, .type-icon.t-user { font-size: 14px; }
.f-info { flex: 1; min-width: 0; }
.f-name { font-size: 12px; color: #313238; line-height: 18px; }
.f-id { font-size: 12px; color: #C4C6CC; line-height: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.unique-tag {
  position: absolute; top: 8px; right: 10px;
  background: #E1ECFF; color: #3A84FF;
  font-size: 11px; line-height: 18px; padding: 0 6px; border-radius: 2px;
}
.required-tag {
  position: absolute; bottom: 8px; right: 10px;
  background: #FDECF0; color: #EA3636;
  font-size: 11px; line-height: 18px; padding: 0 6px; border-radius: 2px;
}
.f-del {
  display: none; position: absolute; top: 8px; right: 8px;
  background: #fff; border-radius: 2px; padding: 0 4px;
  color: #979BA5; cursor: pointer;
}
.field-card:hover .f-del { display: block; }
.field-card:hover .unique-tag, .field-card:hover .required-tag { display: none; }
.f-del:hover { color: #EA3636; }
</style>
