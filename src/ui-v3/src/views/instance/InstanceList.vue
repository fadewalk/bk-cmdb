<template>
  <div class="inst-page" v-loading="loading">
    <div class="inst-head">
      <span class="back-btn" @click="goBack">‹ 资源</span>
      <span class="inst-title">{{ model?.bk_obj_name || objId }} <span class="inst-sub">{{ objId }}</span></span>
      <div class="spacer" />
      <el-button type="primary" :icon="'Plus'" @click="openForm()">新建</el-button>
      <el-button :disabled="!selected.length" @click="batchRemove">删除</el-button>
      <el-button :icon="'Upload'" @click="importVisible = true">导入</el-button>
      <el-button :icon="'Download'" :loading="exporting" @click="submitExport">导出</el-button>
      <el-button :icon="'Clock'" @click="$router.push(`/resource/history/instance/${objId}`)">删除历史</el-button>
      <el-dropdown trigger="click" @command="onColCmd">
        <el-button :icon="'Setting'">列配置</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="config">配置显示字段</el-dropdown-item>
            <el-dropdown-item command="reset">恢复默认</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div class="inst-toolbar">
      <el-input
        v-model="keyword"
        placeholder="请输入实例名称"
        size="small"
        clearable
        style="width: 240px"
        :prefix-icon="'Search'"
        @keyup.enter="reload"
        @clear="reload"
      />
      <div class="spacer" />
      <el-button size="small" :icon="'Refresh'" @click="load">刷新</el-button>
    </div>

    <el-table :data="rows" size="small" stripe @selection-change="onSelect">
      <el-table-column type="selection" width="36" />
      <el-table-column label="实例 ID" prop="bk_inst_id" width="100" />
      <el-table-column label="实例名称" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <el-link type="primary" :underline="false" @click="openDetail(row)">
            {{ row.bk_inst_name || `#${row.bk_inst_id ?? row.id}` }}
          </el-link>
        </template>
      </el-table-column>
      <el-table-column
        v-for="col in displayCols"
        :key="col.bk_property_id"
        :label="col.bk_property_name"
        min-width="140"
        show-overflow-tooltip
      >
        <template #default="{ row }">{{ cellText(row[col.bk_property_id], col) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openForm(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="removeRow(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="inst-footer">
      <span>共计{{ total }}条</span>
      <span class="selected-info">已选择{{ selected.length }}条</span>
      <div class="spacer" />
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        @current-change="load"
      />
    </div>

    <!-- 新建/编辑实例 -->
    <el-dialog v-model="formVisible" :title="formInstId ? '编辑实例' : '新建实例'" width="560px">
      <el-form label-width="140px">
        <el-form-item label="实例名称" required>
          <el-input v-model="formMap.bk_inst_name" />
        </el-form-item>
        <el-form-item
          v-for="f in editableAttrs"
          :key="f.bk_property_id"
          :label="f.bk_property_name"
          :required="!!f.isrequired"
        >
          <el-select v-if="enumOptions(f).length" v-model="formMap[f.bk_property_id]" clearable style="width: 100%">
            <el-option v-for="o in enumOptions(f)" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
          <el-switch
            v-else-if="f.bk_property_type === 'bool'"
            v-model="formMap[f.bk_property_id]"
          />
          <el-date-picker
            v-else-if="f.bk_property_type === 'date'"
            v-model="formMap[f.bk_property_id]"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
          <el-date-picker
            v-else-if="f.bk_property_type === 'time'"
            v-model="formMap[f.bk_property_id]"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
          <el-input-number
            v-else-if="f.bk_property_type === 'int'"
            v-model="formMap[f.bk_property_id]"
            :controls="false"
            style="width: 100%"
          />
          <el-input v-else v-model="formMap[f.bk_property_id]" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <!-- 列配置 -->
    <el-dialog v-model="colPickerVisible" title="配置显示字段" width="420px">
      <el-checkbox-group v-model="colDraft">
        <div class="col-grid">
          <el-checkbox v-for="c in colPool" :key="c.bk_property_id" :value="c.bk_property_id">
            {{ c.bk_property_name }}
          </el-checkbox>
        </div>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="colPickerVisible = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="colDraft.length === 0"
          @click="pickedColIds = [...colDraft]; savePickedCols(); colPickerVisible = false"
        >确定</el-button>
      </template>
    </el-dialog>

    <!-- 实例导入 -->
    <el-dialog v-model="importVisible" title="导入实例" width="520px" :close-on-click-modal="false">
      <el-alert type="info" :closable="false" style="margin-bottom: 12px" title="下载模板并按格式填写后上传(支持 .xlsx)" />
      <div class="import-toolbar">
        <el-upload :auto-upload="false" :limit="1" accept=".xlsx,.xls" :on-change="onImportFile">
          <el-button :icon="'Upload'">选择文件</el-button>
        </el-upload>
        <el-button :icon="'Download'" :loading="tplDownloading" @click="fetchTemplate">下载模板</el-button>
      </div>
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" :disabled="!importFile" @click="submitImport">导入</el-button>
      </template>
    </el-dialog>

    <!-- 实例详情 -->
    <el-drawer v-model="detailVisible" :title="detailRow ? (detailRow.bk_inst_name || `实例 ${detailInstId}`) : '实例详情'" size="520px">
      <el-tabs v-model="detailTab">
        <el-tab-pane label="属性" name="props" />
        <el-tab-pane label="关联" name="assoc" />
        <el-tab-pane label="变更历史" name="history" />
      </el-tabs>
      <template v-if="detailTab === 'props'">
        <el-descriptions v-if="detailRow" :column="1" border size="small">
          <el-descriptions-item v-for="(v, k) in detailProps" :key="k" :label="attrName(k)">
            {{ v === null || v === '' || v === undefined ? '--' : v }}
          </el-descriptions-item>
        </el-descriptions>
      </template>
      <template v-else-if="detailTab === 'assoc'">
        <!-- 老版 general-model 详情关联 tab:列表/拓扑双视图 + 新增关联(内置模型保护) -->
        <div class="assoc-toolbar">
          <el-radio-group v-model="assocView" size="small">
            <el-radio-button value="list">列表</el-radio-button>
            <el-radio-button value="topo">拓扑</el-radio-button>
          </el-radio-group>
          <el-tooltip :disabled="!assocLocked" content="内置模型实例不支持关联编辑" placement="top">
            <span>
              <el-button type="primary" size="small" :disabled="assocLocked || !assocDefs.length" @click="assocFormVisible = true">新增关联</el-button>
            </span>
          </el-tooltip>
        </div>
        <template v-if="assocView === 'list'">
          <el-table :data="assocRows" v-loading="assocLoading" size="small">
            <el-table-column label="方向" width="92">
              <template #default="{ row }">{{ row.__dir === 'src' ? '关联' : '被关联' }}</template>
            </el-table-column>
            <el-table-column label="模型" prop="__peerObjName" min-width="110" show-overflow-tooltip />
            <el-table-column label="实例" prop="__peerName" min-width="130" show-overflow-tooltip />
            <el-table-column label="关联类型" prop="__kindName" min-width="100" show-overflow-tooltip />
            <el-table-column label="操作" width="86">
              <template #default="{ row }">
                <el-tooltip :disabled="!assocLocked" content="内置模型实例不支持关联编辑" placement="top">
                  <span>
                    <el-button link type="danger" :disabled="assocLocked" @click="removeAssoc(row)">取消关联</el-button>
                  </span>
                </el-tooltip>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!assocLoading && assocRows.length === 0" description="暂无关联" :image-size="60" />
        </template>
        <template v-else>
          <div v-loading="assocLoading" class="assoc-topo">
            <div v-for="group in assocTopoGroups" :key="group.objId" class="assoc-topo-group">
              <div class="assoc-topo-title">{{ group.objName }}({{ group.items.length }})</div>
              <div class="assoc-topo-nodes">
                <span v-for="item in group.items" :key="item.__key" class="assoc-topo-node">
                  {{ item.__peerName }}
                </span>
              </div>
            </div>
            <el-empty v-if="!assocLoading && assocTopoGroups.length === 0" description="暂无关联拓扑" :image-size="60" />
          </div>
        </template>

        <el-dialog v-model="assocFormVisible" title="新增关联" width="420px" append-to-body>
          <el-form label-width="72px" size="small">
            <el-form-item label="关联类型">
              <el-select v-model="assocForm.kind" placeholder="请选择" style="width: 100%">
                <el-option v-for="d in assocDefs" :key="d.__key" :value="d" :label="`${d.kindName} ${d.__dir === 'src' ? '→' : '←'} ${d.peerObjName}`" />
              </el-select>
            </el-form-item>
            <el-form-item label="目标实例">
              <el-select v-model="assocForm.targetInst" filterable remote :remote-method="searchAssocTargets"
                :loading="assocTargetLoading" placeholder="输入实例名搜索" style="width: 100%">
                <el-option v-for="inst in assocTargetOptions" :key="inst.id" :value="inst.id" :label="inst.name" />
              </el-select>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="assocFormVisible = false">取消</el-button>
            <el-button type="primary" :loading="assocSaving" @click="submitAssoc">提交</el-button>
          </template>
        </el-dialog>
      </template>
      <template v-else>
        <el-table :data="auditRows" v-loading="auditLoading" size="small">
          <el-table-column label="操作人" prop="user" width="110" />
          <el-table-column label="操作" width="90">
            <template #default="{ row }">{{ actionName(row.action) }}</template>
          </el-table-column>
          <el-table-column label="实例名称" prop="resource_name" min-width="140" show-overflow-tooltip />
          <el-table-column label="时间" min-width="150">
            <template #default="{ row }">{{ (row.operation_time || '').replace('T', ' ').slice(0, 19) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!auditLoading && auditRows.length === 0" description="暂无变更记录" :image-size="60" />
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchModels, searchModelAttributes,
  searchInstances, countInstances,
  createInstance, updateInstance, deleteInstance, deleteInstances,
  searchInstAudit, importInstances, downloadInstTemplate, exportInstances,
  searchInstAssociations, searchObjectAssociations, searchAssociationTypes,
  createInstAssociation, deleteInstAssociation
} from '../../api/cmdb'

