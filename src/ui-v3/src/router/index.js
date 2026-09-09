import { createRouter, createWebHashHistory } from 'vue-router'

// web_server 的 NoRoute 会 302 到 /#/404,因此前端必须使用 hash 路由
// 路由结构与旧版菜单(dictionary/menu.js)一一对应
const ComingSoon = () => import('../views/ComingSoon.vue')

const legacyQuery = (to, values = {}) => ({
  ...to.query,
  ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''))
})

const legacyBizQuery = (to, extra = {}) => legacyQuery(to, {
  ...extra,
  ...(to.params.bizId ? { biz: to.params.bizId } : {})
})

const legacyStage = (segments) => segments.slice(1).join('/') || undefined

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
        { path: 'business/:bizId/index', name: 'LegacyBusinessTopo', component: () => import('../views/BusinessTopo.vue'), meta: { title: '业务拓扑' } },
        { path: 'business/:bizId/host/:id', name: 'LegacyBusinessHostDetail', component: () => import('../views/hosts/HostDetail.vue'), meta: { title: '主机详情', bare: true } },
        { path: 'biz-set/topo', name: 'BizSetTopo', component: () => import('../views/biz-set/BizSetTopo.vue'), meta: { title: '业务集拓扑' } },
        { path: 'business-set/:bizSetId/index', name: 'LegacyBizSetTopo', component: () => import('../views/biz-set/BizSetTopo.vue'), meta: { title: '业务集拓扑' } },
        { path: 'business-set/:bizSetId/host/:id', name: 'LegacyBizSetHostDetail', component: () => import('../views/hosts/HostDetail.vue'), meta: { title: '主机详情', bare: true } },
        { path: 'business/sync', name: 'BusinessSync', component: () => import('../views/business-sync/BusinessSync.vue'), meta: { title: '业务同步' } },
        { path: 'business/service-template', name: 'ServiceTemplate', component: () => import('../views/service/ServiceTemplate.vue'), meta: { title: '服务模板' } },
        { path: 'business/:bizId/service/template/create', name: 'LegacySvcTplCreate', component: () => import('../views/service/ServiceTemplate.vue'), meta: { title: '服务模板' } },
        { path: 'business/:bizId/service/template/details/:templateId', name: 'LegacySvcTplDetails', component: () => import('../views/service/ServiceTemplate.vue'), meta: { title: '服务模板' } },
        { path: 'business/:bizId/service/template/edit/:templateId', name: 'LegacySvcTplEdit', component: () => import('../views/service/ServiceTemplate.vue'), meta: { title: '服务模板' } },
        { path: 'business/:bizId/service/operational/template/:templateId?', name: 'LegacySvcTplOperational', redirect: (to) => (to.params.templateId
          ? { path: `/business/${to.params.bizId}/service/template/details/${to.params.templateId}` }
          : { path: '/business/service-template' }), meta: { title: '服务模板' } },
        { path: 'business/process-template', name: 'ProcessTemplate', component: () => import('../views/service/ProcessTemplate.vue'), meta: { title: '进程模板' } },
        { path: 'business/set-template', name: 'SetTemplate', component: () => import('../views/service/ServiceTemplate.vue'), meta: { title: '集群模板', tab: 'settpl' } },
        { path: 'business/service-category', name: 'ServiceCategory', component: () => import('../views/service-category/Index.vue'), meta: { title: '服务分类' } },
        { path: 'business/host-apply', name: 'HostApply', component: () => import('../views/host-apply/HostApply.vue'), meta: { title: '主机自动应用' } },
        { path: 'business/:bizId/service-category', name: 'LegacyServiceCategory', redirect: (to) => ({ path: '/business/service-category', query: legacyBizQuery(to) }), meta: { title: '服务分类' } },
        { path: 'business/:bizId/service/cagetory', name: 'LegacyServiceCagetory', redirect: (to) => ({ path: '/business/service-category', query: legacyBizQuery(to) }), meta: { title: '服务分类' } },
        { path: 'business/:bizId?/custom-query', name: 'LegacyDynamicGroupByBiz', redirect: (to) => ({ path: '/business/dynamic-group', query: legacyBizQuery(to) }), meta: { title: '动态分组' } },
        { path: 'custom-query', name: 'LegacyDynamicGroup', redirect: (to) => ({ path: '/business/dynamic-group', query: legacyQuery(to) }), meta: { title: '动态分组' } },
        { path: 'business/:bizId/service/instance', name: 'LegacyServiceInstance', redirect: (to) => ({ path: '/business/topo', query: legacyBizQuery(to, { tab: 'instance' }) }), meta: { title: '服务实例' } },
        { path: 'business/:bizId/service/delete/:moduleId?/:ids', name: 'LegacyServiceDelete', redirect: (to) => ({ path: '/business/topo', query: legacyBizQuery(to, { tab: 'instance', deleteIds: to.params.ids, module: to.params.moduleId }) }), meta: { title: '服务实例' } },
        { path: 'business/:bizId/host-apply/:rest(.*)?', name: 'LegacyHostApply', redirect: (to) => {
          const seg = String(to.params.rest || '').split('/').filter(Boolean)
          const mode = ['module', 'template'].includes(seg[0]) ? seg[0] : 'module'
          return { path: '/business/host-apply', query: legacyBizQuery(to, { mode, stage: legacyStage(seg) }) }
        }, meta: { title: '主机自动应用' } },
        { path: 'business/:bizId/set/template', name: 'LegacySetTpl', redirect: (to) => ({ path: '/business/set-template', query: legacyBizQuery(to) }), meta: { title: '集群模板' } },
        { path: 'business/:bizId/set/template/create', name: 'LegacySetTplCreate', redirect: (to) => ({ path: '/business/set-template', query: legacyBizQuery(to, { action: 'create' }) }), meta: { title: '集群模板' } },
        { path: 'business/:bizId/set/template/details/:templateId', name: 'LegacySetTplDetails', redirect: (to) => ({ path: '/business/set-template', query: legacyBizQuery(to, { action: 'details', templateId: to.params.templateId }) }), meta: { title: '集群模板' } },
        { path: 'business/:bizId/set/template/edit/:templateId', name: 'LegacySetTplEdit', redirect: (to) => ({ path: '/business/set-template', query: legacyBizQuery(to, { action: 'edit', templateId: to.params.templateId }) }), meta: { title: '集群模板' } },
        { path: 'business/:bizId/set/instance/history/:templateId?', name: 'LegacySetTplHistory', redirect: (to) => ({ path: '/business/set-template', query: legacyBizQuery(to, { action: 'history', templateId: to.params.templateId }) }), meta: { title: '集群模板' } },
        { path: 'business/:bizId/set/sync/:setTemplateId', name: 'LegacySetSync', redirect: (to) => ({ path: '/business/set-template', query: legacyBizQuery(to, { action: 'sync', templateId: to.params.setTemplateId }) }), meta: { title: '集群模板同步' } },
        { path: 'business/:bizId/synchronous/module/:template/:modules', name: 'LegacyBizSync', redirect: (to) => ({ path: '/business/sync', query: legacyBizQuery(to, { template: to.params.template, modules: to.params.modules, source: 'module' }) }), meta: { title: '业务同步' } },
        { path: 'business/:bizId/sync/service-template/:template/:modules', name: 'LegacyTplSync', redirect: (to) => ({ path: '/business/sync', query: legacyBizQuery(to, { template: to.params.template, modules: to.params.modules, source: 'service-template' }) }), meta: { title: '业务同步' } },
        { path: 'business/dynamic-group', name: 'DynamicGroup', component: () => import('../views/dynamic-group/DynamicGroup.vue'), meta: { title: '动态分组' } },
        { path: 'business/custom-fields', name: 'CustomFields', component: () => import('../views/custom-fields/CustomFields.vue'), meta: { title: '自定义字段' } },

        // 资源
        { path: 'resource/index', name: 'ResourceIndex', component: () => import('../views/resource/ResourceIndex.vue'), meta: { title: '资源目录' } },
        { path: 'resource/project', name: 'Project', component: () => import('../views/project/Project.vue'), meta: { title: '项目' } },
        { path: 'resource/project/details/:projectId', name: 'ProjectDetail', component: () => import('../views/project/ProjectDetail.vue'), meta: { title: '项目详情' } },
        { path: 'resource/biz-set', name: 'BizSetList', component: () => import('../views/biz-set/BizSet.vue'), meta: { title: '业务集' } },
        { path: 'resource/business-set', name: 'LegacyBizSetList', redirect: '/resource/biz-set', meta: { title: '业务集' } },
        { path: 'resource/biz-set/details/:bizSetId', name: 'BizSetDetail', component: () => import('../views/biz-set/BizSetDetail.vue'), meta: { title: '业务集详情' } },
        { path: 'resource/business-set/details/:bizSetId', name: 'LegacyBizSetDetail', redirect: (to) => ({ path: `/resource/biz-set/details/${to.params.bizSetId}` }), meta: { title: '业务集详情' } },
        { path: 'resource/business', name: 'Business', component: () => import('../views/BusinessList.vue'), meta: { title: '业务' } },
        { path: 'resource/business/details/:bizId', name: 'BusinessDetail', component: () => import('../views/business/BusinessDetail.vue'), meta: { title: '业务详情' } },
        { path: 'business/details/:bizId', name: 'LegacyBusinessDetail', redirect: (to) => ({ path: `/resource/business/details/${to.params.bizId}` }), meta: { title: '业务详情' } },
        { path: 'resource/catalog/:objId', name: 'ResourceCatalog', component: () => import('../views/resource/ResourceCatalog.vue'), meta: { title: '资源分类' } },
        { path: 'resource/instance/:objId', name: 'InstanceList', component: () => import('../views/instance/InstanceList.vue'), meta: { title: '模型实例' } },
        { path: 'resource/history/host', name: 'HostDeleteHistory', component: () => import('../views/history/DeleteHistory.vue'), meta: { title: '主机删除历史' } },
        { path: 'resource/history/instance/:objId', name: 'InstanceDeleteHistory', component: () => import('../views/history/DeleteHistory.vue'), meta: { title: '删除历史' } },
        { path: 'resource/instance/:objId/history', redirect: (to) => `/resource/history/instance/${to.params.objId}`, meta: { title: '删除历史' } },
        { path: 'resource/instance/:objId/:instId', name: 'LegacyInstanceDetail', redirect: (to) => ({ path: `/resource/instance/${to.params.objId}`, query: { instId: to.params.instId } }), meta: { title: '模型实例' } },
        { path: 'resource/host', name: 'ResourceHost', component: () => import('../views/HostList.vue'), meta: { title: '主机' } },
        { path: 'resource/host/:id', name: 'LegacyResourceHostDetail', component: () => import('../views/hosts/HostDetail.vue'), meta: { title: '主机详情', bare: true } },
        { path: 'resource/host/:business/:id', name: 'LegacyBusinessResourceHostDetail', component: () => import('../views/hosts/HostDetail.vue'), meta: { title: '主机详情', bare: true } },
        { path: 'resource/cloud-area', name: 'CloudArea', component: () => import('../views/cloud/CloudArea.vue'), meta: { title: '管控区域' } },
        { path: 'resource/cloud-account', name: 'CloudAccount', component: () => import('../views/cloud/CloudAccount.vue'), meta: { title: '云账户' } },
        { path: 'resource/cloud-discover', name: 'CloudDiscover', component: () => import('../views/cloud/CloudDiscover.vue'), meta: { title: '云资源发现' } },

        // 模型
        { path: 'model/management', name: 'Models', component: () => import('../views/model/ModelManage.vue'), meta: { title: '模型管理' } },
        { path: 'model/index', name: 'LegacyModels', redirect: '/model/management', meta: { title: '模型管理' } },
        { path: 'model/index/details/:modelId', name: 'LegacyModelDetail', redirect: (to) => `/model/management/details/${to.params.modelId}`, meta: { title: '模型详情' } },
        { path: 'model/management/details/:objId', name: 'ModelDetail', component: () => import('../views/model/ModelDetail.vue'), meta: { title: '模型详情' } },
        { path: 'model/topology', name: 'ModelTopology', component: () => import('../views/model/ModelTopology.vue'), meta: { title: '模型拓扑' } },
        { path: 'model/all/topology/new', name: 'LegacyModelTopology', redirect: '/model/topology', meta: { title: '模型拓扑' } },
        { path: 'model/relation', name: 'ModelRelation', component: () => import('../views/model/AssociationType.vue'), meta: { title: '模型关系', tab: 'relations' } },
        { path: 'model/association', name: 'AssociationTypes', component: () => import('../views/model/AssociationType.vue'), meta: { title: '关联类型', tab: 'types' } },
        { path: 'model/field-template', name: 'FieldTemplate', component: () => import('../views/model/FieldTemplate.vue'), meta: { title: '字段组合模板' } },
        { path: 'model/field-template/create', name: 'LegacyFieldTemplateCreate', redirect: { path: '/model/field-template', query: { action: 'create' } }, meta: { title: '字段组合模板' } },
        { path: 'model/field-template/edit/:id', name: 'LegacyFieldTemplateEdit', redirect: (to) => ({ path: '/model/field-template', query: { action: 'edit', id: to.params.id } }), meta: { title: '字段组合模板' } },
        { path: 'model/field-template/bind/:id', name: 'LegacyFieldTemplateBind', redirect: (to) => ({ path: '/model/field-template', query: { action: 'bind', id: to.params.id } }), meta: { title: '字段组合模板' } },
        { path: 'model/field-template/sync/:id/model/:modelId', name: 'LegacyFieldTemplateSync', redirect: (to) => ({ path: '/model/field-template', query: { action: 'sync', id: to.params.id, modelId: to.params.modelId } }), meta: { title: '字段组合模板' } },
        { path: 'business/service-instance', name: 'ServiceInstance', component: () => import('../views/service/ServiceInstance.vue'), meta: { title: '服务实例' } },

        // 运营分析
        { path: 'analysis/audit', name: 'Audit', component: () => import('../views/audit/AuditList.vue'), meta: { title: '操作审计' } },
        { path: 'analysis/operation', name: 'Operation', component: () => import('../views/operation/Operation.vue'), meta: { title: '运营统计' } },

        // 平台管理
        { path: 'platform/global-config', name: 'GlobalConfig', component: () => import('../views/platform/GlobalConfig.vue'), meta: { title: '全局配置' } },
        { path: 'platform-management/global-config', name: 'LegacyGlobalConfig', redirect: (to) => ({ path: '/platform/global-config', query: to.query }), meta: { title: '全局配置' } },
        { path: 'platform-management', name: 'LegacyPlatform', redirect: '/platform/global-config', meta: { title: '平台管理' } },
        { path: 'platform/roadmap', name: 'Roadmap', component: () => import('../views/Roadmap.vue'), meta: { title: '功能路线' } },

        // 主机详情(独立页)
        { path: 'host-landing/:ip/:cloudId?', name: 'LegacyHostLanding', redirect: (to) => ({ path: '/resource/host', query: { ip: to.params.ip, cloudId: to.params.cloudId || undefined } }), meta: { title: '主机搜索' } },
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
