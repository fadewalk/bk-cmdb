<template>
  <div class="page-card">
    <h1 class="page-title sr-only">动态分组</h1>
    <p class="page-tips">动态分组主要用于定义常用的条件查询，在其他SaaS中可以根据动态分组快速检索目标主机</p>
    <div class="table-toolbar">
      <el-button type="primary" :icon="'Plus'" :disabled="!bizId" @click="openEditor()">新建</el-button>
      <div class="spacer" />
      <el-input
        v-model="keyword"
        placeholder="请输入查询名称"
        clearable
        :prefix-icon="'Search'"
        style="width: 210px"
      />
    </div>

    <template v-if="bizId">
      <el-table :data="filteredGroups" v-loading="loading" stripe>
        <el-table-column prop="name" label="查询名称" min-width="200" show-overflow-tooltip />
        <el-table-column prop="id" label="ID" width="100" />
        <el-table-column label="查询对象" width="120">
          <template #default="{ row }">{{ TARGET_NAMES[row.bk_obj_id] || row.bk_obj_id }}</template>
        </el-table-column>
        <el-table-column prop="create_user" label="创建用户" width="140">
          <template #default="{ row }">{{ row.bk_user || '-' }}</template>
        </el-table-column>
        <el-table-column prop="create_time" label="创建时间" width="170">
          <template #default="{ row }">{{ (row.create_time || '').replace('T', ' ').slice(0, 19) }}</template>
        </el-table-column>
        <el-table-column prop="modify_user" label="修改人" width="140">
          <template #default="{ row }">{{ row.modify_user || '--' }}</template>
        </el-table-column>
        <el-table-column prop="last_time" label="修改时间" width="170">
          <template #default="{ row }">{{ (row.last_time || '').replace('T', ' ').slice(0, 19) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="preview(row)">预览结果</el-button>
            <el-button link type="primary" @click="openEditor(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && groups.length === 0" description="您还未创建动态分组,可点击上方「新建」创建" :image-size="80" />
    </template>
    <el-empty v-else description="请先选择业务" />

    <!-- 列表页预览 -->
    <el-drawer v-model="previewVisible" :title="`「${previewName}」主机预览`" size="45%">
      <el-table :data="previewHosts" v-loading="previewLoading" size="default">
        <el-table-column prop="host.bk_host_id" label="主机 ID" width="100" />
        <el-table-column label="内网 IP" min-width="150">
          <template #default="{ row }">{{ row.host?.bk_host_innerip || '-' }}</template>
        </el-table-column>
        <el-table-column label="主机名称" min-width="150">
          <template #default="{ row }">{{ row.host?.bk_host_name || '-' }}</template>
        </el-table-column>
      </el-table>
    </el-drawer>

    <!-- 新建/编辑动态分组(对齐老版 1202px 编辑侧滑: 基础信息+条件编辑 | 预览) -->
    <el-drawer v-model="editorVisible" :title="editorTitle" size="1200px" :close-on-click-modal="false">
      <div class="editor-layout">
        <div class="editor-left">
          <h5 class="form-title">基础信息</h5>
          <el-form label-width="90px" label-position="left">
            <el-form-item label="分组名称" required>
              <el-input v-model="editorForm.name" maxlength="256" placeholder="请输入查询名称" />
            </el-form-item>
            <el-form-item label="查询对象" required>
              <el-radio-group v-model="editorForm.bk_obj_id" :disabled="!!editorForm.id" @change="onTargetChange">
                <el-radio-button value="host">主机</el-radio-button>
                <el-radio-button value="set">集群</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-form>

          <div v-for="grp in conditionGroups" :key="grp.key" class="cond-group">
            <el-tooltip :content="grp.tip" placement="top">
              <div class="cond-group-title">{{ grp.name }}</div>
            </el-tooltip>
            <div v-for="(row, idx) in rowsBySource[grp.source]" :key="row.uid" class="cond-row">
              <span class="cond-source" :title="`属性来源: ${SOURCE_NAMES[grp.source]}`">{{ SOURCE_NAMES[grp.source] }}</span>
              <span class="cond-field" :title="row.field">{{ propName(row) }}</span>
              <el-select v-model="row.operator" class="cond-op" size="small">
                <el-option v-for="o in operatorOptions(row)" :key="o.id" :label="o.name" :value="o.id" :title="o.desc" />
              </el-select>
              <!-- 值控件:按属性类型/操作符 -->
              <template v-if="row.operator === 'range'">
                <el-input-number v-model="row.value" :controls="false" size="small" class="cond-val" placeholder="最小值" />
                <el-input-number v-model="row.value2" :controls="false" size="small" class="cond-val" placeholder="最大值" />
              </template>
              <el-select v-else-if="row.operator === 'in' || row.operator === 'nin'" v-model="row.value" class="cond-val" size="small" multiple filterable allow-create default-first-option collapse-tags>
                <el-option v-for="o in valueOptions(row)" :key="String(o.id ?? o)" :label="String(o.name ?? o)" :value="o.id ?? o" />
              </el-select>
              <el-select v-else-if="row.bk_property_type === 'bool'" v-model="row.value" class="cond-val" size="small">
                <el-option label="是" :value="true" />
                <el-option label="否" :value="false" />
              </el-select>
              <el-date-picker v-else-if="row.bk_property_type === 'date'" v-model="row.value" type="date" value-format="YYYY-MM-DD" size="small" class="cond-val" />
              <el-date-picker v-else-if="row.bk_property_type === 'time'" v-model="row.value" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" size="small" class="cond-val" />
              <el-input-number v-else-if="['int', 'float'].includes(row.bk_property_type)" v-model="row.value" :controls="false" size="small" class="cond-val" />
              <el-input v-else v-model="row.value" size="small" class="cond-val" :placeholder="(row.operator === 'in' || row.operator === 'nin') ? '多个值用逗号分隔' : ''" />
              <el-button link type="danger" size="small" class="cond-del" @click="removeRow(grp.source, idx)">删除</el-button>
            </div>
            <div v-if="!rowsBySource[grp.source].length" class="cond-empty">暂无条件</div>
          </div>

          <!-- 添加条件(属性按来源分组) -->
          <el-dropdown trigger="click" @command="addConditionRow">
            <el-button size="small" :icon="'Plus'">添加查询条件</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <template v-for="src in availableSources" :key="src">
                  <div class="picker-group">{{ SOURCE_NAMES[src] }}</div>
                  <el-dropdown-item v-for="p in attrsBySource[src]" :key="p.bk_property_id" :command="`${src}:${p.bk_property_id}`">
                    {{ p.bk_property_name }} ({{ p.bk_property_id }})
                  </el-dropdown-item>
                </template>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <div class="editor-actions">
            <el-button size="small" type="primary" :loading="saving" @click="saveEditor">保存</el-button>
            <el-button size="small" :disabled="!allRows.length" @click="doPreview">预览</el-button>
            <el-popconfirm title="确定清空分组条件" width="240" confirm-button-text="确定" cancel-button-text="取消" @confirm="clearRows">
              <template #reference>
                <el-button size="small" :disabled="!allRows.length">清空条件</el-button>
              </template>
            </el-popconfirm>
            <el-button size="small" @click="editorVisible = false">取消</el-button>
          </div>
        </div>

        <div class="editor-right">
          <div class="preview-head">预览结果 <span v-if="previewTotal !== null" class="preview-count">共 {{ previewTotal }} 条</span></div>
          <el-table v-if="editorForm.bk_obj_id === 'host'" :data="previewRows" v-loading="previewing" size="small" class="preview-table">
            <el-table-column label="内网IP" min-width="120">
              <template #default="{ row }">{{ row.host?.bk_host_innerip || '--' }}</template>
            </el-table-column>
            <el-table-column label="主机名称" min-width="120">
              <template #default="{ row }">{{ row.host?.bk_host_name || '--' }}</template>
            </el-table-column>
            <el-table-column label="集群" min-width="110">
              <template #default="{ row }">{{ (row.set || [])[0]?.bk_set_name || '--' }}</template>
            </el-table-column>
            <el-table-column label="模块" min-width="110">
              <template #default="{ row }">{{ (row.module || [])[0]?.bk_module_name || '--' }}</template>
            </el-table-column>
          </el-table>
          <el-table v-else :data="previewRows" v-loading="previewing" size="small" class="preview-table">
            <el-table-column label="集群名" prop="bk_set_name" min-width="140" show-overflow-tooltip />
            <el-table-column label="环境" prop="bk_set_env" width="100">
              <template #default="{ row }">{{ row.bk_set_env === '1' ? '测试' : row.bk_set_env === '2' ? '体验' : '正式' }}</template>
            </el-table-column>
            <el-table-column label="描述" prop="bk_set_desc" min-width="120" show-overflow-tooltip>
              <template #default="{ row }">{{ row.bk_set_desc || '--' }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!previewing && previewTotal === 0 && previewRows.length === 0" description="点击「预览」查看匹配结果" :image-size="60" />
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
// 动态分组:对齐老版编辑侧滑(条件编辑/预览/清空确认),契约 dynamicgroup CRUD;编辑器预览走 host/set 查询
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchDynamicGroups, deleteDynamicGroup, executeDynamicGroup,
  createDynamicGroup, updateDynamicGroup, getDynamicGroupDetail,
  previewHostsByCondition, searchSetsByFilter, searchModelAttributes
} from '../../api/cmdb'
import { useRoute } from 'vue-router'
import { useBizStore } from '../../stores/biz'

