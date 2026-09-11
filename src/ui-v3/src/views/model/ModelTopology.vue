<template>
  <div :class="['topo-wrapper', { 'is-fullscreen-host': isFullscreen }]">
    <!-- 顶部工具栏(旧版 50px 白条) -->
    <div class="toolbar">
      <template v-if="!isEdit">
        <button class="bk-button bk-primary edit-button" @click="handleEditTopo">编辑拓扑</button>
      </template>
      <template v-else>
        <button class="bk-button bk-primary" @click="handleExitEdit">返回</button>
        <p class="edit-cue">所有更改已自动保存</p>
      </template>
      <div class="vis-button-group">
        <el-tooltip :content="isFullscreen ? '取消全屏' : '全屏'" placement="bottom">
          <i
            :class="['bk-cmdb-icon', isFullscreen ? 'icon-cc-fullscreen-outlined-reset' : 'icon-cc-fullscreen-outlined']"
            @click="resizeFull"
          />
        </el-tooltip>
        <el-tooltip content="还原" placement="bottom">
          <i class="bk-cmdb-icon icon-cc-fit" @click="resizeFit" />
        </el-tooltip>
        <el-tooltip content="缩小" placement="bottom">
          <i class="bk-cmdb-icon icon-cc-zoom-out" @click="zoomOut" />
        </el-tooltip>
        <el-tooltip content="放大" placement="bottom">
          <i class="bk-cmdb-icon icon-cc-zoom-in" @click="zoomIn" />
        </el-tooltip>
        <div class="topo-legend">
          <p class="legend-item built-in"><i /><span>内置模型</span></p>
          <p class="legend-item custom"><i /><span>自定义模型</span></p>
        </div>
      </div>
    </div>

    <!-- 左侧分组导航(旧版 210px topo-nav) -->
    <ul class="topo-nav">
      <li class="group-item">
        <div
          :class="['group-info', 'group-total', { selected: topoNav.selectedGroupId === -1 }]"
          @click="handleSelectGroup()"
        >
          <span class="group-name">全部模型</span>
          <span class="model-count">{{ navModelList.length > 1000 ? '999+' : navModelList.length }}</span>
        </div>
      </li>
      <li v-for="group in localClassifications" :key="group.bk_classification_id" class="group-item">
        <div
          :class="['group-info', {
            active: topoNav.activeGroupId === group.bk_classification_id,
            selected: topoNav.selectedGroupId === group.bk_classification_id,
            invisible: hideGroupIds.includes(group.bk_classification_id)
          }]"
          @click="handleSelectGroup(group)"
        >
          <span class="toggle-arrow" @click.stop="handleSlideGroup(group)">
            <i class="bk-cmdb-icon icon-cc-angle-right" />
          </span>
          <span class="group-name" :title="group.bk_classification_name">{{ group.bk_classification_name }}</span>
          <span class="model-count">{{ group.models.length }}</span>
          <i
            :class="['bk-cmdb-icon', 'icon-eye', hideGroupIds.includes(group.bk_classification_id) ? 'icon-cc-close-eye' : 'icon-cc-open-eye']"
            @click.stop="handleToggleGroup(group)"
          />
        </div>
        <ul v-show="topoNav.activeGroupId === group.bk_classification_id" class="model-box">
          <li
            v-for="model in group.models"
            :key="model.bk_obj_id"
            class="model-item"
            :class="{
              invisible: hideNodeIds.includes(model.bk_obj_id),
              selected: topoNav.selectedNodeId === model.bk_obj_id
            }"
            @click="handleSelectNode(model)"
          >
            <i :class="['node-icon', 'bk-cmdb-icon', model.bk_obj_icon || 'icon-cc-default', { 'is-public': model.ispre }]" />
            <div class="info">
              <p class="name" :title="model.bk_obj_name">{{ model.bk_obj_name }}</p>
            </div>
            <i
              :class="['bk-cmdb-icon', 'icon-eye', hideNodeIds.includes(model.bk_obj_id) ? 'icon-cc-close-eye' : 'icon-cc-open-eye']"
              @click.stop="handleToggleNode(model, group)"
            />
          </li>
        </ul>
      </li>
    </ul>

    <!-- 拓扑画布(网格底 + 圆形节点 + 带边框关系标签) -->
    <div
      ref="canvasRef"
      class="global-model"
      :class="{ hover: isTopoHover, 'is-panning': panning }"
      @wheel.prevent="onWheel"
      @mousedown="onCanvasMouseDown"
    >
      <div
        class="topo-world"
        :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }"
      >
        <svg class="edge-layer" :width="WORLD_W" :height="WORLD_H">
          <defs>
            <marker id="topo-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,1 L7,4 L0,7 Q1.8,4 0,1 Z" fill="#c3cdd7" />
            </marker>
            <marker id="topo-arrow-hover" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,1 L7,4 L0,7 Q1.8,4 0,1 Z" fill="#3c96ff" />
            </marker>
            <marker id="topo-arrow-start" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M8,1 L1,4 L8,7 Q6.2,4 8,1 Z" fill="#c3cdd7" />
            </marker>
            <marker id="topo-arrow-start-hover" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M8,1 L1,4 L8,7 Q6.2,4 8,1 Z" fill="#3c96ff" />
            </marker>
          </defs>
          <path
            v-for="edge in visibleEdges"
            :key="edge.key"
            :d="edge.path"
            :class="['topo-edge', {
              hover: edge.hover || hoverEdgeKey === edge.key,
              linked: isEdgeLinked(edge),
              dimmed: isEdgeDimmed(edge),
              mask: isEdgeMask(edge)
            }]"
            :marker-end="['src_to_dest', 'bidirectional'].includes(edge.direction) ? edgeMarker(edge, 'end') : undefined"
            :marker-start="['dest_to_src', 'bidirectional'].includes(edge.direction) ? edgeMarker(edge, 'start') : undefined"
          />
          <!-- 加宽透明命中区:交叉线也容易悬停/点出关系详情 -->
          <path
            v-for="edge in visibleEdges"
            :key="`hit-${edge.key}`"
            :d="edge.path"
            class="edge-hit"
            @mouseenter="hoverEdgeKey = edge.key"
            @mouseleave="hoverEdgeKey = null"
            @click.stop="onEdgeClick(edge)"
          />
        </svg>

        <!-- 关系标签(白底带边框盒子) -->
        <div
          v-for="edge in visibleEdges"
          :key="`l-${edge.key}`"
          :class="['edge-label', {
            hover: edge.hover || hoverEdgeKey === edge.key,
            linked: isEdgeLinked(edge),
            dimmed: isEdgeDimmed(edge),
            mask: isEdgeMask(edge)
          }]"
          :style="{ left: edge.mx + 'px', top: edge.my + 'px' }"
          @mouseenter="hoverEdgeKey = edge.key"
          @mouseleave="hoverEdgeKey = null"
          @click.stop="onEdgeClick(edge)"
        >{{ edge.label }}</div>

        <!-- 模型节点(55px 圆 + 下方名称) -->
        <template v-for="node in visibleNodes" :key="node.bk_obj_id">
          <div
            :class="['topo-node', { 'is-pre': node.ispre, selected: selectedNodeId === node.bk_obj_id, mask: isNodeMask(node) }]"
            :style="{ left: node.x - 27.5 + 'px', top: node.y - 27.5 + 'px' }"
            @mousedown.left.stop="onNodeMouseDown(node, $event)"
            @mouseenter="onNodeEnter(node)"
            @mouseleave="onNodeLeave(node)"
            @click.stop="onNodeClick(node)"
          >
            <i class="bk-cmdb-icon" :class="node.bk_obj_icon || 'icon-cc-default'" />
          </div>
          <div
            :class="['topo-node-label', { selected: selectedNodeId === node.bk_obj_id, mask: isNodeMask(node) }]"
            :style="{ left: node.x + 'px', top: node.y + 36.5 + 'px' }"
          >{{ node.bk_obj_name }}</div>

          <!-- 编辑模式节点悬浮操作(连线/隐藏) -->
          <div
            v-if="isEdit && hoverNodeKey === node.bk_obj_id"
            class="topology-node-tooltips"
            :style="{ left: node.x + 42 + 'px', top: node.y - 26 + 'px' }"
            @mouseenter="hoverNodeKey = node.bk_obj_id"
            @mouseleave="hoverNodeKey = null"
          >
            <div class="icon-box" title="新建关联" @click.stop="openCreateRelation(node.bk_obj_id)">
              <i class="bk-cmdb-icon icon-cc-line" />
            </div>
            <div class="icon-box" title="隐藏" @click.stop="hideNodeFromCanvas(node)">
              <i class="bk-cmdb-icon icon-cc-hide" />
            </div>
          </div>
        </template>
      </div>

      <div v-if="loading" class="topo-loading">加载中...</div>
    </div>

    <!-- 关联详情/编辑 -->
    <el-drawer v-model="relationDetailVisible" :title="relationForm.bk_obj_asst_name || relationForm.bk_asst_id || '关联关系详情'" size="460px">
      <el-form label-width="100px">
        <el-form-item label="源模型"><el-input :model-value="modelName(relationForm.bk_obj_id)" disabled /></el-form-item>
        <el-form-item label="目标模型"><el-input :model-value="modelName(relationForm.bk_asst_obj_id)" disabled /></el-form-item>
        <el-form-item label="关联类型"><el-input :model-value="relationForm.bk_asst_id" disabled /></el-form-item>
        <el-form-item label="源-目标约束"><el-input :model-value="relationForm.mapping || '--'" disabled /></el-form-item>
        <el-form-item label="关联描述"><el-input v-model="relationForm.bk_obj_asst_name" :disabled="!isEdit || relationForm.ispre || relationForm.bk_asst_id === 'bk_mainline'" maxlength="256" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="relationDetailVisible = false">关闭</el-button>
        <el-button v-if="isEdit && relationForm.id && !relationForm.ispre && relationForm.bk_asst_id !== 'bk_mainline'" type="primary" :loading="relationSaving" @click="saveRelation">保存</el-button>
        <el-button v-if="isEdit && relationForm.id && !relationForm.ispre && relationForm.bk_asst_id !== 'bk_mainline'" type="danger" plain :loading="relationSaving" @click="removeRelation">删除关联</el-button>
      </template>
    </el-drawer>

    <!-- 新建关联 -->
    <el-drawer v-model="relationCreateVisible" title="新建关联" size="500px">
      <el-form ref="relationCreateFormRef" :model="relationCreateForm" :rules="relationRules" label-width="110px">
        <el-form-item label="源模型" prop="bk_obj_id"><el-select v-model="relationCreateForm.bk_obj_id" filterable style="width: 100%"><el-option v-for="m in modelList" :key="m.bk_obj_id" :label="`${m.bk_obj_name} (${m.bk_obj_id})`" :value="m.bk_obj_id" /></el-select></el-form-item>
        <el-form-item label="目标模型" prop="bk_asst_obj_id"><el-select v-model="relationCreateForm.bk_asst_obj_id" filterable style="width: 100%"><el-option v-for="m in modelList" :key="m.bk_obj_id" :label="`${m.bk_obj_name} (${m.bk_obj_id})`" :value="m.bk_obj_id" /></el-select></el-form-item>
        <el-form-item label="关联类型" prop="bk_asst_id"><el-select v-model="relationCreateForm.bk_asst_id" filterable style="width: 100%"><el-option v-for="a in relationTypes" :key="a.bk_asst_id" :label="`${a.bk_asst_id}${a.bk_asst_name ? `(${a.bk_asst_name})` : ''}`" :value="a.bk_asst_id" /></el-select></el-form-item>
        <el-form-item label="源-目标约束" prop="mapping"><el-select v-model="relationCreateForm.mapping" style="width: 100%"><el-option label="N-N" value="n:n" /><el-option v-if="relationCreateForm.bk_obj_id !== relationCreateForm.bk_asst_obj_id" label="1-N" value="1:n" /><el-option label="1-1" value="1:1" /></el-select></el-form-item>
        <el-form-item label="关联描述"><el-input v-model="relationCreateForm.bk_obj_asst_name" type="textarea" maxlength="256" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="relationCreateVisible = false">取消</el-button><el-button type="primary" :loading="relationSaving" @click="createRelation">提交</el-button></template>
    </el-drawer>
  </div>
