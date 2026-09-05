<template>
  <div class="page-card">
    <el-tabs v-model="tab">
      <el-tab-pane v-for="m in mainLine" :key="m" :label="modelName(m)" :name="m" />
    </el-tabs>

    <el-table :data="attrs" v-loading="loading" stripe>
      <el-table-column prop="bk_property_id" label="字段 ID" width="180" />
      <el-table-column prop="bk_property_name" label="字段名称" min-width="160" />
      <el-table-column prop="bk_property_type" label="类型" width="110" />
      <el-table-column label="必填" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.isrequired" size="small" type="danger">是</el-tag><span v-else>否</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && attrs.length === 0" description="该模型暂无自定义字段(在模型管理中添加)" :image-size="80" />
  </div>
</template>

<script setup>
// 自定义字段:按主线模型分 Tab 展示用户自建字段,与旧版 custom-fields 页一致
import { ref, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { searchModels, searchModelAttributes, deleteModelAttribute } from '../../api/cmdb'

const mainLine = ['biz', 'set', 'module', 'host', 'process']
const names = { biz: '业务', set: '集群', module: '模块', host: '主机', process: '进程' }
const modelName = (id) => names[id] || id

const tab = ref('set')
const attrs = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await searchModelAttributes(tab.value)
    attrs.value = (data || []).filter((a) => !a.ispre)
  } finally {
    loading.value = false
  }
}

async function remove(row) {
  await ElMessageBox.confirm(`确定删除字段「${row.bk_property_name}」?`, '删除确认', { type: 'warning' })
  await deleteModelAttribute(row.id)
  ElMessage.success('已删除')
  load()
}

watch(tab, load)
onMounted(load)
</script>
