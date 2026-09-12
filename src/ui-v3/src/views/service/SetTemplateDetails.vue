<template>
  <!-- 旧版 set-template/details.vue 复刻:集群模板配置 / 集群模板实例 双 tab,tab 落 query -->
  <div class="details-page">
    <el-tabs v-model="activeTab" class="details-tabs" @tab-change="onTabChange">
      <el-tab-pane name="config">
        <template #label><span>集群模板配置</span></template>
        <div v-loading="loading" class="tab-body">
          <!-- 基础信息:名称悬停出编辑笔,行内保存 -->
          <section class="form-group">
            <div class="group-header" @click="collapse.basic = !collapse.basic">
              <i :class="['bk-cmdb-icon icon-cc-triangle group-arrow', { collapsed: collapse.basic }]" />
              <span class="group-title">基础信息</span>
            </div>
            <div v-show="collapse.basic === false" class="group-body">
              <div class="grid-item">
                <label class="grid-label">模板名称</label>
                <div class="editable-content">
                  <span v-if="nameEditing" class="name-form">
                    <el-input
                      ref="nameInput"
                      v-model.trim="nameDraft"
                      size="small"
                      maxlength="256"
                      placeholder="请输入模板名称"
                      @keyup.enter="saveName"
                      @blur="saveName"
                    />
                  </span>
                  <span v-else class="basic-value">{{ templateName }}</span>
                  <i
                    v-if="!nameEditing"
                    class="bk-cmdb-icon icon-cc-edit-shape property-edit-button"
                    @click="startEditName"
                  />
                </div>
              </div>
            </div>
          </section>

          <!-- 属性设置:逐项查看/编辑/删除(旧版 property-config/details) -->
          <section class="form-group">
            <div class="group-header" @click="collapse.property = !collapse.property">
              <i :class="['bk-cmdb-icon icon-cc-triangle group-arrow', { collapsed: collapse.property }]" />
              <span class="group-title">属性设置</span>
            </div>
            <div v-show="collapse.property === false" class="group-body">
              <template v-if="configList.length">
                <div v-for="item in configList" :key="item.property.id" class="grid-item">
                  <label class="grid-label">{{ item.property.bk_property_name }}</label>
                  <div class="editable-content">
                    <template v-if="editProperty && editProperty.id === item.property.id">
                      <el-input v-model="editValue" size="small" class="prop-form" @keyup.enter="saveProperty(item.property)" />
                      <el-button link type="primary" @click="saveProperty(item.property)">保存</el-button>
                      <el-button link @click="cancelEditProperty">取消</el-button>
                    </template>
                    <template v-else>
                      <span class="basic-value">{{ item.value ?? '--' }}</span>
                      <i class="bk-cmdb-icon icon-cc-edit-shape property-edit-button" @click="startEditProperty(item)" />
                      <el-popconfirm title="确认删除该字段设置？" confirm-button-text="删除" cancel-button-text="取消" @confirm="delProperty(item.property)">
                        <template #reference>
                          <i class="bk-cmdb-icon icon-cc-tips-close property-del-button" />
                        </template>
                      </el-popconfirm>
                    </template>
                  </div>
                </div>
              </template>
              <div v-else-if="!loading" class="property-config-empty">
                <i class="bk-cmdb-icon icon-cc-tips empty-icon" />
                <span>当前模板未配置，<el-button link type="primary" @click="goEdit">立即配置</el-button></span>
              </div>
            </div>
          </section>

          <!-- 集群拓扑:view 态只读树 -->
          <section class="form-group">
            <div class="group-header" @click="collapse.topo = !collapse.topo">
              <i :class="['bk-cmdb-icon icon-cc-triangle group-arrow', { collapsed: collapse.topo }]" />
              <span class="group-title">集群拓扑</span>
            </div>
            <div v-show="collapse.topo === false" class="group-body">
              <div class="topo-box">
                <div class="topo-root">
                  <i class="bk-cmdb-icon icon-cc-set topo-root-icon" />
                  <span class="topo-root-name">{{ templateName }}</span>
                </div>
                <div class="topo-children">
                  <div v-for="tpl in boundTemplates" :key="tpl.id" class="topo-child">
                    <i class="bk-cmdb-icon icon-cc-service-template topo-child-icon" />
                    <span class="topo-child-name">{{ tpl.name }}（#{{ tpl.id }}）</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- 底部:编辑按钮(旧版 sticky footer) -->
          <div class="details-footer">
            <el-button type="primary" @click="goEdit">编辑</el-button>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane name="instance">
        <template #label>
          <span class="tab-label-wrap"><i v-if="needSync" class="tab-dot" />集群模板实例</span>
        </template>
        <div class="tab-body instance-body">
          <div class="table-toolbar">
            <el-button type="primary" :disabled="!checkedIds.length" @click="goBatchSync">批量同步</el-button>
            <div class="spacer" />
            <el-select v-model="statusFilter" style="width: 160px; margin-right: 10px" @change="reload(1)">
              <el-option v-for="o in statusFilters" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
            <el-input
              v-model="filterName"
              placeholder="请输入集群名称搜索"
              clearable
              style="width: 210px"
              suffix-icon="Search"
              @keyup.enter="reload(1)"
              @clear="reload(1)"
            />
            <el-tooltip content="同步历史" placement="top">
              <el-button class="history-btn" :icon="'Clock'" @click="goHistory" />
            </el-tooltip>
          </div>
          <el-table
            :data="displayList"
            v-loading="instanceLoading"
            row-class-name="clickable-row"
            @selection-change="(rows) => (checkedIds = rows.map((r) => r.bk_set_id))"
          >
            <el-table-column type="selection" width="50" :selectable="(row) => !isSyncDisabled(row.status)" />
            <el-table-column label="集群名称" prop="bk_set_name" min-width="160" show-overflow-tooltip />
            <el-table-column label="拓扑路径" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <el-button link type="primary" @click="goTopo(row)">{{ topoPath(row) }}</el-button>
              </template>
            </el-table-column>
            <el-table-column label="主机数量" prop="host_count" width="100" />
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <span v-if="isSyncing(row.status)" class="sync-text">同步中</span>
                <span v-else-if="row.status === 'need_sync'" class="sync-text need-sync">待同步</span>
                <span v-else-if="row.status === 'finished'" class="sync-text finished">已同步</span>
                <el-tooltip v-else-if="row.status === 'failure'" :disabled="!row.fail_tips" :content="row.fail_tips" placement="right">
                  <span class="sync-text failure">同步失败</span>
                </el-tooltip>
                <span v-else>--</span>
              </template>
            </el-table-column>
            <el-table-column label="上次同步时间" width="170">
              <template #default="{ row }">{{ row.last_time ? formatTime(row.last_time) : '--' }}</template>
            </el-table-column>
            <el-table-column label="同步人" width="110">
              <template #default="{ row }">{{ row.creator || '--' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-tooltip
                  :content="isSyncing(row.status) ? '实例正在同步，无法操作' : '已是最新内容，无需同步'"
                  :disabled="!isSyncDisabled(row.status)"
                  placement="top"
                >
                  <span>
                    <el-button v-if="row.status === 'failure'" link type="primary" :disabled="isSyncDisabled(row.status)" @click="retrySync(row)">重试</el-button>
                    <el-button v-else link type="primary" :disabled="isSyncDisabled(row.status)" @click="goSync(row)">去同步</el-button>
                  </span>
                </el-tooltip>
                <el-tooltip content="目标包含主机, 不允许删除" :disabled="!row.host_count" placement="top">
                  <span>
                    <el-button link type="danger" :disabled="!!row.host_count" @click="removeSet(row)">删除</el-button>
                  </span>
                </el-tooltip>
              </template>
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
            @current-change="reload()"
            @size-change="(s) => { pagination.limit = s; reload(1) }"
            class="instance-pagination"
          />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useBizStore } from '../../stores/biz'
