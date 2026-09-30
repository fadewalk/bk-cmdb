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

      <!-- 属性设置(旧版 property-config:分组弹窗选字段 + 类型化控件,除 bool 外必填) -->
      <section class="form-group">
        <div class="group-header" @click="collapse.property = !collapse.property">
          <i :class="['bk-cmdb-icon icon-cc-triangle group-arrow', { collapsed: collapse.property }]" />
          <span class="group-title">属性设置</span>
        </div>
        <div v-show="!collapse.property" class="group-body">
          <div class="create-container">
            <el-button :icon="'Plus'" @click="openPropertyModal">添加属性字段</el-button>
            <span class="create-tips">模板里定义的字段，在实例中将不可修改</span>
          </div>
          <div v-if="selectedGroups.length" class="selected-list">
            <div v-for="group in selectedGroups" :key="group.bk_group_id" class="selected-group">
              <div class="group-label" @click="togglePropGroup(group.bk_group_id)">
                <i :class="['bk-cmdb-icon icon-cc-triangle group-arrow', { collapsed: collapsedPropGroups[group.bk_group_id] }]" />
                <span>{{ group.bk_group_name }}</span>
              </div>
              <div v-show="!collapsedPropGroups[group.bk_group_id]" class="group-fields">
                <div v-for="prop in group.props" :key="prop.id" class="prop-item" :class="{ 'is-error': !!propErrors[prop.id] }">
                  <label class="prop-label" :title="prop.bk_property_name">
                    <span v-if="prop.bk_property_type !== 'bool'" class="req-star">*</span>
                    {{ prop.bk_property_name }}
                  </label>
                  <div class="prop-control">
                    <!-- int/float:数字输入,range 取 option.min/max -->
                    <el-input-number
                      v-if="['int', 'float'].includes(prop.bk_property_type)"
                      v-model="propertyConfig[prop.id]"
                      :controls="false"
                      :min="prop.option?.min"
                      :max="prop.option?.max"
                      :precision="prop.bk_property_type === 'int' ? 0 : undefined"
                      class="prop-input"
                    />
                    <!-- bool:开关 -->
                    <el-switch
                      v-else-if="prop.bk_property_type === 'bool'"
                      v-model="propertyConfig[prop.id]"
                    />
                    <!-- enum/list:枚举下拉 -->
                    <el-select
                      v-else-if="['enum', 'list'].includes(prop.bk_property_type)"
                      v-model="propertyConfig[prop.id]"
                      class="prop-input"
                      placeholder="请选择"
                      clearable
                    >
                      <el-option
                        v-for="opt in enumOptions(prop.option)"
                        :key="String(opt.id)"
                        :label="opt.name"
                        :value="opt.id"
                      />
                    </el-select>
                    <!-- date/time -->
                    <el-date-picker
                      v-else-if="prop.bk_property_type === 'date'"
                      v-model="propertyConfig[prop.id]"
                      type="date"
                      value-format="YYYY-MM-DD"
                      placeholder="请选择"
                      class="prop-input"
                    />
                    <el-date-picker
                      v-else-if="prop.bk_property_type === 'time'"
                      v-model="propertyConfig[prop.id]"
                      type="datetime"
                      value-format="YYYY-MM-DD HH:mm:ss"
                      placeholder="请选择"
                      class="prop-input"
                    />
                    <!-- enumquote/enummulti/organization:多选 -->
                    <el-select
                      v-else-if="['enumquote', 'enummulti', 'organization'].includes(prop.bk_property_type)"
                      v-model="propertyConfig[prop.id]"
                      class="prop-input"
                      multiple
                      placeholder="请选择"
                    >
                      <el-option
                        v-for="opt in enumOptions(prop.option)"
                        :key="String(opt.id)"
                        :label="opt.name"
                        :value="opt.id"
                      />
                    </el-select>
                    <!-- 其余类型统一文本输入(singlechar/longchar/objuser/foreignkey...) -->
                    <el-input
                      v-else
                      v-model="propertyConfig[prop.id]"
                      class="prop-input"
                      :maxlength="prop.bk_property_type === 'longchar' ? 2000 : 256"
                      placeholder="请输入"
                    />
                    <p v-if="propErrors[prop.id]" class="form-error">{{ propErrors[prop.id] }}</p>
                  </div>
                  <i class="bk-cmdb-icon icon-cc-tips-close prop-remove" title="移除" @click="removeProperty(prop)" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 集群拓扑(旧版 template-tree:虚线容器 + 集群节点 + 添加服务模板弹窗) -->
      <section class="form-group">
        <div class="group-header" @click="collapse.topo = !collapse.topo">
          <i :class="['bk-cmdb-icon icon-cc-triangle group-arrow', { collapsed: collapse.topo }]" />
          <span class="group-title">集群拓扑</span>
        </div>
        <div v-show="!collapse.topo" class="group-body">
          <div class="topo-box">
            <div class="topo-root">
              <span class="topo-root-icon">集</span>
              <span class="topo-root-name" :title="form.name || '模板集群名称'">{{ form.name || '模板集群名称' }}</span>
            </div>
            <div class="topo-children">
              <div v-for="(tpl, index) in form.serviceTemplates" :key="tpl.id" class="topo-child">
                <span class="topo-line" />
                <span class="topo-child-icon">模</span>
                <span class="topo-child-name" :title="tpl.name">{{ tpl.name }}</span>
                <span class="topo-child-options">
                  <a class="action-link" @click="viewServiceTemplate(tpl)">查看详情</a>
                  <!-- 编辑态:该服务模板下有主机时删除置灰,tooltip 内可跳转业务拓扑查看 -->
                  <el-popover
                    v-if="isEdit && serviceExistHost(tpl.id)"
                    placement="top"
                    :width="240"
                    trigger="hover"
                    :teleported="false"
                  >
                    <template #reference>
                      <a class="action-link disabled">删除</a>
                    </template>
                    <p class="service-tips">该模块下有主机不可删除，<a class="tips-link" @click="goTopoByKeyword(tpl)">跳转查看</a></p>
                  </el-popover>
                  <a v-else class="action-link" @click="removeServiceTemplate(index)">删除</a>
                </span>
              </div>
              <div class="topo-child">
                <span class="topo-line" />
                <span class="topo-child-icon add">＋</span>
                <a class="topo-add" @click="openServiceSelector">添加服务模板</a>
              </div>
            </div>
          </div>
          <p v-if="topoError" class="form-error topo-error">{{ topoError }}</p>
        </div>
      </section>
    </div>

    <!-- 底部操作(旧版:创建=提交,编辑=保存;编辑态未变更禁用) -->
    <div class="create-footer">
      <el-button type="primary" :loading="saving" :disabled="isEdit && !isFormChanged" @click="submit">{{ isEdit ? '保存' : '提交' }}</el-button>
      <el-button @click="cancel">取消</el-button>
    </div>

    <!-- 旧版选择模型字段弹窗(property-modal:分组 + 搜索 + 三列复选) -->
    <el-dialog v-model="propertyModalVisible" title="选择模型字段" width="730px" :close-on-click-modal="false" class="property-modal">
      <el-input
        v-model="propertySearch"
        class="pm-search"
        placeholder="请输入字段名称搜索"
        clearable
        suffix-icon="Search"
      />
      <div class="pm-container">
        <div v-for="(item, gi) in modalGroups" :key="gi" class="pm-group">
          <p v-if="item.props.length" class="pm-group-title">{{ item.name }}</p>
          <div class="pm-list">
            <el-checkbox
              v-for="prop in item.props"
              :key="prop.bk_property_id"
              :model-value="modalSelected.some((p) => p.id === prop.id)"
              :disabled="isModalPropDisabled(prop)"
              @change="(checked) => toggleModalProperty(prop, checked)"
            >
              <el-tooltip v-if="isModalPropDisabled(prop)" content="该字段不支持配置" placement="top-start">
                <span>{{ prop.bk_property_name }}</span>
              </el-tooltip>
              <span v-else>{{ prop.bk_property_name }}</span>
            </el-checkbox>
          </div>
        </div>
        <div v-if="!modalHasField" class="pm-empty">
          <el-empty :image-size="60" description="暂无数据" />
          <el-button v-if="propertySearch" link type="primary" @click="propertySearch = ''">清除筛选</el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="propertyModalVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmPropertyModal">确定</el-button>
      </template>
    </el-dialog>

    <!-- 旧版添加服务模板弹窗(service-template-selector:分类筛选/搜索/全选/进程浮层/主机禁选) -->
    <el-dialog v-model="selectorVisible" title="添加服务模板" width="840px" :close-on-click-modal="false">
      <div class="svc-selector">
        <div class="svc-top">
          <el-select
            v-model="svcFilter.primaryCategory"
            class="svc-filter"
            placeholder="所有一级分类"
            filterable
            clearable
            @change="onPrimaryCategoryChange"
          >
            <el-option v-for="c in primaryCategoryList" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-select
            v-model="svcFilter.secCategory"
            class="svc-filter"
            :placeholder="secCategoryEmptyText"
            filterable
            clearable
            :no-data-text="secCategoryEmptyText"
            @change="filterSvcTemplates"
          >
            <el-option v-for="c in secCategoryList" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <el-input
            v-model.trim="svcFilter.templateName"
            class="svc-filter"
            placeholder="请输入模板名称搜索"
            clearable
            suffix-icon="Search"
            @input="filterSvcTemplates"
          />
          <span class="svc-select-all">
            <el-checkbox
              :model-value="isSelectAll"
              :indeterminate="isHalfSelected"
              @change="handleSelectAllSvc"
            >全选</el-checkbox>
          </span>
        </div>
        <div class="svc-list" :style="{ height: filteredSvcTemplates.length ? '264px' : '306px' }" v-loading="svcLoading">
          <template v-if="filteredSvcTemplates.length">
            <div
              v-for="tpl in filteredSvcTemplates"
              :key="tpl.id"
              class="svc-item"
              :class="{ 'is-selected': svcLocalSelected.includes(tpl.id), disabled: serviceExistHost(tpl.id) }"
              @click="toggleSvcTemplate(tpl)"
              @mouseenter="showSvcDetails(tpl, $event)"
              @mouseleave="hideSvcDetails"
            >
              <i class="svc-check bk-cmdb-icon icon-cc-check" />
              <span class="svc-name" :title="tpl.name">{{ tpl.name }}</span>
            </div>
          </template>
          <div v-else class="svc-empty">
            <el-empty :image-size="60" description="暂无数据" />
            <p>
              <a class="tips-link" @click="goServiceTemplatePage">去添加服务模板</a>
              <el-button v-if="hasSvcFilter" link type="primary" class="clear-filter" @click="clearSvcFilter">清除筛选</el-button>
            </p>
          </div>
        </div>
        <!-- hover 进程浮层(旧版 $bkPopover 手动定位) -->
        <div
          v-show="svcTips.show"
          class="svc-details"
          :style="{ left: svcTips.left + 'px', top: svcTips.top + 'px' }"
        >
          <div v-if="svcTips.disabled" class="disabled-tips">该模块下有主机不可取消</div>
          <div class="info-item"><span class="label">模板名称 ：</span><div class="details">{{ svcTips.template?.name }}</div></div>
          <div class="info-item"><span class="label">服务分类 ：</span><div class="details">{{ svcTips.template?.category || '--' }}</div></div>
          <div class="info-item">
            <span class="label">服务进程 ：</span>
            <div class="details">
              <template v-if="svcTips.loading">加载中...</template>
              <template v-else>
                <p v-for="(item, idx) in svcTips.processes" :key="idx">{{ item }}</p>
                <p v-if="!svcTips.processes.length">模板没配置进程</p>
              </template>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="svc-footer">
          <div v-if="allSvcTemplates.length" class="svc-summary">
            已选<em class="num">{{ svcLocalSelected.length }}</em>个
            <a class="tips-link to-template" @click="goServiceTemplatePage">跳转服务模板</a>
          </div>
          <div class="svc-actions">
            <el-button @click="selectorVisible = false">取消</el-button>
            <el-button type="primary" @click="confirmServiceSelector">确定</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- 查看服务模板信息(旧版 service-template-info:分类 + 进程表) -->
    <el-dialog v-model="infoVisible" :title="`【${infoTemplate?.name}】模板服务信息`" width="840px">
      <p class="info-title">服务分类：{{ infoTemplate?.category || '--' }}</p>
      <el-table :data="infoProcesses" v-loading="infoLoading" height="276" :show-header="!!infoProcesses.length">
        <el-table-column
          v-for="head in infoHeaders"
          :key="head.id"
          :prop="head.id"
          :label="head.name"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ formatInfoValue(row[head.id], head) }}</template>
        </el-table-column>
        <template #empty>
          <el-empty :image-size="60" description="暂无数据" />
        </template>
      </el-table>
    </el-dialog>

    <!-- 旧版创建/编辑成功对话框 -->
    <el-dialog v-model="successDialog" width="480px" :show-close="false" :close-on-click-modal="true">
      <div class="update-alert-layout">
        <i class="bk-cmdb-icon icon-cc-check update-check">✓</i>
        <template v-if="successMode === 'create'">
          <h3>创建成功</h3>
          <p class="update-success-tips">创建集群模板成功，您可以跳转到业务拓扑创建集群实例</p>
          <div class="btns">
            <el-button type="primary" @click="goCreateSet">创建集群</el-button>
            <el-button @click="backToList">返回列表</el-button>
          </div>
        </template>
        <template v-else>
          <h3>修改成功</h3>
          <p class="update-success-tips">{{ needSync ? '集群模板修改成功，您可以同步此配置到现有的集群实例或使用当前配置创建新集群' : '集群模板修改成功，您可以使用当前配置创建新集群' }}</p>
          <div class="btns">
            <el-button v-if="needSync" type="primary" @click="goDetailsTab">同步集群</el-button>
            <el-button :type="needSync ? 'default' : 'primary'" @click="goCreateSet">创建集群</el-button>
            <el-button @click="goDetails">关闭</el-button>
          </div>
        </template>
      </div>
    </el-dialog>
    <!-- 离开确认(旧版 cmdb-leave-confirm 语义) -->
    <el-dialog v-model="leaveDialog" width="400px" :show-close="false" :close-on-click-modal="false" class="leave-confirm-dialog">
      <div class="leave-body">
        <p class="leave-title">确认离开当前页？</p>
        <p class="leave-content">离开将会导致未保存信息丢失</p>
        <div class="btns">
          <el-button @click="cancelLeave">取消</el-button>
          <el-button type="primary" @click="confirmLeave">离开</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useBizStore } from '../../stores/biz'
