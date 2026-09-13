<template>
  <div class="page-card">
    <el-card shadow="never">
      <template #header>网络采集</template>
      <DependencyBlocked kind="network" :reason="reason" />
    </el-card>
  </div>
</template>
<script setup>
import DependencyBlocked from './status/DependencyBlocked.vue'
const reason = '老版仅注册了网络采集 API,当前仓库没有可用的网络采集页面、采集器注册或设备数据链路;接入 collector 后再启用设备/属性 CRUD。'
</script>
