<template>
  <div class="page-card" v-loading="loading">
    <el-page-header @back="$router.back()" style="margin-bottom: 16px">
      <template #content>主机详情 · {{ host?.bk_host_innerip || hostId }}</template>
    </el-page-header>

    <template v-if="host">
      <el-row :gutter="16">
        <el-col :span="14">
          <el-card shadow="never">
            <template #header>主机属性</template>
            <el-descriptions :column="2" border size="small" class="attrs">
              <el-descriptions-item v-for="(v, k) in hostAttrs" :key="k" :label="String(k)">
                {{ v === null || v === '' ? '-' : v }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>
        <el-col :span="10">
          <el-card shadow="never">
            <template #header>主机转移</template>
            <el-form label-width="90px">
              <el-form-item label="当前归属">
                <el-tag v-if="bizId" size="small">业务 {{ bizId }}</el-tag>
                <el-tag v-else size="small" type="info">资源池</el-tag>
              </el-form-item>

              <!-- 资源池主机 -> 转入业务模块 -->
              <template v-if="!bizId">
                <el-form-item label="目标业务">
                  <el-select v-model="targetBiz" filterable style="width: 100%" placeholder="选择业务">
                    <el-option v-for="b in bizList" :key="b.bk_biz_id" :label="b.bk_biz_name" :value="b.bk_biz_id" />
                  </el-select>
                </el-form-item>
              </template>

              <el-form-item label="目标模块">
                <el-cascader
                  v-model="targetModulePath"
                  :options="moduleOptions"
                  :props="{ value: 'value', label: 'label', children: 'children', emitPath: false }"
                  placeholder="选择集群 / 模块"
                  style="width: 100%"
                  :disabled="!bizId && !targetBiz"
                />
              </el-form-item>
              <el-form-item label="追加模式">
                <el-switch v-model="isIncrement" />
                <span class="hint">开启后主机保留原模块归属</span>
              </el-form-item>
              <el-form-item>
                <el-button type="primary" :loading="transferring" @click="transfer">转移到所选模块</el-button>
                <el-button v-if="bizId" :loading="transferring" @click="toResource">转移到资源池</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
      </el-row>
    </template>
    <el-empty v-else-if="!loading" description="主机不存在" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  http, searchBusiness, getBizTopoTree, getBizInternalTopo,
  transferHostModule, transferHostToResource
} from '../../api/cmdb'

const route = useRoute()
const hostId = Number(route.query.id)
const bizId = route.query.biz ? Number(route.query.biz) : null

const host = ref(null)
const loading = ref(false)
const bizList = ref([])
const targetBiz = ref(null)
const targetModulePath = ref(null)
const isIncrement = ref(false)
const transferring = ref(false)
const moduleOptions = ref([])

// 过滤掉关联字段等复杂结构,仅展示标量属性
const hostAttrs = computed(() => {
  if (!host.value) return {}
  const out = {}
  for (const [k, v] of Object.entries(host.value)) {
    if (v === null || typeof v !== 'object') out[k] = v
  }
  return out
})

async function loadHost() {
  loading.value = true
  try {
    const filter = { condition: 'AND', rules: [{ field: 'bk_host_id', operator: 'equal', value: hostId }] }
    const body = { page: { start: 0, limit: 1 }, fields: [], host_property_filter: filter }
    const data = bizId
      ? await http.post(`/hosts/app/${bizId}/list_hosts`, body)
      : await http.post('/findmany/hosts/search/resource', body)
    host.value = data?.info?.[0]?.host || data?.info?.[0] || null
  } finally {
    loading.value = false
  }
}

async function loadBizList() {
  const data = await searchBusiness({ start: 0, limit: 200 })
  bizList.value = data?.info || []
}

async function loadModuleOptions() {
  const id = bizId || targetBiz.value
  if (!id) return
  const options = []
  const [mainTree, idleTopo] = await Promise.allSettled([getBizTopoTree(id), getBizInternalTopo(id)])
  const mapSet = (node) => ({
    value: node.bk_inst_id,
    label: node.bk_inst_name,
    children: (node.child || [])
      .filter((c) => c.bk_obj_id === 'module' || c.child)
      .map((c) => (c.bk_obj_id === 'module'
        ? { value: c.bk_inst_id, label: c.bk_inst_name }
        : mapSet(c)))
  })
  if (mainTree.status === 'fulfilled' && Array.isArray(mainTree.value)) {
    for (const bizNode of mainTree.value) {
      options.push(...(bizNode.child || []).map(mapSet))
    }
  }
  if (idleTopo.status === 'fulfilled' && idleTopo.value?.bk_set_id) {
    const s = idleTopo.value
    options.push({
      value: s.bk_set_id,
      label: s.bk_set_name,
      children: (s.module || []).map((m) => ({ value: m.bk_module_id, label: m.bk_module_name }))
    })
  }
  moduleOptions.value = options
}

async function transfer() {
  const biz = bizId || targetBiz.value
  if (!biz || !targetModulePath.value) {
    ElMessage.warning('请选择目标业务与模块')
    return
  }
  transferring.value = true
  try {
    await transferHostModule(biz, [hostId], [targetModulePath.value], isIncrement.value)
    ElMessage.success('转移成功')
    bizId ? null : (window.location.hash = '#/hosts')
  } finally {
    transferring.value = false
  }
}

async function toResource() {
  transferring.value = true
  try {
    await transferHostToResource(bizId, [hostId])
    ElMessage.success('已转移到资源池')
    window.location.hash = '#/hosts'
  } finally {
    transferring.value = false
  }
}

onMounted(async () => {
  loadHost()
  loadBizList()
  if (bizId) loadModuleOptions()
})
</script>

<style scoped>
.attrs { max-height: 60vh; overflow: auto; }
.hint { color: #979ba5; font-size: 12px; margin-left: 10px; }
</style>
