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

      <!-- 用户 admin ▾ -->
      <el-dropdown trigger="click" class="info-item" @command="onUserCmd">
        <span class="info-user">
          <span class="user-name">admin</span>
          <i class="caret">▾</i>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="logout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MENUS, resolveMenuByRoute, menuLinkPath } from './menu-config'
import { useBizStore } from '../stores/biz'

const route = useRoute()
const router = useRouter()
const bizStore = useBizStore()
const topMenus = MENUS

function isActive(menu) {
  const resolved = resolveMenuByRoute(route)
  return resolved?.top?.id === menu.id
}

function goFirst(menu) {
  if (menu.children?.length) router.push(menuLinkPath(menu.children[0], bizStore.bizId))
}

function onUserCmd(cmd) {
  if (cmd === 'logout') {
    ElMessageBox.confirm('确定退出登录?', '退出确认', { type: 'warning' })
      .then(() => ElMessage.success('独立模式下无登录会话'))
      .catch(() => {})
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
.logo { flex: 292px 0 0; }
.logo-link {
  display: inline-flex; align-items: center; gap: 10px;
  height: 58px; margin-left: 24px; color: #fff; font-size: 16px; text-decoration: none;
}
.logo-icon {
  width: 28px; height: 28px; border-radius: 6px;
  background: linear-gradient(135deg, #3A84FF, #2e6ad6);
  color: #fff; font-weight: 700; font-size: 16px;
  display: flex; align-items: center; justify-content: center;
}
.header-nav { flex: 1; white-space: nowrap; }
.header-link {
  display: inline-block; vertical-align: middle; height: 58px; line-height: 58px;
  padding: 0 25px; color: #96A2B9; font-size: 14px; text-decoration: none; cursor: pointer;
}
.header-link:hover { background-color: rgba(49, 64, 94, 0.5); color: #C2CEE5; }
.header-link.active,
.header-link.router-link-active { background-color: rgba(49, 64, 94, 1); color: #fff; }
.header-info {
  flex: 0 0 auto; display: flex; align-items: center; gap: 14px; margin-right: 24px;
}
.info-item { cursor: pointer; }
.info-user {
  display: inline-flex; align-items: center; gap: 4px;
  color: #96A2B9; font-size: 14px; height: 58px; padding: 0 8px;
}
.info-user:hover { color: #fff; background-color: rgba(49, 64, 94, 0.5); }
.caret { font-style: normal; font-size: 12px; }
.user-name { font-weight: bold; }
</style>