</template>

<script setup>
// 模型关系(拓扑)页:按旧版 src/ui/src/views/model-topology/index.new.vue 复刻
// 55px 圆形图标节点 / 210px 分组导航(眼睛隐藏) / 右上角图例 / 网格画布 / 编辑模式拖拽
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchModels, searchClassifications, searchAssociationTypes,
  searchObjectAssociations, createObjectAssociation, updateObjectAssociation, deleteObjectAssociation,
  searchUserCustom, saveUserCustom
} from '../../api/cmdb'

const MAIN_LINE_ORDER = ['biz', 'set', 'module', 'host']
const WORLD_W = 2400
const WORLD_H = 1600
const STORAGE_KEY = 'bk-cmdb-topology-positions-v2'
const HIDE_CONFIG_KEY = 'model_custom_hide_models'

const canvasRef = ref(null)
const loading = ref(true)
const modelList = ref([])
const localClassifications = ref([])
const assocList = ref([])
const relationTypes = ref([])
const asstNameMap = ref({})
const asstDirectionMap = ref({})
const NODE_RADIUS = 27.5
const EDGE_FAN_SPACING = 44

const topoNav = reactive({
  activeGroupId: '',
  selectedGroupId: -1,
  selectedNodeId: ''
})
const hideNodeIds = ref([])
const hideGroupIds = ref([])