const route = useRoute()
const bizStore = useBizStore()
const routeBizId = computed(() => Number(route.params.bizId) || Number(route.query.biz) || null)
const bizId = computed(() => routeBizId.value || bizStore.bizId)
const groups = ref([])
const keyword = ref('')
// 旧版列表按查询名称本地过滤
const filteredGroups = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return groups.value
  return groups.value.filter((g) => (g.name || '').toLowerCase().includes(k))
})
const loading = ref(false)

const TARGET_NAMES = { host: '主机', set: '集群' }
const SOURCE_NAMES = { host: '主机属性', set: '集群属性', module: '模块属性' }

// ---------- 列表 ----------
async function load() {
  if (!bizId.value) return
  loading.value = true
  try {
    const data = await searchDynamicGroups(bizId.value, { start: 0, limit: 200 })
    groups.value = data?.info || []
  } finally { loading.value = false }
}

const previewVisible = ref(false)
const previewName = ref('')
const previewHosts = ref([])
const previewLoading = ref(false)

async function preview(row) {
  previewName.value = row.name
  previewVisible.value = true
  previewLoading.value = true
  try {
    const data = await executeDynamicGroup(bizId.value, row.id, { start: 0, limit: 100 })
    previewHosts.value = data?.info || []
  } finally { previewLoading.value = false }
}

