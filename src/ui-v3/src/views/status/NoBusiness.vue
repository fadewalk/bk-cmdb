<template>
  <StatusPage icon="icon-cc-no-authority" title="无任何业务权限"
    desc="您还没有任何业务的权限，请先申请业务权限或创建业务">
    <el-button type="primary" @click="$router.push('/resource/business')">创建业务</el-button>
  </StatusPage>
</template>

<script setup>
// 老版 /no-business 独立路由:首次进入且无任何可见业务时的 403 态
import StatusPage from './StatusPage.vue'
</script>
