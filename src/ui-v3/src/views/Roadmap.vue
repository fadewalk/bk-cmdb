<template>
  <div class="page-card">
    <el-card shadow="never">
      <template #header>老前端功能迁移路线</template>
      <el-alert type="info" :closable="false" style="margin-bottom: 16px"
        title="旧版 Vue2 前端共 500+ 组件,新前端按模块分批迁移;以下为后续批次规划,完成后从菜单移除占位" />
      <el-table :data="items" size="default">
        <el-table-column prop="module" label="模块" width="180" />
        <el-table-column prop="desc" label="包含功能" min-width="320" />
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'done'" type="success" size="small">已上线</el-tag>
            <el-tag v-else-if="row.status === 'doing'" type="warning" size="small">迁移中</el-tag>
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
  { module: '业务拓扑', desc: '集群/模块树、主机查看', status: 'done' },
  { module: '主机管理', desc: '资源池主机列表、IP 检索', status: 'done' },
  { module: '模型管理', desc: '模型列表、属性查看', status: 'done' },
  { module: '业务拓扑增强', desc: '节点详情、主机转移、集群模板/服务模板', status: 'todo' },
  { module: '进程管理', desc: '进程管理、进程模板、进程实例', status: 'todo' },
  { module: '模型管理增强', desc: '模型创建/编辑/删除、字段管理、唯一校验、关联类型', status: 'todo' },
  { module: '主机增强', desc: '主机详情、自动应用、业务集主机、主机转移', status: 'todo' },
  { module: '运营统计', desc: '运营数据报表、实例统计', status: 'todo' },
  { module: '审计与事件', desc: '操作审计、事件订阅', status: 'todo' },
  { module: '高级功能', desc: '动态分组、自定义查询、业务集管理', status: 'todo' },
  { module: '系统管理', desc: '权限管理、配置管理', status: 'todo' }
]
</script>