const isEdit = ref(false)
const isFullscreen = ref(false)
const isTopoHover = ref(false)

const pan = ref({ x: 0, y: 0 })
const scale = ref(1)
const panning = ref(false)
let panState = null
let dragState = null
const hoverEdgeKey = ref(null)
const hoverNodeKey = ref(null)

const relationDetailVisible = ref(false)
const relationCreateVisible = ref(false)
const relationSaving = ref(false)
const relationForm = ref({})
const relationCreateForm = ref({})
const relationCreateFormRef = ref(null)
const relationRules = {
  bk_obj_id: [{ required: true, message: '请选择源模型', trigger: 'change' }],
  bk_asst_obj_id: [{ required: true, message: '请选择目标模型', trigger: 'change' }],
  bk_asst_id: [{ required: true, message: '请选择关联类型', trigger: 'change' }],
  mapping: [{ required: true, message: '请选择源-目标约束', trigger: 'change' }]
}
const selectedNodeId = ref('')
const navModelList = computed(() => localClassifications.value.flatMap((g) => g.models))

// ---------- 数据 ----------
async function loadRelationTypes() {
  const data = await searchAssociationTypes({ page: { start: 0, limit: 200, sort: 'bk_asst_id' } })
  const items = data?.info || []
  asstNameMap.value = Object.fromEntries(items.map((item) => [item.bk_asst_id, item.bk_asst_name || item.bk_asst_id]))
  asstDirectionMap.value = Object.fromEntries(items.map((item) => [item.bk_asst_id, item.direction || 'src_to_dest']))
  relationTypes.value = items.filter((item) => item.bk_asst_id !== 'bk_mainline')
}