async function remove(row) {
  await ElMessageBox.confirm(`确定删除动态分组「${row.name}」?`, '删除确认', { type: 'warning' })
  await deleteDynamicGroup(bizId.value, row.id)
  ElMessage.success('已删除')
  load()
}

// ---------- 编辑器 ----------
const editorVisible = ref(false)
const editorTitle = ref('新建动态分组')
const editorForm = ref({ id: null, name: '', bk_obj_id: 'host' })
const saving = ref(false)
const conditionGroups = computed(() => editorForm.value.bk_obj_id === 'host'
  ? [
      { key: 'var-host', name: '可变条件', tip: '动态分组可变条件:查询对象自身的属性条件', source: 'host' },
      { key: 'lock-set', name: '锁定条件', tip: '动态分组锁定条件:关联拓扑对象的属性条件', source: 'set' },
      { key: 'lock-module', name: '锁定条件', tip: '动态分组锁定条件:关联拓扑对象的属性条件', source: 'module' }
    ]
  : [
      { key: 'var-set', name: '可变条件', tip: '动态分组可变条件:查询对象自身的属性条件', source: 'set' },
      { key: 'lock-module', name: '锁定条件', tip: '动态分组锁定条件:关联模块的属性条件', source: 'module' }
    ])

const attrsBySource = ref({ host: [], set: [], module: [] })
const rowsBySource = ref({ host: [], set: [], module: [] })
const allRows = computed(() => [...rowsBySource.value.host, ...rowsBySource.value.set, ...rowsBySource.value.module])
const availableSources = computed(() => editorForm.value.bk_obj_id === 'host' ? ['host', 'set', 'module'] : ['set', 'module'])
let uidSeq = 1