import {
  getSetTemplateServices, searchSetTemplateStatus, syncSetTemplateToInstances,
  searchSetTemplateSets, searchModelAttributes, http
} from '../../api/cmdb'
import { formatTime } from '../../utils/format-time'

const route = useRoute()
const router = useRouter()
const bizStore = useBizStore()
const bizId = computed(() => Number(route.params.bizId) || bizStore.bizId)
const templateId = computed(() => Number(route.params.templateId))

const activeTab = ref(route.query.tab === 'instance' ? 'instance' : 'config')
function onTabChange(v) {
  router.replace({ query: { ...route.query, tab: v } })
}
// 切到实例 tab 时拉数据并启动轮询,切回配置 tab 停止
watch(activeTab, (v) => {
  if (v === 'instance') {
    if (!list.value.length && !instanceLoading.value) reloadPage()
    startPolling()
  } else {
    stopPolling()
  }
})

// ---------- 公共:待同步红点 ----------
const needSync = ref(false)
async function refreshNeedSync() {
  const data = await searchSetTemplateStatus(bizId.value, { set_template_ids: [templateId.value] }).catch(() => [])
  needSync.value = !!(data || []).some((s) => s.need_sync)
}

// ---------- 配置 tab ----------
const loading = ref(true)
const collapse = reactive({ basic: false, property: false, topo: false })
const templateName = ref('')
const setAttrs = ref([])
const attributes = ref([])
const boundTemplates = ref([])

