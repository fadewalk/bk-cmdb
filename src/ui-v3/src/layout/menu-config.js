// 一级 / 二级菜单结构:与旧版 src/ui/src/dictionary/menu.js 保持一致
// icon 取自旧版 bk-icon-cmdb 字体(iconcool.json),在 TheNav 中渲染
// 业务下七个二级菜单的 path 为旧版同构路由模板(:bizId 在渲染时由 menuLinkPath 注入当前业务 ID)
export const MENUS = [
  {
    id: 'index',
    name: '首页',
    icon: 'icon-cc-nav-home',
    path: '/index'
  },
  {
    id: 'biz-set',
    name: '业务集',
    icon: 'icon-cc-business-set',
    children: [
      { id: 'biz-set-topo', name: '业务集拓扑', icon: 'icon-cc-nav-business', path: '/biz-set/topo' }
    ]
  },
  {
    id: 'business',
    name: '业务',
    icon: 'icon-cc-nav-business',
    children: [
      { id: 'topo', name: '业务拓扑', icon: 'icon-cc-host', path: '/business/:bizId/index' },
      { id: 'service-template', name: '服务模板', icon: 'icon-cc-service-template', path: '/business/:bizId/service/template' },
      { id: 'set-template', name: '集群模板', icon: 'icon-cc-set-template', path: '/business/:bizId/set/template' },
      { id: 'service-category', name: '服务分类', icon: 'icon-cc-nav-service-topo', path: '/business/:bizId/service/cagetory' },
      { id: 'host-apply', name: '主机自动应用', icon: 'icon-cc-host-apply', path: '/business/:bizId/host-apply' },
      { id: 'dynamic-group', name: '动态分组', icon: 'icon-cc-custom-query', path: '/business/:bizId/custom-query' },
      { id: 'custom-fields', name: '自定义字段', icon: 'icon-cc-custom-field', path: '/business/:bizId/custom-fields' }
    ]
  },
  {
    id: 'resource',
    name: '资源',
    icon: 'icon-cc-nav-resource',
    children: [
      { id: 'index', name: '资源目录', icon: 'icon-cc-resources', path: '/resource/index' },
      { id: 'project', name: '项目', icon: 'icon-cc-project', path: '/resource/project' },
      { id: 'biz-set', name: '业务集', icon: 'icon-cc-business-set', path: '/resource/biz-set' },
      { id: 'business', name: '业务', icon: 'icon-cc-business', path: '/resource/business' },
      { id: 'host', name: '主机', icon: 'icon-cc-host', path: '/resource/host' },
      { id: 'cloud-area', name: '管控区域', icon: 'icon-cc-network-segment', path: '/resource/cloud-area' },
      { id: 'cloud-account', name: '云账户', icon: 'icon-cc-cloud-account', path: '/resource/cloud-account' },
      { id: 'cloud-discover', name: '云资源发现', icon: 'icon-cc-cloud-discover', path: '/resource/cloud-discover' }
    ]
  },
  {
    id: 'model',
    name: '模型',
    icon: 'icon-cc-nav-model-02',
    children: [
      { id: 'management', name: '模型管理', icon: 'icon-cc-nav-model-02', path: '/model/management' },
      { id: 'topology', name: '模型关系', icon: 'icon-cc-nav-model-topo', path: '/model/topology' },
      { id: 'association', name: '关联类型', icon: 'icon-cc-nav-associated', path: '/model/association' },
      { id: 'field-template', name: '字段组合模板', icon: 'icon-cc-menu-field-template', path: '/model/field-template' }
    ]
  },
  {
    id: 'analysis',
    name: '运营分析',
    icon: 'icon-cc-nav-analysis',
    children: [
      { id: 'audit', name: '操作审计', icon: 'icon-cc-nav-audit-02', path: '/analysis/audit' },
      { id: 'operation', name: '运营统计', icon: 'icon-cc-statistics', path: '/analysis/operation' }
    ]
  },
  {
    id: 'platform',
    name: '平台管理',
    icon: 'icon-cc-nav-platform',
    children: [
      { id: 'global-config', name: '全局配置', icon: 'icon-cc-setting', path: '/platform/global-config' }
    ]
  }
]

// 把菜单模板路径(:bizId)渲染成真实跳转地址;旧版由 getMenuLink 注入 params.bizId
export function menuLinkPath(child, bizId) {
  if (!child.path?.includes(':bizId')) return child.path
  return child.path.replace(':bizId', bizId == null ? '' : String(bizId))
}

