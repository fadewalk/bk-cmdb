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
      <!-- 语言切换 -->
      <el-dropdown trigger="click" class="info-item" @command="setLang">
        <span class="info-lang">
          <i class="bk-cmdb-icon icon-cc-host lang-icon" />
          <i class="caret">▾</i>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="zh-CN" :disabled="$i18n.locale === 'zh-CN'">中文</el-dropdown-item>
            <el-dropdown-item command="en" :disabled="$i18n.locale === 'en'">English</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <!-- 帮助 ? -->
      <el-dropdown trigger="click" class="info-item" @command="onHelp">
        <span class="info-help">
          <i class="bk-cmdb-icon icon-cc-help question-icon" />
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="openLink('https://bk.tencent.com/s-mart/community')">产品文档</el-dropdown-item>
            <el-dropdown-item @click="onChangeLog">版本日志</el-dropdown-item>
            <el-dropdown-item @click="openLink('https://bk.tencent.com/s-mart/community')">问题反馈</el-dropdown-item>
            <el-dropdown-item @click="openLink('https://github.com/TencentBlueKing/bk-cmdb')">开源社区</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

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

    <!-- 版本日志弹窗 -->
    <el-dialog v-model="changeLogVisible" title="版本日志" width="640px">
      <div v-for="(log, i) in changeLogs" :key="i" class="clog-row">
        <h3>v{{ log.version }} <small class="text-gray">({{ log.date }})</small></h3>
        <div v-if="log.added?.length"><strong>新增</strong>
          <ul><li v-for="(a, j) in log.added" :key="j">{{ a }}</li></ul>
        </div>
        <div v-if="log.improved?.length"><strong>优化</strong>
          <ul><li v-for="(a, j) in log.improved" :key="j">{{ a }}</li></ul>
        </div>
      </div>
      <template #footer>
        <el-button @click="changeLogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </header>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MENUS } from './menu-config'

const route = useRoute()
const router = useRouter()
const topMenus = MENUS

function isActive(menu) {
  if (menu.path) return route.path === menu.path
  return route.path.startsWith(`/${menu.id}`)
}

function goFirst(menu) {
  if (menu.children?.length) router.push(menu.children[0].path)
}

function openLink(url) { window.open(url, '_blank') }
function setLang(cmd) { ElMessage.info('独立模式已锁定语言: ' + cmd) }
function onHelp() {}

const changeLogVisible = ref(false)
const changeLogs = ref([
  { version: '3.14.7', date: '2026-04-15', added: ['接入审计中心', '前端版本更新检查并提示刷新功能', '字段类型支持插件'], improved: ['升级版本依赖及更新 license', '优化文档链接更新', '添加 apigw 的 open api 参数', 'zk 添加独立配置用户及密码', '前端 xss 过滤补丁优化', '优化枚举字段导出长度限制', '优化前端搜索功能，支持输入的多个 ID 值自动解析', '导出文件名增加时间戳', '主机与实例导出成功后退出不再提示确认关闭', '动态分组 IP 默认分割', 'apigw 接口描述国际化', '1 用户态和应用态 apigw 接口文档调整'] },
  { version: '3.14.6', date: '2025-05-28' },
  { version: '3.14.5', date: '2025-02-19' },
  { version: '3.14.4', date: '2024-12-17' },
  { version: '3.14.3', date: '2024-10-21' },
  { version: '3.14.2', date: '2024-08-20' },
  { version: '3.14.1', date: '2024-07-31' },
  { version: '3.13.14', date: '2026-03-31' }
])
function onChangeLog() { changeLogVisible.value = true }
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
.logo { flex: 200px 0 0; }
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
.info-lang, .info-help, .info-user {
  display: inline-flex; align-items: center; gap: 4px;
  color: #96A2B9; font-size: 14px; height: 58px; padding: 0 8px;
}
.info-lang:hover, .info-help:hover, .info-user:hover { color: #fff; background-color: rgba(49, 64, 94, 0.5); }
.lang-icon { font-size: 16px; }
.question-icon { font-size: 18px; }
.caret { font-style: normal; font-size: 12px; }
.user-name { font-weight: bold; }
.clog-row { margin-bottom: 16px; }
.clog-row h3 { margin: 0 0 8px; font-size: 15px; color: #313238; }
.text-gray { color: #979BA5; font-weight: normal; font-size: 12px; }
</style>
