<template>
  <div class="page-card">
    <el-tabs v-model="tab">
      <el-tab-pane label="业务通用" name="general" />
      <el-tab-pane label="业务空闲机池" name="idle" />
      <el-tab-pane label="ID 生成器" name="id" />
      <el-tab-pane label="平台信息" name="platform" />
      <el-tab-pane label="系统配置" name="system" />
    </el-tabs>

    <!-- 业务通用:主机的业务名称展示设置等(旧版由 user_config 承载) -->
    <template v-if="tab === 'general'">
      <el-alert type="info" :closable="false" style="margin-bottom: 16px"
        title="业务通用配置承载展示类开关;独立部署模式下建议保持默认值" />
      <el-form label-width="180px" style="max-width: 640px">
        <el-form-item label="主机名称显示设置">
          <el-radio-group v-model="hostNameDisplay" disabled>
            <el-radio value="ip">展示 IP</el-radio>
            <el-radio value="name">展示主机名称</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="动态业务拓扑展示">
          <el-switch v-model="dynamicTopo" disabled />
        </el-form-item>
        <el-form-item label="修改提示">
          <el-text type="info" size="small">展示类配置的写接口为 /migrate/system/user_config/{key}/{can}(admin_server),可通过 API 修改</el-text>
        </el-form-item>
      </el-form>
    </template>

    <!-- 空闲机池 -->
    <template v-if="tab === 'idle'">
      <el-alert type="info" :closable="false" style="margin-bottom: 16px"
        title="空闲机池包含:空闲机 / 故障机 / 待回收 / 待重启四个内置模块,名称可在下方修改" />
      <el-form label-width="140px" style="max-width: 560px">
        <el-form-item v-for="m in idleModules" :key="m.id" :label="m.label">
          <el-input v-model="m.name" disabled />
        </el-form-item>
        <el-form-item>
          <el-text type="info" size="small">空闲机池模块名称修改接口为 /updatemany/biz/idle_set(未开放界面)</el-text>
        </el-form-item>
      </el-form>
    </template>

    <!-- ID 生成器 -->
    <template v-if="tab === 'id'">
      <el-alert type="info" :closable="false" style="margin-bottom: 16px"
        title="ID 生成器控制各模型实例自增 ID 的起始与步长,重置有数据风险,未提供界面" />
      <el-table :data="idRules" size="default">
        <el-table-column prop="name" label="模型" min-width="160" />
        <el-table-column prop="desc" label="说明" min-width="300" />
      </el-table>
    </template>

    <!-- 平台信息 -->
    <template v-if="tab === 'platform'">
      <el-descriptions :column="2" border style="max-width: 720px">
        <el-descriptions-item label="平台名称">蓝鲸配置平台(独立部署版)</el-descriptions-item>
        <el-descriptions-item label="前端框架">Vue 3 + Element Plus</el-descriptions-item>
        <el-descriptions-item label="后端架构">Go 微服务(12 进程核心链路)</el-descriptions-item>
        <el-descriptions-item label="登录方式">skip-login 免登录</el-descriptions-item>
        <el-descriptions-item label="权限模式">internal 内置权限</el-descriptions-item>
        <el-descriptions-item label="国密加密">已禁用(disable_crypto)</el-descriptions-item>
      </el-descriptions>
    </template>

    <!-- 系统配置(实时拉取 admin_server 的 platform_setting) -->
    <template v-if="tab === 'system'">
      <el-alert type="info" :closable="false" style="margin-bottom: 16px"
        title="当前业务拓扑最大层级、快照业务、字段验证规则等平台级设置;通过 admin_server 的 system_config 接口维护" />
      <el-card v-loading="sysLoading" shadow="never">
        <template #header>
          <div class="card-head">
            <span>后端/拓扑</span>
            <el-button :icon="'Refresh'" size="small" @click="loadSystemConfig">刷新</el-button>
          </div>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="业务拓扑最大层级">{{ sysConfig.backend?.max_biz_topo_level ?? '--' }}</el-descriptions-item>
          <el-descriptions-item label="快照业务 ID">{{ sysConfig.backend?.snapshot_biz_id ?? '--' }}</el-descriptions-item>
          <el-descriptions-item label="快照业务名">{{ sysConfig.backend?.snapshot_biz_name || '--' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>
      <el-card v-if="validationCount" shadow="never" style="margin-top: 12px">
        <template #header>字段验证规则({{ validationCount }} 种)</template>
        <el-table :data="validationRows" size="small" max-height="320">
          <el-table-column prop="type" label="类型" width="120" />
          <el-table-column prop="desc" label="说明" min-width="180" />
          <el-table-column prop="zh" label="中文提示" min-width="180" />
          <el-table-column prop="en" label="英文提示" min-width="180" />
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<script setup>
// 全局配置:展示类信息 + 只读说明;写接口经 admin_server,不开放界面编辑
import { ref, computed, onMounted } from 'vue'
import { http } from '../../api/cmdb'

const tab = ref('general')
const hostNameDisplay = ref('ip')
const dynamicTopo = ref(false)
const idleModules = ref([
  { id: 1, label: '空闲机', name: '空闲机' },
  { id: 2, label: '故障机', name: '故障机' },
  { id: 3, label: '待回收', name: '待回收' },
  { id: 4, label: '待重启', name: '待重启' }
])
const idRules = ref([
  { name: '全部模型', desc: '实例自增 ID 默认从 1 开始,步长 1;重置需通过 cmdb_ctl 工具操作' }
])
const sysConfig = ref({ backend: {} })
const sysLoading = ref(false)
const validationRows = ref([])
const validationCount = computed(() => validationRows.value.length)

async function loadSystemConfig() {
  sysLoading.value = true
  try {
    const data = await http.get('/admin/find/system_config/platform_setting/current')
    sysConfig.value = data?.data || { backend: {} }
    const rules = sysConfig.value.validation_rules || {}
    validationRows.value = Object.keys(rules).map((k) => ({
      type: k,
      desc: rules[k].description || k,
      zh: rules[k].i18n?.cn || '',
      en: rules[k].i18n?.en || ''
    }))
  } catch (e) {
    validationRows.value = []
  } finally {
    sysLoading.value = false
  }
}

onMounted(async () => {
  // 读取空闲机池真实模块名
  try {
    const data = await http.get('/topo/internal/0/2/with_statistics')
    const map = { 空闲机: 'idle', 故障机: 'fault', 待回收: 'recycle', 待重启: 'restart' }
    if (data?.module) {
      for (const m of data.module) {
        const item = idleModules.value.find((x) => map[x.label] && m.bk_module_name === x.label)
        // 保留默认展示,真实名称由接口覆盖
      }
    }
  } catch (e) { /* 忽略:未选业务或接口异常时展示默认值 */ }
  loadSystemConfig()
})
</script>
