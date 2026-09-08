// 一级 / 二级菜单结构:与旧版 src/ui/src/dictionary/menu.js 保持一致
// icon 取自旧版 bk-icon-cmdb 字体(iconcool.json),在 TheNav 中渲染
export const MENUS = [
  {
    id: 'index',
    name: '首页',
    icon: 'icon-cc-nav-home',
    path: '/index'
  },
  {
    id: 'business',
    name: '业务',
    icon: 'icon-cc-nav-business',
    children: [
      { id: 'topo', name: '业务拓扑', icon: 'icon-cc-host', path: '/business/topo', biz: true },
      { id: 'service-template', name: '服务模板', icon: 'icon-cc-service-template', path: '/business/service-template', biz: true },
      { id: 'set-template', name: '集群模板', icon: 'icon-cc-set-template', path: '/business/set-template', biz: true },
      { id: 'service-category', name: '服务分类', icon: 'icon-cc-nav-service-topo', path: '/business/service-category', biz: true },
      { id: 'host-apply', name: '主机自动应用', icon: 'icon-cc-host-apply', path: '/business/host-apply', biz: true },
      { id: 'dynamic-group', name: '动态分组', icon: 'icon-cc-custom-query', path: '/business/dynamic-group', biz: true },
      { id: 'custom-fields', name: '自定义字段', icon: 'icon-cc-custom-field', path: '/business/custom-fields' }
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
      { id: 'global-config', name: '全局配置', icon: 'icon-cc-setting', path: '/platform/global-config' },
      { id: 'roadmap', name: '功能路线', icon: 'icon-cc-roadmap', path: '/platform/roadmap' }
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