async function loadHideConfig() {
  try {
    const data = await searchUserCustom()
    const cfg = data?.[HIDE_CONFIG_KEY] || {}
    hideNodeIds.value = cfg.hideNodeIds || []
    hideGroupIds.value = cfg.hideGroupIds || []
  } catch {
    hideNodeIds.value = []
    hideGroupIds.value = []
  }
}
function saveHideConfig() {
  saveUserCustom({ [HIDE_CONFIG_KEY]: { hideNodeIds: hideNodeIds.value, hideGroupIds: hideGroupIds.value } }).catch(() => {})
}

// ---------- 布局(主线竖排居中,其余模型右侧网格,对齐旧版默认视觉) ----------
const positionsCache = ref({})
function loadCachedPositions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) positionsCache.value = JSON.parse(raw)
  } catch { positionsCache.value = {} }
}
function buildLayout() {
  const placed = {}
  const center = 620
  const main = MAIN_LINE_ORDER.filter((id) => modelList.value.some((m) => m.bk_obj_id === id))
  main.forEach((objId, i) => {
    placed[objId] = { x: center, y: 90 + i * 210 }
  })
  const others = modelList.value.filter((m) => !placed[m.bk_obj_id])
  others.forEach((m, i) => {
    const col = i % 5
    const row = Math.floor(i / 5)
    placed[m.bk_obj_id] = { x: 860 + col * 150, y: 80 + row * 130 }
  })
  // 已保存位置优先(编辑拓扑拖拽结果)
  for (const id of Object.keys(placed)) {
    if (positionsCache.value[id]) placed[id] = positionsCache.value[id]
  }
  return placed
}

const nodePositions = ref({})
const visibleNodes = computed(() => modelList.value
  .filter((m) => !hideGroupIds.value.includes(m.bk_classification_id) && !hideNodeIds.value.includes(m.bk_obj_id))
  .map((m) => ({ ...m, x: nodePositions.value[m.bk_obj_id]?.x ?? 0, y: nodePositions.value[m.bk_obj_id]?.y ?? 0 })))

const visibleEdges = computed(() => {
  const pos = Object.fromEntries(visibleNodes.value.map((n) => [n.bk_obj_id, n]))
  const raw = []
  assocList.value.forEach((a, i) => {
    const s = pos[a.bk_obj_id]
    const t = pos[a.bk_asst_obj_id]
    if (!s || !t) return
    raw.push({
      key: `e-${a.id ?? i}`,
      source: a.bk_obj_id,
      target: a.bk_asst_obj_id,
      s, t,
      label: asstNameMap.value[a.bk_asst_id] || a.bk_asst_name || a.bk_asst_id,
      direction: asstDirectionMap.value[a.bk_asst_id] || 'src_to_dest',
      g1: s.bk_classification_id, g2: t.bk_classification_id,
      hover: false
    })
  })
  // 独立版后端不落 bk_mainline 关联数据;主线链按固定顺序合成“拓扑组成”边,对齐旧版视觉
  for (let i = 0; i < MAIN_LINE_ORDER.length - 1; i += 1) {
    const s = pos[MAIN_LINE_ORDER[i]]
    const t = pos[MAIN_LINE_ORDER[i + 1]]
    if (!s || !t) continue
    raw.push({
      key: `m-${MAIN_LINE_ORDER[i]}-${MAIN_LINE_ORDER[i + 1]}`,
      source: MAIN_LINE_ORDER[i],
      target: MAIN_LINE_ORDER[i + 1],
      s, t,
      label: '拓扑组成',
      direction: asstDirectionMap.value.bk_mainline || 'src_to_dest',
      g1: s.bk_classification_id, g2: t.bk_classification_id,
      hover: false
    })
  }
  // 同一对模型间的多条关联按序号侧向展开成弧线(旧版 Cytoscape bezier 语义),避免直线重叠
  const fanIndex = {}
  const fanTotal = {}
  raw.forEach((edge) => {
    const pairKey = [edge.source, edge.target].sort().join('|')
    fanIndex[pairKey] = fanIndex[pairKey] ?? 0
    edge.pairKey = pairKey
    edge.fanIdx = fanIndex[pairKey]
    fanIndex[pairKey] += 1
    fanTotal[pairKey] = (fanTotal[pairKey] ?? 0) + 1
  })
  return raw.map((edge) => buildEdgeCurve(edge, fanTotal[edge.pairKey]))
})

