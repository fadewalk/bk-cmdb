<template>
  <div class="page-card global-config" v-loading="loading">
    <el-tabs v-model="tab" @tab-change="onTabChange">
      <el-tab-pane label="业务通用" name="general" />
      <el-tab-pane label="业务空闲机池" name="idle" />
      <el-tab-pane label="ID 生成器" name="id" />
    </el-tabs>

    <!-- 业务通用 -->
    <template v-if="tab === 'general'">
      <div class="config-container">
        <el-form label-width="150px" class="config-form">
          <el-form-item required label="业务快照名称">
            <el-select v-model="generalForm.snapshotBizId" filterable style="width: 100%" placeholder="请选择业务">
              <el-option v-for="b in bizList" :key="b.bk_biz_id" :label="b.bk_biz_name" :value="b.bk_biz_id" />
            </el-select>
            <div v-if="generalForm.snapshotBizId !== originSnapshotBizId" class="field-tip danger">
              业务快照名称切换后,主机快照将采集新选业务下的主机数据
            </div>
            <div class="field-tip">配置业务快照名后,数据采集器会按此业务上报主机快照数据</div>
          </el-form-item>
          <el-form-item required label="拓扑最大可建层级">
            <el-input-number v-model="generalForm.maxBizTopoLevel" :min="3" :max="10" :step="1" step-strictly controls-position="right" style="width: 200px" />
            <span class="append-text">层</span>
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
        <el-form label-width="150px" class="config-form">
          <el-form-item required label="集群">
            <div class="module-row">
              <span class="module-icon set-icon">集</span>
              <el-input v-model="idleForm.setName" style="width: 360px" placeholder="请输入集群名称" />
              <template v-if="idleEditing.set">
                <el-button type="primary" size="small" @click="confirmIdleSet">确定</el-button>
                <el-button size="small" @click="cancelEdit('set')">取消</el-button>
              </template>
              <el-button v-else size="small" @click="idleEditing.set = true">编辑</el-button>
            </div>
          </el-form-item>

          <el-form-item
            v-for="(mod, key, idx) in idleForm.buildInModules"
            :key="key"
            required
            :label="idx === 0 ? '模块' : ''"
          >
            <div class="module-row indent">
              <span class="indent-line" />
              <span class="module-icon">模</span>
              <span class="module-key">{{ idleModuleLabel(key) }}</span>
              <el-input v-model="idleForm.buildInModules[key]" style="width: 300px" placeholder="请输入模块名称" />
              <template v-if="idleEditing[key]">
                <el-button type="primary" size="small" @click="confirmBuiltinModule(key)">确定</el-button>
                <el-button size="small" @click="cancelEdit(key)">取消</el-button>
              </template>
              <el-button v-else size="small" @click="idleEditing[key] = true">编辑</el-button>
            </div>
          </el-form-item>

          <el-form-item v-for="um in idleForm.userModules" :key="um.moduleKey" :label="''">
            <div class="module-row indent">
              <span class="indent-line" />
              <span class="module-icon">模</span>
              <el-input v-model="um.editKey" style="width: 160px" placeholder="模块 ID(英文/数字)" :disabled="!um.isNew" />
              <el-input v-model="um.editName" style="width: 240px" placeholder="请输入模块名称" />
              <template v-if="um.editing">
                <el-button type="primary" size="small" @click="confirmUserModule(um)">确定</el-button>
                <el-button size="small" @click="cancelUserModule(um)">取消</el-button>
              </template>
              <template v-else>
                <el-button size="small" @click="um.editing = true">编辑</el-button>
                <el-button size="small" type="danger" plain @click="removeUserModule(um)">删除</el-button>
              </template>
            </div>
          </el-form-item>

          <el-form-item>
            <el-button text type="primary" :icon="'Plus'" @click="addUserModule">添加模块</el-button>
          </el-form-item>
        </el-form>
      </div>
    </template>

    <!-- ID 生成器 -->
    <template v-if="tab === 'id'">
      <div class="config-container id-gen">
        <el-alert type="info" :closable="false" style="margin-bottom: 16px; max-width: 800px"
          title="开启数据同步后,业务拓扑数据将同步至消息队列;ID 步长与起始 ID 影响新实例的自增 ID 分配,起始 ID 只能调大不可调小" />

        <el-collapse v-model="idOpenCollapse" class="idgen-collapse">
          <el-collapse-item name="sync">
            <template #title><span class="collapse-title">同步设置</span></template>
            <el-form label-width="150px">
              <el-form-item required label="允许数据同步">
                <div v-if="!idEditing">{{ idForm.enabled ? '是否允许同步: 允许同步' : '是否允许同步: 不允许同步' }}</div>
                <el-radio-group v-else v-model="idForm.enabled">
                  <el-radio :value="false">不允许同步</el-radio>
                  <el-radio :value="true">允许同步</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-form>
          </el-collapse-item>
          <el-collapse-item name="step">
            <template #title><span class="collapse-title">ID 步长配置</span></template>
            <el-form label-width="150px">
              <el-form-item required label="ID 自增步长">
                <div v-if="!idEditing">{{ idForm.step }}</div>
                <el-input-number v-else v-model="idForm.step" :min="1" :max="20" :step="1" step-strictly controls-position="right" style="width: 200px" />
                <div class="field-tip">相邻两次分配 ID 之间的间隔数,建议 1-20</div>
              </el-form-item>
            </el-form>
          </el-collapse-item>
          <el-collapse-item name="init">
            <template #title><span class="collapse-title">起始 ID 配置</span></template>
            <el-form label-width="150px">
              <el-form-item v-for="p in Object.keys(idForm.initId)" :key="p" required :label="modelLabel(p)">
                <div v-if="!idEditing">{{ idForm.currentId[p] }}</div>
                <template v-else>
                  <el-input-number v-model="idForm.initId[p]" :min="idForm.currentId[p]" :max="idForm.currentId[p] + 10000" controls-position="right" style="width: 220px" />
                  <div class="field-tip">当前设置值: {{ idForm.currentId[p] }}</div>
                </template>
              </el-form-item>
            </el-form>
          </el-collapse-item>
        </el-collapse>

        <div class="footer">
          <el-button v-if="!idEditing" type="primary" @click="idEditing = true">编辑</el-button>
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
// 全局配置:与老版 global-config 三个 tab 对齐,接口全部走真实后端
// - GET  /admin/find/system_config/platform_setting/current   拉取配置
// - PUT  /admin/update/system_config/platform_setting          更新 backend / idGenerator
// - POST /topo/update/biz/idle_set                             空闲机池集群/模块 更新与创建
// - POST /topo/delete/biz/extra_moudle                         删除用户自定义空闲机模块
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http, searchBusiness } from '../../api/cmdb'

