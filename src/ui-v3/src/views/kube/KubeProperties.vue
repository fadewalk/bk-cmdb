<template>
  <el-card shadow="never" class="property-card">
    <template #header><span>{{ object === 'container' ? 'Container属性' : 'Pod属性' }}</span></template>
    <el-descriptions v-if="rows.length" :column="2" border size="small">
      <el-descriptions-item v-for="row in rows" :key="row.field" :label="row.label">
        <span class="property-value" :title="formatKubeValue(detail?.[row.field])">{{ formatKubeValue(detail?.[row.field]) }}</span>
      </el-descriptions-item>
    </el-descriptions>
    <el-empty v-else description="暂无属性" :image-size="70" />
  </el-card>
</template>

<script setup>
import { computed } from 'vue'
import { formatKubeValue, kubePropertyLabel, normalizeKubeAttributes } from '../../utils/kube-detail'

const props = defineProps({
  object: { type: String, default: 'pod' },
  detail: { type: Object, default: () => ({}) },
  attributes: { type: Array, default: () => [] }
})
const rows = computed(() => {
  const attrs = normalizeKubeAttributes(props.attributes, props.object)
  const fields = attrs.length ? attrs : Object.keys(props.detail || {}).map((field) => ({ field, label: kubePropertyLabel(field, props.object) }))
  return fields.filter((row) => row.field !== 'bk_supplier_account' && row.field !== 'revision')
})
</script>

<style scoped>
.property-card { border: 0; }
.property-card :deep(.el-card__header) { padding: 0 0 12px; border-bottom: 0; font-size: 14px; color: #313238; font-weight: 600; }
.property-value { white-space: pre-wrap; word-break: break-word; }
</style>
