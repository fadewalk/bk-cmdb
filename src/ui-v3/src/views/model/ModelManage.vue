<template>
  <div class="model-page">
    <h1 class="page-title">模型管理</h1>
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
        <el-button :icon="'Upload'">导入</el-button>
        <el-button :icon="'Download'">导出</el-button>
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
            <el-button
              v-if="!cls.bk_ispre" link type="danger" size="small"
              @click="removeClassification(cls)"
            >删除分组</el-button>
          </div>
          <div class="model-cards">
            <div v-for="(m, mi) in cls.models" :key="m.bk_obj_id" class="model-card" @click="goDetail(m)">
              <div class="card-top">
                <span class="model-icon" :style="{ background: iconBg(mi), color: iconFg(mi) }">
                  <el-icon><component :is="iconName(mi)" /></el-icon>
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

    <el-dialog v-model="clsDialog" title="新建分组" width="440px">
      <el-form label-width="90px">
        <el-form-item label="分组 ID" required>
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
  </div>
</template>

<script setup>
// 模型管理列表页:对齐旧版(说明文案 + 工具栏 + 分类分组模型卡片)
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchClassificationWithObjects, searchClassifications, createClassification, deleteClassification,
  createModel, updateModel, deleteModel
} from '../../api/cmdb'

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
function iconBg(i) { return PALETTE[i % PALETTE.length].bg }
function iconFg(i) { return PALETTE[i % PALETTE.length].fg }
function iconName(i) { return PALETTE[i % PALETTE.length].icon }

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

async function saveClassification() {
  saving.value = true
  try {
    await createClassification(clsForm.value)
    ElMessage.success('分组已创建')
    clsDialog.value = false
    clsForm.value = { bk_classification_id: '', bk_classification_name: '' }
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
