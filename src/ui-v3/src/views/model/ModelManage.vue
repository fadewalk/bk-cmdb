<template>
  <div class="model-management" :class="{ 'is-model-selectable': isModelSelectable }">
    <div class="model-management-header">
      <div v-if="tipsVisible" class="cmdb-tips model-tips">
        <i class="bk-cmdb-icon icon-cc-exclamation-tips tips-icon" />
        <p class="tips-content">
          通过模型可以对CMDB中当前的所纳管资源的数据结构进行管理，例如新增了一种设备需要通过记录到CMDB，可以通过新建对应的模型实现。
          <a class="more">更多详情 &gt;&gt;</a>
        </p>
        <i class="bk-cmdb-icon icon-cc-tips-close tips-close" @click="tipsVisible = false" />
      </div>

      <div class="model-management-options">
        <div class="model-export-label">请选择需要导出的模型</div>

        <div class="model-operation-options">
          <button class="bk-button bk-primary" :disabled="modelType === 'disabled'" @click="showModelDialog('')">新建模型</button>
          <button class="bk-button" :disabled="modelType === 'disabled'" @click="showGroupDialog(false)">新建分组</button>
          <button class="bk-button" :disabled="modelType === 'disabled'" @click="openImportWizard">导入</button>
          <button class="bk-button" :disabled="modelType === 'disabled'" @click="startExportSelect">导出</button>
        </div>

        <div class="model-type-options">
          <button :class="['bk-button', 'bk-small', 'model-type-button', { 'is-active': modelType === '' }]" @click="modelType = ''">全部</button>
          <button :class="['bk-button', 'bk-small', 'model-type-button', { 'is-active': modelType === 'enable' }]" @click="modelType = 'enable'">启用中</button>
          <el-tooltip content="没有已停用的模型" :disabled="!!disabledClassifications.length" placement="top">
            <span class="type-disabled-span">
              <button
                :class="['bk-button', 'bk-small', 'model-type-button', 'disabled', { 'is-active': modelType === 'disabled' }]"
                :disabled="!disabledClassifications.length"
                @click="modelType = 'disabled'"
              >已停用</button>
            </span>
          </el-tooltip>
        </div>

        <div class="model-search-options">
          <el-input
            v-model="keyword"
            class="legacy-input model-search-input"
            placeholder="请输入关键字"
            clearable
            :suffix-icon="'Search'"
          />
        </div>
      </div>
    </div>

    <div class="model-management-body">
      <ul class="group-list">
        <li v-for="cls in currentClassifications" :key="cls.bk_classification_id" class="group-item">
          <div class="group-header">
            <div
              :class="['collapse-group-title', { 'is-collapse': collapsedState[cls.id] }]"
              :title="isBuiltinClass(cls) ? '内置模型组不支持删除和修改' : ''"
              @click="toggleCollapse(cls)"
            >
              <i class="group-collapse-icon" />
              <p class="group-title-text">{{ cls.bk_classification_name }} ( {{ modelsOf(cls).length }} )</p>
              <el-dropdown trigger="click" placement="bottom-start" @command="(cmd) => onGroupCmd(cmd, cls)">
                <span class="more-operation-btn" @click.stop>
                  <i class="more-dots" />
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="create">新建模型</el-dropdown-item>
                    <template v-if="!isBuiltinClass(cls)">
                      <el-dropdown-item command="edit" divided>编辑分组</el-dropdown-item>
                      <el-dropdown-item command="delete" :disabled="modelsOf(cls).length > 0">
                        删除分组
                      </el-dropdown-item>
                    </template>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <el-checkbox
              v-if="isModelSelectable"
              class="full-selection-checkbox"
              :model-value="!!clsSelectionState[cls.bk_classification_id]"
              :disabled="modelsOf(cls).length === 0"
              @change="onGroupSelectAll(cls, $event)"
            >全选</el-checkbox>
          </div>
          <div
            v-show="!collapsedState[cls.id]"
            class="model-list"
            @dragover.prevent
            @drop="onDropToGroup(cls, $event)"
          >
            <div
              v-for="model in modelsOf(cls)"
              :key="model.bk_obj_id"
              :class="['model-item', { 'is-paused': model.bk_ispaused, 'is-builtin': model.ispre, 'is-dragging': dragObjId === model.bk_obj_id }]"
              :draggable="isModelSelectable ? 'false' : 'true'"
              @dragstart="onDragStart(model, $event)"
              @dragend="onDragEnd"
              @mouseenter="fetchInstanceCount(model.bk_obj_id)"
            >
              <div class="model-info" @click="handleModelClick(model)">
                <div class="drag-icon"><span class="bar" /><span class="bar" /></div>
                <div class="model-icon">
                  <i class="bk-cmdb-icon icon" :class="model.bk_obj_icon || 'icon-cc-default'" />
                </div>
                <div class="model-details">
                  <p class="model-name" :title="model.bk_obj_name">{{ model.bk_obj_name }}</p>
                  <p class="model-id" :title="model.bk_obj_id">{{ model.bk_obj_id }}</p>
                </div>
                <el-checkbox
                  v-if="isModelSelectable"
                  class="model-checkbox"
                  :model-value="!!modelSelectionState[model.bk_obj_id]"
                  :disabled="!!model.ispre"
                  @click.stop
                  @change="onModelCheck(cls, model, $event)"
                />
              </div>
              <div
                v-if="!model.bk_ispaused && !isNoInstanceModel(model.bk_obj_id)"
                class="model-instance-count"
                @click.stop="goInstance(model)"
              >
                <span class="count-number">{{ countText(model.bk_obj_id) }}</span>
              </div>
            </div>
            <div v-if="modelsOf(cls).length === 0" class="group-empty-model">
              <i class="bk-cmdb-icon icon-cc-exclamation-tips" />
              该分组暂无模型，请
              <button class="bk-button bk-text empty-add" @click="showModelDialog(cls.bk_classification_id)">立即添加</button>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <!-- 导出选择模式底部操作栏 -->
    <div v-if="isModelSelectable" class="export-action-bar">
      <el-checkbox v-model="isAllSelected" class="full-selection" @change="toggleAllSelection">全选</el-checkbox>
      <span class="selected-count">已选：<em>{{ exportModelsLen }}</em></span>
      <button class="bk-button cancel-button" @click="cancelExportSelect">取消</button>
      <button class="bk-button bk-primary next-step-button" :disabled="exportModelsLen === 0" @click="openExportWizard">下一步</button>
    </div>

    <!-- 新建/编辑模型弹窗(旧版 _create-model 复刻) -->
    <create-model-dialog
      v-model:is-show="modelDialogShow"
      :title="editingModel ? '编辑模型' : '新建模型'"
      :editing="!!editingModel"
      :group-id="modelDialogGroupId"
      :operating="saving"
      :classifications="dialogClassifications"
      @confirm="saveModel"
    />

    <!-- 新建/编辑分组弹窗(旧版 group-dialog 复刻) -->
    <teleport to="body">
      <transition name="bk-fade">
        <div v-if="clsDialog" class="bk-dialog-mask" @click.self="clsDialog = false">
          <div class="bk-dialog-box group-dialog">
            <div class="dialog-content">
              <p class="dialog-title">{{ editingCls ? '编辑分组' : '新建分组' }}</p>
              <div class="legacy-form-row">
                <span class="label-title">唯一标识</span>
                <span class="color-danger">*</span>
                <el-input
                  v-model.trim="clsForm.bk_classification_id"
                  class="legacy-input row-input"
                  placeholder="请填写英文开头，下划线，数字，英文的组合"
                  :disabled="!!editingCls"
                />
                <i class="bk-cmdb-icon icon-cc-exclamation-tips row-icon" title="请填写英文开头，下划线，数字，英文的组合" />
              </div>
              <div class="legacy-form-row">
                <span class="label-title">名称</span>
                <span class="color-danger">*</span>
                <el-input v-model.trim="clsForm.bk_classification_name" class="legacy-input row-input" placeholder="请输入名称" />
              </div>
            </div>
            <div class="dialog-footer">
              <button class="bk-button bk-primary" :disabled="saving" @click="saveClassification">{{ editingCls ? '保存' : '提交' }}</button>
              <button class="bk-button" :disabled="saving" @click="clsDialog = false">取消</button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- 模型创建成功(旧版 400px 无头弹窗) -->
    <teleport to="body">
      <transition name="bk-fade">
        <div v-if="createdDialog" class="bk-dialog-mask" @click.self="createdDialog = false">
          <div class="bk-dialog-box success-dialog">
            <div class="success-content">
              <i class="success-check" />
              <p>模型创建成功</p>
              <div class="btn-box">
                <button class="bk-button bk-primary" @click="goDetail(createdModel)">配置字段</button>
                <button class="bk-button" @click="createdDialog = false">返回列表</button>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <!-- 导入模型(老版 4 步:用户须知 → 包上传 → 导入编辑器 → 结果) -->
    <el-dialog v-model="importDialog" title="导入模型" width="680px" :close-on-click-modal="false" class="legacy-el-dialog">
      <div class="import-steps">
        <span v-for="(s, i) in ['用户须知', '导入文件', '内容确认', '执行结果']" :key="s"
          :class="['step-item', { 'is-current': importStep === i + 1, 'is-done': importStep > i + 1 }]">
          <i class="step-no">{{ importStep > i + 1 ? '✓' : i + 1 }}</i>{{ s }}
        </span>
      </div>

      <div v-show="importStep === 1" class="import-notice">
        <p class="notice-title">导入模型前请仔细阅读以下内容:</p>
        <ul>
          <li>模型文件支持 .zip 格式的模型导出包,可包含多个模型及其关联关系;</li>
          <li>如导出时设置了文件密码,导入时需要填写对应密码;</li>
          <li>若导入的模型已存在,将按照文件中的定义更新已有模型字段;</li>
          <li>内置模型不支持导入覆盖。</li>
        </ul>
        <div class="step-actions">
          <button class="bk-button bk-primary" @click="importStep = 2">我已了解,下一步</button>
        </div>
      </div>

      <div v-show="importStep === 2">
        <el-upload drag action="" accept=".zip" :auto-upload="false" :limit="1" :on-change="onImportFileChange" :file-list="importFileList">
          <el-icon style="font-size: 40px; color: #C4C6CC"><UploadFilled /></el-icon>
          <div class="el-upload__text">将模型包文件拖到此处,或<em>点击上传</em></div>
          <template #tip><div class="el-upload__tip">支持 .zip 格式的模型导出包</div></template>
        </el-upload>
        <div class="legacy-form-row" style="margin-top: 12px">
          <span class="label-title">文件密码</span>
          <el-input v-model="importPassword" class="legacy-input row-input" placeholder="导出时设置了密码则必填" />
        </div>
        <div class="step-actions">
          <button class="bk-button" @click="importDialog = false">取消</button>
          <button class="bk-button bk-primary" style="margin-left: 10px" :disabled="!importFile" :loading="importing" @click="analyzeImport">下一步</button>
        </div>
      </div>

      <div v-show="importStep === 3">
        <p class="section-hint">请确认需要导入的模型(共解析出 {{ parsedObjects.length }} 个模型,{{ parsedAssts.length }} 种关联关系):</p>
        <el-table :data="parsedObjects" size="small" border max-height="300">
          <el-table-column width="60">
            <template #default="{ row }">
              <el-checkbox v-model="row.__selected" />
            </template>
          </el-table-column>
          <el-table-column prop="bk_obj_id" label="模型标识" min-width="140" />
          <el-table-column prop="bk_obj_name" label="模型名称" min-width="140" />
        </el-table>
        <p v-if="parsedAssts.length" class="section-hint" style="margin-top: 10px">关联关系:{{ parsedAssts.map((a) => a.bk_asst_id || a.name).join('、') }}</p>
        <div class="step-actions">
          <button class="bk-button" @click="importStep = 2">上一步</button>
          <button class="bk-button bk-primary" style="margin-left: 10px" :disabled="importing || !parsedObjects.some((o) => o.__selected)" @click="doImport">确认导入</button>
        </div>
      </div>

      <div v-show="importStep === 4" class="import-notice">
        <p :style="{ color: importResult?.success ? '#2DCB56' : '#EA3636', fontWeight: 'bold' }">
          {{ importResult?.success ? '导入成功' : '导入失败' }}
        </p>
        <p class="section-hint">{{ importResult?.message }}</p>
        <div class="step-actions">
          <button class="bk-button bk-primary" @click="importDialog = false">完成</button>
        </div>
      </div>
    </el-dialog>

    <!-- 导出模型(老版 4 步:已选模型 → 关联关系 → 导出设置 → 下载) -->
    <el-dialog v-model="exportDialog" title="导出模型" width="680px" :close-on-click-modal="false" class="legacy-el-dialog">
      <div class="import-steps">
        <span v-for="(s, i) in ['选择关联关系', '导出设置', '导出结果']" :key="s"
          :class="['step-item', { 'is-current': exportStep === i + 1, 'is-done': exportStep > i + 1 }]">
          <i class="step-no">{{ exportStep > i + 1 ? '✓' : i + 1 }}</i>{{ s }}
        </span>
      </div>

      <div v-show="exportStep === 1">
        <p class="section-hint">已选 {{ exportModelsLen }} 个模型。勾选需要包含在导出包中的模型关联关系(取消勾选的关系不会被导出):</p>
        <el-checkbox-group v-model="exportAsstIds" class="asst-check-group">
          <el-checkbox v-for="a in associationTypes" :key="a.bk_asst_id" :value="a.bk_asst_id">
            {{ a.bk_asst_name || a.bk_asst_id }}({{ a.bk_asst_id }})
          </el-checkbox>
        </el-checkbox-group>
        <div class="step-actions">
          <button class="bk-button" @click="exportDialog = false; cancelExportSelect()">取消导出</button>
          <button class="bk-button bk-primary" style="margin-left: 10px" @click="exportStep = 2">下一步</button>
        </div>
      </div>

      <div v-show="exportStep === 2">
        <div class="export-form">
          <div class="legacy-form-row">
            <span class="label-title">导出文件名</span>
            <el-input v-model="exportForm.fileName" class="legacy-input row-input" placeholder="仅支持英文、数字、下划线、中划线" />
          </div>
          <div class="legacy-form-row">
            <span class="label-title">文件密码</span>
            <el-input v-model="exportForm.password" class="legacy-input row-input" placeholder="可选,用于加密导出包" />
          </div>
          <div class="legacy-form-row">
            <span class="label-title">密码有效期</span>
            <el-input v-model.number="exportForm.expiration" class="legacy-input row-input" placeholder="天,0 为无限期" />
          </div>
        </div>
        <div class="step-actions">
          <button class="bk-button" @click="exportStep = 1">上一步</button>
          <button class="bk-button bk-primary" style="margin-left: 10px" :disabled="exporting" @click="doExport">导出</button>
        </div>
      </div>

      <div v-show="exportStep === 3" class="import-notice">
        <p style="color: #2DCB56; font-weight: bold">导出成功</p>
        <p class="section-hint">文件已下载到本地。如设置了密码,导入时需提供该密码。</p>
        <div class="step-actions">
          <button class="bk-button bk-primary" @click="exportDialog = false; cancelExportSelect()">完成</button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
