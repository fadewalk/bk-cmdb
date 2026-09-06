<template>
  <div class="page-card">
    <h1 class="page-title sr-only">业务同步</h1>
    <p class="page-tips">查看服务实例与所属服务模板之间的差异;支持手动触发同步,保障业务属性与服务模板配置一致</p>

    <div class="toolbar">
      <el-select v-model="bizId" placeholder="选择业务" filterable style="width: 260px" :disabled="!bizStore.bizId" @change="load">
        <el-option v-for="b in bizStore.bizList" :key="b.bk_biz_id" :label="b.bk_biz_name" :value="b.bk_biz_id" />
      </el-select>
      <div class="spacer" />
      <el-button :icon="'Refresh'" @click="load">刷新</el-button>
    </div>

    <el-card shadow="never" class="diff-card">
      <template #header>
        <div class="card-head">
          <span>服务实例与模板差异({{ diffs.length }})</span>
          <el-button type="primary" size="small" :disabled="!diffs.length" :loading="syncing" @click="syncAll">
            同步全部
          </el-button>
        </div>
      </template>
      <el-table :data="diffs" v-loading="loading" stripe>
        <el-table-column prop="instance_id" label="实例 ID" width="100" />
        <el-table-column prop="instance_name" label="实例名" min-width="160" show-overflow-tooltip />
        <el-table-column prop="template_id" label="所属模板" width="100" />
        <el-table-column label="差异字段" min-width="280">
          <template #default="{ row }">
            <el-tag v-for="d in (row.diff_fields || [])" :key="d.field" size="small" style="margin: 2px">
              {{ d.field }}: <span style="text-decoration: line-through; color: #999">{{ d.cur }}</span> → {{ d.target }}
            </el-tag>
            <span v-if="!(row.diff_fields || []).length" style="color: #2DCB56">无差异</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" :disabled="!row.diff_fields?.length" @click="syncOne(row)">同步</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && diffs.length === 0" description="暂无差异" :image-size="60" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useBizStore } from '../../stores/biz'
import { http } from '../../api/cmdb'

const bizStore = useBizStore()
const bizId = ref(bizStore.bizId || null)
const loading = ref(false)
const syncing = ref(false)
const diffs = ref([])

async function load() {
  if (!bizId.value) return
  loading.value = true
  try {
    const data = await http.post(`/find/proc/service_template/general_difference/bk_biz_id/${bizId.value}`, {})
    const list = data?.info || data?.differences || []
    diffs.value = list
  } catch (e) {
    diffs.value = []
  } finally { loading.value = false }
}

async function syncAll() {
  if (!diffs.value.length) return
  await ElMessageBox.confirm(`确定对 ${diffs.value.length} 个差异实例执行同步?`, '同步', { type: 'warning' })
  syncing.value = true
  try {
    await http.post(`/updatemany/proc/service_instance/sync/bk_biz_id/${bizId.value}`, { difference: diffs.value })
    ElMessage.success('同步已提交,可在「同步历史」查看进度')
    await load()
  } catch (e) {
    ElMessage.error('同步失败: ' + (e?.message || '后端异常'))
  } finally { syncing.value = false }
}

async function syncOne(row) {
  await ElMessageBox.confirm(`同步实例「${row.instance_name}」?`, '同步', { type: 'warning' })
  syncing.value = true
  try {
    await http.post(`/updatemany/proc/service_instance/sync/bk_biz_id/${bizId.value}`, { difference: [row] })
    ElMessage.success('已同步')
    await load()
  } catch (e) { ElMessage.error('同步失败: ' + (e?.message || '后端异常')) }
  finally { syncing.value = false }
}

watch(() => bizStore.bizId, (v) => { bizId.value = v; load() })
onMounted(() => { if (bizId.value) load() })
</script>

<style scoped>
.page-title { font-size: 16px; color: #313238; font-weight: 400; padding: 0 20px; height: 50px; line-height: 50px; border-bottom: 1px solid #E7E9EF; margin: 0; }
.page-tips { margin: 0; padding: 10px 20px; font-size: 12px; color: #979BA5; background: #F0F5FF; border-bottom: 1px solid #E7E9EF; }
.toolbar { display: flex; align-items: center; gap: 8px; margin: 12px 0; }
.toolbar .spacer { flex: 1; }
.card-head { display: flex; align-items: center; gap: 10px; }
.diff-card { border-radius: 2px; }
</style>