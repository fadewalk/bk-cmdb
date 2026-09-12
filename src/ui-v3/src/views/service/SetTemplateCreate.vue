<template>
  <!-- 旧版 set-template/create.vue + management-form.vue 复刻:基础信息/属性设置/集群拓扑 -->
  <div class="create-page">
    <div class="create-main">
      <!-- 基础信息(旧版:label 在输入框上方) -->
      <section class="form-group">
        <div class="group-header" @click="collapse.basic = !collapse.basic">
          <i :class="['bk-cmdb-icon icon-cc-triangle group-arrow', { collapsed: collapse.basic }]" />
          <span class="group-title">基础信息</span>
        </div>
        <div v-show="!collapse.basic" class="group-body">
          <div class="stack-field">
            <label class="stack-label"><span class="req-star">*</span>模板名称</label>
            <el-input
              v-model.trim="form.name"
              class="name-input"
              placeholder="请输入模板名称"
              maxlength="256"
            />
          </div>
        </div>
      </section>

      <!-- 属性设置 -->
      <section class="form-group">
        <div class="group-header" @click="collapse.property = !collapse.property">
          <i :class="['bk-cmdb-icon icon-cc-triangle group-arrow', { collapsed: collapse.property }]" />
          <span class="group-title">属性设置</span>
        </div>
        <div v-show="!collapse.property" class="group-body">
          <div class="create-container">
            <el-dropdown trigger="click" @command="addProperty">
              <el-button :icon="'Plus'">添加属性字段</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="p in addableProperties"
                    :key="p.id"
                    :command="p.id"
                  >{{ p.bk_property_name }}（{{ p.bk_property_id }}）</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <span class="create-tips">模板里定义的字段，在实例中将不可修改</span>
          </div>
          <el-table v-if="propertyRows.length" :data="propertyRows" class="property-table">
            <el-table-column label="属性名" min-width="200">
              <template #default="{ row }">{{ row.bk_property_name }}</template>
            </el-table-column>
            <el-table-column label="属性值" min-width="280">
              <template #default="{ row }">
                <el-input v-model="row.value" placeholder="请设置属性默认值" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="{ row }">
                <el-button link type="danger" @click="removeProperty(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <!-- 集群拓扑(旧版 template-tree:虚线容器 + 集群节点 + 添加服务模板) -->
      <section class="form-group">
        <div class="group-header" @click="collapse.topo = !collapse.topo">
          <i :class="['bk-cmdb-icon icon-cc-triangle group-arrow', { collapsed: collapse.topo }]" />
          <span class="group-title">集群拓扑</span>
        </div>
        <div v-show="!collapse.topo" class="group-body">
          <div class="topo-box">
            <div class="topo-root">
              <i class="bk-cmdb-icon icon-cc-set topo-root-icon" />
              <el-input
                v-model.trim="form.name"
                class="topo-root-input"
                placeholder="模板集群名称"
                maxlength="256"
              />
            </div>
            <div class="topo-children">
              <div v-for="(tpl, index) in form.serviceTemplates" :key="tpl.id" class="topo-child">
                <span class="topo-line" />
                <i class="bk-cmdb-icon icon-cc-service-template topo-child-icon" />
                <span class="topo-child-name">{{ tpl.name }}（#{{ tpl.id }}）</span>
                <i class="bk-cmdb-icon icon-cc-tips-close topo-child-del" title="移除" @click="removeServiceTemplate(index)" />
              </div>
              <div class="topo-child">
                <span class="topo-line" />
                <el-dropdown trigger="click" @command="addServiceTemplate">
                  <span class="topo-add"><i class="bk-cmdb-icon icon-cc-plus topo-add-icon" /> 添加服务模板</span>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        v-for="t in addableTemplates"
                        :key="t.id"
                        :command="t.id"
                      >{{ t.name }}（#{{ t.id }}）</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 底部操作(旧版:创建=提交,编辑=保存) -->
    <div class="create-footer">
      <el-button type="primary" :loading="saving" @click="submit">{{ isEdit ? '保存' : '提交' }}</el-button>
      <el-button @click="cancel">取消</el-button>
    </div>

    <!-- 旧版 edit.vue 修改成功对话框:按 needSync 出现「同步集群」入口 -->
    <el-dialog v-model="successDialog" width="480px" :show-close="false" :close-on-click-modal="true">
      <div class="update-alert-layout">
        <i class="bk-cmdb-icon icon-cc-check update-check">✓</i>
        <h3>修改成功</h3>
        <p class="update-success-tips">{{ needSync ? '集群模板修改成功，您可以同步此配置到现有的集群实例或使用当前配置创建新集群' : '集群模板修改成功，您可以使用当前配置创建新集群' }}</p>
        <div class="btns">
          <el-button v-if="needSync" type="primary" @click="goDetailsTab">同步集群</el-button>
          <el-button :type="needSync ? 'default' : 'primary'" @click="goCreateSet">创建集群</el-button>
          <el-button @click="goDetails">关闭</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useBizStore } from '../../stores/biz'
