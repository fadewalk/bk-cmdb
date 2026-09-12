<template>
  <!-- 旧版 set-template/sync-history.vue 复刻:日期范围 + 集群名称搜索 + 同步历史表 -->
  <div class="history-page">
    <div class="table-toolbar">
      <el-date-picker
        v-model="searchDate"
        type="daterange"
        value-format="YYYY-MM-DD"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        style="width: 300px"
        @change="reload(1)"
      />
      <el-input
        v-model="searchName"
        placeholder="集群名称"
        clearable
        style="width: 240px; margin-left: 10px"
        suffix-icon="Search"
        @keyup.enter="reload(1)"
        @clear="reload(1)"
      />
    </div>
    <el-table :data="displayList" v-loading="loading">
      <el-table-column label="集群名称" prop="bk_set_name" min-width="160" show-overflow-tooltip />
      <el-table-column label="拓扑路径" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">{{ topoPath(row) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <span v-if="row.status === 'syncing'">同步中</span>
          <span v-else-if="row.status === 'waiting'" class="sync-waiting">待同步</span>
          <span v-else-if="row.status === 'finished'" class="sync-finished">已同步</span>
          <span v-else-if="row.status === 'failure'" class="sync-failure">同步失败</span>
          <span v-else>--</span>
        </template>
      </el-table-column>
      <el-table-column label="同步时间" prop="last_time" width="170">
        <template #default="{ row }">{{ row.last_time ? formatTime(row.last_time) : '--' }}</template>
      </el-table-column>
      <el-table-column label="同步人" prop="creator" width="110">
        <template #default="{ row }">{{ row.creator || '--' }}</template>
      </el-table-column>
      <template #empty>
        <el-empty :image-size="60" description="暂无数据" />
      </template>
    </el-table>
    <el-pagination
      v-model:current-page="pagination.current"
      :page-size="pagination.limit"
      :total="pagination.count"
      layout="total, prev, pager, next, sizes"
      :page-sizes="[10, 20, 50, 100]"
      class="history-pagination"
      @current-change="reload()"
      @size-change="(s) => { pagination.limit = s; reload(1) }"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useBizStore } from '../../stores/biz'
import { searchSetTemplateSyncHistory, searchSetTemplateSets, getSetTemplateDetail } from '../../api/cmdb'
import { formatTime } from '../../utils/format-time'

const route = useRoute()
const bizStore = useBizStore()
const bizId = computed(() => Number(route.params.bizId) || bizStore.bizId)
const templateId = computed(() => Number(route.params.templateId))

const loading = ref(false)
const searchName = ref('')
const searchDate = ref([])
const list = ref([])
const listWithTopo = ref([])
const templateName = ref('')
const pagination = reactive({ current: 1, limit: 20, count: 0 })

const setsId = computed(() => [...new Set(list.value.map((item) => item.bk_inst_id))])
const displayList = computed(() => list.value.map((item) => {
  const setInfo = listWithTopo.value.find((s) => s.bk_set_id === item.bk_inst_id)
  return {
    ...item,
    bk_set_name: setInfo?.bk_set_name ?? item.bk_set_name,
    topo_path: setInfo?.topo_path || []
  }
}))

// 旧版契约:剔除 set 节点后按实例 id 排序拼接拓扑路径
function topoPath(row) {
  const topoPath = [...(row.topo_path || [])]
  if (!topoPath.length) return '--'
  const setIndex = topoPath.findIndex((p) => p.ObjectID === 'set')
  if (setIndex > -1) topoPath.splice(setIndex, 1)
  topoPath.sort((a, b) => a.bk_inst_id - b.bk_inst_id)
  return topoPath.map((p) => p.bk_inst_name).join(' / ') || '--'
}

async function reloadPage() {
  loading.value = true
  try {
    const params = {
      set_template_id: templateId.value,
      search: searchName.value,
      page: { start: pagination.limit * (pagination.current - 1), limit: pagination.limit, sort: 'last_time' }
    }
    if (searchDate.value?.length) {
      params.start_time = searchDate.value[0] || ''
      params.end_time = searchDate.value[1] || ''
    }
    const data = await searchSetTemplateSyncHistory(bizId.value, params)
    pagination.count = data?.count || 0
    list.value = data?.info || []
    if (setsId.value.length) {
      const topo = await searchSetTemplateSets(bizId.value, templateId.value, {
        limit: { start: 0, limit: pagination.limit },
        bk_set_ids: setsId.value
      }).catch(() => null)
      listWithTopo.value = topo?.info || []
    } else {
      listWithTopo.value = []
    }
  } finally {
    loading.value = false
  }
}
function reload(page) {
  if (page) pagination.current = page
  reloadPage()
}

onMounted(async () => {
  await bizStore.ensureLoaded()
  reloadPage()
  const info = await getSetTemplateDetail(bizId.value, templateId.value).catch(() => null)
  templateName.value = info?.name || ''
})
</script>

<style scoped>
.history-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #F5F7FA;
  overflow-y: auto;
  padding: 15px 20px;
}
.table-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 14px;
}
.sync-waiting,
.sync-finished,
.sync-failure {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sync-waiting::before,
.sync-finished::before,
.sync-failure::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.sync-waiting::before {
  background: #FF9C01;
}
.sync-finished::before {
  background: #2DCB56;
}
.sync-failure::before {
  background: #EA3636;
}
.history-pagination {
  margin-top: 14px;
  justify-content: flex-end;
}
</style>
