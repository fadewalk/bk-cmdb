import { createRouter, createWebHashHistory } from 'vue-router'

// web_server 的 NoRoute 会 302 到 /#/404,因此前端必须使用 hash 路由
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: () => import('../layout/MainLayout.vue'),
      redirect: '/dashboard',
      children: [
        { path: 'dashboard', name: 'Dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: '仪表盘' } },
        { path: 'business', name: 'Business', component: () => import('../views/BusinessList.vue'), meta: { title: '业务管理' } },
        { path: 'topo', name: 'Topo', component: () => import('../views/BusinessTopo.vue'), meta: { title: '业务拓扑' } },
        { path: 'hosts', name: 'Hosts', component: () => import('../views/HostList.vue'), meta: { title: '主机管理' } },
        { path: 'host-detail', name: 'HostDetail', component: () => import('../views/hosts/HostDetail.vue'), meta: { title: '主机详情' } },
        { path: 'models', name: 'Models', component: () => import('../views/model/ModelManage.vue'), meta: { title: '模型管理' } },
        { path: 'association-types', name: 'AssociationTypes', component: () => import('../views/model/AssociationType.vue'), meta: { title: '关联类型' } },
        { path: 'service-template', name: 'ServiceTemplate', component: () => import('../views/service/ServiceTemplate.vue'), meta: { title: '服务模板' } },
        { path: 'dynamic-group', name: 'DynamicGroup', component: () => import('../views/dynamic-group/DynamicGroup.vue'), meta: { title: '动态分组' } },
        { path: 'audit', name: 'Audit', component: () => import('../views/audit/AuditList.vue'), meta: { title: '操作审计' } },
        { path: 'operation', name: 'Operation', component: () => import('../views/operation/Operation.vue'), meta: { title: '运营统计' } },
        { path: 'roadmap', name: 'Roadmap', component: () => import('../views/Roadmap.vue'), meta: { title: '功能路线' } }
      ]
    },
    { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('../views/NotFound.vue') }
  ]
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - CMDB` : 'CMDB'
})

export default router
