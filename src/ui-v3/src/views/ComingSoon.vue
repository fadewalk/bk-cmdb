<template>
  <div class="page-card coming-soon">
    <el-empty :description="`「${$route.meta.title}」功能迁移中`">
      <template #image><el-icon :size="64" color="#C4C6CC"><Box /></el-icon></template>
      <p class="tip">该模块暂未提供界面,可暂时通过 CMDB OpenAPI 操作</p>
      <el-button type="primary" plain @click="$router.push('/platform/roadmap')">查看迁移进度</el-button>
    </el-empty>
  </div>
</template>

<style scoped>
.coming-soon { display: flex; align-items: center; justify-content: center; }
.tip { color: #979BA5; font-size: 12px; margin-bottom: 14px; }
</style>
