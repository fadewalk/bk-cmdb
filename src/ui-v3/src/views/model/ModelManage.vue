<template>
  <div class="model-page">
    <h1 class="page-title sr-only">模型管理</h1>
    <div class="model-tips" v-if="tipsVisible">
      <el-icon class="tips-icon"><InfoFilled /></el-icon>
      <span class="tips-text">
        通过模型可以对CMDB中当前的所纳管资源的数据结构进行管理，例如新增了一种设备需要通过记录到CMDB，可以通过新建对应的模型实现。
      </span>
      <el-link type="primary" :underline="false" style="font-size: 12px">更多详情 &gt;&gt;</el-link>
      <el-icon class="tips-close" @click="tipsVisible = false"><Close /></el-icon>
    </div>

    <div class="model-body">
      <div class="toolbar">
        <el-button type="primary" :icon="'Plus'" @click="openCreateModel">新建模型</el-button>
        <el-button :icon="'Plus'" plain @click="clsDialog = true">新建分组</el-button>
        <el-button :icon="'Upload'" @click="importDialog = true">导入</el-button>
        <el-button :icon="'Download'" :disabled="exportSelecting" @click="startExportSelect">导出</el-button>
        <div class="spacer" />
        <el-button :type="statusFilter === 'all' ? 'primary' : 'default'" size="small" @click="statusFilter = 'all'">全部</el-button>
        <el-button :type="statusFilter === 'on' ? 'primary' : 'default'" size="small" @click="statusFilter = 'on'">启用中</el-button>
        <el-button :type="statusFilter === 'off' ? 'primary' : 'default'" size="small" @click="statusFilter = 'off'">已停用</el-button>
        <el-input v-model="keyword" placeholder="请输入关键字" clearable size="small" style="width: 220px" :prefix-icon="'Search'" />
      </div>

      <div class="group-list" v-loading="loading">
        <div v-for="cls in filteredGroups" :key="cls.clsId" class="model-group">
          <div class="group-header">
            <span class="group-name"><el-icon style="margin-right:4px;vertical-align:-2px"><CaretBottom /></el-icon>{{ cls.clsName }} ( {{ cls.models.length }} )</span>
            <el-dropdown
              v-if="!cls.bk_ispre"
              class="group-menu"
              trigger="click"
              size="small"
              @command="(cmd) => onGroupCmd(cmd, cls)"
            >
              <span class="group-more" @click.stop>
                <el-icon><MoreFilled /></el-icon>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="rename">重命名分组</el-dropdown-item>
                  <el-dropdown-item command="delete" divided>删除分组</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          <div class="model-cards">
            <div v-for="(m, mi) in cls.models" :key="m.bk_obj_id" :class="['model-card', { checked: exportSelecting && checkedModels.includes(m.id) }]" @click="goDetail(m)">
              <label v-if="exportSelecting" class="card-check" @click.stop>
                <el-checkbox :model-value="checkedModels.includes(m.id)" :disabled="!!m.bk_ispre" @change="(v) => toggleCheck(m, v)" />
              </label>
              <div class="card-top">
                <span class="model-icon" :style="{ background: iconBg(m), color: iconfg(m) }">
                  <el-icon><component :is="iconName(m)" /></el-icon>
                </span>
                <div class="card-text">
                  <div class="model-name">{{ m.bk_obj_name }}</div>
                  <div class="card-id">{{ m.bk_obj_id }}</div>
                </div>
              </div>
              <div class="card-actions" @click.stop>
                <el-button link type="primary" size="small" @click="openEditModel(m)">编辑</el-button>
                <el-button v-if="!m.bk_ispre" link type="danger" size="small" @click="removeModel(m)">删除</el-button>
              </div>
            </div>
            <div v-if="cls.models.length === 0" class="empty-group">
              <el-icon style="margin-right: 6px"><InfoFilled /></el-icon>
              该分组暂无模型，请
              <el-button link type="primary" size="small" @click="openCreateModel">立即添加</el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 导出选择模式底部操作栏(对齐老版 model-management-footer) -->
      <div v-if="exportSelecting" class="export-action-bar">
        <el-checkbox v-model="exportSelectAll" @change="toggleExportAll">全选</el-checkbox>
        <span class="selected-count">已选：<em>{{ checkedModels.length }}</em></span>
        <div class="spacer" />
        <el-button @click="cancelExportSelect">取消</el-button>
        <el-button type="primary" :disabled="!checkedModels.length" @click="exportDialog = true">下一步</el-button>
      </div>
    </div>

    <el-dialog v-model="modelDialog" :title="editing ? '编辑模型' : '新建模型'" width="480px">
      <el-form :model="modelForm" label-width="90px">
        <el-form-item label="模型 ID" required>
          <el-input v-model="modelForm.bk_obj_id" :disabled="editing" placeholder="英文唯一标识" />
        </el-form-item>
        <el-form-item label="模型名称" required>
          <el-input v-model="modelForm.bk_obj_name" />
        </el-form-item>
        <el-form-item label="所属分组" required>
          <el-select v-model="modelForm.bk_classification_id" style="width: 100%">
            <el-option v-for="c in classifications" :key="c.bk_classification_id"
              :label="c.bk_classification_name" :value="c.bk_classification_id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="modelDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveModel">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="clsDialog" :title="clsDialogTitle" width="440px">
      <el-form label-width="90px">
          <el-form-item label="分组 ID" required v-if="!editingCls">
            <el-input v-model="clsForm.bk_classification_id" placeholder="英文唯一标识" />
          </el-form-item>
          <el-form-item label="分组名称" required>
            <el-input v-model="clsForm.bk_classification_name" />
          </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="clsDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveClassification">保存</el-button>
      </template>
    </el-dialog>

    <!-- 模型导入(对齐老版: 上传 .zip/.yaml 包 → 解析预览 → 导入) -->
    <el-dialog v-model="importDialog" title="导入模型" width="560px" :close-on-click-modal="false">
      <el-alert v-if="importResult" :type="importResult.success ? 'success' : 'error'" :closable="false" style="margin-bottom: 12px"
        :title="importResult.message" />
      <el-upload
        drag
        action=""
        accept=".zip"
        :auto-upload="false"
        :limit="1"
        :on-change="onImportFileChange"
        :file-list="importFileList"
      >
        <el-icon style="font-size: 40px; color: #C4C6CC"><UploadFilled /></el-icon>
        <div class="el-upload__text">将模型包文件拖到此处,或<em>点击上传</em></div>
        <template #tip>
          <div class="el-upload__tip">支持 .zip 格式的模型导出包</div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="importDialog = false">取消</el-button>
        <el-button type="primary" :loading="importing" :disabled="!importFile" @click="doImport">开始导入</el-button>
      </template>
    </el-dialog>

    <!-- 模型导出(选择密码/有效期) -->
    <el-dialog v-model="exportDialog" title="导出模型" width="480px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="已选模型">
          <span>{{ checkedModels.length }} 个</span>
        </el-form-item>
        <el-form-item label="导出文件名">
          <el-input v-model="exportForm.fileName" placeholder="models" />
        </el-form-item>
        <el-form-item label="文件密码">
          <el-input v-model="exportForm.password" placeholder="可选,用于加密导出包" />
        </el-form-item>
        <el-form-item label="密码有效期">
          <el-input-number v-model="exportForm.expiration" :min="0" :max="30" style="width: 160px" />
          <span style="margin-left: 8px; color: #979BA5">天,0 为无限期</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="exportDialog = false">取消</el-button>
        <el-button type="primary" :loading="exporting" @click="doExport">导出</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
