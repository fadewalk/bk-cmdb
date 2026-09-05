<template>
  <router-view />
</template>

<style>
* { box-sizing: border-box; }
html, body, #app { height: 100%; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica,
    'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif;
  font-size: 14px;
  color: #313238;
  background-color: #f5f7fa;
}
.page-card { padding: 20px; }
.table-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.table-toolbar .spacer { flex: 1; }
</style>