const configList = computed(() => attributes.value
  .map((a) => {
    const property = setAttrs.value.find((p) => p.id === a.bk_attribute_id)
    return property ? { property, value: a.bk_property_value } : null
  })
  .filter(Boolean))

// 名称行内编辑(旧版:悬停出编辑笔,回车/失焦保存)
const nameInput = ref(null)
const nameEditing = ref(false)
const nameDraft = ref('')
function startEditName() {
  nameDraft.value = templateName.value
  nameEditing.value = true
  setTimeout(() => nameInput.value?.focus?.(), 50)
}
async function saveName() {
  if (!nameEditing.value) return
  nameEditing.value = false
  if (!nameDraft.value || nameDraft.value === templateName.value) return
  await http.put(`/update/topo/set_template/${templateId.value}/bk_biz_id/${bizId.value}`, { name: nameDraft.value })
  templateName.value = nameDraft.value
  refreshNeedSync()
}

// 属性逐项编辑/删除
const editProperty = ref(null)
const editValue = ref('')
function startEditProperty(item) {
  editProperty.value = item.property
  editValue.value = item.value ?? ''
}
function cancelEditProperty() {
  editProperty.value = null
  editValue.value = ''
}
async function saveProperty(property) {
  let value = editValue.value
  if (['int', 'float'].includes(property.bk_property_type)) value = Number(value)
  await http.put('/update/topo/set_template/attribute', {
    id: templateId.value,
    bk_biz_id: bizId.value,
    attributes: [{ bk_attribute_id: property.id, bk_property_value: value }]
  })
  const row = attributes.value.find((a) => a.bk_attribute_id === property.id)
  if (row) row.bk_property_value = value
  cancelEditProperty()
  ElMessage.success('成功更新模板，您可以通过同步功能更新服务实例')
  refreshNeedSync()
}
async function delProperty(property) {
  await http.delete('/delete/topo/set_template/attribute', {
    data: { id: templateId.value, bk_biz_id: bizId.value, bk_attribute_ids: [property.id] }
  })
  attributes.value = attributes.value.filter((a) => a.bk_attribute_id !== property.id)
  ElMessage.success('成功更新模板')
  refreshNeedSync()
}

function goEdit() {
  router.push(`/business/${bizId.value}/set/template/edit/${templateId.value}`)
}

// ---------- 实例 tab ----------
const instanceLoading = ref(false)
const list = ref([])
const listWithTopo = ref([])
const failInfoMap = ref({})
const checkedIds = ref([])
const statusFilter = ref('all')
const filterName = ref('')
const pagination = reactive({ current: 1, limit: 20, count: 0 })
let pollTimer = null

const statusFilters = [
  { id: 'all', name: '全部' },
  { id: 'need_sync', name: '待同步' },
  { id: 'new,waiting,executing', name: '同步中' },
  { id: 'failure', name: '同步失败' },
  { id: 'finished', name: '已同步' }
]
const isSyncing = (status) => ['new', 'waiting', 'executing'].includes(status)
const isSyncDisabled = (status) => isSyncing(status) || status === 'finished'

