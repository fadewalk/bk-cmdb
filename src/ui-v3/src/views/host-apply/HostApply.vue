<template>
  <div class="page-card">
    <h1 class="page-title">主机属性自动应用</h1>
    <div class="table-toolbar">
      <el-select v-model="moduleId" placeholder="选择模块" filterable style="width: 260px" :disabled="!bizId" @change="loadRules">
        <el-option v-for="m in modules" :key="m.id" :label="`${m.set} / ${m.name}`" :value="m.id" />
      </el-select>
      <div class="spacer" />
      <el-button :icon="'Refresh'" :disabled="!moduleId" @click="loadRules">刷新</el-button>
    </div>

    <template v-if="moduleId">
      <el-table :data="rules" v-loading="loading" stripe>
        <el-table-column label="ID" width="80">
          <template #default="{ row }">{{ row.id }}</template>
        </el-table-column>
        <el-table-column label="属性" min-width="180">
          <template #default="{ row }">{{ propName(row.bk_attribute_id) }}</template>
        </el-table-column>
        <el-table-column label="应用的值" min-width="180">
          <template #default="{ row }">{{ row.bk_property_value ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" @click="removeRule(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rules.length === 0" description="该模块暂无自动应用规则" :image-size="80" />
    </template>
    <el-empty v-else-if="bizId" description="请选择模块查看其自动应用规则" />
    <el-empty v-else description="请先选择业务" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  http, getBizTopoTree, getBizInternalTopo, searchModelAttributes
} from '../../api/cmdb'
import { useBizStore } from '../../stores/biz'

const bizStore = useBizStore()
const bizId = computed(() => bizStore.bizId)
const bizList = computed(() => bizStore.bizList)
const moduleId = ref(null)
const modules = ref([])
const rules = ref([])
const loading = ref(false)
const propNames = ref({})

function propName(id) {
  return propNames.value[id] || `属性 #${id}`
}

async function loadModules() {
  moduleId.value = null
  modules.value = []
  if (!bizId.value) return
  const list = []
  const [mainTree, idleTopo] = await Promise.allSettled([getBizTopoTree(bizId.value), getBizInternalTopo(bizId.value)])
  const walk = (node, setName) => {
    if (node.bk_obj_id === 'set') setName = node.bk_inst_name
    if (node.bk_obj_id === 'module') {
      list.push({ id: node.bk_inst_id, name: node.bk_inst_name, set: setName, isIdle: node.default !== 0 })
    }
    for (const c of node.child || []) walk(c, setName)
  }
  if (mainTree.status === 'fulfilled' && Array.isArray(mainTree.value)) {
    for (const bizNode of mainTree.value) for (const c of bizNode.child || []) walk(c, '')
  }
  if (idleTopo.status === 'fulfilled' && idleTopo.value?.bk_set_id) {
    for (const m of idleTopo.value.module || []) {
      list.push({ id: m.bk_module_id, name: m.bk_module_name, set: idleTopo.value.bk_set_name, isIdle: true })
    }
  }
  modules.value = list
}

async function loadRules() {
  if (!moduleId.value) return
  loading.value = true
  try {
    const data = await http.post(`/findmany/host_apply_rule/bk_biz_id/${bizId.value}`, {
      bk_module_ids: [moduleId.value],
      service_template_ids: [],
      page: { start: 0, limit: 100 }
    })
    rules.value = data?.info || []
    // 属性 ID -> 名称映射
    const ids = [...new Set(rules.value.map((r) => r.bk_attribute_id))]
    if (ids.length > 0) {
      const attrs = await searchModelAttributes('host')
      const map = {}
      for (const a of attrs || []) map[a.id] = a.bk_property_name
      propNames.value = map
    }
  } finally {
    loading.value = false
  }
}

async function removeRule(row) {
  await ElMessageBox.confirm(`确定删除自动应用规则 #${row.id}?`, '删除确认', { type: 'warning' })
  await http.post(`/host/deletemany/module/host_apply_rule/bk_biz_id/${bizId.value}`, {
    host_apply_rule_ids: [row.id]
  })
  ElMessage.success('已删除')
  loadRules()
}

watch(bizId, () => { if (bizId.value) loadModules() })

onMounted(async () => {
  const data = await searchBusiness({ start: 0, limit: 200 })
  bizList.value = data?.info || []
  if (bizList.value.length > 0) {
    loadModules()
  }
})
</script>
