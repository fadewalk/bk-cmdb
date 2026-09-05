<template>
  <div class="page-card">
    <h1 class="page-title">动态分组</h1>
    <p class="page-tips">动态分组主要用于定义常用的条件查询，在其他SaaS中可以根据动态分组快速检索目标主机</p>
    <div class="table-toolbar">
      <div class="spacer" />
      <el-button size="small" type="primary" :icon="'Plus'" :disabled="!bizId" @click="createDialog = true">新建</el-button>
      <el-button :icon="'Refresh'" size="small" :disabled="!bizId" @click="load">刷新</el-button>
    </div>

    <template v-if="bizId">
      <el-table :data="groups" v-loading="loading" stripe>
        <el-table-column prop="id" label="分组 ID" width="110" />
        <el-table-column prop="name" label="动态分组名称" min-width="200" />
        <el-table-column prop="bk_user" label="创建人" width="140">
          <template #default="{ row }">{{ row.bk_user || '-' }}</template>
        </el-table-column>
        <el-table-column prop="create_time" label="创建时间" width="180">
          <template #default="{ row }">{{ (row.create_time || '').replace('T', ' ').slice(0, 19) || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="preview(row)">预览结果</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && groups.length === 0" description="您还未创建动态分组,可点击上方「新建」创建" :image-size="80" />
    </template>
    <el-empty v-else description="请先选择业务" />

    <el-dialog v-model="createDialog" title="新建动态分组" width="520px">
      <el-form label-width="90px">
        <el-form-item label="分组名称" required>
          <el-input v-model="createForm.name" placeholder="如:核心业务主机" />
        </el-form-item>
        <el-form-item label="IP 列表" required>
          <el-input
            v-model="createForm.ips"
            type="textarea"
            :rows="4"
            placeholder="输入主机内网 IP,每行一个"
          />
          <div class="hint">将生成 bk_host_innerip ∈ IP 列表 的查询条件</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="previewVisible" :title="`「${previewName}」主机预览`" size="45%">
      <el-table :data="previewHosts" v-loading="previewLoading" size="default">
        <el-table-column prop="host.bk_host_id" label="主机 ID" width="100" />
        <el-table-column label="内网 IP" min-width="150">
          <template #default="{ row }">{{ row.host?.bk_host_innerip || '-' }}</template>
        </el-table-column>
        <el-table-column label="主机名称" min-width="150">
          <template #default="{ row }">{{ row.host?.bk_host_name || '-' }}</template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  searchDynamicGroups, deleteDynamicGroup, executeDynamicGroup, http
} from '../../api/cmdb'
import { useBizStore } from '../../stores/biz'

const bizStore = useBizStore()
const bizId = computed(() => bizStore.bizId)
const bizList = computed(() => bizStore.bizList)
const groups = ref([])
const loading = ref(false)

const previewVisible = ref(false)
const previewName = ref('')
const previewHosts = ref([])
const previewLoading = ref(false)

const createDialog = ref(false)
const creating = ref(false)
const createForm = ref({ name: '', ips: '' })

async function submitCreate() {
  const ips = createForm.value.ips.split(/\n|,|\s+/).map((x) => x.trim()).filter(Boolean)
  if (!createForm.value.name || ips.length === 0) {
    ElMessage.warning('请填写分组名称与至少一个 IP')
    return
  }
  creating.value = true
  try {
    await http.post('/dynamicgroup', {
      bk_biz_id: bizId.value,
      name: createForm.value.name,
      bk_obj_id: 'host',
      info: {
        condition: [
          { bk_obj_id: 'host', field: 'bk_host_innerip', operator: 'in', value: ips }
        ]
      }
    })
    ElMessage.success('动态分组已创建')
    createDialog.value = false
    createForm.value = { name: '', ips: '' }
    load()
  } finally {
    creating.value = false
  }
}

async function load() {
  if (!bizId.value) return
  loading.value = true
  try {
    const data = await searchDynamicGroups(bizId.value, { start: 0, limit: 200 })
    groups.value = data?.info || []
  } finally { loading.value = false }
}

async function preview(row) {
  previewName.value = row.name
  previewVisible.value = true
  previewLoading.value = true
  try {
    const data = await executeDynamicGroup(bizId.value, row.id, { start: 0, limit: 100 })
    previewHosts.value = data?.info || []
  } finally { previewLoading.value = false }
}

async function remove(row) {
  await ElMessageBox.confirm(`确定删除动态分组「${row.name}」?`, '删除确认', { type: 'warning' })
  await deleteDynamicGroup(bizId.value, row.id)
  ElMessage.success('已删除')
  load()
}

watch(bizId, () => { if (bizId.value) load() })

onMounted(async () => {
  const data = await searchBusiness({ start: 0, limit: 200 })
  bizList.value = data?.info || []
  if (bizList.value.length > 0) {
    load()
  }
})
</script>
