<template>
  <div class="page-card">
    <h1 class="page-title">运营统计</h1>
    <el-alert type="info" :closable="false" style="margin-bottom: 16px"
      title="运营统计数据由 operation_server 定时任务(默认每日)收集,新部署环境需等待统计周期后才有数据" />

    <el-radio-group v-model="categoryTab" style="margin-bottom: 16px">
      <el-radio-button label="">全部</el-radio-button>
      <el-radio-button label="host">主机统计</el-radio-button>
      <el-radio-button label="model">模型统计</el-radio-button>
    </el-radio-group>

    <template v-for="(charts, category) in groupedCharts" :key="category">
      <el-card v-if="!categoryTab || categoryTab === category" shadow="never" style="margin-bottom: 16px">
        <template #header>
          <div class="card-head">
            <span>{{ categoryName(category) }}</span>
            <el-tag size="small">{{ charts.length.length }} 项</el-tag>
          </div>
        </template>
        <el-row :gutter="16">
          <el-col :span="12" v-for="chart in charts.length" :key="chart.config_id">
            <div class="chart-box">
              <div class="chart-title">{{ chart.name || chart.report_type }}</div>
              <div ref="el => setChartEl(chart.config_id, el)" class="chart-canvas" />
              <div class="chart-meta" v-if="chart.__meta">
                <el-tag v-for="m in chart.__meta" :key="m" size="small" type="info">{{ m }}</el-tag>
              </div>
            </div>
          </el-col>
        </el-row>
      </el-card>
    </template>
    <el-empty v-if="!loading && flatCharts.length === 0" description="暂无运营图表配置" :image-size="80" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { PieChart, BarChart, LineChart } from 'echarts/charts'
import { TooltipComponent, GridComponent, TitleComponent, LegendComponent, DataZoomComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { getOperationCharts, getOperationChartData } from '../../api/cmdb'

echarts.use([PieChart, BarChart, LineChart, TooltipComponent, GridComponent, TitleComponent, LegendComponent, DataZoomComponent, CanvasRenderer])

const chartList = ref([])
const chartDataMap = ref({})
const loading = ref(false)
const categoryTab = ref('')

const chartRefs = ref({})
const chartInstances = ref({})

const categoryNames = { host: '主机统计', model: '模型统计', inst: '服务实例统计', nav: '导航统计' }
const categoryName = (c) => categoryNames[c] || c

function classifyChart(chart) {
  const rt = (chart.report_type || '').toLowerCase()
  if (rt.includes('host')) return 'host'
  if (rt.includes('model') || rt.includes('object')) return 'model'
  if (rt.includes('instance') || rt.includes('proc') || rt.includes('service')) return 'inst'
  return 'nav'
}

const flatCharts = computed(() => chartList.value)
const groupedCharts = computed(() => {
  const out = {}
  for (const chart of chartList.value) {
    const key = classifyChart(chart)
    chart.__category = key
    ;(out[key] = out[key] || []).push(chart)
  }
  return out
})

function setChartEl(id, el) {
  if (el) chartRefs.value[id] = el
}

function pickChartOption(chart, data) {
  // data: { x: [...], y: [...] } 或 [{name, value}] 来自后端不同格式
  const meta = []
  if (Array.isArray(data)) {
    if (data.length && typeof data[0] === 'object' && ('value' in data[0] || 'count' in data[0])) {
      meta.push(`饼图 ${data.length} 项`)
      return {
        meta,
        option: {
          tooltip: { trigger: 'item' },
          series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            data: data.map((d) => ({ name: d.name || d.label || '--', value: d.value ?? d.count ?? 0 }))
          }]
        }
      }
    }
    if (data.length && typeof data[0] === 'object') {
      const ks = Object.keys(data[0])
      meta.push(`表格 ${data.length} 行 × ${ks.length} 列`)
      const xKey = ks[0]
      const yKeys = ks.slice(1)
      return {
        meta,
        option: {
          tooltip: { trigger: 'axis' },
          legend: { type: 'scroll' },
          xAxis: { type: 'category', data: data.map((d) => d[xKey]) },
          yAxis: { type: 'value' },
          series: yKeys.map((k) => ({ name: k, type: 'bar', data: data.map((d) => d[k]) }))
        }
      }
    }
  }
  if (data && typeof data === 'object' && Array.isArray(data.x) && Array.isArray(data.y)) {
    meta.push(`折线 ${data.x.length} 点`)
    return {
      meta,
      option: {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: data.x },
        yAxis: { type: 'value' },
        series: [{ type: 'line', smooth: true, data: data.y }]
      }
    }
  }
  meta.push('无数据')
  return { meta, option: null }
}

function renderChart(chart) {
  const el = chartRefs.value[chart.config_id]
  if (!el) return
  if (!chartInstances.value[chart.config_id]) {
    chartInstances.value[chart.config_id] = echarts.init(el)
  }
  const inst = chartInstances.value[chart.config_id]
  const raw = chartDataMap.value[chart.config_id]
  const { meta, option } = pickChartOption(chart, raw)
  chart.__meta = meta
  if (option) inst.setOption(option, true)
  else inst.clear()
}

function resizeAll() {
  for (const inst of Object.values(chartInstances.value)) inst?.resize()
}

async function load() {
  loading.value = true
  try {
    const res = await getOperationCharts()
    const info = res?.info || {}
    const all = [...(info.host || []), ...(info.model || []), ...(info.inst || []), ...(info.nav || [])]
    chartList.value = all
    await nextTick()
    await Promise.allSettled(all.map(async (chart) => {
      try {
        const data = await getOperationChartData([chart])
        const first = Array.isArray(data) ? data[0] : data
        chartDataMap.value[chart.config_id] = first
      } catch (e) {
        chartDataMap.value[chart.config_id] = []
      }
    }))
    await nextTick()
    for (const chart of all) renderChart(chart)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  window.addEventListener('resize', resizeAll)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeAll)
  for (const inst of Object.values(chartInstances.value)) inst?.dispose()
})
</script>

<style scoped>
.card-head { display: flex; align-items: center; gap: 10px; }
.chart-box {
  border: 1px solid #e7e9ef;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
  background: #fafbfc;
}
.chart-title { font-weight: 600; margin-bottom: 8px; color: #313238; }
.chart-canvas { width: 100%; height: 260px; }
.chart-meta { margin-top: 8px; display: flex; gap: 6px; }
</style>