const route = useRoute()
const router = useRouter()
const objId = computed(() => String(route.params.objId || ''))

const SYSTEM_FIELDS = ['bk_inst_id', 'bk_inst_name', 'bk_supplier_account', 'bk_created_by', 'bk_created_at', 'bk_updated_by', 'bk_updated_at']

const model = ref(null)
const attrs = ref([])
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const keyword = ref('')
const selected = ref([])
const loading = ref(false)
const saving = ref(false)

const formVisible = ref(false)
const formInstId = ref(null)
const formMap = ref({})
const detailVisible = ref(false)
const detailRow = ref(null)
const detailInstId = ref(null)
const detailTab = ref('props')
const auditRows = ref([])
const auditLoading = ref(false)

const AUDIT_ACTIONS = {
  create: '新增', update: '修改', delete: '删除',
  assign_host: '分配主机', unassign_host: '回收主机',
  transfer_host_module: '转移模块', archive: '归档', recover: '恢复'
}
function actionName(a) { return AUDIT_ACTIONS[a] || a || '--' }

async function loadAudit() {
  if (!detailInstId.value) return
  auditLoading.value = true
  try {
    const data = await searchInstAudit({
      condition: { bk_obj_id: objId.value, resource_type: 'model_instance', resource_id: detailInstId.value },
      page: { start: 0, limit: 50, sort: '-operation_time' }
    })
    auditRows.value = data?.info || []
  } catch {
    auditRows.value = []
  } finally {
    auditLoading.value = false
  }
}

