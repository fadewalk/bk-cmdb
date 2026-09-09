<template>
  <div class="page-card topo-wrapper" :class="{ 'is-fullscreen': isFullscreen, 'is-editing': isEdit }">
    <!-- 顶部工具栏 -->
    <div class="topo-toolbar">
      <el-button v-if="!isEdit" type="primary" size="small" @click="enterEdit">
        编辑拓扑
      </el-button>
      <template v-else>
        <el-button type="primary" size="small" @click="exitEdit">返回</el-button>
        <span class="edit-cue">所有更改已自动保存</span>
      </template>
      <el-button v-if="isEdit" size="small" type="warning" plain @click="resetLayout">
        重置布局
      </el-button>
      <div class="spacer" />
      <div class="vis-buttons">
        <el-tooltip content="缩小 (Ctrl + 滚轮)" placement="top">
          <i class="bk-cmdb-icon icon-cc-zoom-out vis-btn" @click="zoomOut" />
        </el-tooltip>
        <el-tooltip content="放大 (Ctrl + 滚轮)" placement="top">
          <i class="bk-cmdb-icon icon-cc-zoom-in vis-btn" @click="zoomIn" />
        </el-tooltip>
        <el-tooltip content="还原视图" placement="top">
          <i class="bk-cmdb-icon icon-cc-fit vis-btn" @click="fitView" />
        </el-tooltip>
        <el-tooltip :content="isFullscreen ? '退出全屏' : '全屏'" placement="top">
          <i :class="['bk-cmdb-icon vis-btn', isFullscreen ? 'icon-cc-fullscreen-outlined-reset' : 'icon-cc-fullscreen-outlined']"
             @click="toggleFullscreen" />
        </el-tooltip>
        <span class="zoom-label">{{ Math.round(scale * 100) }}%</span>
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
        <li v-for="g in classifications" :key="g.bk_classification_id" class="group-item">
          <div
            :class="{
              'group-info': true,
              active: activeGroupId === g.bk_classification_id,
              selected: selectedGroupId === g.bk_classification_id,
              invisible: hideGroupIds.includes(g.bk_classification_id)
            }"
            @click="selectGroup(g)"
          >
            <span class="toggle-arrow" @click.stop="toggleCollapse(g)">
              <el-icon><component :is="g._collapsed ? 'ArrowRight' : 'ArrowDown'" /></el-icon>
            </span>
            <span class="group-name" :title="g.bk_classification_name">{{ g.bk_classification_name }}</span>
            <span class="model-count">{{ countByGroup(g.bk_classification_id) }}</span>
          </div>
          <ul v-if="!g._collapsed" class="model-list">
            <li
              v-for="m in modelsByGroup(g.bk_classification_id)"
              :key="m.bk_obj_id"
              :class="{ active: selectedModelId === m.bk_obj_id }"
              @click="selectModel(m); $event.stopPropagation()"
            >
              <span class="model-name">{{ m.bk_obj_name || m.bk_obj_id }}</span>
            </li>
          </ul>
        </li>
      </ul>

      <!-- 中央画布 -->
      <div
        ref="wrap"
        class="graph-wrap"
        :class="{ 'is-panning': panning }"
        v-loading="loading"
        @mousedown="onCanvasMouseDown"
        @wheel.prevent="onWheel"
      >
        <svg
          ref="svgEl"
          class="graph-svg"
          :viewBox="`${vbX} ${vbY} ${viewW} ${viewH}`"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,8 L8,4 z" fill="#C4C6CC" />
            </marker>
            <marker id="arrow-builtin" markerWidth="10" markerHeight="10" refX="9" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,8 L8,4 z" fill="#3A84FF" />
            </marker>
            <marker id="arrow-hover" markerWidth="10" markerHeight="10" refX="9" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,8 L8,4 z" fill="#FF8800" />
            </marker>
          </defs>

          <!-- 关联边(先画边,再画节点,避免遮盖) -->
          <g v-for="e in visibleEdges" :key="e.key">
            <line
              :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
              :stroke="edgeStroke(e)"
              :stroke-width="e.hover || (selectedEdge === e.key) ? 2.5 : 1.2"
              :marker-end="edgeMarker(e)"
              class="edge-line"
              @mouseenter="onEdgeEnter(e.key)"
              @mouseleave="onEdgeLeave"
              @click="onEdgeClick(e)"
            />
          </g>

          <!-- 节点(画在边之后,节点椭圆覆盖边端点) -->
          <g
            v-for="n in visibleNodes"
            :key="n.objId"
            :transform="`translate(${n.x},${n.y})`"
            :class="['node-g', { dim: isDim(n), selected: selectedModelId === n.objId, hover: hoveredNode === n.objId }]"
            @mousedown.left.stop="onNodeMouseDown(n, $event)"
            @mouseenter="hoveredNode = n.objId"
            @mouseleave="hoveredNode = null"
            @click.stop="onNodeClick(n)"
            @dblclick.stop="onNodeDblClick(n)"
          >
            <!-- 主椭圆 -->
            <ellipse
              :cx="0" :cy="0"
              :rx="n.w / 2" :ry="n.h / 2"
              :fill="nodeFill(n)"
              :stroke="nodeStroke(n)"
              :stroke-width="(selectedModelId === n.objId || hoveredNode === n.objId) ? 2.5 : 1.5"
              class="node-shape"
            />
            <!-- 高亮环 -->
            <ellipse
              v-if="selectedModelId === n.objId"
              :cx="0" :cy="0"
              :rx="n.w / 2 + 4" :ry="n.h / 2 + 4"
              fill="none"
              stroke="#3A84FF"
              stroke-width="1.5"
              stroke-dasharray="4 3"
              class="node-ring"
            />
            <!-- 名称 -->
            <text :y="2" text-anchor="middle" :class="['node-text', { light: isMainLineNode(n) && selectedModelId === n.objId }]">
              {{ n.name }}
            </text>
            <text :y="16" text-anchor="middle" class="node-sub">{{ n.objId }}</text>
          </g>

          <!-- 关联 label(最后画,在所有节点之上,避免被节点覆盖) -->
          <g v-for="e in visibleEdges" :key="`l-${e.key}`" class="edge-label-layer">
            <rect
              :x="edgeLabelX(e) - edgeLabelW(e) / 2"
              :y="(e.y1 + e.y2) / 2 - 11"
              :width="edgeLabelW(e)"
              :height="20"
              fill="#fff" rx="3"
              :stroke="edgeStroke(e)"
              stroke-width="1"
              class="edge-label-bg"
              @mouseenter="onEdgeEnter(e.key)"
              @mouseleave="onEdgeLeave"
              @click="onEdgeClick(e)"
            />
            <text
              :x="edgeLabelX(e)"
              :y="(e.y1 + e.y2) / 2 + 4"
              text-anchor="middle"
              :class="['edge-label', { active: e.hover || selectedEdge === e.key }]"
              @mouseenter="onEdgeEnter(e.key)"
              @mouseleave="onEdgeLeave"
              @click="onEdgeClick(e)"
            >{{ e.label }}</text>
          </g>
        </svg>

        <!-- 悬浮 tooltip(节点详情 popover) -->
        <div
          v-if="hoveredNode && hoverTip.visible"
          class="node-tooltip"
          :style="{ left: hoverTip.x + 'px', top: hoverTip.y + 'px' }"
        >
          <div class="tt-name">{{ hoverTip.name }}</div>
          <div class="tt-id">ID: {{ hoverTip.id }}</div>
          <div class="tt-row">
            <span class="tt-label">关联数</span>
            <span class="tt-val">{{ hoverTip.assocCount }}</span>
          </div>
          <div class="tt-row">
            <span class="tt-label">分类</span>
            <span class="tt-val">{{ hoverTip.classificationName }}</span>
          </div>
          <div class="tt-tip">{{ isEdit ? '拖动调整位置,位置自动保存' : '单击查看详情,双击打开模型管理;「编辑拓扑」后可拖动布局' }}</div>
        </div>

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
          <p class="legend-hint">{{ isEdit
            ? '编辑中: 拖动节点调整位置(自动保存) · 滚轮缩放 · 空白处拖动平移'
            : '提示: 滚轮缩放 · 空白处拖动平移 · 单击查看详情 · 双击打开模型 · 「编辑拓扑」后可拖动布局' }}</p>
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
            <el-descriptions-item label="是否预置">{{ selectedModel.ispre ? '是' : '否' }}</el-descriptions-item>
          </el-descriptions>
          <div class="detail-actions">
            <el-button v-if="isEdit" type="primary" size="small" @click="openCreateRelation(selectedModel.bk_obj_id)">创建关联</el-button>
          </div>
          <div v-if="modelAssocs.length" class="detail-assoc">
            <div class="da-title">关联此模型 ({{ modelAssocs.length }})</div>
            <ul>
              <li v-for="(a, i) in modelAssocs" :key="i" @click="goAssoc(a)" class="da-item">
                <span class="da-name">{{ a.name }}</span>
                <span class="da-arrow">{{ a.dir }}</span>
                <span class="da-target">{{ a.targetName }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

    <!-- 关系详情/编辑 -->
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

      <!-- 创建关系 -->
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
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowRight } from '@element-plus/icons-vue'
import {
  searchModels, searchClassifications, searchAssociationTypes,
  searchObjectAssociations, createObjectAssociation, updateObjectAssociation, deleteObjectAssociation
} from '../../api/cmdb'

