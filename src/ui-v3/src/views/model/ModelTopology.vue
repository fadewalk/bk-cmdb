<template>
  <div class="page-card topo-wrapper" :class="{ 'is-fullscreen': isFullscreen }">
    <!-- 顶部工具栏 -->
    <div class="topo-toolbar">
      <el-button v-if="!isEdit" type="primary" size="small" @click="enterEdit" :disabled="!canEdit">编辑拓扑</el-button>
      <template v-else>
        <el-button type="primary" size="small" @click="exitEdit">返回</el-button>
        <span class="edit-cue">所有更改已自动保存</span>
      </template>
      <div class="spacer" />
      <div class="vis-buttons">
        <el-tooltip content="全屏" placement="top">
          <i class="bk-cmdb-icon icon-cc-fullscreen-outlined vis-btn" @click="toggleFullscreen" />
        </el-tooltip>
        <el-tooltip content="还原" placement="top">
          <i class="bk-cmdb-icon icon-cc-fit vis-btn" @click="resetView" />
        </el-tooltip>
        <el-tooltip content="缩小" placement="top">
          <i class="bk-cmdb-icon icon-cc-zoom-out vis-btn" @click="zoomOut" />
        </el-tooltip>
        <el-tooltip content="放大" placement="top">
          <i class="bk-cmdb-icon icon-cc-zoom-in vis-btn" @click="zoomIn" />
        </el-tooltip>
      </div>
    </div>

    <div class="topo-body">
      <!-- 左侧分组导航 -->
      <ul class="topo-nav">
        <li class="group-item">
          <div
            :class="['group-info', { selected: selectedGroupId === -1, active: activeGroupId === -1 }]"
            @click="selectGroup()"
          >
            <span class="group-name">全部模型</span>
            <span class="model-count">{{ modelList.length > 999 ? '999+' : modelList.length }}</span>
          </div>
        </li>
        <li v-for="(g, gi) in classifications" :key="g.bk_classification_id || gi" class="group-item">
          <div
            :class="{
              'group-info': true,
              active: activeGroupId === g.bk_classification_id,
              selected: selectedGroupId === g.bk_classification_id,
              invisible: hideGroupIds.includes(g.bk_classification_id)
            }"
            @click="selectGroup(g)"
          >
            <i :class="['toggle-arrow', g._collapsed ? 'icon-angle-right' : 'icon-angle-down']"
               @click.stop="toggleCollapse(g)" />
            <span class="group-name" :title="g.bk_classification_name">{{ g.bk_classification_name }}</span>
            <span class="model-count">{{ countByGroup(g.bk_classification_id) }}</span>
          </div>
          <ul v-if="!g._collapsed" class="model-list">
            <li v-for="m in modelsByGroup(g.bk_classification_id)" :key="m.bk_obj_id"
                :class="{ active: selectedModelId === m.bk_obj_id }"
                @click="selectModel(m)">
              <span class="model-name">{{ m.bk_obj_name || m.bk_obj_id }}</span>
            </li>
          </ul>
        </li>
      </ul>

      <!-- 中央画布 -->
      <div class="graph-wrap" ref="wrap" v-loading="loading">
        <svg :width="vw" :height="vh"
             :viewBox="`${vbX} ${vbY} ${vw} ${vh}`"
             @mousedown="onCanvasMouseDown" @wheel="onWheel">
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,8 L8,4 z" fill="#C4C6CC" />
            </marker>
            <marker id="arrow-builtin" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,8 L8,4 z" fill="#3A84FF" />
            </marker>
          </defs>

          <!-- 关联边 -->
          <g v-for="e in visibleEdges" :key="e.key">
            <line :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
                  :stroke="e.builtIn ? '#3A84FF' : '#C4C6CC'"
                  :stroke-width="e.highlight ? 2 : 1.2"
                  :marker-end="e.builtIn ? 'url(#arrow-builtin)' : 'url(#arrow)'" />
            <rect :x="(e.x1 + e.x2) / 2 - e.label.length * 4.5" :y="(e.y1 + e.y2) / 2 - 18"
                  :width="e.label.length * 9 + 8" :height="16"
                  fill="#fff" rx="2"
                  :stroke="e.builtIn ? '#3A84FF' : '#DCDEE5'" />
            <text :x="(e.x1 + e.x2) / 2" :y="(e.y1 + e.y2) / 2 - 6"
                  :class="['edge-label', { highlight: e.highlight }]">{{ e.label }}</text>
          </g>

          <!-- 节点(主线在上, 自定义在下,内置标记为蓝填充) -->
          <g v-for="n in visibleNodes" :key="n.objId"
             :transform="`translate(${n.x - n.w / 2},${n.y - n.h / 2})`"
             :class="['node-g', { dim: isDim(n), selected: selectedModelId === n.objId }]"
             @mousedown.stop="startDrag(n, $event)"
             @click="onNodeClick(n)">
            <rect :width="n.w" :height="n.h" rx="20"
                  :fill="nodeFill(n)"
                  :stroke="nodeStroke(n)"
                  :stroke-width="selectedModelId === n.objId ? 2 : 1" />
            <text :x="n.w / 2" :y="n.h / 2 + 4" text-anchor="middle"
                  :class="['node-text', { light: isMainLineNode(n) }]">{{ n.name }}</text>
            <text v-if="n.mainLine" :x="n.w / 2" :y="n.h / 2 + 18" text-anchor="middle"
                  class="node-sub">{{ n.objId }}</text>
          </g>
        </svg>

        <!-- 右下角 legend -->
        <div class="topo-legend">
          <p class="legend-item builtin">
            <i class="dot builtin" />
            <span>内置模型</span>
          </p>
          <p class="legend-item custom">
            <i class="dot custom" />
            <span>自定义模型</span>
          </p>
        </div>
      </div>

      <!-- 右侧详情面板 -->
      <div v-if="selectedModel" class="topo-detail">
        <div class="detail-head">
          <h3>{{ selectedModel.bk_obj_name }}</h3>
          <el-button link type="primary" size="small" @click="goModel(selectedModel)">查看详情 →</el-button>
        </div>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="模型 ID">{{ selectedModel.bk_obj_id }}</el-descriptions-item>
          <el-descriptions-item label="分类 ID">{{ selectedModel.bk_classification_id || '-' }}</el-descriptions-item>
          <el-descriptions-item label="是否预置">{{ selectedModel.bk_ispre ? '是' : '否' }}</el-descriptions-item>
        </el-descriptions>
        <div class="detail-assoc" v-if="modelAssocs.length">
          <div class="da-title">关联此模型 ({{ modelAssocs.length }})</div>
          <ul>
            <li v-for="(a, i) in modelAssocs" :key="i">
              <span class="da-name">{{ a.name }}</span>
              <span class="da-arrow">{{ a.dir }}</span>
              <span class="da-target">{{ a.targetName }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { http, searchModels, searchClassifications, searchModelAttributes } from '../../api/cmdb'

const router = useRouter()
const wrap = ref(null)

const loading = ref(false)
const modelList = ref([])
const assocList = ref([])
const classifications = ref([])
const selectedGroupId = ref(-1)
const activeGroupId = ref(-1)
const hideGroupIds = ref([])
const selectedModelId = ref(null)

const vw = ref(1100)
const vh = ref(560)
const vbX = ref(0)
const vbY = ref(0)
const scale = ref(1)

const nodes = ref([])
const edges = ref([])
const dragging = ref(null)
const isEdit = ref(false)
const isFullscreen = ref(false)
const canEdit = false

const MAIN_LINE = ['biz', 'set', 'module', 'host', 'process']
const NAMES = { biz: '业务', set: '集群', module: '模块', host: '主机', process: '进程' }

const selectedModel = computed(() => modelList.value.find((m) => m.bk_obj_id === selectedModelId.value) || null)

function countByGroup(gid) {
  return modelList.value.filter((m) => m.bk_classification_id === gid).length
}
function modelsByGroup(gid) {
  return modelList.value.filter((m) => m.bk_classification_id === gid)
}
function isMainLineNode(n) {
  return MAIN_LINE.includes(n.objId)
}
function isDim(n) {
  if (selectedGroupId.value === -1) return false
  if (selectedGroupId.value === 'hidden') return true
  return n.groupId !== selectedGroupId.value
}
function nodeFill(n) {
  if (selectedModelId.value === n.objId) return '#3A84FF'
  if (n.mainLine) return '#E1ECFF'
  if (!n.mainLine && n.groupId === selectedGroupId.value) return '#FFF7E1'
  return '#fff'
}
function nodeStroke(n) {
  if (selectedModelId.value === n.objId) return '#3A84FF'
  return n.mainLine ? '#3A84FF' : '#FFB23A'
}
function toggleCollapse(g) {
  g._collapsed = !g._collapsed
}
function selectGroup(g) {
  selectedModelId.value = null
  if (!g) {
    selectedGroupId.value = -1
    activeGroupId.value = -1
    return
  }
  selectedGroupId.value = g.bk_classification_id
  activeGroupId.value = g.bk_classification_id
}
function selectModel(m) {
  selectedModelId.value = m.bk_obj_id
}
function goModel(m) {
  router.push(`/model/management/details/${m.bk_obj_id}`)
}
const visibleNodes = computed(() => nodes.value.filter((n) => !hideGroupIds.value.includes(n.groupId)))
const visibleEdges = computed(() => edges.value.filter((e) => !hideGroupIds.value.includes(e.g1) && !hideGroupIds.value.includes(e.g2)))

const modelAssocs = computed(() => {
  if (!selectedModelId.value) return []
  const out = []
  for (const a of assocList.value) {
    if (a.bk_obj_id === selectedModelId.value) {
      const t = modelList.value.find((m) => m.bk_obj_id === a.bk_asst_obj_id)
      out.push({ name: a.bk_asst_id, dir: '→', targetName: t?.bk_obj_name || a.bk_asst_obj_id })
    } else if (a.bk_asst_obj_id === selectedModelId.value) {
      const t = modelList.value.find((m) => m.bk_obj_id === a.bk_obj_id)
      out.push({ name: a.bk_asst_id, dir: '←', targetName: t?.bk_obj_name || a.bk_obj_id })
    }
  }
  return out
})

function layout() {
  const models = modelList.value
  if (!models.length) return
  const W = vw.value
  const H = vh.value
  const w = 130, h = 50
  const placed = {}
  // 主线模型:上排(横向 5 等分)
  const main = models.filter((m) => MAIN_LINE.includes(m.bk_obj_id))
  main.forEach((m, i) => {
    placed[m.bk_obj_id] = {
      objId: m.bk_obj_id,
      name: m.bk_obj_name || NAMES[m.bk_obj_id] || m.bk_obj_id,
      mainLine: true,
      groupId: m.bk_classification_id,
      w, h,
      x: (W / (main.length + 1)) * (i + 1),
      y: 100
    }
  })
  // 自定义模型:下方网格 (主分类一组)
  const others = models.filter((m) => !MAIN_LINE.includes(m.bk_obj_id))
  const cols = 6
  others.forEach((m, i) => {
    const col = i % cols, row = Math.floor(i / cols)
    placed[m.bk_obj_id] = {
      objId: m.bk_obj_id,
      name: m.bk_obj_name || m.bk_obj_id,
      mainLine: false,
      groupId: m.bk_classification_id,
      w, h,
      x: 80 + col * (w + 50),
      y: 260 + row * (h + 50)
    }
  })
  nodes.value = Object.values(placed)
  edges.value = assocList.value
    .filter((a) => placed[a.bk_obj_id] && placed[a.bk_asst_obj_id])
    .map((a, i) => ({
      key: i,
      label: a.bk_asst_name || a.bk_asst_id,
      x1: placed[a.bk_obj_id].x,
      y1: placed[a.bk_obj_id].y,
      x2: placed[a.bk_asst_obj_id].x,
      y2: placed[a.bk_asst_obj_id].y,
      g1: placed[a.bk_obj_id].groupId,
      g2: placed[a.bk_asst_obj_id].groupId,
      builtIn: a.bk_ispre || (placed[a.bk_obj_id].mainLine && placed[a.bk_asst_obj_id].mainLine)
    }))
  vbX.value = 0
  vbY.value = 0
  scale.value = 1
}

function startDrag(node, evt) {
  dragging.value = { node, sx: evt.clientX, sy: evt.clientY, ox: node.x, oy: node.y }
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
}
function onDrag(evt) {
  if (!dragging.value) return
  const d = dragging.value
  d.node.x = d.ox + (evt.clientX - d.sx) / scale.value
  d.node.y = d.oy + (evt.clientY - d.sy) / scale.value
}
function stopDrag() {
  dragging.value = null
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
}
function onNodeClick(n) {
  selectedModelId.value = n.objId
}

function onCanvasMouseDown(evt) {
  // 点击空白 → 取消选中
  if (evt.target === evt.currentTarget || evt.target.tagName === 'svg') {
    selectedModelId.value = null
  }
}

function onWheel(evt) {
  evt.preventDefault()
  const delta = evt.deltaY > 0 ? 0.9 : 1.1
  scale.value = Math.max(0.4, Math.min(2, scale.value * delta))
  vw.value = 1100 / scale.value
  vh.value = 560 / scale.value
  vbX.value = vbX.value
  vbY.value = vbY.value
}
function zoomIn() { scale.value = Math.min(2, scale.value * 1.2); vw.value = 1100 / scale.value; vh.value = 560 / scale.value }
function zoomOut() { scale.value = Math.max(0.4, scale.value / 1.2); vw.value = 1100 / scale.value; vh.value = 560 / scale.value }
function resetView() { scale.value = 1; vw.value = 1100; vh.value = 560; vbX.value = 0; vbY.value = 0; layout() }
function toggleFullscreen() { isFullscreen.value = !isFullscreen.value }
function enterEdit() { ElMessage.info('独立模式暂不支持拓扑编辑,需系统管理员权限') }
function exitEdit() { isEdit.value = false }

onMounted(async () => {
  loading.value = true
  try {
    const [models, groups] = await Promise.all([
      searchModels({}),
      searchClassifications().catch(() => [])
    ])
    modelList.value = models || []
    classifications.value = (groups || [])
      .map((g) => ({ ...g, _collapsed: false }))
      .sort((a, b) => (a.bk_classification_id || 0) - (b.bk_classification_id || 0))
    try {
      const modelIds = modelList.value.map((m) => m.bk_obj_id)
      const assoc = await http.post('/find/objectassociation', {
        condition: { bk_obj_id: { $in: modelIds } }
      }).catch(() => [])
      assocList.value = Array.isArray(assoc) ? assoc : []
    } catch { assocList.value = [] }
    layout()
  } finally { loading.value = false }
})
onBeforeUnmount(stopDrag)
</script>

<style scoped>
.topo-wrapper { display: flex; flex-direction: column; height: 100%; }
.topo-wrapper.is-fullscreen {
  position: fixed; inset: 0; z-index: 9999;
  background: #fff;
}
.topo-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-bottom: 1px solid #E7E9EF;
  background: #FAFBFD;
}
.edit-cue { color: #979BA5; font-size: 12px; margin-left: 8px; }
.topo-toolbar .spacer { flex: 1; }
.vis-buttons { display: flex; gap: 4px; align-items: center; }
.vis-btn {
  width: 28px; height: 28px; line-height: 28px; text-align: center;
  cursor: pointer; color: #63656E; font-size: 18px; border-radius: 2px;
}
.vis-btn:hover { background: #E1ECFF; color: #3A84FF; }

.topo-body { display: flex; flex: 1; overflow: hidden; min-height: 0; }

.topo-nav {
  width: 240px; flex: 0 0 240px;
  border-right: 1px solid #E7E9EF;
  background: #fff;
  list-style: none; margin: 0; padding: 8px 0;
  overflow-y: auto;
}
.group-item { margin-bottom: 2px; }
.group-info {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; cursor: pointer;
  border-left: 3px solid transparent;
}
.group-info:hover { background: #F6F6F9; }
.group-info.active { color: #3A84FF; }
.group-info.selected { background: #E1ECFF; border-left-color: #3A84FF; color: #3A84FF; }
.group-info.invisible { opacity: 0.4; }
.group-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-count { color: #979BA5; font-size: 12px; }
.toggle-arrow {
  width: 14px; font-size: 12px; color: #979BA5;
  font-style: normal;
}
.model-list {
  list-style: none; margin: 0; padding: 0 0 4px 28px;
}
.model-list li {
  padding: 4px 12px; font-size: 12px; cursor: pointer; color: #63656E;
  border-radius: 2px; margin: 1px 6px;
}
.model-list li:hover { background: #F0F1F5; }
.model-list li.active { background: #E1ECFF; color: #3A84FF; }

.graph-wrap {
  flex: 1; position: relative; overflow: hidden;
  background: #FAFBFD;
  background-image:
    linear-gradient(0deg, transparent 24%, rgba(60,150,255,.05) 25%, rgba(60,150,255,.05) 26%, transparent 27%, transparent 74%, rgba(60,150,255,.05) 75%, rgba(60,150,255,.05) 76%, transparent 77%, transparent),
    linear-gradient(90deg, transparent 24%, rgba(60,150,255,.05) 25%, rgba(60,150,255,.05) 26%, transparent 27%, transparent 74%, rgba(60,150,255,.05) 75%, rgba(60,150,255,.05) 76%, transparent 77%, transparent);
  background-size: 50px 50px;
}
.graph-wrap svg { display: block; }
.node-g { cursor: pointer; transition: opacity 0.2s; }
.node-g.dim { opacity: 0.25; }
.node-text { font-size: 13px; fill: #313238; pointer-events: none; user-select: none; }
.node-text.light { fill: #fff; }
.node-sub { font-size: 10px; fill: #6A7A8C; pointer-events: none; user-select: none; }

.edge-label { font-size: 12px; fill: #63656E; pointer-events: none; user-select: none; }
.edge-label.highlight { fill: #3A84FF; font-weight: 600; }

.topo-legend {
  position: absolute; right: 12px; bottom: 12px;
  display: flex; flex-direction: column; gap: 6px;
  background: #fff; border: 1px solid #E7E9EF; border-radius: 2px;
  padding: 8px 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.04);
}
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #63656E; }
.legend-item .dot {
  width: 14px; height: 14px; border-radius: 50%;
  border: 1px solid #3A84FF; display: inline-block;
}
.legend-item.builtin .dot { background: #E1ECFF; }
.legend-item.custom .dot { background: #fff; border-color: #FFB23A; }

.topo-detail {
  width: 280px; flex: 0 0 280px;
  border-left: 1px solid #E7E9EF;
  background: #fff;
  padding: 16px;
  overflow-y: auto;
}
.detail-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.detail-head h3 { margin: 0; font-size: 16px; color: #313238; }
.detail-assoc { margin-top: 16px; }
.da-title { font-weight: 600; color: #313238; margin-bottom: 8px; }
.detail-assoc ul { list-style: none; margin: 0; padding: 0; }
.detail-assoc li {
  padding: 6px 8px; font-size: 12px; color: #63656E;
  border-bottom: 1px solid #F0F1F5; display: flex; gap: 6px; align-items: center;
}
.da-name { color: #3A84FF; font-weight: 500; min-width: 60px; }
.da-arrow { color: #979BA5; }
.da-target { color: #313238; }
</style>
