<template>
  <!-- 老版 bk-sideslider 800px 复刻:右侧抽屉 + 按属性分组折叠 + 逐字段锁语义 -->
  <el-drawer
    :model-value="visible"
    :title="title"
    size="800px"
    :modal="false"
    :close-on-click-modal="false"
    class="process-form-drawer"
    @update:model-value="handleVisibleChange"
  >
    <div class="pf-scroll" v-if="mode === 'template'">
      <div v-for="group in groupSections" :key="group.bk_group_id" class="pf-group">
        <div class="pf-group-header" @click="toggleGroup(group.bk_group_id)">
          <i :class="['bk-cmdb-icon icon-cc-triangle pf-arrow', { collapsed: groupCollapsed[group.bk_group_id] }]" />
          <span>{{ group.bk_group_name }}</span>
        </div>
        <div v-show="!groupCollapsed[group.bk_group_id]" class="pf-group-body">
          <div class="pf-grid">
            <!-- 常规字段(两列,label 在上) -->
            <div
              v-for="f in group.fields"
              :key="f.bk_property_id"
              class="pf-item"
            >
              <div class="pf-label">
                <span :class="{ required: isFieldRequired(f) }">{{ f.bk_property_name }}</span>
                <el-tooltip v-if="f.placeholder" :content="f.placeholder" placement="top">
                  <i class="bk-cmdb-icon icon-cc-tips pf-tips" />
                </el-tooltip>
              </div>
              <div class="field-control" :class="{ 'is-lock': lockState[f.bk_property_id] }">
                <el-select
                  v-if="enumOptions(f).length"
                  v-model="form[f.bk_property_id]"
                  :disabled="isFieldDisabled(f)"
                  :placeholder="fieldPlaceholder(f)"
                  clearable
                  style="flex: 1"
                >
                  <el-option v-for="o in enumOptions(f)" :key="o.id" :label="o.name" :value="o.id" />
                </el-select>
                <el-switch
                  v-else-if="f.bk_property_type === 'bool'"
                  v-model="form[f.bk_property_id]"
                  :disabled="isFieldDisabled(f)"
                />
                <el-input-number
                  v-else-if="f.bk_property_type === 'int' || f.bk_property_type === 'float'"
                  v-model="form[f.bk_property_id]"
                  :controls="false"
                  :disabled="isFieldDisabled(f)"
                  style="flex: 1"
                />
                <el-input
                  v-else-if="f.bk_property_type === 'longchar'"
                  v-model="form[f.bk_property_id]"
                  type="textarea"
                  :rows="2"
                  :disabled="isFieldDisabled(f)"
                />
                <el-input
                  v-else
                  v-model="form[f.bk_property_id]"
                  :disabled="isFieldDisabled(f)"
                  :placeholder="fieldPlaceholder(f)"
                  style="flex: 1"
                />
                <!-- 锁状态:mustLocked 字段(bk_func_name/bk_process_name/bind_info)无锁控件 -->
                <el-tooltip v-if="allowLock(f)" placement="top" :content="LOCK_TIPS" raw-content>
                  <span v-show="lockState[f.bk_property_id]" class="property-lock" @click="toggleLock(f)">
                    <i :class="lockState[f.bk_property_id] ? 'bk-cmdb-icon icon-cc-lock-fill' : 'bk-cmdb-icon icon-cc-unlock-fill'" />
                  </span>
                </el-tooltip>
              </div>
              <p v-if="fieldErrors[f.bk_property_id]" class="form-error">{{ fieldErrors[f.bk_property_id] }}</p>
            </div>
          </div>
          <!-- bind_info:端口绑定表(监听信息组,通栏;老版 process-form-property-table) -->
          <template v-if="group.hasBind">
            <div class="pf-label"><span>{{ bindAttr?.bk_property_name || '绑定信息' }}</span></div>
            <div class="field-control" :class="{ 'is-lock': true }" style="width: 100%">
              <el-table :data="form.__bind_rows" size="small" border style="width: 100%">
                <el-table-column
                  v-for="col in bindColumns"
                  :key="col.bk_property_id"
                  :label="col.bk_property_name"
                  :min-width="col.bk_property_id === 'port' ? 120 : 130"
                >
                  <template #default="{ row }">
                    <div class="field-control" :class="{ 'is-lock': row.__lock?.[col.bk_property_id] }">
                      <el-select
                        v-if="col.bk_property_id === 'ip'"
                        v-model="row.ip"
                        :disabled="infoMode"
                        size="small"
                        style="flex: 1"
                        @change="(v) => onIpChange(row, v)"
                      >
                        <el-option v-for="(name, id) in IP_OPTIONS" :key="id" :label="name" :value="String(id)" />
                      </el-select>
                      <el-select
                        v-else-if="col.bk_property_id === 'protocol'"
                        v-model="row.protocol"
                        :disabled="infoMode"
                        size="small"
                        style="flex: 1"
                      >
                        <el-option v-for="o in protocolOptions(row)" :key="o.id" :label="o.name" :value="o.id" />
                      </el-select>
                      <el-switch
                        v-else-if="col.bk_property_id === 'enable'"
                        v-model="row.enable"
                        :disabled="infoMode"
                        size="small"
                      />
                      <el-input
                        v-else
                        v-model="row[col.bk_property_id]"
                        :disabled="infoMode"
                        size="small"
                        :placeholder="bindPlaceholder(col)"
                      />
                      <el-tooltip v-if="!infoMode" placement="top" :content="LOCK_TIPS" raw-content>
                        <span class="property-lock" @click="toggleBindLock(row, col.bk_property_id)">
                          <i :class="row.__lock?.[col.bk_property_id] ? 'bk-cmdb-icon icon-cc-lock-fill' : 'bk-cmdb-icon icon-cc-unlock-fill'" />
                        </span>
                      </el-tooltip>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column v-if="!infoMode" label="操作" width="60">
                  <template #default="{ $index }">
                    <el-button link type="danger" size="small" @click="removeBindRow($index)">删除</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <p v-if="fieldErrors.bind_info" class="form-error">{{ fieldErrors.bind_info }}</p>
            <div v-if="!infoMode" class="bind-add">
              <a class="bind-add-link" @click="addBindRow"><i class="bk-cmdb-icon icon-cc-plus" /> 立即添加</a>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 兼容回退:未传属性元数据时按原字段渲染(进程实例场景,M4-D 契约不变) -->
    <div class="pf-scroll" v-else>
      <el-form label-width="130px">
        <el-form-item label="进程名称" required>
          <el-input v-model="form.bk_func_name" placeholder="如 java / nginx" @input="form.bk_process_name = form.bk_func_name" />
        </el-form-item>
        <template v-if="mode === 'instance'">
          <el-form-item label="监听 IP">
            <el-input v-model="form.bk_bind_ip" placeholder="如 127.0.0.1" />
          </el-form-item>
          <el-form-item label="端口">
            <el-input v-model="form.port" placeholder="如 8080,多个用逗号分隔" />
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="绑定端口">
            <el-input v-model="form.__bind_port" placeholder="如 8080(留空则不绑定端口)" />
          </el-form-item>
          <el-form-item label="监听类型">
            <el-select v-model="form.__bind_ip" style="width: 100%">
              <el-option label="本机" value="1" />
              <el-option label="全部" value="2" />
              <el-option label="内网" value="3" />
              <el-option label="外网" value="4" />
            </el-select>
          </el-form-item>
          <el-form-item label="协议">
            <el-select v-model="form.__bind_protocol" style="width: 100%">
              <el-option label="TCP" value="1" />
              <el-option label="UDP" value="2" />
            </el-select>
          </el-form-item>
        </template>
        <el-form-item label="启动用户">
          <el-input v-model="form.user" />
        </el-form-item>
        <el-form-item label="工作路径">
          <el-input v-model="form.work_path" />
        </el-form-item>
        <el-form-item label="启动命令">
          <el-input v-model="form.start_cmd" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="停止命令">
          <el-input v-model="form.stop_cmd" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <div class="pf-footer">
        <template v-if="infoMode">
          <el-button @click="$emit('update:visible', false)">关闭</el-button>
        </template>
        <template v-else>
          <el-button type="primary" :loading="saving" :disabled="mode === 'template' && editingExisting && !isFormChanged" @click="handleSave">
            {{ mode === 'template' ? (editingExisting ? '确定' : '提交') : '保存' }}
          </el-button>
          <el-button @click="handleCancel">取消</el-button>
        </template>
      </div>
    </template>
  </el-drawer>