watch(detailTab, (v) => {
  if (v === 'history' && !auditRows.value.length && !auditLoading.value) loadAudit()
  if (v === 'assoc' && !assocRows.value.length && !assocLoading.value) loadInstAssoc()
})

// ---------- 关联 tab(老版 general-model 详情 relation 契约) ----------
const assocView = ref('list')
const assocRows = ref([])
const assocLoading = ref(false)
const assocLocked = computed(() => Boolean(model.value?.bk_ispre))
const assocDefs = ref([])
const assocFormVisible = ref(false)
const assocForm = ref({ kind: null, targetInst: null })
const assocTargetOptions = ref([])
const assocTargetLoading = ref(false)
const assocSaving = ref(false)

function instIdFieldOf(obj) {
  return obj === 'host' ? 'bk_host_id' : `bk_${obj}_id`
}

async function loadInstAssoc() {
  if (!detailInstId.value) return
  assocLoading.value = true
  try {
    // 老版契约:findmany/inst/association/object/{objId}/inst_id/{id}/offset/limit/web
    // 响应 {association:{src,dst}, instance:{objId:[实例信息]}};src 为本实例作为源模型
    const data = await searchInstAssociations(objId.value, detailInstId.value, 0, 200)
    const payload = data?.data || data || {}
    const srcList = payload.association?.src || []
    const dstList = payload.association?.dst || []
    const instMap = payload.instance || {}
    let kinds = {}
    try {
      const kindRes = await searchAssociationTypes({})
      kinds = Object.fromEntries((kindRes?.info || kindRes || []).map((k) => [k.bk_asst_id, k.bk_asst_name]))
    } catch { kinds = {} }
    const peerName = (obj, instId) => {
      const list = instMap[obj] || []
      const idField = instIdFieldOf(obj)
      const hit = list.find((x) => Number(x[idField] ?? x.bk_inst_id) === Number(instId))
      return hit ? (hit.bk_inst_name || hit.bk_host_innerip || instId) : instId
    }
    const peerObjName = (obj) => {
      const list = instMap[obj] || []
      return list[0]?.bk_obj_name || obj
    }
    const rows = []
    for (const item of srcList) {
      rows.push({
        __dir: 'src', __key: `s-${item.id}`, id: item.id,
        __kindName: kinds[item.bk_asst_id] || item.bk_asst_id,
        __peerObj: item.bk_asst_obj_id, __peerObjName: peerObjName(item.bk_asst_obj_id),
        __peerName: peerName(item.bk_asst_obj_id, item.bk_asst_inst_id),
        __peerInst: item.bk_asst_inst_id
      })
    }
    for (const item of dstList) {
      rows.push({
        __dir: 'dst', __key: `d-${item.id}`, id: item.id,
        __kindName: kinds[item.bk_asst_id] || item.bk_asst_id,
        __peerObj: item.bk_obj_id, __peerObjName: peerObjName(item.bk_obj_id),
        __peerName: peerName(item.bk_obj_id, item.bk_inst_id),
        __peerInst: item.bk_inst_id
      })
    }
    assocRows.value = rows
    // 可选关联定义:本模型为源(asst 方向)或为目标的反向关联
    let defs = []
    try {
      const [asSrc, asDst] = await Promise.all([
        searchObjectAssociations({ condition: { bk_obj_id: objId.value } }).catch(() => ({ info: [] })),
        searchObjectAssociations({ condition: { bk_asst_obj_id: objId.value } }).catch(() => ({ info: [] }))
      ])
      for (const d of (asSrc?.info || [])) {
        defs.push({ __key: `src-${d.id}`, __dir: 'src', def: d, bkAsstId: d.bk_asst_id, peerObj: d.bk_asst_obj_id, kindName: kinds[d.bk_asst_id] || d.bk_asst_id, peerObjName: d.bk_asst_obj_id })
      }
      for (const d of (asDst?.info || [])) {
        defs.push({ __key: `dst-${d.id}`, __dir: 'dst', def: d, bkAsstId: d.bk_asst_id, peerObj: d.bk_obj_id, kindName: kinds[d.bk_asst_id] || d.bk_asst_id, peerObjName: d.bk_obj_id })
      }
    } catch { defs = [] }
    assocDefs.value = defs
  } catch {
    assocRows.value = []
  } finally {
    assocLoading.value = false
  }
}

