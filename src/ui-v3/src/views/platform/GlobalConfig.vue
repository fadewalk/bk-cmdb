<template>
  <div class="page-card global-config" v-loading="loading">
    <div class="box-tabs">
      <button
        v-for="t in tabs"
        :key="t.name"
        :class="['box-tab', { active: tab === t.name }]"
        @click="switchTab(t.name)"
      >{{ t.label }}</button>
    </div>

    <!-- 业务通用 -->
    <template v-if="tab === 'general'">
      <div class="config-container">
        <el-form label-width="150px" class="config-form">
          <el-form-item required label="业务快照名称">
            <el-select v-model="generalForm.snapshotBizId" filterable style="width: 100%" placeholder="请选择业务">
              <el-option
                v-for="b in bizList"
                :key="b.bk_biz_id"
                :label="`[${b.bk_biz_id}] ${b.bk_biz_name}`"
                :value="b.bk_biz_id"
              />
            </el-select>
            <div v-if="generalForm.snapshotBizId !== origin.snapshotBizId" class="field-tip danger">
              业务快照名称切换后,主机快照将采集新选业务下的主机数据
            </div>
          </el-form-item>
          <el-form-item required label="拓扑最大可建层级">
            <el-input v-model.number="generalForm.maxBizTopoLevel" class="topo-level-input" placeholder="请输入 3-10">
              <template #append>层</template>
            </el-input>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveGeneral">保存</el-button>
            <el-button @click="resetGeneral">重置</el-button>
          </el-form-item>
        </el-form>
      </div>
    </template>

    <!-- 业务空闲机池 -->
    <template v-if="tab === 'idle'">
      <div class="config-container">
        <el-form label-width="150px" class="config-form" v-loading="idleSaving">
          <!-- 集群 -->
          <el-form-item required label="集群">
            <div class="module-row">
              <el-input v-model="idleForm.setKey" disabled class="key-input" />
              <el-input v-model="idleForm.setName" class="name-input" placeholder="请输入集群名称" />
              <template v-if="rowEditing.set">
                <el-button link type="primary" size="small" @click="confirmIdleSet"><el-icon><Check /></el-icon></el-button>
                <el-button link size="small" @click="cancelRow('set')"><el-icon><Close /></el-icon></el-button>
              </template>
              <el-button v-else link size="small" class="edit-icon" @click="rowEditing.set = true">
                <el-icon><Edit /></el-icon>
              </el-button>
            </div>
          </el-form-item>

          <!-- 内置模块 idle/fault/recycle -->
          <el-form-item
            v-for="(m, idx) in builtinList"
            :key="m.key"
            required
            :label="idx === 0 ? '模块' : ''"
          >
            <div class="module-row indent">
              <span class="indent-line" />
              <el-input v-model="m.key" disabled class="key-input" />
              <el-input v-model="idleForm.builtin[m.key]" class="name-input" placeholder="请输入模块名称" />
              <template v-if="rowEditing[m.key]">
                <el-button link type="primary" size="small" @click="confirmBuiltinModule(m.key)"><el-icon><Check /></el-icon></el-button>
                <el-button link size="small" @click="cancelRow(m.key)"><el-icon><Close /></el-icon></el-button>
              </template>
              <el-button v-else link size="small" class="edit-icon" @click="rowEditing[m.key] = true">
                <el-icon><Edit /></el-icon>
              </el-button>
            </div>
          </el-form-item>

          <!-- 用户自定义模块 -->
          <el-form-item v-for="um in idleForm.userModules" :key="um.uid" :label="''">
            <div class="module-row indent">
              <span class="indent-line" />
              <el-input v-model="um.editKey" class="key-input" placeholder="模块 ID(英文/数字)" :disabled="!um.isNew" />
              <el-input v-model="um.editName" class="name-input" placeholder="请输入模块名称" />
              <template v-if="um.editing">
                <el-button link type="primary" size="small" @click="confirmUserModule(um)"><el-icon><Check /></el-icon></el-button>
                <el-button link size="small" @click="cancelUserModule(um)"><el-icon><Close /></el-icon></el-button>
              </template>
              <template v-else>
                <el-button link size="small" class="edit-icon" @click="um.editing = true"><el-icon><Edit /></el-icon></el-button>
                <el-button link size="small" type="danger" class="edit-icon" @click="removeUserModule(um)"><el-icon><Delete /></el-icon></el-button>
              </template>
            </div>
          </el-form-item>

          <el-form-item>
            <el-button text type="primary" :icon="'Plus'" @click="addUserModule">添加模块</el-button>
          </el-form-item>
        </el-form>
      </div>
    </template>

    <!-- ID生成器 -->
    <template v-if="tab === 'id'">
      <div class="config-container id-gen">
        <!-- 顶部蓝色提示条(对齐老版 ID生成器提示语) -->
        <div class="idgen-tips">
          <el-icon class="tips-icon"><InfoFilled /></el-icon>
          <div class="tips-body">
            <p>ID生成器功能，用于将不同的CMDB数据，同步集中到同一个CMDB。ID增长规则如下所示：</p>
            <p>1.修改模型的起始ID后，起始ID将改变为新ID，下一个ID为起始ID+ID自增步长</p>
            <p>2.ID自增步长需要大于CMDB的个数，如果ID自增步长小于CMDB个数，则数据的ID会冲突</p>
            <p>注意：当前页面展示的是现网生效配置，修改配置后需要重启coreservice服务才会真实生效</p>
          </div>
        </div>

        <el-collapse v-model="idOpenCollapse" class="idgen-collapse">
          <el-collapse-item name="sync">
            <template #title><span class="collapse-title">同步设置</span></template>
            <el-form label-width="150px">
              <el-form-item required>
                <template #label>
                  <el-tooltip content="开启后业务拓扑数据将同步至消息队列,用于多 CMDB 数据集中" placement="bottom">
                    <span class="label-tooltip">允许数据同步</span>
                  </el-tooltip>
                </template>
                <div v-if="!idEditing" class="view-value">当前设置{{ idForm.enabled ? '允许同步' : '不允许同步' }}</div>
                <el-radio-group v-else v-model="idForm.enabled">
                  <el-radio :value="false">不允许同步</el-radio>
                  <el-radio :value="true">允许同步</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-form>
          </el-collapse-item>
          <el-collapse-item name="step">
            <template #title><span class="collapse-title">ID步长配置</span></template>
            <el-form label-width="150px">
              <el-form-item required label="ID自增步长">
                <div v-if="!idEditing" class="view-value">{{ idForm.step }}</div>
                <el-input-number v-else v-model="idForm.step" :min="1" :max="20" :step="1" step-strictly controls-position="right" style="width: 260px" />
              </el-form-item>
            </el-form>
          </el-collapse-item>
          <el-collapse-item name="init">
            <template #title><span class="collapse-title">起始ID配置</span></template>
            <div class="init-grid">
              <div v-for="p in Object.keys(idForm.currentId)" :key="p" class="init-item">
                <span class="init-label"><i class="req">*</i>{{ modelLabel(p) }}</span>
                <div class="init-field">
                  <div v-if="!idEditing" class="view-value">{{ idForm.currentId[p] }}</div>
                  <template v-else>
                    <el-input-number
                      v-model="idForm.initId[p]"
                      :min="idForm.currentId[p]"
                      :max="idForm.currentId[p] + 10000"
                      controls-position="right"
                      style="width: 100%"
                    />
                    <div class="field-tip">当前ID已使用到{{ idForm.currentId[p] }}</div>
                  </template>
                </div>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>

        <div class="footer">
          <el-button v-if="!idEditing" type="primary" @click="startIdEdit">编辑</el-button>
          <template v-else>
            <el-button type="primary" :disabled="!idChanged" :loading="saving" @click="submitId">提交</el-button>
            <el-button @click="cancelIdEdit">取消</el-button>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
