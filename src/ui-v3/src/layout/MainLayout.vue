<template>
  <div class="app-shell">
    <TheHeader />
    <div class="app-body">
      <TheNav v-if="showNav" />
      <div class="app-main">
        <TheBreadcrumbs v-if="showBreadcrumbs" />
        <!-- 老版 dynamic-router-view 语义:meta.view = error|permission 时原位渲染状态视图,URL 保留 -->
        <component :is="statusView" v-if="statusView" />
        <router-view v-else />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import TheHeader from './TheHeader.vue'
import TheNav from './TheNav.vue'
import TheBreadcrumbs from './TheBreadcrumbs.vue'
import { resolveMenuByRoute, isHomeRoute } from './menu-config'
import { useBizStore } from '../stores/biz'
import { useUiStatusStore } from '../stores/ui-status'

const route = useRoute()
const bizStore = useBizStore()
const uiStatus = useUiStatusStore()
// meta.view 原位状态视图(error/permission):导航期来自 router 守卫写 meta,
// 运行时事件(边缘 403)来自 ui-status store——route.meta 运行时替换无响应性;
// 路由切换即清 store
const statusView = computed(() => {
  if (uiStatus.view === 'permission') return defineAsyncComponent(() => import('../views/status/PermissionStatus.vue'))
  if (route.meta.view === 'error') return defineAsyncComponent(() => import('../views/status/ErrorStatus.vue'))
  if (route.meta.view === 'permission') return defineAsyncComponent(() => import('../views/status/PermissionStatus.vue'))
  return null
})
watch(() => route.fullPath, () => uiStatus.clear())
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
