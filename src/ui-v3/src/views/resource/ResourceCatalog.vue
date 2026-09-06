<template>
  <div class="page-card">
    <h1 class="page-title sr-only">{{ modelName }} - 资源目录</h1>
    <p class="page-tips">
      已选中分类 <strong>{{ objId }}</strong>。独立部署模式默认未启用通用实例查询接口;此处展示模型的实例总数与属性元数据,作为路由跳转目标。
    </p>

    <div class="rc-toolbar">
      <el-button :icon="'Refresh'" @click="load">刷新</el-button>
      <div class="spacer" />
      <span v-if="model" class="rc-stat">实例数: <strong>{{ model.instCount ?? '--' }}</strong></span>
    </div>

    <el-card v-if="model" shadow="never" class="rc-info">
      <el-descriptions :column="2" border size="default">
        <el-descriptions-item label="模型 ID">{{ model.bk_obj_id }}</el-descriptions-item>
        <el-descriptions-item label="模型名称">{{ model.bk_obj_name }}</el-descriptions-item>
        <el-descriptions-item label="分类">{{ model.bk_classification_id || '--' }}</el-descriptions-item>
        <el-descriptions-item label="实例数">{{ model.instCount ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="预置">{{ model.ispre ? '是' : '否' }}</el-descriptions-item>
        <el-descriptions-item label="最近更新人">{{ model.bk_updated_by || '--' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never" class="rc-attrs">
      <template #header>属性列表 ({{ attrs.length }})</template>
      <el-table :data="attrs" v-loading="loading" stripe size="default">
        <el-table-column prop="bk_property_id" label="字段 ID" min-width="200" />
        <el-table-column prop="bk_property_name" label="字段名" min-width="180" />
        <el-table-column prop="bk_property_type" label="类型" width="140" />
        <el-table-column label="必填" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.isrequired" type="danger" size="small">是</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="bk_property_group" label="分组" min-width="140" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { searchModels, searchModelAttributes, getModelStatistics } from '../../api/cmdb'

const route = useRoute()
const objId = computed(() => String(route.params.objId || ''))
const model = ref(null)
const attrs = ref([])
const loading = ref(false)
const modelName = computed(() => model.value?.bk_obj_name || objId.value || '资源目录')

const humanLabel = {
  bk_switch: '交换机', bk_router: '路由器', bk_load_balance: '负载均衡',
  bk_firewall: '防火墙', bk_cloud_area: '管控区域', bk_cloud_account: '云账户'
}

async function load() {
  if (!objId.value) return
  loading.value = true
  try {
    const [all, attrsData, stats] = await Promise.all([
      searchModels({ condition: { bk_obj_id: objId.value } }),
      searchModelAttributes(objId.value).catch(() => []),
      getModelStatistics().catch(() => [])
    ])
    const m = (all || [])[0] || { bk_obj_id: objId.value, bk_obj_name: humanLabel[objId.value] || objId.value }
    const st = (stats || []).find((s) => s.bk_obj_id === objId.value)
    m.instCount = st ? st.instance_count : 0
    model.value = m
    attrs.value = attrsData || []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.page-title { font-size: 16px; color: #313238; font-weight: 400; padding: 0 20px; height: 50px; line-height: 50px; border-bottom: 1px solid #E7E9EF; margin: 0; }
.page-tips { margin: 0; padding: 10px 20px; font-size: 12px; color: #979BA5; background: #F0F5FF; border-bottom: 1px solid #E7E9EF; }
.rc-toolbar { display: flex; align-items: center; gap: 8px; margin: 16px 0; }
.rc-toolbar .spacer { flex: 1; }
.rc-stat { font-size: 13px; color: #63656E; }
.rc-info, .rc-attrs { margin-bottom: 16px; border-radius: 2px; }
.rc-attrs { margin-top: 16px; }
</style>