import { BUILTIN_UNEDITABLE_FIELDS } from '../../utils/model-constants'
import {
  searchServiceTemplates,
  searchModelAttributes,
  searchSetTemplateStatus,
  createSetTemplateAllInfo,
  updateSetTemplateAllInfo,
  getSetTemplateFullInfo,
  getSetTemplateServices,
  countSetTemplateSvcTemplateHosts,
  searchServiceCategoriesPlain,
  searchModelPropertyGroups,
  searchProcTemplates
} from '../../api/cmdb'

// 老版 lodash isEqual 的轻量替代:仅用于表单快照(纯值/数组对象)
function isDeepEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

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
const setAttrs = ref([])
const setGroups = ref([])
const processAttrs = ref([])

// ---------- 属性设置(旧版 property-config 契约) ----------
// 配置值 map:key=属性 id,值按类型化控件填写(bool/0 等假值原样保留)
const propertyConfig = reactive({})
const selectedProperties = ref([])
const collapsedPropGroups = reactive({})
const propErrors = reactive({})
const propertySearch = ref('')
const propertyModalVisible = ref(false)
const modalSelected = ref([])

// 老版 exclude = bk_set_name + 内置不可编辑字段
const excludedPropKeys = ['bk_set_name', ...BUILTIN_UNEDITABLE_FIELDS]
const selectableProperties = computed(() =>
  setAttrs.value.filter((p) => !excludedPropKeys.includes(p.bk_property_id) && !p.bk_isapi))

