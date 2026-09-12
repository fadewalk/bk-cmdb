<template>
  <div class="res-index">
    <div class="res-body">
      <!-- 顶部搜索(对齐老版 classify-filter) -->
      <div class="classify-filter">
        <el-input
          v-model="filter"
          placeholder="请输入关键字"
          clearable
          style="width: 260px"
          :suffix-icon="'Search'"
        />
      </div>

      <!-- 空状态 -->
      <el-empty v-if="!loading && isEmpty" description="没有找到相关模型" :image-size="90" />

      <!-- 瀑布流分组卡片(对齐老版 classify-waterfall 4 列) -->
      <div v-show="!isEmpty" class="classify-waterfall-layout">
        <div v-for="(col, ci) in classifyColumns" :key="ci" class="classify-waterfall">
          <div v-for="group in col" :key="group.bk_classification_id" class="classify">
            <h4 class="classify-name" :title="group.bk_classification_name">
              <span class="classify-name-text">{{ group.bk_classification_name }}</span>
            </h4>
            <div class="models-layout">
              <div
                v-for="model in group.bk_objects"
                :key="model.bk_obj_id"
                class="models-link"
                :title="model.bk_obj_name"
                @click="redirect(model)"
              >
                <i :class="['model-icon', 'bk-cmdb-icon', model.bk_obj_icon]" />
                <span class="model-name">{{ model.bk_obj_name }}</span>
                <el-icon
                  :class="['model-star']"
                  :size="14"
                  :title="isCollected(model) ? '取消收藏' : '收藏至导航'"
                  :style="{ color: isCollected(model) ? '#FFB23A' : '#C4C6CC' }"
                  @click.prevent.stop="toggleCollect(model)"
                >
                  <StarFilled v-if="isCollected(model)" />
                  <Star v-else />
                </el-icon>
                <div class="model-instance-count">{{ counts[model.bk_obj_id] ?? 0 }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 资源目录:分类卡片瀑布流 + 实例计数(对齐老版 resource-manage/classify-panel)
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Star, StarFilled } from '@element-plus/icons-vue'
import { http, searchClassificationWithObjects } from '../../api/cmdb'
import { useResourceStore } from '../../stores/resource'

const router = useRouter()
const resourceStore = useResourceStore()
const filter = ref('')
const loading = ref(false)
const classifications = ref([])
const counts = ref({})
// 收藏状态统一由 resource store 管理(usercustom;兼容旧 localStorage 迁移)
const collected = computed(() => resourceStore.collections)

// 内置模型 → 资源菜单跳转(对齐老版 BUILTIN_MODEL_RESOURCE_MENUS)
const BUILTIN_RESOURCE_MENUS = {
  host: '/resource/host',
  biz: '/resource/business',
  bk_biz_set_obj: '/resource/biz-set',
  bk_project: '/resource/project'
}
// 集群/模块不允许查看实例,不展示(对齐老版)
const EXCLUDED = new Set(['set', 'module'])

const filteredClassifications = computed(() => {
  const kw = filter.value.trim().toLowerCase()
  const result = []
  for (const classification of classifications.value) {
    const models = (classification.bk_objects || []).filter((model) => {
      if (model.bk_ishidden || model.bk_ispaused) return false
      if (EXCLUDED.has(model.bk_obj_id)) return false
      if (!kw) return true
      return (model.bk_obj_name || '').toLowerCase().includes(kw) ||
        (model.bk_obj_id || '').toLowerCase().includes(kw)
    })
    if (models.length) result.push({ ...classification, bk_objects: models })
  }
  return result
})

// 4 列瀑布流:按累计高度(1 + 模型数)贪心放入最矮列(对齐老版 classifyColumns)
const classifyColumns = computed(() => {
  const colHeight = [0, 0, 0, 0]
  const columns = [[], [], [], []]
  for (const classify of filteredClassifications.value) {
    const minIndex = colHeight.indexOf(Math.min(...colHeight))
    columns[minIndex].push(classify)
    colHeight[minIndex] += 1 + classify.bk_objects.length
  }
  return columns.filter((col) => col.length)
})

const isEmpty = computed(() => classifyColumns.value.length === 0)

function isCollected(model) {
  return collected.value.includes(model.bk_obj_id)
}
async function toggleCollect(model) {
  await resourceStore.toggleCollect(model.bk_obj_id)
}

function redirect(model) {
  const builtin = BUILTIN_RESOURCE_MENUS[model.bk_obj_id]
  if (builtin) {
    router.push(builtin)
    return
  }
  router.push(`/resource/instance/${model.bk_obj_id}`)
}

async function loadCounts(objIds) {
  // /object/count 挂在 web_server 根路径(不在 /api/v3 下);后端单次最多 20 个 obj_id
  const map = {}
  try {
    for (let start = 0; start < objIds.length; start += 20) {
      const batch = objIds.slice(start, start + 20)
      const data = await http.post('/object/count', { condition: { obj_ids: batch } }, { baseURL: '' })
      for (const item of data || []) map[item.bk_obj_id] = item.inst_count
    }
    counts.value = map
  } catch { counts.value = map }
}

onMounted(async () => {
  loading.value = true
  try {
    const data = await searchClassificationWithObjects()
    classifications.value = data || []
    // 与导航共享同一份可用模型集合和收藏状态
    await resourceStore.ensureLoaded()
    const ids = classifications.value
      .flatMap((c) => c.bk_objects || [])
      .filter((m) => !m.bk_ishidden && !m.bk_ispaused && !EXCLUDED.has(m.bk_obj_id))
      .map((m) => m.bk_obj_id)
    loadCounts(ids)
  } finally { loading.value = false }
})
</script>

<style scoped>
.res-index { height: 100%; display: flex; flex-direction: column; background: #fff; overflow-y: auto; }
.res-body { flex: 1; padding: 20px 20px 40px; }

.classify-filter { margin-bottom: 20px; }

/* 瀑布流 4 列(对齐老版 classify-waterfall fl) */
.classify-waterfall-layout { display: flex; gap: 20px; align-items: flex-start; }
.classify-waterfall { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 20px; }

.classify {
  background: #fff;
  border: 1px solid #DCDEE5;
  border-radius: 2px;
  padding: 0 20px 10px;
}
.classify-name {
  margin: 0 -20px; padding: 0 20px;
  height: 50px; line-height: 50px;
  font-size: 14px; color: #313238; font-weight: 700;
  border-bottom: 1px solid #E7E9EF;
}
.models-layout { padding: 8px 0; }
.models-link {
  display: flex; align-items: center; gap: 10px;
  height: 40px; line-height: 40px;
  cursor: pointer; user-select: none;
}
.models-link:hover .model-name { color: #3A84FF; }
.model-icon { font-size: 16px; color: #3A84FF; flex: none; }
.model-name { flex: 1; min-width: 0; font-size: 14px; color: #63656E; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-star { font-size: 14px; color: #C4C6CC; cursor: pointer; flex: none; }
.model-star:hover { color: #979BA5; }
.models-link .icon-star-shape { color: #FFB23A; }
.model-instance-count { font-size: 12px; color: #979BA5; flex: none; min-width: 24px; text-align: right; }
</style>