const assocTopoGroups = computed(() => {
  const byObj = new Map()
  for (const row of assocRows.value) {
    if (!byObj.has(row.__peerObj)) byObj.set(row.__peerObj, [])
    byObj.get(row.__peerObj).push(row)
  }
  return [...byObj.entries()].map(([obj, items]) => ({ objId: obj, objName: items[0].__peerObjName, items }))
})

async function searchAssocTargets(keyword) {
  const kind = assocForm.value.kind
  if (!kind?.peerObj) return
  assocTargetLoading.value = true
  try {
    const condition = keyword ? { bk_inst_name: { $regex: keyword }, bk_supplier_account: 0 } : { bk_supplier_account: 0 }
    const data = await searchInstances(kind.peerObj, {
      condition, page: { start: 0, limit: 50 }
    })
    const idField = instIdFieldOf(kind.peerObj)
    assocTargetOptions.value = (data?.info || []).map((row) => ({
      id: row[idField] ?? row.bk_inst_id,
      name: row.bk_inst_name || row.bk_host_innerip || row[idField]
    }))
  } catch {
    assocTargetOptions.value = []
  } finally {
    assocTargetLoading.value = false
  }
}

async function submitAssoc() {
  const kind = assocForm.value.kind
  if (!kind) { ElMessage.warning('请选择关联类型'); return }
  if (!assocForm.value.targetInst) { ElMessage.warning('请选择目标实例'); return }
  assocSaving.value = true
  try {
    // 老版契约:create/instassociation 以关联定义别名 bk_obj_asst_id 定位(dst 方向源/目标互换)
    if (kind.__dir === 'src') {
      await createInstAssociation({
        bk_obj_asst_id: kind.def.bk_obj_asst_id,
        bk_inst_id: detailInstId.value, bk_asst_inst_id: assocForm.value.targetInst
      })
    } else {
      await createInstAssociation({
        bk_obj_asst_id: kind.def.bk_obj_asst_id,
        bk_inst_id: assocForm.value.targetInst, bk_asst_inst_id: detailInstId.value
      })
    }
    ElMessage.success('关联已创建')
    assocFormVisible.value = false
    assocForm.value = { kind: null, targetInst: null }
    loadInstAssoc()
  } catch { /* http 层已提示 */ } finally {
    assocSaving.value = false
  }
}

