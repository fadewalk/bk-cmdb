<template>
  <div class="page-card biz-sync-page">
    <h1 class="page-title sr-only">业务同步</h1>
    <p class="page-tips">查看服务实例与所属服务模板之间的差异;支持手动触发同步,保障业务属性与服务模板配置一致</p>

    <div class="toolbar">
      <el-select v-model="bizId" placeholder="选择业务" filterable style="width: 220px" :disabled="!bizStore.bizList.length" @change="loadTemplates">
        <el-option v-for="b in bizStore.bizList" :key="b.bk_biz_id" :label="b.bk_biz_name" :value="b.bk_biz_id" />
      </el-select>
      <el-select v-model="templateId" placeholder="选择服务模板" filterable style="width: 220px" :disabled="!bizId" @change="loadModules">
        <el-option v-for="t in templates" :key="t.id" :label="t.name || t.bk_service_template_name" :value="t.id" />
      </el-select>
      <div class="spacer" />
      <el-button type="primary" :disabled="!moduleIds.length" :loading="syncing" @click="syncModules(moduleIds)">同步全部</el-button>
    </div>

    <!-- 按模块折叠分组(老版 business-synchronous/index.vue 契约) -->
    <div v-if="moduleIds.length" class="module-groups" v-loading="groupsLoading">
      <div v-for="mid in moduleIds" :key="mid" class="module-group">
        <div class="group-head" @click="toggleModule(mid)">
          <i :class="['bk-cmdb-icon icon-cc-triangle group-arrow', { collapsed: !groupMap[mid]?.expanded }]" />
          <span class="topopath">{{ groupMap[mid]?.topoPath || `Module #${mid}` }}</span>
          <el-button class="group-sync" link type="primary" size="small" @click.stop="syncModules([mid])">同步当前模块</el-button>
        </div>
        <div v-show="groupMap[mid]?.expanded" class="group-body" v-loading="groupMap[mid]?.loading">
          <!-- 属性变更 -->
          <div v-if="groupMap[mid]?.propertyDiff?.length" class="diff-section">
            <div class="section-title">属性变更({{ groupMap[mid].propertyDiff.length }})</div>
            <div class="prop-diff-table">
              <div class="prop-head">
                <div class="col">属性同步前</div>
                <div class="col">属性同步后</div>
              </div>
              <div class="prop-body">
                <div class="col">
                  <div v-for="attr in groupMap[mid].propertyDiff" :key="`b-${attr.id}`" class="prop-item">
                    <span class="prop-name">{{ attr.property?.bk_property_name || attr.id }}：</span>
                    <span>{{ displayValue(attr.inst_value) }}</span>
                  </div>
                </div>
                <div class="col">
                  <div v-for="attr in groupMap[mid].propertyDiff" :key="`a-${attr.id}`" class="prop-item">
                    <span class="prop-name">{{ attr.property?.bk_property_name || attr.id }}：</span>
                    <span :class="{ changed: JSON.stringify(attr.inst_value) !== JSON.stringify(attr.template_value) }">{{ displayValue(attr.template_value) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 进程变更(左列进程列表 + 右侧变更内容/涉及实例) -->
          <div v-if="groupMap[mid]?.processDiff?.length" class="process-difference">
            <ul class="process-list">
              <li
                v-for="(process, idx) in groupMap[mid].processDiff"
                :key="idx"
                :class="['process-item', {
                  'is-active': isActiveDiff(mid, process),
                  'is-remove': process.type === 'removed',
                  'show-tips': !process.confirmed
                }]"
                @click="loadProcessDiff(mid, process)"
              >
                <span class="process-name">{{ process.process_template_name }}</span>
                <span class="process-type" :class="process.type">{{ typeLabel(process.type) }}</span>
              </li>
            </ul>
            <div v-if="groupMap[mid].currentDiff" class="change-details">
              <div class="details-block">
                <div class="block-title">变更内容<span v-if="groupMap[mid].currentDiff.type === 'changed'">({{ groupMap[mid].currentDiff.changedProperties.length }})</span></div>
                <div class="info-content">
                  <div v-if="groupMap[mid].currentDiff.type === 'added'" class="process-info">
                    模板中新增进程<span class="info-value">{{ groupMap[mid].currentDiff.process_template_name }}</span>
                  </div>
                  <div v-else-if="groupMap[mid].currentDiff.type === 'removed'" class="process-info">
                    <b class="info-value">{{ groupMap[mid].currentDiff.process_template_name }}</b>从模板中删除
                  </div>
                  <div v-else class="changed-props">
                    <div v-for="(changed, ci) in groupMap[mid].currentDiff.changedProperties" :key="ci" class="info-item">
                      {{ changed.property?.bk_property_name || changed.key }}：
                      <span class="info-value">{{ displayValue(changed.template_property_value?.value ?? changed.template_property_value) }}</span>
                    </div>
                    <span v-if="!groupMap[mid].currentDiff.changedProperties.length" class="muted">无字段变更</span>
                  </div>
                </div>
              </div>
              <div class="details-block">
                <div class="block-title">
                  涉及实例<span v-if="groupMap[mid].currentDiff.serviceInstanceCount !== ''">({{ groupMap[mid].currentDiff.serviceInstanceCount }})</span>
                </div>
                <ul class="instance-list" v-loading="groupMap[mid].currentDiff.instancesLoading">
                  <li
                    v-for="instance in groupMap[mid].currentDiff.serviceInstances"
                    :key="instance.id"
                    class="instance-item"
                    @click="viewInstanceDiff(mid, instance)"
                  >
                    <span class="instance-name">{{ instance.name }}</span>
                    <label :class="['instance-change-type', instance.type]">{{ typeLabel(instance.type) }}</label>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div v-if="!groupMap[mid]?.loading && !groupMap[mid]?.propertyDiff?.length && !groupMap[mid]?.processDiff?.length" class="no-diff">
            暂无差异
          </div>
        </div>
      </div>
    </div>

    <!-- 实例对比详情(老版 676px sideslider) -->
    <el-drawer v-model="instanceSlider.visible" :title="instanceSlider.title" size="676px" :destroy-on-close="true">
      <div v-loading="instanceSlider.loading">
        <el-table v-if="instanceSlider.rows.length" :data="instanceSlider.rows" size="small" border stripe>
          <el-table-column prop="property_name" label="属性名" min-width="140" />
          <el-table-column label="当前值" min-width="180">
            <template #default="{ row }">{{ displayValue(row.property_value) }}</template>
          </el-table-column>
          <el-table-column label="模板值" min-width="180">
            <template #default="{ row }">{{ displayValue(row.template_property_value) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-else-if="!instanceSlider.loading" description="无对比数据" :image-size="70" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useBizStore } from '../../stores/biz'
