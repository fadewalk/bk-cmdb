<template>
  <div class="nf">
    <h1>404</h1>
    <p>页面不存在</p>
    <el-button type="primary" @click="$router.push('/')">回到首页</el-button>
  </div>
</template>

<style scoped>
.nf { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
h1 { font-size: 64px; margin: 0; color: #3a84ff; }
</style>