const router = useRouter()
const wrap = ref(null)
const svgEl = ref(null)

const loading = ref(false)
const modelList = ref([])
const assocList = ref([])
const classifications = ref([])
const selectedGroupId = ref(-1)
const activeGroupId = ref(-1)
const hideGroupIds = ref([])
const selectedModelId = ref(null)
const selectedEdge = ref(null)
const hoveredNode = ref(null)
const relationTypes = ref([])
const asstNameMap = ref({})
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

const isEdit = ref(false)
const isFullscreen = ref(false)

const MAIN_LINE = ['biz', 'set', 'module', 'host', 'process']
const NAMES = { biz: '业务', set: '集群', module: '模块', host: '主机', process: '进程' }
const STORAGE_KEY = 'bk-cmdb-topology-positions-v1'

// 画布坐标系(逻辑像素)
const BASE_W = 1100
const BASE_H = 560
const vbX = ref(0)
const vbY = ref(0)
const viewW = ref(BASE_W)
const viewH = ref(BASE_H)
const scale = ref(1)

// 节点 + 边
const nodes = ref([])
const edges = ref([])
const positionsCache = ref({}) // objId -> {x, y} 本地持久化
const draggingNode = ref(null)
const panning = ref(false)
const panState = ref(null)

// 悬浮 tooltip
const hoverTip = ref({ visible: false, x: 0, y: 0, name: '', id: '', assocCount: 0, classificationName: '' })

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
  if (selectedGroupId.value === -1 || selectedGroupId.value == null) return false
  return n.groupId !== selectedGroupId.value
}
function nodeFill(n) {
  if (selectedModelId.value === n.objId) return '#3A84FF'
  if (n.mainLine) return '#E1ECFF'
  if (selectedGroupId.value !== -1 && n.groupId === selectedGroupId.value) return '#FFF7E1'
  return '#FFFFFF'
}
function nodeStroke(n) {
  if (selectedModelId.value === n.objId) return '#3A84FF'
  if (hoveredNode.value === n.objId) return '#FF8800'
  return n.mainLine ? '#3A84FF' : '#FFB23A'
}
function edgeStroke(e) {
  if (selectedEdge.value === e.key || e.hover) return '#FF8800'
  return e.builtIn ? '#3A84FF' : '#C4C6CC'
}
function edgeMarker(e) {
  if (selectedEdge.value === e.key || e.hover) return 'url(#arrow-hover)'
  return e.builtIn ? 'url(#arrow-builtin)' : 'url(#arrow)'
}
// label 居中放在边中点(z-order 在节点之上,不会被节点覆盖)
function edgeLabelX(e) {
  return (e.x1 + e.x2) / 2
}
function edgeLabelW(e) {
  // label 框宽 = 字数 × 8.5 + 14 padding,最小 60
  return Math.max(60, (e.label?.length || 0) * 8.5 + 14)
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
function modelName(id) {
  return modelList.value.find((m) => m.bk_obj_id === id)?.bk_obj_name || id || '--'
}
function associationItems(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.info)) return data.info
  return []
}
function goAssoc(a) {
  const relation = assocList.value.find((item) => item.id === a.id || (item.bk_obj_id === selectedModelId.value && item.bk_asst_obj_id === a.targetId))
  if (relation) onEdgeClick(edges.value.find((edge) => edge.assocId === relation.id) || { assoc: relation, key: null })
}

