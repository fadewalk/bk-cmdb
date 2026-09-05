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
  { module: '业务管理', desc: '业务列表、检索', status: 'done' },
  { module: '业务拓扑', desc: '业务/集群/模块树、空闲机池、业务主机查看', status: 'done' },
  { module: '业务拓扑增强', desc: '新建/删除集群、新建/删除模块、主机转移入口', status: 'done' },
  { module: '主机管理', desc: '资源池主机列表、IP 过滤、分页', status: 'done' },
  { module: '主机详情', desc: '全量属性查看、主机转移(模块间/资源池/进业务)', status: 'done' },
  { module: '模型管理', desc: '分类分组、模型增删改、字段增删、分类管理', status: 'done' },
  { module: '关联类型', desc: '模型关联类型查看', status: 'done' },
  { module: '服务模板', desc: '服务模板列表、进程模板查看、服务分类、集群模板', status: 'done' },
  { module: '服务实例', desc: '实例列表、进程实例查看、删除', status: 'done' },
  { module: '进程管理', desc: '进程实例查看(按服务实例);进程模板编辑器下一批', status: 'done' },
  { module: '动态分组', desc: '分组列表、结果预览、删除', status: 'done' },
  { module: '操作审计', desc: '按资源类型/时间筛选、审计详情', status: 'done' },
  { module: '运营统计', desc: '内置运营图表展示', status: 'done' },

  { module: '业务拓扑增强(写)', desc: '编辑集群/模块属性、节点详情页', status: 'doing' },
  { module: '服务实例创建器', desc: '向导式创建服务实例与进程', status: 'doing' },
  { module: '进程模板编辑器', desc: '进程模板增删改、属性绑定', status: 'doing' },
  { module: '进程模板编辑器', desc: '进程模板增删改、属性绑定', status: 'doing' },
  { module: '进程实例编辑', desc: '进程实例编辑、克隆', status: 'doing' },
  { module: '模型拓扑图', desc: '模型关联关系可视化(cytoscape 图)', status: 'doing' },
  { module: '模型增强', desc: '唯一校验管理、字段分组、字段模板', status: 'doing' },
  { module: '服务实例', desc: '服务实例创建/克隆、进程编辑', status: 'doing' },

  { module: '集群模板同步', desc: '集群模板变更同步(set-sync)', status: 'todo' },
  { module: '主机自动应用', desc: '主机属性自动应用规则(host-apply)', status: 'todo' },
  { module: '业务集', desc: '业务集管理、业务集拓扑', status: 'todo' },
  { module: '云资源', desc: '云账户、云区域、云资源发现(依赖云供应商插件,独立模式无数据)', status: 'todo' },
  { module: '容器管理', desc: 'K8s 集群纳管、Pod 详情(kube)', status: 'todo' },
  { module: '业务同步/归档', desc: '业务数据同步、归档业务', status: 'todo' },
  { module: '全局配置', desc: '平台配置管理', status: 'todo' }
]
</script>
