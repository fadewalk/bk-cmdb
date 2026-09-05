<template>
  <div class="page-card">
    <div class="table-toolbar">
      <el-select v-model="bizId" placeholder="选择业务" filterable style="width: 260px" @change="loadAll">
        <el-option v-for="b in bizList" :key="b.bk_biz_id" :label="b.bk_biz_name" :value="b.bk_biz_id" />
      </el-select>
      <el-tabs v-model="tab" style="flex: 1">
        <el-tab-pane label="服务模板" name="template" />
        <el-tab-pane label="服务分类" name="category" />
        <el-tab-pane label="集群模板" name="settpl" />
      </el-tabs>
    </div>

    <!-- 服务模板 -->
    <template v-if="tab === 'template' && bizId">
      <el-table :data="templates" v-loading="tplLoading" stripe>
        <el-table-column prop="id" label="模板 ID" width="110" />
        <el-table-column prop="name" label="模板名称" min-width="180" />
        <el-table-column prop="service_category_id" label="服务分类 ID" width="130" />
        <el-table-column prop="creator" label="创建人" width="130">
          <template #default="{ row }">{{ row.creator || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="showTplDetail(row)">查看进程</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!tplLoading && templates.length === 0" description="该业务暂无服务模板" :image-size="80" />
    </template>

    <!-- 服务分类 -->
    <template v-if="tab === 'category' && bizId">
      <el-table :data="categories" v-loading="catLoading" row-key="id" default-expand-all stripe>
        <el-table-column prop="category.name" label="分类名称" min-width="220" />
        <el-table-column prop="category.id" label="分类 ID" width="110" />
        <el-table-column prop="usage_count" label="模板引用数" width="130" />
      </el-table>
    </template>

    <!-- 集群模板 -->
    <template v-if="tab === 'settpl' && bizId">
      <el-table :data="setTemplates" v-loading="setLoading" stripe>
        <el-table-column prop="id" label="模板 ID" width="110" />
        <el-table-column prop="name" label="模板名称" min-width="200" />
        <el-table-column prop="creator" label="创建人" width="130">
          <template #default="{ row }">{{ row.creator || '-' }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!setLoading && setTemplates.length === 0" description="该业务暂无集群模板" :image-size="80" />
    </template>

    <el-empty v-if="!bizId" description="请先选择业务" />

    <!-- 服务模板进程列表 -->
    <el-drawer v-model="tplDrawer" :title="`「${tplDetailName}」进程模板`" size="45%">
      <el-table :data="tplProcesses" v-loading="tplDetailLoading" size="default">
        <el-table-column prop="bk_func_name" label="进程名称" min-width="140" />
        <el-table-column prop="bk_start_param_regex" label="启动参数" min-width="160" show-overflow-tooltip />
        <el-table-column prop="protocol" label="协议" width="90" />
      </el-table>
      <el-empty v-if="!tplDetailLoading && tplProcesses.length === 0" description="该模板暂无进程" :image-size="80" />
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import {
  searchBusiness, searchServiceTemplates, getServiceTemplateDetail,
  searchServiceCategories, searchSetTemplates
} from '../../api/cmdb'

const bizId = ref(null)
const bizList = ref([])
const tab = ref('template')

const templates = ref([])
const tplLoading = ref(false)
const categories = ref([])
const catLoading = ref(false)
const setTemplates = ref([])
const setLoading = ref(false)

const tplDrawer = ref(false)
const tplDetailName = ref('')
const tplDetailLoading = ref(false)
const tplProcesses = ref([])

async function loadTemplates() {
  tplLoading.value = true
  try {
    const data = await searchServiceTemplates(bizId.value, { start: 0, limit: 200 })
    templates.value = data?.info || []
  } finally { tplLoading.value = false }
}

async function loadCategories() {
  catLoading.value = true
  try {
    const data = await searchServiceCategories(bizId.value)
    // 分类接口返回树形(子分类含 sub_categories),展平为一层
    const flat = []
    for (const item of data?.info || []) {
      flat.push({ id: item.category.id, category: item.category, usage_count: item.usage_count })
      for (const sub of item.sub_categories || []) {
        flat.push({ id: sub.category.id, category: sub.category, usage_count: sub.usage_count })
      }
    }
    categories.value = flat
  } finally { catLoading.value = false }
}

async function loadSetTemplates() {
  setLoading.value = true
  try {
    const data = await searchSetTemplates(bizId.value, { start: 0, limit: 200 })
    setTemplates.value = data?.info || []
  } finally { setLoading.value = false }
}

function loadAll() {
  if (!bizId.value) return
  loadTemplates()
  loadCategories()
  loadSetTemplates()
}

async function showTplDetail(row) {
  tplDetailName.value = row.name
  tplDrawer.value = true
  tplDetailLoading.value = true
  try {
    const data = await getServiceTemplateDetail(row.id)
    tplProcesses.value = data?.attribute?.processes?.map((p) => p.spec || p) || data?.processes || []
    if (tplProcesses.value.length === 0 && data?.service_instance_count != null) tplProcesses.value = []
  } finally { tplDetailLoading.value = false }
}

onMounted(async () => {
  const data = await searchBusiness({ start: 0, limit: 200 })
  bizList.value = data?.info || []
  if (bizList.value.length > 0) {
    bizId.value = bizList.value[0].bk_biz_id
    loadAll()
  }
})

watch(tab, () => { if (bizId.value) loadAll() })
</script>
