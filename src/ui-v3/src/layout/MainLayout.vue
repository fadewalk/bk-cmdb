<template>
  <div class="app-shell">
    <TheHeader />
    <div class="app-body">
      <TheNav v-if="showNav" />
      <div class="app-main">
        <TheBreadcrumbs v-if="showNav" />
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import TheHeader from './TheHeader.vue'
import TheNav from './TheNav.vue'
import TheBreadcrumbs from './TheBreadcrumbs.vue'
import { findMenuByPath } from './menu-config'
import { useBizStore } from '../stores/biz'

const route = useRoute()
const bizStore = useBizStore()
const showNav = computed(() => {
  if (findMenuByPath(route.path)) return true
  // 资源目录子路由 /resource/catalog/:objId 视为资源类
  if (route.path.startsWith('/resource/')) return true
  // 主机详情
  if (route.path === '/host-detail') return true
  return false
})

onMounted(() => {
  bizStore.ensureLoaded()
})
</script>

<style scoped>
.app-shell { height: 100%; display: flex; flex-direction: column; }
.app-body { flex: 1; display: flex; overflow: hidden; }
.app-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.app-main > :deep(.router-view-wrap),
.app-main :deep(.page-card) { flex: 1; }
</style>
