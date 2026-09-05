/**
 * Tencent is pleased to support the open source community by making 蓝鲸 available.
 * Copyright (C) 2017 Tencent. All rights reserved.
 * Licensed under the MIT License (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 * http://opensource.org/licenses/MIT
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 * either express or implied. See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs')
const path = require('path')
const express = require('express')
const { createProxyMiddleware } = require('http-proxy-middleware')

// ---------- 运行时配置 ----------
const svrConfig = require('./config/index.svr')
const buildConfig = require('./config')

// ---------- 代理目标 ----------
const PROXY_TARGET = svrConfig.apiTarget

// ---------- Express 实例 ----------
const app = express()


// ---------- 0.5 客户端错误收集(诊断白屏用) ----------
const clientErrors = []
app.post('/__client_err', (req, res) => {
  let body = ''
  req.on('data', d => body += d)
  req.on('end', () => {
    clientErrors.push({ ts: new Date().toISOString(), body: body.slice(0, 1000) })
    console.log('[CLIENT-ERR]', body.slice(0, 500))
    res.json({ ok: true })
  })
})
app.get('/__client_errs', (req, res) => res.json(clientErrors.slice(-50)))

// ---------- 1. 静态资源 ----------
const staticDir = buildConfig.build.assetsRoot
const publicPath = '/static'
// 把本地 dist 目录挂到 /static
app.use(publicPath, express.static(staticDir))

// ---------- 2. 读取并缓存 index.html 模板 ----------
const indexPath = path.join(staticDir, 'index.html')
if (!fs.existsSync(indexPath)) {
  console.error(`❌ 未找到模板文件 ${indexPath}`)
  process.exit(1)
}
const template = fs.readFileSync(indexPath, 'utf8')

// ---------- 3. 模板渲染 ----------

function injectHooks(html) {
  const hook = '<script>(function(){function post(o){try{var x=new XMLHttpRequest();x.open("POST","/__client_err",true);x.send(JSON.stringify(o))}catch(e){}}window.onerror=function(m,s,l,c,e){post({t:"onerror",m:String(m),s:String(s||"").split("/").pop(),l:l,stack:e&&e.stack?String(e.stack).slice(0,600):""});return false};window.addEventListener("unhandledrejection",function(ev){var r=ev.reason;post({t:"unhandledrejection",m:String((r&&r.message)||r),stack:r&&r.stack?String(r.stack).slice(0,600):""})});var _ce=console.error;console.error=function(){try{post({t:"console.error",m:[].slice.call(arguments).map(String).join(" ").slice(0,400)})}catch(e){}_ce.apply(console,arguments)};})();<\/script>'
  return html.replace('<head>', '<head>' + hook)
}

function render(html, data) {
  // 属性上下文(src/href)中 publicPath 需要裸路径;script 上下文需要 JS 表达式(带引号),
  // 先特判属性上下文,再做通用替换(对齐 Go html/template 的上下文感知转义)
  html = html.replace(/(src|href)="\{\{\.publicPath\}\}/g, '$1="/')
  return html.replace(/\{\{\.(\w+)\}\}/g, (_, key) => data[key] ?? '')
}

// ---------- 4. 根路由 & 模板注入 ----------
app.get('/', (req, res) => {
  res.set('Content-Type', 'text/html')
  res.send(injectHooks(render(template, svrConfig)))
})

// ---------- 5. 其余全部代理 ----------
// 放在最末尾兜底，确保 /static 和 index.html 已处理完
app.use(createProxyMiddleware({
  target: PROXY_TARGET,
  changeOrigin: true,
  logLevel: 'debug',
}))

// ---------- 6. 启动 ----------
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`✅ SPA server listening on http://localhost:${PORT}`)
  console.log(`   Static files   -> http://localhost:${PORT}/static/**`)
  console.log(`   Everything else -> ${PROXY_TARGET}`)
})