import { searchServiceTemplates, searchModelAttributes, searchSetTemplateStatus, http } from '../../api/cmdb'

const route = useRoute()
const router = useRouter()
const bizStore = useBizStore()

const bizId = computed(() => Number(route.params.bizId) || bizStore.bizId)
// 旧版 management-form:create/edit 同一表单,templateId>0 为编辑态
const templateId = computed(() => Number(route.params.templateId) || 0)
const isEdit = computed(() => templateId.value > 0)

const collapse = reactive({ basic: false, property: false, topo: false })
const saving = ref(false)

const form = ref({ name: '', serviceTemplates: [] })
const templates = ref([])
const moduleAttrs = ref([])

const propertyRows = ref([])
const addableProperties = computed(() =>
  moduleAttrs.value.filter((p) => p.bk_property_id !== 'bk_set_name' && !propertyRows.value.some((r) => r.id === p.id))
)
function addProperty(id) {
  const prop = moduleAttrs.value.find((p) => p.id === id)
  if (prop) propertyRows.value.push({ id: prop.id, bk_property_name: prop.bk_property_name, bk_property_id: prop.bk_property_id, value: '' })
}
function removeProperty(row) {
  propertyRows.value = propertyRows.value.filter((r) => r.id !== row.id)
}

// 集群拓扑:已绑定服务模板节点
const addableTemplates = computed(() => templates.value.filter((t) => !form.value.serviceTemplates.some((s) => s.id === t.id)))
function addServiceTemplate(id) {
  const tpl = templates.value.find((t) => t.id === id)
  if (tpl) form.value.serviceTemplates.push(tpl)
}
function removeServiceTemplate(index) {
  form.value.serviceTemplates.splice(index, 1)
}

onMounted(async () => {
  await bizStore.ensureLoaded()
  try {
    const [tplRes, setProps] = await Promise.all([
      searchServiceTemplates(bizId.value, { start: 0, limit: 500 }),
      searchModelAttributes('set').catch(() => [])
    ])
    templates.value = tplRes?.info || []
    moduleAttrs.value = setProps || []
    // 编辑态:加载模板全量信息回填(旧版 find/topo/set_template/all_info)
    if (isEdit.value) {
      const data = await http.post('/find/topo/set_template/all_info', { bk_biz_id: bizId.value, id: templateId.value })
      form.value.name = data?.name || ''
      form.value.serviceTemplates = (data?.service_template_ids || [])
        .map((id) => templates.value.find((t) => t.id === id) || { id, name: `#${id}` })
      propertyRows.value = (data?.attributes || []).map((a) => {
        const p = moduleAttrs.value.find((prop) => prop.id === a.bk_attribute_id)
        return {
          id: a.bk_attribute_id,
          bk_property_name: p?.bk_property_name || a.bk_attribute_id,
          bk_property_id: p?.bk_property_id || '',
          value: a.bk_property_value
        }
      })
    }
  } catch (e) {
    ElMessage.error('数据加载失败: ' + (e?.message || '后端异常'))
  }
})

