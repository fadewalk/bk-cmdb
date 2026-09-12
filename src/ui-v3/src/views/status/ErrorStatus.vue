<template>
  <StatusPage icon="icon-cc-error" title="服务异常" desc="抱歉，服务可能出现异常，请稍后重试或返回首页" />
</template>

<script setup>
// 老版 status/error.vue:路由级 /error 与 meta.view='error' 原位渲染共用
import StatusPage from './StatusPage.vue'
</script>
