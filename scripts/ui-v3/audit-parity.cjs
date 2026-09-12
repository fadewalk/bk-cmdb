#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')

function read(file) {
  try {
    return fs.readFileSync(path.join(root, file), 'utf8')
  } catch {
    return ''
  }
}

function collectRoutes(text) {
  const routes = new Set()
  const patterns = [
    /path:\s*['"`]([^'"`]+)['"`]/g,
    /router\.(?:get|post|put|delete)\(\s*['"`]([^'"`]+)['"`]/gi
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) routes.add(match[1])
  }
  return [...routes].sort()
}

function collectApis(text) {
  const apis = new Set()
  const patterns = [
    /['"`]((?:\/api\/v3|\/api|\/)(?:[^'"`\s]*))(?:['"`])/g,
    /(?:get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/gi
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[1]
      if (value.startsWith('/api') || value.startsWith('/login') || value.startsWith('/logout') || value.startsWith('/userinfo')) {
        apis.add(value)
      }
    }
  }
  return [...apis].sort()
}

function scanFiles(dir, predicate) {
  const result = []
  if (!fs.existsSync(dir)) return result
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...scanFiles(full, predicate))
    else if (predicate(full)) result.push(full)
  }
  return result
}

const legacyFiles = scanFiles(path.join(root, 'src/ui/src'), (file) => /\.(js|vue)$/.test(file))
const v3Files = scanFiles(path.join(root, 'src/ui-v3/src'), (file) => /\.(js|vue)$/.test(file))
const legacyRouteText = legacyFiles.filter((file) => /router|menu|route/i.test(file)).map((file) => read(path.relative(root, file))).join('\n')
const v3RouteText = v3Files.filter((file) => /router|menu|route/i.test(file)).map((file) => read(path.relative(root, file))).join('\n')
const legacyApiText = legacyFiles.filter((file) => /api|service|router/i.test(file)).map((file) => read(path.relative(root, file))).join('\n')
const v3ApiText = v3Files.filter((file) => /api|service|router/i.test(file)).map((file) => read(path.relative(root, file))).join('\n')
const webText = scanFiles(path.join(root, 'src/web_server'), (file) => /\.go$/.test(file)).map((file) => read(path.relative(root, file))).join('\n')
const v3Http = read('src/ui-v3/src/api/http.js')
const legacyRoutes = collectRoutes(legacyRouteText)
const v3Routes = collectRoutes(v3RouteText)
const legacyApis = collectApis(legacyApiText)
const v3Apis = collectApis(v3ApiText)
const registeredApis = collectRoutes(webText).filter((route) => route.startsWith('/'))
const fixedIdentityHits = [
  ...v3Files,
  ...scanFiles(path.join(root, 'src/web_server'), (file) => /\.(go)$/.test(file)),
  path.join(root, 'deploy/standalone/run.sh'),
  path.join(root, 'deploy/standalone/docker-compose.yml')
].flatMap((file) => {
  const text = read(path.relative(root, file))
  return text.split('\n').flatMap((line, index) => /X-Bkcmdb-User['"`]?\s*[:=]\s*['"`]admin|CMDB_API_USER.*admin|skip-login|insecureSkipVerify\s*:\s*true/i.test(line)
    ? [{ file: path.relative(root, file), line: index + 1, text: line.trim() }]
    : [])
})

const onlyLegacy = legacyRoutes.filter((route) => !v3Routes.includes(route))
const onlyV3 = v3Routes.filter((route) => !legacyRoutes.includes(route))
const apiPrefixMismatches = v3Apis.filter((api) => api.startsWith('/api/v3') && !legacyApis.some((legacy) => legacy.endsWith(api.replace('/api/v3', ''))))

// B38: v3 每个导出 API 请求路径 ↔ 后端注册路由对齐扫描
function normalizeApiPath(value) {
  let out = value
    .replace(/\$\{[^}]*\}/g, '*')
    .replace(/\{[^}]*\}/g, '*')
    .replace(/:[A-Za-z0-9_]+/g, '*')
    .replace(/\?.*$/, '')
    .replace(/\/+/g, '/')
  if (!out.startsWith('/')) out = `/${out}`
  return out.replace(/\/$/, '') || '/'
}