// 模型管理列表页:对齐旧版(说明文案 + 工具栏 + 分类分组模型卡片)
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MoreFilled, Search, UploadFilled } from '@element-plus/icons-vue'
import { http } from '../../api/cmdb'
import {
  searchClassificationWithObjects, searchClassifications, createClassification, deleteClassification,
  updateClassification,
  createModel, updateModel, deleteModel
} from '../../api/cmdb'

// ---------- 模型导入/导出(对齐老版 service/model/import-export.js) ----------
const importDialog = ref(false)
const importFile = ref(null)
const importFileList = ref([])
const importing = ref(false)
const importResult = ref(null)
const exportDialog = ref(false)
const exporting = ref(false)
const exportSelecting = ref(false) // 导出选择模式(点「导出」进入,checkbox 才显示)
const exportSelectAll = ref(false)
const checkedModels = ref([]) // 勾选的模型 id(数字 id,导出接口要的是 id 不是 bk_obj_id)
const exportForm = ref({ fileName: 'models', password: '', expiration: 0 })

function startExportSelect() {
  exportSelecting.value = true
  checkedModels.value = []
  exportSelectAll.value = false
}
function cancelExportSelect() {
  exportSelecting.value = false
  checkedModels.value = []
  exportSelectAll.value = false
}
function toggleExportAll(v) {
  if (v) {
    // 全选所有非内置模型(内置模型不允许导出)
    checkedModels.value = groups.value.flatMap((g) => g.models).filter((m) => !m.bk_ispre).map((m) => m.id)
  } else {
    checkedModels.value = []
  }
}