async function loadRelationTypes() {
  try {
    const data = await searchAssociationTypes({ page: { start: 0, limit: 200, sort: 'bk_asst_id' } })
    const items = associationItems(data)
    // 关联类型 id → 中文名映射(含 bk_mainline,拓扑连线标签显示中文名,老版行为)
    asstNameMap.value = Object.fromEntries(items.map((item) => [item.bk_asst_id, item.bk_asst_name || item.bk_asst_id]))
    relationTypes.value = items.filter((item) => item.bk_asst_id !== 'bk_mainline')
  } catch (e) {
    relationTypes.value = []
    ElMessage.error('关联类型加载失败: ' + (e?.message || '后端异常'))
  }
}

async function reloadAssociations() {
  const modelIds = modelList.value.map((m) => m.bk_obj_id)
  const data = await searchObjectAssociations({ condition: { $or: [{ bk_obj_id: { $in: modelIds } }, { bk_asst_obj_id: { $in: modelIds } }] }, page: { start: 0, limit: 2000 } })
  assocList.value = associationItems(data)
  layout()
}

async function openRelationDetail(relation) {
  relationDetailVisible.value = true
  relationForm.value = { ...relation }
  try {
    const data = await searchObjectAssociations({ condition: { id: relation.id }, page: { start: 0, limit: 1 } })
    const item = associationItems(data)[0]
    if (item) relationForm.value = { ...item }
  } catch (e) { ElMessage.error('关联详情加载失败: ' + (e?.message || '后端异常')) }
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
  if (relationCreateForm.value.bk_obj_id === relationCreateForm.value.bk_asst_obj_id && relationCreateForm.value.mapping === '1:n') {
    ElMessage.warning('自关联不支持 1-N 约束')
    return
  }
  relationSaving.value = true
    try {
      await createObjectAssociation({ ...relationCreateForm.value, bk_obj_asst_id: `${relationCreateForm.value.bk_obj_id}_${relationCreateForm.value.bk_asst_id}_${relationCreateForm.value.bk_asst_obj_id}` })
    } catch (e) {
      ElMessage.error('关联创建失败: ' + (e?.message || '后端异常'))
      return
    } finally {
      relationSaving.value = false
    }
    ElMessage.success('关联创建成功')
    relationCreateVisible.value = false
    try {
      await reloadAssociations()
    } catch (e) {
      ElMessage.error('关联已创建，但拓扑刷新失败: ' + (e?.message || '后端异常'))
    }
}
async function saveRelation() {
  relationSaving.value = true
  try {
    await updateObjectAssociation(relationForm.value.id, { bk_obj_asst_name: relationForm.value.bk_obj_asst_name })
  } catch (e) {
    ElMessage.error('关联更新失败: ' + (e?.message || '后端异常'))
    return
  } finally {
    relationSaving.value = false
  }
  ElMessage.success('关联已更新')
  relationDetailVisible.value = false
  try {
    await reloadAssociations()
  } catch (e) {
    ElMessage.error('关联已更新，但拓扑刷新失败: ' + (e?.message || '后端异常'))
  }
}