// 模型管理列表页:按旧版 src/ui/src/views/model-manage 像素级复刻
// (工具栏/分组折叠/卡片网格/实例数悬浮/导出选择模式/拖拽换组/新建模型图标弹窗)
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MoreFilled, UploadFilled } from '@element-plus/icons-vue'
import {
  searchClassificationWithObjects, searchClassifications, createClassification,
  updateClassification, deleteClassification,
  createModel, updateModel, countInstances, searchAssociationTypes
} from '../../api/cmdb'
import CreateModelDialog from '../../components/model/CreateModelDialog.vue'

const router = useRouter()
const tipsVisible = ref(true)
const loadingDone = ref(false)
const saving = ref(false)

const rawGroups = ref([]) // find/classificationobject 原始数据
const dialogClassifications = ref([]) // find/objectclassification(弹窗下拉)

// 顶部筛选
const modelType = ref('')
const keyword = ref('')

// 分组折叠(以分类自增 id 为键,与旧版一致)
const collapsedState = ref({})

// 实例数缓存(hover 时按需拉取)
const statMap = ref({})

// 导出选择模式
const isModelSelectable = ref(false)
const clsSelectionState = ref({})
const modelSelectionState = ref({})
const isAllSelected = ref(false)

// ---------- 导入(老版 4 步向导) ----------
const importDialog = ref(false)
const importFile = ref(null)
const importFileList = ref([])
const importing = ref(false)
const importResult = ref(null)
const importStep = ref(1)
const importPassword = ref('')
const parsedObjects = ref([])
const parsedAssts = ref([])

