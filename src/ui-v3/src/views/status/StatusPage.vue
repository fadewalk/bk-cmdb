<template>
  <div class="status-page">
    <i class="bk-cmdb-icon status-icon" :class="icon" />
    <h2 class="status-title">{{ title }}</h2>
    <p class="status-desc">{{ desc }}</p>
    <div class="status-actions">
      <slot />
      <el-button @click="$router.push('/')">返回首页</el-button>
    </div>
  </div>
</template>

<script setup>
// 老版 views/status 通用形态:大图标 + 标题 + 描述 + 操作按钮(404/error/permission/non-exist-business 同构)
defineProps({
  icon: { type: String, default: 'icon-cc-no-authority' },
  title: { type: String, required: true },
  desc: { type: String, default: '' }
})
</script>

<style scoped>
.status-page {
  height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 40px 24px; background: #fff;
}
.status-icon { font-size: 64px; color: #979ba5; }
.status-title { margin: 8px 0 0; font-size: 22px; font-weight: normal; color: #313238; }
.status-desc { margin: 0; max-width: 520px; text-align: center; color: #979ba5; font-size: 14px; line-height: 22px; }
.status-actions { margin-top: 16px; display: flex; gap: 10px; }
</style>