const enumOptions = (option) => (option || [])
  .map((o) => (typeof o === 'object' ? o : { id: o, name: String(o) }))

// 老版 use-property 分组:公开分组在前、业务自定义分组在后,按 bk_group_index 排序
const sortedGroups = computed(() => {
  const publicGroups = []
  const bizCustomGroups = []
  setGroups.value.forEach((group) => {
    if (group.bk_biz_id > 0) bizCustomGroups.push(group)
    else publicGroups.push(group)
  })
  publicGroups.sort((a, b) => a.bk_group_index - b.bk_group_index)
  bizCustomGroups.sort((a, b) => a.bk_group_index - b.bk_group_index)
  return [...publicGroups, ...bizCustomGroups]
})

function propsOfGroup(group, props) {
  return props.filter((p) => {
    // 老版兼容:none 分组的属性归入默认分组
    if (p.bk_property_group === 'none') return group.bk_group_id === 'default'
    return p.bk_property_group === group.bk_group_id
  })
}

// 弹窗分组(全量字段按分组展示)
const modalGroups = computed(() => sortedGroups.value
  .map((group) => ({ name: group.bk_group_name, props: propsOfGroup(group, selectableProperties.value) })))
const modalHasField = computed(() => modalGroups.value.some((item) => item.props.length))

