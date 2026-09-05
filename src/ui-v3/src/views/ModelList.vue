<template>
  <div class="page-card">
    <div class="table-toolbar">
      <el-input
        v-model="keyword"
        placeholder="按模型 ID / 名称过滤"
        clearable
        style="width: 260px"
      />
      <el-radio-group v-model="onlyCustom">
        <el-radio-button :value="false">全部</el-radio-button>
        <el-radio-button :value="true">自定义模型</el-radio-button>
      </el-radio-group>
      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="load">刷新</el-button>
    </div>

    <el-table :data="filtered" v-loading="loading" stripe>
      <el-table-column prop="bk_obj_id" label="模型 ID" width="180" sortable />
      <el-table-column prop="bk_obj_name" label="模型名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="bk_classification_id" label="所属分类" width="160" />
      <el-table-column label="类型" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.bk_ispre" size="small" type="info">内置</el-tag>
          <el-tag v-else size="small" type="success">自定义</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="showAttrs(row)">查看属性</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-drawer v-model="drawerVisible" :title="`「${current?.bk_obj_name}」模型属性`" size="45%">
      <el-table :data="attrs" v-loading="attrLoading" size="default">
        <el-table-column prop="bk_property_id" label="属性 ID" width="170" />
        <el-table-column prop="bk_property_name" label="属性名称" min-width="150" />
        <el-table-column prop="bk_property_type" label="类型" width="120" />
        <el-table-column label="必填" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.isrequired" size="small" type="danger">是</el-tag>
            <span v-else>否</span>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { searchModels, searchModelAttributes } from '../api/cmdb'

const keyword = ref('')
const onlyCustom = ref(false)
const rows = ref([])
const loading = ref(false)
const drawerVisible = ref(false)
const attrLoading = ref(false)
const attrs = ref([])
const current = ref(null)

const filtered = computed(() =>
  rows.value.filter((r) => {
    if (onlyCustom.value && r.bk_ispre) return false
    if (!keyword.value) return true
    const kw = keyword.value.toLowerCase()
    return (
      (r.bk_obj_id || '').toLowerCase().includes(kw) ||
      (r.bk_obj_name || '').toLowerCase().includes(kw)
    )
  })
)

async function load() {
  loading.value = true
  try {
    const data = await searchModels({})
    rows.value = Array.isArray(data) ? data : data?.info || []
  } finally {
    loading.value = false
  }
}

async function showAttrs(row) {
  current.value = row
  drawerVisible.value = true
  attrLoading.value = true
  try {
    const data = await searchModelAttributes(row.bk_obj_id)
    attrs.value = Array.isArray(data) ? data : data?.info || []
  } finally {
    attrLoading.value = false
  }
}

onMounted(load)
</script>
