<template>
  <!-- 列表显示属性配置(老版 columns-config 600px 双栏抽屉,各列表页共用) -->
  <el-drawer
    :model-value="modelValue"
    title="列表显示属性配置"
    size="600px"
    :close-on-click-modal="false"
    class="columns-config-drawer"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <div class="config-layout">
      <div class="config-wrapper">
        <div class="wrapper-header">
          <el-input v-model="filter" size="small" clearable :prefix-icon="'Search'" placeholder="搜索属性" />
        </div>
        <ul v-if="unselectedList.length" class="property-list">
          <li
            v-for="p in unselectedList"
            :key="p.bk_property_id"
            class="property-item"
            @click="selectProperty(p)"
          >
            <span class="property-name">{{ displayName(p) }}</span>
            <el-icon class="item-arrow"><ArrowRight /></el-icon>
          </li>
        </ul>
        <div v-else class="config-empty">暂无数据</div>
      </div>
      <div class="config-wrapper">
        <div class="wrapper-header selected-header">已选属性</div>
        <div class="property-list-layout">
          <ul class="property-list">
            <li
              v-for="p in undraggableList"
              :key="`fixed-${p.bk_property_id}`"
              class="property-item disabled"
            >
              <span class="property-name">{{ displayName(p) }}</span>
            </li>
          </ul>
          <ul class="property-list">
            <li
              v-for="(p, idx) in draggableList"
              :key="p.bk_property_id"
              class="property-item draggable"
              draggable="true"
              @dragstart="onDragStart(idx)"
              @dragover.prevent
              @drop="onDrop(idx)"
            >
              <i class="drag-dot" />
              <span class="property-name">{{ displayName(p) }}</span>
              <el-icon class="item-close" @click="unselectProperty(p)"><Close /></el-icon>
            </li>
          </ul>
        </div>
      </div>
      <div class="config-options">
        <el-button type="primary" @click="apply">应用</el-button>
        <el-button @click="emit('update:modelValue', false)">取消</el-button>
        <el-button class="reset-btn" @click="reset">还原默认</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowRight, Close } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // 属性池(含注入的 ID/业务拓扑等虚拟属性)
  pool: { type: Array, default: () => [] },
  // 当前表头属性 id 列表
  selected: { type: Array, default: () => [] },
  // 不可移除的固定属性 id(老版 disabledColumns)
  fixedIds: { type: Array, default: () => [] },
  // 展示名解析(如模块名按 scope 显示 目录名/模块名)
  nameResolver: { type: Function, default: null }
})
const emit = defineEmits(['update:modelValue', 'apply', 'reset'])

const MIN = 1
const MAX = 20
const filter = ref('')
const localSelected = ref([])
const dragIndex = ref(-1)

watch(() => [props.modelValue, props.selected], ([visible]) => {
  if (visible) {
    filter.value = ''
    localSelected.value = props.selected.filter((id) => props.pool.some((p) => p.bk_property_id === id))
  }
}, { immediate: true })

function displayName(property) {
  return props.nameResolver ? props.nameResolver(property) : property.bk_property_name
}

// 老版按名称 zh 排序的待选列表
const sortedPool = computed(() => [...props.pool]
  .sort((a, b) => displayName(a).localeCompare(displayName(b), 'zh-Hans-CN', { sensitivity: 'accent' })))
const unselectedList = computed(() => sortedPool.value.filter((p) => (
  !localSelected.value.includes(p.bk_property_id)
  && displayName(p).toLowerCase().includes(filter.value.toLowerCase())
)))
const undraggableList = computed(() => props.fixedIds
  .map((id) => props.pool.find((p) => p.bk_property_id === id))
  .filter((p) => p && localSelected.value.includes(p.bk_property_id)))
const draggableList = computed(() => localSelected.value
  .filter((id) => !props.fixedIds.includes(id))
  .map((id) => props.pool.find((p) => p.bk_property_id === id))
  .filter(Boolean))

function selectProperty(property) {
  if (localSelected.value.length >= MAX) { ElMessage.info(`最多选择${MAX}项`); return }
  localSelected.value = [...localSelected.value, property.bk_property_id]
}

function unselectProperty(property) {
  if (localSelected.value.length <= MIN) { ElMessage.info(`至少选择${MIN}项`); return }
  localSelected.value = localSelected.value.filter((id) => id !== property.bk_property_id)
}

function onDragStart(index) {
  dragIndex.value = index
}

function onDrop(index) {
  const from = dragIndex.value
  if (from < 0 || from === index) return
  const list = [...draggableList.value.map((p) => p.bk_property_id)]
  const [moved] = list.splice(from, 1)
  list.splice(index, 0, moved)
  localSelected.value = [...undraggableList.value.map((p) => p.bk_property_id), ...list]
  dragIndex.value = -1
}

function apply() {
  emit('apply', [...localSelected.value])
}

async function reset() {
  try {
    await ElMessageBox.confirm('是否还原为系统默认的列表属性配置？', '确认还原配置', { type: 'warning' })
  } catch { return }
  emit('reset')
}
</script>