// 已选字段分组(仅含已选中的)
const selectedGroups = computed(() => sortedGroups.value
  .map((group) => ({ ...group, props: propsOfGroup(group, selectedProperties.value) }))
  .filter((group) => group.props.length))

function togglePropGroup(groupId) {
  collapsedPropGroups[groupId] = !collapsedPropGroups[groupId]
}

function isModalPropDisabled(prop) {
  return !prop.editable || prop.bk_property_type === 'inner_table'
}

function openPropertyModal() {
  modalSelected.value = selectedProperties.value.slice()
  propertySearch.value = ''
  propertyModalVisible.value = true
}

function toggleModalProperty(prop, checked) {
  const index = modalSelected.value.findIndex((p) => p.id === prop.id)
  if (checked && index === -1) modalSelected.value.push(prop)
  else if (!checked && index > -1) modalSelected.value.splice(index, 1)
}

function confirmPropertyModal() {
  selectedProperties.value = modalSelected.value.slice()
  // 老版契约:新添加的属性初始化为类型化默认值
  selectedProperties.value.forEach((prop) => {
    if (!(prop.id in propertyConfig)) propertyConfig[prop.id] = defaultValueOf(prop)
  })
  propertyModalVisible.value = false
}

// 老版 getPropertyDefaultValue:按类型回退到模型默认值
function defaultValueOf(prop) {
  const type = prop.bk_property_type
  if (type === 'bool') {
    let d = prop.default
    if (typeof d !== 'boolean') d = prop.option
    return typeof d === 'boolean' ? d : false
  }
  if (type === 'enum' || type === 'list') {
    const defaultOpt = (prop.option || []).find((o) => o && typeof o === 'object' && o.is_default)
    if (prop.default != null) return prop.default
    return typeof defaultOpt !== 'undefined' ? (typeof defaultOpt === 'object' ? defaultOpt.id : defaultOpt) : ''
  }
  if (type === 'date' || type === 'time') return prop.default || null
  if (type === 'int' || type === 'float') return prop.default ?? ''
  if (['enumquote', 'enummulti', 'organization'].includes(type)) {
    if (Array.isArray(prop.default)) return prop.default
    return prop.default != null ? [prop.default] : []
  }
  return prop.default || ''
}

function removeProperty(prop) {
  selectedProperties.value = selectedProperties.value.filter((p) => p.id !== prop.id)
  delete propertyConfig[prop.id]
  delete propErrors[prop.id]
}

// 属性校验(老版:除 bool 外必填)
function validateProperties() {
  Object.keys(propErrors).forEach((k) => delete propErrors[k])
  let valid = true
  for (const prop of selectedProperties.value) {
    if (prop.bk_property_type === 'bool') continue
    const value = propertyConfig[prop.id]
    const empty = value === '' || value === null || value === undefined
      || (Array.isArray(value) && !value.length)
    if (empty) {
      const isSelectType = ['enum', 'list', 'enumquote', 'enummulti', 'organization', 'date', 'time'].includes(prop.bk_property_type)
      propErrors[prop.id] = (isSelectType ? '请选择' : '请输入') + prop.bk_property_name
      valid = false
    }
  }
  return valid
}

// ---------- 集群拓扑(旧版 template-tree + service-template-selector 契约) ----------
const topoError = ref('')
const servicesHost = ref([])

// 老版 getServicesHost:rollReq 100 分批取每个服务模板下主机数
async function loadServicesHost(serviceIds) {
  const hostCounts = []
  for (let index = 0; index < serviceIds.length; index += 100) {
    const ids = serviceIds.slice(index, index + 100)
    const data = await countSetTemplateSvcTemplateHosts(bizId.value, templateId.value, ids).catch(() => [])
    hostCounts.push(...(data || []))
  }
  servicesHost.value = serviceIds.map((id) => ({
    service_id: id,
    host_count: hostCounts.find((item) => item.id === id)?.count
  }))
}