</template>

<script setup>
// form 为父组件的 reactive 对象,此处直接修改其属性
import { computed, reactive, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'

const props = defineProps({
  visible: Boolean,
  title: String,
  mode: { type: String, default: 'instance' }, // instance | template
  form: { type: Object, required: true },
  saving: Boolean,
  // 进程模型属性列表(template 模式动态渲染);不传则回退到内置字段
  attrs: { type: Array, default: () => [] },
  // 进程模型属性分组(老版 process-form 分组折叠)
  groups: { type: Array, default: () => [] },
  // 编辑已有进程模板:bk_func_name 禁改 + 更新仅提交变更字段
  editingExisting: { type: Boolean, default: false },
  // 查看(info)态:控件只读、无锁操作、仅关闭按钮
  infoMode: { type: Boolean, default: false }
})
const emit = defineEmits(['update:visible', 'save'])

const LOCK_TIPS = '加锁：仅能在模板修改，再按需同步到实例<br>解锁：实例自行修改，模板修改后不会同步'
// 老版 process-form:必须锁定的字段(字段级无锁控件,恒为 as_default_value=true)
const MUST_LOCKED = ['bk_func_name', 'bk_process_name', 'bind_info']
// 老版 process-bind-ip 字典:ip 枚举 1-8
const IP_OPTIONS = {
  1: '127.0.0.1',
  2: '0.0.0.0',
  3: '第一内网IP',
  4: '第一外网IP',
  5: '::1',
  6: '::',
  7: '第一内网IPv6',
  8: '第一外网IPv6'
}
const IPV4_KEYS = ['1', '2', '3', '4']
const IPV6_KEYS = ['5', '6', '7', '8']
// 老版 process-bind-protocol:v4 协议集 1/2,v6 协议集 3/4
const PROTOCOL_V4_LIST = ['1', '2']
const PROTOCOL_V6_LIST = ['3', '4']

const SKIP_FIELDS = new Set([
  'bk_process_id', 'bk_func_id', 'bk_biz_id', 'bk_supplier_account',
  'bk_template_id', 'bk_service_template_id', 'bind_info',
  'create_time', 'last_time', 'bk_created_at', 'bk_updated_at', 'bk_created_by', 'bk_updated_by'
])

const formFields = computed(() => {
  if (props.mode !== 'template') return []
  return (props.attrs || []).filter((f) => !SKIP_FIELDS.has(f.bk_property_id))
    .sort((a, b) => {
      if (a.bk_property_id === 'bk_func_name') return -1
      if (b.bk_property_id === 'bk_func_name') return 1
      return (a.bk_property_index || 0) - (b.bk_property_index || 0)
    })
})
const bindAttr = computed(() => (props.attrs || []).find((f) => f.bk_property_id === 'bind_info'))
const bindColumns = computed(() => (bindAttr.value?.option || []))

// ---------- 分组折叠(老版 cmdb-collapse 按 process 属性分组,is_collapse 决定初始态) ----------
const groupSections = computed(() => {
  if (props.mode !== 'template') return []
  const groups = (props.groups || []).slice().sort((a, b) => (a.bk_group_index || 0) - (b.bk_group_index || 0))
  const sections = groups.map((g) => ({ ...g, fields: [], hasBind: false }))
  const byId = new Map(sections.map((s) => [s.bk_group_id, s]))
  const defaultSection = { bk_group_id: 'default', bk_group_name: '基础信息', fields: [], hasBind: false }
  for (const f of formFields.value) {
    const gid = f.bk_property_group && byId.has(f.bk_property_group) ? f.bk_property_group : 'default'
    const section = byId.get(gid) || defaultSection
    section.fields.push(f)
  }
  // bind_info 归入其属性分组(老版监听信息组),无分组则并入 default
  const bindGroup = bindAttr.value && byId.has(bindAttr.value.bk_property_group)
    ? byId.get(bindAttr.value.bk_property_group)
    : defaultSection
  bindGroup.hasBind = true
  const all = [...sections, defaultSection]
  return all.filter((s) => s.fields.length || s.hasBind)
})
const groupCollapsed = reactive({})
function toggleGroup(groupId) {
  groupCollapsed[groupId] = !groupCollapsed[groupId]
}

function enumOptions(f) {
  const opt = f.option
  if (Array.isArray(opt)) return opt.filter((o) => o && o.id !== undefined && typeof o === 'object')
  return []
}

// ---------- 锁语义(老版 as_default_value 逐字段) ----------
const lockState = reactive({})
const fieldErrors = reactive({})

function isFieldRequired(f) {
  return !!f.isrequired
}
function fieldPlaceholder(f) {
  return (['enum', 'list'].includes(f.bk_property_type) ? '请选择' : '请输入') + f.bk_property_name
}
function isFieldDisabled(f) {
  // 老版 getPropertyEditStatus:编辑态 bk_func_name 禁改
  return props.infoMode || (props.editingExisting && f.bk_property_id === 'bk_func_name')
}
function allowLock(f) {
  return !props.infoMode && !MUST_LOCKED.includes(f.bk_property_id)
}
function toggleLock(f) {
  lockState[f.bk_property_id] = !lockState[f.bk_property_id]
}
function toggleBindLock(row, key) {
  row.__lock = row.__lock || {}
  row.__lock[key] = !row.__lock[key]
}
function bindPlaceholder(col) {
  return (['enum', 'list'].includes(col.bk_property_type) ? '请选择' : '请输入') + col.bk_property_name
}

// 老版契约:进程别名跟随功能名称(仅当别名等于旧功能名时同步)
watch(() => props.form.bk_func_name, (newVal, oldVal) => {
  if (props.mode !== 'template') return
  if (props.form.bk_process_name === oldVal) props.form.bk_process_name = newVal
})

// ---------- bind_info 联动 ----------
function protocolOptions(row) {
  const columns = bindColumns.value.find((c) => c.bk_property_id === 'protocol')?.option || []
  if (IPV4_KEYS.includes(row.ip)) return columns.filter((o) => PROTOCOL_V4_LIST.includes(o.id))
  if (IPV6_KEYS.includes(row.ip)) return columns.filter((o) => PROTOCOL_V6_LIST.includes(o.id))
  return columns
}
// 老版契约:ip 类型与协议不一致时重置协议值
function onIpChange(row, value) {
  if (IPV4_KEYS.includes(value) && !PROTOCOL_V4_LIST.includes(row.protocol)) row.protocol = ''
  if (IPV6_KEYS.includes(value) && !PROTOCOL_V6_LIST.includes(row.protocol)) row.protocol = ''
}
function addBindRow() {
  // 老版契约:新绑定行默认锁定且 ip 默认 127.0.0.1(枚举 1)
  props.form.__bind_rows.push({
    ip: '1', protocol: '1', port: '', enable: true,
    __lock: { ip: true, port: true, protocol: true, enable: true }
  })
}
function removeBindRow(idx) {
  props.form.__bind_rows.splice(idx, 1)
}

// ---------- 变更检测 ----------
const isFormChanged = ref(true)
let openSnapshot = ''
// 保存成功后的关闭(父组件置 visible=false)不应触发离开确认
let justSaved = false

function bindRowsPlain() {
  return (props.form.__bind_rows || []).map((row, index) => ({
    row_id: row.row_id || index + 1,
    ip: row.ip || '1',
    port: String(row.port ?? ''),
    protocol: row.protocol || '',
    enable: row.enable !== false,
    lock: { ip: !!row.__lock?.ip, port: !!row.__lock?.port, protocol: !!row.__lock?.protocol, enable: !!row.__lock?.enable }
  }))
}
function fieldsPlain() {
  const picked = {}
  for (const f of formFields.value) picked[f.bk_property_id] = props.form[f.bk_property_id]
  return picked
}
function currentSnapshot() {
  return JSON.stringify({ fields: fieldsPlain(), rows: bindRowsPlain(), locks: { ...lockState } })
}
const snapshotComputed = computed(currentSnapshot)
watch(snapshotComputed, (snap) => {
  if (!props.visible || props.mode !== 'template') return
  isFormChanged.value = !props.editingExisting || snap !== openSnapshot
})

// 老版 submitFormat:按模型属性构建 {value, as_default_value} 结构
function buildProperty() {
  const property = {}
  for (const attr of props.attrs || []) {
    const id = attr.bk_property_id
    if (id === 'bind_info') continue
    if (SKIP_FIELDS.has(id) && id !== 'bk_process_name') continue
    const value = props.form[id]
    const hasValue = value !== '' && value !== null && value !== undefined
    if (['int', 'float'].includes(attr.bk_property_type)) {
      property[id] = { value: hasValue ? Number(value) : null, as_default_value: !!lockState[id] }
    } else if (attr.bk_property_type === 'bool') {
      property[id] = { value: value !== undefined && value !== null ? !!value : false, as_default_value: !!lockState[id] }
    } else {
      property[id] = { value: hasValue ? value : null, as_default_value: !!lockState[id] }
    }
  }
  property.bind_info = {
    value: (props.form.__bind_rows || []).map((row, index) => ({
      row_id: row.row_id || index + 1,
      ip: { value: row.ip || '1', as_default_value: !!row.__lock?.ip },
      port: { value: String(row.port ?? ''), as_default_value: !!row.__lock?.port },
      protocol: { value: row.protocol || '', as_default_value: !!row.__lock?.protocol },
      enable: { value: row.enable !== false, as_default_value: !!row.__lock?.enable }
    })),
    as_default_value: true
  }
  return property
}

// ---------- 打开时初始化 ----------
watch(() => props.visible, (visible) => {
  if (!visible || props.mode !== 'template') return
  justSaved = false
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k])
  // 老版 initValues:创建模式全部默认锁定;编辑模式按模板行 as_default_value,mustLocked 恒锁
  const initLocks = props.form.__init_locks || {}
  Object.keys(lockState).forEach((k) => delete lockState[k])
  for (const f of formFields.value) {
    lockState[f.bk_property_id] = props.editingExisting
      ? !!(initLocks[f.bk_property_id] ?? MUST_LOCKED.includes(f.bk_property_id))
      : true
  }
  // 分组折叠初态:is_collapse(老版 groupCollapseState)
  Object.keys(groupCollapsed).forEach((k) => delete groupCollapsed[k])
  for (const g of props.groups || []) groupCollapsed[g.bk_group_id] = !!g.is_collapse
  // 绑定行锁:编辑按行携带的 __lock(由父组件按 as_default_value 还原),新建默认全锁
  for (const row of props.form.__bind_rows || []) {
    row.__lock = row.__lock || { ip: true, port: true, protocol: true, enable: true }
  }
  if (props.editingExisting && !props.form.__bind_rows?.length) {
    props.form.__bind_rows.push({ ip: '1', protocol: '', port: '', enable: true, __lock: { ip: false, port: false, protocol: false, enable: false } })
  }
  isFormChanged.value = !props.editingExisting
  openSnapshot = currentSnapshot()
})