function propName(row) {
  return attrsBySource.value[row.source]?.find((p) => p.bk_property_id === row.field)?.bk_property_name || row.field
}

// 老版 operator-selector 的类型→操作符映射
const OPERATORS_BY_TYPE = {
  bool: ['eq', 'ne'],
  date: ['gte', 'lte'],
  time: ['gte', 'lte'],
  enum: ['in', 'nin'],
  enummulti: ['in', 'nin'],
  enumquote: ['in', 'nin'],
  float: ['eq', 'ne', 'gt', 'lt', 'range'],
  int: ['eq', 'ne', 'gt', 'lt', 'range'],
  list: ['in', 'nin'],
  longchar: ['in', 'nin', 'regex'],
  singlechar: ['in', 'nin', 'regex'],
  objuser: ['in', 'nin'],
  organization: ['in', 'nin'],
  timezone: ['in', 'nin'],
  foreignkey: ['in', 'nin'],
  table: ['in', 'nin'],
  array: ['in', 'nin', 'regex'],
  object: ['in', 'nin', 'regex'],
  map: ['in', 'nin']
}
const OPERATOR_META = {
  eq: { name: '=', desc: '等于' }, ne: { name: '≠', desc: '不等于' },
  in: { name: 'in', desc: '包含在' }, nin: { name: 'not in', desc: '不包含在' },
  gt: { name: '>', desc: '大于' }, lt: { name: '<', desc: '小于' },
  gte: { name: '≥', desc: '大于等于' }, lte: { name: '≤', desc: '小于等于' },
  range: { name: '≤ ≥', desc: '数值范围' }, regex: { name: 'like', desc: '模糊' }
}
function operatorOptions(row) {
  const ops = OPERATORS_BY_TYPE[row.bk_property_type] || ['in', 'nin', 'regex']
  return ops.map((id) => ({ id, ...OPERATOR_META[id] }))
}
function valueOptions(row) {
  const attr = attrsBySource.value[row.source]?.find((p) => p.bk_property_id === row.field)
  return Array.isArray(attr?.option) ? attr.option : []
}

function makeRow(source, attr) {
  const ops = OPERATORS_BY_TYPE[attr.bk_property_type] || ['in', 'nin', 'regex']
  const op = ops[0]
  const multi = op === 'in' || op === 'nin'
  const isEnum = ['enum', 'enummulti', 'enumquote', 'list', 'timezone'].includes(attr.bk_property_type)
  return {
    uid: uidSeq++, source, field: attr.bk_property_id, bk_property_type: attr.bk_property_type,
    operator: op,
    value: multi && isEnum ? [] : (attr.bk_property_type === 'bool' ? true : ''),
    value2: ''
  }
}

function addConditionRow(cmd) {
  const [source, field] = cmd.split(':')
  const attr = attrsBySource.value[source]?.find((p) => p.bk_property_id === field)
  if (!attr) return
  if (rowsBySource.value[source].some((r) => r.field === field)) {
    ElMessage.warning(`条件「${attr.bk_property_name}」已存在`)
    return
  }
  rowsBySource.value[source].push(makeRow(source, attr))
}
function removeRow(source, idx) {
  rowsBySource.value[source].splice(idx, 1)
}
function clearRows() {
  rowsBySource.value = { host: [], set: [], module: [] }
  previewRows.value = []
  previewTotal.value = null
}
function onTargetChange() {
  clearRows()
}

async function loadAttrs(objIds) {
  for (const objId of objIds) {
    if (attrsBySource.value[objId]?.length) continue
    const attrs = (await searchModelAttributes(objId).catch(() => [])) || []
    attrsBySource.value[objId] = attrs.filter((a) => a.bk_property_id)
  }
}

