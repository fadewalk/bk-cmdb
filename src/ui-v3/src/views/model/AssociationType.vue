<template>
  <div class="page-card">
    <div class="table-toolbar">
      <span class="title">关联类型(模型关联关系的基础定义)</span>
      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="load">刷新</el-button>
    </div>

    <el-table :data="rows" v-loading="loading" stripe>
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { searchAssociationTypes } from '../../api/cmdb'

const rows = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await searchAssociationTypes()
    rows.value = data?.info || []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.title { font-weight: 600; }
</style>
