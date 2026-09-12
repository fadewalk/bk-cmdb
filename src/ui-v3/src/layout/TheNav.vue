<template>
  <!-- 旧版 dynamic-navigation.vue 复刻:60px 收起/260px 展开、悬停展开、底部固定按钮 -->
  <nav
    class="the-nav"
    :class="{ unfolded: unfold }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- 业务(集)选择器:旧版业务视图下常驻(对齐 cmdb-business-mix-selector) -->
    <div class="business-wrapper" v-if="currentTop?.id === 'business'">
      <BizMixSelector
        v-if="unfold"
        class="business-selector"
        :model-value="selectedId"
        @select="handleToggleBusiness"
      />
      <i v-else class="bk-cmdb-icon icon-cc-angle-right business-flag" />
    </div>

    <div class="menu-list">
      <template v-for="child in visibleChildren" :key="child.id">
        <router-link
          v-if="canOpenChild(child)"
          class="menu-item"
          :class="{ active: isActive(child) }"
          :to="menuLinkPath(child, bizStore.bizId)"
          :title="child.name"
        >
          <i v-if="child.icon" :class="['bk-cmdb-icon', 'menu-icon', child.icon]" />
          <span class="menu-name">{{ child.name }}</span>
        </router-link>
        <span
          v-else
          class="menu-item menu-item-disabled"
          :title="bizStore.bizId == null ? '请先选择业务' : child.name"
          aria-disabled="true"
        >
          <i v-if="child.icon" :class="['bk-cmdb-icon', 'menu-icon', child.icon]" />
          <span class="menu-name">{{ child.name }}</span>
        </span>
      </template>
    </div>

    <div class="nav-option">
      <i
        class="bk-cmdb-icon icon-cc-nav-toggle nav-stick"
        :class="{ sticked: navStick }"
        :title="navStick ? '收起导航' : '固定导航'"
        @click="toggleNavStick"
      />
    </div>
  </nav>
</template>