function serviceExistHost(id) {
  const service = servicesHost.value.find((s) => s.service_id === id)
  return service ? service.host_count > 0 : false
}

// 选择器弹窗
const selectorVisible = ref(false)
const svcLoading = ref(false)
const allSvcTemplates = ref([])
const filteredSvcTemplates = ref([])
const svcLocalSelected = ref([])
const svcFilter = reactive({ primaryCategory: '', secCategory: '', templateName: '' })
const categoryList = ref([])
const primaryCategoryList = computed(() => categoryList.value.filter((c) => !c.bk_parent_id))
const secCategoryList = computed(() => categoryList.value.filter((c) => c.bk_parent_id === svcFilter.primaryCategory))
const secCategoryEmptyText = computed(() => (svcFilter.primaryCategory ? '没有二级分类' : '请选择一级分类'))
const hasSvcFilter = computed(() => svcFilter.primaryCategory || svcFilter.secCategory || svcFilter.templateName)
const isSelectAll = computed(() => svcLocalSelected.value.length === filteredSvcTemplates.value.length)
const isHalfSelected = computed(() => !isSelectAll.value && svcLocalSelected.value.length > 0)
const templateDetailsCache = {}

// hover 进程浮层(老版 300ms debounce 手动 popover)
const svcTips = reactive({ show: false, left: 0, top: 0, template: {}, processes: [], loading: false, disabled: false })
let showTimer = null
let hideTimer = null

async function openServiceSelector() {
  svcLocalSelected.value = form.value.serviceTemplates.map((t) => t.id)
  svcFilter.primaryCategory = ''
  svcFilter.secCategory = ''
  svcFilter.templateName = ''
  selectorVisible.value = true
  if (!allSvcTemplates.value.length) {
    svcLoading.value = true
    try {
      const [catRes, tplRes] = await Promise.all([
        searchServiceCategoriesPlain(bizId.value).catch(() => ({ info: [] })),
        searchServiceTemplates(bizId.value, { start: 0, limit: 1000, sort: 'name' })
      ])
      categoryList.value = catRes?.info || []
      // 老版契约:分类写入模板并拼出「一级 / 二级」展示串
      allSvcTemplates.value = (tplRes?.info || []).map((tpl) => {
        const secCategory = categoryList.value.find((c) => c.id === tpl.service_category_id)
        const primaryCategory = categoryList.value.find((c) => c.id === secCategory?.bk_parent_id)
        return {
          ...tpl,
          parent_service_category_id: primaryCategory?.id,
          category: `${primaryCategory?.name || '--'} / ${secCategory?.name || '--'}`
        }
      })
      filterSvcTemplates()
    } finally {
      svcLoading.value = false
    }
  } else {
    filterSvcTemplates()
  }
}

function onPrimaryCategoryChange() {
  svcFilter.secCategory = ''
  filterSvcTemplates()
}

// 老版 filterTemplate:分类交集 + 名称过滤
function filterSvcTemplates() {
  const { primaryCategory, secCategory, templateName } = svcFilter
  let results = allSvcTemplates.value.slice()
  if (primaryCategory) results = results.filter((t) => t.parent_service_category_id === primaryCategory)
  if (secCategory) results = results.filter((t) => t.service_category_id === secCategory)
  if (templateName) results = results.filter((t) => t.name.indexOf(templateName) > -1)
  // 老版契约:选中的显示在前
  filteredSvcTemplates.value = results.sort((a, b) =>
    (svcLocalSelected.value.includes(b.id) ? 1 : 0) - (svcLocalSelected.value.includes(a.id) ? 1 : 0))
}

function toggleSvcTemplate(tpl) {
  if (serviceExistHost(tpl.id)) return
  const index = svcLocalSelected.value.indexOf(tpl.id)
  if (index > -1) svcLocalSelected.value.splice(index, 1)
  else svcLocalSelected.value.push(tpl.id)
}

// 老版 handleSelectAll:编辑态取消全选时保留含主机的服务模板
function handleSelectAllSvc(checked) {
  if (checked) {
    svcLocalSelected.value = filteredSvcTemplates.value.map((t) => t.id)
  } else if (isEdit.value) {
    svcLocalSelected.value = filteredSvcTemplates.value
      .filter((t) => serviceExistHost(t.id))
      .map((t) => t.id)
  } else {
    svcLocalSelected.value = []
  }
}

function clearSvcFilter() {
  svcFilter.primaryCategory = ''
  svcFilter.secCategory = ''
  svcFilter.templateName = ''
}

function goServiceTemplatePage() {
  router.push(`/business/${bizId.value}/service/template`)
}

function showSvcDetails(tpl, event) {
  clearTimeout(hideTimer)
  clearTimeout(showTimer)
  showTimer = setTimeout(async () => {
    const rect = event.currentTarget.getBoundingClientRect()
    const width = 260
    let left = rect.right + 8
    if (left + width > window.innerWidth) left = rect.left - width - 8
    svcTips.left = Math.max(8, left)
    svcTips.top = rect.top
    svcTips.template = tpl
    svcTips.disabled = serviceExistHost(tpl.id)
    svcTips.processes = templateDetailsCache[tpl.id] || []
    svcTips.loading = !templateDetailsCache[tpl.id]
    svcTips.show = true
    if (templateDetailsCache[tpl.id]) return
    try {
      const data = await searchProcTemplates(bizId.value, { service_template_id: tpl.id })
      // 老版 setProcessInfo:进程别名 + 监听端口拼接
      const processes = (data?.info || []).map((row) => {
        const port = row.property?.port?.value || ''
        return `${row.bk_process_name?.value || row.property?.bk_process_name?.value || row.bk_process_name || ''}${port ? `:${port}` : ''}`
      })
      templateDetailsCache[tpl.id] = processes
      if (svcTips.template?.id === tpl.id) {
        svcTips.processes = processes
        svcTips.loading = false
      }
    } catch {
      svcTips.loading = false
    }
  }, 300)
}