// ---------- 校验/提交 ----------
function validateForm() {
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k])
  let valid = true
  for (const f of formFields.value) {
    if (!f.isrequired) continue
    const value = props.form[f.bk_property_id]
    if (value === '' || value === null || value === undefined) {
      fieldErrors[f.bk_property_id] = (['enum', 'list'].includes(f.bk_property_type) ? '请选择' : '请输入') + f.bk_property_name
      valid = false
    }
  }
  // bind_info:至少一行且端口必填(老版 有未正确定义的监听信息)
  const rows = props.form.__bind_rows || []
  if (!rows.length || rows.some((row) => String(row.port ?? '').trim() === '')) {
    fieldErrors.bind_info = '有未正确定义的监听信息'
    valid = false
  }
  return valid
}

function handleSave() {
  if (props.mode !== 'template') {
    emit('save', props.form)
    return
  }
  if (!validateForm()) return
  justSaved = true
  const property = buildProperty()
  if (props.editingExisting) {
    // 老版契约:更新仅提交变更字段(process_property=changedValues,基线为模板行原 property)
    const initial = props.form.__initial_property || {}
    const changed = {}
    for (const [key, val] of Object.entries(property)) {
      if (JSON.stringify(val) !== JSON.stringify(initial[key])) changed[key] = val
    }
    emit('save', { form: props.form, property: changed, changedOnly: true })
  } else {
    emit('save', { form: props.form, property, changedOnly: false })
  }
}

