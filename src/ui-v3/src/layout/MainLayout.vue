<template>
  <div class="app-shell">
    <TheHeader />
    <div class="app-body">
      <TheNav v-if="showNav" />
      <div class="app-main">
        <TheBreadcrumbs v-if="showBreadcrumbs" />
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
import { resolveMenuByRoute, isHomeRoute } from './menu-config'
import { useBizStore } from '../stores/biz'

const route = useRoute()
const bizStore = useBizStore()
const showNav = computed(() => {
  if (isHomeRoute(route)) return false
  return Boolean(resolveMenuByRoute(route))
})
// 旧版所有内页都有标题栏:有菜单上下文,或路由自带 title(如业务同步),首页除外
const showBreadcrumbs = computed(() => {
  if (isHomeRoute(route)) return false
  // 主机页自带「← 主机 ↗」标题行(老版形态),不重复渲染面包屑
  if (route.path === '/resource/host') return false
  return showNav.value || Boolean(route.meta.title)
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
