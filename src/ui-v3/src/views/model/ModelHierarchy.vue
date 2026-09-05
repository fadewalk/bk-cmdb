<template>
  <div class="page-card">
    <div class="table-toolbar">
      <span class="hint">模型主线层级(业务 → 集群 → 模块 → 主机),自定义层级会自动出现在树中</span>
    </div>
    <el-tree
      :data="tree"
      :props="{ label: 'name', children: 'children' }"
      default-expand-all
      v-loading="loading"
    >
      <template #default="{ data }">
        <span class="node">
          <el-icon><Folder /></el-icon>
          <span>{{ data.name }}</span>
          <span class="obj-id">{{ data.objId }}</span>
        </span>
      </template>
    </el-tree>
  </div>
</template>

<script setup>
// 业务层级:沿主线关联边(biz -> set -> module -> host)构建模型层级树
import { ref, onMounted } from 'vue'
import { http } from '../../api/cmdb'

const tree = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    // 主线各起点模型的关联边
    const starts = ['biz', 'set', 'module']
    const edges = []
    for (const s of starts) {
      const data = await http.post('/find/objecttopology', { bk_obj_id: s })
      for (const e of data || []) edges.push({ from: e.from?.bk_obj_id, to: e.to?.bk_obj_id, name: e.label })
    }
    const names = {}
    for (const e of edges) {
      names[e.from] = e.from
      names[e.to] = e.to
    }
    const childrenOf = {}
    for (const e of edges) {
      ;(childrenOf[e.from] = childrenOf[e.from] || []).push({
        name: names[e.to] || e.to,
        objId: e.to,
        children: []
      })
    }
    const build = (objId) => ({
      name: names[objId] || objId,
      objId,
      children: (childrenOf[objId] || []).map((c) => build(c.objId))
    })
    tree.value = [build('biz')]
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.hint { color: #979BA5; }
.node { display: flex; align-items: center; gap: 6px; }
.obj-id { color: #979BA5; font-size: 12px; }
</style>
