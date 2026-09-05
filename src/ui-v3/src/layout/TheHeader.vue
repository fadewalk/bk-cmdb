<template>
  <header class="the-header">
    <div class="logo">
      <router-link class="logo-link" to="/index">
        <span class="logo-icon">C</span>
        <span class="logo-text">配置平台</span>
      </router-link>
    </div>
    <nav class="header-nav">
      <template v-for="menu in topMenus" :key="menu.id">
        <router-link
          v-if="menu.path"
          class="header-link"
          :class="{ active: isActive(menu) }"
          :to="menu.path"
        >{{ menu.name }}</router-link>
        <a
          v-else
          class="header-link"
          :class="{ active: isActive(menu) }"
          href="javascript:;"
          @click="goFirst(menu)"
        >{{ menu.name }}</a>
      </template>
    </nav>
    <div class="header-info">
      <el-tag size="small" effect="dark" type="info" style="border-color: rgba(255,255,255,.2)">独立模式</el-tag>
      <span class="info-user">
        <el-icon><UserFilled /></el-icon>
        <span class="user-name">admin</span>
      </span>
    </div>
  </header>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'
import { MENUS } from './menu-config'

const route = useRoute()
const router = useRouter()
const topMenus = MENUS

function isActive(menu) {
  if (menu.path) return route.path === menu.path
  return route.path.startsWith(`/${menu.id}`)
}

function goFirst(menu) {
  if (menu.children?.length) {
    router.push(menu.children[0].path)
  }
}
</script>

<style scoped>
.the-header {
  display: flex;
  height: 58px;
  background-color: #182132;
  z-index: 1002;
}
.logo { flex: 200px 0 0; }
.logo-link {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 58px;
  margin-left: 24px;
  color: #fff;
  font-size: 16px;
  text-decoration: none;
}
.logo-icon {
  width: 28px; height: 28px;
  border-radius: 6px;
  background: linear-gradient(135deg, #3A84FF, #2e6ad6);
  color: #fff; font-weight: 700; font-size: 16px;
  display: flex; align-items: center; justify-content: center;
}
.header-nav { flex: 1; white-space: nowrap; }
.header-link {
  display: inline-block;
  vertical-align: middle;
  height: 58px;
  line-height: 58px;
  padding: 0 25px;
  color: #96A2B9;
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
}
.header-link:hover { background-color: rgba(49, 64, 94, 0.5); color: #C2CEE5; }
.header-link.active,
.header-link.router-link-active { background-color: rgba(49, 64, 94, 1); color: #fff; }
.header-info {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 14px;
  margin-right: 24px;
}
.info-user {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #96A2B9;
  font-size: 14px;
  font-weight: bold;
}
</style>