// 全局配置:与老版 global-config 三 tab 对齐,接口走真实后端(字段为 snake_case)
// - GET  /admin/find/system_config/platform_setting/current   拉取配置
// - PUT  /admin/update/system_config/platform_setting          更新(backend/id_generator)
// - POST /topo/update/biz/idle_set                             空闲机池集群/模块 更新与创建
// - POST /topo/delete/biz/extra_moudle                         删除用户自定义空闲机模块
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Close, Edit, Delete, InfoFilled } from '@element-plus/icons-vue'
import { http, searchBusiness } from '../../api/cmdb'

const route = useRoute()
const router = useRouter()

const tab = ref('general')
const tabs = [
  { name: 'general', label: '业务通用' },
  { name: 'idle', label: '业务空闲机池' },
  { name: 'id', label: 'ID生成器' }
]
// 旧版 tab query 名 → 新版名(兼容旧书签 ?tab=id-generate 等)
const LEGACY_TAB = { 'business-general-config': 'general', 'idle-pool-config': 'idle', 'id-generate': 'id' }

// ---------- 未保存变更检测(对齐老版 hasChange + before-toggle/leave-confirm) ----------
function generalDirty() {
  return generalForm.snapshotBizId !== origin.snapshotBizId ||
    Number(generalForm.maxBizTopoLevel) !== Number(origin.maxBizTopoLevel)
}
function idleSnap() {
  return JSON.stringify({
    setName: idleForm.setName,
    builtin: idleForm.builtin,
    userModules: idleForm.userModules.map((m) => [m.moduleKey, m.moduleName])
  })
}
let idleOriginSnap = ''
function idleDirty() {
  const editing = Object.values(rowEditing).some(Boolean) || idleForm.userModules.some((m) => m.editing)
  return editing || idleSnap() !== idleOriginSnap
}
function anyDirty() {
  return generalDirty() || idleDirty() || (idEditing.value && idChanged.value)
}
function confirmLeave(next) {
  ElMessageBox.confirm('离开将会导致未保存信息丢失', '确认离开当前页？', {
    type: 'warning', confirmButtonText: '离开', cancelButtonText: '取消'
  }).then(() => next()).catch(() => {})
}