// ---------- 导出(老版向导:选择模式 → 关联关系 → 设置 → 下载) ----------
const exportDialog = ref(false)
const exporting = ref(false)
const exportForm = ref({ fileName: 'models', password: '', expiration: 0 })
const exportStep = ref(1)
const exportAsstIds = ref([])
const associationTypes = ref([])

// 弹窗
const modelDialogShow = ref(false)
const modelDialogGroupId = ref('')
const editingModel = ref(null)
const clsDialog = ref(false)
const editingCls = ref(null)
const clsForm = ref({ bk_classification_id: '', bk_classification_name: '' })
const createdDialog = ref(false)
const createdModel = ref(null)

// 拖拽换组
const dragObjId = ref(null)

// ---------- 数据整形(旧版 allClassifications:过滤隐藏 + 停用排后 + 未分类最后) ----------
const allClassifications = computed(() => rawGroups.value
  .filter((cls) => !cls.bk_ishidden)
  .map((cls) => ({
    ...cls,
    models: (cls.bk_objects || [])
      .filter((m) => !m.bk_ishidden)
      .sort((a, b) => (a.bk_ispaused ? 1 : 0) - (b.bk_ispaused ? 1 : 0))
  })))

const enableClassifications = computed(() => allClassifications.value
  .map((cls) => ({ ...cls, models: cls.models.filter((m) => !m.bk_ispaused) }))
  .filter((cls) => cls.models.length))

