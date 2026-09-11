<template>
  <div class="page-card op-page">
    <h1 class="page-title sr-only">运营统计</h1>

    <!-- NAVTYPE 顶部渐变横卡(对齐老版 4 张) -->
    <div class="nav-type">
      <div
        v-for="c in navCards"
        :key="c.key"
        class="nav-card"
        :style="{ background: c.bg, color: '#fff' }"
        @click="c.to && $router.push(c.to)"
      >
        <div class="nc-left">
          <div class="nc-num">{{ c.value }}</div>
          <div class="nc-label">{{ c.label }}<el-icon v-if="c.tip" class="nc-tip"><InfoFilled /></el-icon></div>
        </div>
        <span class="nc-circle"><i :class="['bk-cmdb-icon', 'nc-icon', c.icon]" /></span>
      </div>
    </div>

    <div class="op-toolbar">
      <el-radio-group v-model="categoryTab" size="default">
        <el-radio-button label="">全部</el-radio-button>
        <el-radio-button label="host">主机统计</el-radio-button>
        <el-radio-button label="model">模型统计</el-radio-button>
      </el-radio-group>
      <div class="spacer" />
      <el-button :icon="'Plus'" type="primary" size="small" @click="openChartDialog(null, categoryTab === 'model' ? 'inst' : 'host')">新建图表</el-button>
      <el-button :icon="'Refresh'" size="small" @click="load">刷新</el-button>
    </div>

    <!-- 无图表配置时的默认图表(对齐老版内置四图) -->
    <template v-if="flatCharts.length === 0">
      <div class="section-title">主机统计</div>
      <el-row :gutter="16">
        <el-col :span="12" v-for="dc in defaultCharts" :key="dc.name" style="margin-bottom: 16px">
          <div class="chart-box default-box">
            <div class="chart-title"><span class="ct-name">{{ dc.name }}</span></div>
            <div class="chart-canvas" :ref="(el) => setChartEl(dc.key, el)" />
            <div v-if="defaultEmpty" class="chart-empty">暂无统计数据,新部署环境需等待统计周期</div>
          </div>
        </el-col>
      </el-row>
    </template>

    <template v-for="(charts, category) in groupedCharts" :key="category">
      <el-card v-if="(!categoryTab || categoryTab === category) && charts.length" shadow="never" style="margin-bottom: 16px">
        <template #header>
          <div class="card-head">
            <span>{{ categoryName(category) }} ({{ charts.length }})</span>
          </div>
        </template>
        <el-row :gutter="16">
          <el-col :span="Number(chart.width) === 100 ? 24 : 12" v-for="chart in charts" :key="chart.config_id">
            <div class="chart-box">
              <div class="chart-title">
                <span class="ct-name">{{ chart.name || chart.report_type }}</span>
                <div class="ct-ops">
                  <el-button link type="primary" size="small" @click="openChartDialog(chart)">编辑</el-button>
                  <el-button link type="danger" size="small" @click="removeChart(chart)">删除</el-button>
                </div>
              </div>
              <div class="chart-canvas" :ref="(el) => setChartEl(chart.config_id, el)" />
              <div class="chart-meta" v-if="chart.__meta">
                <el-tag v-for="m in chart.__meta" :key="m" size="small" type="info">{{ m }}</el-tag>
              </div>
            </div>
          </el-col>
        </el-row>
      </el-card>
    </template>

    <!-- 图表新建/编辑对话框(老版 chart-detail.vue 契约:自定义/内置、统计对象/维度、饼图/柱状、宽度、横轴数量) -->
    <el-dialog v-model="chartFormVisible" :title="dialogTitle" width="720px">
      <div class="chart-form">
        <div class="form-row">
          <label class="row-label">图表类型</label>
          <el-radio-group v-model="chartTypeCustom" :disabled="!!chartForm.config_id">
            <el-radio :value="true">自定义</el-radio>
            <el-radio :value="false">内置</el-radio>
          </el-radio-group>
        </div>
        <template v-if="!chartTypeCustom">
          <div class="form-row">
            <label class="row-label">图表名称</label>
            <el-select v-model="chartForm.name" style="width: 320px" :disabled="!!chartForm.config_id" :clearable="false">
              <el-option
                v-for="opt in builtinList"
                :key="opt.repType"
                :label="opt.name"
                :value="opt.name"
                :disabled="existedRepTypes.includes(opt.repType)"
              />
            </el-select>
          </div>
        </template>
        <template v-else>
          <div class="form-row">
            <label class="row-label">图表名称</label>
            <el-input v-model="chartForm.name" placeholder="请输入图表名称" style="width: 320px" />
          </div>
          <div class="form-row" v-if="chartForm.bk_obj_id !== 'host' && hostKind === 'inst'">
            <label class="row-label">统计对象</label>
            <el-select v-model="chartForm.bk_obj_id" style="width: 320px" :disabled="!!chartForm.config_id">
              <el-option v-for="m in staticModels" :key="m.bk_obj_id" :label="m.bk_obj_name" :value="m.bk_obj_id" />
            </el-select>
          </div>
          <div class="form-row">
            <label class="row-label">统计维度<el-tooltip content="模型中需包含枚举字段才可以作为维度统计" placement="top"><i class="bk-cmdb-icon icon-cc-exclamation-tips dim-tip" /></el-tooltip></label>
            <el-select v-model="chartForm.field" style="width: 320px" :disabled="!!chartForm.config_id" :clearable="false">
              <el-option
                v-for="opt in dimensionList"
                :key="opt.bk_property_id"
                :label="opt.bk_property_name"
                :value="opt.bk_property_id"
                :disabled="isFieldUsed(opt)"
              />
            </el-select>
          </div>
          <div class="form-row">
            <label class="row-label">图表类型</label>
            <el-radio-group v-model="chartForm.chart_type">
              <el-radio value="pie">饼图</el-radio>
              <el-radio value="bar">柱状图</el-radio>
            </el-radio-group>
          </div>
        </template>
        <div class="form-row">
          <label class="row-label">图表宽度</label>
          <el-radio-group v-model="chartForm.width">
            <el-radio value="50">50%</el-radio>
            <el-radio value="100">100%</el-radio>
          </el-radio-group>
        </div>
        <div class="form-row" v-if="chartForm.chart_type !== 'pie' && chartForm.report_type !== 'host_change_biz_chart'">
          <label class="row-label">横轴坐标数量<el-tooltip content="图标可视区横轴坐标数量，建议不超过20个" placement="top"><i class="bk-cmdb-icon icon-cc-exclamation-tips dim-tip" /></el-tooltip></label>
          <el-input-number v-model="chartForm.x_axis_count" :min="1" :max="25" style="width: 140px" />
        </div>
      </div>
      <template #footer>
        <el-button @click="chartFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitChart">{{ chartForm.config_id ? '保存' : '提交' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts/core'
import { PieChart, BarChart, LineChart } from 'echarts/charts'
import { TooltipComponent, GridComponent, TitleComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import {
  getModelStatistics, searchModelAttributes, searchModels,
  getOperationCharts, getOperationChartData,
  createOperationChart, updateOperationChart, deleteOperationChart
} from '../../api/cmdb'

echarts.use([PieChart, BarChart, LineChart, TooltipComponent, GridComponent, TitleComponent, LegendComponent, CanvasRenderer])

const categoryTab = ref('')
const chartList = ref([])
const chartDataMap = ref({})
const loading = ref(false)

const chartRefs = ref({})
const chartInstances = ref({})

// NAVTYPE 顶部卡
const navCards = ref([
  { key: 'biz', label: '业务总数', value: 0, icon: 'icon-cc-business', bg: 'linear-gradient(90deg, #3A84FF, #6BA3FF)', to: '/resource/business' },
  { key: 'host', label: '主机总数', value: 0, icon: 'icon-cc-host', bg: 'linear-gradient(90deg, #2DCB56, #5AD888)', to: '/resource/host' },
  { key: 'model', label: '自定义模型总数', value: 0, icon: 'icon-cc-nav-model-02', bg: 'linear-gradient(90deg, #3A84FF, #5E5EF7)', to: '/model/management', tip: true },
  { key: 'inst', label: '实例总数', value: 0, icon: 'icon-cc-customization', bg: 'linear-gradient(90deg, #14C0C0, #4AD8D8)', to: '/resource/index', tip: true }
])

// 无图表配置时的内置默认图表(对齐老版初次使用展示)
const defaultCharts = [
  { key: 'os', name: '按操作系统类型统计' },
  { key: 'biz', name: '按业务统计' },
  { key: 'cloud', name: '按管控区域统计' }
]
const defaultEmpty = ref(false)

// 图表表单(老版 chart-detail.vue 契约)
const chartFormVisible = ref(false)
const chartForm = ref({ report_type: 'custom', name: '', config_id: null, bk_obj_id: 'host', chart_type: 'pie', field: '', width: '50', x_axis_count: 10 })
const chartTypeCustom = ref(true)
const hostKind = ref('host') // 老版 hostType: host=主机统计 inst=实例统计
const staticModels = ref([])
const dimensionList = ref([])
const saving = ref(false)

// 老版 seList 内置图表清单
const BUILTIN_HOST = [
  { name: '按操作系统类型统计', repType: 'host_os_chart' },
  { name: '按业务统计', repType: 'host_biz_chart' },
  { name: '按管控区域统计', repType: 'host_cloud_chart' },
  { name: '主机数量变化趋势', repType: 'host_change_biz_chart' }
]
const BUILTIN_INST = [
  { name: '实例数量统计', repType: 'model_inst_chart' },
  { name: '实例变更统计', repType: 'model_inst_change_chart' }
]
const builtinList = computed(() => (hostKind.value === 'host' ? BUILTIN_HOST : BUILTIN_INST))
const existedRepTypes = computed(() => flatCharts.value.map((c) => c.report_type))
const dialogTitle = computed(() => `${chartForm.value.config_id ? '编辑' : '新建'}${hostKind.value === 'host' ? '主机' : '实例'}统计`)

function isFieldUsed(property) {
  if (hostKind.value === 'host') {
    return flatCharts.value.some((c) => c.field === property.bk_property_id)
  }
  const existed = flatCharts.value.find((c) => c.bk_obj_id === property.bk_obj_id)
  return existed ? existed.field === property.bk_property_id : false
}

async function loadDimensions(objId) {
  if (!objId) { dimensionList.value = []; return }
  try {
    const attrs = await searchModelAttributes(objId)
    dimensionList.value = (attrs || []).filter((item) => {
      if (hostKind.value === 'host') {
        return item.bk_property_type === 'enum' && item.bk_property_id !== 'bk_os_type'
      }
      return item.bk_property_type === 'enum'
    })
  } catch { dimensionList.value = [] }
}

watch(() => chartForm.value.bk_obj_id, (id) => {
  if (chartTypeCustom.value) loadDimensions(id)
})

async function loadStaticModels() {
  if (staticModels.value.length) return
  try {
    const models = await searchModels({})
    const list = Array.isArray(models) ? models : models?.info || []
    // 老版契约: 排除隐藏模型与 host/module/biz/set
    staticModels.value = list.filter((m) => !m.bk_ishidden && !['host', 'module', 'biz', 'set'].includes(m.bk_obj_id))
  } catch { staticModels.value = [] }
}

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
      const items = data.map((d) => ({ name: d.id || d.name || d.label || '--', value: d.value ?? d.count ?? 0 }))
      const type = chart.chart_type === 'bar' ? 'bar' : 'pie'
      if (type === 'pie') {
        meta.push(`饼图 ${items.length} 项`)
        return {
          meta,
          option: {
            tooltip: { trigger: 'item' },
            legend: { bottom: 0, type: 'scroll' },
            series: [{ type: 'pie', radius: ['40%', '70%'], data: items }]
          }
        }
      }
      meta.push(`柱状 ${items.length} 项`)
      return {
        meta,
        option: {
          tooltip: { trigger: 'axis' },
          grid: { left: 40, right: 16, bottom: 60, top: 20 },
          xAxis: { type: 'category', data: items.map((d) => d.name), axisLabel: { rotate: 30 } },
          yAxis: { type: 'value' },
          series: [{ type: 'bar', data: items.map((d) => d.value), itemStyle: { color: '#3A84FF' } }]
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
        // 后端 SearchChartData 的解析对多余/格式不符字段(如 create_time 字符串)敏感,会导致 data 返回 null
        // 只发它认识的必要字段
        const payload = {
          config_id: chart.config_id,
          report_type: chart.report_type,
          name: chart.name,
          bk_obj_id: chart.bk_obj_id || '',
          chart_type: chart.chart_type || '',
          field: chart.field || '',
          x_axis_count: chart.x_axis_count || 10
        }
        const data = await getOperationChartData(payload)
        chartDataMap.value[chart.config_id] = Array.isArray(data) ? data : (data ? [data] : [])
      } catch (e) {
        chartDataMap.value[chart.config_id] = []
      }
    }))
    await nextTick()
    for (const chart of chartList.value) renderChart(chart)
  } finally {
    loading.value = false
  }
  if (!chartList.value.length) await renderDefaultCharts()
}

