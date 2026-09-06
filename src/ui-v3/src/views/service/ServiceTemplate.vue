<template>
  <div class="page-card">
    <h1 class="page-title">服务模板</h1>
    <p class="page-tips">服务模板可以预定义业务通用的服务，用于业务拓扑中批量部署和变更服务实例。</p>
    <div class="table-toolbar">
      <el-tabs v-model="tab" style="flex: 1">
        <el-tab-pane label="服务模板" name="template" />
        <el-tab-pane label="集群模板" name="settpl" />
      </el-tabs>
    </div>

    <!-- 服务模板 -->
    <template v-if="tab === 'template' && bizId">
      <div class="table-toolbar filter-bar">
        <el-select
          v-model="filterMainCate"
          placeholder="所有一级分类"
          clearable
          filterable
          size="small"
          style="width: 180px"
          @change="applyTemplateFilter"
        >
          <el-option v-for="c in mainCategories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-select
          v-model="filterSubCate"
          placeholder="所有二级分类"
          clearable
          filterable
          size="small"
          style="width: 180px"
          @change="applyTemplateFilter"
        >
          <el-option v-for="c in subCategories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-input
          v-model="filterName"
          placeholder="请输入模板名称"
          clearable
          size="small"
          style="width: 220px"
          :prefix-icon="'Search'"
          @input="applyTemplateFilter"
          @clear="applyTemplateFilter"
        />
        <div class="spacer" />
        <el-button :icon="'Plus'" type="primary" size="small" @click="tplFormVisible = true">新建</el-button>
      </div>
      <el-table :data="filteredTemplates" v-loading="tplLoading" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="模板名称" min-width="180" />
        <el-table-column label="服务分类" width="150">
          <template #default="{ row }">{{ row.service_category_id ? ('#' + row.service_category_id) : '--' }}</template>
        </el-table-column>
        <el-table-column label="进程数量" width="100">
          <template #default="{ row }">{{ row.process_count ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="已应用模块数" width="110">
          <template #default="{ row }">{{ row.module_count ?? 0 }}</template>
        </el-table-column>
        <el-table-column prop="modifier" label="修改人" width="110">
          <template #default="{ row }">{{ row.modifier || row.creator || '-' }}</template>
        </el-table-column>
        <el-table-column label="修改时间" width="160">
          <template #default="{ row }">{{ (row.last_time || '').replace('T', ' ').slice(0, 16) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEditTpl(row)">编辑</el-button>
            <el-button link type="primary" @click="cloneTpl(row)">克隆</el-button>
            <el-button link type="primary" @click="showTplDetail(row)">进程</el-button>
            <el-button link type="danger" @click="removeTpl(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!tplLoading && templates.length === 0" description="该业务暂无服务模板" :image-size="80" />
    </template>

    <!-- 集群模板 -->
    <template v-if="tab === 'settpl' && bizId">
      <el-alert type="info" :closable="false" style="margin-bottom: 12px"
        title="集群模板需绑定至少一个服务模板;删除集群模板不影响已创建的集群" />
      <div class="table-toolbar filter-bar">
        <el-select
          v-model="filterMainCate"
          placeholder="所有一级分类"
          clearable
          filterable
          size="small"
          style="width: 180px"
          @change="applyTemplateFilter"
        >
          <el-option v-for="c in mainCategories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-select
          v-model="filterSubCate"
          placeholder="所有二级分类"
          clearable
          filterable
          size="small"
          style="width: 180px"
          @change="applyTemplateFilter"
        >
          <el-option v-for="c in subCategories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-input
          v-model="filterName"
          placeholder="请输入模板名称"
          clearable
          size="small"
          style="width: 220px"
          :prefix-icon="'Search'"
          @input="applyTemplateFilter"
          @clear="applyTemplateFilter"
        />
        <div class="spacer" />
        <el-button size="small" type="primary" :icon="'Plus'" @click="setTplDialog = true">新建</el-button>
      </div>
      <el-table :data="filteredSetTemplates" v-loading="setLoading" stripe>
        <el-table-column prop="id" label="模板 ID" width="110" />
        <el-table-column prop="name" label="模板名称" min-width="200" />
        <el-table-column label="绑定的服务模板" min-width="200">
          <template #default="{ row }">{{ (row.service_template_ids || []).join(', ') || '--' }}</template>
        </el-table-column>
        <el-table-column prop="creator" label="创建人" width="130">
          <template #default="{ row }">{{ row.creator || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openSetTplDetail(row)">详情</el-button>
            <el-button link type="primary" @click="openSetTplSync(row)">同步</el-button>
            <el-button link type="primary" @click="loadSetTemplateHistory(row)">历史</el-button>
            <el-button link type="danger" @click="removeSetTpl(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!setLoading && setTemplates.length === 0" description="该业务暂无集群模板" :image-size="80" />

      <el-dialog v-model="setTplDialog" title="新建集群模板" width="480px">
        <el-form label-width="110px">
          <el-form-item label="模板名称" required>
            <el-input v-model="setTplForm.name" placeholder="如:通用中间件集群" />
          </el-form-item>
          <el-form-item label="绑定服务模板" required>
            <el-select v-model="setTplForm.service_template_ids" multiple style="width: 100%" placeholder="选择一个或多个服务模板">
              <el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id" />
            </el-select>
            <div class="hint">若无可选模板,请先到「服务模板」Tab 创建</div>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="setTplDialog = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveSetTpl">创建</el-button>
        </template>
      </el-dialog>
    </template>

    <el-empty v-if="!bizId" description="请先选择业务" />

    <!-- 集群模板详情 -->
    <el-drawer v-model="setDetailDrawer" :title="`「${setDetail?.name}」集群模板详情`" size="60%">
      <template v-if="setDetail">
        <el-descriptions :column="2" border size="default" class="set-detail-desc">
          <el-descriptions-item label="模板 ID">{{ setDetail.id }}</el-descriptions-item>
          <el-descriptions-item label="名称">{{ setDetail.name }}</el-descriptions-item>
          <el-descriptions-item label="绑定的服务模板">
            {{ (setDetail.service_template_ids || []).join(', ') || '--' }}
          </el-descriptions-item>
          <el-descriptions-item label="创建人">{{ setDetail.creator || setDetail.bk_created_by || '--' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ (setDetail.create_time || setDetail.bk_created_at || '').replace('T', ' ').slice(0, 19) || '--' }}
          </el-descriptions-item>
          <el-descriptions-item label="最近更新">
            {{ (setDetail.last_time || setDetail.bk_updated_at || '').replace('T', ' ').slice(0, 19) || '--' }}
          </el-descriptions-item>
        </el-descriptions>
        <el-divider>同步状态</el-divider>
        <el-table :data="setDetailStatus" v-loading="setDetailLoading" size="small" border max-height="280">
          <el-table-column prop="bk_module_id" label="模块 ID" width="100" />
          <el-table-column prop="bk_module_name" label="模块名称" min-width="160" />
          <el-table-column label="同步状态" width="120">
            <template #default="{ row }">
              <el-tag v-if="row.status === 'finished'" type="success" size="small">已同步</el-tag>
              <el-tag v-else-if="row.status === 'failure'" type="danger" size="small">失败</el-tag>
              <el-tag v-else type="info" size="small">{{ row.status || '未知' }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>

    <!-- 集群模板同步对话框 -->
    <el-dialog v-model="setSyncDialog" :title="`同步集群模板「${syncTarget?.name}」`" width="540px">
      <el-alert type="info" :closable="false" style="margin-bottom: 12px"
        title="将模板同步到绑定服务模板已部署的模块;异步任务,可到「同步历史」查看进度" />
      <el-form label-width="100px">
        <el-form-item label="模板名称">
          <span>{{ syncTarget?.name }}</span>
        </el-form-item>
        <el-form-item label="目标模块">
          <el-select v-model="syncModuleIds" multiple style="width: 100%" placeholder="留空则同步所有关联模块">
            <el-option v-for="m in syncModules" :key="m.bk_module_id" :label="m.bk_module_name" :value="m.bk_module_id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="setSyncDialog = false">取消</el-button>
        <el-button type="primary" :loading="syncing" @click="doSyncSetTpl">开始同步</el-button>
      </template>
    </el-dialog>

    <!-- 服务模板进程列表 -->
    <el-drawer v-model="tplDrawer" :title="`「${tplDetailName}」进程模板`" size="45%">
      <el-table :data="tplProcesses" v-loading="tplDetailLoading" size="default">
        <el-table-column label="进程名称" min-width="140">
          <template #default="{ row }">{{ row.bk_func_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="端口" width="110">
          <template #default="{ row }">{{ row.port || '-' }}</template>
        </el-table-column>
        <el-table-column label="启动用户" width="110">
          <template #default="{ row }">{{ row.user || '-' }}</template>
        </el-table-column>
        <el-table-column label="工作路径" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.work_path || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEditProcTpl(row)">编辑</el-button>
            <el-button link type="danger" @click="removeProcTpl(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!tplDetailLoading && tplProcesses.length === 0" description="该模板暂无进程" :image-size="80" />
    </el-drawer>

    <!-- 进程模板新增/编辑(共享表单) -->
    <ProcessFormDialog
      :visible="procTplDialog"
      title="进程模板"
      mode="template"
      :form="procTplForm"
      :saving="saving"
      @update:visible="procTplDialog = $event"
      @save="saveProcTpl"
    />

    <!-- 编辑服务模板 -->
    <el-dialog v-model="editDialog" title="编辑服务模板" width="440px">
      <el-form label-width="90px">
        <el-form-item label="模板名称" required>
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="服务分类">
          <el-select v-model="editForm.service_category_id" style="width: 100%">
            <el-option v-for="c in flatCategories" :key="c.category.id" :label="c.category.name" :value="c.category.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEditTpl">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新建服务模板 -->
    <el-dialog v-model="tplFormVisible" title="新建服务模板" width="440px">
      <el-form label-width="90px">
        <el-form-item label="模板名称" required>
          <el-input v-model="tplForm.name" />
        </el-form-item>
        <el-form-item label="服务分类">
          <el-select v-model="tplForm.service_category_id" style="width: 100%">
            <el-option v-for="c in flatCategories" :key="c.category.id" :label="c.category.name" :value="c.category.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tplFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveTpl">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute } from 'vue-router'