// 逐段匹配路由模板(/business/:bizId/index ↔ /business/3/index)
function matchSegments(pattern, path) {
  const patternSegs = pattern.split('/')
  const pathSegs = path.split('/')
  if (patternSegs.length !== pathSegs.length) return null
  const params = {}
  for (let i = 0; i < patternSegs.length; i += 1) {
    const seg = patternSegs[i]
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(pathSegs[i])
    else if (seg !== pathSegs[i]) return null
  }
  return params
}

export function findMenuByPath(path) {
  for (const top of MENUS) {
    if (top.path && matchSegments(top.path, path)) return { top, child: null, params: {} }
    for (const child of top.children || []) {
      const params = matchSegments(child.path, path)
      if (params) return { top, child, params }
    }
  }
  return null
}

const LEGACY_ROUTE_FAMILIES = [
  // 业务视图附属页(主机详情/Pod)在导航上归属业务拓扑
  { pattern: /^\/business\/[^/]+\/host(?:\/.*)?$/, path: '/business/:bizId/index' },
  { pattern: /^\/business\/[^/]+\/pod(?:\/.*)?$/, path: '/business/:bizId/index' },
  // 组件直出的子页深链(服务模板创建/详情/编辑等)归属各自菜单
  { pattern: /^\/business\/[^/]+\/service\/template\/.+$/, path: '/business/:bizId/service/template' },
  { pattern: /^\/business\/[^/]+\/set\/template\/.+$/, path: '/business/:bizId/set/template' },
  { pattern: /^\/business\/[^/]+\/host-apply\/.+$/, path: '/business/:bizId/host-apply' },
  // 旧版拼写 category 与规范化前的变体路径
  { pattern: /^\/business\/[^/]+\/service\/category(?:\/.*)?$/, path: '/business/:bizId/service/cagetory' },
  // 业务同步为非菜单页,保持与旧版一致(无导航上下文)
  { pattern: /^\/business\/[^/]+\/(?:synchronous|sync)(?:\/.*)?$/, path: '/business/sync' },
  { pattern: /^\/business\/[^/]+\/service\/(?:instance|delete)(?:\/.*)?$/, path: '/business/:bizId/index' },
  { pattern: /^\/business\/[^/]+\/set\/sync(?:\/.*)?$/, path: '/business/:bizId/set/template' },
  { pattern: /^\/business-set\/[^/]+(?:\/.*)?$/, path: '/biz-set/topo' },
  { pattern: /^\/business\/details\/[^/]+$/, path: '/resource/business' },
  { pattern: /^\/resource\/(?:business-set|biz-set)(?:\/.*)?$/, path: '/resource/biz-set' },
  { pattern: /^\/resource\/project(?:\/.*)?$/, path: '/resource/project' },
  { pattern: /^\/resource\/(?:biz-set|business-set)(?:\/.*)?$/, path: '/resource/biz-set' },
  { pattern: /^\/resource\/business(?:\/.*)?$/, path: '/resource/business' },
  { pattern: /^\/resource\/host(?:\/.*)?$/, path: '/resource/host' },
  { pattern: /^\/resource\/instance(?:\/.*)?$/, path: '/resource/index' },
  { pattern: /^\/resource\/(?:catalog|history)(?:\/.*)?$/, path: '/resource/index' },
  { pattern: /^\/resource\/cloud-area(?:\/.*)?$/, path: '/resource/cloud-area' },
  { pattern: /^\/resource\/cloud-account(?:\/.*)?$/, path: '/resource/cloud-account' },
  { pattern: /^\/resource\/cloud-discover(?:\/.*)?$/, path: '/resource/cloud-discover' },
  { pattern: /^\/host-detail$/, path: '/resource/host' },
  { pattern: /^\/model\/management\/details(?:\/.*)?$/, path: '/model/management' },
  { pattern: /^\/model\/index(?:\/.*)?$/, path: '/model/management' },
  { pattern: /^\/model\/all\/topology(?:\/.*)?$/, path: '/model/topology' },
  { pattern: /^\/platform-management(?:\/.*)?$/, path: '/platform/global-config' }
]

/**
 * Resolve the same menu context for canonical routes and legacy deep links.
 * The resolver is shared by the shell so a deep link cannot lose its nav context.
 */
export function resolveMenuByRoute(route) {
  const path = typeof route === 'string' ? route : route?.path || ''
  const exact = findMenuByPath(path)
  if (exact) return exact

  const family = LEGACY_ROUTE_FAMILIES.find((item) => item.pattern.test(path))
  return family ? findMenuByPath(family.path) : null
}

export function isHomeRoute(route) {
  const path = typeof route === 'string' ? route : route?.path || ''
  return path === '/index' || path === '/'
}