async function removeAssoc(row) {
  await ElMessageBox.confirm('确定取消该关联?', '取消确认', { type: 'warning' })
  // 老版契约:delete/instassociation/{objId}/{assoId},objId 为本模型
  await deleteInstAssociation(objId.value, row.id)
  ElMessage.success('已取消关联')
  loadInstAssoc()
}

// 展示列:候选为全部非系统字段,按用户勾选(默认前 6 个,localStorage 持久化)
const colPool = computed(() => attrs.value
  .filter((f) => !SYSTEM_FIELDS.includes(f.bk_property_id))
  .sort((a, b) => (a.bk_property_type === 'longchar' ? 1 : 0) - (b.bk_property_type === 'longchar' ? 1 : 0)))

const PICK_KEY = computed(() => `instance.columns.${objId.value}`)
const pickedColIds = ref([])
const colPickerVisible = ref(false)
const colDraft = ref([])

const displayCols = computed(() => {
  const map = new Map(colPool.value.map((c) => [c.bk_property_id, c]))
  return pickedColIds.value.map((id) => map.get(id)).filter(Boolean)
})

function loadPickedCols() {
  let saved = null
  try { saved = JSON.parse(localStorage.getItem(PICK_KEY.value) || 'null') } catch { saved = null }
  if (Array.isArray(saved) && saved.length) {
    pickedColIds.value = saved
  } else {
    pickedColIds.value = colPool.value.slice(0, 6).map((c) => c.bk_property_id)
  }
}
function savePickedCols() {
  try { localStorage.setItem(PICK_KEY.value, JSON.stringify(pickedColIds.value)) } catch { /* ignore */ }
}
function openColPicker() {
  colDraft.value = [...pickedColIds.value]
  colPickerVisible.value = true
}
function onColCmd(cmd) {
  if (cmd === 'config') openColPicker()
  else if (cmd === 'reset') {
    pickedColIds.value = colPool.value.slice(0, 6).map((c) => c.bk_property_id)
    savePickedCols()
  }
}

const editableAttrs = computed(() => attrs.value
  .filter((f) => !SYSTEM_FIELDS.includes(f.bk_property_id) && !f.ispre && f.bk_property_id !== 'bk_inst_name'))