import ProcessFormDialog from '../../components/ProcessFormDialog.vue'
import {
  searchBusiness, searchServiceTemplates,
  searchServiceCategories, searchSetTemplates, http,
  getSetTemplateDetail, searchSetTemplateStatus, syncSetTemplateToInstances, searchSetTemplateSyncHistory,
  createProcTemplate, updateProcTemplate, deleteProcTemplate
} from '../../api/cmdb'
import { useBizStore } from '../../stores/biz'

const route = useRoute()
const bizStore = useBizStore()
const bizId = computed(() => bizStore.bizId)
const bizList = computed(() => bizStore.bizList)

const tab = ref(route.meta.tab || 'template')

// 路由切换(服务分类/集群模板同组件)时同步 tab
watch(() => route.meta.tab, (v) => { if (v) tab.value = v })

const templates = ref([])
const tplLoading = ref(false)
const categories = ref([])
const catLoading = ref(false)
const setTemplates = ref([])
const setLoading = ref(false)

const tplDrawer = ref(false)
const tplDetailName = ref('')
const tplDetailLoading = ref(false)
const tplProcesses = ref([])
const tplDetailId = ref(null)

const procTplDialog = ref(false)
const saving = ref(false)
const procTplForm = ref({})
const procTplTarget = ref(null)
const procTplEditing = ref(null) // 编辑中的进程模板原始数据

