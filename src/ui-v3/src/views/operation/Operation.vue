<template>
  <div class="page-card">
    <el-alert type="info" :closable="false" style="margin-bottom: 16px"
      title="运营统计数据由 operation_server 定时任务(默认每日)收集,新部署环境需等待统计周期后才有数据" />

    <template v-for="(charts, category) in groupedCharts" :key="category">
      <el-card shadow="never" style="margin-bottom: 16px">
        <template #header>{{ categoryName(category) }}</template>
        <el-row :gutter="16">
          <el-col :span="12" v-for="chart in charts" :key="chart.config_id">
            <div class="chart-box">
              <div class="chart-title">{{ chart.name }}</div>
              <el-table :data="chartData[chart.config_id] || []" size="small" max-height="260">
                <el-table-column
                  v-for="col in chartColumns(chart)" :key="col"
                  :prop="col" :label="col" min-width="120"
                />
              </el-table>
            </div>
          </el-col>
        </el-row>
      </el-card>
    </template>
    <el-empty v-if="!loading && chartList.length === 0" description="暂无运营图表配置" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getOperationCharts, getOperationChartData } from '../../api/cmdb'

const chartList = ref([])
const chartData = ref({})
const loading = ref(false)

const categoryNames = { host: '主机统计', model: '模型统计' }
const categoryName = (c) => categoryNames[c] || c

const groupedCharts = computed(() => {
  const out = {}
  for (const chart of chartList.value) {
    const key = chart.report_type?.includes('host') ? 'host' : 'model'
    ;(out[key] = out[key] || []).push(chart)
  }
  return out
})

function chartColumns(chart) {
  const data = chartData.value[chart.config_id] || []
  const keys = new Set()
  for (const item of data.slice(0, 5)) {
    for (const k of Object.keys(item || {})) keys.add(k)
  }
  return [...keys]
}

async function load() {
  loading.value = true
  try {
    const res = await getOperationCharts()
    const info = res?.info || {}
    chartList.value = [...(info.host || []), ...(info.model || [])]
    // 逐个拉取图表数据(结构因图表类型而异,失败容忍)
    await Promise.allSettled(chartList.value.map(async (chart) => {
      const data = await getOperationChartData([chart])
      const first = Array.isArray(data) ? data[0] : data
      let rows = []
      if (Array.isArray(first)) rows = first
      else if (first && typeof first === 'object') {
        for (const v of Object.values(first)) {
          if (Array.isArray(v)) { rows = v; break }
        }
      }
      chartData.value[chart.config_id] = rows
    }))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.chart-box { border: 1px solid #e7e9ef; border-radius: 6px; padding: 12px; margin-bottom: 12px; }
.chart-title { font-weight: 600; margin-bottom: 10px; }
</style>