// 内置默认图表:用真实 host 统计接口渲染(对齐老版初次使用)
async function renderDefaultCharts() {
  await nextTick()
  try {
    const stats = await getModelStatistics().catch(() => [])
    const hostCount = (stats || []).find((s) => s.bk_obj_id === 'host')?.instance_count || 0
    const bizCount = (stats || []).find((s) => s.bk_obj_id === 'biz')?.instance_count || 0
    defaultEmpty.value = hostCount === 0 && bizCount === 0
    const mk = (key, name, value) => {
      const el = chartRefs.value[key]
      if (!el) return
      chartInstances.value[key]?.dispose()
      chartInstances.value[key] = echarts.init(el)
      chartInstances.value[key].setOption({
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, left: 'center' },
        series: [{
          type: name === '按业务统计' ? 'bar' : 'pie',
          radius: name === '按业务统计' ? undefined : ['45%', '70%'],
          data: [{ name: value ? '有数据' : '暂无数据', value: value || 0 }],
          itemStyle: { color: '#3A84FF' },
          label: { show: false }
        }]
      })
    }
    mk('os', '按操作系统类型统计', hostCount)
    mk('biz', '按业务统计', bizCount)
    mk('cloud', '按管控区域统计', 0)
  } catch (e) { defaultEmpty.value = true }
}