<script setup>
import { computed, ref, onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { resolveMenuByRoute, menuLinkPath, RESOURCE_DYNAMIC_CHILDREN } from './menu-config'
import { useBizStore } from '../stores/biz'
import { useResourceStore, BUILTIN_RESOURCE_ROUTES } from '../stores/resource'
import BizMixSelector from '../components/BizMixSelector.vue'
import { usePermissionStore } from '../stores/permission'

const NAV_STICK_KEY = 'navStick'

const route = useRoute()
const bizStore = useBizStore()
const permissionStore = usePermissionStore()
const resourceStore = useResourceStore()

// 旧版 global store 初始语义:navStick 未写入或非 'false' 时视为固定
const navStick = ref(localStorage.getItem(NAV_STICK_KEY) !== 'false')
const navFold = ref(navStick.value === 'false')

const currentTop = computed(() => {
  const top = resolveMenuByRoute(route)?.top || null
  if (top?.id === 'platform' && !permissionStore.canPlatformManage) return null
  return top
})
const currentChild = computed(() => resolveMenuByRoute(route)?.child || null)
const resourceChildren = computed(() => {
  if (currentTop.value?.id !== 'resource') return []
  const staticChildren = currentTop.value.children || []
  const index = staticChildren.findIndex((child) => child.id === 'index')
  const collectionChildren = RESOURCE_DYNAMIC_CHILDREN.map((entry) => {
    const modelId = entry.id === 'biz-set' ? 'bk_biz_set_obj' : entry.id === 'business' ? 'biz' : entry.id === 'project' ? 'bk_project' : 'host'
    const model = resourceStore.models.find((item) => item.bk_obj_id === modelId)
    return {
      ...entry,
      id: `collection-${modelId}`,
      name: model?.bk_obj_name || entry.name,
      icon: model?.bk_obj_icon || entry.icon,
      path: BUILTIN_RESOURCE_ROUTES[modelId],
      collectionModelId: modelId
    }
  }).filter((entry) => resourceStore.collectionModels.includes(entry.collectionModelId))
  const extraChildren = resourceStore.collectionModels
    .filter((modelId) => !RESOURCE_DYNAMIC_CHILDREN.some((entry) => entry.id === modelId || (entry.id === 'biz-set' && modelId === 'bk_biz_set_obj') || (entry.id === 'business' && modelId === 'biz') || (entry.id === 'project' && modelId === 'bk_project') || (entry.id === 'host' && modelId === 'host')))
    .map((modelId) => {
      const model = resourceStore.models.find((item) => item.bk_obj_id === modelId)
      return { id: `collection-${modelId}`, name: model?.bk_obj_name || modelId, icon: model?.bk_obj_icon || 'icon-cc-model', path: `/resource/instance/${modelId}`, collectionModelId: modelId }
    })
  const collection = [...collectionChildren, ...extraChildren]
  const children = [...staticChildren]
  children.splice(index + 1, 0, ...collection)
  return children
})
const visibleChildren = computed(() => currentTop.value?.id === 'resource' ? resourceChildren.value : (currentTop.value?.children || []))
const unfold = computed(() => navStick.value || !navFold.value)

// 旧版混合选择器的值格式为 `${id}-biz`
const selectedId = computed(() => (bizStore.bizId == null ? '' : `${bizStore.bizId}-biz`))

function isActive(child) {
  if (child.collectionModelId) return currentChild.value?.path === child.path
  return currentChild.value?.path === child.path
}

function canOpenChild(child) {
  return !child.path?.includes(':bizId') || bizStore.bizId != null
}

let foldTimer = null

function handleMouseEnter() {
  if (foldTimer) {
    clearTimeout(foldTimer)
    foldTimer = null
  }
  navFold.value = false
}

function handleMouseLeave() {
  if (foldTimer) clearTimeout(foldTimer)
  foldTimer = setTimeout(() => {
    navFold.value = true
    foldTimer = null
  }, 300)
}

function toggleNavStick() {
  navStick.value = !navStick.value
  navFold.value = !navStick.value
  if (navStick.value) localStorage.removeItem(NAV_STICK_KEY)
  else localStorage.setItem(NAV_STICK_KEY, 'false')
}

// 旧版 handleToggleBusiness:切换业务(集)后落到对应拓扑页并整页刷新
function handleToggleBusiness(value, newId, isBizSet) {
  if (value === selectedId.value) return
  window.location.hash = isBizSet
    ? `#/business-set/${newId}/index`
    : `#/business/${newId}/index`
  window.location.reload()
}

onMounted(() => {
  bizStore.ensureLoaded()
  permissionStore.ensureLoaded()
  resourceStore.ensureLoaded()
})

onBeforeUnmount(() => {
  if (foldTimer) clearTimeout(foldTimer)
})
</script>

<style scoped>
.the-nav {
  position: relative;
  width: 60px;
  flex: 0 0 auto;
  height: 100%;
  background: #fff;
  border-right: 1px solid #DCDEE5;
  transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1000;
}
.the-nav.unfolded {
  width: 260px;
}
.business-wrapper {
  position: relative;
  padding: 10px 0;
  height: 53px;
  border-bottom: 1px solid #DCDEE5;
  overflow: hidden;
}
.business-selector {
  display: block;
  width: 240px;
  margin: 0 auto;
}
.business-flag {
  position: absolute;
  left: 10px;
  top: 9px;
  width: 32px;
  height: 32px;
  line-height: 32px;
  text-align: center;
  font-size: 20px;
  color: #3A84FF;
  border: 1px solid #C4C6CC;
  border-radius: 2px;
  transform: rotate(90deg);
}
.menu-list {
  height: calc(100% - 123px);
  padding: 10px 0;
  overflow-y: auto;
  overflow-x: hidden;
  white-space: nowrap;
}
.menu-list::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
.menu-list::-webkit-scrollbar-thumb {
  border-radius: 20px;
  background: rgba(165, 165, 165, .3);
  box-shadow: inset 0 0 6px hsla(0, 0%, 80%, .3);
}
.menu-item {
  display: block;
  position: relative;
  height: 42px;
  color: #63656E;
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
}
.menu-item:hover {
  background-color: #F6F6F9;
}
.menu-item-disabled {
  color: #C4C6CC;
  cursor: not-allowed;
  opacity: .75;
}
.menu-item-disabled .menu-icon {
  color: #C4C6CC;
}
.menu-item-disabled:hover {
  background-color: transparent;
}
.menu-item.active {
  background-color: #E1ECFF;
}
.menu-item.active .menu-icon,
.menu-item.active .menu-name {
  color: #3A84FF;
}
.menu-icon {
  display: inline-block;
  vertical-align: top;
  margin: 13px 26px 13px 22px;
  font-size: 16px;
  color: #979BA5;
}
.menu-name {
  display: inline-block;
  vertical-align: top;
  width: calc(100% - 120px);
  height: 42px;
  line-height: 42px;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-option {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 50px;
  line-height: 49px;
  border-top: 1px solid #DCDEE5;
  font-size: 0;
  color: #63656E;
}
.nav-stick {
  display: inline-block;
  vertical-align: middle;
  width: 32px;
  height: 32px;
  margin: 0 0 0 13px;
  line-height: 32px;
  text-align: center;
  font-size: 14px;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.nav-stick:hover {
  opacity: .8;
}
.nav-stick.sticked {
  transform: rotate(180deg);
}
</style>
