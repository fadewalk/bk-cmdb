// serve.js 运行时配置:本地对比老/新前端时使用
// 用法:先构建老 UI(npm run build),再 PORT=8091 node builder/serve.js
module.exports = {
  // 除 /static 与 / 外全部代理到新前端容器(含 /api/v3)
  apiTarget: process.env.API_TARGET || 'http://localhost:8090',

  // 以下注入 index.html 的 Site 变量(对齐 web_server 渲染语义)
  site: 'http://localhost:8091',
  version: 'v3',
  ccversion: 'community-v3.14',
  curl: '',
  agentAppUrl: '',
  authscheme: 'internal',
  authCenter: '{}',
  role: '',
  userName: 'admin',
  fullTextSearch: 'off',
  userManage: '',
  helpDocUrl: '',
  disableOperationStatistic: 'false',
  cookieDomain: '',
  componentApiUrl: '',
  // 老版产物资源引用前缀(见 config/index.js build.assetsPublicPath)
  publicPath: '/static/',
  enableNotification: 'false',
  bkSharedResUrl: '',

  // 独立模式登录(供 index.html 中 window.Login 相关逻辑使用)
  appLogo: '',
  name: '蓝鲸配置平台'
}
