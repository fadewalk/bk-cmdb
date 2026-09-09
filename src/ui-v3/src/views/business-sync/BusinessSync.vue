<template>
  <div class="page-card">
    <h1 class="page-title sr-only">业务同步</h1>
    <p class="page-tips">查看服务实例与所属服务模板之间的差异;支持手动触发同步,保障业务属性与服务模板配置一致</p>

    <div class="toolbar">
      <el-select v-model="bizId" placeholder="选择业务" filterable style="width: 220px" :disabled="!bizStore.bizList.length" @change="loadTemplates">
        <el-option v-for="b in bizStore.bizList" :key="b.bk_biz_id" :label="b.bk_biz_name" :value="b.bk_biz_id" />
      </el-select>
      <el-select v-model="templateId" placeholder="选择服务模板" filterable style="width: 220px" :disabled="!bizId" @change="loadModules">
        <el-option v-for="t in templates" :key="t.id" :label="t.name || t.bk_service_template_name" :value="t.id" />
      </el-select>
      <el-select v-model="moduleId" placeholder="选择模块" filterable style="width: 220px" :disabled="!templateId" @change="load">
        <el-option v-for="m in modules" :key="m.id" :label="m.name || m.bk_module_name" :value="m.id" />
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
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" :disabled="!row.diff_fields?.length" @click="syncOne(row)">同步当前模块</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && diffs.length === 0" description="暂无差异" :image-size="60" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useBizStore } from '../../stores/biz'
import { searchServiceTemplates, getServiceTemplateDiff, syncServiceInstances, listModulesByServiceTemplate } from '../../api/cmdb'

const route = useRoute()

const bizStore = useBizStore()
const bizId = ref(bizStore.bizId || null)
const source = ref('')
const templateId = ref(null)
const moduleId = ref(null)
const templates = ref([])
const modules = ref([])
const loading = ref(false)
const syncing = ref(false)
const diffs = ref([])

async function loadTemplates() {
  templateId.value = null
  moduleId.value = null
  modules.value = []
  diffs.value = []
  if (!bizId.value) return
  try {
    const data = await searchServiceTemplates(bizId.value, { start: 0, limit: 200 })
    templates.value = data?.info || []
  } catch { templates.value = [] }
}

async function loadModules() {
  moduleId.value = null
  diffs.value = []
  modules.value = []
  if (!bizId.value || !templateId.value) return

  try {
    const data = await listModulesByServiceTemplate(bizId.value, templateId.value)
    modules.value = (data?.info || []).map((module) => ({
      id: module.bk_module_id || module.id,
      name: module.bk_module_name || module.name || String(module.bk_module_id || module.id)
    }))
  } catch {
    modules.value = []
  }
}

function normalizeDiff(data) {
  const rows = []
  for (const [type, items] of [['changed', data?.changed], ['added', data?.added], ['removed', data?.removed]]) {
    for (const item of items || []) {
      rows.push({
        instance_id: item.id || item.process_template_id || '-',
        instance_name: item.name || item.process_template_name || '-',
        template_id: templateId.value,
        diff_fields: [{ field: type, cur: type === 'added' ? '' : item.name || '-', target: type === 'removed' ? '' : '模板配置' }],
        raw: item
      })
    }
  }
  if (data?.attributes?.length) {
    rows.push({
      instance_id: '-',
      instance_name: '模块属性',
      template_id: templateId.value,
      diff_fields: data.attributes.map((item) => ({ field: item.name || item.id || '属性', cur: item.current, target: item.template }))
    })
  }
  return rows
}

async function load() {
  if (!bizId.value || !templateId.value || !moduleId.value) return
  loading.value = true
  try {
    const data = await getServiceTemplateDiff({
      bk_biz_id: bizId.value,
      service_template_id: templateId.value,
      bk_module_id: moduleId.value
    })
    diffs.value = normalizeDiff(data)
  } catch {
    diffs.value = []
  } finally { loading.value = false }
}

async function syncAll() {
  if (!bizId.value || !templateId.value || !moduleId.value || !diffs.value.length) return
  await ElMessageBox.confirm(`确定同步当前模块的服务模板差异?`, '同步', { type: 'warning' })
  syncing.value = true
  try {
    await syncServiceInstances({
      bk_biz_id: bizId.value,
      service_template_id: templateId.value,
      bk_module_ids: [moduleId.value]
    })
    ElMessage.success('同步已提交')
    await load()
  } catch (e) {
    ElMessage.error('同步失败: ' + (e?.message || '后端异常'))
  } finally { syncing.value = false }
}

async function syncOne() {
  return syncAll()
}

watch(() => bizStore.bizId, (v) => {
  bizId.value = v
  loadTemplates()
})
watch(() => route.query.biz, async (value) => {
  const id = Number(value)
  if (id && bizStore.bizList.some((b) => b.bk_biz_id === id) && id !== bizId.value) {
    bizStore.select(id)
    bizId.value = id
    await loadTemplates()
  }
})
onMounted(async () => {
  await bizStore.ensureLoaded()
  bizId.value = bizStore.bizId
  const legacyBiz = Number(route.query.biz)
  if (legacyBiz && bizStore.bizList.some((b) => b.bk_biz_id === legacyBiz)) {
    bizStore.select(legacyBiz)
    bizId.value = legacyBiz
  }
  source.value = String(route.query.source || '')
  if (bizId.value) await loadTemplates()
  // 旧版深链 /business/:bizId/synchronous/module/:template/:modules
  const legacyTpl = Number(route.query.template)
  if (legacyTpl && templates.value.some((t) => t.id === legacyTpl)) {
    templateId.value = legacyTpl
    await loadModules()
    const mods = String(route.query.modules || '').split(',').map((n) => Number(n)).filter(Boolean)
    const first = mods.find((id) => modules.value.some((m) => m.id === id))
    if (first) {
      moduleId.value = first
      await load()
    }
  }
})
</script>

<style scoped>
.page-title { font-size: 16px; color: #313238; font-weight: 400; padding: 0 20px; height: 50px; line-height: 50px; border-bottom: 1px solid #E7E9EF; margin: 0; }
.page-tips { margin: 0; padding: 10px 20px; font-size: 12px; color: #979BA5; background: #F0F5FF; border-bottom: 1px solid #E7E9EF; }
.toolbar { display: flex; align-items: center; gap: 8px; margin: 12px 0; }
.toolbar .spacer { flex: 1; }
.card-head { display: flex; align-items: center; gap: 10px; }
.diff-card { border-radius: 2px; }
</style>