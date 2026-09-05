<template>
  <div class="page-card">
    <div class="table-toolbar">
      <el-tabs v-model="tab" style="flex: 1">
        <el-tab-pane label="关联类型" name="types" />
        <el-tab-pane label="模型关联关系" name="relations" />
      </el-tabs>
      <el-button :icon="'Refresh'" @click="load">刷新</el-button>
    </div>

    <!-- 关联类型 -->
    <el-table v-if="tab === 'types'" :data="types" v-loading="loading" stripe>
      <el-table-column prop="bk_asst_id" label="唯一标识" width="160" />
      <el-table-column prop="bk_asst_name" label="名称" width="140" />
      <el-table-column prop="src_des" label="源->目标描述" min-width="160" />
      <el-table-column prop="dest_des" label="目标->源描述" min-width="160" />
      <el-table-column prop="direction" label="方向" width="150">
        <template #default="{ row }">
          <el-tag size="small" v-if="row.direction === 'src_to_dest'">源到目标</el-tag>
          <el-tag size="small" type="warning" v-else-if="row.direction === 'dest_to_src'">目标到源</el-tag>
          <el-tag size="small" type="success" v-else>双向</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="预置" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.ispre" size="small" type="info">内置</el-tag><span v-else>-</span>
        </template>
      </el-table-column>
    </el-table>

    <!-- 模型关联关系 -->
    <el-table v-if="tab === 'relations'" :data="relations" v-loading="relLoading" stripe>
      <el-table-column label="源模型" width="160">
        <template #default="{ row }">{{ modelName(row.bk_obj_id) }}</template>
      </el-table-column>
      <el-table-column label="关联类型" width="140">
        <template #default="{ row }">{{ typeName(row.bk_asst_id) }}</template>
      </el-table-column>
      <el-table-column label="目标模型" width="160">
        <template #default="{ row }">{{ modelName(row.bk_asst_obj_id) }}</template>
      </el-table-column>
      <el-table-column prop="bk_obj_asst_id" label="关联标识" min-width="180" show-overflow-tooltip />
      <el-table-column label="预置" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.ispre" size="small" type="info">内置</el-tag><span v-else>-</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { http, searchModels } from '../../api/cmdb'

const tab = ref('types')
const types = ref([])
const relations = ref([])
const models = ref([])
const loading = ref(false)
const relLoading = ref(false)

const typeNames = { belong: '属于', group: '组成', run: '运行于', cover: '上联', associate: '关联', default: '默认' }
const typeName = (id) => typeNames[id] || id
const modelName = (id) => {
  const m = models.value.find((x) => x.bk_obj_id === id)
  return m ? `${m.bk_obj_name} (${id})` : id
}

async function loadTypes() {
  loading.value = true
  try {
    const data = await http.post('/find/associationtype', { condition: {}, page: { start: 0, limit: 100 } })
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

onMounted(async () => {
  models.value = (await searchModels({})) || []
  loadTypes()
})
</script>
