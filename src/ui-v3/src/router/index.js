import { createRouter, createWebHashHistory } from 'vue-router'

// web_server 的 NoRoute 会 302 到 /#/404,因此前端必须使用 hash 路由
// 路由结构与旧版菜单(dictionary/menu.js)一一对应
const ComingSoon = () => import('../views/ComingSoon.vue')

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: () => import('../layout/MainLayout.vue'),
      redirect: '/index',
      children: [
        { path: 'index', name: 'Index', component: () => import('../views/IndexHome.vue'), meta: { title: '首页' } },

        // 业务
        { path: 'business/topo', name: 'Topo', component: () => import('../views/BusinessTopo.vue'), meta: { title: '业务拓扑' } },
        { path: 'biz-set/topo', name: 'BizSetTopo', component: () => import('../views/biz-set/BizSetTopo.vue'), meta: { title: '业务集拓扑' } },
        { path: 'business/sync', name: 'BusinessSync', component: () => import('../views/business-sync/BusinessSync.vue'), meta: { title: '业务同步' } },
        { path: 'business/service-template', name: 'ServiceTemplate', component: () => import('../views/service/ServiceTemplate.vue'), meta: { title: '服务模板' } },
        { path: 'business/set-template', name: 'SetTemplate', component: () => import('../views/service/ServiceTemplate.vue'), meta: { title: '集群模板', tab: 'settpl' } },
        { path: 'business/service-category', name: 'ServiceCategory', component: () => import('../views/service-category/Index.vue'), meta: { title: '服务分类' } },
        { path: 'business/host-apply', name: 'HostApply', component: () => import('../views/host-apply/HostApply.vue'), meta: { title: '主机自动应用' } },
        { path: 'business/dynamic-group', name: 'DynamicGroup', component: () => import('../views/dynamic-group/DynamicGroup.vue'), meta: { title: '动态分组' } },
        { path: 'business/custom-fields', name: 'CustomFields', component: () => import('../views/custom-fields/CustomFields.vue'), meta: { title: '自定义字段' } },

        // 资源
        { path: 'resource/index', name: 'ResourceIndex', component: () => import('../views/resource/ResourceIndex.vue'), meta: { title: '资源目录' } },
        { path: 'resource/project', name: 'Project', component: () => import('../views/project/Project.vue'), meta: { title: '项目' } },
        { path: 'resource/biz-set', name: 'BizSetList', component: () => import('../views/biz-set/BizSet.vue'), meta: { title: '业务集' } },
        { path: 'resource/business', name: 'Business', component: () => import('../views/BusinessList.vue'), meta: { title: '业务' } },
        { path: 'resource/catalog/:objId', name: 'ResourceCatalog', component: () => import('../views/resource/ResourceCatalog.vue'), meta: { title: '资源分类' } },
        { path: 'resource/host', name: 'ResourceHost', component: () => import('../views/HostList.vue'), meta: { title: '主机' } },
        { path: 'resource/cloud-area', name: 'CloudArea', component: () => import('../views/cloud/Cloud.vue'), meta: { title: '管控区域', tab: 'area' } },
        { path: 'resource/cloud-account', name: 'CloudAccount', component: () => import('../views/cloud/Cloud.vue'), meta: { title: '云账户', tab: 'account' } },
        { path: 'resource/cloud-discover', name: 'CloudDiscover', component: () => import('../views/cloud/CloudDiscover.vue'), meta: { title: '云资源发现' } },

        // 模型
        { path: 'model/management', name: 'Models', component: () => import('../views/model/ModelManage.vue'), meta: { title: '模型管理' } },
        { path: 'model/management/details/:objId', name: 'ModelDetail', component: () => import('../views/model/ModelDetail.vue'), meta: { title: '模型详情' } },
        { path: 'model/topology', name: 'ModelTopology', component: () => import('../views/model/ModelTopology.vue'), meta: { title: '模型拓扑' } },
        { path: 'model/relation', name: 'ModelRelation', component: () => import('../views/model/AssociationType.vue'), meta: { title: '模型关系', tab: 'relations' } },
        { path: 'model/association', name: 'AssociationTypes', component: () => import('../views/model/AssociationType.vue'), meta: { title: '关联类型', tab: 'types' } },
        { path: 'model/field-template', name: 'FieldTemplate', component: () => import('../views/model/FieldTemplate.vue'), meta: { title: '字段组合模板' } },
        { path: 'business/service-instance', name: 'ServiceInstance', component: () => import('../views/service/ServiceInstance.vue'), meta: { title: '服务实例' } },

        // 运营分析
        { path: 'analysis/audit', name: 'Audit', component: () => import('../views/audit/AuditList.vue'), meta: { title: '操作审计' } },
        { path: 'analysis/operation', name: 'Operation', component: () => import('../views/operation/Operation.vue'), meta: { title: '运营统计' } },

        // 平台管理
        { path: 'platform/global-config', name: 'GlobalConfig', component: () => import('../views/platform/GlobalConfig.vue'), meta: { title: '全局配置' } },
        { path: 'platform/roadmap', name: 'Roadmap', component: () => import('../views/Roadmap.vue'), meta: { title: '功能路线' } },

        // 主机详情(独立页)
        { path: 'host-detail', name: 'HostDetail', component: () => import('../views/hosts/HostDetail.vue'), meta: { title: '主机详情', bare: true } }
      ]
    },
    { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('../views/NotFound.vue') }
  ]
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - 蓝鲸配置平台` : '蓝鲸配置平台'
})

export default router