// 展示行 → 表单对象(模板模式带 __bind_* 编辑字段)
function tplRowToForm(row) {
  return {
    id: row.id,
    bk_func_name: row.bk_func_name === '-' ? '' : row.bk_func_name,
    bk_process_name: row.bk_func_name === '-' ? '' : row.bk_func_name,
    user: row.user === '-' ? '' : row.user,
    work_path: row.work_path === '-' ? '' : row.work_path,
    start_cmd: row.start_cmd || '',
    stop_cmd: row.stop_cmd || '',
    description: row.description || '',
    __bind_port: row.port === '-' ? '' : row.port,
    __bind_ip: row.bindIp || '1',
    __bind_protocol: row.bindProtocol || '1',
    __bind_row_id: row.bindRowId
  }
}

// 编辑 / 克隆服务模板
const editDialog = ref(false)
const editingTpl = ref(null)
const editForm = ref({ name: '', service_category_id: null })

function openEditTpl(row) {
  editingTpl.value = row
  editForm.value = { name: row.name, service_category_id: row.service_category_id || null }
  editDialog.value = true
}

async function saveEditTpl() {
  if (!editForm.value.name) { ElMessage.warning('请输入模板名称'); return }
  saving.value = true
  try {
    await http.put('/update/proc/service_template', {
      bk_biz_id: bizId.value,
      id: editingTpl.value.id,
      name: editForm.value.name,
      service_category_id: editForm.value.service_category_id || 0
    })
    ElMessage.success('已更新')
    editDialog.value = false
    loadTemplates()
  } finally { saving.value = false }
}

