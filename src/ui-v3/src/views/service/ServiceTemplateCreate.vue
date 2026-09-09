<template>
  <!-- 旧版 service-template/create.vue + management-form.vue 复刻:三段折叠表单整页 -->
  <div class="create-page">
    <div class="create-main">
      <!-- 基础信息 -->
      <section class="form-group">
        <div class="group-header" @click="collapse.basic = !collapse.basic">
          <i :class="['bk-cmdb-icon icon-cc-triangle group-arrow', { collapsed: collapse.basic }]" />
          <span class="group-title">基础信息</span>
        </div>
        <div v-show="!collapse.basic" class="group-body">
          <div class="form-row">
            <label class="form-label"><span class="req-star">*</span>模板名称：</label>
            <el-input
              v-model.trim="form.name"
              class="name-input"
              placeholder="模板名称将作为实例化后的模块名"
              maxlength="256"
            />
          </div>
          <div class="form-row">
            <label class="form-label"><span class="req-star">*</span>服务分类：</label>
            <div class="category-container">
              <el-select
                v-model="form.primaryCategory"
                placeholder="请选择一级分类"
                filterable
                style="width: 260px"
                @change="onPrimaryChange"
              >
                <el-option v-for="c in primaryCategories" :key="c.id" :label="`${c.name}（#${c.id}）`" :value="c.id" />
              </el-select>
              <el-select
                v-model="form.secCategory"
                placeholder="请选择二级分类"
                filterable
                style="width: 260px"
              >
                <el-option v-for="c in currentSecCategories" :key="c.id" :label="`${c.name}（#${c.id}）`" :value="c.id" />
              </el-select>
            </div>
          </div>
        </div>
      </section>

      <!-- 属性设置 -->
      <section class="form-group">
        <div class="group-header" @click="collapse.property = !collapse.property">
          <i :class="['bk-cmdb-icon icon-cc-triangle group-arrow', { collapsed: collapse.property }]" />
          <span class="group-title">属性设置</span>
        </div>
        <div v-show="!collapse.property" class="group-body">
          <div class="create-container">
            <el-dropdown trigger="click" @command="addProperty">
              <el-button :icon="'Plus'">添加属性字段</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="p in addableProperties"
                    :key="p.id"
                    :command="p.id"
                  >{{ p.bk_property_name }}（{{ p.bk_property_id }}）</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <span class="create-tips">模板里定义的字段，在实例中将不可修改</span>
          </div>
          <el-table v-if="propertyRows.length" :data="propertyRows" class="property-table">
            <el-table-column label="属性名" min-width="200">
              <template #default="{ row }">{{ row.bk_property_name }}</template>
            </el-table-column>
            <el-table-column label="属性值" min-width="280">
              <template #default="{ row }">
                <el-input v-model="row.value" placeholder="请设置属性默认值" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="{ row }">
                <el-button link type="danger" @click="removeProperty(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <!-- 服务进程 -->
      <section class="form-group">
        <div class="group-header" @click="collapse.process = !collapse.process">
          <i :class="['bk-cmdb-icon icon-cc-triangle group-arrow', { collapsed: collapse.process }]" />
          <span class="group-title">服务进程</span>
        </div>
        <div v-show="!collapse.process" class="group-body">
          <div class="create-container">
            <el-button :icon="'Plus'" @click="openProcessForm()">新建进程</el-button>
            <span class="create-tips">模板中第一个进程默认为关键进程，服务实例化后的名称会包含此进程的基本信息</span>
          </div>
          <el-table v-if="processList.length" :data="processList" class="process-table">
            <el-table-column label="进程名称" min-width="160">
              <template #default="{ row }">{{ row.bk_func_name || '--' }}</template>
            </el-table-column>
            <el-table-column label="进程别名" min-width="140">
              <template #default="{ row }">{{ row.bk_process_name || '--' }}</template>
            </el-table-column>
            <el-table-column label="启动用户" width="120">
              <template #default="{ row }">{{ row.user || '--' }}</template>
            </el-table-column>
            <el-table-column label="工作路径" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">{{ row.work_path || '--' }}</template>
            </el-table-column>
            <el-table-column label="端口" width="120">
              <template #default="{ row }">{{ row.port || '--' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="130" fixed="right">
              <template #default="{ row, $index }">
                <el-button link type="primary" @click="openProcessForm(row, $index)">编辑</el-button>
                <el-button link type="danger" @click="removeProcess($index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>
    </div>

    <!-- 底部操作(旧版 sticky footer) -->
    <div class="create-footer">
      <el-button type="primary" :loading="saving" @click="submit">提交</el-button>
      <el-button @click="cancel">取消</el-button>
    </div>

    <!-- 进程表单(复用进程模板动态表单) -->
    <ProcessFormDialog
      :visible="procDialogVisible"
      :title="procEditingIndex === null ? '新建进程' : '编辑进程'"
      mode="template"
      :form="procForm"
      :attrs="processAttrs"
      :saving="saving"
      @update:visible="procDialogVisible = $event"
      @save="saveProcess"
    />

    <!-- 创建成功(旧版 update-alert-layout) -->
    <el-dialog v-model="successVisible" width="480px" :show-close="false">
      <div class="success-body">
        <i class="success-icon bk-cmdb-icon icon-cc-check">✓</i>
        <h3 class="success-title">创建成功</h3>
        <p class="success-next">
          服务模板创建成功，您可以在<el-button link type="primary" @click="goSetTemplate">集群模板</el-button>、<el-button link type="primary" @click="goBusinessTopo">业务拓扑</el-button>中使用该服务模板
        </p>
        <div class="success-btns">
          <el-button type="primary" @click="continueCreate">继续创建</el-button>
          <el-button @click="closeSuccess">关 闭</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import ProcessFormDialog from '../../components/ProcessFormDialog.vue'
