<template>
  <div class="page-card">
    <h1 class="page-title sr-only">运营统计</h1>
    <el-alert type="info" :closable="false" style="margin-bottom: 16px"
      title="运营统计数据由 operation_server 定时任务(默认每日)收集,新部署环境需等待统计周期后才有数据" />

    <!-- NAVTYPE 顶部卡(老版 4 张可点击跳路由) -->
    <div class="nav-type">
      <div class="nav-card" v-for="c in navCards" :key="c.key" @click="c.to && $router.push(c.to)">
        <div class="nc-left">
          <div class="nc-num">{{ c.value }}</div>
          <div class="nc-label">{{ c.label }}</div>
        </div>
        <span class="nc-icon-wrap" :style="{ background: c.bg }">
          <i :class="['bk-cmdb-icon', 'nc-icon', c.icon]" />
        </span>
      </div>
    </div>

    <div class="op-toolbar">
      <el-radio-group v-model="categoryTab" size="default">
        <el-radio-button label="">全部</el-radio-button>
        <el-radio-button label="host">主机统计</el-radio-button>
        <el-radio-button label="model">模型统计</el-radio-button>
      </el-radio-group>
      <div class="spacer" />
      <el-button :icon="'Plus'" type="primary" size="small" @click="openChartDialog()">新建图表</el-button>
      <el-button :icon="'Refresh'" size="small" @click="load">刷新</el-button>
    </div>

    <template v-for="(charts, category) in groupedCharts" :key="category">
      <el-card v-if="!categoryTab || categoryTab === category" shadow="never" style="margin-bottom: 16px">
        <template #header>
          <div class="card-head">
            <span>{{ categoryName(category) }} ({{ charts.length }})</span>
          </div>
        </template>
        <el-row :gutter="16">
          <el-col :span="12" v-for="chart in charts" :key="chart.config_id">
            <div class="chart-box">
              <div class="chart-title">
                <span class="ct-name">{{ chart.name || chart.report_type }}</span>
                <div class="ct-ops">
                  <el-button link type="primary" size="small" @click="openChartDialog(chart)">编辑</el-button>
                  <el-button link type="danger" size="small" @click="removeChart(chart)">删除</el-button>
                </div>
              </div>
              <div ref="el => setChartEl(chart.config_id, el)" class="chart-canvas" />
              <div class="chart-meta" v-if="chart.__meta">
                <el-tag v-for="m in chart.__meta" :key="m" size="small" type="info">{{ m }}</el-tag>
              </div>
            </div>
          </el-col>
        </el-row>
      </el-card>
    </template>
    <el-empty v-if="!loading && flatCharts.length === 0" description="暂无运营图表配置(点击「新建图表」添加)" :image-size="80" />

    <!-- 图表新建/编辑对话框 -->
    <el-dialog v-model="chartFormVisible" :title="chartForm.id ? '编辑图表' : '新建图表'" width="540px">
      <el-form label-width="100px" :model="chartForm">
        <el-form-item label="名称" required>
          <el-input v-model="chartForm.name" placeholder="如:主机总数趋势" />
        </el-form-item>
        <el-form-item label="报表类型" required>
          <el-select v-model="chartForm.report_type" style="width: 100%">
            <el-option label="主机 host" value="host" />
            <el-option label="模型 model" value="model" />
            <el-option label="资源 resource" value="resource" />
          </el-select>
        </el-form-item>
        <el-form-item label="图表类型">
          <el-select v-model="chartForm.chart_type" style="width: 100%">
            <el-option label="饼图 pie" value="pie" />
            <el-option label="柱状 bar" value="bar" />
            <el-option label="折线 line" value="line" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="chartForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="chartFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitChart">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts/core'