const displayList = computed(() => list.value.map((item) => {
  const setInfo = listWithTopo.value.find((s) => s.bk_set_id === item.bk_set_id)
  const failInfo = failInfoMap.value[item.bk_set_id]
  let failTips = ''
  if (failInfo && failInfo.status === 500) {
    failTips = (failInfo.detail || [])
      .filter((m) => m.status === 500)
      .map((m) => {
        const name = m.data?.module_diff?.bk_module_name
        const msg = m.response?.bk_error_msg
        return name && msg ? `${name} : ${msg}` : ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return {
    ...item,
    bk_set_name: setInfo?.bk_set_name ?? item.bk_set_name,
    topo_path: setInfo?.topo_path || [],
    host_count: setInfo?.host_count ?? 0,
    fail_tips: failTips
  }
}))

function topoPath(row) {
  return [...(row.topo_path || [])].reverse().map((p) => p.bk_inst_name).join(' / ') || '--'
}

async function reloadPage() {
  instanceLoading.value = true
  try {
    const params = {
      set_template_id: templateId.value,
      page: { start: pagination.limit * (pagination.current - 1), limit: pagination.limit, sort: 'last_time' }
    }
    if (statusFilter.value !== 'all') params.status = statusFilter.value.split(',')
    if (filterName.value.trim()) params.search = filterName.value.trim()
    const data = await http.post(`/findmany/topo/set_template_sync_status/bk_biz_id/${bizId.value}`, params)
    pagination.count = data?.count || 0
    // 旧版契约:bk_inst_id 即集群实例 id
    list.value = (data?.info || []).map((item) => ({ ...item, bk_set_id: item.bk_inst_id }))
    if (list.value.length) {
      loadTopo()
      loadFailInfo()
    } else {
      listWithTopo.value = []
      failInfoMap.value = {}
    }
  } finally {
    instanceLoading.value = false
  }
  refreshNeedSync()
}
function reload(page) {
  if (page) pagination.current = page
  reloadPage()
}

async function loadTopo() {
  try {
    const data = await searchSetTemplateSets(bizId.value, templateId.value, {
      limit: { start: 0, limit: pagination.limit },
      bk_set_ids: list.value.map((i) => i.bk_set_id)
    })
    listWithTopo.value = data?.info || []
  } catch { listWithTopo.value = [] }
}

async function loadFailInfo() {
  try {
    const data = await http.post(`/findmany/topo/set_template/${templateId.value}/bk_biz_id/${bizId.value}/instances_sync_status`, {
      bk_set_ids: list.value.map((i) => i.bk_set_id)
    })
    failInfoMap.value = data || {}
  } catch { failInfoMap.value = {} }
}

// 旧版 Polling:存在同步中实例时每 5s 刷新状态
function startPolling() {
  stopPolling()
  pollTimer = setInterval(() => {
    if (list.value.some((i) => isSyncing(i.status))) reloadPage()
  }, 5000)
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

function goBatchSync() {
  router.push(`/business/${bizId.value}/set/sync/${templateId.value}?sets=${checkedIds.value.join(',')}`)
}
function goSync(row) {
  router.push(`/business/${bizId.value}/set/sync/${templateId.value}?sets=${row.bk_set_id}`)
}
function goTopo(row) {
  router.push(`/business/${bizId.value}/index?node=set-${row.bk_set_id}`)
}
function goHistory() {
  router.push(`/business/${bizId.value}/set/instance/history/${templateId.value}`)
}
async function retrySync(row) {
  await syncSetTemplateToInstances(bizId.value, templateId.value, { bk_set_ids: [row.bk_set_id] })
  row.status = 'executing'
  ElMessage.success('提交同步成功，请等待执行完成')
  refreshNeedSync()
}
async function removeSet(row) {
  await ElMessageBox.confirm(`确定删除 ${row.bk_set_name}?`, '确认删除', { type: 'warning' })
  await http.delete(`/set/${bizId.value}/${row.bk_set_id}`)
  ElMessage.success('删除成功')
  reloadPage()
}

// ---------- 初始化 ----------
onMounted(async () => {
  await bizStore.ensureLoaded()
  try {
    const [allInfo, setProps, services] = await Promise.all([
      http.post('/find/topo/set_template/all_info', { bk_biz_id: bizId.value, id: templateId.value }),
      searchModelAttributes('set').catch(() => []),
      getSetTemplateServices(bizId.value, templateId.value).catch(() => [])
    ])
    templateName.value = allInfo?.name || ''
    setAttrs.value = setProps || []
    attributes.value = allInfo?.attributes || []
    boundTemplates.value = services || []
  } finally {
    loading.value = false
  }
  refreshNeedSync()
  if (activeTab.value === 'instance') {
    reloadPage()
    startPolling()
  }
})
onBeforeUnmount(stopPolling)
</script>

<style scoped>
.details-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #F5F7FA;
  overflow-y: auto;
}
.details-tabs {
  background: #fff;
  padding: 0 20px;
}
.tab-label-wrap {
  position: relative;
  display: inline-block;
}
.tab-dot {
  position: absolute;
  top: 2px;
  right: -10px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #EA3636;
}
.tab-body {
  padding: 15px 0 20px;
}
.instance-body {
  padding: 0 0 20px;
}
.form-group {
  background: #fff;
  border-radius: 2px;
  margin-bottom: 16px;
  padding: 0 24px 24px;
}
.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  cursor: pointer;
  user-select: none;
}
.group-arrow {
  font-size: 12px;
  color: #63656E;
  transition: transform .2s;
}
.group-arrow.collapsed {
  transform: rotate(-90deg);
}
.group-title {
  font-size: 14px;
  font-weight: 400;
  color: #313238;
}
.group-body {
  padding: 4px 0 0 24px;
}
.grid-item {
  display: flex;
  align-items: flex-start;
  max-width: 780px;
  margin-bottom: 18px;
}
.grid-label {
  flex: 0 0 160px;
  font-size: 14px;
  color: #63656E;
  line-height: 32px;
}
.editable-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.basic-value {
  font-size: 14px;
  color: #313238;
  line-height: 32px;
}
.name-form {
  width: 300px;
}
.prop-form {
  width: 260px;
}
.property-edit-button,
.property-del-button {
  display: none;
  font-size: 14px;
  color: #979BA5;
  cursor: pointer;
}
.property-del-button {
  font-size: 12px;
}
.editable-content:hover .property-edit-button,
.editable-content:hover .property-del-button {
  display: inline-block;
}
.property-edit-button:hover,
.property-del-button:hover {
  color: #3A84FF;
}
.property-config-empty {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #63656E;
}
.empty-icon {
  font-size: 14px;
  color: #979BA5;
}
.topo-box {
  max-width: 900px;
  padding: 20px 24px 24px;
  border: 1px dashed #C4C6CC;
  border-radius: 2px;
  background: #fff;
}
.topo-root {
  display: flex;
  align-items: center;
  gap: 8px;
}
.topo-root-icon {
  flex: 0 0 24px;
  height: 24px;
  line-height: 24px;
  text-align: center;
  font-size: 14px;
  color: #fff;
  background: #3A84FF;
  border-radius: 50%;
}
.topo-root-name {
  font-size: 14px;
  color: #313238;
}
.topo-children {
  margin: 10px 0 0 30px;
  padding-left: 14px;
  border-left: 1px solid #DCDEE5;
}
.topo-child {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  position: relative;
}
.topo-child::before {
  content: "";
  position: absolute;
  left: -14px;
  top: 50%;
  width: 10px;
  height: 1px;
  background: #DCDEE5;
}
.topo-child-icon {
  font-size: 14px;
  color: #3A84FF;
}
.topo-child-name {
  font-size: 14px;
  color: #313238;
}
.details-footer {
  display: flex;
  align-items: center;
  height: 52px;
  padding: 0 20px;
  background: #fff;
  border-top: 1px solid #DCDEE5;
  margin: 8px -20px 0;
}
.details-footer .el-button {
  min-width: 86px;
}
.table-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 14px;
}
.table-toolbar .spacer {
  flex: 1;
}
.history-btn {
  margin-left: 10px;
}
.sync-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sync-text.need-sync::before,
.sync-text.finished::before,
.sync-text.failure::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.sync-text.need-sync::before {
  background: #FF9C01;
}
.sync-text.finished::before {
  background: #2DCB56;
}
.sync-text.failure::before {
  background: #EA3636;
}
.instance-pagination {
  margin-top: 14px;
  justify-content: flex-end;
}
</style>
