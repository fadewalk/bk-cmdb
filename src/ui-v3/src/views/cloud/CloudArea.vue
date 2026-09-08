<template>
  <div class="res-page">
    <div class="page-head">
      <span class="page-name">管控区域</span>
    </div>

    <div class="page-body">
      <el-alert type="info" :closable="true" style="margin-bottom: 14px">
        <template #title>
          管控区域来源于<span class="link" @click="$router.push('/resource/cloud-discover')">云资源发现</span>后同步录入或者<span class="link" @click="$router.push('/resource/cloud-discover')">节点管理</span>中新建。未分配管控区域下的主机可在节点管理中重新指定并安装Agent。
        </template>
      </el-alert>

      <div class="table-toolbar">
        <el-input
          v-model="keyword"
          placeholder="请输入管控区域名称"
          clearable
          style="width: 280px"
          :prefix-icon="'Search'"
          @keyup.enter="load"
          @clear="load"
        />
      </div>

      <el-table :data="filtered" v-loading="loading" stripe>
        <el-table-column prop="bk_cloud_name" label="管控区域名称" min-width="160" show-overflow-tooltip />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <template v-if="row.bk_cloud_id === 0 || row.bk_status === '正常'">
              <span class="status-dot" />正常
            </template>
            <span v-else>--</span>
          </template>
        </el-table-column>
        <el-table-column label="所属云厂商" width="130">
          <template #default>--</template>
        </el-table-column>
        <el-table-column label="地域" width="110">
          <template #default>--</template>
        </el-table-column>
        <el-table-column label="VPC" width="110">
          <template #default>--</template>
        </el-table-column>
        <el-table-column label="主机数量" prop="host_count" width="110" />
        <el-table-column label="最近编辑" width="170">
          <template #default="{ row }">{{ fmtTime(row.last_time) }}</template>
        </el-table-column>
        <el-table-column label="编辑人" prop="bk_updated_by" width="120">
          <template #default="{ row }">{{ row.bk_updated_by || '--' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.bk_cloud_id !== 0"
              link
              type="danger"
              size="small"
              :disabled="Number(row.host_count) > 0"
              @click="remove(row)"
            >删除</el-button>
            <span v-else class="disabled-op">删除</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="table-footer">
        <span>共计{{ total }}条</span>
        <span class="page-size">每页 20 条</span>
        <div class="spacer" />
        <el-pagination
          v-model:current-page="page"
          :page-size="20"
          :total="total"
          layout="prev, pager, next"
          @current-change="load"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
// 管控区域:独立页面对齐老版 resource/cloud-area(列定义/状态/删除保护)
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { searchCloudAreas, deleteCloudArea } from '../../api/cmdb'

const keyword = ref('')
const rows = ref([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)

const filtered = computed(() =>
  keyword.value.trim()
    ? rows.value.filter((r) => (r.bk_cloud_name || '').includes(keyword.value.trim()))
    : rows.value
)

function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 19) : '--' }

async function load() {
  loading.value = true
  try {
    const data = await searchCloudAreas({ start: (page.value - 1) * 20, limit: 20 })
    rows.value = data?.info || []
    total.value = data?.count ?? rows.value.length
  } catch {
    rows.value = []
    total.value = 0
  } finally { loading.value = false }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除管控区域「${row.bk_cloud_name}」?`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    await deleteCloudArea(row.bk_cloud_id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}

onMounted(load)
</script>

<style scoped>
.res-page { height: 100%; display: flex; flex-direction: column; background: #fff; overflow-y: auto; }
.page-head {
  display: flex; align-items: center;
  padding: 0 20px; height: 50px; flex: 0 0 50px;
  border-bottom: 1px solid #E7E9EF;
}
.page-name { font-size: 14px; color: #313238; font-weight: 700; }
.page-body { padding: 16px 20px; }
.link { color: #3A84FF; cursor: pointer; }
.status-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: #2DCB56; margin-right: 6px; vertical-align: middle;
}
.table-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.disabled-op { color: #C4C6CC; font-size: 12px; }
.table-footer {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 0 0; font-size: 12px; color: #63656E;
}
.table-footer .spacer { flex: 1; }
</style>
