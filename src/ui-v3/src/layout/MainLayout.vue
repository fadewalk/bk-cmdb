<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="logo" @click="$router.push('/dashboard')">
        <el-icon :size="22"><Platform /></el-icon>
        <span>CMDB 配置平台</span>
      </div>
      <el-menu
        :default-active="$route.path"
        router
        background-color="#182132"
        text-color="#a3b1cc"
        active-text-color="#ffffff"
        class="menu"
      >
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon><span>仪表盘</span>
        </el-menu-item>
        <el-menu-item index="/business">
          <el-icon><OfficeBuilding /></el-icon><span>业务管理</span>
        </el-menu-item>
        <el-menu-item index="/topo">
          <el-icon><Share /></el-icon><span>业务拓扑</span>
        </el-menu-item>
        <el-menu-item index="/hosts">
          <el-icon><Monitor /></el-icon><span>主机管理</span>
        </el-menu-item>

        <div class="menu-group">资产与模型</div>
        <el-menu-item index="/models">
          <el-icon><Grid /></el-icon><span>模型管理</span>
        </el-menu-item>
        <el-menu-item index="/association-types">
          <el-icon><Link /></el-icon><span>关联类型</span>
        </el-menu-item>

        <div class="menu-group">服务与运营</div>
        <el-menu-item index="/service-template">
          <el-icon><SetUp /></el-icon><span>服务模板</span>
        </el-menu-item>
        <el-menu-item index="/service-instance">
          <el-icon><Cpu /></el-icon><span>服务实例</span>
        </el-menu-item>
        <el-menu-item index="/host-apply">
          <el-icon><MagicStick /></el-icon><span>主机自动应用</span>
        </el-menu-item>
        <el-menu-item index="/biz-set">
          <el-icon><Files /></el-icon><span>业务集</span>
        </el-menu-item>
        <el-menu-item index="/cloud">
          <el-icon><Cloudy /></el-icon><span>云资源</span>
        </el-menu-item>
        <el-menu-item index="/dynamic-group">
          <el-icon><Collection /></el-icon><span>动态分组</span>
        </el-menu-item>
        <el-menu-item index="/operation">
          <el-icon><TrendCharts /></el-icon><span>运营统计</span>
        </el-menu-item>

        <div class="menu-group">平台</div>
        <el-menu-item index="/audit">
          <el-icon><Document /></el-icon><span>操作审计</span>
        </el-menu-item>
        <el-menu-item index="/roadmap">
          <el-icon><MapLocation /></el-icon><span>功能路线</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header" height="52px">
        <div class="header-title">{{ $route.meta.title || '' }}</div>
        <div class="header-right">
          <el-tag size="small" type="success" effect="plain">独立模式</el-tag>
          <el-dropdown>
            <span class="user">
              <el-icon><UserFilled /></el-icon>
              admin
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>免登录模式(skip-login)</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
</script>

<style scoped>
.layout { height: 100%; }
.aside { background-color: #182132; display: flex; flex-direction: column; }
.logo {
  display: flex; align-items: center; gap: 10px;
  height: 52px; padding: 0 20px; color: #fff; font-size: 16px; font-weight: 600;
  cursor: pointer; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.menu { border-right: none; flex: 1; overflow-y: auto; }
.menu-group {
  padding: 14px 20px 4px; font-size: 12px; color: #6b7a99;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.header {
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; border-bottom: 1px solid #e7e9ef;
}
.header-title { font-size: 15px; font-weight: 600; }
.header-right { display: flex; align-items: center; gap: 16px; }
.user { display: flex; align-items: center; gap: 4px; cursor: pointer; color: #313238; outline: none; }
.main { padding: 0; overflow: auto; }
</style>
