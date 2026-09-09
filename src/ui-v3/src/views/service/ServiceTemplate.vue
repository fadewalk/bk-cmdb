<template>
  <div class="page-card">
    <p v-show="tipsVisible" class="page-tips">{{ pageTips }}<i class="bk-cmdb-icon icon-cc-tips-close tips-close" @click="tipsVisible = false" /></p>

    <!-- 服务模板(旧版独立页:新建在左,分类/名称筛选在右,无页内 tab) -->
    <template v-if="tab === 'template' && bizId">
      <div class="table-toolbar filter-bar">
        <el-button type="primary" @click="goCreate">新建</el-button>
        <div class="spacer" />
        <el-select
          v-model="filterMainCate"
          placeholder="所有一级分类"
          clearable
          filterable
          style="width: 184px; margin-right: 10px"
          @change="applyTemplateFilter"
        >
          <el-option v-for="c in mainCategories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-select
          v-model="filterSubCate"
          placeholder="所有二级分类"
          clearable
          filterable
          style="width: 184px; margin-right: 10px"
          @change="applyTemplateFilter"
        >
          <el-option v-for="c in subCategories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-input
          v-model="filterName"
          placeholder="请输入模板名称"
          clearable
          style="width: 210px"
          suffix-icon="Search"
          @input="applyTemplateFilter"
          @clear="applyTemplateFilter"
        />
      </div>
      <el-table
        :data="filteredTemplates"
        v-loading="tplLoading"
        row-class-name="clickable-row"
        @row-click="(row) => showTplDetail(row)"
      >
        <el-table-column prop="id" label="ID" width="90" sortable>
          <template #default="{ row }">
            <span :class="['tpl-id', { 'need-sync': svcSyncIds.has(row.id) }]">{{ row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="模板名称" min-width="180" show-overflow-tooltip sortable />
        <el-table-column label="服务分类" width="180">
          <template #default="{ row }">{{ categoryName(row.service_category_id) }}</template>
        </el-table-column>
        <el-table-column label="进程数量" width="130">
          <template #default="{ row }">
            <span v-if="(row.process_count ?? 0) > 0">{{ row.process_count }}</span>
            <span v-else class="unset-text">{{ row.process_count ?? 0 }}（未配置）</span>
          </template>
        </el-table-column>
        <el-table-column label="已应用模块数" width="120">
          <template #default="{ row }">{{ row.module_count ?? 0 }}</template>
        </el-table-column>
        <el-table-column prop="modifier" label="修改人" width="110" sortable>
          <template #default="{ row }">{{ row.modifier || row.creator || '-' }}</template>
        </el-table-column>
        <el-table-column label="修改时间" width="160" sortable prop="last_time">
          <template #default="{ row }">{{ (row.last_time || '').replace('T', ' ').slice(0, 16) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openEditTpl(row)">编辑</el-button>
            <el-button link type="primary" @click.stop="goCreate(row.id)">克隆</el-button>
            <el-button link type="danger" @click.stop="removeTpl(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :image-size="60" description="暂无数据">
            <div class="empty-sub">您还未创建服务模板，<el-button link type="primary" @click="goCreate">立即创建</el-button></div>
          </el-empty>
        </template>
      </el-table>
    </template>

    <!-- 集群模板(旧版独立页:新建在左,名称搜索在右) -->
    <template v-if="tab === 'settpl' && bizId">
      <div class="table-toolbar filter-bar">
        <el-button type="primary" @click="goSetCreate">新建</el-button>
        <div class="spacer" />
        <el-input
          v-model="filterName"
          placeholder="请输入模板名称"
          clearable
          style="width: 210px"
          suffix-icon="Search"
          @input="applyTemplateFilter"
          @clear="applyTemplateFilter"
        />
      </div>
      <el-table
        :data="filteredSetTemplates"
        v-loading="setLoading"
        row-class-name="clickable-row"
        @row-click="(row) => openSetTplDetail(row)"
      >
        <el-table-column prop="id" label="ID" width="90" sortable>
          <template #default="{ row }">
            <span :class="['tpl-id', { 'need-sync': setSyncIds.has(row.id) }]">{{ row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="模板名称" min-width="200" show-overflow-tooltip sortable />
        <el-table-column prop="apply_count" label="应用数量" width="110" sortable>
          <template #default="{ row }">{{ row.apply_count ?? 0 }}</template>
        </el-table-column>
        <el-table-column prop="modifier" label="修改人" width="130" sortable>
          <template #default="{ row }">{{ row.modifier || row.creator || '--' }}</template>
        </el-table-column>
        <el-table-column label="修改时间" width="170" sortable prop="last_time">
          <template #default="{ row }">{{ (row.last_time || '').replace('T', ' ').slice(0, 19) || '--' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openSetTplDetail(row)">详情</el-button>
            <el-button link type="danger" @click.stop="removeSetTpl(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :image-size="60" description="暂无数据">
            <div class="empty-sub">您还未创建集群模板，<el-button link type="primary" @click="goSetCreate">立即创建</el-button></div>
          </el-empty>
        </template>
      </el-table>

      <el-dialog v-model="setTplDialog" title="新建集群模板" width="480px">
        <el-form label-width="110px">
          <el-form-item label="模板名称" required>
            <el-input v-model="setTplForm.name" placeholder="如:通用中间件集群" />
          </el-form-item>
          <el-form-item label="绑定服务模板" required>
            <el-select v-model="setTplForm.service_template_ids" multiple style="width: 100%" placeholder="选择一个或多个服务模板">
              <el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id" />
            </el-select>
            <div class="hint">若无可选模板,请先到「服务模板」创建</div>
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
        <div class="detail-actions">
          <el-button type="primary" size="small" @click="openSetTplSync(setDetail)">同步</el-button>
          <el-button size="small" @click="loadSetTemplateHistory(setDetail)">同步历史</el-button>
        </div>
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
    <el-drawer v-model="tplDrawer" :title="`「${tplDetailName}」服务模板详情`" size="50%">
      <el-tabs v-model="tplDetailTab">
        <el-tab-pane label="进程配置" name="process" />
        <el-tab-pane label="模块实例" name="instance" />
      </el-tabs>
      <div v-if="tplDetailTab === 'process'" class="drawer-toolbar">
        <span class="drawer-count">共 {{ tplProcesses.length }} 个进程模板</span>
        <el-button type="primary" size="small" :icon="'Plus'" @click="openAddProcTpl({ id: tplDetailId, name: tplDetailName })">新增进程模板</el-button>
      </div>
      <el-table v-if="tplDetailTab === 'process'" :data="tplProcesses" v-loading="tplDetailLoading" size="default">
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

      <!-- 模块实例(对齐老版双 tab + 待同步红点) -->
      <div v-if="tplDetailTab === 'instance'">
        <el-table :data="tplModules" v-loading="tplModuleLoading" size="default">
          <el-table-column label="模块" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="module-cell">
                <i v-if="row.status === 'need_sync'" class="red-dot" />
                {{ row.bk_module_name || `模块 ${row.bk_module_id}` }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="同步状态" width="130">
            <template #default="{ row }">
              <span v-if="row.status === 'need_sync'" class="sync-text need-sync">待同步</span>
              <span v-else-if="row.status === 'syncing'" class="sync-text">同步中</span>
              <span v-else-if="row.status === 'finished'" class="sync-text finished">已同步</span>
              <span v-else-if="row.status === 'failure'" class="sync-text failure">同步失败</span>
              <span v-else class="sync-text">--</span>
            </template>
          </el-table-column>
          <el-table-column label="最近同步" width="170">
            <template #default="{ row }">{{ (row.last_time || '').replace('T', ' ').slice(0, 19) || '--' }}</template>
          </el-table-column>
          <el-table-column label="失败原因" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ row.fail_tips || '--' }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!tplModuleLoading && tplModules.length === 0" description="该模板尚未绑定模块" :image-size="70" />
      </div>
      <el-empty v-if="!tplDetailLoading && tplProcesses.length === 0" description="该模板暂无进程" :image-size="80" />
    </el-drawer>

    <!-- 进程模板新增/编辑(共享表单) -->
    <ProcessFormDialog
      :visible="procTplDialog"
      title="进程模板"
      mode="template"
      :form="procTplForm"
      :attrs="processAttrs"
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
            <el-option v-for="c in leafCategories" :key="c.category.id" :label="c.category.name" :value="c.category.id" />
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
            <el-option v-for="c in leafCategories" :key="c.category.id" :label="c.category.name" :value="c.category.id" />
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
import { useRoute, useRouter } from 'vue-router'
import ProcessFormDialog from '../../components/ProcessFormDialog.vue'
import {
  searchBusiness, searchServiceTemplates,
  searchServiceCategories, searchSetTemplates, http,
  getSetTemplateDetail, searchSetTemplateStatus, syncSetTemplateToInstances, searchSetTemplateSyncHistory,
  createProcTemplate, updateProcTemplate, deleteProcTemplate,
  listModulesByServiceTemplate, getServiceTemplateSyncStatus,
  searchModelAttributes
} from '../../api/cmdb'
import { useBizStore } from '../../stores/biz'

const route = useRoute()
const router = useRouter()
const bizStore = useBizStore()
const bizId = computed(() => bizStore.bizId)
const bizList = computed(() => bizStore.bizList)

const tab = ref(route.meta.tab || 'template')
const tipsVisible = ref(true)
const pageTips = computed(() => tab.value === 'settpl'
  ? '集群模板可以定义业务通用的集群结构，用于业务拓扑中快速部署和维护集群。此功能依赖已经存在服务模板。'
  : '服务模板可以定义业务通用的服务，用于业务拓扑中批量部署和变更服务实例。')

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
const tplDetailTab = ref('process')
const tplModules = ref([])
const tplModuleLoading = ref(false)

const procTplDialog = ref(false)
const saving = ref(false)
const procTplForm = ref({})
const procTplTarget = ref(null)
const procTplEditing = ref(null) // 编辑中的进程模板原始数据

// 进程模型属性(动态渲染进程模板全量字段,对齐老版)
const processAttrs = ref([])

// 展示行 → 表单对象(模板模式带 __bind_* 编辑字段);动态字段从行数据直接拷贝
function tplRowToForm(row) {
  const form = {}
  for (const f of processAttrs.value) {
    const v = row[f.bk_property_id]
    if (f.bk_property_type === 'bool') form[f.bk_property_id] = v === undefined ? false : Boolean(v)
    else form[f.bk_property_id] = v === undefined || v === null ? '' : v
  }
  // 兜底:未加载到属性元数据时至少保留原核心字段
  if (!processAttrs.value.length) {
    Object.assign(form, {
      bk_func_name: row.bk_func_name === '-' ? '' : row.bk_func_name,
      bk_process_name: row.bk_func_name === '-' ? '' : row.bk_func_name,
      user: row.user === '-' ? '' : row.user,
      work_path: row.work_path === '-' ? '' : row.work_path,
      start_cmd: row.start_cmd || '',
      stop_cmd: row.stop_cmd || '',
      description: row.description || ''
    })
  }
  if (form.bk_func_name === '-') form.bk_func_name = ''
  form.__bind_port = row.port === '-' ? '' : row.port
  form.__bind_ip = row.bindIp || '1'
  form.__bind_protocol = row.bindProtocol || '1'
  form.__bind_row_id = row.bindRowId
  return form
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
  await http.delete('/delete/proc/service_template', { data: { bk_biz_id: bizId.value, service_template_id: row.id } })
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
  for (const f of processAttrs.value) {
    if (f.bk_property_id === 'bind_info') continue
    const v = form[f.bk_property_id]
    const hasValue = v !== '' && v !== null && v !== undefined
    prop[f.bk_property_id] = {
      value: hasValue ? v : (f.bk_property_type === 'bool' ? false : null),
      as_default_value: hasValue
    }
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
      await updateProcTemplate(bizId.value, procTplEditing.value.id, property)
      ElMessage.success('进程模板已更新')
    } else {
      await createProcTemplate(bizId.value, procTplTarget.value.id, property)
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
// 后端仅允许叶子分类绑定模板
const leafCategories = computed(() => flatCategories.value.filter((c) => c.isLeaf))

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
    // 旧版契约:扁平列表,父子关系在 bk_parent_id(一级分类 bk_parent_id=0)
    const data = await http.post('/findmany/proc/service_category', { bk_biz_id: bizId.value })
    const flat = (data?.info || []).map((c) => ({
      id: c.id,
      category: c,
      usage_count: c.usage_count,
      isRoot: !c.bk_parent_id,
      isLeaf: !!c.bk_parent_id
    }))
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
    data: { set_template_ids: [row.id] }
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

async function loadAll() {
  if (!bizId.value) return
  await Promise.all([loadTemplates(), loadCategories(), loadSetTemplates()])
  loadSyncStatus()
  loadTemplateCounts()
}

// 旧版 count_info 契约:按模板批量取进程数量/已应用模块数
async function loadTemplateCounts() {
  if (!templates.value.length) return
  const data = await http.post(`/findmany/proc/service_template/count_info/biz/${bizId.value}`, {
    service_template_ids: templates.value.map((r) => r.id)
  }).catch(() => [])
  const byId = new Set()
  for (const item of data || []) {
    byId.add(item.service_template_id)
    const row = templates.value.find((r) => r.id === item.service_template_id)
    if (row) {
      row.process_count = item.process_template_count ?? 0
      row.module_count = item.module_count ?? 0
    }
  }
}

// 列表待同步红点(旧版契约: svc sync_status/biz + set_template_sync_status)
const svcSyncIds = ref(new Set())
const setSyncIds = ref(new Set())
async function loadSyncStatus() {
  if (templates.value.length) {
    const resp = await getServiceTemplateSyncStatus(bizId.value, {
      is_partial: true,
      service_template_ids: templates.value.map((r) => r.id)
    }).catch(() => null)
    svcSyncIds.value = new Set((resp?.service_templates || []).filter((s) => s.need_sync).map((s) => s.service_template_id))
  } else {
    svcSyncIds.value = new Set()
  }
  if (setTemplates.value.length) {
    const resp = await http.post(`/findmany/topo/set_template_sync_status/bk_biz_id/${bizId.value}`, {
      set_template_ids: setTemplates.value.map((r) => r.id)
    }).catch(() => [])
    setSyncIds.value = new Set((resp || []).filter((s) => s.need_sync).map((s) => s.set_template_id))
  } else {
    setSyncIds.value = new Set()
  }
}

function goSetCreate() {
  router.push(`/business/${bizId.value}/set/template/create`)
}

// 旧版新建/克隆跳整页创建(支持 ?clone= 带出模板数据)
function goCreate(cloneId = null) {
  const query = cloneId ? { clone: cloneId } : undefined
  router.push({ path: `/business/${bizId.value}/service/template/create`, query })
}

// 旧版服务分类列显示 "一级 / 二级" 名称
function categoryName(id) {
  const sub = categories.value.find((c) => c.category?.id === id)
  if (!sub) return '--'
  if (!sub.category?.bk_parent_id) return sub.category.name
  const main = categories.value.find((c) => c.category?.id === sub.category.bk_parent_id)
  return `${main ? main.category.name : '--'} / ${sub.category.name}`
}

async function showTplDetail(row) {
  tplDetailName.value = row.name
  tplDetailId.value = row.id
  tplDetailTab.value = 'process'
  tplDrawer.value = true
  loadTplModules()
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
      // 展开全量 property 值(供动态表单编辑),结构化字段仍取 value 层
      const flat = {}
      for (const [k, v] of Object.entries(t.property || {})) {
        if (v && typeof v === 'object' && 'value' in v) flat[k] = (v.value && typeof v.value === 'object' && 'value' in v.value) ? v.value.value : v.value
        else flat[k] = v
      }
      return {
        id: t.id,
        serviceTemplateId: t.service_template_id,
        ...flat,
        bk_func_name: t.property?.bk_func_name?.value || '-',
        bk_process_name: t.property?.bk_process_name?.value || t.property?.bk_func_name?.value || '-',
        port: bind?.port?.value?.value || bind?.port?.value || '-',
        bindIp: bind?.ip?.value?.value || bind?.ip?.value,
        bindProtocol: bind?.protocol?.value?.value || bind?.protocol?.value,
        bindRowId: bind?.row_id,
        user: t.property?.user?.value || '-',
        work_path: t.property?.work_path?.value || '-',
        start_cmd: t.property?.start_cmd?.value || '',
        stop_cmd: t.property?.stop_cmd?.value || '',
        description: t.property?.description?.value || '',
        auto_start: Boolean(t.property?.auto_start?.value),
        property: t.property
      }
    })
  } finally { tplDetailLoading.value = false }
}

async function loadTplModules() {
  if (!tplDetailId.value) return
  tplModuleLoading.value = true
  try {
    const data = await listModulesByServiceTemplate(bizId.value, tplDetailId.value)
    tplModules.value = (data?.info || []).map((m) => ({
      bk_module_id: m.bk_module_id || m.id,
      bk_module_name: m.bk_module_name || m.name,
      status: null, last_time: '', fail_tips: ''
    }))
    // 契约: {bk_module_ids, service_template_id} → [{bk_inst_id,status,last_time,fail_tips}]
    if (tplModules.value.length) {
      const resp = await getServiceTemplateSyncStatus(bizId.value, {
        bk_module_ids: tplModules.value.map((m) => m.bk_module_id),
        service_template_id: tplDetailId.value
      }).catch(() => [])
      for (const st of resp || []) {
        const row = tplModules.value.find((m) => m.bk_module_id === st.bk_inst_id)
        if (row) {
          row.status = st.status
          row.last_time = st.last_time
          row.fail_tips = st.fail_tips
        }
      }
    }
  } catch {
    tplModules.value = []
  } finally { tplModuleLoading.value = false }
}

async function loadProcessAttrs() {
  try {
    processAttrs.value = (await searchModelAttributes('process')) || []
  } catch { processAttrs.value = [] }
}

// ---------- 旧版深链(/business/:bizId/service/template/... 与 set/template、set/sync) ----------
function applyDeepLink() {
  const bizParam = Number(route.query.biz || route.params.bizId)
  if (bizParam && bizStore.bizList.some((b) => b.bk_biz_id === bizParam)) bizStore.select(bizParam)
  // 集群模板 tab 深链: ?action=create|details|history|sync&templateId=
  if (tab.value === 'settpl') {
    applySetTplDeepLink(route.query.action, Number(route.query.templateId))
    return
  }
  const p = route.path
  if (p.endsWith('/create')) {
    tplFormVisible.value = true
    return
  }
  const tid = Number(route.params.templateId)
  if (!tid) return
  const open = () => {
    const row = templates.value.find((t) => t.id === tid)
    if (!row) return false
    if (p.includes('/details/')) showTplDetail(row)
    else if (p.includes('/edit/')) openEditTpl(row)
    return true
  }
  if (!open()) {
    const timer = setInterval(() => { if (open()) clearInterval(timer) }, 400)
    setTimeout(() => clearInterval(timer), 8000)
  }
}

// 集群模板深链定位(action 来自旧版 set/template 与 set/sync 路由重定向)
function applySetTplDeepLink(action, tid) {
  if (action === 'create') {
    setTplDialog.value = true
    return
  }
  if (!tid) return
  const open = () => {
    const row = setTemplates.value.find((t) => t.id === tid)
    if (!row) return false
    if (action === 'details' || action === 'edit') openSetTplDetail(row)
    else if (action === 'history') loadSetTemplateHistory(row)
    else if (action === 'sync') openSetTplSync(row)
    return true
  }
  if (!open()) {
    const timer = setInterval(() => { if (open()) clearInterval(timer) }, 400)
    setTimeout(() => clearInterval(timer), 8000)
  }
}

onMounted(async () => {
  await bizStore.ensureLoaded()
  loadProcessAttrs()
  if (bizId.value) await loadAll()
  applyDeepLink()
})

watch(bizId, () => { if (bizId.value) loadAll() })
watch(() => route.path, () => { if (route.params.bizId || route.path.includes('/service/template/')) applyDeepLink() })
watch(tab, () => { if (bizId.value) loadAll() })
watch(tplDetailTab, (v) => { if (v === 'instance') loadTplModules() })
</script>

<style scoped>
/* 旧版列表 ID 列待同步红点 / 未配置文案 / 行可点击 */
.tpl-id {
  position: relative;
  display: inline-block;
  padding-right: 10px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tpl-id.need-sync::after {
  content: "";
  position: absolute;
  top: -2px;
  right: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #EA3636;
}
.unset-text {
  color: #FF9C01;
}
.filter-bar {
  display: flex;
  align-items: center;
}
.filter-bar .spacer {
  flex: 1;
}
.filter-bar :deep(.el-select),
.filter-bar :deep(.el-input) {
  margin-right: 0;
}
.detail-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.empty-sub {
  font-size: 14px;
  color: #63656E;
}
.tips-close {
  position: absolute;
  right: 8px;
  font-size: 12px;
  color: #979BA5;
  cursor: pointer;
}
.tips-close:hover {
  color: #3A84FF;
}
</style>

<style>
.el-table .clickable-row {
  cursor: pointer;
}
</style>