const detailProps = computed(() => {
  if (!detailRow.value) return {}
  const out = {}
  for (const [k, v] of Object.entries(detailRow.value)) {
    if (v === null || typeof v !== 'object') out[k] = v
  }
  return out
})

function goBack() { router.push('/resource/index') }

function enumOptions(f) {
  const opt = f.option
  if (Array.isArray(opt)) return opt.filter((o) => o && o.id !== undefined)
  if (opt && typeof opt === 'object') {
    // 嵌套枚举:取叶子节点的 id/name
    const out = []
    const walk = (node) => {
      for (const child of Object.values(node)) {
        if (child && typeof child === 'object') {
          if (child.id !== undefined) out.push({ id: child.id, name: child.name })
          else walk(child)
        }
      }
    }
    walk(opt)
    return out
  }
  return []
}

function attrName(key) {
  if (key === 'bk_inst_id') return '实例 ID'
  if (key === 'bk_inst_name') return '实例名称'
  return attrs.value.find((f) => f.bk_property_id === key)?.bk_property_name || key
}

function cellText(value, col) {
  if (value === null || value === undefined || value === '') return '--'
  if (col.bk_property_type === 'bool') return value ? '是' : '否'
  if (col.bk_property_type === 'enum') {
    return enumOptions(col).find((o) => o.id === value)?.name ?? String(value)
  }
  return String(value)
}

function buildFilter() {
  if (!keyword.value.trim()) return undefined
  return {
    condition: 'AND',
    rules: [{ field: 'bk_inst_name', operator: 'contains', value: keyword.value.trim() }]
  }
}

async function loadModel() {
  const all = await searchModels({ condition: { bk_obj_id: objId.value } })
  model.value = (all || [])[0] || null
}

async function loadAttrs() {
  attrs.value = (await searchModelAttributes(objId.value).catch(() => [])) || []
  loadPickedCols()
}

// ---------- 导入 ----------
const importVisible = ref(false)
const importFile = ref(null)
const importing = ref(false)

function onImportFile(file) {
  importFile.value = file.raw
}
const tplDownloading = ref(false)
async function fetchTemplate() {
  tplDownloading.value = true
  try {
    await downloadInstTemplate(objId.value)
  } catch (e) {
    ElMessage.error('模板下载失败: ' + (e?.message || '后端异常'))
  } finally { tplDownloading.value = false }
}

// ---------- 导出 ----------
const exporting = ref(false)
async function submitExport() {
  exporting.value = true
  try {
    await exportInstances(objId.value)
    ElMessage.success('已导出')
  } catch (e) {
    let msg = e?.message || '后端异常'
    if (e?.response?.data instanceof Blob) {
      try {
        const text = JSON.parse(await e.response.data.text())
        msg = text.bk_error_msg || msg
      } catch { /* 保留原信息 */ }
    }
    // 空模型等场景:后端返回明确的错误文本
    ElMessage.error('导出失败: ' + msg)
  } finally { exporting.value = false }
}
async function submitImport() {
  if (!importFile.value) { ElMessage.warning('请选择文件'); return }
  importing.value = true
  try {
    await importInstances(objId.value, importFile.value, {})
    ElMessage.success('导入成功')
    importVisible.value = false
    importFile.value = null
    await load()
  } catch (e) {
    ElMessage.error('导入失败: ' + (e?.message || '后端异常'))
  } finally { importing.value = false }
}

