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
      <div class="table-toolbar">
        <div class="spacer" />
        <el-button :icon="'Plus'" type="primary" size="small" @click="tplFormVisible = true">新建服务模板</el-button>
      </div>
      <el-table :data="templates" v-loading="tplLoading" stripe>
        <el-table-column prop="id" label="模板 ID" width="110" />
        <el-table-column prop="name" label="模板名称" min-width="180" />
        <el-table-column prop="service_category_id" label="服务分类 ID" width="130" />
        <el-table-column prop="creator" label="创建人" width="130">
          <template #default="{ row }">{{ row.creator || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="showTplDetail(row)">查看进程</el-button>
            <el-button link type="primary" @click="openAddProcTpl(row)">加进程模板</el-button>
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
        <el-table-column label="进程名称" min-width="140">
          <template #default="{ row }">{{ row.bk_func_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="端口" width="110">
          <template #default="{ row }">{{ row.port || '-' }}</template>
        </el-table-column>
        <el-table-column label="启动用户" width="110">
          <template #default="{ row }">{{ row.user || '-' }}</template>
        </el-table-column>
        <el-table-column label="工作路径" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.work_path || '-' }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!tplDetailLoading && tplProcesses.length === 0" description="该模板暂无进程" :image-size="80" />
    </el-drawer>

    <!-- 新建服务模板 -->
    <el-dialog v-model="tplFormVisible" title="新建服务模板" width="440px">
      <el-form label-width="90px">
        <el-form-item label="模板名称" required>
          <el-input v-model="tplForm.name" />
        </el-form-item>
        <el-form-item label="服务分类">
          <el-select v-model="tplForm.service_category_id" style="width: 100%">
            <el-option v-for="c in flatCategories" :key="c.category.id" :label="c.category.name" :value="c.category.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tplFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveTpl">创建</el-button>
      </template>
    </el-dialog>

    <!-- 新增进程模板 -->
    <el-dialog v-model="procTplDialog" title="新增进程模板" width="480px" append-to-body>
      <el-form label-width="90px">
        <el-form-item label="进程名称" required>
          <el-input v-model="procTplForm.bk_func_name" placeholder="如 java / nginx" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input v-model="procTplForm.port" placeholder="如 8080" />
        </el-form-item>
        <el-form-item label="启动用户">
          <el-input v-model="procTplForm.user" />
        </el-form-item>
        <el-form-item label="工作路径">
          <el-input v-model="procTplForm.work_path" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="procTplDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveProcTpl">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  searchBusiness, searchServiceTemplates,
  searchServiceCategories, searchSetTemplates, http
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
const tplDetailId = ref(null)

const procTplDialog = ref(false)
const saving = ref(false)
const procTplForm = ref({ bk_func_name: '', port: '', user: 'root', work_path: '/tmp' })
const procTplTarget = ref(null)

function openAddProcTpl(row) {
  procTplTarget.value = row
  procTplForm.value = { bk_func_name: '', port: '', user: 'root', work_path: '/tmp' }
  procTplDialog.value = true
}

async function saveProcTpl() {
  if (!procTplForm.value.bk_func_name) {
    ElMessage.warning('请输入进程名称')
    return
  }
  saving.value = true
  try {
    const spec = {}
    for (const key of ['bk_func_name', 'bk_process_name', 'port', 'user', 'work_path', 'bk_bind_ip']) {
      const v = key === 'bk_process_name' ? procTplForm.value.bk_func_name : procTplForm.value[key]
      if (v !== undefined && v !== '') spec[key] = { value: v, as_default_value: true }
    }
    await http.post('/createmany/proc/proc_template', {
      bk_biz_id: bizId.value,
      service_template_id: procTplTarget.value.id,
      processes: [{ spec }]
    })
    ElMessage.success('进程模板已创建')
    procTplDialog.value = false
    showTplDetail(procTplTarget.value)
  } finally {
    saving.value = false
  }
}

// ---------- 新建服务模板 ----------
const tplFormVisible = ref(false)
const tplForm = ref({ name: '', service_category_id: null })
const flatCategories = computed(() => {
  const flat = []
  for (const item of categories.value) {
    if (item.category?.name) flat.push(item)
  }
  return flat
})

async function saveTpl() {
  if (!tplForm.value.name) {
    ElMessage.warning('请输入模板名称')
    return
  }
  saving.value = true
  try {
    await http.post('/create/proc/service_template', {
      bk_biz_id: bizId.value,
      name: tplForm.value.name,
      service_category_id: tplForm.value.service_category_id || 0
    })
    ElMessage.success('服务模板已创建')
    tplFormVisible.value = false
    loadTemplates()
  } finally {
    saving.value = false
  }
}

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
  tplDetailId.value = row.id
  tplDrawer.value = true
  tplDetailLoading.value = true
  try {
    // 进程模板按服务模板维度查询
    const data = await http.post('/findmany/proc/proc_template', {
      bk_biz_id: bizId.value,
      service_template_id: row.id,
      page: { start: 0, limit: 100 }
    })
    tplProcesses.value = (data?.info || []).map((t) => ({
      id: t.id,
      bk_func_name: t.property?.bk_func_name?.value || t.bk_process_name || '-',
      port: t.property?.port?.value || '-',
      user: t.property?.user?.value || '-',
      work_path: t.property?.work_path?.value || '-'
    }))
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