// 分段通配:后端 * 匹配客户端任意单段;apiserver 还会把 /admin 前缀代理到 admin_server
function pathMatches(clientPath, backendSet) {
  const candidates = [clientPath, clientPath.replace(/^\/admin(?=\/)/, '')]
  for (const candidate of candidates) {
    const segs = candidate.split('/')
    for (const route of backendSet) {
      if (route === candidate) return true
      const rsegs = route.split('/')
      if (rsegs.length !== segs.length) continue
      if (rsegs.every((seg, i) => seg === '*' || seg === segs[i])) return true
    }
  }
  return false
}

function collectClientApiCalls() {
  const calls = new Set()
  const pattern = /http\.(?:get|post|put|delete)\(\s*[`'"]([^`'"]+)[`'"]/g
  const files = [...v3Files.filter((file) => file.includes(`${path.sep}api${path.sep}`)), ...scanFiles(path.join(root, 'src/ui-v3/src/views'), (file) => /\.vue$/.test(file))]
  for (const file of files) {
    const text = read(path.relative(root, file))
    for (const match of text.matchAll(pattern)) calls.add(match[1])
  }
  return [...calls].map(normalizeApiPath)
}

function collectBackendRoutes() {
  const routes = new Set()
  const serviceRoots = ['scene_server', 'source_controller', 'web_server', 'apiserver'].map((dir) => path.join(root, 'src', dir))
  const goFiles = serviceRoots.flatMap((dir) => scanFiles(dir, (file) => file.endsWith('.go') && !file.endsWith('_test.go')))
  // 三种注册形态:声明式 Path 表、链式调用、apiserver "{.*}" 通用代理兜底
  const pattern = /Path:\s*"([^"]+)"|\b(?:GET|POST|PUT|DELETE)\s*\(\s*"(\/[^"]+)"/g
  const genericPattern = /\b(?:GET|POST|PUT|DELETE)\s*\(\s*"\{[^"]*\}"/g
  let hasGenericProxy = false
  for (const file of goFiles) {
    const text = read(path.relative(root, file))
    for (const match of text.matchAll(pattern)) {
      const value = match[1] || match[2]
      if (value) routes.add(normalizeApiPath(value))
    }
    if (genericPattern.test(text)) hasGenericProxy = true
  }
  return { routes: [...routes], hasGenericProxy }
}

const clientApiCalls = collectClientApiCalls()
const { routes: backendRoutes, hasGenericProxy } = collectBackendRoutes()
const specificMatch = (call) => pathMatches(call, backendRoutes)
const apiGaps = clientApiCalls.filter((call) => !specificMatch(call) && !hasGenericProxy)
const apiGenericProxyOnly = clientApiCalls.filter((call) => !specificMatch(call) && hasGenericProxy)

const report = {
  generatedAt: new Date().toISOString(),
  root,
  routes: {
    legacyCount: legacyRoutes.length,
    v3Count: v3Routes.length,
    legacy: legacyRoutes,
    v3: v3Routes,
    onlyLegacy,
    onlyV3
  },
  apis: {
    legacy: legacyApis,
    v3: v3Apis,
    registeredHint: registeredApis,
    v3PrefixMismatches: apiPrefixMismatches,
    clientApiCalls,
    backendRouteCount: backendRoutes.length,
    hasGenericProxy,
    apiGaps,
    apiGenericProxyOnly
  },
  fixedIdentityHits,
  gates: {
    fixedIdentityHeadersRemoved: !/X-Bkcmdb-User.*admin|X-Bkcmdb-Supplier-Account.*0/.test(v3Http),
    webRegistrationDiscovered: registeredApis.length > 0,
    apiGaps,
    productionReady: false
  }
}

console.log(JSON.stringify(report, null, 2))