async function switchTab(name) {
  if (tab.value === name) return
  if (anyDirty()) {
    confirmLeave(() => {
      tab.value = name
      onTabChange()
    })
    return
  }
  tab.value = name
  onTabChange()
}

onBeforeRouteLeave((to, from, next) => {
  if (!anyDirty()) { next(); return }
  confirmLeave(() => next())
})
const loading = ref(false)
const saving = ref(false)
const idleSaving = ref(false)
const bizList = ref([])
// 后端 PUT /admin/update/system_config/platform_setting 按完整配置解码并全量校验,
// 局部提交会被 validation_rules 等零值字段卡住,必须"读全量 → 改 → 交全量"(对齐老版)
const fullConfig = ref(null)

const MODEL_NAMES = {
  biz: '业务', host: '主机', inst_asst: '实例关联', module: '模块',
  object_instance: '模型实例', process: '进程', service_instance: '服务实例', set: '集群'
}
function modelLabel(p) { return MODEL_NAMES[p] || p }

// ---------- 业务通用 ----------
const generalForm = reactive({ snapshotBizId: null, maxBizTopoLevel: 7 })
const origin = reactive({ snapshotBizId: null, maxBizTopoLevel: 7 })

// ---------- 空闲机池 ----------
const BUILTIN = ['idle', 'fault', 'recycle']
const BUILTIN_NAMES = { idle: '空闲机', fault: '故障机', recycle: '待回收' }
const builtinList = BUILTIN.map((k) => ({ key: k }))
const idleForm = reactive({
  setKey: 'set',
  setName: '',
  builtin: { idle: '', fault: '', recycle: '' },
  userModules: [] // { uid, moduleKey, moduleName, isNew, editing, editKey, editName }
})
const rowEditing = reactive({ set: false })
let uidSeq = 1

// ---------- ID 生成器 ----------
const idEditing = ref(false)
const idOpenCollapse = ref(['sync', 'step', 'init'])
const idForm = reactive({ enabled: false, step: 1, initId: {}, currentId: {} })
const idOrigin = ref('')
const idChanged = computed(() => JSON.stringify({
  enabled: idForm.enabled, step: idForm.step, initId: idForm.initId, currentId: idForm.currentId
}) !== idOrigin.value)

