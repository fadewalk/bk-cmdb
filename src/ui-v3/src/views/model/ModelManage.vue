<template>
  <div class="model-page">
    <h1 class="page-title">模型管理</h1>
    <p class="model-tips">
      通过模型可以对CMDB中当前的所纳管资源的数据结构进行管理，例如新增了一种设备需要通过记录到CMDB，可以通过新建对应的模型实现。
    </p>

    <div class="model-body">
      <div class="toolbar">
        <el-button type="primary" :icon="'Plus'" @click="openCreateModel">新建模型</el-button>
        <el-button :icon="'Plus'" plain @click="clsDialog = true">新建分组</el-button>
        <el-button :icon="'Upload'">导入</el-button>
        <el-button :icon="'Download'">导出</el-button>
        <div class="spacer" />
        <el-radio-group v-model="statusFilter" size="small">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="on">启用中</el-radio-button>
          <el-radio-button value="off">已停用</el-radio-button>
        </el-radio-group>
        <el-input v-model="keyword" placeholder="请输入关键字" clearable size="small" style="width: 220px" :prefix-icon="'Search'" />
      </div>

      <div class="group-list" v-loading="loading">
        <div v-for="cls in filteredGroups" :key="cls.clsId" class="model-group">
          <div class="group-header">
            <span class="group-name">{{ cls.clsName }} ( {{ cls.models.length }} )</span>
            <el-button
              v-if="!cls.bk_ispre" link type="danger" size="small"
              @click="removeClassification(cls)"
            >删除分组</el-button>
          </div>
          <div class="model-cards">
            <div v-for="m in cls.models" :key="m.bk_obj_id" class="model-card" @click="goDetail(m)">
              <div class="card-top">
                <span class="model-icon"><el-icon><Grid /></el-icon></span>
                <span class="model-name">{{ m.bk_obj_name }}</span>
              </div>
              <div class="card-id">{{ m.bk_obj_id }}</div>
              <div class="card-actions" @click.stop>
                <el-button link type="primary" size="small" @click="openEditModel(m)">编辑</el-button>
                <el-button v-if="!m.bk_ispre" link type="danger" size="small" @click="removeModel(m)">删除</el-button>
              </div>
            </div>
            <div v-if="cls.models.length === 0" class="empty-group">
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
      models: item.objects || []
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
  margin: 0; padding: 10px 20px;
  font-size: 12px; color: #979BA5;
  background: #F0F5FF;
  border-bottom: 1px solid #E7E9EF;
}
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
  width: 200px; padding: 12px;
  border: 1px solid #DCDEE5; border-radius: 2px;
  cursor: pointer; position: relative;
  transition: box-shadow 0.2s;
}
.model-card:hover { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); border-color: #3A84FF; }
.card-top { display: flex; align-items: center; gap: 8px; }
.model-icon {
  width: 30px; height: 30px; border-radius: 4px;
  background: #E1ECFF; color: #3A84FF;
  display: flex; align-items: center; justify-content: center;
}
.model-name { font-size: 14px; color: #313238; font-weight: 500; }
.card-id { margin-top: 8px; font-size: 12px; color: #979BA5; }
.card-actions { display: none; position: absolute; top: 8px; right: 8px; background: #fff; }
.model-card:hover .card-actions { display: block; }
.empty-group { color: #979BA5; font-size: 12px; padding: 8px 0; }
</style>