import {
  searchServiceTemplates, syncServiceInstances, listModulesByServiceTemplate,
  getServiceTemplateDiff, getDifferenceServiceInstances, getServiceInstanceDifferenceDetail,
  getProcessTemplateById, getTopoPath, searchModelAttributes
} from '../../api/cmdb'

const route = useRoute()
const bizStore = useBizStore()

const bizId = ref(bizStore.bizId || null)
const templateId = ref(null)
const templates = ref([])
const moduleIds = ref([])
const groupsLoading = ref(false)
const syncing = ref(false)
const groupMap = reactive({})
const processProps = ref([])

const instanceSlider = reactive({ visible: false, title: '', loading: false, rows: [] })

function typeLabel(type) {
  return { added: '新增', removed: '删除', changed: '变更', others: '变更' }[type] || ''
}
function displayValue(value) {
  if (value === null || value === undefined || value === '') return '--'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
function isActiveDiff(mid, process) {
  const cur = groupMap[mid]?.currentDiff
  return cur && cur.process_template_id === process.process_template_id && cur.process_template_name === process.process_template_name
}

async function loadTemplates() {
  templateId.value = null
  moduleIds.value = []
  if (!bizId.value) return
  try {
    const data = await searchServiceTemplates(bizId.value, { start: 0, limit: 200 })
    templates.value = data?.info || []
  } catch { templates.value = [] }
}

async function loadModules() {
  moduleIds.value = []
  if (!bizId.value || !templateId.value) return
  groupsLoading.value = true
  try {
    const [modData, props] = await Promise.all([
      listModulesByServiceTemplate(bizId.value, templateId.value),
      searchModelAttributes('process').catch(() => [])
    ])
    processProps.value = props || []
    moduleIds.value = (modData?.info || []).map((m) => m.bk_module_id || m.id).filter(Boolean)
    for (const mid of moduleIds.value) {
      groupMap[mid] = {
        topoPath: `Module #${mid}`,
        expanded: false,
        loaded: false,
        loading: false,
        propertyDiff: [],
        processDiff: [],
        currentDiff: null
      }
    }
    // 拓扑路径(老版 find/topopath/biz 契约)
    getTopoPath(bizId.value, {
      topo_nodes: moduleIds.value.map((id) => ({ bk_obj_id: 'module', bk_inst_id: id }))
    }).then(({ nodes } = {}) => {
      for (const node of nodes || []) {
        const mid = node.topo_node?.bk_inst_id
        if (groupMap[mid]) groupMap[mid].topoPath = (node.topo_path || []).slice().reverse().map((p) => p.bk_inst_name).join(' / ')
      }
    }).catch(() => {})
    // 默认展开第 1 个(老版契约)
    if (moduleIds.value.length) {
      const first = moduleIds.value[0]
      groupMap[first].expanded = true
      loadDiffByModule(first)
    }
  } finally {
    groupsLoading.value = false
  }
}

function toggleModule(mid) {
  const group = groupMap[mid]
  group.expanded = !group.expanded
  if (group.expanded && !group.loaded && !group.loading) loadDiffByModule(mid)
}

async function loadDiffByModule(mid) {
  const group = groupMap[mid]
  group.loading = true
  try {
    // 独立后端仅注册 general_difference(老版 find/proc/service_instance/difference 未注册),响应同为 changed/added/removed/attributes
    const difference = await getServiceTemplateDiff({
      bk_module_id: mid,
      bk_biz_id: bizId.value,
      service_template_id: templateId.value
    })
    const processDiff = []
    for (const type of ['changed', 'added', 'removed']) {
      for (const item of difference?.[type] || []) {
        processDiff.push({
          type,
          process_template_id: item.id,
          process_template_name: item.name,
          confirmed: false
        })
      }
    }
    group.processDiff = processDiff
    group.propertyDiff = (difference?.attributes || []).map((attr) => ({
      property: null,
      ...attr
    }))
    group.loaded = true
    // 老版契约:默认自动加载第一个进程的变更内容与涉及实例
    if (processDiff.length && !group.currentDiff) {
      loadProcessDiff(mid, processDiff[0])
    }
  } catch {
    group.loaded = true
  } finally {
    group.loading = false
  }
}

async function loadProcessDiff(mid, process) {
  const group = groupMap[mid]
  group.currentDiff = {
    type: process.type,
    process_template_id: process.process_template_id,
    process_template_name: process.process_template_name,
    changedProperties: [],
    serviceInstanceCount: '',
    serviceInstances: [],
    instancesLoading: false
  }
  if (process.type !== 'removed') {
    // removed 进程模板已被删除(id 变 0),其余类型拉模板详情展示变更字段(老版契约)
    try {
      const res = await getProcessTemplateById(process.process_template_id)
      group.currentDiff.changedProperties = getChangedProperties(res?.property)
    } catch { /* 容忍 */ }
  }
  process.confirmed = true
  loadInstances(mid)
}

function getChangedProperties(property) {
  const changed = []
  if (property) {
    for (const [key, prop] of Object.entries(property)) {
      if (prop && prop.value !== null && prop.value !== undefined && String(prop.value).length) {
        changed.push({
          key,
          property: processProps.value.find((p) => p.bk_property_id === key),
          template_property_value: prop
        })
      }
    }
  }
  return changed
}

function serializeParams(mid) {
  const cur = groupMap[mid]?.currentDiff
  const params = {
    bk_biz_id: bizId.value,
    service_template_id: templateId.value,
    bk_module_id: Number(mid)
  }
  if (cur) {
    params.process_template_id = cur.process_template_id
    if (cur.type === 'removed') params.process_template_name = cur.process_template_name
  }
  return params
}

async function loadInstances(mid) {
  const cur = groupMap[mid]?.currentDiff
  if (!cur) return
  cur.instancesLoading = true
  try {
    const res = await getDifferenceServiceInstances(serializeParams(mid))
    cur.serviceInstances = (res?.service_instances || []).map((instance) => ({
      ...instance,
      type: res?.type || cur.type
    }))
    cur.serviceInstanceCount = res?.total_count ?? cur.serviceInstances.length
  } catch {
    cur.serviceInstances = []
    cur.serviceInstanceCount = ''
  } finally {
    cur.instancesLoading = false
  }
}

async function viewInstanceDiff(mid, instance) {
  instanceSlider.visible = true
  instanceSlider.title = instance.name
  instanceSlider.loading = true
  instanceSlider.rows = []
  try {
    const res = await getServiceInstanceDifferenceDetail({
      ...serializeParams(mid),
      service_instance_id: instance.id
    })
    const type = res?.type
    if (type === 'others' && Array.isArray(res?.module_attribute)) {
      instanceSlider.rows = res.module_attribute.map((attr) => ({
        property_name: '服务分类',
        property_value: attr.property_value,
        template_property_value: attr.template_property_value
      }))
    } else if (Array.isArray(res?.changed_attributes) && res.changed_attributes.length) {
      instanceSlider.rows = res.changed_attributes
    } else if (res?.process && typeof res.process === 'object') {
      instanceSlider.rows = Object.entries(res.process).map(([key, prop]) => ({
        property_name: processProps.value.find((p) => p.bk_property_id === key)?.bk_property_name || key,
        property_value: type === 'removed' ? (prop?.value ?? prop) : null,
        template_property_value: type === 'removed' ? null : (prop?.value ?? prop)
      }))
    }
  } catch { /* 保持空态 */ } finally {
    instanceSlider.loading = false
  }
}

async function syncModules(ids) {
  if (!ids.length) return
  await ElMessageBox.confirm('确定同步所选模块的服务模板差异?', '同步', { type: 'warning' })
  syncing.value = true
  try {
    await syncServiceInstances({
      bk_biz_id: bizId.value,
      service_template_id: templateId.value,
      bk_module_ids: ids
    })
    ElMessage.success('提交同步成功')
    for (const mid of moduleIds.value) {
      if (groupMap[mid]) {
        groupMap[mid].loaded = false
        groupMap[mid].currentDiff = null
        if (groupMap[mid].expanded) loadDiffByModule(mid)
      }
    }
  } catch (e) {
    // http 拦截器已提示
  } finally { syncing.value = false }
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
  if (bizId.value) await loadTemplates()
  // 旧版深链 /business/:bizId/synchronous/module/:template/:modules
  const legacyTpl = Number(route.query.template)
  if (legacyTpl && templates.value.some((t) => t.id === legacyTpl)) {
    templateId.value = legacyTpl
    await loadModules()
  }
})
</script>