async function removeRelation() {
  try {
    await ElMessageBox.confirm('确定删除关联关系?', '删除确认', { type: 'warning' })
  } catch {
    return
  }
  relationSaving.value = true
  try {
    await deleteObjectAssociation(relationForm.value.id)
  } catch (e) {
    ElMessage.error('关联删除失败: ' + (e?.message || '后端异常'))
    return
  } finally {
    relationSaving.value = false
  }
  ElMessage.success('关联已删除')
  relationDetailVisible.value = false
  selectedEdge.value = null
  try {
    await reloadAssociations()
  } catch (e) {
    ElMessage.error('关联已删除，但拓扑刷新失败: ' + (e?.message || '后端异常'))
  }
}

const visibleNodes = computed(() => nodes.value.filter((n) => !hideGroupIds.value.includes(n.groupId)))
const visibleEdges = computed(() => edges.value.filter((e) => !hideGroupIds.value.includes(e.g1) && !hideGroupIds.value.includes(e.g2)))

const modelAssocs = computed(() => {
  if (!selectedModelId.value) return []
  const out = []
  for (const a of assocList.value) {
    if (a.bk_obj_id === selectedModelId.value) {
      const t = modelList.value.find((m) => m.bk_obj_id === a.bk_asst_obj_id)
      out.push({ id: a.id, name: a.bk_asst_name || a.bk_asst_id, dir: '→', targetId: a.bk_asst_obj_id, targetName: t?.bk_obj_name || a.bk_asst_obj_id })
    } else if (a.bk_asst_obj_id === selectedModelId.value) {
      const t = modelList.value.find((m) => m.bk_obj_id === a.bk_obj_id)
      out.push({ id: a.id, name: a.bk_asst_name || a.bk_asst_id, dir: '←', targetId: a.bk_obj_id, targetName: t?.bk_obj_name || a.bk_obj_id })
    }
  }
  return out
})