const disabledClassifications = computed(() => allClassifications.value
  .map((cls) => ({ ...cls, models: cls.models.filter((m) => m.bk_ispaused) }))
  .filter((cls) => cls.models.length))

const currentClassifications = computed(() => {
  let list = allClassifications.value
  if (modelType.value === 'enable') list = enableClassifications.value
  else if (modelType.value === 'disabled') list = disabledClassifications.value
  if (keyword.value) {
    const kw = keyword.value.toLowerCase()
    list = list
      .map((cls) => ({
        ...cls,
        models: cls.models.filter((m) =>
          (m.bk_obj_name || '').toLowerCase().includes(kw) || (m.bk_obj_id || '').toLowerCase().includes(kw))
      }))
      .filter((cls) => cls.models.length)
  }
  // 未分类(none)固定最后,与旧版一致
  return [...list].sort((a, b) => (b.bk_classification_id === 'none' ? -1 : 0))
})

function modelsOf(cls) {
  return currentClassifications.value.find((c) => c.bk_classification_id === cls.bk_classification_id)?.models
    ?? cls.models ?? []
}

function isBuiltinClass(cls) {
  return cls.bk_classification_type === 'inner' || !!cls.bk_ispre
}
function isNoInstanceModel(objId) {
  return ['set', 'module'].includes(objId)
}

// ---------- 实例数(hover 拉取) ----------
async function fetchInstanceCount(objId) {
  if (statMap.value[objId] !== undefined) return
  statMap.value[objId] = null
  try {
    const data = await countInstances(objId, {})
    statMap.value[objId] = data?.count ?? 0
  } catch { statMap.value[objId] = '--' }
}
function countText(objId) {
  const v = statMap.value[objId]
  if (v === null || v === undefined) return '...'
  if (v === '--') return '--'
  return v > 999 ? '999+' : v
}

// ---------- 加载 ----------
async function load() {
  const [groupData, clsData] = await Promise.all([
    searchClassificationWithObjects(),
    searchClassifications().catch(() => [])
  ])
  rawGroups.value = groupData || []
  dialogClassifications.value = (clsData?.info || clsData || []).filter((c) => !c.bk_ishidden)
  loadingDone.value = true
}