function snapshotConfig(config) {
  // backend(snake_case)
  generalForm.snapshotBizId = config.backend?.snapshot_biz_id ?? null
  generalForm.maxBizTopoLevel = config.backend?.max_biz_topo_level || 7
  origin.snapshotBizId = generalForm.snapshotBizId
  origin.maxBizTopoLevel = generalForm.maxBizTopoLevel

  // set + idle_pool
  idleForm.setKey = 'set'
  idleForm.setName = config.set || '空闲机池'
  const pool = config.idle_pool || {}
  for (const k of BUILTIN) idleForm.builtin[k] = pool[k] || BUILTIN_NAMES[k]
  const userModules = pool.user_modules || []
  idleForm.userModules = (Array.isArray(userModules) ? userModules : Object.values(userModules)).map((m) => ({
    uid: uidSeq++,
    moduleKey: m.module_key || m.moduleKey,
    moduleName: m.module_name || m.moduleName,
    isNew: false,
    editing: false,
    editKey: m.module_key || m.moduleKey,
    editName: m.module_name || m.moduleName
  }))

  // id_generator(只有 current_id,init_id 编辑时以 current_id 为基准)
  const gen = config.id_generator || {}
  idForm.enabled = !!gen.enabled
  idForm.step = gen.step || 1
  const currentId = {}, initId = {}
  for (const [k, v] of Object.entries(gen.current_id || {})) { currentId[k] = v; initId[k] = v }
  for (const [k, v] of Object.entries(gen.init_id || {})) initId[k] = v
  idForm.currentId = currentId
  idForm.initId = initId
  idleOriginSnap = idleSnap()
  syncIdOrigin()
}
function syncIdOrigin() {
  idOrigin.value = JSON.stringify({
    enabled: idForm.enabled, step: idForm.step, initId: idForm.initId, currentId: idForm.currentId
  })
}

async function loadConfig() {
  loading.value = true
  try {
    const res = await http.get('/admin/find/system_config/platform_setting/current')
    const config = res?.data || res || {}
    fullConfig.value = config
    snapshotConfig(config)
  } catch (e) { /* 独立模式异常时保留默认 */ } finally {
    loading.value = false
  }
}