function hideSvcDetails() {
  clearTimeout(showTimer)
  hideTimer = setTimeout(() => { svcTips.show = false }, 300)
}

function confirmServiceSelector() {
  form.value.serviceTemplates = svcLocalSelected.value
    .map((id) => allSvcTemplates.value.find((t) => t.id === id))
    .filter(Boolean)
  selectorVisible.value = false
}

// 查看服务模板信息
const infoVisible = ref(false)
const infoLoading = ref(false)
const infoTemplate = ref(null)
const infoProcesses = ref([])
const infoHeaders = [
  { id: 'bk_func_name', name: '功能名称' },
  { id: 'bk_process_name', name: '进程别名' },
  { id: 'bk_start_param_regex', name: '启动参数匹配规则' },
  { id: 'bind_info', name: '绑定信息' }
]

async function viewServiceTemplate(tpl) {
  infoTemplate.value = tpl
  infoVisible.value = true
  infoLoading.value = true
  try {
    // 旧版 service-template-info:分类在弹窗内解析(树节点对象不带 category)
    if (!categoryList.value.length) {
      const catRes = await searchServiceCategoriesPlain(bizId.value).catch(() => ({ info: [] }))
      categoryList.value = catRes?.info || []
    }
    if (infoTemplate.value && !infoTemplate.value.category) {
      const sec = categoryList.value.find((c) => c.id === infoTemplate.value.service_category_id)
      const pri = categoryList.value.find((c) => c.id === sec?.bk_parent_id)
      infoTemplate.value = { ...infoTemplate.value, category: `${pri?.name || '--'} / ${sec?.name || '--'}` }
    }
    const data = await searchProcTemplates(bizId.value, { service_template_id: tpl.id })
    // 老版 service-template-info:property.{key}.value 解包成表格行
    infoProcesses.value = (data?.info || []).map((row) => {
      const process = {}
      Object.entries(row.property || {}).forEach(([key, val]) => { process[key] = val?.value })
      return process
    })
  } catch {
    infoProcesses.value = []
  } finally {
    infoLoading.value = false
  }
}

function formatInfoValue(value, property) {
  if (property?.id === 'bind_info') {
    if (!Array.isArray(value) || !value.length) return '--'
    return value.map((item) => `${item.ip || ''}:${item.port || ''}`).join('；')
  }
  if (value === null || value === undefined || value === '') return '--'
  return String(value)
}

// 老版 handleGoTopoBusiness:跳业务拓扑并按模块名搜索
function goTopoByKeyword(tpl) {
  router.push(`/business/${bizId.value}/index?keyword=${encodeURIComponent(tpl.name)}`)
}

// ---------- 编辑态数据加载 + 脏门控(老版 isEqual 快照) ----------
// ref:保存成功后刷新快照需触发 isFormChanged 重算(普通变量不被 computed 追踪)
const formDataCopy = ref(null)
const originalServiceIds = ref([])

const isFormChanged = computed(() => {
  if (!isEdit.value) return true
  const current = {
    templateName: form.value.name,
    propertyConfig: { ...propertyConfig }
  }
  if (!isDeepEqual(formDataCopy.value, current)) return true
  const serviceIds = form.value.serviceTemplates.map((t) => t.id)
  if (serviceIds.length !== originalServiceIds.value.length) return true
  return serviceIds.some((id, index) => id !== originalServiceIds.value[index])
})

// 老版 cmdb-leave-confirm:有未保存变更时离开需确认
// 同步守卫 + 自绘对话框:hash history 下异步 MessageBox 取消后浏览器历史恢复不可靠
const leaveDialog = ref(false)
let pendingLeave = null
let forceLeave = false
onBeforeRouteLeave((to) => {
  if (forceLeave) {
    forceLeave = false
    return true
  }
  if (!isEdit.value || !isFormChanged.value) return true
  pendingLeave = to
  leaveDialog.value = true
  return false
})
function confirmLeave() {
  const to = pendingLeave
  pendingLeave = null
  leaveDialog.value = false
  forceLeave = true
  if (to) router.push(to.fullPath)
}
function cancelLeave() {
  pendingLeave = null
  leaveDialog.value = false
}

