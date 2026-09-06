<template>
  <div class="page-card">
    <div class="table-toolbar">
      <span class="hint">模型关系图:连线表示模型间的关联(拖动节点调整布局)</span>
      <div class="spacer" />
      <el-button :icon="'Refresh'" size="small" @click="layout">重置布局</el-button>
    </div>

    <div class="graph-wrap" ref="wrap">
      <svg :width="width" :height="height">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,8 L8,4 z" fill="#C4C6CC" />
          </marker>
        </defs>
        <g>
          <g v-for="e in edges" :key="e.key">
            <line :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2" stroke="#C4C6CC" stroke-width="1.5" marker-end="url(#arrow)" />
            <rect :x="(e.x1 + e.x2) / 2 - e.label.length * 4.5" :y="(e.y1 + e.y2) / 2 - 18" :width="e.label.length * 9 + 8" :height="16" fill="#fff" rx="2" stroke="#DCDEE5" />
            <text :x="(e.x1 + e.x2) / 2" :y="(e.y1 + e.y2) / 2 - 6" class="edge-label">{{ e.label }}</text>
          </g>
        </g>
        <g
          v-for="n in nodes" :key="n.objId"
          :transform="`translate(${n.x},${n.y})`"
          class="node-g"
          @mousedown="startDrag(n, $event)"
        >
          <rect :width="n.w" :height="n.h" rx="4"
            :fill="n.mainLine ? '#E1ECFF' : '#fff'" stroke="#3A84FF" stroke-width="1" />
          <text :x="n.w / 2" :y="n.h / 2 + 4" text-anchor="middle" class="node-text">{{ n.name }}</text>
        </g>
      </svg>
    </div>
    <div class="legend">
      <span class="legend-item"><span class="swatch main" />主线模型</span>
      <span class="legend-item"><span class="swatch other" />自定义模型</span>
      <span class="legend-item">连线为模型关联关系(来源:操作审计之外的真实关联配置)</span>
    </div>
  </div>
</template>

<script setup>
// 模型拓扑:模型为节点、关联为边,简单分层布局 + 鼠标拖动
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { http, searchModels } from '../../api/cmdb'

const MAIN_LINE = ['biz', 'set', 'module', 'host', 'process']
const NAMES = { biz: '业务', set: '集群', module: '模块', host: '主机', process: '进程' }

const wrap = ref(null)
const width = ref(1100)
const height = ref(520)
const nodes = ref([])
const edges = ref([])
const dragging = ref(null)

function layout() {
  width.value = wrap.value?.clientWidth || 1100
  const models = modelList.value
  const main = models.filter((m) => MAIN_LINE.includes(m.bk_obj_id))
  const others = models.filter((m) => !MAIN_LINE.includes(m.bk_obj_id))
  const w = 120, h = 36
  const placed = {}
  // 主线模型:上层横排
  main.forEach((m, i) => {
    placed[m.bk_obj_id] = {
      objId: m.bk_obj_id,
      name: m.bk_obj_name || NAMES[m.bk_obj_id] || m.bk_obj_id,
      mainLine: true,
      w, h,
      x: (width.value / (main.length + 1)) * (i + 1) - w / 2,
      y: 60
    }
  })
  // 其他模型:下方两行网格
  others.forEach((m, i) => {
    const col = i % 5, row = Math.floor(i / 5)
    placed[m.bk_obj_id] = {
      objId: m.bk_obj_id,
      name: m.bk_obj_name || m.bk_obj_id,
      mainLine: false,
      w, h,
      x: 60 + col * (w + 60),
      y: 240 + row * (h + 40)
    }
  })
  nodes.value = Object.values(placed)
  edges.value = assocList.value
    .filter((a) => placed[a.bk_obj_id] && placed[a.bk_asst_obj_id])
    .map((a, i) => ({
      key: i,
      label: a.bk_asst_id,
      x1: placed[a.bk_obj_id].x + placed[a.bk_obj_id].w / 2,
      y1: placed[a.bk_obj_id].y + placed[a.bk_obj_id].h / 2,
      x2: placed[a.bk_asst_obj_id].x + placed[a.bk_asst_obj_id].w / 2,
      y2: placed[a.bk_asst_obj_id].y + placed[a.bk_asst_obj_id].h / 2
    }))
}

const modelList = ref([])
const assocList = ref([])

function startDrag(node, evt) {
  dragging.value = { node, sx: evt.clientX, sy: evt.clientY, ox: node.x, oy: node.y }
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
}
function onDrag(evt) {
  if (!dragging.value) return
  const d = dragging.value
  d.node.x = Math.max(0, d.ox + evt.clientX - d.sx)
  d.node.y = Math.max(0, d.oy + evt.clientY - d.sy)
}
function stopDrag() {
  dragging.value = null
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
}

onMounted(async () => {
  const [models, assoc] = await Promise.all([
    searchModels({}),
    http.post('/find/objectassociation', {
      condition: { bk_obj_id: { $in: (await searchModels({})).map((m) => m.bk_obj_id) } }
    }).catch(() => [])
  ])
  modelList.value = models || []
  assocList.value = Array.isArray(assoc) ? assoc : []
  layout()
})
onBeforeUnmount(stopDrag)
</script>

<style scoped>
.hint { color: #979BA5; }
.graph-wrap { background: #FAFBFD; border: 1px solid #E7E9EF; border-radius: 4px; overflow: auto; }
.node-g { cursor: move; }
.node-text { font-size: 12px; fill: #313238; }
.edge-label { font-size: 12px; fill: #63656E; }
.legend { margin-top: 12px; color: #63656E; font-size: 12px; display: flex; gap: 20px; align-items: center; }
.legend-item { display: inline-flex; align-items: center; gap: 6px; }
.legend-item .swatch { width: 14px; height: 14px; border-radius: 2px; display: inline-block; border: 1px solid #3A84FF; }
.legend-item .swatch.main { background: #E1ECFF; }
.legend-item .swatch.other { background: #fff; }
.dot { display: none; }
</style>