async function saveGeneral() {
  if (generalForm.snapshotBizId == null) { ElMessage.warning('请选择业务'); return }
  const level = Number(generalForm.maxBizTopoLevel)
  if (!level || level < 3 || level > 10 || !Number.isInteger(level)) {
    ElMessage.warning('拓扑最大可建层级需为 3-10 的整数'); return
  }
  saving.value = true
  try {
    const payload = { ...(fullConfig.value || {}) }
    payload.backend = {
      ...(payload.backend || {}),
      max_biz_topo_level: level,
      snapshot_biz_id: generalForm.snapshotBizId
    }
    await http.put('/admin/update/system_config/platform_setting', payload)
    ElMessage.success('保存成功')
    await loadConfig()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}
function resetGeneral() {
  generalForm.snapshotBizId = origin.snapshotBizId
  generalForm.maxBizTopoLevel = origin.maxBizTopoLevel
}

// ---------- 空闲机池 ----------
function cancelRow(key) {
  rowEditing[key] = false
  loadConfig()
}
async function confirmIdleSet() {
  if (!idleForm.setName.trim()) { ElMessage.warning('请输入集群名称'); return }
  idleSaving.value = true
  try {
    await http.post('/topo/update/biz/idle_set', {
      type: 'set',
      set: { set_key: idleForm.setKey, set_name: idleForm.setName.trim() }
    })
    ElMessage.success('保存成功')
    rowEditing.set = false
    await loadConfig()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { idleSaving.value = false }
}
async function confirmBuiltinModule(key) {
  const name = (idleForm.builtin[key] || '').trim()
  if (!name) { ElMessage.warning('请输入模块名称'); return }
  idleSaving.value = true
  try {
    await http.post('/topo/update/biz/idle_set', {
      type: 'module',
      module: { module_key: key, module_name: name }
    })
    ElMessage.success('保存成功')
    rowEditing[key] = false
    await loadConfig()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { idleSaving.value = false }
}
function addUserModule() {
  idleForm.userModules.push({ uid: uidSeq++, moduleKey: '', moduleName: '', isNew: true, editing: true, editKey: '', editName: '' })
}
function cancelUserModule(um) {
  if (um.isNew) idleForm.userModules = idleForm.userModules.filter((x) => x !== um)
  else { um.editing = false; um.editKey = um.moduleKey; um.editName = um.moduleName }
}
async function confirmUserModule(um) {
  const key = (um.editKey || '').trim()
  const name = (um.editName || '').trim()
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) { ElMessage.warning('模块 ID 需为英文/数字'); return }
  if (!name) { ElMessage.warning('请输入模块名称'); return }
  idleSaving.value = true
  try {
    await http.post('/topo/update/biz/idle_set', {
      type: 'module',
      module: { module_key: key, module_name: name }
    })
    ElMessage.success('保存成功')
    await loadConfig()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { idleSaving.value = false }
}
async function removeUserModule(um) {
  try { await ElMessageBox.confirm(`确定删除模块「${um.moduleName}」?`, '删除确认', { type: 'warning' }) } catch { return }
  idleSaving.value = true
  try {
    await http.post('/topo/delete/biz/extra_moudle', {
      module_key: um.moduleKey,
      module_name: um.moduleName
    })
    ElMessage.success('已删除')
    await loadConfig()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  } finally { idleSaving.value = false }
}

// ---------- ID 生成器 ----------
function startIdEdit() {
  // init_id 以 current_id 为基准进入编辑
  for (const k of Object.keys(idForm.currentId)) {
    if (idForm.initId[k] === undefined) idForm.initId[k] = idForm.currentId[k]
  }
  idEditing.value = true
}
function cancelIdEdit() {
  idEditing.value = false
  loadConfig()
}
async function submitId() {
  try {
    await ElMessageBox.confirm('提交后新的起始ID将立即生效,确认提交?', '确认提交', { type: 'warning' })
  } catch { return }
  // 仅提交变化的 init_id(对齐老版 changeInitId 逻辑)
  const changeInitId = {}
  let hasChange = false
  for (const k of Object.keys(idForm.currentId)) {
    if (idForm.currentId[k] !== idForm.initId[k]) { changeInitId[k] = idForm.initId[k]; hasChange = true }
  }
  const payload = { ...(fullConfig.value || {}) }
  payload.id_generator = {
    ...(payload.id_generator || {}),
    enabled: idForm.enabled,
    step: idForm.step,
    ...(hasChange ? { init_id: changeInitId } : {})
  }
  saving.value = true
  try {
    await http.put('/admin/update/system_config/platform_setting', { id_generator: payload })
    ElMessage.success('提交成功')
    idEditing.value = false
    await loadConfig()
  } catch (e) {
    ElMessage.error('提交失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}

function onTabChange() {
  router.replace({ query: { ...route.query, tab: tab.value } }).catch(() => {})
  loadConfig()
}

onMounted(async () => {
  // 兼容旧书签 ?tab=business-general-config|idle-pool-config|id-generate
  const legacy = LEGACY_TAB[route.query.tab]
  if (legacy) tab.value = legacy
  loadConfig()
  try {
    const res = await searchBusiness({ start: 0, limit: 200 })
    bizList.value = res?.info || []
  } catch { bizList.value = [] }
})
</script>

<style scoped>
.global-config { padding: 0; }

/* ===== box 型 tab 头(对齐老版 bk-tab,自绘) ===== */
.box-tabs {
  display: flex;
  border-bottom: 1px solid #DCDEE5;
}
.box-tab {
  height: 42px; line-height: 42px;
  padding: 0 24px;
  border: none;
  border-right: 1px solid #DCDEE5;
  background: #F5F7FA;
  color: #63656E; font-size: 14px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.box-tab:hover { color: #3A84FF; }
.box-tab.active {
  background: #fff;
  color: #3A84FF; font-weight: 500;
  margin-bottom: -1px;
  border-bottom: 1px solid #fff;
}

.config-container { display: flex; justify-content: center; margin-top: 40px; padding-bottom: 50px; }
.config-form { width: 800px; }
.field-tip { font-size: 12px; color: #979BA5; line-height: 20px; margin-top: 4px; }
.field-tip.danger { color: #EA3636; }

/* 拓扑层级输入框: '层' 作为 append 单元格(对齐老版 bk-input append) */
.topo-level-input { width: 400px; }
.topo-level-input :deep(.el-input__inner) { text-align: left; }
.topo-level-input :deep(.el-input-group__append) {
  background: #FAFBFD; color: #63656E; padding: 0 14px;
}

/* 蓝色虚线 tooltip label(对齐老版) */
.label-tooltip {
  color: #3A84FF;
  border-bottom: 1px dashed #3A84FF;
  cursor: help;
  line-height: 32px;
}

.module-row { display: flex; align-items: center; gap: 8px; }
.module-row.indent { position: relative; padding-left: 28px; }
.indent-line {
  position: absolute; left: 12px; top: -18px; width: 14px; height: 36px;
  border-left: 1px solid #DCDEE5; border-bottom: 1px solid #DCDEE5;
}
.key-input { width: 180px; flex: none; }
.name-input { flex: 1; max-width: 400px; }
.edit-icon { color: #979BA5; margin-left: 4px; }
.edit-icon:hover { color: #3A84FF; }

.id-gen { flex-direction: column; align-items: center; }
.idgen-tips {
  display: flex; gap: 8px; width: 880px;
  background: #F0F5FF; border: 1px solid #D6E8FF; border-radius: 2px;
  padding: 10px 14px; margin-bottom: 20px;
}
.tips-icon { color: #3A84FF; font-size: 16px; margin-top: 2px; flex: none; }
.tips-body p { margin: 0; font-size: 12px; color: #63656E; line-height: 20px; }

/* ===== collapse 独立卡片样式(对齐老版 cmdb-collapse) ===== */
.idgen-collapse {
  width: 880px;
  border-top: 1px solid transparent;
}
.idgen-collapse :deep(.el-collapse-item) {
  margin-bottom: 20px;
  border: 1px solid #DCDEE5;
  border-radius: 2px;
  background: #fff;
  overflow: hidden;
}
.idgen-collapse :deep(.el-collapse-item__header) {
  height: 52px; line-height: 52px;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid transparent;
  font-size: 14px;
  /* 箭头移到标题左侧(对齐老版 cmdb-collapse ▼ 在左) */
  flex-direction: row-reverse;
  justify-content: flex-end;
  gap: 8px;
}
.idgen-collapse :deep(.el-collapse-item__arrow) { margin: 0; }
.idgen-collapse :deep(.el-collapse-item__header.is-active) {
  border-bottom-color: #DCDEE5;
}
.idgen-collapse :deep(.el-collapse-item__header:hover) { color: #3A84FF; }
.idgen-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: none;
}
.idgen-collapse :deep(.el-collapse-item__content) {
  padding: 24px 20px 24px 50px;
}
.collapse-title { font-weight: 700; color: #313238; }
.view-value { color: #313238; font-size: 14px; }

/* 起始 ID 三列网格(对齐老版) */
.init-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px 48px; padding: 0;
}
.init-item { display: flex; align-items: flex-start; gap: 0; }
.init-label {
  flex: 0 0 150px;
  width: 150px;
  box-sizing: border-box;
  padding-right: 22px;
  text-align: right;
  font-size: 14px;
  color: #63656E;
  line-height: 32px;
}
.init-label .req { color: #EA3636; font-style: normal; margin-right: 2px; }
.init-field { flex: 1; min-width: 0; }

.footer { margin-top: 4px; width: 880px; text-align: left; padding-left: 2px; }
</style>