onMounted(async () => {
  await bizStore.ensureLoaded()
  try {
    const [setProps, setPropGroups] = await Promise.all([
      searchModelAttributes('set', bizId.value).catch(() => []),
      searchModelPropertyGroups('set', bizId.value).catch(() => [])
    ])
    setAttrs.value = setProps || []
    setGroups.value = setPropGroups || []
    // 编辑态:加载模板全量信息回填(老版 find/topo/set_template/all_info)
    if (isEdit.value) {
      const [data, serviceList] = await Promise.all([
        getSetTemplateFullInfo(bizId.value, templateId.value),
        getSetTemplateServices(bizId.value, templateId.value).catch(() => [])
      ])
      form.value.name = data?.name || ''
      // 旧版 template-tree:服务模板节点来自 service_templates 接口(含名称),而非全量列表映射
      form.value.serviceTemplates = serviceList || []
      originalServiceIds.value = form.value.serviceTemplates.map((t) => t.id)
      selectedProperties.value = (data?.attributes || [])
        .map((a) => setAttrs.value.find((prop) => prop.id === a.bk_attribute_id))
        .filter(Boolean)
      ;(data?.attributes || []).forEach((a) => { propertyConfig[a.bk_attribute_id] = a.bk_property_value })
      // 老版快照:用于 isEqual 脏检测,未变更禁用提交
      formDataCopy.value = {
        templateName: form.value.name,
        propertyConfig: JSON.parse(JSON.stringify(propertyConfig))
      }
      // 老版契约:编辑态拉取各服务模板下主机数(rollReq 100)
      if (form.value.serviceTemplates.length) {
        loadServicesHost(form.value.serviceTemplates.map((t) => t.id))
      }
    }
  } catch (e) {
    ElMessage.error('数据加载失败: ' + (e?.message || '后端异常'))
  }
})

onBeforeUnmount(() => {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
})

// ---------- 提交(老版契约:统一 all_info 组合端点,attributes 可为空数组) ----------
const successDialog = ref(false)
const successMode = ref('create')
const needSync = ref(false)