function defaultLayout() {
  const W = BASE_W
  const H = BASE_H
  const w = 130, h = 50
  const placed = {}
  const main = modelList.value.filter((m) => MAIN_LINE.includes(m.bk_obj_id))
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
  const others = modelList.value.filter((m) => !MAIN_LINE.includes(m.bk_obj_id))
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
  return placed
}

function applyCachedPositions(placed) {
  // 优先使用用户拖动后的位置
  const cache = positionsCache.value
  for (const id in placed) {
    if (cache[id]) {
      placed[id].x = cache[id].x
      placed[id].y = cache[id].y
    }
  }
  return placed
}

function persistPositions() {
  const dump = {}
  for (const n of nodes.value) dump[n.objId] = { x: n.x, y: n.y }
  positionsCache.value = dump
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(dump)) } catch {}
}

function loadCachedPositions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) positionsCache.value = JSON.parse(raw)
  } catch {}
}

function layout() {
  const placed = defaultLayout()
  applyCachedPositions(placed)
  nodes.value = Object.values(placed)
  edges.value = assocList.value
    .filter((a) => placed[a.bk_obj_id] && placed[a.bk_asst_obj_id])
      .map((a, i) => ({
        key: i,
        assocId: a.id,
        assoc: a,
        label: asstNameMap.value[a.bk_asst_id] || a.bk_asst_name || a.bk_asst_id,
      x1: placed[a.bk_obj_id].x,
      y1: placed[a.bk_obj_id].y,
      x2: placed[a.bk_asst_obj_id].x,
      y2: placed[a.bk_asst_obj_id].y,
      g1: placed[a.bk_obj_id].groupId,
      g2: placed[a.bk_asst_obj_id].groupId,
      builtIn: !!(a.ispre) || (placed[a.bk_obj_id].mainLine && placed[a.bk_asst_obj_id].mainLine),
      hover: false
    }))
  fitView()
}

function resetLayout() {
  positionsCache.value = {}
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
  layout()
  ElMessage.success('布局已重置')
}

// ===== 拖拽节点(SVG 坐标系内精确拖动) =====
function svgPointFromEvent(evt) {
  // 把屏幕坐标转为 svg viewBox 坐标
  const svg = svgEl.value
  if (!svg) return { x: evt.clientX, y: evt.clientY }
  const rect = svg.getBoundingClientRect()
  const xRatio = (evt.clientX - rect.left) / rect.width
  const yRatio = (evt.clientY - rect.top) / rect.height
  return {
    x: vbX.value + xRatio * viewW.value,
    y: vbY.value + yRatio * viewH.value
  }
}

