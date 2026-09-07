<template>
  <div class="page-card biz-detail" v-loading="loading">
    <div class="crumb-row">
      <span class="back-btn" @click="goBack">‹ 业务</span>
      <span class="crumb-title">业务详情【{{ biz?.bk_biz_name || bizId }}】</span>
    </div>

    <el-tabs v-model="tab" class="detail-tabs">
      <el-tab-pane label="属性" name="property" />
      <el-tab-pane label="变更历史" name="history" />
    </el-tabs>

    <template v-if="tab === 'property'">
      <el-descriptions v-if="biz" :column="2" border size="small" class="props">
        <el-descriptions-item v-for="(v, k) in bizProps" :key="k" :label="propName(k)">
          {{ v === null || v === '' || v === undefined ? '--' : v }}
        </el-descriptions-item>
      </el-descriptions>
      <el-empty v-else-if="!loading" description="业务不存在" />
    </template>

    <template v-else>
      <el-table :data="auditRows" v-loading="auditLoading" size="small" stripe>
        <el-table-column label="操作人" prop="user" width="120" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">{{ actionName(row.action) }}</template>
        </el-table-column>
        <el-table-column label="对象" prop="resource_name" min-width="160" show-overflow-tooltip />
        <el-table-column label="时间" min-width="160">
          <template #default="{ row }">{{ (row.operation_time || '').replace('T', ' ').slice(0, 19) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!auditLoading && auditRows.length === 0" description="暂无变更记录" :image-size="70" />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { searchBusiness, searchInstAudit } from '../../api/cmdb'

const route = useRoute()
const router = useRouter()
const bizId = computed(() => Number(route.params.bizId) || null)

const tab = ref('property')
const biz = ref(null)
const loading = ref(false)
const auditRows = ref([])
const auditLoading = ref(false)

const BIZ_FIELDS = {
  bk_biz_id: '业务 ID', bk_biz_name: '业务名称', bk_biz_maintainer: '运维人员',
  bk_biz_developer: '开发人员', bk_biz_productor: '产品人员', bk_biz_tester: '测试人员',
  life_cycle: '生命周期', time_zone: '时区', language: '语言',
  bk_supplier_account: '开发商', bk_biz_desc: '描述', create_time: '创建时间', last_time: '更新时间'
}
const AUDIT_ACTIONS = {
  create: '新增', update: '修改', delete: '删除',
  archive: '归档', recover: '恢复'
}

const bizProps = computed(() => {
  if (!biz.value) return {}
  const out = {}
  // 按预定义顺序输出,未知字段排后
  for (const k of Object.keys(BIZ_FIELDS)) {
    if (biz.value[k] !== undefined) out[k] = biz.value[k]
  }
  for (const [k, v] of Object.entries(biz.value)) {
    if (!(k in out) && (v === null || typeof v !== 'object')) out[k] = v
  }
  return out
})

function propName(k) { return BIZ_FIELDS[k] || k }
function actionName(a) { return AUDIT_ACTIONS[a] || a || '--' }
function goBack() { router.push('/resource/business') }

async function loadBiz() {
  if (!bizId.value) return
  loading.value = true
  try {
    const data = await searchBusiness({ start: 0, limit: 1 }, { bk_biz_id: bizId.value })
    biz.value = (data?.info || [])[0] || null
  } finally { loading.value = false }
}

async function loadAudit() {
  if (!bizId.value) return
  auditLoading.value = true
  try {
    const data = await searchInstAudit({
      condition: { bk_obj_id: 'biz', resource_type: 'business', resource_id: bizId.value, bk_biz_id: bizId.value },
      page: { start: 0, limit: 50, sort: '-operation_time' }
    })
    auditRows.value = data?.info || []
  } catch {
    auditRows.value = []
  } finally { auditLoading.value = false }
}

watch(tab, (v) => {
  if (v === 'history' && !auditRows.value.length && !auditLoading.value) loadAudit()
})
watch(bizId, () => { biz.value = null; auditRows.value = []; loadBiz() })

onMounted(loadBiz)
</script>

<style scoped>
.biz-detail { height: 100%; overflow-y: auto; }
.crumb-row {
  display: flex; align-items: center; gap: 10px;
  padding: 0 4px; height: 50px; line-height: 50px;
}
.back-btn { cursor: pointer; color: #3A84FF; font-size: 14px; }
.crumb-title { font-size: 14px; color: #313238; }
.detail-tabs { margin-bottom: 14px; }
</style>