function toggleCheck(m, v) {
  if (v) {
    if (!checkedModels.value.includes(m.id)) checkedModels.value.push(m.id)
  } else {
    checkedModels.value = checkedModels.value.filter((x) => x !== m.id)
  }
}

function onImportFileChange(file, fileList) {
  importFile.value = file.raw
  importFileList.value = fileList
  importResult.value = null
}

async function doImport() {
  if (!importFile.value) return
  importing.value = true
  importResult.value = null
  try {
    // 1. 解析文件(web_server /object/importmany/analysis)
    const analysisForm = new FormData()
    analysisForm.append('file', importFile.value)
    const analysisResp = await http.post('/object/importmany/analysis', analysisForm, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    const analysis = analysisResp?.data || analysisResp
    const objects = analysis?.import_object || analysis?.object || {}
    const assts = analysis?.import_asst || analysis?.asst || {}
    if (!Object.keys(objects).length) {
      importResult.value = { success: false, message: '解析结果为空,请确认文件格式' }
      return
    }
    // 2. 确认导入(web_server /object/importmany)
    await http.post('/object/importmany', { import_object: objects, import_asst: assts })
    importResult.value = { success: true, message: `导入成功,共导入 ${Object.keys(objects).length} 个模型` }
    ElMessage.success('导入成功')
    await load()
  } catch (e) {
    importResult.value = { success: false, message: '导入失败: ' + (e?.message || '后端异常') }
  } finally { importing.value = false }
}

async function exportModels() {
  if (!checkedModels.value.length) return
  exportDialog.value = true
}

async function doExport() {
  exporting.value = true
  try {
    // web_server /object/exportmany 是 POST 下载
    const resp = await fetch('/api/v3/object/exportmany', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bkcmdb-User': 'admin',
        'X-Bkcmdb-Supplier-Account': '0'
      },
      body: JSON.stringify({
        object_id: checkedModels.value,
        excluded_asst_id: [],
        password: exportForm.value.password || '',
        expiration: exportForm.value.expiration || 0,
        file_name: exportForm.value.fileName || 'models'
      })
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const blob = await resp.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${exportForm.value.fileName || 'models'}.zip`
    a.click()
    URL.revokeObjectURL(a.href)
    ElMessage.success('导出成功')
    exportDialog.value = false
    cancelExportSelect()
  } catch (e) {
    ElMessage.error('导出失败: ' + (e?.message || '后端异常'))
  } finally { exporting.value = false }
}

const router = useRouter()
const keyword = ref('')
const statusFilter = ref('all')
const tipsVisible = ref(true)
const loading = ref(false)
const saving = ref(false)
const groups = ref([])
const classifications = ref([])

const modelDialog = ref(false)
const editing = ref(null)
const modelForm = ref({ bk_obj_id: '', bk_obj_name: '', bk_classification_id: '' })
const clsDialog = ref(false)
const clsDialogTitle = ref('新建分组')
const editingCls = ref(null)
const clsForm = ref({ bk_classification_id: '', bk_classification_name: '' })

const filteredGroups = computed(() => {
  return groups.value
    .map((g) => ({
      ...g,
      models: g.models.filter((m) => {
        if (statusFilter.value === 'on' && m.bk_ispre) return false
        if (statusFilter.value === 'off' && !m.bk_ispre) return false
        if (!keyword.value) return true
        const kw = keyword.value.toLowerCase()
        return (
          (m.bk_obj_id || '').toLowerCase().includes(kw) ||
          (m.bk_obj_name || '').toLowerCase().includes(kw)
        )
      })
    }))
})

// 模型图标色板(对齐老版多彩图标)
const PALETTE = [
  { bg: '#EDE1FA', fg: '#8E3EEB', icon: 'Collection' },
  { bg: '#E1ECFF', fg: '#3A84FF', icon: 'Monitor' },
  { bg: '#E7F7EF', fg: '#2DCB56', icon: 'Share' },
  { bg: '#FFF3E1', fg: '#FF9C01', icon: 'OfficeBuilding' },
  { bg: '#E1F7F7', fg: '#14A5A5', icon: 'Connection' },
  { bg: '#FDECF0', fg: '#EA3636', icon: 'Warning' }
]
function iconBg(m) { return PALETTE[hashIconKey(m.bk_obj_id)].bg }
function iconfg(m) { return PALETTE[hashIconKey(m.bk_obj_id)].fg }
function iconName(m) { return PALETTE[hashIconKey(m.bk_obj_id)].icon }
function hashIconKey(key) {
  let h = 0
  for (let i = 0; i < (key || '').length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return Math.abs(h) % PALETTE.length
}

function goDetail(m) {
  router.push({ path: `/model/management/details/${m.bk_obj_id}` })
}

async function load() {
  loading.value = true
  try {
    const [groupData, clsData] = await Promise.all([searchClassificationWithObjects(), searchClassifications()])
    classifications.value = clsData || []
    groups.value = (groupData || []).map((item) => ({
      clsId: item.bk_classification_id,
      clsName: item.bk_classification_name,
      bk_ispre: item.bk_ispre,
      models: item.bk_objects || item.objects || []
    }))
  } finally {
    loading.value = false
  }
}

async function saveModel() {
  saving.value = true
  try {
    if (editing.value) {
      await updateModel(editing.value.id, {
        bk_obj_name: modelForm.value.bk_obj_name,
        bk_classification_id: modelForm.value.bk_classification_id
      })
      ElMessage.success('模型已更新')
    } else {
      await createModel(modelForm.value)
      ElMessage.success('模型已创建')
    }
    modelDialog.value = false
    load()
  } finally {
    saving.value = false
  }
}

function openCreateModel() {
  editing.value = null
  modelForm.value = { bk_obj_id: '', bk_obj_name: '', bk_classification_id: groups.value[0]?.clsId || '' }
  modelDialog.value = true
}

function openEditModel(row) {
  editing.value = row
  modelForm.value = {
    bk_obj_id: row.bk_obj_id,
    bk_obj_name: row.bk_obj_name,
    bk_classification_id: row.bk_classification_id
  }
  modelDialog.value = true
}

async function removeModel(row) {
  await ElMessageBox.confirm(`确定删除模型「${row.bk_obj_name}」?其下字段与实例将被删除`, '删除确认', { type: 'warning' })
  await deleteModel(row.id)
  ElMessage.success('已删除')
  load()
}

function onGroupCmd(cmd, cls) {
  if (cmd === 'rename') {
    editingCls.value = cls
    clsDialogTitle.value = '重命名分组'
    clsForm.value = { bk_classification_id: cls.clsId, bk_classification_name: cls.clsName }
    clsDialog.value = true
  } else if (cmd === 'delete') {
    removeClassification(cls)
  }
}

async function saveClassification() {
  saving.value = true
  try {
    if (editingCls.value) {
      await updateClassification(editingCls.value.clsId, { bk_classification_name: clsForm.value.bk_classification_name })
      ElMessage.success('分组已重命名')
    } else {
      await createClassification(clsForm.value)
      ElMessage.success('分组已创建')
    }
    clsDialog.value = false
    clsForm.value = { bk_classification_id: '', bk_classification_name: '' }
    editingCls.value = null
    load()
  } finally {
    saving.value = false
  }
}

async function removeClassification(cls) {
  await ElMessageBox.confirm(`确定删除分组「${cls.clsName}」?`, '删除确认', { type: 'warning' })
  await deleteClassification(cls.clsId)
  ElMessage.success('已删除')
  load()
}

onMounted(load)
</script>

<style scoped>
.model-page { height: 100%; display: flex; flex-direction: column; background: #fff; overflow-y: auto; }
.page-title {
  font-size: 16px; color: #313238; font-weight: 400;
  padding: 0 20px; height: 50px; line-height: 50px;
  border-bottom: 1px solid #E7E9EF; margin: 0; flex: 0 0 50px;
}
.model-tips {
  margin: 0 20px; margin-top: 12px; padding: 8px 12px;
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: #63656E;
  background: #F0F7FF;
  border: 1px solid #C5DAFF; border-radius: 2px;
}
.tips-icon { color: #3A84FF; }
.tips-text { flex: 1; }
.tips-close { cursor: pointer; color: #979BA5; }
.model-body { padding: 16px 20px; }
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; }
.toolbar .spacer { flex: 1; }
.model-group { margin-bottom: 26px; }
.group-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 8px; border-bottom: 1px solid #E7E9EF; margin-bottom: 12px;
}
.group-name { font-size: 14px; font-weight: 600; color: #313238; }
.group-menu { margin-left: auto; }
.group-more {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 2px; cursor: pointer;
  color: #979BA5; font-size: 16px;
}
.group-more:hover { background: #eaebf0; color: #3a84ff; }
.model-cards { display: flex; flex-wrap: wrap; gap: 12px; }
.model-card {
  width: 236px; padding: 10px 14px;
  border: 1px solid #F0F1F5; border-radius: 4px;
  background: #fff;
  cursor: pointer; position: relative;
  transition: border-color 0.2s;
}
.model-card:hover { border-color: #3A84FF; }
.card-top { display: flex; align-items: center; gap: 10px; }
.card-check {
  position: absolute; left: 10px; top: 10px;
  display: inline-flex; align-items: center;
}
.model-card.checked { border-color: #3A84FF; background: #F0F5FF; }

.export-action-bar {
  position: sticky; bottom: 0;
  display: flex; align-items: center; gap: 16px;
  background: #FAFBFD; border-top: 1px solid #DCDEE5;
  padding: 10px 20px;
}
.export-action-bar .selected-count { color: #63656E; font-size: 13px; }
.export-action-bar .selected-count em { color: #3A84FF; font-style: normal; font-weight: bold; padding: 0 2px; }
.export-action-bar .spacer { flex: 1; }
.model-icon {
  width: 32px; height: 32px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  flex: 0 0 32px;
}
.card-text { min-width: 0; }
.model-name { font-size: 14px; color: #313238; font-weight: 700; line-height: 18px; }
.card-id { font-size: 12px; color: #C4C6CC; line-height: 16px; }
.card-actions { display: none; position: absolute; top: 8px; right: 8px; background: #fff; }
.model-card:hover .card-actions { display: block; }
.empty-group {
  display: flex; align-items: center; justify-content: center;
  width: 100%; padding: 14px 0;
  background: #FAFBFD; border-radius: 2px;
  color: #979BA5; font-size: 12px;
}
</style>