function onNodeMouseDown(node, evt) {
  if (evt.button !== 0) return
  // 对齐老版 autolock 行为:查看模式节点锁定,仅编辑模式可拖动
  if (!isEdit.value) return
  evt.preventDefault()
  const start = svgPointFromEvent(evt)
  draggingNode.value = {
    node,
    sx: start.x,
    sy: start.y,
    ox: node.x,
    oy: node.y,
    moved: false
  }
  window.addEventListener('mousemove', onNodeMouseMove)
  window.addEventListener('mouseup', onNodeMouseUp)
}
function onNodeMouseMove(evt) {
  if (!draggingNode.value) return
  const p = svgPointFromEvent(evt)
  const d = draggingNode.value
  const nx = d.ox + (p.x - d.sx)
  const ny = d.oy + (p.y - d.sy)
  d.node.x = Math.max(40, Math.min(BASE_W - 40, nx))
  d.node.y = Math.max(40, Math.min(BASE_H - 40, ny))
  d.moved = true
}
function onNodeMouseUp() {
  window.removeEventListener('mousemove', onNodeMouseMove)
  window.removeEventListener('mouseup', onNodeMouseUp)
  if (draggingNode.value?.moved) {
    persistPositions()
  }
  draggingNode.value = null
}
function onNodeClick(n) {
  if (draggingNode.value?.moved) return
  selectedModelId.value = n.objId
  selectedEdge.value = null
}
function onNodeDblClick(n) {
  goModel(n)
}

// ===== 画布拖动平移 =====
function onCanvasMouseDown(evt) {
  // 只在空白处触发(非节点/边)
  if (evt.target.closest('.node-g, .edge-line, .edge-label, .edge-label-bg')) return
  if (evt.button !== 0) return
  evt.preventDefault()
  panning.value = true
  panState.value = { sx: evt.clientX, sy: evt.clientY, ox: vbX.value, oy: vbY.value }
  window.addEventListener('mousemove', onPanMove)
  window.addEventListener('mouseup', onPanUp)
}
function onPanMove(evt) {
  if (!panState.value) return
  const rect = svgEl.value.getBoundingClientRect()
  const dx = (evt.clientX - panState.value.sx) / rect.width * viewW.value
  const dy = (evt.clientY - panState.value.sy) / rect.height * viewH.value
  vbX.value = panState.value.ox - dx
  vbY.value = panState.value.oy - dy
}
function onPanUp() {
  panning.value = false
  panState.value = null
  window.removeEventListener('mousemove', onPanMove)
  window.removeEventListener('mouseup', onPanUp)
}

// ===== 滚轮缩放(以鼠标位置为中心) =====
function onWheel(evt) {
  const delta = evt.deltaY > 0 ? 0.9 : 1.1
  const newScale = Math.max(0.3, Math.min(3, scale.value * delta))
  if (newScale === scale.value) return
  // 以鼠标为中心缩放
  const p = svgPointFromEvent(evt)
  const ratio = newScale / scale.value
  vbX.value = p.x - (p.x - vbX.value) * ratio
  vbY.value = p.y - (p.y - vbY.value) * ratio
  scale.value = newScale
  viewW.value = BASE_W / scale.value
  viewH.value = BASE_H / scale.value
}

function zoomIn() { setScale(scale.value * 1.2, viewW.value / 2 + vbX.value, viewH.value / 2 + vbY.value) }
function zoomOut() { setScale(scale.value / 1.2, viewW.value / 2 + vbX.value, viewH.value / 2 + vbY.value) }
function setScale(target, cx, cy) {
  const ns = Math.max(0.3, Math.min(3, target))
  const ratio = ns / scale.value
  vbX.value = cx - (cx - vbX.value) * ratio
  vbY.value = cy - (cy - vbY.value) * ratio
  scale.value = ns
  viewW.value = BASE_W / ns
  viewH.value = BASE_H / ns
}

function fitView() {
  if (!nodes.value.length) return
  // 计算节点包围盒
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes.value) {
    minX = Math.min(minX, n.x - n.w / 2)
    minY = Math.min(minY, n.y - n.h / 2)
    maxX = Math.max(maxX, n.x + n.w / 2)
    maxY = Math.max(maxY, n.y + n.h / 2)
  }
  const padding = 60
  const boxW = maxX - minX + padding * 2
  const boxH = maxY - minY + padding * 2
  vbX.value = minX - padding
  vbY.value = minY - padding
  scale.value = Math.min(BASE_W / boxW, BASE_H / boxH, 1)
  viewW.value = BASE_W / scale.value
  viewH.value = BASE_H / scale.value
}

function toggleFullscreen() { isFullscreen.value = !isFullscreen.value }
function enterEdit() {
  isEdit.value = true
  ElMessage.info('已进入编辑模式:拖动节点调整布局,位置自动保存')
}
function exitEdit() {
  isEdit.value = false
  ElMessage.success('已退出编辑模式')
}

