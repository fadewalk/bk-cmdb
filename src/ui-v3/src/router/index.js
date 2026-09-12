import { createRouter, createWebHashHistory } from 'vue-router'
import StatusError from './StatusError'

// web_server 的 NoRoute 会 302 到 /#/404,因此前端必须使用 hash 路由
// 路由结构与旧版菜单(dictionary/menu.js)一一对应
const legacyQuery = (to, values = {}) => ({
  ...to.query,
  ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''))
})

// 业务 ID 从 query 移入路径后,旧 query.biz 不再出现在规范 URL 中
const withoutBiz = (query = {}) => Object.fromEntries(Object.entries(query).filter(([key]) => key !== 'biz'))

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

        // 业务:七个菜单的规范路由,URL 与旧版完全一致(业务 ID 在路径中)
        { path: 'business/:bizId/index', name: 'BusinessTopo', component: () => import('../views/BusinessTopo.vue'), meta: { title: '业务拓扑' } },
        { path: 'business/:bizId/service/template', name: 'ServiceTemplate', component: () => import('../views/service/ServiceTemplate.vue'), meta: { title: '服务模板' } },
        { path: 'business/:bizId/set/template', name: 'SetTemplate', component: () => import('../views/service/ServiceTemplate.vue'), meta: { title: '集群模板', tab: 'settpl' } },
        { path: 'business/:bizId/host/transfer/:type/:module?', name: 'HostTransfer', component: () => import('../views/hosts/HostTransfer.vue'), meta: { title: '主机转移' } },
        { path: 'business/:bizId/service/cagetory', name: 'ServiceCategory', component: () => import('../views/service-category/Index.vue'), meta: { title: '服务分类' } },
        { path: 'business/:bizId/host-apply', name: 'HostApply', component: () => import('../views/host-apply/HostApply.vue'), meta: { title: '主机自动应用' } },
        { path: 'business/:bizId/custom-query', name: 'DynamicGroup', component: () => import('../views/dynamic-group/DynamicGroup.vue'), meta: { title: '动态分组' } },
        { path: 'business/:bizId/custom-fields', name: 'CustomFields', component: () => import('../views/custom-fields/CustomFields.vue'), meta: { title: '自定义字段' } },

        // 平铺旧路径(ui-v3 过渡产物):守卫补齐业务 ID 后重定向到规范路由
        { path: 'business', name: 'LegacyBusinessRoot', redirect: '/business/topo', meta: { title: '业务' } },
        { path: 'business/topo', name: 'LegacyTopoFlat', component: () => import('../views/BusinessTopo.vue'), meta: { title: '业务拓扑', legacyFlat: '/business/:bizId/index' } },
        { path: 'business/service-template', name: 'LegacySvcTplFlat', component: () => import('../views/service/ServiceTemplate.vue'), meta: { title: '服务模板', legacyFlat: '/business/:bizId/service/template' } },
        { path: 'business/set-template', name: 'LegacySetTplFlat', component: () => import('../views/service/ServiceTemplate.vue'), meta: { title: '集群模板', tab: 'settpl', legacyFlat: '/business/:bizId/set/template' } },
        { path: 'business/service-category', name: 'LegacyServiceCategoryFlat', component: () => import('../views/service-category/Index.vue'), meta: { title: '服务分类', legacyFlat: '/business/:bizId/service/cagetory' } },
        { path: 'business/host-apply', name: 'LegacyHostApplyFlat', component: () => import('../views/host-apply/HostApply.vue'), meta: { title: '主机自动应用', legacyFlat: '/business/:bizId/host-apply' } },
        { path: 'business/dynamic-group', name: 'LegacyDynamicGroupFlat', component: () => import('../views/dynamic-group/DynamicGroup.vue'), meta: { title: '动态分组', legacyFlat: '/business/:bizId/custom-query' } },
        { path: 'business/custom-fields', name: 'LegacyCustomFieldsFlat', component: () => import('../views/custom-fields/CustomFields.vue'), meta: { title: '自定义字段', legacyFlat: '/business/:bizId/custom-fields' } },

        // 旧版深链(与老前端 URL 同构)
        { path: 'business/:bizId/host/:id', name: 'BusinessHostDetail', component: () => import('../views/hosts/HostDetail.vue'), meta: { title: '主机详情', bare: true } },
        { path: 'biz-set/topo', name: 'BizSetTopo', component: () => import('../views/biz-set/BizSetTopo.vue'), meta: { title: '业务集拓扑' } },
        { path: 'business-set/:bizSetId/index', name: 'BizSetTopoLegacy', component: () => import('../views/biz-set/BizSetTopo.vue'), meta: { title: '业务集拓扑' } },
        { path: 'business-set/:bizSetId/host/:id', name: 'BizSetHostDetailLegacy', component: () => import('../views/hosts/HostDetail.vue'), meta: { title: '主机详情', bare: true } },
        { path: 'business/sync', name: 'BusinessSync', component: () => import('../views/business-sync/BusinessSync.vue'), meta: { title: '业务同步' } },
        { path: 'business/:bizId/service/template/create', name: 'SvcTplCreate', component: () => import('../views/service/ServiceTemplateCreate.vue'), meta: { title: '新建服务模板' } },
        { path: 'business/:bizId/service/template/details/:templateId', name: 'SvcTplDetails', component: () => import('../views/service/ServiceTemplate.vue'), meta: { title: '服务模板' } },
        { path: 'business/:bizId/service/template/edit/:templateId', name: 'SvcTplEdit', component: () => import('../views/service/ServiceTemplateCreate.vue'), meta: { title: '编辑服务模板' } },
        { path: 'business/:bizId/service/operational/template/:templateId?', name: 'SvcTplOperational', redirect: (to) => (to.params.templateId
          ? { path: `/business/${to.params.bizId}/service/template/details/${to.params.templateId}` }
          : { path: `/business/${to.params.bizId}/service/template` }), meta: { title: '服务模板' } },
        { path: 'business/process-template', name: 'ProcessTemplate', component: () => import('../views/service/ProcessTemplate.vue'), meta: { title: '进程模板' } },
        { path: 'business/:bizId/service-category', name: 'ServiceCategoryVariant', redirect: (to) => ({ path: `/business/${to.params.bizId}/service/cagetory`, query: withoutBiz(to.query) }), meta: { title: '服务分类' } },
        { path: 'business/:bizId/service/category', name: 'ServiceCategoryTypo', redirect: (to) => ({ path: `/business/${to.params.bizId}/service/cagetory`, query: withoutBiz(to.query) }), meta: { title: '服务分类' } },
        { path: 'custom-query', name: 'DynamicGroupBizless', redirect: (to) => ({ path: '/business/dynamic-group', query: legacyQuery(to) }), meta: { title: '动态分组' } },
        { path: 'business/:bizId/service/instance', name: 'ServiceInstanceLegacy', redirect: (to) => ({ path: '/business/topo', query: legacyBizQuery(to, { tab: 'instance' }) }), meta: { title: '服务实例' } },
        // 老版 create/clone 路径深链(service-instance/router.config.js 同构):落到拓扑服务实例 tab 并预选模块
        { path: 'business/:bizId/service/instance/create/set/:setId/module/:moduleId', name: 'SvcInstCreateLegacy', redirect: (to) => ({ path: `/business/${to.params.bizId}/index`, query: { tab: 'serviceInstance', action: 'new-svc-instance', node: `module-${to.params.moduleId}` } }), meta: { title: '新建服务实例' } },
        { path: 'business/:bizId/service/instance/clone/set/:setId/module/:moduleId/instance/:instanceId/host/:hostId', name: 'SvcInstCloneLegacy', redirect: (to) => ({ path: '/business/service-instance', query: { biz: to.params.bizId, cloneInstance: to.params.instanceId, module: to.params.moduleId } }), meta: { title: '克隆服务实例' } },
        { path: 'business/:bizId/service/delete/:moduleId?/:ids', name: 'ServiceDeleteLegacy', redirect: (to) => ({ path: '/business/topo', query: legacyBizQuery(to, { tab: 'instance', deleteIds: to.params.ids, module: to.params.moduleId }) }), meta: { title: '服务实例' } },
        // 注意:rest 不可选(?),否则空 rest 会与规范路由 /business/:bizId/host-apply 形成无限重定向
        { path: 'business/:bizId/host-apply/:rest(.*)', name: 'HostApplyLegacy', redirect: (to) => {
          const seg = String(to.params.rest || '').split('/').filter(Boolean)
          const mode = ['module', 'template'].includes(seg[0]) ? seg[0] : 'module'
          return { path: `/business/${to.params.bizId}/host-apply`, query: { ...withoutBiz(to.query), mode, stage: legacyStage(seg) } }
        }, meta: { title: '主机自动应用' } },
        { path: 'business/:bizId/set/template/create', name: 'SetTplCreate', component: () => import('../views/service/SetTemplateCreate.vue'), meta: { title: '新建集群模板' } },
        { path: 'business/:bizId/set/template/details/:templateId', name: 'SetTplDetails', component: () => import('../views/service/SetTemplateDetails.vue'), meta: { title: '模板详情' } },
        { path: 'business/:bizId/set/template/edit/:templateId', name: 'SetTplEdit', component: () => import('../views/service/SetTemplateCreate.vue'), meta: { title: '编辑集群模板' } },
        { path: 'business/:bizId/set/instance/history/:templateId?', name: 'SetTplHistory', component: () => import('../views/service/SetSyncHistory.vue'), meta: { title: '同步历史' } },
        { path: 'business/:bizId/set/sync/:setTemplateId', name: 'SetSyncLegacy', component: () => import('../views/service/SetSyncDiff.vue'), meta: { title: '批量同步集群模板' } },
        { path: 'business/:bizId/synchronous/module/:template/:modules', name: 'BizSyncLegacy', redirect: (to) => ({ path: '/business/sync', query: legacyBizQuery(to, { template: to.params.template, modules: to.params.modules, source: 'module' }) }), meta: { title: '业务同步' } },
        { path: 'business/:bizId/sync/service-template/:template/:modules', name: 'TplSyncLegacy', redirect: (to) => ({ path: '/business/sync', query: legacyBizQuery(to, { template: to.params.template, modules: to.params.modules, source: 'service-template' }) }), meta: { title: '业务同步' } },

        // 资源
        { path: 'resource', name: 'ResourceRootLegacy', redirect: '/resource/index', meta: { title: '资源目录' } },
        { path: 'resource/index', name: 'ResourceIndex', component: () => import('../views/resource/ResourceIndex.vue'), meta: { title: '资源目录' } },
        { path: 'resource/project', name: 'Project', component: () => import('../views/project/Project.vue'), meta: { title: '项目' } },
        { path: 'resource/project/details/:projectId', name: 'ProjectDetail', component: () => import('../views/project/ProjectDetail.vue'), meta: { title: '项目详情' } },
        { path: 'resource/biz-set', name: 'BizSetList', component: () => import('../views/biz-set/BizSet.vue'), meta: { title: '业务集' } },
        { path: 'resource/business-set', name: 'BizSetListLegacy', redirect: '/resource/biz-set', meta: { title: '业务集' } },
        { path: 'resource/biz-set/details/:bizSetId', name: 'BizSetDetail', component: () => import('../views/biz-set/BizSetDetail.vue'), meta: { title: '业务集详情' } },
        { path: 'resource/business-set/details/:bizSetId', name: 'BizSetDetailLegacy', redirect: (to) => ({ path: `/resource/biz-set/details/${to.params.bizSetId}` }), meta: { title: '业务集详情' } },
        { path: 'resource/business', name: 'Business', component: () => import('../views/BusinessList.vue'), meta: { title: '业务' } },
        { path: 'resource/business/details/:bizId', name: 'BusinessDetail', component: () => import('../views/business/BusinessDetail.vue'), meta: { title: '业务详情' } },
        { path: 'business/details/:bizId', name: 'BusinessDetailLegacy', redirect: (to) => ({ path: `/resource/business/details/${to.params.bizId}` }), meta: { title: '业务详情' } },
        { path: 'resource/catalog/:objId', name: 'ResourceCatalog', component: () => import('../views/resource/ResourceCatalog.vue'), meta: { title: '资源分类' } },
        { path: 'resource/instance/:objId', name: 'InstanceList', component: () => import('../views/instance/InstanceList.vue'), meta: { title: '模型实例' } },
        { path: 'resource/history/host', name: 'HostDeleteHistory', component: () => import('../views/history/DeleteHistory.vue'), meta: { title: '主机删除历史' } },
        { path: 'resource/history/instance/:objId', name: 'InstanceDeleteHistory', component: () => import('../views/history/DeleteHistory.vue'), meta: { title: '删除历史' } },
        { path: 'resource/instance/:objId/history', redirect: (to) => `/resource/history/instance/${to.params.objId}`, meta: { title: '删除历史' } },
        { path: 'resource/instance/:objId/:instId', name: 'InstanceDetailLegacy', redirect: (to) => ({ path: `/resource/instance/${to.params.objId}`, query: { instId: to.params.instId } }), meta: { title: '模型实例' } },
        { path: 'resource/host', name: 'ResourceHost', component: () => import('../views/HostList.vue'), meta: { title: '主机' } },
        { path: 'resource/host/:id', name: 'ResourceHostDetail', component: () => import('../views/hosts/HostDetail.vue'), meta: { title: '主机详情', bare: true } },
        { path: 'resource/host/:business/:id', name: 'ResourceBizHostDetail', component: () => import('../views/hosts/HostDetail.vue'), meta: { title: '主机详情', bare: true } },
        { path: 'resource/cloud-area', name: 'CloudArea', component: () => import('../views/cloud/CloudArea.vue'), meta: { title: '管控区域' } },
        { path: 'resource/cloud-account', name: 'CloudAccount', component: () => import('../views/cloud/CloudAccount.vue'), meta: { title: '云账户' } },
        { path: 'resource/cloud-discover', name: 'CloudDiscover', component: () => import('../views/cloud/CloudDiscover.vue'), meta: { title: '云资源发现' } },
        { path: 'resource/cloud-resource', name: 'CloudResourceLegacy', redirect: '/resource/cloud-discover', meta: { title: '云资源发现' } },

        // 模型
        { path: 'model', name: 'ModelRootLegacy', redirect: '/model/management', meta: { title: '模型管理' } },
        { path: 'model/management', name: 'Models', component: () => import('../views/model/ModelManage.vue'), meta: { title: '模型管理' } },
        { path: 'model/index', name: 'ModelsLegacy', redirect: '/model/management', meta: { title: '模型管理' } },
        { path: 'model/index/details/:modelId', name: 'ModelDetailLegacy', redirect: (to) => `/model/management/details/${to.params.modelId}`, meta: { title: '模型详情' } },
        { path: 'model/management/details/:objId', name: 'ModelDetail', component: () => import('../views/model/ModelDetail.vue'), meta: { title: '模型详情' } },
        { path: 'model/topology', name: 'ModelTopology', component: () => import('../views/model/ModelTopology.vue'), meta: { title: '模型拓扑' } },
        { path: 'model/all/topology/new', name: 'ModelTopologyLegacy', redirect: '/model/topology', meta: { title: '模型拓扑' } },
        { path: 'model/relation', name: 'ModelRelation', component: () => import('../views/model/AssociationType.vue'), meta: { title: '模型关系', tab: 'relations' } },
        { path: 'model/association', name: 'AssociationTypes', component: () => import('../views/model/AssociationType.vue'), meta: { title: '关联类型', tab: 'types' } },
        { path: 'model/field-template', name: 'FieldTemplate', component: () => import('../views/model/FieldTemplate.vue'), meta: { title: '字段组合模板' } },
        // 新建/编辑两步向导(与旧版 URL 同构:create/basic → create/field-settings)
        { path: 'model/field-template/create', name: 'FieldTemplateCreateLegacy', redirect: '/model/field-template/create/basic', meta: { title: '新建字段组合模板' } },
        { path: 'model/field-template/create/basic', name: 'FieldTemplateCreateBasic', component: () => import('../views/model/FieldTemplateBasic.vue'), meta: { title: '新建字段组合模板' } },
        { path: 'model/field-template/create/field-settings', name: 'FieldTemplateCreateFieldSettings', component: () => import('../views/model/FieldTemplateFieldSettings.vue'), meta: { title: '新建字段组合模板' } },
        { path: 'model/field-template/edit/:id/basic', name: 'FieldTemplateEditBasic', component: () => import('../views/model/FieldTemplateBasic.vue'), meta: { title: '编辑字段组合模板' } },
        { path: 'model/field-template/edit/:id/field-settings', name: 'FieldTemplateEditFieldSettings', component: () => import('../views/model/FieldTemplateFieldSettings.vue'), meta: { title: '编辑字段组合模板' } },
        { path: 'model/field-template/edit/:id', name: 'FieldTemplateEditLegacy', redirect: (to) => `/model/field-template/edit/${to.params.id}/basic`, meta: { title: '编辑字段组合模板' } },
        { path: 'model/field-template/bind/:id', name: 'FieldTemplateBindLegacy', redirect: (to) => ({ path: '/model/field-template', query: { bindId: to.params.id } }), meta: { title: '字段组合模板' } },
        { path: 'model/field-template/sync/:id/model/:modelId', name: 'FieldTemplateSyncLegacy', redirect: { path: '/model/field-template' }, meta: { title: '字段组合模板' } },
        { path: 'business/service-instance', name: 'ServiceInstance', component: () => import('../views/service/ServiceInstance.vue'), meta: { title: '服务实例' } },

        // 运营分析
        { path: 'analysis/audit', name: 'Audit', component: () => import('../views/audit/AuditList.vue'), meta: { title: '操作审计' } },
        { path: 'analysis/operation', name: 'Operation', component: () => import('../views/operation/Operation.vue'), meta: { title: '运营统计' } },

        // 平台管理
        { path: 'platform/global-config', name: 'GlobalConfig', component: () => import('../views/platform/GlobalConfig.vue'), meta: { title: '全局配置' } },
        { path: 'platform-management/global-config', name: 'GlobalConfigLegacy', redirect: (to) => ({ path: '/platform/global-config', query: to.query }), meta: { title: '全局配置' } },
        { path: 'platform-management', name: 'PlatformLegacy', redirect: '/platform/global-config', meta: { title: '平台管理' } },
        { path: 'platform/roadmap', name: 'Roadmap', component: () => import('../views/Roadmap.vue'), meta: { title: '功能路线' } },

        // 主机详情(独立页)
        { path: 'host-landing/:ip/:cloudId?', name: 'HostLandingLegacy', redirect: (to) => ({ path: '/resource/host', query: { ip: to.params.ip, cloudId: to.params.cloudId || undefined } }), meta: { title: '主机搜索' } },
        { path: 'host-detail', name: 'HostDetail', component: () => import('../views/hosts/HostDetail.vue'), meta: { title: '主机详情', bare: true } }
      ]
    },
    { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('../views/NotFound.vue') },
    // 状态路由(老版 status/ 同名独立页,无导航壳)
    { path: '/error', name: 'Error', component: () => import('../views/status/ErrorStatus.vue'), meta: { title: '服务异常' } },
    { path: '/no-business', name: 'NoBusiness', component: () => import('../views/status/NoBusiness.vue'), meta: { title: '无业务权限' } }
  ]
})

