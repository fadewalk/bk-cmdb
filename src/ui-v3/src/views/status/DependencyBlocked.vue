<template>
  <div class="page-card">
    <el-card shadow="never">
      <template #header>{{ title }}</template>
      <StatusPage icon="icon-cc-tips" title="当前环境不具备该能力所需的数据链路" :desc="desc">
        <el-button type="primary" @click="$router.push('/')">返回首页</el-button>
      </StatusPage>
    </el-card>
  </div>
</template>

<script setup>
// 老版依赖型模块(Pod/容器、全文检索)在独立环境的明确阻塞态:
// 深链可达、状态明确,不得渲染为 404 或空白
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import StatusPage from './StatusPage.vue'

const route = useRoute()
const props = defineProps({ kind: { type: String, default: '' }, reason: { type: String, default: '' } })
const META = {
  pod: {
    title: '容器管理',
    desc: 'Pod/容器能力依赖 Kubernetes 集群纳管与容器数据链路;当前部署未接入 K8s,接入后本页自动可用(与旧版行为一致)。'
  },
  es: {
    title: '全文检索',
    desc: '全文检索依赖 Elasticsearch 数据链路;当前部署未开启 ES(es.fullTextSearch=off),开启后首页检索将返回全文结果。'
  },
  cloud: {
    title: '云资源同步',
    desc: '实际云资源同步需要配置真实云厂商凭据与网络连通;账户/任务管理能力不受影响。'
  },
  network: {
    title: '网络采集',
    desc: '网络采集依赖 collector 采集器注册和设备数据链路;当前部署未接入采集器,已保留老版 API 契约。'
  }
}
const key = computed(() => (props.kind || route.meta.blockedKind) in META ? (props.kind || route.meta.blockedKind) : 'pod')
const title = computed(() => META[key.value].title)
const desc = computed(() => props.reason || META[key.value].desc)
</script>