<style scoped>
.biz-sync-page { display: flex; flex-direction: column; }
.toolbar { display: flex; align-items: center; gap: 8px; margin: 12px 0; }
.toolbar .spacer { flex: 1; }
.module-groups { display: flex; flex-direction: column; gap: 12px; }
.module-group { background: #fff; border-radius: 2px; padding: 0 20px; }
.group-head {
  display: flex; align-items: center; gap: 8px;
  height: 48px; cursor: pointer; user-select: none;
}
.group-arrow { font-size: 12px; color: #63656E; transition: transform .2s; }
.group-arrow.collapsed { transform: rotate(-90deg); }
.topopath { font-size: 14px; color: #313238; }
.group-sync { margin-left: auto; }
.group-body { padding: 4px 0 20px 20px; }
.diff-section { margin-bottom: 16px; }
.section-title { font-size: 14px; font-weight: bold; color: #313238; margin-bottom: 10px; }
.prop-diff-table { border: 1px solid #DCDEE5; border-radius: 2px; }
.prop-head { display: flex; background: #F0F1F5; font-size: 12px; color: #63656E; }
.prop-head .col { flex: 1; padding: 8px 16px; font-weight: bold; }
.prop-body { display: flex; }
.prop-body .col { flex: 1; padding: 8px 16px; }
.prop-body .col + .col { border-left: 1px solid #DCDEE5; }
.prop-item { display: flex; height: 26px; line-height: 26px; font-size: 12px; color: #63656E; }
.prop-item .prop-name { flex: 0 0 110px; text-align: right; }
.prop-item .changed { color: #FF9C01; }
/* 进程变更:左列列表 + 右侧详情(老版 process-difference 布局) */
.process-difference {
  display: flex;
  border: 1px solid #DCDEE5;
  min-height: 220px;
}
.process-list {
  flex: 0 0 200px;
  margin: 0;
  padding: 0;
  list-style: none;
  border-right: 1px solid #DCDEE5;
  max-height: 340px;
  overflow-y: auto;
}
.process-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 12px;
  font-size: 12px;
  background: #FAFBFD;
  border-bottom: 1px solid #DCDEE5;
  cursor: pointer;
}
.process-item.is-active { background: #fff; }
.process-item.is-active .process-name { font-weight: bold; color: #2DCB56; }
.process-item.is-remove .process-name { text-decoration: line-through; }
.process-item.is-remove.is-active .process-name { color: #FF5656; }
.process-item.show-tips .process-name::after {
  content: "";
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #FF5656;
  margin-left: 4px;
  vertical-align: middle;
}
.process-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.process-type { font-size: 12px; }
.process-type.added { color: #2DCB56; }
.process-type.removed { color: #FF5656; }
.process-type.changed { color: #FF9C01; }
.change-details { flex: 1; padding: 16px 20px; overflow-y: auto; }
.details-block { margin-bottom: 16px; }
.block-title { font-size: 14px; font-weight: bold; color: #313238; margin-bottom: 10px; }
.info-content { display: flex; flex-wrap: wrap; gap: 8px 32px; }
.process-info { font-size: 14px; color: #63656E; }
.info-value { color: #313238; margin: 0 4px; }
.changed-props { display: flex; flex-wrap: wrap; gap: 8px 32px; }
.info-item { width: 240px; font-size: 13px; color: #63656E; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.muted { color: #979BA5; font-size: 12px; }
.instance-list { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
.instance-item {
  display: flex; align-items: center; gap: 8px;
  height: 36px; padding: 0 12px;
  border: 1px solid #DCDEE5; border-radius: 2px;
  font-size: 12px; cursor: pointer;
}
.instance-item:hover { border-color: #3A84FF; }
.instance-name { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.instance-change-type { font-size: 12px; }
.instance-change-type.added { color: #2DCB56; }
.instance-change-type.removed { color: #FF5656; }
.instance-change-type.changed, .instance-change-type.others { color: #FF9C01; }
.no-diff { color: #979BA5; font-size: 12px; padding: 8px 0; }
</style>