async function cloneTpl(row) {
  saving.value = true
  try {
    await http.post('/create/proc/service_template', {
      bk_biz_id: bizId.value,
      name: `${row.name}-copy`,
      service_category_id: row.service_category_id || 0
    })
    ElMessage.success('克隆成功')
    loadTemplates()
  } finally { saving.value = false }
}

// 服务分类(仅作为服务/集群模板表单下拉数据源;UI 已迁移到独立 /business/service-category 页)

async function removeTpl(row) {
  await ElMessageBox.confirm(`确定删除服务模板「${row.name}」?`, '删除确认', { type: 'warning' })
  await http.delete('/delete/proc/service_template', { bk_biz_id: bizId.value, service_template_ids: [row.id] })
  ElMessage.success('已删除')
  loadTemplates()
}

function openAddProcTpl(row) {
  procTplTarget.value = row
  procTplEditing.value = null
  procTplForm.value = tplRowToForm({ bk_func_name: '-', user: '-', work_path: '-', port: '-' })
  procTplForm.value.__bind_row_id = undefined
  procTplDialog.value = true
}

function openEditProcTpl(row) {
  procTplEditing.value = row
  procTplTarget.value = templates.value.find((t) => t.id === row.serviceTemplateId) || { id: row.serviceTemplateId }
  procTplForm.value = tplRowToForm(row)
  procTplDialog.value = true
}

// 组装模板全量 property(该接口为覆盖式更新,必须提交所有字段)
function buildTemplateProperty(form) {
  const prop = {}
  const textFields = ['bk_func_name', 'bk_process_name', 'user', 'work_path', 'start_cmd', 'stop_cmd', 'description']
  for (const f of textFields) {
    prop[f] = { value: form[f] || '', as_default_value: !!form[f] }
  }
  if (form.__bind_port) {
    prop.bind_info = {
      value: [{
        row_id: form.__bind_row_id ?? 1,
        ip: { value: form.__bind_ip || '1', as_default_value: true },
        port: { value: String(form.__bind_port), as_default_value: true },
        protocol: { value: form.__bind_protocol || '1', as_default_value: true },
        enable: { value: true, as_default_value: true }
      }],
      as_default_value: true
    }
  } else {
    prop.bind_info = { value: [], as_default_value: true }
  }
  return prop
}

async function saveProcTpl() {
  if (!procTplForm.value.bk_func_name) {
    ElMessage.warning('请输入进程名称')
    return
  }
  saving.value = true
  try {
    const property = buildTemplateProperty(procTplForm.value)
    if (procTplEditing.value) {
      await updateProcTemplate(bizId.value, procTplEditing.value.id, {
        bk_biz_id: bizId.value,
        process_property: property
      })
      ElMessage.success('进程模板已更新')
    } else {
      await createProcTemplate(bizId.value, {
        service_template_id: procTplTarget.value.id,
        spec: property
      })
      ElMessage.success('进程模板已创建')
    }
    procTplDialog.value = false
    showTplDetail(procTplTarget.value)
  } catch (e) {
    ElMessage.error('进程模板保存失败: ' + (e?.message || '后端异常'))
  } finally {
    saving.value = false
  }
}