// ---------- 交互 ----------
function toggleCollapse(cls) {
  collapsedState.value[cls.id] = !collapsedState.value[cls.id]
}
function handleModelClick(model) {
  if (isModelSelectable.value) {
    modelSelectionState.value[model.bk_obj_id] = !modelSelectionState.value[model.bk_obj_id] && !model.ispre
    syncGroupSelection()
  } else {
    router.push({ path: `/model/management/details/${model.bk_obj_id}` })
  }
}
function goDetail(model) {
  createdDialog.value = false
  router.push({ path: `/model/management/details/${model.bk_obj_id}` })
}
function goInstance(model) {
  if (model.bk_obj_id === 'host') router.push({ path: '/resource/host', query: { scope: 'all' } })
  else if (model.bk_obj_id === 'biz') router.push({ path: '/resource/business' })
  else router.push({ path: `/resource/instance/${model.bk_obj_id}` })
}

// ---------- 导出选择(旧版导出第一步,提交动作见下方 openExportWizard) ----------
function onGroupSelectAll(cls, checked) {
  clsSelectionState.value[cls.bk_classification_id] = checked
  modelsOf(cls).forEach((m) => {
    modelSelectionState.value[m.bk_obj_id] = checked && !m.ispre
  })
  syncAllSelection()
}
function onModelCheck(cls, model, checked) {
  modelSelectionState.value[model.bk_obj_id] = checked && !model.ispre
  const models = modelsOf(cls)
  clsSelectionState.value[cls.bk_classification_id] = models.length > 0 && models.every((m) => modelSelectionState.value[m.bk_obj_id])
  syncAllSelection()
}
function syncGroupSelection() {
  currentClassifications.value.forEach((cls) => {
    clsSelectionState.value[cls.bk_classification_id] =
      modelsOf(cls).length > 0 && modelsOf(cls).every((m) => modelSelectionState.value[m.bk_obj_id])
  })
  syncAllSelection()
}
function syncAllSelection() {
  isAllSelected.value = currentClassifications.value.length > 0
    && currentClassifications.value.every((cls) => clsSelectionState.value[cls.bk_classification_id])
}
function toggleAllSelection(checked) {
  currentClassifications.value.forEach((cls) => {
    clsSelectionState.value[cls.bk_classification_id] = modelsOf(cls).length > 0 && checked
    modelsOf(cls).forEach((m) => {
      modelSelectionState.value[m.bk_obj_id] = checked && !m.ispre
    })
  })
}
const exportModelsLen = computed(() =>
  Object.values(modelSelectionState.value).filter(Boolean).length)

// ---------- 导入/导出(老版向导契约) ----------
function onImportFileChange(file, fileList) {
  importFile.value = file.raw
  importFileList.value = fileList
  importResult.value = null
}

function openImportWizard() {
  importStep.value = 1
  importFile.value = null
  importFileList.value = []
  importPassword.value = ''
  parsedObjects.value = []
  parsedAssts.value = []
  importResult.value = null
  importDialog.value = true
}

function startExportSelect() {
  isModelSelectable.value = true
  clsSelectionState.value = {}
  modelSelectionState.value = {}
  isAllSelected.value = false
}
function cancelExportSelect() {
  isModelSelectable.value = false
  clsSelectionState.value = {}
  modelSelectionState.value = {}
  isAllSelected.value = false
}

// 下一步进入关联关系选择(老版导出编辑器步骤)
async function openExportWizard() {
  exportStep.value = 1
  exportAsstIds.value = []
  exportForm.value = { fileName: 'models', password: '', expiration: 0 }
  try {
    const res = await searchAssociationTypes({})
    associationTypes.value = res?.info || []
    // 老版默认全选(不排除任何关联)
    exportAsstIds.value = associationTypes.value.map((a) => a.bk_asst_id)
  } catch { associationTypes.value = [] }
  exportDialog.value = true
}

// 解析模型包(老版 /object/importmany/analysis,multipart file + params{password})
async function analyzeImport() {
  if (!importFile.value) return
  importing.value = true
  try {
    const form = new FormData()
    form.append('file', importFile.value)
    if (importPassword.value) form.append('params', JSON.stringify({ password: importPassword.value }))
    const resp = await fetch('/object/importmany/analysis', {
      method: 'POST',
      headers: { 'X-Bkcmdb-User': 'admin', 'X-Bkcmdb-Supplier-Account': '0' },
      body: form
    })
    const res = await resp.json()
    if (res.result === false && res.bk_error_code !== 0) {
      throw new Error(res.bk_error_msg || '解析失败')
    }
    const data = res?.data || {}
    parsedObjects.value = (data.import_object || []).map((o) => ({ ...o, __selected: true }))
    parsedAssts.value = data.import_asst || []
    if (!parsedObjects.value.length) {
      ElMessage.warning('解析结果为空,请确认文件格式')
      return
    }
    importStep.value = 3
  } catch (e) {
    ElMessage.error('解析失败: ' + (e?.message || '后端异常'))
  } finally { importing.value = false }
}

// 提交导入(老版 /object/importmany {import_object, import_asst})
async function doImport() {
  const selected = parsedObjects.value.filter((o) => o.__selected)
  if (!selected.length) return
  importing.value = true
  try {
    const resp = await fetch('/object/importmany', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bkcmdb-User': 'admin',
        'X-Bkcmdb-Supplier-Account': '0'
      },
      body: JSON.stringify({ import_object: selected, import_asst: parsedAssts.value })
    })
    const res = await resp.json().catch(() => ({}))
    if (res.result === false) throw new Error(res.bk_error_msg || '导入失败')
    importResult.value = { success: true, message: `已提交导入 ${selected.length} 个模型` }
    ElMessage.success('导入成功')
    await load()
  } catch (e) {
    importResult.value = { success: false, message: e?.message || '后端异常' }
  } finally {
    importing.value = false
    importStep.value = 4
  }
}