async function openEditor(row) {
  editorTitle.value = row ? `编辑动态分组【${row.name}】` : '新建动态分组'
  editorForm.value = { id: row?.id || null, name: row?.name || '', bk_obj_id: row?.bk_obj_id || 'host' }
  clearRows()
  editorVisible.value = true
  await loadAttrs(availableSources.value)
  if (row) {
    const detail = await getDynamicGroupDetail(bizId.value, row.id).catch(() => null)
    echoCondition(detail?.info?.condition || [])
  }
}

// 保存条件回显:老版操作符转换(contains/contains_s/$regex→regex;gte+lte 同字段合并为 range)
const ECHO_OP = { equal: 'eq', not_equal: 'ne', less: 'lt', less_or_equal: 'lte', greater: 'gt', greater_or_equal: 'gte', between: 'range' }
function echoCondition(condition) {
  for (const group of condition || []) {
    const source = group.bk_obj_id
    if (!attrsBySource.value[source]) continue
    const merged = []
    for (const it of group.condition || []) {
      const prev = merged[merged.length - 1]
      if (prev && prev.field === it.field && prev._pendingRange && ['$lte', 'lte'].includes(String(it.operator))) {
        prev.operator = 'range'
        prev.value2 = it.value
        prev._pendingRange = false
        continue
      }
      merged.push({ ...it, _pendingRange: ['$gte', 'gte'].includes(String(it.operator)) })
    }
    for (const it of merged) {
      let op = String(it.operator || '')
      if (['contains', 'contains_s', '$regex', 'regex'].includes(op)) op = 'regex'
      else {
        op = op.replace(/^\$/, '')
        op = ECHO_OP[op] || op
      }
      const attr = attrsBySource.value[source].find((p) => p.bk_property_id === it.field) || { bk_property_type: 'singlechar' }
      const row = makeRow(source, attr)
      row.field = it.field
      const opts = operatorOptions(row)
      row.operator = opts.some((o) => o.id === op) ? op : opts[0].id
      row.value = it.value
      row.value2 = ''
      rowsBySource.value[source]?.push(row)
    }
  }
}

// 提交转换(老版语义: range 拆 gte/lte;模糊=主机自身字段 $regex,关联字段与集群目标 contains)
function buildSubmitItems(rows, target) {
  const items = []
  for (const row of rows) {
    if (row.value === '' || row.value === null || row.value === undefined || (Array.isArray(row.value) && !row.value.length)) continue
    const multi = row.operator === 'in' || row.operator === 'nin'
    let value = row.value
    if (multi && !Array.isArray(value)) {
      value = String(value).split(/,|，/).map((s) => s.trim()).filter(Boolean)
      if (['int', 'float'].includes(row.bk_property_type)) value = value.map(Number)
    }
    if (row.operator === 'range') {
      if (row.value === null || row.value === undefined || row.value === '' || row.value2 === '' || row.value2 === null || row.value2 === undefined) continue
      items.push({ field: row.field, operator: '$gte', value: row.value })
      items.push({ field: row.field, operator: '$lte', value: row.value2 })
    } else if (row.operator === 'regex') {
      items.push({ field: row.field, operator: row.source === target && target === 'host' ? '$regex' : 'contains', value })
    } else {
      items.push({ field: row.field, operator: `$${row.operator}`, value })
    }
  }
  return items
}

function buildSubmitCondition() {
  return availableSources.value
    .map((src) => ({ bk_obj_id: src, condition: buildSubmitItems(rowsBySource.value[src], editorForm.value.bk_obj_id) }))
    .filter((g) => g.condition.length)
}