async function submit() {
  topoError.value = ''
  if (!form.value.name) {
    ElMessage.warning('请输入模板名称')
    collapse.basic = false
    return
  }
  if (!form.value.serviceTemplates.length) {
    topoError.value = '请添加服务模板'
    collapse.topo = false
    return
  }
  if (!validateProperties()) {
    collapse.property = false
    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.value.name,
      service_template_ids: form.value.serviceTemplates.map((t) => t.id),
      attributes: selectedProperties.value.map((prop) => ({
        bk_attribute_id: prop.id,
        // 老版契约:值原样提交,bool false / 0 等假值不清洗
        bk_property_value: propertyConfig[prop.id] ?? null
      }))
    }
    if (isEdit.value) {
      await updateSetTemplateAllInfo(bizId.value, templateId.value, payload)
      // 旧版契约:保存成功后 leaveConfirm 不再拦截(快照对齐已保存状态)
      formDataCopy.value = {
        templateName: form.value.name,
        propertyConfig: JSON.parse(JSON.stringify(propertyConfig))
      }
      originalServiceIds.value = form.value.serviceTemplates.map((t) => t.id)
      needSync.value = !!(await searchSetTemplateStatus(bizId.value, {
        set_template_ids: [templateId.value]
      }).catch(() => []))?.[0]?.need_sync
      successMode.value = 'edit'
      successDialog.value = true
    } else {
      await createSetTemplateAllInfo(bizId.value, payload)
      successMode.value = 'create'
      successDialog.value = true
    }
  } catch (e) {
    ElMessage.error((isEdit.value ? '保存失败' : '创建失败') + ': ' + (e?.message || '后端异常'))
  } finally {
    saving.value = false
  }
}

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
  if (isEdit.value) {
    router.back()
  } else {
    backToList()
  }
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
/* 已选属性分组(旧版 cmdb-collapse 分组展示) */
.selected-list {
  margin-top: 16px;
  max-width: 960px;
}
.selected-group {
  border: 1px solid #DCDEE5;
  border-radius: 2px;
  padding: 0 16px 8px;
}
.selected-group + .selected-group {
  margin-top: 12px;
}
.group-label {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  font-size: 14px;
  font-weight: 700;
  color: #63656E;
  cursor: pointer;
  user-select: none;
}
.group-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(360px, 560px));
  gap: 12px 24px;
  padding: 8px 0 16px;
}
.prop-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  padding: 2px 24px 4px 0;
}
.prop-item:hover {
  background: #F5F6FA;
}
.prop-item:hover .prop-remove {
  opacity: 1;
}
.prop-label {
  flex: 0 0 120px;
  font-size: 14px;
  color: #63656E;
  line-height: 32px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prop-control {
  flex: 1;
  min-width: 0;
}
.prop-input {
  width: 100%;
}
.prop-remove {
  position: absolute;
  right: 0;
  top: 8px;
  font-size: 14px;
  color: #979BA5;
  cursor: pointer;
  opacity: 0;
}
.prop-remove:hover {
  color: #EA3636;
}
.form-error {
  margin-top: 4px;
  font-size: 12px;
  color: #EA3636;
}
.topo-error {
  margin-top: 8px;
}
/* 集群拓扑虚线容器(旧版 template-tree) */
.topo-box {
  max-width: 900px;
  padding: 10px 0 10px 20px;
  border: 1px dashed #C4C6CC;
  border-radius: 2px;
  background: #FAFBFD;
}
.topo-root {
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 36px;
}
.topo-root-icon {
  flex: 0 0 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  font-size: 12px;
  color: #fff;
  background: #97AED6;
  border-radius: 50%;
}
.topo-root-name {
  font-size: 14px;
  color: #63656E;
}
.topo-children {
  margin-left: 32px;
  line-height: 36px;
}
.topo-child {
  display: flex;
  align-items: center;
  height: 36px;
  position: relative;
  padding: 0 10px 0 0;
}
.topo-child::before {
  content: "";
  position: absolute;
  left: -14px;
  top: -18px;
  width: 14px;
  height: 36px;
  border-left: 1px dashed #DCDEE5;
  border-bottom: 1px dashed #DCDEE5;
}
.topo-child:hover {
  background: rgba(240, 241, 245, .6);
}
.topo-child:hover .topo-child-name,
.topo-child:hover .action-link {
  color: #3A84FF;
}
.topo-child:hover .topo-child-options {
  display: inline-flex;
}
.topo-child-icon {
  flex: 0 0 20px;
  height: 20px;
  margin-right: 6px;
  line-height: 20px;
  text-align: center;
  font-size: 12px;
  font-style: normal;
  color: #fff;
  background: #97AED6;
  border-radius: 50%;
}
.topo-child-icon.add {
  background: transparent;
  color: #3A84FF;
  font-size: 14px;
}
.topo-child-name {
  font-size: 14px;
  color: #63656E;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.topo-child-options {
  display: none;
  margin-left: auto;
  margin-right: 9px;
  gap: 4px;
}
.action-link {
  font-size: 12px;
  color: #3A84FF;
  margin: 0 6px;
  cursor: pointer;
}
.action-link.disabled {
  color: #C4C6CC;
  cursor: not-allowed;
}
.topo-add {
  font-size: 14px;
  color: #3A84FF;
  cursor: pointer;
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
/* 选择模型字段弹窗(旧版 property-modal) */
.pm-search {
  width: 280px;
  margin-bottom: 10px;
}
.pm-container {
  height: 264px;
  overflow-y: auto;
}
.pm-group-title {
  position: relative;
  margin: 14px 0 0 0;
  padding: 0 0 0 15px;
  line-height: 20px;
  font-size: 14px;
  font-weight: bold;
  color: #63656E;
}
.pm-group-title::before {
  content: "";
  position: absolute;
  left: 0;
  top: 3px;
  width: 4px;
  height: 14px;
  background-color: #C4C6CC;
}
.pm-list {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
}
.pm-list .el-checkbox {
  flex: 0 0 33.3333%;
  margin: 8px 0;
}
.pm-empty {
  text-align: center;
}
/* 服务模板选择器(旧版 service-template-selector) */
.svc-top {
  display: flex;
  margin-bottom: 24px;
}
.svc-filter {
  width: 210px;
  margin-right: 10px;
}
.svc-select-all {
  line-height: 32px;
  margin-left: auto;
}
.svc-list {
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
}
.svc-item {
  position: relative;
  width: calc((100% - 30px) / 3);
  height: 32px;
  margin: 0 0 16px 0;
  padding: 0 6px 0 10px;
  line-height: 30px;
  border-radius: 2px;
  border: 1px solid #DCDEE5;
  color: #63656E;
  cursor: pointer;
}
.svc-item:nth-child(3n + 2) {
  margin: 0 10px 16px;
}
.svc-item.is-selected {
  background-color: #E1ECFF;
}
.svc-item.is-selected .svc-check {
  color: #3A84FF;
  border-color: #3A84FF;
}
.svc-item.disabled {
  cursor: not-allowed;
}
.svc-item.disabled .svc-check {
  color: #C4C6CC;
  border-color: #DCDEE5;
}
.svc-check {
  position: absolute;
  right: 6px;
  top: 6px;
  width: 18px;
  height: 18px;
  font-size: 18px;
  color: #fff;
  background: #fff;
  border: 1px solid #979BA5;
  border-radius: 50%;
}
.svc-name {
  display: block;
  max-width: calc(100% - 18px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.svc-empty {
  width: 100%;
  text-align: center;
}
.svc-empty p {
  margin: 0;
}
.svc-empty .clear-filter {
  margin-left: 10px;
}
.svc-details {
  position: fixed;
  z-index: 3000;
  min-width: 160px;
  padding: 10px 12px;
  background: #fff;
  border-radius: 2px;
  box-shadow: 0 0 6px 0 rgba(0, 0, 0, .2);
  line-height: 20px;
}
.svc-details .disabled-tips {
  border-bottom: 1px solid #FFFFFF;
  padding-bottom: 6px;
  margin-bottom: 6px;
  font-size: 12px;
}
.svc-details .info-item {
  display: flex;
  font-size: 12px;
}
.svc-details .label {
  font-weight: 700;
}
.svc-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.svc-summary {
  font-size: 14px;
}
.svc-summary .num {
  color: #2DCB56;
  font-style: normal;
  font-weight: 700;
  margin: 0 3px;
}
.svc-summary .to-template {
  margin-left: 16px;
}
.tips-link {
  color: #3A84FF;
  cursor: pointer;
}
/* 查看服务模板信息 */
.info-title {
  font-size: 14px;
  line-height: 20px;
  margin: -6px 0 16px;
}
/* 成功对话框 */
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
/* 离开确认对话框(teleport 出组件,样式需非 scoped 生效,这里用全局段) */
</style>

<style>
.leave-confirm-dialog .leave-body {
  text-align: center;
  padding: 12px 0 4px;
}
.leave-confirm-dialog .leave-title {
  font-size: 18px;
  color: #313238;
  margin: 0 0 12px;
}
.leave-confirm-dialog .leave-content {
  font-size: 14px;
  color: #63656E;
  margin: 0 0 20px;
}
.leave-confirm-dialog .btns .el-button {
  min-width: 80px;
  margin-left: 8px;
}
</style>