function onEdgeEnter(key) {
  const e = edges.value.find((x) => x.key === key)
  if (e) e.hover = true
}
function onEdgeLeave() {
  edges.value.forEach((e) => (e.hover = false))
}
function onEdgeClick(e) {
  selectedEdge.value = e.key
  selectedModelId.value = null
  if (e.assoc) {
    openRelationDetail(e.assoc)
  } else {
    ElMessage.warning('关联数据不存在,请刷新拓扑')
  }
}

// ===== 悬浮 tooltip =====
watch(hoveredNode, (id) => {
  if (!id) {
    hoverTip.value.visible = false
    return
  }
  const n = nodes.value.find((x) => x.objId === id)
  if (!n) return
  const m = modelList.value.find((x) => x.bk_obj_id === id)
  if (!m) return
  const assocCount = assocList.value.filter((a) => a.bk_obj_id === id || a.bk_asst_obj_id === id).length
  const cls = classifications.value.find((c) => c.bk_classification_id === m.bk_classification_id)
  // 计算 tooltip 位置(svg 坐标 → screen 坐标)
  const svg = svgEl.value
  const rect = svg.getBoundingClientRect()
  const wrapRect = wrap.value.getBoundingClientRect()
  const xRatio = (n.x - vbX.value) / viewW.value
  const yRatio = (n.y - vbY.value) / viewH.value
  hoverTip.value = {
    visible: true,
    x: rect.left - wrapRect.left + xRatio * rect.width + n.w / 2 * rect.width / viewW.value + 12,
    y: rect.top - wrapRect.top + yRatio * rect.height - n.h / 2 * rect.height / viewH.value - 10,
    name: m.bk_obj_name || m.bk_obj_id,
    id: m.bk_obj_id,
    assocCount,
    classificationName: cls?.bk_classification_name || '-'
  }
})

