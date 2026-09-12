<template>
  <div class="page-card">
    <el-card shadow="never">
      <template #header>老前端功能迁移进度</template>
      <el-alert type="success" :closable="false" style="margin-bottom: 16px"
        title="核心模块已迁移完成;剩余模块(多为重交互编辑器或依赖蓝鲸云管/容器的功能)按批次继续" />
      <el-table :data="items" size="default">
        <el-table-column prop="module" label="模块" width="180" />
        <el-table-column prop="desc" label="包含功能" min-width="340" />
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'done'" type="success" size="small">已上线</el-tag>
            <el-tag v-else-if="row.status === 'doing'" type="warning" size="small">下一批</el-tag>
            <el-tag v-else type="info" size="small">规划中</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
const items = [
  { module: '仪表盘', desc: '资源统计、模型实例分布', status: 'done' },
  { module: '业务管理', desc: '业务列表、检索、新建/编辑/归档/恢复/彻底删除、业务详情(属性/变更历史)', status: 'done' },
  { module: '业务拓扑', desc: '业务/集群/模块树、空闲机池、业务主机查看', status: 'done' },
  { module: '业务拓扑增强', desc: '新建/删除/重命名集群与模块、主机转移入口', status: 'done' },
  { module: '主机管理', desc: '资源池主机列表、IP 过滤、分页', status: 'done' },
  { module: '主机详情', desc: '全量属性查看、主机转移(模块间/资源池/进业务)', status: 'done' },
  { module: '模型管理', desc: '分类分组、模型增删改、字段增删、分类管理、唯一校验查看', status: 'done' },
  { module: '关联类型', desc: '关联类型与模型关联关系列表', status: 'done' },
  { module: '服务模板', desc: '模板创建/列表、进程模板全字段编辑、服务分类、集群模板(详情/同步/历史)、旧版深链兼容', status: 'done' },
  { module: '服务实例', desc: '创建向导(选模块选主机)、列表、删除、进程实例查看/新增', status: 'done' },
  { module: '进程管理', desc: '进程实例查看/新增、进程模板创建/查看', status: 'done' },
  { module: '动态分组', desc: '分组列表、结果预览、删除', status: 'done' },
  { module: '操作审计', desc: '按资源类型/时间筛选、审计详情', status: 'done' },
  { module: '运营统计', desc: '内置运营图表展示', status: 'done' },
  { module: '主机自动应用', desc: '按模块查看/删除自动应用规则', status: 'done' },
  { module: '业务集/归档业务', desc: '业务集列表、归档业务查看与恢复', status: 'done' },
  { module: '云资源', desc: '云区域/云账户列表(独立模式无云供应商)', status: 'done' },

  { module: '编辑器深度对齐', desc: '进程模板全字段编辑(含 bind_info 端口绑定)/删除、进程实例编辑/删除、服务实例克隆、集群/模块属性编辑', status: 'done' },

  { module: '模型实例', desc: '通用模型实例列表/搜索/分页、增删改、批量删除、变更历史、列配置、Excel 导入导出', status: 'done' },
  { module: '低频增强项', desc: '字段分组管理、host-apply 规则创建向导、服务实例批量创建(可用 API 覆盖)', status: 'doing' },
  { module: '主机自动应用', desc: '三步向导(配置→预览冲突→执行轮询)、启停/删除/批量删除、模块与模板模式、旧版深链', status: 'done' },
  { module: '全局配置', desc: '业务通用/空闲机池/ID 生成器三 tab,未保存离开确认,全量读改写(契约修复)', status: 'done' },
  { module: '跨业务主机转移', desc: '业务拓扑跨业务转移对话框(目标业务/模块级联)', status: 'done' },
  { module: '集群模板同步', desc: '同步对话框/状态/历史,旧版 set-sync 深链兼容', status: 'done' },
  { module: '业务同步', desc: '差异展示(增/删/改/属性)、单模块与全量同步、旧版深链', status: 'done' },

  { module: '登录与权限(IAM)', desc: '方向已定:对接开源方案体系(OIDC/OAuth2、Casbin 等),不依赖蓝鲸权限中心;另行立项', status: 'doing' },
  { module: '云资源', desc: '云账户/管控区域/云资源发现(cloudserver 已纳入核心,实际同步需云厂商凭据)', status: 'done' },
  { module: '容器管理', desc: 'K8s 集群纳管、Pod 详情(依赖容器数据链路,独立部署与老版一致不可用)', status: 'todo' },
  { module: '主机转移确认页', desc: '老版 host-operation 1:1:已选主机/转移到/变更确认 tabs/预览+执行,业务拓扑入口已接', status: 'done' },
  { module: '主机导入', desc: '.xlsx 客户端真实解析(XLSX 库)+服务端导入/导入编辑(/hosts/import、/hosts/update)全支持', status: 'done' },
  { module: '菜单结构', desc: '严格对齐老版最终可见菜单:业务 7 项、资源 4 项(资源目录/管控区域/云账户/云资源发现)、模型 4 项、运营分析 2 项、平台管理 1 项;项目/业务集/业务/主机保留内部路由但不作为资源同级导航', status: 'done' }
]
</script>