async function doExport() {
  // 老版契约:object_id 传模型数字 id(非 bk_obj_id);file_name 仅限英文/数字/下划线/中划线
  const selectedIds = Object.entries(modelSelectionState.value)
    .filter(([, v]) => v)
    .map(([objId]) => {
      for (const cls of rawGroups.value) {
        const hit = (cls.bk_objects || []).find((m) => m.bk_obj_id === objId)
        if (hit) return hit.id
      }
      return null
    })
    .filter(Boolean)
  if (!selectedIds.length) { ElMessage.warning('未选中任何模型'); return }
  const fileName = (exportForm.value.fileName || 'models').trim()
  if (!/^[a-zA-Z0-9_-]+$/.test(fileName)) {
    ElMessage.error('文件名仅支持英文、数字、下划线、中划线')
    return
  }
  exporting.value = true
  try {
    const excluded = associationTypes.value
      .map((a) => a.bk_asst_id)
      .filter((id) => !exportAsstIds.value.includes(id))
    const resp = await fetch('/object/exportmany', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bkcmdb-User': 'admin',
        'X-Bkcmdb-Supplier-Account': '0'
      },
      body: JSON.stringify({
        object_id: selectedIds,
        excluded_asst_id: excluded,
        password: exportForm.value.password || '',
        expiration: exportForm.value.expiration || 0,
        file_name: fileName
      })
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const blob = await resp.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${fileName}.zip`
    a.click()
    URL.revokeObjectURL(a.href)
    exportStep.value = 3
  } catch (e) {
    ElMessage.error('导出失败: ' + (e?.message || '后端异常'))
  } finally { exporting.value = false }
}

// ---------- 新建/编辑模型 ----------
function showModelDialog(groupId) {
  editingModel.value = null
  modelDialogGroupId.value = groupId || ''
  modelDialogShow.value = true
}
async function saveModel(data) {
  saving.value = true
  try {
    if (editingModel.value) {
      await updateModel(editingModel.value.id, {
        bk_obj_name: data.bk_obj_name,
        bk_obj_icon: data.bk_obj_icon,
        bk_classification_id: data.bk_classification_id
      })
      ElMessage.success('修改成功')
    } else {
      const created = await createModel(data)
      createdModel.value = created || { ...data }
      createdDialog.value = true
    }
    modelDialogShow.value = false
    modelDialogGroupId.value = ''
    keyword.value = ''
    await load()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}

// ---------- 分组 ----------
function onGroupCmd(cmd, cls) {
  if (cmd === 'create') showModelDialog(cls.bk_classification_id)
  else if (cmd === 'edit') showGroupDialog(true, cls)
  else if (cmd === 'delete') removeClassification(cls)
}
function showGroupDialog(isEdit, cls) {
  if (isEdit) {
    editingCls.value = cls
    clsForm.value = {
      bk_classification_id: cls.bk_classification_id,
      bk_classification_name: cls.bk_classification_name
    }
  } else {
    editingCls.value = null
    clsForm.value = { bk_classification_id: '', bk_classification_name: '' }
  }
  clsDialog.value = true
}
async function saveClassification() {
  if (!clsForm.value.bk_classification_id || !clsForm.value.bk_classification_name) return
  if (!editingCls.value && !/^[A-Za-z][A-Za-z0-9_]*$/.test(clsForm.value.bk_classification_id)) {
    ElMessage.warning('请填写英文开头，下划线，数字，英文的组合')
    return
  }
  saving.value = true
  try {
    if (editingCls.value) {
      await updateClassification(editingCls.value.bk_classification_id, {
        bk_classification_name: clsForm.value.bk_classification_name
      })
      ElMessage.success('编辑成功')
    } else {
      await createClassification(clsForm.value)
      ElMessage.success('新建成功')
    }
    clsDialog.value = false
    keyword.value = ''
    await load()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}
async function removeClassification(cls) {
  if (modelsOf(cls).length) {
    ElMessage.warning('分组下有模型，不能删除')
    return
  }
  try {
    await ElMessageBox.confirm('确认要删除此分组？', '删除分组', { type: 'warning' })
  } catch { return }
  try {
    // 后端按自增 id 删除;分组数据里带 id 字段
    await deleteClassification(cls.id ?? cls.bk_classification_id)
    ElMessage.success('删除成功')
    keyword.value = ''
    await load()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}

// ---------- 拖拽换组(旧版 vuedraggable) ----------
function onDragStart(model, evt) {
  if (isModelSelectable.value || model.ispre) {
    evt.preventDefault()
    return
  }
  dragObjId.value = model.bk_obj_id
  evt.dataTransfer.effectAllowed = 'move'
  evt.dataTransfer.setData('text/plain', model.bk_obj_id)
}
function onDragEnd() {
  dragObjId.value = null
}
async function onDropToGroup(cls, evt) {
  const objId = evt.dataTransfer.getData('text/plain')
  dragObjId.value = null
  if (!objId) return
  const model = allClassifications.value.flatMap((c) => c.models).find((m) => m.bk_obj_id === objId)
  if (!model || model.bk_classification_id === cls.bk_classification_id) return
  try {
    await updateModel(model.id, { bk_classification_id: cls.bk_classification_id })
    ElMessage.success('修改成功')
    await load()
  } catch (e) {
    ElMessage.error('移动失败: ' + (e?.message || '后端异常'))
  }
}

onMounted(load)
</script>

<style scoped>
.model-management {
  height: 100%;
  background-color: #fafbfd;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.model-management-header {
  flex: 0 0 auto;
  padding: 15px 24px 20px;
  background-color: #fafbfd;
}
.model-tips {
  margin-bottom: 10px;
}
.model-management-options {
  display: flex;
  align-items: center;
  height: 32px;
}
.model-operation-options {
  display: flex;
}
.model-operation-options .bk-button {
  margin-right: 10px;
}
.is-model-selectable .model-operation-options {
  display: none;
}
.model-export-label {
  display: none;
  font-size: 14px;
  font-weight: 600;
  color: #313238;
}
.is-model-selectable .model-export-label {
  display: block;
}
.model-type-options {
  margin-left: auto;
  display: flex;
}
.is-model-selectable .model-type-options {
  display: none;
}
.model-type-button {
  position: relative;
  margin: 0;
  border-radius: 0;
}
.model-type-button:first-child {
  border-radius: 2px 0 0 2px;
}
.model-type-button + .model-type-button {
  border-radius: 0;
  margin-left: -1px;
}
.model-type-button.last-child,
.type-disabled-span .model-type-button {
  border-radius: 0 2px 2px 0;
}
.model-type-button:hover:not(:disabled),
.model-type-button.is-active {
  border-color: #3a84ff;
  color: #3a84ff;
  position: relative;
  z-index: 2;
}
.type-disabled-span {
  display: inline-block;
  outline: 0;
}
.model-search-options {
  margin-left: 10px;
  width: 240px;
}
.is-model-selectable .model-search-options {
  margin-left: auto;
}
.model-search-input {
  width: 240px;
}

.model-management-body {
  flex: 1;
  overflow-y: auto;
}
.is-model-selectable .model-management-body {
  margin-bottom: 50px;
}
.group-list {
  padding: 0 24px 25px;
  list-style: none;
  margin: 0;
}
.group-item + .group-item {
  margin-top: 20px;
}

/* 分组标题(旧版 collapse-group-title) */
.group-header {
  display: flex;
  align-items: center;
  color: #313238;
  font-size: 14px;
}
.collapse-group-title {
  display: flex;
  align-items: center;
  height: 26px;
  border-radius: 2px;
  cursor: pointer;
  user-select: none;
  padding-right: 2px;
}
.collapse-group-title:hover {
  background-color: #f0f1f5;
}
.group-collapse-icon {
  margin: 0 8px 0 4px;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid #63656e;
  transition: transform 200ms ease;
}
.collapse-group-title.is-collapse .group-collapse-icon {
  transform: rotate(-90deg);
}
.group-title-text {
  max-width: 300px;
  margin-right: 5px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.more-operation-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  border-radius: 2px;
}
.more-dots {
  width: 3px;
  height: 13px;
  background-image: radial-gradient(circle, #979ba5 1px, transparent 1.2px);
  background-size: 3px 5px;
  background-position: center;
  background-repeat: repeat-y;
}
.more-operation-btn:hover {
  background-color: #eaebf0;
  color: #3a84ff;
}
.full-selection-checkbox {
  margin-left: auto;
}

/* 模型卡片网格(旧版 grid minmax(256px,1fr)) */
.model-list {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(256px, 1fr));
  width: 100%;
  align-content: flex-start;
  margin-top: 6px;
}
.model-item {
  display: flex;
  height: 60px;
  background-color: #fff;
  border-radius: 2px;
  box-shadow: 0 2px 4px 0 rgba(25, 25, 41, .05);
  cursor: pointer;
  overflow: hidden;
}
.model-item:hover {
  transition: all 200ms ease;
  box-shadow: 0 2px 4px 0 rgba(25, 25, 41, .05), 0 2px 4px 0 rgba(0, 0, 0, .1);
}
.model-item.is-paused {
  opacity: .4;
}
.model-item.is-dragging {
  opacity: .5;
}
.model-info {
  flex: 1;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  border-radius: 2px 0 0 2px;
}
.model-info:hover {
  background-color: #eff5ff;
}
.drag-icon {
  flex-shrink: 0;
  visibility: hidden;
  margin-left: 5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.drag-icon .bar {
  width: 3px;
  height: 10px;
  background-image: radial-gradient(circle, #c4c6cc 1px, transparent 1.2px);
  background-size: 3px 4px;
}
.model-item:hover .drag-icon {
  visibility: visible;
}
.model-icon {
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  margin-left: 5px;
  line-height: 40px;
  text-align: center;
  border-radius: 50%;
  background-color: #e1ecff;
  transition: background-color 200ms ease;
}
.model-icon .icon {
  color: #3a84ff;
  font-size: 16px;
  vertical-align: 1px;
}
.model-item.is-builtin .model-icon {
  background-color: #f5f7fa;
}
.model-item.is-builtin .model-icon .icon {
  color: #798aad;
}
.model-item.is-builtin:hover .model-icon {
  background-color: #fff;
}
.model-details {
  margin: 0 10px;
  overflow: hidden;
  min-width: 0;
}
.model-name {
  line-height: 19px;
  font-size: 14px;
  margin: 0;
  color: #313238;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.model-id {
  line-height: 16px;
  font-size: 12px;
  color: #bfc7d2;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.model-checkbox {
  flex: 0 0 auto;
  margin: auto 10px auto auto;
}
.model-instance-count {
  display: none;
  flex: 0 0 60px;
  width: 60px;
  height: 60px;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  border-radius: 0 2px 2px 0;
  color: #3a84ff;
}
.model-instance-count:hover {
  background-color: #eff5ff;
}
.model-item:hover .model-instance-count {
  display: flex;
}
.count-number {
  font-size: 14px;
}

.group-empty-model {
  grid-column: 1 / -1;
  width: 100%;
  height: 60px;
  line-height: 60px;
  background-color: #fff;
  font-size: 14px;
  color: #63656e;
  border: 1px dashed #dcdee5;
  text-align: center;
  vertical-align: middle;
  margin-top: 12px;
}
.group-empty-model .bk-cmdb-icon {
  margin-right: 4px;
  color: #979ba5;
}
.empty-add {
  font-size: 14px;
}

/* 导出底栏(旧版 export-action-bar 50px) */
.export-action-bar {
  flex: 0 0 50px;
  display: flex;
  align-items: center;
  background: #fff;
  border-top: 1px solid #e2e2e2;
  font-size: 14px;
}
.export-action-bar .full-selection {
  margin-left: 24px;
}
.export-action-bar .selected-count {
  margin-left: auto;
  margin-right: 33px;
  color: #63656e;
}
.export-action-bar .selected-count em {
  font-weight: 600;
  font-style: normal;
}
.export-action-bar .cancel-button {
  width: 86px;
  margin-right: 10px;
}
.export-action-bar .next-step-button {
  margin-right: 24px;
  width: 120px;
}

/* 弹窗(bk-dialog 复刻) */
.bk-dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .6);
  z-index: 3000;
}
.bk-dialog-box {
  position: absolute;
  left: 50%;
  top: 20vh;
  transform: translateX(-50%);
  width: 600px;
  background: #fff;
  border-radius: 2px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, .2);
}
.success-dialog {
  width: 400px;
}
.bk-fade-enter-active,
.bk-fade-leave-active {
  transition: opacity .18s ease;
}
.bk-fade-enter-from,
.bk-fade-leave-to {
  opacity: 0;
}
.dialog-content {
  padding: 20px 15px 20px 28px;
}
.dialog-title {
  font-size: 20px;
  color: #333948;
  line-height: 1;
  padding-bottom: 14px;
  margin: 0;
}
.row-input {
  vertical-align: middle;
  width: 519px;
  max-width: 100%;
}
.export-form .row-input {
  width: calc(100% - 105px);
}
.dialog-footer {
  padding: 12px 24px;
  text-align: right;
  font-size: 0;
  border-top: 1px solid #dcdee5;
  background: #fafbfd;
  border-radius: 0 0 2px 2px;
}
.dialog-footer .bk-primary {
  margin-right: 10px;
}
.success-content {
  text-align: center;
  padding: 40px 20px 46px;
}
.success-content p {
  color: #444;
  font-size: 24px;
  padding: 10px 0 20px;
  margin: 0;
}
.success-check {
  display: inline-block;
  position: relative;
  width: 58px;
  height: 58px;
  background: #2dcb56;
  border-radius: 50%;
}
.success-check::before {
  content: '';
  position: absolute;
  left: 17px;
  top: 22px;
  width: 26px;
  height: 13px;
  border-bottom: 5px solid #fff;
  border-left: 5px solid #fff;
  transform: rotate(-45deg);
}
.success-content .btn-box {
  font-size: 0;
}
.success-content .btn-box .bk-button {
  margin: 0 5px;
}

/* 导入/导出向导(老版 step-pane 复刻) */
.import-steps {
  display: flex;
  justify-content: center;
  gap: 32px;
  padding: 4px 0 20px;
  border-bottom: 1px solid #DCDEE5;
  margin-bottom: 20px;
}
.step-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #979BA5;
}
.step-item.is-current { color: #3A84FF; font-weight: bold; }
.step-item.is-done { color: #63656E; }
.step-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 12px;
  font-style: normal;
}
.step-item.is-current .step-no { background: #3A84FF; border-color: #3A84FF; color: #fff; }
.step-actions { margin-top: 20px; text-align: right; }
.import-notice ul { margin: 8px 0 0; padding-left: 20px; }
.import-notice li { line-height: 26px; color: #63656E; font-size: 13px; }
.notice-title { font-weight: bold; color: #313238; }
.section-hint { color: #63656E; font-size: 13px; margin: 0 0 10px; }
.asst-check-group { display: flex; flex-wrap: wrap; gap: 8px 20px; padding: 4px 0; }
</style>