import { useBizStore } from '../../stores/biz'
import { searchServiceCategories, searchModelAttributes, http } from '../../api/cmdb'

const route = useRoute()
const router = useRouter()
const bizStore = useBizStore()

const bizId = computed(() => Number(route.params.bizId) || bizStore.bizId)
const cloneId = computed(() => Number(route.query.clone) || null)

const collapse = reactive({ basic: false, property: false, process: false })
const saving = ref(false)
const tipsVisible = ref(true)

const form = ref({ name: '', primaryCategory: null, secCategory: null })
const categories = ref([])
const moduleAttrs = ref([])
const processAttrs = ref([])

// 旧版契约:扁平分类,一级 bk_parent_id=0,二级挂在一级下
const allCategories = ref([])
const primaryCategories = computed(() => allCategories.value.filter((c) => !c.bk_parent_id))
const currentSecCategories = ref([])

function onPrimaryChange(primaryId) {
  currentSecCategories.value = allCategories.value.filter((c) => c.bk_parent_id === primaryId)
  form.value.secCategory = null
}

// ---------- 属性设置 ----------
const propertyRows = ref([])
const addableProperties = computed(() =>
  moduleAttrs.value.filter((p) => p.bk_property_id !== 'bk_module_name' && !propertyRows.value.some((r) => r.id === p.id))
)
function addProperty(id) {
  const prop = moduleAttrs.value.find((p) => p.id === id)
  if (prop) propertyRows.value.push({ id: prop.id, bk_property_name: prop.bk_property_name, bk_property_id: prop.bk_property_id, value: '' })
}
function removeProperty(row) {
  propertyRows.value = propertyRows.value.filter((r) => r.id !== row.id)
}

// ---------- 服务进程(本地编辑,提交时统一组装) ----------
const procDialogVisible = ref(false)
const procEditingIndex = ref(null)
const procForm = ref({})
const processList = ref([])

function openProcessForm(row = null, index = null) {
  procEditingIndex.value = index
  procForm.value = row ? { ...row } : {}
  procDialogVisible.value = true
}
function saveProcess() {
  if (!procForm.value.bk_func_name) {
    ElMessage.warning('请输入进程名称')
    return
  }
  if (procEditingIndex.value === null) processList.value.push({ ...procForm.value })
  else processList.value[procEditingIndex.value] = { ...procForm.value }
  procDialogVisible.value = false
}
function removeProcess(index) {
  processList.value.splice(index, 1)
}

// ---------- 数据加载 ----------
async function loadCategories() {
  const data = await http.post('/findmany/proc/service_category', { bk_biz_id: bizId.value })
  allCategories.value = data?.info || []
  // 默认选中一级/二级分类(旧版 auto-select):优先选有子分类的一级分类
  const primary = primaryCategories.value.find((c) => allCategories.value.some((s) => s.bk_parent_id === c.id))
  if (primary) {
    form.value.primaryCategory = primary.id
    onPrimaryChange(primary.id)
    if (currentSecCategories.value.length) form.value.secCategory = currentSecCategories.value[0].id
  }
}

async function loadClone() {
  if (!cloneId.value) return
  const data = await http.post('/findmany/proc/service_template', {
    bk_biz_id: bizId.value,
    service_category_id: 0,
    search: '',
    page: { start: 0, limit: 500 }
  }).catch(() => null)
  const tpl = (data?.info || []).find((t) => t.id === cloneId.value)
  if (!tpl) return
  form.value.name = tpl.name
  form.value.secCategory = tpl.service_category_id
  const sec = allCategories.value.find((c) => c.id === tpl.service_category_id)
  if (sec) form.value.primaryCategory = sec.bk_parent_id
  const procData = await http.post('/findmany/proc/proc_template', {
    bk_biz_id: bizId.value,
    service_template_id: cloneId.value,
    page: { start: 0, limit: 100 }
  }).catch(() => null)
  processList.value = (procData?.info || []).map((t) => {
    const flat = {}
    for (const [k, v] of Object.entries(t.property || {})) {
      if (v && typeof v === 'object' && 'value' in v) flat[k] = (v.value && typeof v.value === 'object' && 'value' in v.value) ? v.value.value : v.value
      else flat[k] = v
    }
    const bind = t.property?.bind_info?.value?.[0]
    if (bind?.port?.value) flat.__bind_port = String(bind.port.value?.value ?? bind.port.value)
    if (bind?.ip?.value) flat.__bind_ip = String(bind.ip.value?.value ?? bind.ip.value)
    if (bind?.protocol?.value) flat.__bind_protocol = String(bind.protocol.value?.value ?? bind.protocol.value)
    return flat
  })
}

