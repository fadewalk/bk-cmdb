<template>
  <div class="page-card">
    <h1 class="page-title sr-only">{{ tab === 'relations' ? '模型关联关系' : '关联类型' }}</h1>
    <div class="table-toolbar">
      <el-tabs v-model="tab" style="flex: 1">
        <el-tab-pane label="关联类型" name="types" />
        <el-tab-pane label="模型关联关系" name="relations" />
      </el-tabs>
      <el-button v-if="tab === 'types'" type="primary" :icon="'Plus'" size="small" @click="openDialog()">新建关联类型</el-button>
      <el-button :icon="'Refresh'" size="small" @click="load">刷新</el-button>
    </div>

    <!-- 关联类型 -->
    <el-table v-if="tab === 'types'" :data="types" v-loading="loading" stripe>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="bk_asst_id" label="唯一标识" width="140" />
      <el-table-column prop="bk_asst_name" label="名称" width="140" />
      <el-table-column prop="src_des" label="源→目标描述" min-width="160" show-overflow-tooltip />
      <el-table-column prop="dest_des" label="目标→源描述" min-width="160" show-overflow-tooltip />
      <el-table-column prop="direction" label="方向" width="140">
        <template #default="{ row }">
          <el-tag v-if="row.direction === 'src_to_dest'" size="small">源→目标</el-tag>
          <el-tag v-else-if="row.direction === 'dest_to_src'" size="small" type="warning">目标→源</el-tag>
          <el-tag v-else size="small" type="success">双向</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="预置" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.ispre" size="small" type="info">内置</el-tag><span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openDialog(row)">编辑</el-button>
          <el-button link type="danger" size="small" :disabled="row.ispre" @click="removeType(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && tab === 'types' && types.length === 0" description="暂无关联类型" :image-size="80" />

    <!-- 模型关联关系 -->
    <el-table v-if="tab === 'relations'" :data="relations" v-loading="relLoading" stripe>
      <el-table-column label="源模型" width="180">
        <template #default="{ row }">{{ modelName(row.bk_obj_id) }}</template>
      </el-table-column>
      <el-table-column label="关联类型" width="160">
        <template #default="{ row }">{{ typeName(row.bk_asst_id) }}</template>
      </el-table-column>
      <el-table-column label="目标模型" width="180">
        <template #default="{ row }">{{ modelName(row.bk_asst_obj_id) }}</template>
      </el-table-column>
      <el-table-column prop="bk_obj_asst_id" label="关联标识" min-width="200" show-overflow-tooltip />
      <el-table-column label="预置" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.ispre" size="small" type="info">内置</el-tag><span v-else>-</span>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!relLoading && tab === 'relations' && relations.length === 0" description="暂无关联关系" :image-size="80" />

    <!-- 新建/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑关联类型' : '新建关联类型'" width="520px">
      <el-form label-width="100px">
        <el-form-item label="唯一标识" required>
          <el-input v-model="form.bk_asst_id" :disabled="!!form.id" placeholder="英文唯一,如 belong" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.bk_asst_name" placeholder="如:属于" />
        </el-form-item>
        <el-form-item label="源→目标描述">
          <el-input v-model="form.src_des" placeholder="如:从属于" />
        </el-form-item>
        <el-form-item label="目标→源描述">
          <el-input v-model="form.dest_des" placeholder="如:包含" />
        </el-form-item>
        <el-form-item label="方向" required>
          <el-select v-model="form.direction" style="width: 100%">
            <el-option label="双向 bi_direction" value="bi_direction" />
            <el-option label="源→目标 src_to_dest" value="src_to_dest" />
            <el-option label="目标→源 dest_to_src" value="dest_to_src" />
            <el-option label="单向 none" value="none" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitType">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  http, searchModels, searchAssociationTypes,
  createAssociationType, updateAssociationType, deleteAssociationType
} from '../../api/cmdb'

const route = useRoute()
const tab = ref(route.meta.tab || 'types')
const types = ref([])
const relations = ref([])
const models = ref([])
const loading = ref(false)
const relLoading = ref(false)

const dialogVisible = ref(false)
const saving = ref(false)
const form = ref({
  id: null, bk_asst_id: '', bk_asst_name: '', src_des: '', dest_des: '', direction: 'bi_direction'
})

const typeNames = { belong: '属于', group: '组成', run: '运行于', cover: '上联', associate: '关联', default: '默认' }
const typeName = (id) => typeNames[id] || id
const modelName = (id) => {
  const m = models.value.find((x) => x.bk_obj_id === id)
  return m ? `${m.bk_obj_name} (${id})` : id
}

async function loadTypes() {
  loading.value = true
  try {
    const data = await searchAssociationTypes()
    types.value = data?.info || []
  } finally { loading.value = false }
}

async function loadRelations() {
  relLoading.value = true
  try {
    const data = await http.post('/find/objectassociation', {
      condition: { bk_obj_id: { $in: models.value.map((m) => m.bk_obj_id) } }
    })
    relations.value = Array.isArray(data) ? data : []
  } finally { relLoading.value = false }
}

function load() {
  loadTypes()
  if (tab.value === 'relations') loadRelations()
}

function openDialog(row) {
  if (row) {
    form.value = {
      id: row.id,
      bk_asst_id: row.bk_asst_id,
      bk_asst_name: row.bk_asst_name,
      src_des: row.src_des || '',
      dest_des: row.dest_des || '',
      direction: row.direction || 'bi_direction'
    }
  } else {
    form.value = { id: null, bk_asst_id: '', bk_asst_name: '', src_des: '', dest_des: '', direction: 'bi_direction' }
  }
  dialogVisible.value = true
}

async function submitType() {
  if (!form.value.bk_asst_id || !form.value.bk_asst_name) {
    ElMessage.warning('请填写唯一标识与名称')
    return
  }
  saving.value = true
  try {
    const payload = {
      bk_asst_id: form.value.bk_asst_id,
      bk_asst_name: form.value.bk_asst_name,
      src_des: form.value.src_des,
      dest_des: form.value.dest_des,
      direction: form.value.direction
    }
    if (form.value.id) {
      await updateAssociationType(form.value.id, payload)
      ElMessage.success('关联类型已更新')
    } else {
      await createAssociationType(payload)
      ElMessage.success('关联类型已创建')
    }
    dialogVisible.value = false
    loadTypes()
  } finally { saving.value = false }
}

async function removeType(row) {
  await ElMessageBox.confirm(`确定删除关联类型「${row.bk_asst_name || row.bk_asst_id}」?`, '删除确认', { type: 'warning' })
  await deleteAssociationType(row.id)
  ElMessage.success('已删除')
  loadTypes()
}

onMounted(async () => {
  models.value = (await searchModels({})) || []
  loadTypes()
})
</script>

<style scoped>
.page-title { font-size: 16px; color: #313238; font-weight: 400; padding: 0 20px; height: 50px; line-height: 50px; border-bottom: 1px solid #E7E9EF; margin: 0; }
.table-toolbar { display: flex; align-items: center; gap: 8px; padding: 12px 20px; }
.table-toolbar :deep(.el-tabs__header) { margin-bottom: 0; }
</style>