async function submit() {
  if (!form.value.name) {
    ElMessage.warning('请输入模板名称')
    collapse.basic = false
    return
  }
  if (!form.value.serviceTemplates.length) {
    ElMessage.warning('请至少添加一个服务模板')
    collapse.topo = false
    return
  }
  saving.value = true
  try {
    if (isEdit.value) {
      // 旧版契约:update/topo/set_template/all_info 全量更新
      await http.put('/update/topo/set_template/all_info', {
        id: templateId.value,
        bk_biz_id: bizId.value,
        name: form.value.name,
        service_template_ids: form.value.serviceTemplates.map((t) => t.id),
        attributes: propertyRows.value.map((r) => ({ bk_attribute_id: r.id, bk_property_value: r.value || null }))
      })
      needSync.value = !!(await searchSetTemplateStatus(bizId.value, {
        set_template_ids: [templateId.value]
      }).catch(() => []))?.[0]?.need_sync
      successDialog.value = true
    } else {
      // 旧版契约:create/topo/set_template/all_info 一次创建模板+绑定服务模板+属性
      await http.post('/create/topo/set_template/all_info', {
        bk_biz_id: bizId.value,
        name: form.value.name,
        service_template_ids: form.value.serviceTemplates.map((t) => t.id),
        attributes: propertyRows.value.map((r) => ({ bk_attribute_id: r.id, bk_property_value: r.value || null }))
      })
      ElMessage.success('创建成功')
      backToList()
    }
  } catch (e) {
    ElMessage.error((isEdit.value ? '保存失败' : '创建失败') + ': ' + (e?.message || '后端异常'))
  } finally {
    saving.value = false
  }
}

// ---------- 旧版 edit.vue 修改成功对话框 ----------
const successDialog = ref(false)
const needSync = ref(false)
function goDetailsTab() {
  successDialog.value = false
  router.push(`/business/${bizId.value}/set/template/details/${templateId.value}?tab=instance`)
}
function goCreateSet() {
  successDialog.value = false
  router.push(`/business/${bizId.value}/index`)
}
function goDetails() {
  successDialog.value = false
  router.push(`/business/${bizId.value}/set/template/details/${templateId.value}`)
}

function backToList() {
  router.push(`/business/${bizId.value}/set/template`)
}

function cancel() {
  backToList()
}
</script>

<style scoped>
.create-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #F5F7FA;
  overflow-y: auto;
}
.create-main {
  padding: 15px 20px 0;
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
/* 旧版基础信息:label 在输入框上方 */
.stack-field {
  max-width: 780px;
}
.stack-label {
  display: block;
  font-size: 14px;
  color: #63656E;
  margin-bottom: 10px;
}
.req-star {
  color: #EA3636;
  margin-right: 4px;
}
.create-container {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.create-tips {
  font-size: 12px;
  color: #979BA5;
}
.property-table {
  margin-top: 4px;
}
/* 集群拓扑虚线容器(旧版 template-tree) */
.topo-box {
  max-width: 900px;
  padding: 20px 24px 24px 24px;
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
.topo-root-input {
  max-width: 300px;
}
.topo-root-input :deep(.el-input__inner) {
  border-color: transparent;
}
.topo-root-input :deep(.el-input__inner:hover),
.topo-root-input :deep(.el-input__inner:focus) {
  border-color: #3A84FF;
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
.topo-line {
  display: none;
}
.topo-child-icon {
  font-size: 14px;
  color: #3A84FF;
}
.topo-child-name {
  font-size: 14px;
  color: #313238;
}
.topo-child-del {
  display: none;
  font-size: 12px;
  color: #979BA5;
  cursor: pointer;
}
.topo-child:hover .topo-child-del {
  display: inline;
}
.topo-child-del:hover {
  color: #EA3636;
}
.topo-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: #3A84FF;
  cursor: pointer;
}
.topo-add-icon {
  font-size: 14px;
}
.create-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 20px;
  background: #fff;
  border-top: 1px solid #DCDEE5;
  margin-top: 8px;
}
.create-footer .el-button {
  min-width: 86px;
}
/* 旧版修改成功对话框 */
.update-alert-layout {
  text-align: center;
}
.update-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  font-size: 30px;
  font-style: normal;
  color: #fff;
  border-radius: 50%;
  background: #2DCB56;
  margin: 8px 0 15px;
}
.update-alert-layout h3 {
  font-size: 24px;
  color: #313238;
  font-weight: normal;
  padding-bottom: 16px;
}
.update-success-tips {
  color: #63656E;
  padding-bottom: 24px;
}
.update-alert-layout .btns .el-button {
  min-width: 86px;
  margin-left: 8px;
}
</style>