const tab = ref('general')
const loading = ref(false)
const saving = ref(false)
const bizList = ref([])

const BUILTIN_KEYS = { idle: '空闲机', fault: '故障机', recycle: '待回收', restart: '待重启' }
function idleModuleLabel(key) { return BUILTIN_KEYS[key] || key }
const MODEL_NAMES = { biz: '业务', set: '集群', module: '模块', host: '主机', process: '进程', plat: '管控区域' }
function modelLabel(p) { return MODEL_NAMES[p] || p }

// ---------- 业务通用 ----------
const generalForm = reactive({ snapshotBizId: '', maxBizTopoLevel: 3 })
const originGeneral = reactive({ snapshotBizId: '', maxBizTopoLevel: 3 })
const originSnapshotBizId = ref('')

// ---------- 空闲机池 ----------
const idleForm = reactive({
  setName: '',
  buildInModules: { idle: '', fault: '', recycle: '', restart: '' },
  userModules: [] // { moduleKey, moduleName, isNew, editing, editKey, editName }
})
const idleEditing = reactive({ set: false })
function cancelEdit(key) {
  idleEditing[key] = false
  loadConfig()
}

// ---------- ID 生成器 ----------
const idEditing = ref(false)
const idOpenCollapse = ref(['sync', 'step', 'init'])
const idForm = reactive({ enabled: false, step: 1, initId: {}, currentId: {} })
const idOrigin = ref({})
const idChanged = computed(() => JSON.stringify(idForm) !== idOrigin.value)