async function handleCancel() {
  if (justSaved) {
    justSaved = false
    emit('update:visible', false)
    return
  }
  if (props.mode === 'template' && !props.infoMode && currentSnapshot() !== openSnapshot) {
    try {
      await ElMessageBox.confirm('离开将会导致未保存信息丢失', '确认离开当前页？', {
        confirmButtonText: '离开',
        cancelButtonText: '取消',
        type: 'warning'
      })
      emit('update:visible', false)
    } catch { /* 停留编辑 */ }
    return
  }
  emit('update:visible', false)
}

function handleVisibleChange(visible) {
  if (!visible) {
    handleCancel()
    return
  }
  emit('update:visible', visible)
}
</script>

<style>
/* el-drawer teleport 到 body,样式须全局;类名前缀 pf- 防冲突 */
.process-form-drawer .el-drawer__header {
  margin-bottom: 0;
  padding: 16px 24px;
  color: #313238;
  font-size: 16px;
}
.process-form-drawer .el-drawer__body {
  padding: 0 24px 24px;
  overflow-y: auto;
}
.process-form-drawer .el-drawer__footer {
  padding: 10px 24px;
}
.pf-footer {
  display: flex;
  justify-content: flex-start;
}
.pf-footer .el-button {
  min-width: 76px;
}
.pf-scroll {
  min-height: 100%;
}
.pf-group {
  padding: 14px 0 6px;
}
.pf-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: bold;
  color: #63656E;
  cursor: pointer;
  user-select: none;
  padding-bottom: 8px;
}
.pf-arrow {
  font-size: 12px;
  color: #63656E;
  transition: transform .2s;
}
.pf-arrow.collapsed {
  transform: rotate(-90deg);
}
.pf-group-body {
  padding: 4px 0 10px;
}
.pf-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 30px;
}
.pf-item {
  margin-bottom: 14px;
}
.pf-label {
  font-size: 14px;
  color: #63656E;
  margin-bottom: 8px;
  line-height: 16px;
}
.pf-label .required {
  position: relative;
  padding-right: 12px;
}
.pf-label .required::after {
  content: '*';
  position: absolute;
  right: 2px;
  top: 0;
  color: #EA3636;
}
.pf-tips {
  font-size: 14px;
  color: #C4C6CC;
  margin-left: 4px;
  cursor: help;
}
.field-control {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 0;
}
.field-control .property-lock {
  display: none;
  width: 24px;
  height: 26px;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #63656E;
  background-color: #FAFBFD;
  border: 1px solid #C4C6CC;
  border-left: none;
  cursor: pointer;
  flex: none;
}
.field-control:hover .property-lock,
.field-control.is-lock .property-lock {
  display: inline-flex;
}
.form-error {
  margin-top: 4px;
  font-size: 12px;
  color: #EA3636;
  line-height: 16px;
}
.bind-add {
  text-align: center;
  padding: 8px 0 4px;
}
.bind-add-link {
  color: #3A84FF;
  font-size: 12px;
  cursor: pointer;
}
</style>