import { PieChart, BarChart, LineChart } from 'echarts/charts'
import { TooltipComponent, GridComponent, TitleComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { getModelStatistics } from '../../api/cmdb'
import {
  getOperationCharts, getOperationChartData,
  createOperationChart, updateOperationChart, deleteOperationChart
} from '../../api/cmdb'

echarts.use([PieChart, BarChart, LineChart, TooltipComponent, GridComponent, TitleComponent, LegendComponent, CanvasRenderer])

const categoryTab = ref('')
const chartList = ref([])
const chartDataMap = ref({})
const loading = ref(false)
const saving = ref(false)

const chartRefs = ref({})
const chartInstances = ref({})

// NAVTYPE 顶部卡
const navCards = ref([
  { key: 'biz', label: '业务总数', value: 0, icon: 'icon-cc-business', bg: 'linear-gradient(135deg, #3A84FF, #2E6AD6)', to: '/resource/catalog/biz' },
  { key: 'host', label: '主机总数', value: 0, icon: 'icon-cc-host', bg: 'linear-gradient(135deg, #2DCB56, #1FA948)', to: '/resource/host' },
  { key: 'model', label: '模型总数', value: 0, icon: 'icon-cc-nav-model-02', bg: 'linear-gradient(135deg, #FFB400, #FF8800)', to: '/model/management' },
  { key: 'inst', label: '实例总数', value: 0, icon: 'icon-cc-customization', bg: 'linear-gradient(135deg, #853CFF, #5E1FCC)', to: '/resource/index' }
])

// 图表表单
const chartFormVisible = ref(false)
const chartForm = ref({ id: null, name: '', report_type: 'host', chart_type: 'bar', description: '' })

const categoryNames = { host: '主机统计', model: '模型统计', resource: '资源统计' }
const categoryName = (c) => categoryNames[c] || c

const flatCharts = computed(() => chartList.value)
const groupedCharts = computed(() => {
  const out = {}
  for (const chart of chartList.value) {
    const rt = (chart.report_type || '').toLowerCase()
    const key = classify(rt)
    chart.__category = key
    ;(out[key] = out[key] || []).push(chart)
  }
  return out
})

function classify(rt) {
  if (rt.includes('host')) return 'host'
  if (rt.includes('model') || rt.includes('object')) return 'model'
  if (rt.includes('resource')) return 'resource'
  return 'nav'
}

function setChartEl(id, el) {
  if (el) chartRefs.value[id] = el
}

function pickChartOption(chart, data) {
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

async function loadNavCards() {
  try {
    const stats = await getModelStatistics().catch(() => [])
    const map = {}
    for (const s of stats || []) map[s.bk_obj_id] = s.instance_count || 0
    // biz
    navCards.value[0].value = (stats || []).find((s) => s.bk_obj_id === 'biz')?.instance_count || 0
    // host
    navCards.value[1].value = map.host || 0
    // model
    navCards.value[2].value = (stats || []).length
    // inst(简单累加所有实例)
    navCards.value[3].value = (stats || []).reduce((s, x) => s + (x.instance_count || 0), 0)
  } catch (e) { /* 容忍 */ }
}

async function load() {
  loading.value = true
  try {
    const res = await getOperationCharts()
    const info = res?.info || {}
    chartList.value = [...(info.host || []), ...(info.model || []), ...(info.resource || []), ...(info.nav || [])]
    await nextTick()
    await Promise.allSettled(chartList.value.map(async (chart) => {
      try {
        const data = await getOperationChartData([chart])
        const first = Array.isArray(data) ? data[0] : data
        chartDataMap.value[chart.config_id] = first
      } catch (e) {
        chartDataMap.value[chart.config_id] = []
      }
    }))
    await nextTick()
    for (const chart of chartList.value) renderChart(chart)
  } finally {
    loading.value = false
  }
}

function openChartDialog(row) {
  if (row) {
    chartForm.value = {
      id: row.config_id || row.id,
      name: row.name || '',
      report_type: row.report_type || 'host',
      chart_type: row.chart_type || 'bar',
      description: row.description || ''
    }
  } else {
    chartForm.value = { id: null, name: '', report_type: 'host', chart_type: 'bar', description: '' }
  }
  chartFormVisible.value = true
}

async function submitChart() {
  if (!chartForm.value.name) { ElMessage.warning('请输入图表名称'); return }
  saving.value = true
  try {
    const payload = {
      name: chartForm.value.name,
      report_type: chartForm.value.report_type,
      chart_type: chartForm.value.chart_type,
      description: chartForm.value.description
    }
    if (chartForm.value.id) {
      await updateOperationChart({ id: chartForm.value.id, ...payload })
      ElMessage.success('已更新')
    } else {
      await createOperationChart(payload)
      ElMessage.success('已创建')
    }
    chartFormVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally {
    saving.value = false
  }
}

async function removeChart(chart) {
  await ElMessageBox.confirm(`确定删除图表「${chart.name || chart.report_type}」?`, '删除确认', { type: 'warning' })
  try {
    await deleteOperationChart(chart.config_id || chart.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}

onMounted(() => {
  loadNavCards()
  load()
  window.addEventListener('resize', resizeAll)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeAll)
  for (const inst of Object.values(chartInstances.value)) inst?.dispose()
})
</script>

<style scoped>
.nav-type { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.nav-card {
  background: #fff; border: 1px solid #DCDEE5; border-radius: 2px;
  padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;
  cursor: pointer; transition: box-shadow 0.2s;
}
.nav-card:hover { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); border-color: #3A84FF; }
.nc-left { display: flex; flex-direction: column; gap: 4px; }
.nc-num { font-size: 22px; color: #313238; font-weight: 700; }
.nc-label { font-size: 12px; color: #979BA5; }
.nc-icon-wrap {
  width: 48px; height: 48px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  color: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.08);
}
.nc-icon { font-size: 22px; color: #fff; }
.op-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.op-toolbar .spacer { flex: 1; }
.card-head { display: flex; align-items: center; gap: 10px; }
.chart-box { border: 1px solid #e7e9ef; border-radius: 6px; padding: 12px; margin-bottom: 12px; }
.chart-title { display: flex; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 10px; color: #313238; }
.chart-title .ct-name { flex: 1; }
.ct-ops { display: flex; gap: 4px; }
.chart-canvas { width: 100%; height: 260px; }
.chart-meta { margin-top: 8px; display: flex; gap: 6px; }
</style>