function snapshotGeneral(config) {
  generalForm.snapshotBizId = config.backend?.snapshotBizId ?? ''
  generalForm.maxBizTopoLevel = config.backend?.maxBizTopoLevel || 3
  originGeneral.snapshotBizId = generalForm.snapshotBizId
  originGeneral.maxBizTopoLevel = generalForm.maxBizTopoLevel
  originSnapshotBizId.value = generalForm.snapshotBizId
}
function snapshotIdle(config) {
  idleForm.setName = config.set || config.idlePool?.set || '空闲机池'
  const pool = config.idlePool || {}
  for (const k of Object.keys(BUILTIN_KEYS)) {
    idleForm.buildInModules[k] = pool[k] || BUILTIN_KEYS[k]
  }
  idleForm.userModules = (pool.userModules || []).map((m) => ({
    moduleKey: m.moduleKey || m.ruleKey,
    moduleName: m.moduleName,
    isNew: false,
    editing: false,
    editKey: m.moduleKey || m.ruleKey,
    editName: m.moduleName
  }))
}
function snapshotId(config) {
  const gen = config.idGenerator || {}
  idForm.enabled = !!gen.enabled
  idForm.step = gen.step || 1
  const initId = {}, currentId = {}
  for (const [k, v] of Object.entries(gen.init_id || {})) initId[k] = v
  for (const [k, v] of Object.entries(gen.current_id || {})) currentId[k] = v
  // init_id 缺失的键用 current_id 补
  for (const [k, v] of Object.entries(currentId)) {
    if (initId[k] === undefined) initId[k] = v
  }
  idForm.initId = initId
  idForm.currentId = currentId
  idOrigin.value = JSON.stringify(idForm)
}

async function loadConfig() {
  loading.value = true
  try {
    const res = await http.get('/admin/find/system_config/platform_setting/current')
    const config = res?.data || res || {}
    snapshotGeneral(config)
    snapshotIdle(config)
    snapshotId(config)
  } catch (e) {
    // 独立模式部分字段可能为空,保留默认
  } finally {
    loading.value = false
  }
}