onMounted(async () => {
  loading.value = true
  loadCachedPositions()
  try {
    const [models, groups] = await Promise.all([
      searchModels({}),
      searchClassifications().catch((e) => {
        ElMessage.error('分类加载失败: ' + (e?.message || '后端异常'))
        return []
      })
    ])
    modelList.value = models || []
    classifications.value = (groups || [])
      .map((g) => ({ ...g, _collapsed: true }))
      .sort((a, b) => (a.bk_classification_id || 0) - (b.bk_classification_id || 0))
    await loadRelationTypes()
    try {
      const modelIds = modelList.value.map((m) => m.bk_obj_id)
      const assoc = await searchObjectAssociations({
        condition: { $or: [{ bk_obj_id: { $in: modelIds } }, { bk_asst_obj_id: { $in: modelIds } }] },
        page: { start: 0, limit: 2000 }
      })
      assocList.value = associationItems(assoc)
    } catch (e) {
      assocList.value = []
      ElMessage.error('关联数据加载失败: ' + (e?.message || '后端异常'))
    }
    layout()
    // 布局/缓存位置可能超出初始视窗,加载后自适应缩放避免节点被裁切
    nextTick(() => fitView())
  } catch (e) {
    modelList.value = []
    classifications.value = []
    assocList.value = []
    ElMessage.error('拓扑数据加载失败: ' + (e?.message || '后端异常'))
  } finally { loading.value = false }
})
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onNodeMouseMove)
  window.removeEventListener('mouseup', onNodeMouseUp)
  window.removeEventListener('mousemove', onPanMove)
  window.removeEventListener('mouseup', onPanUp)
})
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
.zoom-label { color: #979BA5; font-size: 12px; margin-left: 8px; min-width: 36px; text-align: right; }

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
  user-select: none;
}
.group-info:hover { background: #F6F6F9; }
.group-info.active { color: #3A84FF; }
.group-info.selected { background: #E1ECFF; border-left-color: #3A84FF; color: #3A84FF; }
.group-info.invisible { opacity: 0.4; }
.group-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-count { color: #979BA5; font-size: 12px; }
.toggle-arrow {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; color: #979BA5; cursor: pointer; flex: none;
}
.toggle-arrow:hover { color: #3A84FF; }
.model-list {
  list-style: none; margin: 0; padding: 0 0 4px 28px;
}
.model-list li {
  padding: 4px 12px; font-size: 12px; cursor: pointer; color: #63656E;
  border-radius: 2px; margin: 1px 6px;
}
.model-list li:hover { background: #F0F1F5; }
.model-list li.active { background: #E1ECFF; color: #3A84FF; font-weight: 500; }

.graph-wrap {
  flex: 1; position: relative; overflow: hidden;
  background: #FAFBFD;
  background-image:
    linear-gradient(0deg, transparent 24%, rgba(60,150,255,.04) 25%, rgba(60,150,255,.04) 26%, transparent 27%, transparent 74%, rgba(60,150,255,.04) 75%, rgba(60,150,255,.04) 76%, transparent 77%, transparent),
    linear-gradient(90deg, transparent 24%, rgba(60,150,255,.04) 25%, rgba(60,150,255,.04) 26%, transparent 27%, transparent 74%, rgba(60,150,255,.04) 75%, rgba(60,150,255,.04) 76%, transparent 77%, transparent);
  background-size: 50px 50px;
  cursor: grab;
}
.graph-wrap.is-panning { cursor: grabbing; }
.graph-svg { display: block; width: 100%; height: 100%; }

.node-g {
  cursor: pointer;
  transition: opacity 0.25s;
}
.topo-wrapper.is-editing .node-g { cursor: grab; }
.topo-wrapper.is-editing .node-g:active { cursor: grabbing; }
.node-g.dim { opacity: 0.18; }
.node-g.hover .node-shape { filter: brightness(1.05); }

.node-text {
  font-size: 13px; fill: #313238;
  pointer-events: none; user-select: none;
  font-weight: 500;
}
.node-text.light { fill: #fff; }
.node-sub {
  font-size: 10px; fill: #6A7A8C;
  pointer-events: none; user-select: none;
}
.node-ring { animation: dash-rotate 12s linear infinite; }
@keyframes dash-rotate { to { stroke-dashoffset: -100; } }

.edge-line { cursor: pointer; }
.edge-label {
  font-size: 12px; fill: #63656E;
  pointer-events: none; user-select: none;
  font-weight: 500;
}
.edge-label.active { fill: #FF8800; font-weight: 600; }
.edge-label-bg { cursor: pointer; }

.node-tooltip {
  position: absolute; z-index: 100;
  background: #fff; border: 1px solid #DCDEE5; border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  padding: 10px 12px; min-width: 180px; max-width: 240px;
  pointer-events: none;
  animation: tooltip-fade-in 0.15s ease-out;
}
@keyframes tooltip-fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.tt-name { font-size: 14px; color: #313238; font-weight: 600; margin-bottom: 2px; }
.tt-id { font-size: 11px; color: #979BA5; margin-bottom: 6px; }
.tt-row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
.tt-label { color: #979BA5; }
.tt-val { color: #313238; font-weight: 500; }
.tt-tip { font-size: 11px; color: #63656E; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #DCDEE5; }

.topo-legend {
  position: absolute; right: 12px; bottom: 12px;
  background: #fff; border: 1px solid #E7E9EF; border-radius: 2px;
  padding: 8px 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.04);
  max-width: 320px;
}
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #63656E; margin: 4px 0; }
.legend-item .dot {
  width: 14px; height: 14px; border-radius: 50%;
  border: 1px solid #3A84FF; display: inline-block;
}
.legend-item.builtin .dot { background: #E1ECFF; }
.legend-item.custom .dot { background: #fff; border-color: #FFB23A; }
.legend-hint {
  font-size: 11px; color: #979BA5;
  margin: 8px 0 0; padding-top: 6px; border-top: 1px dashed #DCDEE5;
}

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
.da-item {
  padding: 6px 8px; font-size: 12px; color: #63656E;
  border-bottom: 1px solid #F0F1F5; display: flex; gap: 6px; align-items: center;
  cursor: pointer; transition: background 0.15s;
}
.da-item:hover { background: #E1ECFF; }
.da-name { color: #3A84FF; font-weight: 500; min-width: 60px; }
.da-arrow { color: #979BA5; }
.da-target { color: #313238; }
</style>