async function openChartDialog(row, kind = 'host') {
  hostKind.value = kind
  if (row) {
    chartForm.value = {
      config_id: row.config_id,
      report_type: row.report_type,
      name: row.name || '',
      bk_obj_id: row.bk_obj_id || 'host',
      chart_type: row.chart_type || 'pie',
      field: row.field || '',
      width: String(row.width || '50'),
      x_axis_count: Number(row.x_axis_count) || 10
    }
    chartTypeCustom.value = row.report_type === 'custom'
    if (chartTypeCustom.value) loadDimensions(chartForm.value.bk_obj_id)
  } else {
    chartForm.value = { report_type: 'custom', name: '', config_id: null, bk_obj_id: kind === 'host' ? 'host' : '', chart_type: 'pie', field: '', width: '50', x_axis_count: 10 }
    chartTypeCustom.value = true
    dimensionList.value = []
    if (kind === 'inst') {
      await loadStaticModels()
      chartForm.value.bk_obj_id = staticModels.value[0]?.bk_obj_id || ''
      if (chartForm.value.bk_obj_id) loadDimensions(chartForm.value.bk_obj_id)
    }
  }
  chartFormVisible.value = true
}

async function submitChart() {
  if (chartTypeCustom.value && !chartForm.value.name) { ElMessage.warning('请输入图表名称'); return }
  if (!chartTypeCustom.value && !chartForm.value.name) { ElMessage.warning('请选择内置图表'); return }
  saving.value = true
  try {
    // 老版契约: 内置图表 report_type=repType 且剔除自定义字段;自定义 report_type=custom
    const data = { ...chartForm.value }
    if (chartTypeCustom.value) {
      data.report_type = 'custom'
      if (hostKind.value === 'host') data.bk_obj_id = 'host'
    } else {
      const hit = builtinList.value.find((opt) => opt.name === data.name)
      data.report_type = hit?.repType || data.report_type
      delete data.bk_obj_id
      delete data.config_id
      delete data.field
      delete data.name
      delete data.chart_type
    }
    data.x_axis_count = parseInt(data.x_axis_count, 10) || 10
    if (chartForm.value.config_id) {
      await updateOperationChart(data)
      ElMessage.success('已更新')
    } else {
      await createOperationChart(data)
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
.nav-type { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
.nav-card {
  border-radius: 2px;
  padding: 18px 24px; display: flex; align-items: center; justify-content: space-between;
  cursor: pointer; transition: box-shadow 0.2s, transform 0.2s;
}
.nav-card:hover { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); transform: translateY(-1px); }
.nc-left { display: flex; flex-direction: column; gap: 6px; }
.nc-num { font-size: 26px; color: #fff; font-weight: 700; line-height: 1; }
.nc-label { font-size: 13px; color: rgba(255,255,255,0.9); display: inline-flex; align-items: center; gap: 3px; }
.nc-tip { font-size: 13px; opacity: 0.8; }
.nc-circle {
  width: 52px; height: 52px; border-radius: 50%;
  background: rgba(255,255,255,0.2);
  display: inline-flex; align-items: center; justify-content: center;
}
.nc-icon { font-size: 24px; color: #fff; }

.section-title { font-size: 15px; font-weight: 600; color: #313238; margin: 0 0 12px; }
.section-title .add-icon { color: #3A84FF; cursor: pointer; margin-left: 4px; }
.default-box { min-height: 320px; position: relative; }
.default-box .chart-canvas { height: 260px; }
.chart-empty {
  position: absolute; inset: 60px 0 30px;
  display: flex; align-items: center; justify-content: center;
  color: #979BA5; font-size: 13px;
}

.op-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.op-toolbar .spacer { flex: 1; }
.card-head { display: flex; align-items: center; gap: 10px; }
.chart-box { border: 1px solid #e7e9ef; border-radius: 6px; padding: 12px; margin-bottom: 12px; }
.chart-title { display: flex; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 10px; color: #313238; }
.chart-title .ct-name { flex: 1; }
.ct-ops { display: flex; gap: 4px; }
.chart-canvas { width: 100%; height: 260px; }
.chart-meta { margin-top: 8px; display: flex; gap: 6px; }
.chart-form { padding: 0 8px; }
.chart-form .form-row { display: flex; align-items: center; margin-bottom: 20px; }
.chart-form .row-label { flex: 0 0 110px; text-align: right; padding-right: 16px; font-size: 14px; color: #63656E; }
.chart-form .dim-tip { color: #C4C6CC; margin-left: 2px; cursor: help; }
</style>