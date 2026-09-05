<template>
  <div class="the-breadcrumbs" v-if="menu">
    <span class="crumb link" @click="$router.push(menu.top.path || menu.children?.[0]?.path || '/index')">
      {{ menu.top.name }}
    </span>
    <span class="crumb-sep">/</span>
    <span class="crumb current">{{ title }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { findMenuByPath } from './menu-config'

const route = useRoute()
const menu = computed(() => findMenuByPath(route.path))
const title = computed(() => {
  const m = menu.value
  if (!m) return ''
  if (m.child) return m.child.name
  return m.top.name
})
</script>

<style scoped>
.the-breadcrumbs {
  padding: 14px 20px;
  height: 53px;
  background: #fff;
  border-bottom: 1px solid #E7E9EF;
  display: flex;
  align-items: center;
  gap: 8px;
}
.crumb { font-size: 14px; line-height: 24px; color: #63656E; }
.crumb.link { cursor: pointer; }
.crumb.link:hover { color: #3A84FF; }
.crumb-sep { color: #C4C6CC; font-size: 12px; }
.crumb.current { font-size: 16px; line-height: 24px; color: #313238; }
</style>