async function saveGeneral() {
  if (!generalForm.snapshotBizId && generalForm.snapshotBizId !== 0) {
    ElMessage.warning('请选择业务'); return
  }
  if (!generalForm.maxBizTopoLevel) {
    ElMessage.warning('请输入拓扑最大可建层级'); return
  }
  saving.value = true
  try {
    await http.put('/admin/update/system_config/platform_setting', {
      backend: {
        snapshotBizId: generalForm.snapshotBizId,
        maxBizTopoLevel: Number(generalForm.maxBizTopoLevel)
      }
    })
    ElMessage.success('保存成功')
    await loadConfig()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}
function resetGeneral() {
  generalForm.snapshotBizId = originGeneral.snapshotBizId
  generalForm.maxBizTopoLevel = originGeneral.maxBizTopoLevel
}

// ---------- 空闲机池操作 ----------
async function confirmIdleSet() {
  if (!idleForm.setName.trim()) { ElMessage.warning('请输入集群名称'); return }
  saving.value = true
  try {
    await http.post('/topo/update/biz/idle_set', {
      type: 'set',
      set: { set_key: 'idle_pool', set_name: idleForm.setName.trim() }
    })
    ElMessage.success('保存成功')
    idleEditing.set = false
    await loadConfig()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}

async function confirmBuiltinModule(key) {
  const name = (idleForm.buildInModules[key] || '').trim()
  if (!name) { ElMessage.warning('请输入模块名称'); return }
  saving.value = true
  try {
    await http.post('/topo/update/biz/idle_set', {
      type: 'module',
      module: { module_key: key, module_name: name }
    })
    ElMessage.success('保存成功')
    idleEditing[key] = false
    await loadConfig()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}

function addUserModule() {
  idleForm.userModules.push({ moduleKey: '', moduleName: '', isNew: true, editing: true, editKey: '', editName: '' })
}
function cancelUserModule(um) {
  if (um.isNew) {
    idleForm.userModules = idleForm.userModules.filter((x) => x !== um)
  } else {
    um.editing = false
    um.editKey = um.moduleKey
    um.editName = um.moduleName
  }
}
async function confirmUserModule(um) {
  const key = (um.editKey || '').trim()
  const name = (um.editName || '').trim()
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) { ElMessage.warning('模块 ID 需为英文/数字'); return }
  if (!name) { ElMessage.warning('请输入模块名称'); return }
  saving.value = true
  try {
    await http.post('/topo/update/biz/idle_set', {
      type: 'module',
      module: { module_key: key, module_name: name }
    })
    ElMessage.success('保存成功')
    await loadConfig()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}
async function removeUserModule(um) {
  try {
    await ElMessageBox.confirm(`确定删除模块「${um.moduleName}」?`, '删除确认', { type: 'warning' })
  } catch { return }
  saving.value = true
  try {
    await http.post('/topo/delete/biz/extra_moudle', {
      module_key: um.moduleKey,
      module_name: um.moduleName
    })
    ElMessage.success('已删除')
    await loadConfig()
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}

// ---------- ID 生成器 ----------
function cancelIdEdit() {
  idEditing.value = false
  loadConfig()
}
async function submitId() {
  try {
    await ElMessageBox.confirm('提交后新的起始 ID 将立即生效,确认提交?', '确认提交', { type: 'warning' })
  } catch { return }
  // 仅提交发生变化的 init_id(与老版逻辑一致)
  const changeInitId = {}
  let hasChange = false
  for (const k of Object.keys(idForm.currentId)) {
    if (idForm.currentId[k] !== idForm.initId[k]) {
      changeInitId[k] = idForm.initId[k]
      hasChange = true
    }
  }
  const submitForm = { enabled: idForm.enabled, step: idForm.step }
  if (hasChange) submitForm.init_id = changeInitId
  saving.value = true
  try {
    await http.put('/admin/update/system_config/platform_setting', { idGenerator: submitForm })
    ElMessage.success('提交成功')
    idEditing.value = false
    await loadConfig()
  } catch (e) {
    ElMessage.error('提交失败: ' + (e?.message || '后端异常'))
  } finally { saving.value = false }
}

function onTabChange() { loadConfig() }

onMounted(async () => {
  loadConfig()
  try {
    const res = await searchBusiness({ start: 0, limit: 200 })
    bizList.value = res?.info || []
  } catch { bizList.value = [] }
})
</script>

<style scoped>
.global-config { padding: 20px; }
.config-container { display: flex; justify-content: center; margin-top: 30px; padding-bottom: 40px; }
.config-form { width: 760px; }
.field-tip { font-size: 12px; color: #979BA5; line-height: 20px; margin-top: 4px; }
.field-tip.danger { color: #EA3636; }
.append-text { margin-left: 8px; color: #63656E; }

.module-row { display: flex; align-items: center; gap: 8px; }
.module-row.indent { position: relative; padding-left: 28px; }
.indent-line {
  position: absolute; left: 12px; top: -18px; width: 14px; height: 36px;
  border-left: 1px solid #DCDEE5; border-bottom: 1px solid #DCDEE5;
}
.module-icon {
  width: 22px; height: 22px; border-radius: 2px; background: #E1ECFF; color: #3A84FF;
  font-size: 12px; display: inline-flex; align-items: center; justify-content: center; flex: none;
}
.module-icon.set-icon { background: #3A84FF; color: #fff; }
.module-key { width: 56px; color: #63656E; font-size: 13px; flex: none; }

.id-gen { flex-direction: column; align-items: center; }
.idgen-collapse { width: 760px; }
.collapse-title { font-weight: 500; color: #313238; }
.footer { margin-top: 20px; width: 760px; text-align: center; }
</style>
