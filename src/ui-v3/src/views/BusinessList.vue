<template>
  <div class="page-card">
    <div class="table-toolbar">
      <span
        v-for="t in scopeTabs" :key="t.key"
        :class="['scope-tab', { active: scope === t.key }]"
        @click="switchScope(t.key)"
      >{{ t.label }}</span>
      <div class="spacer" />
      <el-input
        v-model="keyword"
        placeholder="按业务名称过滤"
        clearable
        style="width: 240px"
        :prefix-icon="'Search'"
        @keyup.enter="reloadFromFirst"
        @clear="reloadFromFirst"
      />
      <el-button v-if="scope === 'normal'" type="primary" :icon="'Plus'" @click="openForm()">新建</el-button>
      <el-button v-if="scope === 'normal'" :disabled="!selectedRows.length" @click="openBatchEdit">批量编辑</el-button>
      <el-button :icon="'Refresh'" @click="load">刷新</el-button>
      <el-tooltip content="列表显示属性配置" placement="top">
        <el-icon class="legacy-toolbar-gear" @click="columnConfigVisible = true"><Setting /></el-icon>
      </el-tooltip>
    </div>

    <el-table :data="filtered" v-loading="loading" class="legacy-table" @selection-change="onSelect" @sort-change="onSortChange">
      <el-table-column type="selection" width="60" align="center" fixed :selectable="() => scope === 'normal'" />
      <el-table-column
        v-for="col in tableHeader"
        :key="col.bk_property_id"
        :prop="col.bk_property_id"
        :min-width="legacyColMinWidth(col, true)"
        sortable="custom"
        :show-overflow-tooltip="!['objuser', 'organization', 'enumquote', 'table'].includes(col.bk_property_type)"
      >
        <template #header>
          <span>{{ legacyHeaderName(col) }}</span>
        </template>
        <template #default="{ row }">
          <span
            v-if="col.bk_property_id === 'bk_biz_id'"
            class="cell-link"
            @click="goDetail(row)"
          >{{ legacyCellValue(row, col) }}</span>
          <span v-else :class="{ 'cell-empty': legacyCellValue(row, col) === '--' }">{{ legacyCellValue(row, col) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <template v-if="scope === 'normal'">
            <el-button link type="primary" size="small" @click="goTopo(row)">查看拓扑</el-button>
            <el-button link type="primary" size="small" @click="openForm(row)">编辑</el-button>
            <el-button link type="warning" size="small" @click="archive(row)">归档</el-button>
          </template>
          <template v-else>
            <el-button link type="primary" size="small" @click="recover(row)">恢复</el-button>
            <el-button link type="danger" size="small" @click="removeForever(row)">彻底删除</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <div class="table-footer">
      <span>共计{{ total }}条</span>
      <span class="page-size">
        每页
        <el-select v-model="pageSize" size="small" style="width: 72px" @change="() => { page = 1; load() }">
          <el-option v-for="n in [20, 50, 100, 500]" :key="n" :label="n" :value="n" />
        </el-select>
        条
      </span>
      <div class="spacer" />
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        @current-change="load"
      />
    </div>

    <!-- 新建/编辑业务(老版 800px sideslider + 属性 tab + 分组两列表单) -->
    <el-drawer
      v-model="formVisible"
      :title="formBizId ? '编辑 业务' : '创建 业务'"
      size="800px"
      :close-on-click-modal="false"
    >
      <el-tabs v-model="formTab">
        <el-tab-pane label="属性" name="attribute">
          <el-form label-position="top" class="biz-form">
            <div class="form-group">
              <div class="form-group-title">基础信息</div>
              <div class="form-grid">
                <el-form-item label="业务名称" required>
                  <el-input v-model="form.bk_biz_name" placeholder="请输入业务名称" />
                </el-form-item>
                <el-form-item label="生命周期">
                  <el-select v-model="form.life_cycle" style="width: 100%">
                    <el-option label="测试中" value="1" />
                    <el-option label="已上线" value="2" />
                    <el-option label="停运" value="3" />
                  </el-select>
                </el-form-item>
                <el-form-item label="时区" required>
                  <el-select v-model="form.time_zone" filterable style="width: 100%">
                    <el-option v-for="tz in timeZones" :key="tz" :label="tz" :value="tz" />
                  </el-select>
                </el-form-item>
                <el-form-item label="语言" required>
                  <el-select v-model="form.language" style="width: 100%">
                    <el-option label="中文" value="1" />
                    <el-option label="English" value="2" />
                  </el-select>
                </el-form-item>
                <el-form-item label="描述" class="span-2">
                  <el-input v-model="form.description" type="textarea" :rows="2" />
                </el-form-item>
              </div>
            </div>
            <div class="form-group">
              <div class="form-group-title">角色</div>
              <div class="form-grid">
                <el-form-item label="运维人员" required>
                  <el-input v-model="form.bk_biz_maintainer" placeholder="请输入运维人员" />
                </el-form-item>
                <el-form-item label="产品人员">
                  <el-input v-model="form.bk_biz_productor" placeholder="请输入产品人员" />
                </el-form-item>
                <el-form-item label="测试人员">
                  <el-input v-model="form.bk_biz_tester" placeholder="请输入测试人员" />
                </el-form-item>
                <el-form-item label="开发人员">
                  <el-input v-model="form.bk_biz_developer" placeholder="请输入开发人员" />
                </el-form-item>
                <el-form-item label="操作人员">
                  <el-input v-model="form.bk_biz_operator" placeholder="请输入操作人员" />
                </el-form-item>
              </div>
            </div>
          </el-form>
          <div class="form-footer">
            <el-button type="primary" :loading="saving" @click="submitForm">提交</el-button>
            <el-button @click="formVisible = false">取消</el-button>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-drawer>

    <!-- 批量编辑业务(契约: PUT /updatemany/biz/property {properties, condition};只提交修改字段) -->
    <el-drawer v-model="batchVisible" title="批量编辑" size="460px">
      <el-form label-width="100px">
        <el-form-item label="运维人员">
          <el-input v-model="batchMap.bk_biz_maintainer" placeholder="多个用逗号分隔" />
        </el-form-item>
        <el-form-item label="开发人员">
          <el-input v-model="batchMap.bk_biz_developer" placeholder="多个用逗号分隔" />
        </el-form-item>
        <el-form-item label="测试人员">
          <el-input v-model="batchMap.bk_biz_tester" placeholder="多个用逗号分隔" />
        </el-form-item>
        <el-form-item label="产品人员">
          <el-input v-model="batchMap.bk_biz_productor" placeholder="多个用逗号分隔" />
        </el-form-item>
        <el-form-item label="生命周期">
          <el-select v-model="batchMap.life_cycle" clearable style="width: 100%">
            <el-option label="测试中" value="1" />
            <el-option label="已上线" value="2" />
            <el-option label="停运" value="3" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作人员">
          <el-input v-model="batchMap.operator" placeholder="多个用逗号分隔" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchSaving" @click="submitBatch">保存</el-button>
      </template>
    </el-drawer>

    <!-- 列表显示属性配置(老版 columns-config 600px 双栏抽屉,共享组件) -->
    <LegacyColumnConfigDrawer
      v-model="columnConfigVisible"
      :pool="bizPool"
      :selected="drawerSelected"
      :fixed-ids="FIXED_COLS"
      @apply="onColumnApply"
      @reset="onColumnReset"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'
import LegacyColumnConfigDrawer from '../components/LegacyColumnConfigDrawer.vue'
import { legacyHeaderName, legacyColMinWidth, computeLegacyHeader, legacyCellValue } from '../utils/legacy-columns'
import {
  searchBusiness, createBusiness, updateBusiness,
  archiveBusiness, recoverBusiness, deleteArchivedBiz, http,
  searchUserCustom, saveUserCustom
} from '../api/cmdb'
import { fetchHostFilterProperties } from '../utils/host-filter'

const route = useRoute()
const router = useRouter()
const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const rows = ref([])
const loading = ref(false)
const saving = ref(false)

const scopeTabs = [
  { key: 'normal', label: '正常' },
  { key: 'archived', label: '已归档' }
]
const scope = ref('normal')

const formVisible = ref(false)
const formBizId = ref(null)
const form = ref({})
const formTab = ref('attribute')

const timeZones = [
  'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Singapore',
  'Asia/Tokyo', 'Asia/Seoul', 'Asia/Bangkok', 'Asia/Dubai',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Australia/Sydney', 'UTC'
]

const filtered = computed(() => rows.value)

// ---------- 表格列(老版业务列表契约:配置键 biz_custom_table_columns,固定 ID/业务名) ----------
const COLUMN_CONFIG_KEY = 'biz_custom_table_columns'
const FIXED_COLS = ['bk_biz_id', 'bk_biz_name']
// standalone biz 属性接口不返回 bk_biz_id,老版同为注入(createIdProperty)
const BIZ_ID_PROPERTY = {
  id: 'bk_biz_id', bk_obj_id: 'biz', bk_property_id: 'bk_biz_id',
  bk_property_name: 'ID', bk_property_index: -1, bk_property_type: 'int', isonly: true, ispre: true
}
const bizAttrs = ref([])
const bizPool = computed(() => [...bizAttrs.value, BIZ_ID_PROPERTY])
const tableHeader = ref([])
const columnConfigVisible = ref(false)
const drawerSelected = computed(() => tableHeader.value.map((p) => p.bk_property_id))
let ucCache = null

function computeHeader() {
  tableHeader.value = computeLegacyHeader({
    pool: bizPool.value,
    customIds: ucCache?.[COLUMN_CONFIG_KEY],
    fixedProperties: FIXED_COLS.map((id) => bizPool.value.find((p) => p.bk_property_id === id)).filter(Boolean)
  })
}

async function onColumnApply(ids) {
  await saveUserCustom({ [COLUMN_CONFIG_KEY]: ids })
  columnConfigVisible.value = false
  if (ucCache) ucCache[COLUMN_CONFIG_KEY] = [...ids]
  computeHeader()
  reloadFromFirst()
}

async function onColumnReset() {
  await saveUserCustom({ [COLUMN_CONFIG_KEY]: [] })
  columnConfigVisible.value = false
  if (ucCache) ucCache[COLUMN_CONFIG_KEY] = []
  computeHeader()
  reloadFromFirst()
}

// 老版排序契约:内部 sort(默认 bk_biz_id),随请求 page.sort 下发
const sort = ref('bk_biz_id')

function onSortChange({ prop, order }) {
  sort.value = order === 'ascending' ? prop : order === 'descending' ? `-${prop}` : 'bk_biz_id'
  reloadFromFirst()
}

function reloadFromFirst() {
  page.value = 1
  load()
}

async function load() {
  loading.value = true
  try {
    const condition = {
      ...(scope.value === 'archived' ? { bk_data_status: 'disabled' } : { bk_data_status: { $ne: 'disabled' } }),
      ...(keyword.value.trim() ? { bk_biz_name: keyword.value.trim() } : {})
    }
    const data = await searchBusiness({ start: (page.value - 1) * pageSize.value, limit: pageSize.value, sort: sort.value }, condition, keyword.value.trim() ? true : undefined)
    rows.value = data?.info || []
    total.value = data?.count || 0
  } catch {
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function switchScope(key) {
  if (scope.value === key) return
  scope.value = key
  page.value = 1
  load()
}

function goDetail(row) {
  router.push({ path: `/resource/business/details/${row.bk_biz_id}` })
}

function goTopo(row) {
  router.push({ path: `/business/${row.bk_biz_id}/index` })
}

function openForm(row) {
  if (row) {
    formBizId.value = row.bk_biz_id
    form.value = {
      bk_biz_name: row.bk_biz_name || '',
      bk_biz_maintainer: row.bk_biz_maintainer || '',
      bk_biz_developer: row.bk_biz_developer || '',
      bk_biz_tester: row.bk_biz_tester || '',
      bk_biz_productor: row.bk_biz_productor || '',
      bk_biz_operator: row.bk_biz_operator || '',
      life_cycle: row.life_cycle || '2',
      time_zone: row.time_zone || 'Asia/Shanghai',
      language: row.language || '1',
      description: row.description || ''
    }
  } else {
    formBizId.value = null
    form.value = {
      bk_biz_name: '', bk_biz_maintainer: 'admin', bk_biz_developer: '',
      bk_biz_tester: '', bk_biz_productor: '', bk_biz_operator: '', life_cycle: '2',
      time_zone: 'Asia/Shanghai', language: '1', description: ''
    }
  }
  formTab.value = 'attribute'
  formVisible.value = true
}

async function submitForm() {
  if (!String(form.value.bk_biz_name || '').trim()) { ElMessage.warning('请填写业务名称'); return }
  if (!String(form.value.bk_biz_maintainer || '').trim()) { ElMessage.warning('请填写运维人员'); return }
  saving.value = true
  try {
    if (formBizId.value) {
      await updateBusiness(formBizId.value, { ...form.value })
      ElMessage.success('业务已更新')
    } else {
      await createBusiness({ ...form.value })
      ElMessage.success('业务已创建')
    }
    formVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}

// ---------- 批量编辑 ----------
const selectedRows = ref([])
const batchVisible = ref(false)
const batchSaving = ref(false)
const batchMap = ref({})
const batchInit = ref({})
const BATCH_FIELDS = ['bk_biz_maintainer', 'bk_biz_developer', 'bk_biz_tester', 'bk_biz_productor', 'life_cycle', 'operator']

function onSelect(rows) { selectedRows.value = rows }

function openBatchEdit() {
  const init = {}
  for (const f of BATCH_FIELDS) init[f] = ''
  batchInit.value = init
  batchMap.value = { ...init }
  batchVisible.value = true
}

async function submitBatch() {
  const changed = {}
  for (const [k, v] of Object.entries(batchMap.value)) {
    if (String(v ?? '') !== String(batchInit.value[k] ?? '')) changed[k] = v
  }
  if (!Object.keys(changed).length) { ElMessage.warning('请先修改字段后再保存'); return }
  batchSaving.value = true
  try {
    // 老版契约: properties=变更字段, condition 限定所选业务
    await http.put('/updatemany/biz/property', {
      properties: changed,
      condition: { bk_biz_id: { $in: selectedRows.value.map((r) => r.bk_biz_id) } }
    })
    ElMessage.success(`已批量更新 ${selectedRows.value.length} 个业务`)
    batchVisible.value = false
    selectedRows.value = []
    await load()
  } catch (e) {
    ElMessage.error('批量编辑失败: ' + (e?.message || '后端异常'))
  } finally { batchSaving.value = false }
}

async function archive(row) {  try {
    await ElMessageBox.confirm(`确定归档业务「${row.bk_biz_name}」?归档后业务默认不可见,可在「已归档」中恢复或彻底删除。`, '归档确认', { type: 'warning' })
  } catch { return }
  try {
    await archiveBusiness(row.bk_biz_id)
    ElMessage.success('已归档')
    await load()
  } catch (e) {
    ElMessage.error('归档失败: ' + (e?.message || '后端异常'))
  }
}

async function recover(row) {
  try {
    await ElMessageBox.confirm(`确定恢复业务「${row.bk_biz_name}」?`, '恢复确认', { type: 'warning' })
  } catch { return }
  try {
    await recoverBusiness(row.bk_biz_id)
    ElMessage.success('已恢复')
    await load()
  } catch (e) {
    ElMessage.error('恢复失败: ' + (e?.message || '后端异常'))
  }
}

async function removeForever(row) {
  try {
    await ElMessageBox.confirm(`彻底删除业务「${row.bk_biz_name}」?该操作不可恢复!`, '危险操作', { type: 'error', confirmButtonText: '彻底删除' })
  } catch { return }
  try {
    await deleteArchivedBiz([row.bk_biz_id])
    ElMessage.success('已彻底删除')
    await load()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}

onMounted(async () => {
  // 先取属性与用户习惯算出表头,再发首个列表请求
  bizAttrs.value = ((await fetchHostFilterProperties()) || []).filter((p) => p.bk_obj_id === 'biz')
  ucCache = await searchUserCustom().catch(() => ({}))
  computeHeader()
  load()
  if (String(route.query.create || '') === '1') {
    openForm()
    router.replace({ query: { ...route.query, create: undefined } })
  }
})
</script>

<style scoped>
.table-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.table-toolbar .spacer { flex: 1; }
.biz-form :deep(.el-form-item__label) { color: #63656e; }
.form-group { margin-bottom: 18px; }
.form-group-title { font-size: 14px; font-weight: 700; color: #313238; margin-bottom: 12px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 40px; }
.form-grid .span-2 { grid-column: span 2; }
.form-footer { margin-top: 10px; }
.scope-tab {
  padding: 6px 4px; margin-right: 20px; font-size: 14px;
  color: #63656E; cursor: pointer; border-bottom: 2px solid transparent;
}
.scope-tab:hover { color: #3A84FF; }
.scope-tab.active { color: #3A84FF; border-bottom-color: #3A84FF; font-weight: 500; }
</style>
