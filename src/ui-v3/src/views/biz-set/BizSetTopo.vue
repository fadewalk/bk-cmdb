<template>
  <div class="biz-set-page">
    <h1 class="page-title">业务集拓扑</h1>
    <p class="page-tips">业务集是业务的容器;此处展示业务集列表,选择后可查看其下属业务的拓扑结构</p>

    <div class="bs-body">
      <!-- 左:业务集列表 -->
      <div class="bs-left">
        <div class="bs-toolbar">
          <el-input v-model="setKeyword" placeholder="搜索业务集" size="small" clearable :prefix-icon="'Search'" />
        </div>
        <el-scrollbar height="100%">
          <div
            v-for="s in filteredSets"
            :key="s.bk_biz_set_id"
            :class="['bs-item', { active: activeSetId === s.bk_biz_set_id }]"
            @click="selectSet(s)"
          >
            <i class="bk-cmdb-icon icon-cc-nav-business" />
            <span class="bs-name">{{ s.bk_biz_set_name }}</span>
            <span class="bs-id">[{{ s.bk_biz_set_id }}]</span>
          </div>
        </el-scrollbar>
      </div>

      <!-- 右:选中业务集下的业务拓扑 -->
      <div class="bs-right">
        <el-card v-if="activeSet" shadow="never">
          <template #header>
            <div class="card-head">
              <span>{{ activeSet.bk_biz_set_name }} - 包含业务</span>
              <span class="hint">{{ bizsInSet.length }} 个业务</span>
            </div>
          </template>
          <template v-if="bizsInSet.length">
            <el-table :data="bizsInSet" v-loading="bizLoading" stripe size="default" border>
              <el-table-column prop="bk_biz_id" label="业务 ID" width="100" />
              <el-table-column prop="bk_biz_name" label="业务名称" min-width="200" show-overflow-tooltip />
              <el-table-column prop="life_cycle" label="生命周期" width="120" />
              <el-table-column label="运维" min-width="120">
                <template #default="{ row }">{{ bizPeople(row.bk_biz_maintainer) }}</template>
              </el-table-column>
              <el-table-column label="开发商" min-width="120">
                <template #default="{ row }">{{ bizPeople(row.bk_biz_developer) }}</template>
              </el-table-column>
              <el-table-column label="测试者" min-width="120">
                <template #default="{ row }">{{ bizPeople(row.bk_biz_tester) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="140" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" size="small" @click="goBizTopo(row)">查看拓扑</el-button>
                </template>
              </el-table-column>
            </el-table>
          </template>
          <el-empty v-else-if="!bizLoading" :description="`业务集「${activeSet.bk_biz_set_name}」下暂无业务`" :image-size="80" />
        </el-card>
        <el-empty v-else description="请在左侧选择业务集" :image-size="100" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { http, searchBusiness } from '../../api/cmdb'

const router = useRouter()
const sets = ref([])
const activeSet = ref(null)
const setKeyword = ref('')
const bizLoading = ref(false)
const bizsInSet = ref([])

const activeSetId = computed(() => activeSet.value?.bk_biz_set_id)

const filteredSets = computed(() => {
  const kw = setKeyword.value.trim().toLowerCase()
  if (!kw) return sets.value
  return sets.value.filter((s) => (s.bk_biz_set_name || '').toLowerCase().includes(kw))
})

function bizPeople(v) {
  if (!v) return '--'
  if (Array.isArray(v)) return v.join(', ') || '--'
  return String(v)
}

async function loadSets() {
  try {
    const data = await http.post('/findmany/biz_set', { page: { start: 0, limit: 200 } })
    sets.value = data?.info || []
    if (sets.value.length && !activeSet.value) selectSet(sets.value[0])
  } catch (e) { ElMessage.error('业务集加载失败: ' + (e?.message || '后端异常')) }
}

async function selectSet(s) {
  activeSet.value = s
  bizsInSet.value = []
  await loadBizsInSet()
}

async function loadBizsInSet() {
  if (!activeSet.value) return
  bizLoading.value = true
  try {
    const data = await searchBusiness({ start: 0, limit: 200 })
    const all = data?.info || []
    const relationKey = activeSet.value.bk_biz_set_id
    const hasRelation = all.some((b) => b.bk_biz_set_id !== undefined && b.bk_biz_set_id !== null)
    bizsInSet.value = hasRelation
      ? all.filter((b) => String(b.bk_biz_set_id) === String(relationKey))
      : []
    if (!hasRelation) {
      ElMessage.warning(`业务集「${activeSet.value.bk_biz_set_name}」缺少业务关联数据，未展示未确认归属的业务`)
    } else if (!bizsInSet.value.length) {
      ElMessage.info(`业务集「${activeSet.value.bk_biz_set_name}」下未查询到业务`)
    }
  } catch (e) {
    ElMessage.error('业务列表加载失败')
  } finally {
    bizLoading.value = false
  }
}

function goBizTopo(row) {
  router.push({ path: '/business/topo', query: { biz: row.bk_biz_id } })
}

onMounted(loadSets)
</script>

<style scoped>
.biz-set-page { height: 100%; display: flex; flex-direction: column; background: #fff; }
.page-title { font-size: 16px; color: #313238; font-weight: 400; padding: 0 20px; height: 50px; line-height: 50px; border-bottom: 1px solid #E7E9EF; margin: 0; }
.page-tips { margin: 0; padding: 10px 20px; font-size: 12px; color: #979BA5; background: #F0F5FF; border-bottom: 1px solid #E7E9EF; }
.bs-body { flex: 1; display: flex; overflow: hidden; }
.bs-left {
  width: 240px; flex: 0 0 240px;
  border-right: 1px solid #E7E9EF;
  background: #fafbfc; padding: 12px; overflow: hidden;
  display: flex; flex-direction: column;
}
.bs-toolbar { margin-bottom: 10px; }
.bs-item {
  display: flex; align-items: center; gap: 6px;
  height: 36px; padding: 0 8px; font-size: 13px; color: #63656E;
  cursor: pointer; border-radius: 2px;
}
.bs-item:hover { background: #F6F6F9; }
.bs-item.active { background: #E1ECFF; color: #3A84FF; }
.bs-name { flex: 1; }
.bs-id { color: #979ba5; font-size: 12px; }
.bs-right { flex: 1; padding: 16px; overflow: auto; }
.card-head { display: flex; align-items: center; gap: 10px; }
.hint { color: #979ba5; font-size: 13px; }
</style>