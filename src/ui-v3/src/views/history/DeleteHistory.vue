<template>
  <div class="res-page">
    <div class="page-head">
      <span class="back-arrow" @click="goBack">←</span>
      <span class="page-name">{{ title }}</span>
    </div>

    <div class="page-body">
      <div class="table-toolbar">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="-"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          style="width: 280px"
          @change="reload"
        />
        <el-input
          v-if="isHost"
          v-model="resourceName"
          placeholder="请输入IP"
          clearable
          style="width: 220px"
          :prefix-icon="'Search'"
          @keyup.enter="reload"
          @clear="reload"
        />
        <div class="spacer" />
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          @current-change="load"
        />
      </div>

      <el-table :data="rows" v-loading="loading" stripe>
        <el-table-column prop="resource_id" label="ID" width="110" />
        <el-table-column prop="resource_name" :label="isHost ? 'IP' : '资源'" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.resource_name || '--' }}</template>
        </el-table-column>
        <el-table-column label="更新时间" width="180">
          <template #default="{ row }">{{ fmtTime(row.operation_time) }}</template>
        </el-table-column>
        <el-table-column label="操作账号" width="160">
          <template #default="{ row }">{{ row.user || '--' }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无删除历史" :image-size="80" />

      <div class="table-footer">
        <span>共计{{ total }}条</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// 删除历史(对齐老版 views/history): /find/inst_audit 按 resource_type 过滤
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { searchInstAudit, searchModels } from '../../api/cmdb'

const route = useRoute()
const router = useRouter()
const routeObjId = computed(() => String(route.params.objId || 'host'))
const isHost = computed(() => routeObjId.value === 'host')

const title = ref('删除历史')
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const dateRange = ref([])
const resourceName = ref('')

function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 19) : '--' }
function goBack() { router.back() }

async function load() {
  loading.value = true
  try {
    const condition = {
      bk_obj_id: routeObjId.value,
      // 老版语义: host 用资源池业务 id,其余为 0
      bk_biz_id: isHost.value ? 1 : 0,
      resource_type: isHost.value ? 'host' : 'model_instance'
    }
    if (resourceName.value.trim()) condition.resource_name = resourceName.value.trim()
    if (Array.isArray(dateRange.value) && dateRange.value.length === 2) {
      condition.operation_time = { start: `${dateRange.value[0]} 00:00:00`, end: `${dateRange.value[1]} 23:59:59` }
    }
    const data = await searchInstAudit({
      condition,
      page: { start: (page.value - 1) * pageSize, limit: pageSize, sort: '-operation_time' }
    })
    rows.value = data?.info || []
    total.value = data?.count ?? rows.value.length
  } catch {
    rows.value = []
    total.value = 0
  } finally { loading.value = false }
}

function reload() {
  page.value = 1
  load()
}

async function loadTitle() {
  if (isHost.value) { title.value = '主机 删除历史'; return }
  try {
    const all = await searchModels({ condition: { bk_obj_id: routeObjId.value } })
    const model = (all || [])[0]
    title.value = `${model?.bk_obj_name || routeObjId.value} 删除历史`
  } catch { title.value = `${routeObjId.value} 删除历史` }
}

watch(routeObjId, () => { reload(); loadTitle() })

onMounted(() => {
  reload()
  loadTitle()
})
</script>

<style scoped>
.res-page { height: 100%; display: flex; flex-direction: column; background: #fff; overflow-y: auto; }
.page-head {
  display: flex; align-items: center; gap: 8px;
  padding: 0 20px; height: 50px; flex: 0 0 50px;
  border-bottom: 1px solid #E7E9EF;
}
.back-arrow { cursor: pointer; color: #3A84FF; font-size: 18px; font-weight: 700; }
.page-name { font-size: 14px; color: #313238; font-weight: 700; }
.page-body { padding: 16px 20px; }
.table-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.table-toolbar .spacer { flex: 1; }
.table-footer { padding: 12px 0 0; font-size: 12px; color: #63656E; }
</style>