async function saveEditor() {
  if (!String(editorForm.value.name || '').trim()) { ElMessage.warning('请填写分组名称'); return }
  if (!allRows.value.length) { ElMessage.warning('请添加查询条件'); return }
  const invalid = allRows.value.find((r) => {
    if (r.operator === 'range') return r.value === '' || r.value === null || r.value === undefined || r.value2 === '' || r.value2 === null || r.value2 === undefined
    return r.value === '' || r.value === null || r.value === undefined || (Array.isArray(r.value) && !r.value.length)
  })
  if (invalid) { ElMessage.warning(`请填写条件「${propName(invalid)}」的值`); return }
  saving.value = true
  try {
    const condition = buildSubmitCondition()
    if (editorForm.value.id) {
      await updateDynamicGroup(bizId.value, editorForm.value.id, editorForm.value.name, editorForm.value.bk_obj_id, condition)
      ElMessage.success('动态分组已更新')
    } else {
      await createDynamicGroup(bizId.value, editorForm.value.name, editorForm.value.bk_obj_id, condition)
      ElMessage.success('动态分组已创建')
    }
    editorVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}

// ---------- 编辑器内预览 ----------
const previewRows = ref([])
const previewTotal = ref(null)
const previewing = ref(false)

async function doPreview() {
  if (!allRows.value.length) return
  previewing.value = true
  previewRows.value = []
  previewTotal.value = null
  try {
    if (editorForm.value.bk_obj_id === 'host') {
      const condition = availableSources.value
        .map((src) => ({ bk_obj_id: src, fields: [], condition: buildSubmitItems(rowsBySource.value[src], 'host') }))
        .filter((c) => c.condition.length)
      const data = await previewHostsByCondition(condition)
      previewRows.value = data?.info || []
      previewTotal.value = data?.count ?? previewRows.value.length
    } else {
      // 集群预览: topo set/search 的 filter 规则(通用模型条件格式)
      const RULE_OP = { eq: 'equal', ne: 'not_equal', in: 'in', nin: 'not_in', gt: 'greater', lt: 'less', gte: 'greater_or_equal', lte: 'less_or_equal', regex: 'contains' }
      const rules = []
      for (const src of availableSources.value) {
        for (const it of buildSubmitItems(rowsBySource.value[src], 'set')) {
          const bare = String(it.operator).replace(/^\$/, '')
          rules.push({ field: it.field, operator: RULE_OP[bare] || bare, value: it.value })
        }
      }
      const data = await searchSetsByFilter(bizId.value, { condition: 'AND', rules })
      previewRows.value = data?.info || []
      previewTotal.value = data?.count ?? previewRows.value.length
    }
  } catch (e) {
    ElMessage.error('预览失败: ' + (e?.message || '后端异常'))
  } finally { previewing.value = false }
}

watch(bizId, () => { if (bizId.value) load() })

onMounted(async () => {
  await bizStore.ensureLoaded()
  if (routeBizId.value && bizStore.bizList.some((b) => b.bk_biz_id === routeBizId.value)) bizStore.select(routeBizId.value)
  if (bizId.value) load()
})
</script>

<style scoped>
.editor-layout { display: flex; gap: 16px; height: 100%; }
.editor-left { flex: 0 0 460px; overflow-y: auto; padding-right: 4px; }
.editor-right { flex: 1; overflow: hidden; display: flex; flex-direction: column; border-left: 1px solid #E7E9EF; padding-left: 16px; }
.form-title { margin: 0 0 12px; font-size: 14px; color: #313238; }
.cond-group { margin: 14px 0 6px; }
.cond-group-title { font-size: 13px; font-weight: 600; color: #313238; margin-bottom: 8px; cursor: default; }
.cond-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.cond-source { flex: 0 0 56px; font-size: 12px; color: #979BA5; }
.cond-field { flex: 0 0 110px; font-size: 12px; color: #313238; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cond-op { flex: 0 0 88px; }
.cond-val { flex: 1; min-width: 0; }
.cond-del { flex: 0 0 auto; }
.cond-empty { font-size: 12px; color: #C4C6CC; padding: 4px 0; }
.picker-group { padding: 4px 12px; font-size: 12px; color: #979BA5; background: #F5F7FA; }
.editor-actions { margin-top: 18px; display: flex; gap: 8px; }
.preview-head { font-size: 13px; font-weight: 600; color: #313238; margin-bottom: 10px; }
.preview-count { font-weight: 400; color: #979BA5; margin-left: 8px; }
.preview-table { flex: 1; overflow-y: auto; }
</style>