async function load() {
  loading.value = true
  try {
    const conditions = buildFilter()
    const body = { page: { start: (page.value - 1) * pageSize, limit: pageSize }, fields: [] }
    if (conditions) body.conditions = conditions
    const [data, count] = await Promise.all([
      searchInstances(objId.value, body),
      countInstances(objId.value, { conditions })
    ])
    rows.value = data?.info || []
    total.value = count?.count ?? rows.value.length
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load()
}

function onSelect(rows) {
  selected.value = rows
}

function instIdOf(row) {
  return row.bk_inst_id ?? row.id
}

function openForm(row) {
  if (row) {
    formInstId.value = instIdOf(row)
    formMap.value = { bk_inst_name: row.bk_inst_name }
    for (const f of editableAttrs.value) {
      formMap.value[f.bk_property_id] = row[f.bk_property_id] ?? (f.bk_property_type === 'bool' ? false : '')
    }
  } else {
    formInstId.value = null
    formMap.value = { bk_inst_name: '' }
    for (const f of editableAttrs.value) {
      formMap.value[f.bk_property_id] = f.bk_property_type === 'bool' ? false : ''
    }
  }
  formVisible.value = true
}

async function submitForm() {
  if (!String(formMap.value.bk_inst_name || '').trim()) {
    ElMessage.warning('请填写实例名称')
    return
  }
  const missing = editableAttrs.value.filter((f) => {
    if (!f.isrequired) return false
    const v = formMap.value[f.bk_property_id]
    return v === '' || v === null || v === undefined
  })
  if (missing.length) {
    ElMessage.warning(`请填写必填字段: ${missing.map((f) => f.bk_property_name).join('、')}`)
    return
  }
  saving.value = true
  try {
    if (formInstId.value) {
      await updateInstance(objId.value, formInstId.value, { ...formMap.value })
      ElMessage.success('实例已更新')
    } else {
      await createInstance(objId.value, { ...formMap.value, bk_supplier_account: '0' })
      ElMessage.success('实例已创建')
    }
    formVisible.value = false
    await load()
  } finally {
    saving.value = false
  }
}

async function removeRow(row) {
  try {
    await ElMessageBox.confirm(`确定删除实例「${row.bk_inst_name || instIdOf(row)}」?`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  await deleteInstance(objId.value, instIdOf(row))
  ElMessage.success('已删除')
  await load()
}

async function batchRemove() {
  const ids = selected.value.map(instIdOf)
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${ids.length} 个实例?`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  await deleteInstances(objId.value, ids)
  ElMessage.success('已删除')
  selected.value = []
  await load()
}

function openDetail(row) {
  detailRow.value = row
  detailInstId.value = instIdOf(row)
  detailTab.value = 'props'
  auditRows.value = []
  detailVisible.value = true
}

watch(objId, () => {
  if (objId.value) {
    model.value = null
    attrs.value = []
    reload()
    loadModel()
    loadAttrs()
  }
})

onMounted(async () => {
  await Promise.all([loadModel(), loadAttrs()])
  await load()
  // 旧版深链 /resource/instance/:objId/:instId → 重定向带 query,打开详情抽屉
  const fromQuery = Number(route.query.instId)
  if (fromQuery) {
    const row = rows.value.find((r) => instIdOf(r) === fromQuery)
    if (row) openDetail(row)
  }
})
</script>

<style scoped>
.inst-page { height: 100%; display: flex; flex-direction: column; background: #fff; overflow: hidden; }
.inst-head {
  display: flex; align-items: center; gap: 10px;
  padding: 0 20px; height: 50px; flex: 0 0 50px;
  border-bottom: 1px solid #E7E9EF;
}
.back-btn { cursor: pointer; color: #3A84FF; font-size: 14px; }
.inst-title { font-size: 14px; color: #313238; font-weight: 600; }
.inst-sub { font-size: 12px; color: #979BA5; font-weight: 400; margin-left: 4px; }
.inst-head .spacer { flex: 1; }
.inst-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 20px 0;
}
.inst-toolbar .spacer { flex: 1; }
.inst-footer {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 20px; font-size: 12px; color: #63656E;
}
.inst-footer .spacer { flex: 1; }
.selected-info { color: #979BA5; }
.import-toolbar { display: flex; align-items: center; gap: 8px; }
.col-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 12px; }

/* 关联 tab */
.assoc-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.assoc-topo { min-height: 120px; }
.assoc-topo-group { margin-bottom: 12px; }
.assoc-topo-title { font-size: 12px; color: #979BA5; margin-bottom: 6px; }
.assoc-topo-nodes { display: flex; flex-wrap: wrap; gap: 6px; }
.assoc-topo-node {
  display: inline-block; padding: 2px 10px; font-size: 12px; color: #63656E;
  background: #F0F1F5; border: 1px solid #DCDEE5; border-radius: 2px;
}
</style>