onMounted(async () => {
  await bizStore.ensureLoaded()
  try {
    await loadCategories()
    const [moduleProps, processProps] = await Promise.all([
      searchModelAttributes('module').catch(() => []),
      searchModelAttributes('process').catch(() => [])
    ])
    moduleAttrs.value = moduleProps || []
    processAttrs.value = processProps || []
    await loadClone()
  } catch (e) {
    ElMessage.error('数据加载失败: ' + (e?.message || '后端异常'))
  }
})

// ---------- 提交 ----------
function buildProperty(form) {
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
  // 旧版表单不重复出现进程别名,提交时跟随进程名称
  if (!prop.bk_process_name || prop.bk_process_name.value == null) {
    prop.bk_process_name = { value: form.bk_func_name, as_default_value: true }
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
  }
  return prop
}

const successVisible = ref(false)

async function submit() {
  if (!form.value.name) {
    ElMessage.warning('请输入模板名称')
    collapse.basic = false
    return
  }
  if (!form.value.secCategory) {
    ElMessage.warning('请选择服务分类')
    collapse.basic = false
    return
  }
  if (!processList.value.length) {
    try {
      await ElMessageBox.confirm('服务模板尚未添加进程，没有进程的服务模板无法创建服务实例', '确认提交', {
        type: 'warning',
        confirmButtonText: '确定',
        cancelButtonText: '取消'
      })
    } catch { return }
  }
  saving.value = true
  try {
    // 旧版 all_info 接口:一次创建模板+进程+属性
    await http.post('/create/proc/service_template/all_info', {
      bk_biz_id: bizId.value,
      name: form.value.name,
      service_category_id: form.value.secCategory,
      processes: processList.value.map((p) => ({ property: buildProperty(p) })),
      attributes: propertyRows.value.map((r) => ({ bk_attribute_id: r.id, bk_property_value: r.value || null }))
    })
    successVisible.value = true
  } catch (e) {
    ElMessage.error('创建失败: ' + (e?.message || '后端异常'))
  } finally {
    saving.value = false
  }
}

function backToList() {
  router.push(`/business/${bizId.value}/service/template`)
}

function cancel() {
  backToList()
}

function resetForm() {
  form.value.name = ''
  propertyRows.value = []
  processList.value = []
  loadCategories()
}

function continueCreate() {
  successVisible.value = false
  resetForm()
}

function closeSuccess() {
  successVisible.value = false
  backToList()
}

function goSetTemplate() {
  successVisible.value = false
  router.push(`/business/${bizId.value}/set/template`)
}

function goBusinessTopo() {
  successVisible.value = false
  router.push(`/business/${bizId.value}/index`)
}
</script>

<style scoped>
.create-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #F5F7FA;
  overflow-y: auto;
}
.create-main {
  padding: 15px 20px 0;
}
.form-group {
  background: #fff;
  border-radius: 2px;
  margin-bottom: 16px;
  padding: 0 24px 24px;
}
.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  cursor: pointer;
  user-select: none;
}
.group-arrow {
  font-size: 12px;
  color: #63656E;
  transition: transform .2s;
}
.group-arrow.collapsed {
  transform: rotate(-90deg);
}
.group-title {
  font-size: 14px;
  font-weight: 700;
  color: #313238;
}
.group-body {
  padding: 4px 0 0 24px;
}
.form-row {
  display: flex;
  align-items: flex-start;
  margin-bottom: 24px;
}
.form-label {
  flex: 0 0 120px;
  padding-top: 8px;
  font-size: 14px;
  color: #63656E;
  text-align: right;
  padding-right: 10px;
}
.req-star {
  color: #EA3636;
  margin-right: 4px;
}
.name-input {
  max-width: 560px;
}
.category-container {
  display: flex;
  gap: 24px;
  flex: 1;
}
.create-container {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.create-tips {
  font-size: 12px;
  color: #979BA5;
}
.property-table,
.process-table {
  margin-top: 4px;
}
.create-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 20px;
  background: #fff;
  border-top: 1px solid #DCDEE5;
  margin-top: 8px;
}
.create-footer .el-button {
  min-width: 86px;
}
.success-body {
  text-align: center;
}
.success-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  font-size: 30px;
  font-style: normal;
  color: #fff;
  border-radius: 50%;
  background-color: #2DCB56;
  margin: 8px 0 15px;
}
.success-title {
  font-size: 24px;
  color: #313238;
  font-weight: normal;
  padding-bottom: 16px;
  margin: 0;
}
.success-next {
  padding-bottom: 24px;
  margin: 0;
  font-size: 14px;
  color: #63656E;
}
.success-btns {
  padding-bottom: 20px;
}
.success-btns .el-button {
  min-width: 86px;
}
</style>
