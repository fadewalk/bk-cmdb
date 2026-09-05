<template>
  <div class="page-card">
    <h1 class="page-title">服务模板</h1>
    <p class="page-tips">服务模板可以预定义业务通用的服务，用于业务拓扑中批量部署和变更服务实例。</p>
    <div class="table-toolbar">
      <el-tabs v-model="tab" style="flex: 1">
        <el-tab-pane label="服务模板" name="template" />
        <el-tab-pane label="服务分类" name="category" />
        <el-tab-pane label="集群模板" name="settpl" />
      </el-tabs>
    </div>

    <!-- 服务模板 -->
    <template v-if="tab === 'template' && bizId">
      <div class="table-toolbar">
        <div class="spacer" />
        <el-button :icon="'Plus'" type="primary" size="small" @click="tplFormVisible = true">新建服务模板</el-button>
      </div>
      <el-table :data="templates" v-loading="tplLoading" stripe>
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
            <el-button link type="primary" @click="showTplDetail(row)">编辑</el-button>
            <el-button link type="primary" @click="openAddProcTpl(row)">克隆</el-button>
            <el-button link type="danger" @click="removeTpl(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!tplLoading && templates.length === 0" description="该业务暂无服务模板" :image-size="80" />
    </template>

    <!-- 服务分类 -->
    <template v-if="tab === 'category' && bizId">
      <div class="category-tree" v-loading="catLoading">
        <div v-for="item in categories" :key="item.id" class="cate-node">
          <div :class="['cate-row', { root: item.isRoot }]">
            <span class="cate-name">{{ item.category.name }}</span>
            <span class="cate-id">#{{ item.category.id }}</span>
            <el-tag v-if="item.isRoot" size="small" type="info">内置</el-tag>
          </div>
        </div>
      </div>
    </template>

    <!-- 集群模板 -->
    <template v-if="tab === 'settpl' && bizId">
      <div class="table-toolbar">
        <el-button size="small" type="primary" :icon="'Plus'">新建</el-button>
      </div>
      <el-table :data="setTemplates" v-loading="setLoading" stripe>
        <el-table-column prop="id" label="模板 ID" width="110" />
        <el-table-column prop="name" label="模板名称" min-width="200" />
        <el-table-column prop="creator" label="创建人" width="130">
          <template #default="{ row }">{{ row.creator || '-' }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!setLoading && setTemplates.length === 0" description="该业务暂无集群模板" :image-size="80" />
    </template>

    <el-empty v-if="!bizId" description="请先选择业务" />

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
  searchServiceCategories, searchSetTemplates, http
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
      await http.put('/update/proc/proc_template', {
        bk_biz_id: bizId.value,
        process_template_id: procTplEditing.value.id,
        process_property: property
      })
      ElMessage.success('进程模板已更新')
    } else {
      await http.post('/createmany/proc/proc_template', {
        bk_biz_id: bizId.value,
        service_template_id: procTplTarget.value.id,
        processes: [{ spec: property }]
      })
      ElMessage.success('进程模板已创建')
    }
    procTplDialog.value = false
    showTplDetail(procTplTarget.value)
  } finally {
    saving.value = false
  }
}

async function removeProcTpl(row) {
  await ElMessageBox.confirm(`确定删除进程模板「${row.bk_func_name}」?`, '删除确认', { type: 'warning' })
  await http.delete('/deletemany/proc/proc_template', {
    bk_biz_id: bizId.value,
    process_templates: [row.id]
  })
  ElMessage.success('已删除')
  const target = templates.value.find((t) => t.id === row.serviceTemplateId) || { id: row.serviceTemplateId, name: tplDetailName.value }
  showTplDetail(target)
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
