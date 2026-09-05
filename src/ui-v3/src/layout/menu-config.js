// 一级 / 二级菜单结构:与旧版 src/ui/src/dictionary/menu.js 保持一致
export const MENUS = [
  {
    id: 'index',
    name: '首页',
    path: '/index'
  },
  {
    id: 'business',
    name: '业务',
    children: [
      { id: 'topo', name: '业务拓扑', path: '/business/topo', biz: true },
      { id: 'service-template', name: '服务模板', path: '/business/service-template', biz: true },
      { id: 'set-template', name: '集群模板', path: '/business/set-template', biz: true },
      { id: 'service-category', name: '服务分类', path: '/business/service-category', biz: true },
      { id: 'host-apply', name: '主机自动应用', path: '/business/host-apply', biz: true },
      { id: 'dynamic-group', name: '动态分组', path: '/business/dynamic-group', biz: true },
      { id: 'custom-fields', name: '自定义字段', path: '/business/custom-fields' }
    ]
  },
  {
    id: 'resource',
    name: '资源',
    children: [
      { id: 'index', name: '资源目录', path: '/resource/index' },
      { id: 'host', name: '主机', path: '/resource/host' },
      { id: 'cloud-area', name: '管控区域', path: '/resource/cloud-area' },
      { id: 'cloud-account', name: '云账户', path: '/resource/cloud-account' },
      { id: 'cloud-discover', name: '云资源发现', path: '/resource/cloud-discover' }
    ]
  },
  {
    id: 'model',
    name: '模型',
    children: [
      { id: 'management', name: '模型管理', path: '/model/management' },
      { id: 'topology', name: '模型拓扑', path: '/model/topology' },
      { id: 'relation', name: '模型关系', path: '/model/relation' },
      { id: 'hierarchy', name: '业务层级', path: '/model/hierarchy' },
      { id: 'association', name: '关联类型', path: '/model/association' },
      { id: 'field-template', name: '字段组合模板', path: '/model/field-template' }
    ]
  },
  {
    id: 'analysis',
    name: '运营分析',
    children: [
      { id: 'audit', name: '操作审计', path: '/analysis/audit' },
      { id: 'operation', name: '运营统计', path: '/analysis/operation' }
    ]
  },
  {
    id: 'platform',
    name: '平台管理',
    children: [
      { id: 'global-config', name: '全局配置', path: '/platform/global-config' },
      { id: 'roadmap', name: '功能路线', path: '/platform/roadmap' }
    ]
  }
]

export function findMenuByPath(path) {
  for (const top of MENUS) {
    if (top.path === path) return { top, child: null }
    for (const child of top.children || []) {
      if (child.path === path) return { top, child }
    }
  }
  return null
}
