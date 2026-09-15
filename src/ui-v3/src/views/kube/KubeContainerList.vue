<template>
  <div>
    <el-alert v-if="error" type="error" :closable="false" show-icon style="margin-bottom: 12px">
      {{ error }} <el-button link type="primary" @click="$emit('retry')">重试</el-button>
    </el-alert>
    <el-table v-else :data="containers" v-loading="loading" border stripe size="small">
      <el-table-column prop="id" label="ID" width="90" />
      <el-table-column prop="name" label="名称" min-width="180" />
      <el-table-column prop="container_uid" label="容器ID" min-width="220" show-overflow-tooltip />
      <el-table-column prop="image" label="镜像信息" min-width="220" show-overflow-tooltip />
      <el-table-column label="启动状态" width="110">
        <template #default="{ row }">{{ formatKubeValue(row.started) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }"><el-button link type="primary" @click="$emit('open', row)">详情</el-button></template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && !error && !containers.length" description="暂无 Container" :image-size="70" />
  </div>
</template>

<script setup>
import { formatKubeValue } from '../../utils/kube-detail'

defineProps({
  containers: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' }
})
defineEmits(['open', 'retry'])
</script>