async function removeProcTpl(row) {
  await ElMessageBox.confirm(`确定删除进程模板「${row.bk_func_name}」?`, '删除确认', { type: 'warning' })
  try {
    await deleteProcTemplate(bizId.value, row.id)
    ElMessage.success('已删除')
    const target = templates.value.find((t) => t.id === row.serviceTemplateId) || { id: row.serviceTemplateId, name: tplDetailName.value }
    showTplDetail(target)
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}

// ---------- 新建服务模板 ----------
const tplFormVisible = ref(false)
const tplForm = ref({ name: '', service_category_id: null })
const flatCategories = computed(() => {
  const flat = []
  for (const item of categories.value) {
    if (item.category?.name) flat.push(item)
  }
  return flat
})

// 过滤:一级分类 / 二级分类 / 名称
const filterMainCate = ref(null)
const filterSubCate = ref(null)
const filterName = ref('')
const mainCategories = computed(() => categories.value.filter((c) => c.isRoot))
const subCategories = computed(() => {
  if (!filterMainCate.value) return categories.value.filter((c) => !c.isRoot)
  return categories.value.filter((c) => !c.isRoot && c.category?.bk_parent_id === filterMainCate.value)
})
const filteredTemplates = computed(() => {
  let arr = templates.value
  if (filterMainCate.value) arr = arr.filter((t) => t.service_category_id === filterMainCate.value)
  if (filterSubCate.value) arr = arr.filter((t) => t.service_category_id === filterSubCate.value)
  if (filterName.value.trim()) {
    const k = filterName.value.trim().toLowerCase()
    arr = arr.filter((t) => (t.name || '').toLowerCase().includes(k))
  }
  return arr
})
const filteredSetTemplates = computed(() => {
  let arr = setTemplates.value
  if (filterName.value.trim()) {
    const k = filterName.value.trim().toLowerCase()
    arr = arr.filter((t) => (t.name || '').toLowerCase().includes(k))
  }
  return arr
})
function applyTemplateFilter() { /* computed 自动 */ }

async function saveTpl() {
  if (!tplForm.value.name) {
    ElMessage.warning('请输入模板名称')
    return
  }
  saving.value = true
  try {
    await http.post('/create/proc/service_template', {
      bk_biz_id: bizId.value,
      name: tplForm.value.name,
      service_category_id: tplForm.value.service_category_id || 0
    })
    ElMessage.success('服务模板已创建')
    tplFormVisible.value = false
    loadTemplates()
  } finally {
    saving.value = false
  }
}

async function loadTemplates() {
  tplLoading.value = true
  try {
    const data = await searchServiceTemplates(bizId.value, { start: 0, limit: 200 })
    templates.value = data?.info || []
  } finally { tplLoading.value = false }
}

async function loadCategories() {
  catLoading.value = true
  try {
    const data = await searchServiceCategories(bizId.value)
    // 分类接口返回树形(子分类含 sub_categories),展平为一层
    const flat = []
    for (const item of data?.info || []) {
      flat.push({ id: item.category.id, category: item.category, usage_count: item.usage_count, isRoot: true })
      for (const sub of item.sub_categories || []) {
        flat.push({ id: sub.category.id, category: sub.category, usage_count: sub.usage_count, isRoot: false })
      }
    }
    categories.value = flat
  } finally { catLoading.value = false }
}

const setTplDialog = ref(false)
const setTplForm = ref({ name: '', service_template_ids: [] })

async function saveSetTpl() {
  if (!setTplForm.value.name || setTplForm.value.service_template_ids.length === 0) {
    ElMessage.warning('请填写名称并至少绑定一个服务模板')
    return
  }
  saving.value = true
  try {
    await http.post(`/create/topo/set_template/bk_biz_id/${bizId.value}/`, {
      name: setTplForm.value.name,
      service_template_ids: setTplForm.value.service_template_ids
    })
    ElMessage.success('集群模板已创建')
    setTplDialog.value = false
    setTplForm.value = { name: '', service_template_ids: [] }
    loadSetTemplates()
  } finally { saving.value = false }
}

async function removeSetTpl(row) {
  await ElMessageBox.confirm(`确定删除集群模板「${row.name}」?`, '删除确认', { type: 'warning' })
  await http.delete(`/deletemany/topo/set_template/bk_biz_id/${bizId.value}/`, {
    set_template_ids: [row.id]
  })
  ElMessage.success('已删除')
  loadSetTemplates()
}

// ---------- 集群模板 详情 / 同步 / 差异 ----------
const setDetailDrawer = ref(false)
const setDetail = ref(null)
const setDetailStatus = ref([])
const setDetailLoading = ref(false)
const setSyncDialog = ref(false)
const syncTarget = ref(null)
const syncModuleIds = ref([])
const syncModules = ref([])
const syncing = ref(false)

async function openSetTplDetail(row) {
  setDetail.value = row
  setDetailDrawer.value = true
  setDetailLoading.value = true
  try {
    const detail = await getSetTemplateDetail(bizId.value, row.id)
    if (detail) setDetail.value = { ...row, ...detail }
    const statusResp = await searchSetTemplateStatus(bizId.value, {
      bk_biz_id: bizId.value,
      set_template_ids: [row.id]
    }).catch(() => ({}))
    setDetailStatus.value = (statusResp?.info || statusResp?.modules || []).map((m) => ({
      bk_module_id: m.bk_module_id,
      bk_module_name: m.bk_module_name || m.bk_module_id,
      status: m.status
    }))
  } catch (e) {
    setDetailStatus.value = []
  } finally {
    setDetailLoading.value = false
  }
}

async function openSetTplSync(row) {
  syncTarget.value = row
  syncModuleIds.value = []
  syncModules.value = []
  setSyncDialog.value = true
  // 拉已部署的模块作为可选目标
  try {
    const statusResp = await searchSetTemplateStatus(bizId.value, { bk_biz_id: bizId.value, set_template_ids: [row.id] }).catch(() => ({}))
    const list = statusResp?.info || statusResp?.modules || []
    syncModules.value = list.map((m) => ({ bk_module_id: m.bk_module_id, bk_module_name: m.bk_module_name || m.bk_module_id }))
  } catch (e) { /* 容忍 */ }
}

async function doSyncSetTpl() {
  if (!syncTarget.value) return
  syncing.value = true
  try {
    await syncSetTemplateToInstances(bizId.value, syncTarget.value.id, {
      bk_biz_id: bizId.value,
      bk_module_ids: syncModuleIds.value
    })
    ElMessage.success('同步任务已提交,可在「同步历史」查看进度')
    setSyncDialog.value = false
  } catch (e) {
    ElMessage.error('同步失败: ' + (e?.message || '后端异常'))
  } finally {
    syncing.value = false
  }
}

async function loadSetTemplateHistory(row) {
  // 用 alert 简单呈现历史(完整版另开 dialog)
  const data = await searchSetTemplateSyncHistory(bizId.value, {
    bk_biz_id: bizId.value, set_template_ids: [row.id]
  }).catch(() => ({}))
  const list = data?.info || []
  if (!list.length) { ElMessage.info('暂无同步历史'); return }
  const text = list.slice(0, 5).map((h) => `${h.start_time || ''} → ${h.end_time || ''}  ${h.status || ''}  同步 ${h.success_count || 0}/${h.total_count || 0}`).join('\n')
  ElMessageBox.alert(text, `「${row.name}」最近 5 条同步历史`, { type: 'info' })
}

async function loadSetTemplates() {
  setLoading.value = true
  try {
    const data = await searchSetTemplates(bizId.value, { start: 0, limit: 200 })
    setTemplates.value = data?.info || []
  } finally { setLoading.value = false }
}

function loadAll() {
  if (!bizId.value) return
  loadTemplates()
  loadCategories()
  loadSetTemplates()
}

async function showTplDetail(row) {
  tplDetailName.value = row.name
  tplDetailId.value = row.id
  tplDrawer.value = true
  tplDetailLoading.value = true
  try {
    // 进程模板按服务模板维度查询
    const data = await http.post('/findmany/proc/proc_template', {
      bk_biz_id: bizId.value,
      service_template_id: row.id,
      page: { start: 0, limit: 100 }
    })
    tplProcesses.value = (data?.info || []).map((t) => {
      const bind = t.property?.bind_info?.value?.[0]
      return {
        id: t.id,
        serviceTemplateId: t.service_template_id,
        bk_func_name: t.property?.bk_func_name?.value || '-',
        port: bind?.port?.value?.value || bind?.port?.value || '-',
        bindIp: bind?.ip?.value?.value || bind?.ip?.value,
        bindProtocol: bind?.protocol?.value?.value || bind?.protocol?.value,
        bindRowId: bind?.row_id,
        user: t.property?.user?.value || '-',
        work_path: t.property?.work_path?.value || '-',
        start_cmd: t.property?.start_cmd?.value || '',
        stop_cmd: t.property?.stop_cmd?.value || '',
        description: t.property?.description?.value || ''
      }
    })
  } finally { tplDetailLoading.value = false }
}

onMounted(async () => {
  await bizStore.ensureLoaded()
  if (bizId.value) loadAll()
})

watch(bizId, () => { if (bizId.value) loadAll() })
watch(tab, () => { if (bizId.value) loadAll() })
</script>