// 旧版 business-interceptor + checkViewAuthorize 复刻(router/business-interceptor.js + router/index.js beforeEach):
// 1. 业务视图之间切换业务 → 整页刷新,保证所有页面状态重置(老版即此行为)
// 2. 平铺旧路径 → 补齐业务 ID(?biz= 优先,其次上次选择 selectedBusiness,再次首个业务)后重定向;
//    无任何业务 → /no-business(老版 403 态,不得渲染空表)
// 3. 规范业务路由 → bizId 规范化(非法值回填),业务不存在 → 原位 permission 视图(URL 保留)
// 4. meta.auth.view/superView → auth/verify 校验;失败按老版语义降级(superView 失败整页 permission)
// 5. 守卫异常:StatusError → 状态路由;其余错误 → meta.view='error' 原位错误页,URL 保留
router.beforeEach(async (to, from) => {
  // 进入新路由时重置上一轮可能残留的状态视图标记(老版 reset view 语义)
  delete to.meta.view
  delete to.meta.extra
  let bizStore = null

  try {
    // 平台管理沿用旧版 configAdmin.update 可见性;菜单隐藏不能替代直接 URL 的路由保护
    if (to.path.startsWith('/platform/')) {
      const { usePermissionStore } = await import('../stores/permission')
      const permissionStore = usePermissionStore()
      await permissionStore.ensureLoaded()
      if (!permissionStore.canPlatformManage) return '/index'
    }
    // 转移确认页标题随类型变化(老版语义)
    if (to.name === 'HostTransfer') {
      to.meta.title = ({
        idle: '转移到空闲模块', business: '转移到业务模块', remove: '移除主机', increment: '追加主机', add: '添加主机'
      })[to.params.type] || '主机转移'
    }

    const isBizView = (location) => location.path.startsWith('/business/')
    const toBizId = Number(to.params.bizId)
    const fromBizId = Number(from.params.bizId)

    // 业务视图统一走业务 store(biz 列表同时用于不存在校验)
    if (isBizView(to) || to.path.startsWith('/biz-set') || to.path.startsWith('/business-set')) {
      const { useBizStore } = await import('../stores/biz')
      bizStore = useBizStore()
      try {
        await bizStore.ensureLoaded()
      } catch {
        // 业务列表加载失败:老版语义为原位 error 视图且 URL 保留
        to.meta.view = 'error'
        return true
      }
    }

    // 业务集拓扑:业务集不存在 → 原位 permission(老版 non-exist-business-set 语义)
    const bizSetId = Number(to.params.bizSetId || to.query.bizSetId)
    if ((to.path.startsWith('/biz-set') || to.path.startsWith('/business-set')) && bizSetId) {
      if (!bizStore.bizSetList.some((s) => s.bk_biz_set_id === bizSetId)) {
        to.meta.view = 'permission'
        to.meta.extra = { isNotFound: true }
      }
    }

    // 规范业务路由 bizId 规范化(仅带 :bizId 参数的路由;平铺旧路径走 legacyFlat 分支):
    // 非法值按老版 parseInt 语义回填(来源与平铺路径一致),无业务可回填 → /no-business
    if (isBizView(to) && to.params.bizId !== undefined && (!Number.isFinite(toBizId) || toBizId <= 0)) {
      let refill = Number(to.query.biz)
      if (!Number.isFinite(refill) || refill <= 0) refill = Number(localStorage.getItem('selectedBusiness'))
      if (!Number.isFinite(refill) || refill <= 0) refill = bizStore.bizId
      if (!refill) return { path: '/no-business' }
      bizStore.select(refill)
      const path = to.path.replace(/^\/business\/[^/]+/, `/business/${refill}`)
      return { path, query: withoutBiz(to.query), replace: true }
    }

    // 业务不存在(深链到已归档/删除业务)→ 原位 permission 视图,URL 保留(老版 meta.view 语义)
    if (isBizView(to) && to.params.bizId !== undefined && Number.isFinite(toBizId) && toBizId > 0) {
      if (!bizStore.bizList.some((b) => b.bk_biz_id === toBizId)) {
        to.meta.view = 'permission'
        to.meta.extra = { isNotFound: true }
        return true
      }
      bizStore.select(toBizId)
    }

    // 业务视图之间切换业务 → 整页刷新(老版行为,保证所有页面状态重置)
    if (Number.isFinite(toBizId) && Number.isFinite(fromBizId) && toBizId !== fromBizId
      && isBizView(from) && isBizView(to)) {
      window.location.hash = `#${to.fullPath}`
      window.location.reload()
      return false
    }

    if (to.meta.legacyFlat) {
      if (!bizStore) {
        const { useBizStore } = await import('../stores/biz')
        bizStore = useBizStore()
        try {
          await bizStore.ensureLoaded()
        } catch { /* 业务列表加载失败时按原路径进入,由页面空态兜底 */ }
      }
      let bizId = Number(to.query.biz)
      if (!Number.isFinite(bizId) || !bizId) bizId = Number(localStorage.getItem('selectedBusiness'))
      if (!Number.isFinite(bizId) || !bizId) bizId = bizStore.bizId
      if (!bizId) return { path: '/no-business' }
      bizStore.select(bizId)
      return { path: to.meta.legacyFlat.replace(':bizId', String(bizId)), query: withoutBiz(to.query), replace: true }
    }

    // 老版 checkAvailable/meta.available 映射:返回 false 抛 404 StatusError
    if (to.meta.checkAvailable && !(await to.meta.checkAvailable(to, from))) {
      throw new StatusError({ name: '404' })
    }

    // 老版 checkViewAuthorize 映射:standalone 非 IAM 模式 auth/verify 恒真,IAM 模式下 superView 失败整页 permission
    if (to.meta.auth && (to.meta.auth.superView || to.meta.auth.view)) {
      const passed = await verifyViewAuth(to.meta.auth)
      if (!passed && to.meta.auth.superView) {
        to.meta.view = 'permission'
        return true
      }
    }
  } catch (e) {
    // 老版 catch 语义:StatusError → 状态路由;其余错误 → 原位 error 视图(URL 保留);401 放行由 HTTP 层处理
    if (e instanceof StatusError) return { name: e.name, query: e.query }
    if (e?.response?.status !== 401 && e?.status !== 401) {
      console.error('[router] guard error:', e)
      to.meta.view = 'error'
      return true
    }
  }
  return true
})

// auth/verify 结果按 auths 摘要缓存,避免每帧重复请求(老版 getViewAuth 有 store 缓存)
const viewAuthCache = new Map()
async function verifyViewAuth(auth) {
  const key = JSON.stringify(auth)
  if (viewAuthCache.has(key)) return viewAuthCache.get(key)
  const { default: http } = await import('../api/http')
  try {
    const res = await http.post('/auth/verify', { auths: [auth] })
    viewAuthCache.set(key, res === true)
    return res === true
  } catch {
    // verify 接口不可用时按老版 fail-closed 语义处理
    viewAuthCache.set(key, false)
    return false
  }
}

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - 蓝鲸配置平台` : '蓝鲸配置平台'
})

export default router
