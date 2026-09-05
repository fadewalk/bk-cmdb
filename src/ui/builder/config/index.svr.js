// serve.js 运行时配置:本地对比老/新前端时使用
// 用法:先构建老 UI(npm run build),再 PORT=8091 node builder/serve.js
//
// 注意:旧版 index.html 的 Site 变量值不带引号(url: <%= API_URL %>),
// 线上由 Go html/template 在 script 上下文自动加引号转义;
// serve.js 是裸字符串替换,因此这里的值必须是"自带引号的合法 JS 表达式"。
module.exports = {
  // 除 /static 与 / 外全部代理到独立部署后端(含 /api/v3)
  apiTarget: process.env.API_TARGET || 'http://localhost:8090',

  // ---- 注入 index.html 的 Site / User 变量(JS 表达式字符串) ----
  site: '"http://localhost:8091"',
  version: '"v3"',
  ccversion: 'community-v3.14',
  curl: 'null',
  agentAppUrl: 'null',
  authscheme: '"internal"',
  authCenter: 'null',
  role: 'null',
  userName: '"admin"',
  fullTextSearch: '"off"',
  userManage: 'null',
  helpDocUrl: 'null',
  disableOperationStatistic: 'false',
  cookieDomain: 'null',
  componentApiUrl: 'null',
  // 旧版 webpack 资源前缀模板为 '{{.publicPath}}static/';构建产物引用相对路径 static/js/...
  // Site.publicPath(运行时动态资源前缀)与服务端推导语义一致:根路径站点为 '/'
  publicPath: '"/"',
  enableNotification: 'false',
  bkSharedResUrl: 'null',

  // 兼容 index.html 中其他内联引用
  appLogo: '""',
  name: '"蓝鲸配置平台"'
}