// 二次贝塞尔弧线:端点收缩到节点圆周并朝向控制点,平行边按 fanIdx 侧移,自关联画节点顶部圆环
function buildEdgeCurve(edge, fanTotal) {
  const { s, t, fanIdx } = edge
  if (s.bk_obj_id === t.bk_obj_id) {
    const loopTop = s.y - NODE_RADIUS
    return {
      ...edge,
      path: `M ${s.x} ${loopTop} C ${s.x + 64} ${loopTop - 56} ${s.x - 64} ${loopTop - 56} ${s.x} ${loopTop}`,
      mx: s.x,
      my: loopTop - 32
    }
  }
  const dx = t.x - s.x
  const dy = t.y - s.y
  const distance = Math.hypot(dx, dy) || 1
  const offset = (fanIdx - (fanTotal - 1) / 2) * EDGE_FAN_SPACING
  const nx = -dy / distance
  const ny = dx / distance
  const cx = (s.x + t.x) / 2 + nx * offset
  const cy = (s.y + t.y) / 2 + ny * offset
  const startLen = Math.hypot(cx - s.x, cy - s.y) || 1
  const endLen = Math.hypot(t.x - cx, t.y - cy) || 1
  const x1 = s.x + ((cx - s.x) / startLen) * NODE_RADIUS
  const y1 = s.y + ((cy - s.y) / startLen) * NODE_RADIUS
  const x2 = t.x + ((cx - t.x) / endLen) * NODE_RADIUS
  const y2 = t.y + ((cy - t.y) / endLen) * NODE_RADIUS
  return {
    ...edge,
    path: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`,
    mx: 0.25 * x1 + 0.5 * cx + 0.25 * x2,
    my: 0.25 * y1 + 0.5 * cy + 0.25 * y2
  }
}

// 节点聚焦(悬浮/选中)时高亮相连边、弱化无关边,便于在交叉关系中追踪单条关联
function isEdgeLinked(edge) {
  const focus = hoverNodeKey.value || selectedNodeId.value
  return Boolean(focus) && (edge.source === focus || edge.target === focus)
}
function isEdgeDimmed(edge) {
  const focus = hoverNodeKey.value || selectedNodeId.value
  return Boolean(focus) && !isEdgeLinked(edge)
}

// ---------- 分组遮罩(旧版 mask:opacity .16) ----------
function isNodeMask(node) {
  return topoNav.selectedGroupId !== -1 && topoNav.selectedGroupId !== '' && node.bk_classification_id !== topoNav.selectedGroupId
}
function isEdgeMask(edge) {
  return topoNav.selectedGroupId !== -1 && topoNav.selectedGroupId !== ''
    && edge.g1 !== topoNav.selectedGroupId && edge.g2 !== topoNav.selectedGroupId
}

// ---------- 导航交互 ----------
function handleSelectGroup(group) {
  if (group) {
    topoNav.selectedGroupId = group.bk_classification_id
  } else {
    topoNav.selectedGroupId = -1
  }
  topoNav.selectedNodeId = ''
  selectedNodeId.value = ''
}
function handleSelectNode(model) {
  topoNav.selectedNodeId = model.bk_obj_id
  selectedNodeId.value = model.bk_obj_id
  topoNav.selectedGroupId = ''
}
function handleSlideGroup(group) {
  topoNav.activeGroupId = topoNav.activeGroupId === group.bk_classification_id ? '' : group.bk_classification_id
}
function handleToggleGroup(group) {
  const groupId = group.bk_classification_id
  const idx = hideGroupIds.value.indexOf(groupId)
  const nodeIds = group.models.map((m) => m.bk_obj_id)
  if (idx !== -1) {
    hideGroupIds.value.splice(idx, 1)
    hideNodeIds.value = hideNodeIds.value.filter((id) => !nodeIds.includes(id))
  } else {
    hideGroupIds.value.push(groupId)
    hideNodeIds.value = [...new Set([...hideNodeIds.value, ...nodeIds])]
  }
  saveHideConfig()
}
function handleToggleNode(model, group) {
  const nodeId = model.bk_obj_id
  const idx = hideNodeIds.value.indexOf(nodeId)
  if (idx !== -1) hideNodeIds.value.splice(idx, 1)
  else hideNodeIds.value.push(nodeId)
  const nodeIds = group.models.map((m) => m.bk_obj_id)
  const allHidden = nodeIds.every((id) => hideNodeIds.value.includes(id))
  const gIdx = hideGroupIds.value.indexOf(group.bk_classification_id)
  if (allHidden && gIdx === -1) hideGroupIds.value.push(group.bk_classification_id)
  if (!allHidden && gIdx !== -1) hideGroupIds.value.splice(gIdx, 1)
  saveHideConfig()
}
function hideNodeFromCanvas(node) {
  hoverNodeKey.value = null
  const group = localClassifications.value.find((g) => g.bk_classification_id === node.bk_classification_id)
  if (group) handleToggleNode(node, group)
}

// ---------- 视图操作 ----------
function resizeFit() {
  if (!visibleNodes.value.length) return
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  visibleNodes.value.forEach((n) => {
    minX = Math.min(minX, n.x - 60); minY = Math.min(minY, n.y - 60)
    maxX = Math.max(maxX, n.x + 60); maxY = Math.max(maxY, n.y + 110)
  })
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  const sw = rect.width / (maxX - minX)
  const sh = rect.height / (maxY - minY)
  scale.value = Math.min(sw, sh, 1)
  pan.value = { x: -minX * scale.value + (rect.width - (maxX - minX) * scale.value) / 2, y: -minY * scale.value + 20 }
}
function resizeFull() {
  isFullscreen.value = !isFullscreen.value
}
function zoomIn() { setScale(scale.value + 0.05) }
function zoomOut() { setScale(scale.value - 0.05) }
function setScale(target, cx, cy) {
  const rect = canvasRef.value?.getBoundingClientRect()
  const ns = Math.max(0.1, Math.min(5, target))
  if (!rect) { scale.value = ns; return }
  cx = cx ?? rect.width / 2
  cy = cy ?? rect.height / 2
  const ratio = ns / scale.value
  pan.value = { x: cx - (cx - pan.value.x) * ratio, y: cy - (cy - pan.value.y) * ratio }
  scale.value = ns
}
function onWheel(evt) {
  const rect = canvasRef.value.getBoundingClientRect()
  const delta = evt.deltaY > 0 ? 0.9 : 1.1
  setScale(scale.value * delta, evt.clientX - rect.left, evt.clientY - rect.top)
}

// ---------- 画布平移 ----------
function onCanvasMouseDown(evt) {
  if (evt.button !== 0) return
  evt.preventDefault()
  panning.value = true
  panState = { sx: evt.clientX, sy: evt.clientY, ox: pan.value.x, oy: pan.value.y }
  window.addEventListener('mousemove', onPanMove)
  window.addEventListener('mouseup', onPanUp)
}
function onPanMove(evt) {
  if (!panState) return
  pan.value = { x: panState.ox + (evt.clientX - panState.sx), y: panState.oy + (evt.clientY - panState.sy) }
}
function onPanUp() {
  panning.value = false
  panState = null
  window.removeEventListener('mousemove', onPanMove)
  window.removeEventListener('mouseup', onPanUp)
}

// ---------- 节点拖拽(仅编辑模式,自动保存) ----------
function onNodeMouseDown(node, evt) {
  if (!isEdit.value || evt.button !== 0) return
  evt.preventDefault()
  dragState = { node, sx: evt.clientX, sy: evt.clientY, ox: node.x, oy: node.y, moved: false }
  window.addEventListener('mousemove', onNodeMouseMove)
  window.addEventListener('mouseup', onNodeMouseUp)
}
function onNodeMouseMove(evt) {
  if (!dragState) return
  const nx = dragState.ox + (evt.clientX - dragState.sx) / scale.value
  const ny = dragState.oy + (evt.clientY - dragState.sy) / scale.value
  nodePositions.value[dragState.node.bk_obj_id] = { x: Math.round(nx), y: Math.round(ny) }
  dragState.moved = true
}
function onNodeMouseUp() {
  window.removeEventListener('mousemove', onNodeMouseMove)
  window.removeEventListener('mouseup', onNodeMouseUp)
  if (dragState?.moved) {
    const dump = {}
    for (const [id, p] of Object.entries(nodePositions.value)) dump[id] = p
    positionsCache.value = dump
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(dump)) } catch { /* 忽略 */ }
  }
  dragState = null
}
function onNodeEnter(node) { hoverNodeKey.value = node.bk_obj_id; isTopoHover.value = true }
function onNodeLeave() { if (!isEdit.value) hoverNodeKey.value = null; isTopoHover.value = false }
function onNodeClick(node) {
  if (dragState?.moved) return
  handleSelectNode(node)
}

// ---------- 边 ----------
function edgeMarker(edge, pos) {
  const hover = edge.hover || hoverEdgeKey.value === edge.key
  if (pos === 'start') return hover ? 'url(#topo-arrow-start-hover)' : 'url(#topo-arrow-start)'
  return hover ? 'url(#topo-arrow-hover)' : 'url(#topo-arrow)'
}
function onEdgeClick(edge) {
  const assoc = assocList.value.find((a, i) => `e-${a.id ?? i}` === edge.key)
  if (!assoc) return
  openRelationDetail(assoc)
}

// ---------- 关联 CRUD(沿旧版语义) ----------
function modelName(id) {
  return modelList.value.find((m) => m.bk_obj_id === id)?.bk_obj_name || id || '--'
}
async function openRelationDetail(relation) {
  relationDetailVisible.value = true
  relationForm.value = { ...relation }
}
function openCreateRelation(fromObjId = '') {
  relationCreateForm.value = {
    bk_obj_id: fromObjId,
    bk_asst_obj_id: '',
    bk_asst_id: relationTypes.value[0]?.bk_asst_id || '',
    mapping: 'n:n',
    bk_obj_asst_name: ''
  }
  relationCreateVisible.value = true
}
async function createRelation() {
  const valid = await relationCreateFormRef.value?.validate().catch(() => false)
  if (!valid) return
  relationSaving.value = true
  try {
    await createObjectAssociation({
      ...relationCreateForm.value,
      bk_obj_asst_id: `${relationCreateForm.value.bk_obj_id}_${relationCreateForm.value.bk_asst_id}_${relationCreateForm.value.bk_asst_obj_id}`
    })
    ElMessage.success('关联创建成功')
    relationCreateVisible.value = false
    await reloadAssociations()
  } catch (e) {
    ElMessage.error('关联创建失败: ' + (e?.message || '后端异常'))
  } finally { relationSaving.value = false }
}
async function saveRelation() {
  relationSaving.value = true
  try {
    await updateObjectAssociation(relationForm.value.id, { bk_obj_asst_name: relationForm.value.bk_obj_asst_name })
    ElMessage.success('关联已更新')
    relationDetailVisible.value = false
    await reloadAssociations()
  } catch (e) {
    ElMessage.error('关联更新失败: ' + (e?.message || '后端异常'))
  } finally { relationSaving.value = false }
}
async function removeRelation() {
  try {
    await ElMessageBox.confirm('确定删除关联关系?', '删除确认', { type: 'warning' })
  } catch { return }
  relationSaving.value = true
  try {
    await deleteObjectAssociation(relationForm.value.id)
    ElMessage.success('关联已删除')
    relationDetailVisible.value = false
    await reloadAssociations()
  } catch (e) {
    ElMessage.error('关联删除失败: ' + (e?.message || '后端异常'))
  } finally { relationSaving.value = false }
}

// ---------- 编辑模式 ----------
function handleEditTopo() { isEdit.value = true }
function handleExitEdit() { isEdit.value = false; hoverNodeKey.value = null }

// ---------- 初始化 ----------
async function loadData() {
  loading.value = true
  try {
    const [models, groups] = await Promise.all([
      searchModels({}),
      searchClassifications().catch(() => [])
    ])
    modelList.value = models?.info || models || []
    // 分类接口不携带对象,按 bk_classification_id 归组(旧版 localClassifications 语义:
    // 过滤隐藏与停用,未分类固定最后)
    localClassifications.value = (groups?.info || groups || [])
      .filter((g) => !g.bk_ishidden)
      .map((g) => ({
        ...g,
        models: modelList.value.filter((m) => m.bk_classification_id === g.bk_classification_id
          && !m.bk_ishidden && !m.bk_ispaused)
      }))
      .sort((a, b) => (b.bk_classification_id === 'none' ? -1 : 0))
    await Promise.all([loadRelationTypes(), loadHideConfig()])
    const data = await searchObjectAssociations({
      condition: { $or: [{ bk_obj_id: { $in: modelList.value.map((m) => m.bk_obj_id) } }, { bk_asst_obj_id: { $in: modelList.value.map((m) => m.bk_obj_id) } }] },
      page: { start: 0, limit: 2000 }
    })
    // 该接口响应 data 直接是数组(区别于分页型 {count, info})
    assocList.value = Array.isArray(data) ? data : (data?.info || [])
    loadCachedPositions()
    nodePositions.value = buildLayout()
    resizeFit()
  } catch (e) {
    ElMessage.error('拓扑数据加载失败: ' + (e?.message || '后端异常'))
  } finally { loading.value = false }
}

watch(isFullscreen, () => setTimeout(resizeFit, 60))
onMounted(loadData)
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onPanMove)
  window.removeEventListener('mouseup', onPanUp)
  window.removeEventListener('mousemove', onNodeMouseMove)
  window.removeEventListener('mouseup', onNodeMouseUp)
})
</script>

<style scoped>
.topo-wrapper {
  position: relative;
  height: 100%;
  background: #fff;
}
.topo-wrapper.is-fullscreen-host {
  position: fixed;
  inset: 0;
  z-index: 3000;
}

/* 工具栏 */
.toolbar {
  padding: 9px 20px;
  width: 100%;
  height: 50px;
  background: #fff;
  font-size: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-sizing: border-box;
}
.edit-cue {
  display: inline-block;
  font-size: 14px;
  color: #a4aab3;
  line-height: 32px;
  vertical-align: middle;
  margin: 0 0 0 10px;
}
.vis-button-group {
  display: flex;
  align-items: center;
}
.vis-button-group > i {
  margin-left: 22px;
  font-size: 20px;
  cursor: pointer;
  outline: 0;
  color: #979ba5;
  padding: 6px;
}
.vis-button-group > i:hover {
  color: #3a84ff;
}
.topo-legend {
  position: absolute;
  padding: 3px 10px;
  top: 57px;
  right: 8px;
  background: #fff;
  box-shadow: 0 2px 1px 0 rgba(185, 203, 222, .5);
  font-size: 12px;
  z-index: 1;
}
.legend-item {
  line-height: 30px;
  font-size: 0;
  margin: 0;
}
.legend-item i {
  display: inline-block;
  margin-right: 6px;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  vertical-align: middle;
}
.legend-item.built-in i {
  background: #798aad;
}
.legend-item.custom i {
  background: #3a84ff;
}
.legend-item span {
  font-size: 12px;
  vertical-align: middle;
  color: #63656e;
}

/* 左侧导航 */
.topo-nav {
  position: absolute;
  top: 50px;
  left: 0;
  bottom: 0;
  border: 1px solid #dcdee5;
  border-left: none;
  width: 210px;
  overflow: auto;
  background: #fff;
  list-style: none;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
.group-info {
  display: flex;
  align-items: center;
  line-height: 42px;
  padding: 0 16px 0 5px;
  font-size: 14px;
  cursor: pointer;
  color: #63656e;
  position: relative;
}
.group-info.group-total {
  padding-left: 15px;
}
.group-info:hover {
  background: #e1ecff;
}
.group-info:hover:not(.group-total) .model-count {
  display: none;
}
.group-info:hover .icon-eye {
  display: inline-block;
}
.group-info.active .icon-cc-angle-right {
  transform: rotate(90deg);
}
.group-info.selected {
  color: #3a84ff;
  background: #e1ecff;
}
.group-info.selected .model-count {
  color: #fff;
  background-color: #a2c5fd;
}
.group-info.invisible .icon-eye {
  display: inline-block;
}
.group-info.invisible .group-name {
  opacity: .5;
}
.group-info.invisible .model-count {
  display: none;
}
.group-name {
  max-width: 110px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.model-count {
  position: absolute;
  right: 16px;
  top: 12px;
  padding: 0 5px;
  border-radius: 2px;
  font-size: 12px;
  color: #979ba5;
  background: #f0f1f5;
  height: 18px;
  line-height: 17px;
  text-align: center;
}
.toggle-arrow {
  flex: 35px 0 0;
  padding: 0 8px 0 15px;
  margin-right: 2px;
}
.toggle-arrow .icon-cc-angle-right {
  transition: all .2s;
  font-size: 20px;
  color: #979ba5;
  margin: 0 -4px;
  display: inline-block;
}
.icon-eye {
  display: none;
  position: absolute;
  right: 16px;
  top: 12px;
  font-size: 18px;
  color: #979ba5;
}
.icon-eye:hover {
  color: #3a84ff;
}
.model-box {
  padding: 8px 0;
  list-style: none;
  margin: 0;
}
.model-item {
  padding: 5px 16px 5px 20px;
  position: relative;
  cursor: pointer;
}
.model-item:hover {
  background: #ebf4ff;
}
.model-item:hover .icon-eye {
  display: inline-block;
}
.model-item.invisible .info,
.model-item.invisible .node-icon {
  opacity: .5;
}
.model-item.invisible .icon-eye {
  display: inline-block;
}
.model-item.selected {
  background: #ebf4ff;
}
.node-icon {
  display: inline-block;
  margin-right: 5px;
  width: 36px;
  height: 36px;
  font-size: 20px;
  line-height: 34px;
  text-align: center;
  vertical-align: middle;
  color: #3a84ff;
  border: 1px solid #dcdee5;
  border-radius: 50%;
}
.node-icon.is-public {
  color: #798aad;
}
.model-item .info {
  display: inline-block;
  line-height: 18px;
  vertical-align: middle;
  font-size: 12px;
}
.model-item .name {
  width: 100px;
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: #63656e;
}
.model-item .icon-eye {
  top: 14px;
}

/* 画布(网格底) */
.global-model {
  position: absolute;
  top: 50px;
  left: 210px;
  right: 0;
  bottom: 0;
  overflow: hidden;
  background-color: #f4f5f8;
  background-image: linear-gradient(#eef1f5 1px, transparent 0),
    linear-gradient(90deg, #eef1f5 1px, transparent 0);
  background-size: 10px 10px;
  cursor: grab;
}
.global-model.is-panning {
  cursor: grabbing;
}
.topo-world {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
}
.edge-layer {
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
}
.topo-edge {
  fill: none;
  stroke: #c3cdd7;
  stroke-width: 2;
  transition: opacity .15s;
}
.topo-edge.hover,
.topo-edge.linked {
  stroke: #3c96ff;
  stroke-width: 3;
}
.topo-edge.dimmed {
  opacity: .12;
}
.edge-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 12;
  pointer-events: stroke;
  cursor: pointer;
}
.topo-edge.mask,
.edge-label.mask,
.topo-node.mask,
.topo-node-label.mask {
  opacity: .16;
}

/* 关系标签(白底圆角边框盒) */
.edge-label {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: 14px;
  line-height: 18px;
  color: #979ba5;
  background: rgba(255, 255, 255, .7);
  border: 1px solid rgba(220, 222, 229, .7);
  border-radius: 2px;
  padding: 2px;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
.edge-label.hover {
  color: #3c96ff;
  border-color: #3c96ff;
  font-weight: bold;
  background: #fff;
}
.edge-label.linked {
  color: #3c96ff;
  border-color: #3c96ff;
  font-weight: bold;
  background: #fff;
}
.edge-label.dimmed {
  opacity: .12;
}

/* 节点(55px 圆 + 名称) */
.topo-node {
  position: absolute;
  width: 55px;
  height: 55px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid rgba(147, 147, 147, .5);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-sizing: border-box;
}
.topo-node .bk-cmdb-icon {
  font-size: 18px;
  color: #3c96ff;
}
.topo-node.is-pre .bk-cmdb-icon {
  color: #798aad;
}
.topo-node:hover,
.topo-node.selected {
  background: #3a84ff;
  border-color: #3a84ff;
}
.topo-node:hover .bk-cmdb-icon,
.topo-node.selected .bk-cmdb-icon {
  color: #fff;
}
.topo-node-label {
  position: absolute;
  transform: translateX(-50%);
  width: 90px;
  text-align: center;
  font-size: 14px;
  line-height: 18px;
  color: #868b97;
  word-break: break-all;
  cursor: pointer;
  user-select: none;
}
.topo-node-label.selected {
  font-weight: bold;
}
.topo-wrapper:has(.topo-node:hover) .topo-node:hover ~ .topo-node-label {
  /* 占位:标签加粗跟随选中态即可 */
}

/* 编辑模式节点操作圆钮 */
.topology-node-tooltips {
  position: absolute;
  z-index: 10;
}
.topology-node-tooltips .icon-box {
  display: block;
  height: 24px;
  width: 24px;
  line-height: 24px;
  font-size: 12px;
  border-radius: 12px;
  background: rgba(24, 24, 24, .8);
  color: #fff;
  text-align: center;
  cursor: pointer;
  white-space: nowrap;
}
.topology-node-tooltips .icon-box + .icon-box {
  margin-top: 3px;
}
.topology-node-tooltips .icon-box:hover {
  background: #3a84ff;
}

.topo-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #979ba5;
  background: rgba(244, 245, 248, .6);
}

/* 全屏 */
.topo-wrapper:fullscreen {
  background: #fff;
}
</style>
