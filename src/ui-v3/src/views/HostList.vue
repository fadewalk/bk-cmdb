<template>
  <div class="host-page">
    <!-- 老版头部:返回箭头 + 标题 + 新窗口打开 -->
    <div class="page-header">
      <i class="bk-cmdb-icon icon-cc-arrow back-arrow" title="返回" @click="goBack" />
      <h1 class="page-title">主机</h1>
      <i class="bk-cmdb-icon icon-cc-jump-link outer-link" title="在新窗口打开" @click="openInNewTab" />
    </div>
    <!-- 全宽 scope tabs(对齐老版: 未分配/已分配/全部 在内容区顶部) -->
    <div class="scope-tabs">
      <span
        v-for="t in groupTabs" :key="t.key"
        :class="['scope-tab', { active: groupTab === t.key }]"
        @click="switchTab(t.key)"
      >{{ t.label }}</span>
    </div>
    <div class="host-body">
      <!-- 左:资源池目录(老版仅在未分配资源池显示) -->
      <div v-if="groupTab === 'unassigned'" class="group-col">
        <div class="dir-search-row">
          <el-input v-model="dirKeyword" placeholder="分组目录" size="small" clearable :prefix-icon="'Search'" />
          <el-button class="dir-add" size="small" :icon="'Plus'" link @click="openCreateDir()" />
        </div>
        <el-tree
          ref="dirTreeRef"
          :data="dirTreeData"
          :props="{ label: 'name', children: 'children' }"
          node-key="id"
          :current-node-key="currentDirId"
          default-expand-all
          highlight-current
          :filter-node-method="filterDir"
          class="dir-tree"
          @node-click="onDirClick"
          @node-contextmenu="onDirContext"
        >
          <template #default="{ data }">
            <span class="dir-row">
              <i :class="['bk-cmdb-icon', data.__icon || 'icon-cc-host']" />
              <span class="d-name">{{ data.name }}</span>
              <!-- 老版契约:仅非默认目录悬停显示点菜单(重命名/删除);主机池根与空闲机无此入口 -->
              <el-dropdown
                v-if="data.id !== 'default' && data.id !== 'empty' && !data.default"
                class="dir-op"
                trigger="click"
                @command="(cmd) => onDirNodeCmd(cmd, data)"
              >
                <span class="dir-op-trigger" title="更多操作" @click.stop><el-icon><MoreFilled /></el-icon></span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="rename">重命名</el-dropdown-item>
                    <el-dropdown-item command="delete">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <span v-if="data.__count !== undefined" class="d-count">{{ data.__count }}</span>
            </span>
          </template>
        </el-tree>
      </div>

      <!-- 右:列表 -->
      <div class="main-col">
    <div class="toolbar">
      <el-button size="small" type="primary" @click="openImport">导入主机</el-button>
      <el-button size="small" :disabled="!selectedHosts.length" @click="openTransferWizard">分配到<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
      <el-dropdown trigger="click" @command="onBatchEdit">
        <el-button size="small" :disabled="!selectedHosts.length">编辑<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="edit">编辑属性</el-dropdown-item>
            <el-dropdown-item command="importEdit">导入编辑</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-dropdown trigger="click" @command="onCopy">
        <el-button size="small" :disabled="!selectedHosts.length">复制<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="ip">复制 IP</el-dropdown-item>
            <el-dropdown-item command="name">复制主机名称</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-dropdown trigger="click" @command="onMore">
        <el-button size="small" :disabled="!selectedHosts.length">
          更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="toResource">转移到资源池</el-dropdown-item>
            <el-dropdown-item command="toDir" :disabled="!currentDirId">转移到目录…</el-dropdown-item>
            <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
            <el-dropdown-item command="exportSelected">导出选中</el-dropdown-item>
            <el-dropdown-item command="exportAll">导出全部</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <div class="spacer" />
      <el-button size="small" :icon="'Refresh'" @click="reload">刷新</el-button>
      <span class="refresh-time">{{ refreshText }}</span>
      <el-input
        v-model="keyword"
        placeholder="请输入IP或固资编号"
        size="small"
        clearable
        style="width: 190px; margin-left: 8px"
        @keyup.enter="reload"
        @clear="reload"
      />
      <el-button
        size="small"
        :icon="'Filter'"
        :class="['option-filter', { active: advActive }]"
        title="高级筛选"
        @click="openAdvancedDrawer"
      />
        </div>

        <el-table
          :data="pagedHosts"
          v-loading="loading"
          size="small"
          class="bk-table legacy-table"
          @selection-change="onSelect"
          @sort-change="onSortChange"
        >
          <el-table-column type="selection" width="60" align="center" fixed />
          <el-table-column
            v-for="col in tableHeader"
            :key="col.bk_property_id"
            :prop="col.bk_property_id"
            :min-width="colMinWidth(col)"
            :fixed="col.bk_property_id === 'bk_host_id'"
            :sortable="isSortable(col) ? 'custom' : false"
            :show-overflow-tooltip="col.bk_property_type !== 'topology'"
          >
            <template #header>
              <span>{{ headerName(col) }}</span>
              <span v-if="col.bk_obj_id !== 'host'" class="col-model-suffix">({{ MODEL_NAMES[col.bk_obj_id] }})</span>
            </template>
            <template #default="{ row }">
              <span v-if="col.bk_property_id === 'bk_host_id'" class="cell-link" @click="goDetail(row)">{{ row.bk_host_id }}</span>
              <span v-else-if="col.bk_property_type === 'topology'" :title="topoPath(row)">{{ topoPath(row) }}</span>
              <span v-else :class="{ 'cell-empty': displayValue(row, col) === '--' }">{{ displayValue(row, col) }}</span>
            </template>
          </el-table-column>
          <el-table-column width="42" fixed="right" align="center" class-name="col-setting">
            <template #header>
              <el-icon class="col-setting-icon" title="列表显示属性配置" @click="openColumnConfig"><Setting /></el-icon>
            </template>
          </el-table-column>
        </el-table>

        <div class="table-footer">
          <span>共计{{ total }}条</span>
          <span>每页</span>
          <el-select v-model="pageSize" size="small" style="width: 76px" @change="reload">
            <el-option v-for="n in [20, 50, 100, 500]" :key="n" :label="String(n)" :value="n" />
          </el-select>
          <span>条</span>
          <span class="spacer" />
          <span>已选择{{ selectedHosts.length }}条</span>
          <el-pagination
            v-model:current-page="page"
            :page-size="pageSize"
            :total="total"
            layout="prev, pager, next"
            @current-change="load"
          />
        </div>
      </div>
    </div>

    <!-- 分配到 — 多步向导 -->
    <el-dialog v-model="wizardVisible" :title="wizardStep === 0 ? '分配主机' : '确认转移'"
      width="640px" top="6vh" :close-on-click-modal="false" @close="resetWizard">
      <el-steps :active="wizardStep" finish-status="success" simple style="margin-bottom: 16px">
        <el-step title="选择目标" />
        <el-step title="确认" />
      </el-steps>

      <template v-if="wizardStep === 0">
        <el-radio-group v-model="transferType" style="margin-bottom: 12px">
          <el-radio-button label="move">转入业务模块</el-radio-button>
          <el-radio-button label="idle">转入空闲机池</el-radio-button>
          <el-radio-button label="across">跨业务转移</el-radio-button>
        </el-radio-group>

        <el-form v-if="transferType === 'move' || transferType === 'across'" label-width="100px">
          <el-form-item v-if="transferType === 'across'" label="目标业务" required>
            <el-select v-model="targetBiz" filterable style="width: 100%">
              <el-option v-for="b in bizStore.bizList" :key="b.bk_biz_id" :label="b.bk_biz_name" :value="b.bk_biz_id" />
            </el-select>
          </el-form-item>
          <el-form-item label="目标模块" required>
            <el-cascader
              v-model="targetModule"
              :options="moduleOptions"
              :props="{ value: 'value', label: 'label', children: 'children', emitPath: false }"
              style="width: 100%"
              :disabled="!effectiveBiz"
            />
          </el-form-item>
          <el-form-item label="追加模式">
            <el-switch v-model="isIncrement" />
            <span class="hint">开启后主机保留原模块归属</span>
          </el-form-item>
        </el-form>

        <el-alert v-if="transferType === 'idle'" type="info" :closable="false"
          title="将所选主机直接转入空闲机池" />
        <el-alert v-if="transferType === 'across' && !targetBiz" type="warning" :closable="false"
          title="跨业务转移需要选择目标业务" />
      </template>

      <template v-else>
        <el-alert :type="confirmConflicts.length ? 'warning' : 'info'" :closable="false" style="margin-bottom: 12px"
          :title="`共 ${selectedHosts.length} 台主机${transferType === 'across' ? `(目标业务 ${targetBiz})` : ''}${transferType === 'idle' ? ' → 空闲机池' : ' → ' + moduleLabel}`" />
        <el-table v-if="confirmConflicts.length" :data="confirmConflicts" size="small" border max-height="200">
          <el-table-column prop="bk_host_innerip" label="主机" min-width="140" />
          <el-table-column prop="__reason" label="风险" min-width="220" />
        </el-table>
        <el-empty v-else description="无明显冲突" :image-size="60" />
      </template>

      <template #footer>
        <el-button @click="wizardVisible = false">取消</el-button>
        <el-button v-if="wizardStep === 1" @click="wizardStep = 0">上一步</el-button>
        <el-button v-if="wizardStep === 0" type="primary" :disabled="!canGoNext" @click="wizardStep = 1">下一步</el-button>
        <el-button v-if="wizardStep === 1" type="primary" :loading="transferring" @click="doTransfer">确认转移</el-button>
      </template>
    </el-dialog>

    <!-- 转移到目录对话框 -->
    <el-dialog v-model="dirDialogVisible" title="转移到资源目录" width="420px">
      <el-form label-width="80px">
        <el-form-item label="目标目录" required>
          <el-cascader
            v-model="targetDir"
            :options="dirOptions"
            :props="{ value: 'id', label: 'name', children: 'children', emitPath: false, checkStrictly: true }"
            style="width: 100%"
            placeholder="选择目录"
          />
        </el-form-item>
        <el-form-item label="主机数"><span>{{ selectedHosts.length }} 台</span></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dirDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="transferring" :disabled="!targetDir" @click="doTransferToDir">确定</el-button>
      </template>
    </el-dialog>

    <!-- 新建目录 -->
    <el-dialog v-model="dirCreateVisible" title="新建资源目录" width="420px">
      <el-form label-width="80px">
        <el-form-item label="目录名" required>
          <el-input v-model="dirCreateName" placeholder="如:分组A" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dirCreateVisible = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="submitCreateDir">保存</el-button>
      </template>
    </el-dialog>

    <!-- 主机收藏快捷筛选 -->
    <el-dialog v-model="favVisible" title="主机收藏快捷筛选" width="540px">
      <div class="toolbar">
        <el-button size="small" :icon="'Plus'" type="primary" @click="openFavDialog()">新建收藏</el-button>
        <div class="spacer" />
      </div>
      <el-table :data="favorites" v-loading="favLoading" size="default">
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column label="使用次数" width="100">
          <template #default="{ row }">{{ row.use_count || 0 }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="applyFav(row)">应用</el-button>
            <el-button link type="danger" size="small" @click="removeFav(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!favLoading && favorites.length === 0" description="暂无收藏的筛选条件" :image-size="60" />
    </el-dialog>

    <el-dialog v-model="favFormVisible" title="新建主机收藏" width="540px">
      <el-form label-width="100px" :model="favForm">
        <el-form-item label="名称" required>
          <el-input v-model="favForm.name" placeholder="如:线上生产机" />
        </el-form-item>
        <el-form-item label="搜索关键词">
          <el-input v-model="favForm.keyword" placeholder="可粘贴 IP 列表或关键词" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="favFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="submitFav">保存</el-button>
      </template>
    </el-dialog>

    <!-- 导入主机(老版 import-file 两步抽屉:上传文件 → 解析结果/关联模型) -->
    <el-drawer v-model="importVisible" title="导入主机" size="720px" :close-on-click-modal="false">
      <div class="import-steps">
        <span :class="['step-node', { active: importStep === 0, done: importStep > 0 }]"><i>1</i>上传文件</span>
        <span class="step-dash" />
        <span :class="['step-node', { active: importStep === 1 }]"><i>2</i>选择关联模型</span>
      </div>
      <el-alert type="warning" :closable="false" style="margin-bottom: 12px"
        title="说明：资源池仅支持全新导入主机，不支持对已存在的主机更新" />

      <template v-if="importStep === 0">
        <el-upload
          drag
          :auto-upload="false"
          :limit="1"
          accept=".xlsx,.xls"
          :on-change="onFileChange"
          class="import-upload"
        >
          <div class="upload-area">
            <el-icon class="upload-icon"><UploadFilled /></el-icon>
            <div>将文件拖到此处或<span class="link">点击上传</span></div>
          </div>
        </el-upload>
        <div class="upload-tips">
          20M 以内的 xlsx 文件
          <span class="link" @click="downloadTemplate">下载模板</span>
        </div>
      </template>

      <template v-else>
        <div class="parse-summary">
          <el-tag v-if="importParseSuccess" type="success" size="small">成功 {{ importParseSuccess.length }} 条</el-tag>
          <el-tag v-if="importParseError" type="danger" size="small">失败 {{ importParseError.length }} 条</el-tag>
          <el-tag v-if="!importParseSuccess && !importParseError" size="small">未解析到数据</el-tag>
        </div>
        <div class="relation-section">
          <div class="relation-title">选择关联模型</div>
          <el-empty description="主机模型无需要关联的模型,可直接导入" :image-size="60" />
        </div>
      </template>

      <div class="import-footer">
        <el-button v-if="importStep === 0" type="primary" :disabled="!importSourceFile" :loading="importing" @click="goImportStep2">下一步</el-button>
        <el-button v-if="importStep === 1" @click="importStep = 0">上一步</el-button>
        <el-button v-if="importStep === 1" type="primary" :loading="importing" @click="submitImport">导入</el-button>
        <el-button @click="importVisible = false">取消</el-button>
      </div>
    </el-drawer>

    <!-- 导入编辑(老版 host-options 导入编辑:真实 xlsx → /hosts/update) -->
    <el-dialog v-model="importEditVisible" title="导入编辑" width="520px" :close-on-click-modal="false">
      <el-alert type="info" :closable="false" style="margin-bottom: 12px"
        title="请上传包含 bk_host_id 的 Excel 文件。可先从主机列表导出后修改再上传。" />
      <el-upload :auto-upload="false" :limit="1" accept=".xlsx,.xls" :on-change="onImportEditFile">
        <el-button :icon="'Upload'">选择 Excel 文件</el-button>
      </el-upload>
      <p v-if="importEditFile" class="selected-file">已选择: {{ importEditFile.name }}</p>
      <template #footer>
        <el-button @click="importEditVisible = false">取消</el-button>
        <el-button type="primary" :loading="importEditing" :disabled="!importEditFile" @click="submitImportEdit">开始导入编辑</el-button>
      </template>
    </el-dialog>

    <!-- 列表显示属性配置(老版 columns-config 600px 双栏抽屉,共享组件) -->
    <LegacyColumnConfigDrawer
      v-model="columnConfigVisible"
      :pool="columnPool"
      :selected="tableHeader.map((p) => p.bk_property_id)"
      :fixed-ids="FIXED_COLUMN_IDS"
      :name-resolver="propName"
      @apply="onColumnApply"
      @reset="onColumnReset"
    />

    <AdvancedHostFilter
      v-model="advancedFilterVisible"
      :properties="advancedProperties"
      :initial="advancedInitial"
      @submit="handleAdvancedSubmit"
      @reset="handleAdvancedReset"
    />

    <!-- 批量编辑主机属性(契约: PUT /hosts/batch {...changed, bk_host_id:"1,2"}) -->
    <el-drawer v-model="batchEditVisible" title="编辑主机属性" size="480px">
      <el-form label-width="120px">
        <el-form-item v-for="f in batchAttrs" :key="f.bk_property_id" :label="f.bk_property_name">
          <el-select v-if="enumOptions(f).length" v-model="batchMap[f.bk_property_id]" clearable filterable style="width: 100%">
            <el-option v-for="o in enumOptions(f)" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
          <el-switch v-else-if="f.bk_property_type === 'bool'" v-model="batchMap[f.bk_property_id]" />
          <el-input-number v-else-if="f.bk_property_type === 'int'" v-model="batchMap[f.bk_property_id]" :controls="false" style="width: 100%" />
          <el-input v-else v-model="batchMap[f.bk_property_id]" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchEditVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchSaving" @click="submitBatchEdit">保存</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, Monitor, Filter, MoreFilled, Setting } from '@element-plus/icons-vue'
import AdvancedHostFilter from '../components/AdvancedHostFilter.vue'
import LegacyColumnConfigDrawer from '../components/LegacyColumnConfigDrawer.vue'
import {
  propertyPriority, legacyHeaderName, legacyColMinWidth, computeLegacyHeader, legacyCellValue, legacyIsSortable
} from '../utils/legacy-columns'
import {
  parseHostSearch, serializeIpCondition, fetchHostFilterProperties, resolveInitialConditions, toUserBehavior, RESOURCE_FILTER_USERCUSTOM_KEY
} from '../utils/host-filter'
import {
  http, transferHostModule, transferHostToResource, transferBizHostAcrossBiz,
  transferHostsToDirectory, importHosts, updateHostsByExcel, downloadHostTemplate, listResourceDirectory, deleteHostsBatch, exportHosts,
  updateResourceDirectory, deleteResourceDirectory, createResourceDirectory,
  listHostFavorites, createHostFavorite, incrHostFavorite, deleteHostFavorite,
  getBizTopoTree, getBizInternalTopo, searchModelAttributes, searchUserCustom, saveUserCustom,
  searchHostsResource
} from '../api/cmdb'
import { useBizStore } from '../stores/biz'

const route = useRoute()
const router = useRouter()
const bizStore = useBizStore()

const groupTabs = [
  { key: 'unassigned', label: '未分配', legacy: 1 },
  { key: 'assigned', label: '已分配', legacy: 0 },
  { key: 'all', label: '全部', legacy: 'all' }
]
const groupTab = ref('unassigned')

// 资源目录
const dirTreeRef = ref()
const dirTreeData = ref([])
const dirKeyword = ref('')
const currentDirId = ref('default')
const dirOptions = computed(() => {
  // dirTreeData 已是树形,递归取所有 node 即可
  return dirTreeData.value
})

const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const rows = ref([])
const selectedHosts = ref([])
const loading = ref(false)
const refreshText = ref('刚刚刷新')

// 筛选
// 筛选(旧版契约:漏斗按钮直接打开高级筛选侧滑,active 表示存在生效条件)
const advancedFilterVisible = ref(false)
const advancedProperties = ref([])
const advancedInitial = ref({ IP: { text: '', inner: true, outer: true, exact: true }, conditions: [] })
const advActive = computed(() => !!(route.query.filter || parseIpQuery(route.query.ip).text || route.query.cloudId !== undefined))

// 分配到(多步)
const transferVisible = ref(false) // 兼容老 el-dialog 名,新版不直接用
const wizardVisible = ref(false)
const wizardStep = ref(0)
const transferType = ref('move')
const targetBiz = ref(null)
const targetModule = ref(null)
const isIncrement = ref(false)
const transferring = ref(false)
const moduleOptions = ref([])

const effectiveBiz = computed(() => bizStore.bizId || targetBiz.value)
const moduleLabel = computed(() => {
  const m = targetModule.value
  if (!m) return '--'
  return moduleOptions.value.find((s) => s.value === m)?.label || m
})
const canGoNext = computed(() => {
  if (transferType.value === 'idle') return true
  if (transferType.value === 'move' || transferType.value === 'across') {
    return !!effectiveBiz.value && !!targetModule.value
  }
  return false
})
const confirmConflicts = computed(() => {
  // 简单冲突:已在目标模块的主机(基于 host.bk_module_id)无法重复转入
  return selectedHosts.value
    .filter((h) => h.bk_module_id && h.bk_module_id === targetModule.value)
    .map((h) => ({ bk_host_innerip: h.bk_host_innerip, __reason: '已在该模块' }))
})

// 转移到目录
const dirDialogVisible = ref(false)
const targetDir = ref(null)

const dirCreateVisible = ref(false)
const dirCreateName = ref('')

// 主机收藏
const favVisible = ref(false)
const favFormVisible = ref(false)
const favorites = ref([])
const favLoading = ref(false)
const favForm = ref({ name: '', keyword: '' })

const cloudNames = { 0: 'Default Area' }
function cloudName(id) {
  const n = cloudNames[id]
  return n ? `${n}[${id}]` : '--'
}

const pagedHosts = computed(() => rows.value)

// ---------- 表格列(老版 FilterStore.getHeader + columns-config 契约) ----------
const MODEL_NAMES = { host: '主机', module: '模块', set: '集群', biz: '业务' }
const COLUMN_CONFIG_USERCUSTOM_KEY = 'resource_host_table_column_config'
const FIXED_COLUMN_IDS = ['bk_host_id', 'bk_host_innerip', 'bk_host_innerip_v6', 'bk_cloud_id']
// 资源池视图的前端注入虚拟属性(老版 isInject,不传后台);standalone 属性接口不返回 bk_host_id,老版同为注入(createIdProperty)
const HOST_ID_PROPERTY = {
  id: 'bk_host_id', bk_obj_id: 'host', bk_property_id: 'bk_host_id',
  bk_property_name: 'ID', bk_property_index: -1, bk_property_type: 'int', isonly: true, ispre: true
}
const TOPOLOGY_PROPERTY = {
  id: '__bk_host_topology__', bk_obj_id: 'host', bk_property_id: '__bk_host_topology__',
  bk_property_name: '业务拓扑', bk_property_type: 'topology', isInject: true
}

const tableHeader = ref([])
const columnConfigVisible = ref(false)

// 老版 setModuleNamePropertyState:模块名属性随 scope 变化(未分配=目录名)
const modulePropertyName = computed(() => ({
  unassigned: '目录名', assigned: '模块名', all: '目录名/模块名'
})[groupTab.value] || '模块名')

function propName(property) {
  if (property.bk_property_id === 'bk_module_name' && property.bk_obj_id === 'module') {
    return modulePropertyName.value
  }
  return property.bk_property_name
}

// 表头展示名(老版 getHeaderPropertyName:带单位时补 (unit))
function headerName(property) {
  return legacyHeaderName(property, propName)
}

// 列配置属性池(老版 columnConfigProperties:host 全量 + 模块名/集群名/业务名;host 含注入的 ID/业务拓扑)
const columnPool = computed(() => {
  const props = advancedProperties.value || []
  const hostProps = props.filter((p) => p.bk_obj_id === 'host')
  const extra = ['module', 'set', 'biz']
    .map((objId) => props.find((p) => p.bk_obj_id === objId && p.bk_property_id === `bk_${objId === 'biz' ? 'biz' : objId}_name`))
    .filter(Boolean)
  return [...hostProps, HOST_ID_PROPERTY, TOPOLOGY_PROPERTY, ...extra]
})

// 老版 getHeader/presetHeader:默认表头仅取 host 属性优先级前 6,固定列(ID/IP/v6/云区域/业务拓扑)置顶
function computeTableHeader(usercustom) {
  tableHeader.value = computeLegacyHeader({
    pool: columnPool.value.filter((p) => p.bk_obj_id === 'host'),
    customIds: usercustom?.[COLUMN_CONFIG_USERCUSTOM_KEY],
    fixedProperties: [...FIXED_COLUMN_IDS.map((id) => columnPool.value.find((p) => p.bk_property_id === id)), TOPOLOGY_PROPERTY],
    totalLimit: 6
  })
}

const isSortable = legacyIsSortable

function colMinWidth(property) {
  return legacyColMinWidth(property, isSortable(property), { bk_host_id: 80 })
}

// 单元格取值(老版 hostValueFilter:host 直取,其余从模型数组取;bk_cloud_id 数字旧数据走 cloudName)
function displayValue(row, property) {
  return legacyCellValue(row, property, (r, p) => {
    let value
    if (p.bk_obj_id === 'host') {
      value = r[p.bk_property_id]
    } else {
      const list = r[`__${p.bk_obj_id}`]
      value = Array.isArray(list) ? list.map((item) => item[p.bk_property_id]) : undefined
    }
    if (p.bk_property_id === 'bk_cloud_id' && (typeof value === 'number' || typeof value === 'string')) return cloudName(value)
    return value
  })
}

// 业务拓扑列(老版 cmdb-host-topo-path:业务/集群/模块;资源池主机固定以 资源池 开头)
function topoPath(row) {
  const modules = row.__module?.map((m) => m.bk_module_name) || []
  if (!modules.length) return '资源池'
  const biz = row.__biz?.map((b) => b.bk_biz_name) || ['资源池']
  const sets = row.__set?.map((s) => s.bk_set_name) || []
  return [...biz, ...sets, ...modules].join(' / ')
}

async function onSortChange({ prop, order }) {
  const sort = order === 'ascending' ? prop : order === 'descending' ? `-${prop}` : ''
  page.value = 1
  await router.replace({ query: { ...route.query, sort: sort || undefined, page: undefined, _t: Date.now() } })
  load()
}

// ---------- 列配置抽屉(共享 LegacyColumnConfigDrawer,老版 columns-config 契约) ----------
function openColumnConfig() {
  columnConfigVisible.value = true
}

async function onColumnApply(ids) {
  await saveUserCustom({ [COLUMN_CONFIG_USERCUSTOM_KEY]: ids })
  columnConfigVisible.value = false
  // ensureFilterUsercustom 有缓存,保存后同步更新缓存再重算表头
  if (filterUsercustom !== null) filterUsercustom[COLUMN_CONFIG_USERCUSTOM_KEY] = [...ids]
  computeTableHeader(filterUsercustom)
  reload()
}

async function onColumnReset() {
  await saveUserCustom({ [COLUMN_CONFIG_USERCUSTOM_KEY]: [] })
  columnConfigVisible.value = false
  if (filterUsercustom !== null) filterUsercustom[COLUMN_CONFIG_USERCUSTOM_KEY] = []
  computeTableHeader(filterUsercustom)
  reload()
}

function filterDir(value, data) {
  if (!value) return true
  return (data.name || '').toLowerCase().includes(value.toLowerCase())
}
watch(dirKeyword, (v) => dirTreeRef.value?.filter(v))

async function onDirClick(node) {
  if (node.id === 'empty') return
  currentDirId.value = String(node.id)
  selectedHosts.value = []
  page.value = 1
  await router.replace({
    query: {
      ...route.query,
      directory: node.id === 'default' ? undefined : String(node.id),
      page: undefined,
      _t: Date.now()
    }
  })
  await load()
}

function onDirContext(event, data) {
  // 阻止默认右键
  currentDirId.value = String(data.id)
}

function openCreateDir() {
  dirCreateName.value = ''
  dirCreateVisible.value = true
}

async function submitCreateDir() {
  if (!dirCreateName.value) { ElMessage.warning('请输入目录名'); return }
  loading.value = true
  try {
    await createResourceDirectory({ bk_module_name: dirCreateName.value, bk_supplier_account: '0' })
    ElMessage.success('已创建')
    dirCreateVisible.value = false
    await loadDirectoryTree()
  } catch (e) { ElMessage.error('创建失败: ' + (e?.message || '后端异常')) }
  finally { loading.value = false }
}

async function openFavs() {
  favVisible.value = true
  await loadFavs()
}

async function loadFavs() {
  favLoading.value = true
  try {
    const data = await listHostFavorites({ page: { start: 0, limit: 200 } })
    favorites.value = data?.info || []
  } catch (e) { favorites.value = [] }
  finally { favLoading.value = false }
}

function openFavDialog() {
  favForm.value = { name: '', keyword: '' }
  favFormVisible.value = true
}

function submitFav() {
  if (!favForm.value.name) { ElMessage.warning('请输入收藏名'); return }
  createHostFavorite({ name: favForm.value.name, params: { keyword: favForm.value.keyword } })
    .then(() => {
      ElMessage.success('已创建')
      favFormVisible.value = false
      return loadFavs()
    })
    .catch((e) => ElMessage.error('创建失败: ' + (e?.message || '后端异常')))
}

function applyFav(row) {
  keyword.value = row.params?.keyword || row.name || ''
  favVisible.value = false
  reload()
  incrHostFavorite(row.id).catch(() => {})
}

function removeFav(row) {
  ElMessageBox.confirm(`确定删除收藏「${row.name}」?`, '删除', { type: 'warning' })
    .then(() => deleteHostFavorite(row.id))
    .then(() => loadFavs())
    .catch(() => {})
}

// 点菜单操作:先选中该目录,再执行重命名/删除(老版 dot-menu 语义)
function onDirNodeCmd(cmd, data) {
  currentDirId.value = String(data.id)
  onDirCmd(cmd)
}

async function onDirCmd(cmd) {
  if (cmd === 'rename') {
    if (currentDirId.value === 'default') { ElMessage.warning('默认目录不能重命名'); return }
    const node = dirTreeData.value[0]?.children?.find?.((n) => n.id === currentDirId.value)
    const name = await ElMessageBox.prompt('请输入新目录名', '重命名目录', { inputValue: node?.name || '' })
    if (!name) return
    try {
      await updateResourceDirectory(currentDirId.value, { bk_module_name: name.value })
      ElMessage.success('已重命名')
      await loadDirectoryTree()
    } catch (e) { ElMessage.error('重命名失败: ' + (e?.message || '后端异常')) }
  } else if (cmd === 'delete') {
    if (currentDirId.value === 'default') { ElMessage.warning('默认目录不能删除'); return }
    await ElMessageBox.confirm(`确定删除目录(独立模式后端若不支持会报错)?`, '删除确认', { type: 'warning' })
    try {
      await deleteResourceDirectory(currentDirId.value)
      ElMessage.success('已删除')
      currentDirId.value = 'default'
      await loadDirectoryTree()
    } catch (e) { ElMessage.error('删除失败: ' + (e?.message || '后端异常')) }
  }
}

function buildResourceSearchBody() {
  // 老版契约:condition[].fields 跟随当前表头列
  const headerFields = (objId) => tableHeader.value
    .filter((p) => p.bk_obj_id === objId && !p.isInject)
    .map((p) => p.bk_property_id)
  const unique = (list) => [...new Set(list)]
  const hostFields = unique(headerFields('host'))
  if (!hostFields.length) hostFields.push('bk_host_id', 'bk_host_innerip', 'bk_host_innerip_v6', 'bk_cloud_id', 'bk_host_name')

  const conditions = [
    { bk_obj_id: 'biz', fields: unique(['bk_biz_id', 'bk_biz_name', ...headerFields('biz')]), condition: [] },
    { bk_obj_id: 'set', fields: unique(['bk_set_id', 'bk_set_name', ...headerFields('set')]), condition: [] },
    { bk_obj_id: 'module', fields: unique(['bk_module_id', 'bk_module_name', ...headerFields('module')]), condition: [] },
    { bk_obj_id: 'host', fields: hostFields, condition: [] }
  ]
  const addCondition = (objId, field, operator, value) => {
    const target = conditions.find((item) => item.bk_obj_id === objId)
    if (target) target.condition.push({ field, operator, value })
  }
  const scope = groupTabs.find((item) => item.key === groupTab.value)?.legacy
  if (scope !== 'all') addCondition('biz', 'default', '$eq', scope)
  if (groupTab.value === 'unassigned' && currentDirId.value && currentDirId.value !== 'default') {
    addCondition('module', 'bk_module_id', '$eq', Number(currentDirId.value))
  }

  const routeIp = parseIpQuery(route.query.ip)
  const parsedIp = parseHostSearch(routeIp.text)
  const ipValues = [
    ...parsedIp.IPv4List,
    ...parsedIp.IPv6List,
    ...parsedIp.IPv4WithCloudList.map(([, ip]) => ip),
    ...parsedIp.IPv6WithCloudList.map(([, ip]) => ip)
  ]
  if (ipValues.length) {
    addCondition('host', 'bk_host_innerip', routeIp.exact ? '$eq' : '$regex', ipValues.length === 1 ? ipValues[0] : ipValues)
  }
  if (parsedIp.assetList.length) addCondition('host', 'bk_asset_id', '$in', parsedIp.assetList)
  if (!routeIp.text && keyword.value) addCondition('host', 'bk_host_innerip', '$regex', keyword.value)
  if (route.query.cloudId !== undefined) addCondition('host', 'bk_cloud_id', '$eq', Number(route.query.cloudId))

  for (const item of parseFilterQuery(route.query.filter)) {
    let value = item.value
    if (['in', 'nin', 'range'].includes(item.operator) && !Array.isArray(value)) value = [value]
    addCondition(item.property.bk_obj_id, item.property.bk_property_id, `$${item.operator}`, value)
  }
  return {
    condition: conditions,
    // 老版排序契约:URL sort(-field / field),默认 bk_host_id
    page: { start: (page.value - 1) * pageSize.value, limit: pageSize.value, sort: String(route.query.sort || 'bk_host_id') }
  }
}


async function loadDirectoryTree() {
  try {
    const list = await listResourceDirectory({ page: { sort: 'bk_module_name' } })
    const rawItems = list?.info || list || []
    const items = rawItems.map((d) => ({
      id: String(d.bk_module_id || d.id),
      name: d.bk_module_name || d.name,
      __count: Number(d.host_count) || 0,
      default: Number(d.default) === 1,
      __icon: 'icon-cc-folder'
    })).sort((a, b) => Number(b.default) - Number(a.default))
    const sum = items.reduce((acc, it) => acc + it.__count, 0)
    dirTreeData.value = [{
      id: 'default', name: '主机池', __count: sum, __icon: 'icon-cc-host', children: items.length ? items : [{ id: 'empty', name: '(空)' }]
    }]
  } catch (e) {
    dirTreeData.value = [{ id: 'default', name: '主机池', __count: 0, children: [] }]
  }
}

async function load() {
  loading.value = true
  try {
    const raw = await searchHostsResource(buildResourceSearchBody())
    const info = raw?.info || raw?.data?.info || []
    rows.value = info.map((item) => ({
      ...(item.host || item),
      __biz: item.biz,
      __set: item.set,
      __module: item.module
    }))
    total.value = Number(raw?.count ?? raw?.data?.count ?? rows.value.length)
    refreshText.value = '刚刚刷新'
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load()
}

function onSelect(rows) {
  selectedHosts.value = rows
}

function parseIpQuery(value) {
  if (!value) return { text: '', inner: true, outer: true, exact: true }
  const params = new URLSearchParams(String(value).replace(/&amp;/g, '&'))
  return {
    // 旧版 setupIPQuery:text 中的逗号还原为换行展示
    text: (params.get('text') || '').replace(/,/g, '\n'),
    inner: params.get('inner') !== 'false',
    outer: params.get('outer') !== 'false',
    exact: params.get('exact') !== 'false'
  }
}

function parseFilterQuery(value) {
  const conditions = []
  const params = new URLSearchParams(String(value || '').replace(/&amp;/g, '&'))
  for (const [key, raw] of params.entries()) {
    const dot = key.indexOf('.')
    if (dot < 1) continue
    // 空值条目(field.op=)不还原成条件,避免值里混入空字符串
    if (raw === '') continue
    const field = key.slice(0, dot)
    const operator = key.slice(dot + 1)
    // 旧版 findProperty:数字键按属性 id 匹配,否则按 bk_property_id
    const isIdKey = /^\d+$/.test(field)
    const property = advancedProperties.value.find((item) => (
      isIdKey ? String(item.id) === field : item.bk_property_id === field
    ))
    if (!property) continue
    const values = raw.split(',')
    let value = ['in', 'nin', 'range'].includes(operator) ? values : values[0]
    // bool 经 URL 序列化后是 'true'/'false' 字符串,还原为布尔供是/否下拉回显
    if (property.bk_property_type === 'bool') value = value === 'true'
    conditions.push({
      id: String(property.id ?? `${property.bk_obj_id}.${field}`),
      property,
      operator,
      value
    })
  }
  return conditions
}

let filterUsercustom = null
async function ensureFilterUsercustom() {
  if (filterUsercustom === null) filterUsercustom = await searchUserCustom().catch(() => null)
  return filterUsercustom
}

async function ensureAdvancedProperties() {
  if (!advancedProperties.value.length) {
    advancedProperties.value = await fetchHostFilterProperties()
  }
}

async function buildAdvancedInitial() {
  await ensureAdvancedProperties()
  // 旧版顺序:setupNormalProperty 预置默认/用户习惯条件,setupPropertyQuery 用 URL 值回填
  const conditions = resolveInitialConditions(advancedProperties.value, await ensureFilterUsercustom())
  for (const urlCondition of parseFilterQuery(route.query.filter)) {
    const existing = conditions.find((item) => item.property.bk_property_id === urlCondition.property.bk_property_id)
    if (existing) {
      existing.operator = urlCondition.operator
      existing.value = urlCondition.value
    } else {
      conditions.push(urlCondition)
    }
  }
  // host-landing 深链的 cloudId 转成等值条件,与旧版漏斗条件一致
  if (route.query.cloudId !== undefined) {
    const cloudProp = advancedProperties.value.find((item) => item.bk_property_id === 'bk_cloud_id')
    if (cloudProp) {
      const cloudRow = conditions.find((item) => item.property.bk_property_id === 'bk_cloud_id')
      if (cloudRow) {
        cloudRow.operator = 'eq'
        cloudRow.value = Number(route.query.cloudId)
      } else {
        conditions.push({
          id: String(cloudProp.id ?? 'host.bk_cloud_id'),
          property: cloudProp,
          operator: 'eq',
          value: Number(route.query.cloudId)
        })
      }
    }
  }
  return { IP: parseIpQuery(route.query.ip), conditions }
}

async function openAdvancedFromRoute() {
  if (!(route.query.adv || route.query.advanced)) return
  advancedInitial.value = await buildAdvancedInitial()
  advancedFilterVisible.value = true
}

async function openAdvancedDrawer() {
  advancedInitial.value = await buildAdvancedInitial()
  advancedFilterVisible.value = true
}

async function handleAdvancedReset() {
  advancedInitial.value = { IP: { text: '', inner: true, outer: true, exact: true }, conditions: [] }
  await router.replace({ query: { ...route.query, adv: undefined, advanced: undefined, filter: undefined, ip: undefined } })
  reload()
}

async function handleAdvancedSubmit(result) {
  const filter = result.filter || ''
  advancedFilterVisible.value = false
  // 旧版行为:查询后把本次所选字段保存为用户习惯
  saveUserCustom({ [RESOURCE_FILTER_USERCUSTOM_KEY]: toUserBehavior(result.conditions) }).catch(() => {})
  await router.replace({ query: { ...route.query, scope: 'all', adv: '1', advanced: undefined, ip: serializeIpCondition(result.IP), filter } })
  reload()
}

function goDetail(row) {
  router.push({ path: '/host-detail', query: { id: row.bk_host_id } })
}

async function loadModuleOptions() {
  const id = effectiveBiz.value
  if (!id) { moduleOptions.value = []; return }
  const options = []
  const [mainTree, idleTopo] = await Promise.allSettled([getBizTopoTree(id), getBizInternalTopo(id)])
  const mapSet = (node) => ({
    value: node.bk_inst_id, label: node.bk_inst_name,
    children: (node.child || []).filter((c) => c.bk_obj_id === 'module' || c.child).map((c) => (c.bk_obj_id === 'module'
      ? { value: c.bk_inst_id, label: c.bk_inst_name } : mapSet(c)))
  })
  if (mainTree.status === 'fulfilled' && Array.isArray(mainTree.value)) {
    for (const bizNode of mainTree.value) options.push(...(bizNode.child || []).map(mapSet))
  }
  if (idleTopo.status === 'fulfilled' && idleTopo.value?.bk_set_id) {
    const s = idleTopo.value
    options.push({ value: s.bk_set_id, label: s.bk_set_name, children: (s.module || []).map((m) => ({ value: m.bk_module_id, label: m.bk_module_name })) })
  }
  moduleOptions.value = options
}

function openTransferWizard() {
  if (!selectedHosts.value.length) return
  transferType.value = bizStore.bizId ? 'move' : 'idle'
  targetBiz.value = null
  targetModule.value = null
  isIncrement.value = false
  wizardStep.value = 0
  wizardVisible.value = true
  loadModuleOptions()
}

watch(() => bizStore.bizId, loadModuleOptions)
watch(targetBiz, loadModuleOptions)

function resetWizard() {
  wizardVisible.value = false
  wizardStep.value = 0
}

async function doTransfer() {
  transferring.value = true
  try {
    if (transferType.value === 'idle') {
      await transferHostToResource(bizStore.bizId || 0, selectedHosts.value.map((h) => h.bk_host_id))
      ElMessage.success('已转入空闲机池')
    } else if (transferType.value === 'across') {
      const srcBiz = bizStore.bizId
      if (!srcBiz || !targetBiz.value || !targetModule.value) {
        ElMessage.warning('请选择目标业务与模块')
        return
      }
      await transferBizHostAcrossBiz(srcBiz, targetBiz.value, selectedHosts.value.map((h) => h.bk_host_id), targetModule.value)
      ElMessage.success('跨业务转移成功')
    } else {
      const biz = effectiveBiz.value
      await transferHostModule(biz, selectedHosts.value.map((h) => h.bk_host_id), [targetModule.value], isIncrement.value)
      ElMessage.success('转移成功')
    }
    wizardVisible.value = false
    selectedHosts.value = []
    reload()
  } catch (e) {
    ElMessage.error('转移失败: ' + (e?.message || '后端异常'))
  } finally {
    transferring.value = false
  }
}

async function onCopy(cmd) {
  const field = cmd === 'name' ? 'bk_host_name' : 'bk_host_innerip'
  const vals = selectedHosts.value.map((h) => h[field]).filter(Boolean).join('\n')
  if (!vals) { ElMessage.warning('所选主机无可复制内容'); return }
  try {
    await navigator.clipboard.writeText(vals)
    ElMessage.success(`已复制 ${vals.split('\n').length} 项`)
  } catch (e) {
    ElMessage.error('复制失败')
  }
}

function onBatchEdit(cmd) {
  if (cmd === 'edit') openHostBatchEdit()
  else if (cmd === 'importEdit') {
    importEditFile.value = null
    importEditVisible.value = true
  }
}

// ---------- 主机导入编辑(真实 xlsx /hosts/update,对齐老版 import-file 两步流的最终提交) ----------
const importEditVisible = ref(false)
const importEditFile = ref(null)
const importEditing = ref(false)
function onImportEditFile(file) {
  importEditFile.value = file?.raw || null
}
async function submitImportEdit() {
  if (!importEditFile.value) return
  importEditing.value = true
  try {
    await updateHostsByExcel(importEditFile.value, { op: 2, bk_biz_id: 0 })
    ElMessage.success('主机导入编辑成功')
    importEditVisible.value = false
    importEditFile.value = null
    await load()
  } catch (e) {
    ElMessage.error('导入编辑失败: ' + (e?.message || '后端异常'))
  } finally { importEditing.value = false }
}

// ---------- 批量编辑主机属性(老版 form-multiple 语义:只提交修改字段) ----------
const HOST_BATCH_EXCLUDED = ['bk_host_id', 'bk_host_innerip', 'bk_host_outerip', 'bk_host_innerip_v6', 'bk_host_outerip_v6', 'bk_cloud_id', 'bk_biz_id', 'bk_supplier_account', 'bk_created_by', 'bk_created_at', 'bk_updated_by', 'bk_updated_at', 'create_time', 'last_time']
const batchAttrs = ref([])
const batchEditVisible = ref(false)
const batchSaving = ref(false)
const batchMap = ref({})
const batchInit = ref({})

function enumOptions(f) {
  const opt = f.option
  if (Array.isArray(opt)) return opt.filter((o) => o && o.id !== undefined)
  return []
}

async function openHostBatchEdit() {
  if (!batchAttrs.value.length) {
    const attrs = (await searchModelAttributes('host').catch(() => [])) || []
    batchAttrs.value = attrs.filter((f) => !HOST_BATCH_EXCLUDED.includes(f.bk_property_id))
  }
  const init = {}
  for (const f of batchAttrs.value) {
    // 数值控件初始值用 undefined:el-input-number 会把 '' 规整为 0,导致 0 值被误提交
    init[f.bk_property_id] = f.bk_property_type === 'bool' ? false : (['int', 'float'].includes(f.bk_property_type) ? undefined : '')
  }
  batchInit.value = init
  batchMap.value = { ...init }
  batchEditVisible.value = true
}

async function submitBatchEdit() {
  const isBlank = (v) => v === '' || v === null || v === undefined
  const changed = {}
  for (const [k, v] of Object.entries(batchMap.value)) {
    // 数值控件会把空值规整为 null,只提交非空且确有变化的字段
    if (!isBlank(v) && String(v) !== String(batchInit.value[k] ?? '')) changed[k] = v
  }
  if (!Object.keys(changed).length) { ElMessage.warning('请先修改字段后再保存'); return }
  batchSaving.value = true
  try {
    await http.put('/hosts/batch', { ...changed, bk_host_id: selectedHosts.value.map((h) => h.bk_host_id).join(',') })
    ElMessage.success(`已批量更新 ${selectedHosts.value.length} 台主机`)
    batchEditVisible.value = false
    await load()
  } catch (e) {
    ElMessage.error('批量编辑失败: ' + (e?.message || '后端异常'))
  } finally { batchSaving.value = false }
}

async function onMore(cmd) {
  if (cmd === 'copy') {
    const ips = selectedHosts.value.map((h) => h.bk_host_innerip).filter(Boolean).join('\n')
    try {
      await navigator.clipboard.writeText(ips)
      ElMessage.success(`已复制 ${ips.split('\n').length} 个 IP`)
    } catch (e) {
      ElMessage.error('复制失败')
    }
  } else if (cmd === 'delete') {
    try {
      await ElMessageBox.confirm(`确定删除选中的 ${selectedHosts.value.length} 台主机?仅可删除资源池主机`, '删除确认', { type: 'warning' })
    } catch { return }
    try {
      await deleteHostsBatch(selectedHosts.value.map((h) => h.bk_host_id))
      ElMessage.success('已删除')
      reload()
    } catch (e) { ElMessage.error('删除失败: ' + (e?.message || '后端异常')) }
  } else if (cmd === 'exportSelected' || cmd === 'exportAll') {
    const ids = cmd === 'exportSelected' ? selectedHosts.value.map((h) => h.bk_host_id) : []
    try {
      await exportHosts(ids, ["bk_host_innerip", "bk_host_innerip_v6", "bk_cloud_id", "bk_host_name"])
      ElMessage.success('已导出')
    } catch (e) { ElMessage.error('导出失败: ' + (e?.message || '后端异常')) }
  } else if (cmd === 'toResource') {
    await ElMessageBox.confirm(`将 ${selectedHosts.value.length} 台主机转移到资源池?`, '确认', { type: 'warning' })
    await transferHostToResource(bizStore.bizId || 0, selectedHosts.value.map((h) => h.bk_host_id))
    ElMessage.success('已转移')
    reload()
  } else if (cmd === 'toDir') {
    targetDir.value = null
    dirDialogVisible.value = true
  }
}

async function doTransferToDir() {
  if (!targetDir.value) { ElMessage.warning('请选择目录'); return }
  transferring.value = true
  try {
    await transferHostsToDirectory({ bk_module_id: targetDir.value, bk_host_ids: selectedHosts.value.map((h) => h.bk_host_id) })
    ElMessage.success('已转移到目录')
    dirDialogVisible.value = false
    reload()
  } catch (e) {
    ElMessage.error('转移失败: ' + (e?.message || '后端异常'))
  } finally {
    transferring.value = false
  }
}

// 导入(老版 import-file 两步抽屉)
const importVisible = ref(false)
const importStep = ref(0)
const importParseSuccess = ref([])
const importParseError = ref([])
const importing = ref(false)
const importSourceFile = ref(null)

function openImport() {
  importStep.value = 0
  importSourceFile.value = null
  importParseSuccess.value = []
  importParseError.value = []
  importVisible.value = true
}

async function onFileChange(uploadFile) {
  if (!uploadFile?.raw) return
  const file = uploadFile.raw
  if (!/\.(xlsx|xls)$/i.test(file.name || '')) {
    ElMessage.warning('仅支持 .xlsx/.xls 文件')
    return
  }
  importSourceFile.value = file
}

// 下一步:服务端解析(op:1),返回成功/失败明细
async function goImportStep2() {
  if (!importSourceFile.value) return
  importing.value = true
  try {
    const params = { op: 1 }
    if (currentDirId.value && currentDirId.value !== 'default') params.bk_module_id = Number(currentDirId.value)
    const resp = await importHosts(importSourceFile.value, params)
    const info = resp?.data?.info || {}
    importParseSuccess.value = info.success || []
    importParseError.value = info.error || []
    importStep.value = 1
  } catch (e) {
    ElMessage.error('文件解析失败: ' + (e?.message || '后端异常'))
  } finally { importing.value = false }
}

async function downloadTemplate() {
  try {
    await downloadHostTemplate()
  } catch (e) { ElMessage.error('模板下载失败: ' + (e?.message || '后端异常')) }
}

// 导入(op:2,与老版 import-file 两段提交一致)
async function submitImport() {
  importing.value = true
  try {
    const params = { op: 2 }
    if (currentDirId.value && currentDirId.value !== 'default') params.bk_module_id = Number(currentDirId.value)
    await importHosts(importSourceFile.value, params)
    ElMessage.success('导入成功')
    importVisible.value = false
    importStep.value = 0
    importSourceFile.value = null
    importParseSuccess.value = []
    importParseError.value = []
    load()
  } finally { importing.value = false }
}

function goBack() {
  router.back()
}

function openInNewTab() {
  window.open(window.location.href, '_blank')
}

function switchTab(key) {
  groupTab.value = key
  currentDirId.value = key === 'unassigned' ? currentDirId.value : 'default'
  selectedHosts.value = []
  page.value = 1
  router.replace({ query: { ...route.query, scope: key, directory: key === 'unassigned' ? route.query.directory : undefined, page: undefined, _t: Date.now() } })
  load()
}

// 旧版契约:仅"无 adv → 有 adv"的跳变才自动展开侧滑(对齐 host-options 对 prev._t 的判断),
// 避免本页查询提交(router.replace 带 adv=1)后把刚关闭的侧滑又重新打开
const hasAdvQuery = computed(() => !!(route.query.adv || route.query.advanced))
watch(hasAdvQuery, (val, old) => {
  if (val && !old) openAdvancedFromRoute()
})

onMounted(async () => {
  const ip = route.query.ip
  if (ip) keyword.value = parseIpQuery(ip).text || String(ip)
  await openAdvancedFromRoute()
  // 先取属性与用户习惯,算出表头,再发首个列表请求(fields 跟随表头)
  await ensureAdvancedProperties()
  computeTableHeader(await ensureFilterUsercustom())
  const scope = ({ '1': 'unassigned', '0': 'assigned' })[String(route.query.scope)] || String(route.query.scope || 'unassigned')
  if (groupTabs.some((t) => t.key === scope)) groupTab.value = scope
  await loadDirectoryTree()
  const requestedDir = route.query.directory ? String(route.query.directory) : 'default'
  const children = dirTreeData.value[0]?.children || []
  currentDirId.value = requestedDir === 'empty' || (requestedDir !== 'default' && !children.some((c) => c.id === requestedDir))
    ? 'default'
    : requestedDir
  dirTreeRef.value?.setCurrentKey(currentDirId.value)
  await load()
})
</script>

<style scoped>
.host-page { height: 100%; display: flex; flex-direction: column; background: #fff; }
.page-header {
  display: flex; align-items: center; gap: 8px;
  padding: 0 20px; height: 50px; flex: 0 0 50px;
  border-bottom: 1px solid #E7E9EF;
}
.back-arrow, .outer-link { font-size: 16px; color: #63656e; cursor: pointer; }
.back-arrow:hover, .outer-link:hover { color: #3a84ff; }
.page-title {
  font-size: 16px; color: #313238; font-weight: 400;
  margin: 0; white-space: nowrap; flex: none;
}
.host-body { flex: 1; display: flex; overflow: hidden; }
.group-col {
  width: 240px; flex: 0 0 240px;
  border-right: 1px solid #E7E9EF;
  padding: 12px; overflow: auto;
  background: #fafbfc;
}
/* 全宽 scope tabs(对齐老版内容区顶部) */
.scope-tabs {
  display: flex; padding: 0 20px;
  border-bottom: 1px solid #E7E9EF;
  background: #fff;
}
.scope-tab {
  padding: 10px 4px; margin-right: 32px; font-size: 14px;
  color: #63656E; cursor: pointer; border-bottom: 2px solid transparent;
}
.scope-tab:hover { color: #3A84FF; }
.scope-tab.active { color: #3A84FF; border-bottom-color: #3A84FF; font-weight: 500; }

.dir-search-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.dir-add { color: #979BA5; }
.dir-add:hover { color: #3A84FF; }
.dir-tree { background: transparent; padding: 6px 0; }
.dir-row { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.dir-row .d-name { flex: 1; }
/* 老版 dot-menu:仅悬停目录行时出现 */
.dir-op { display: none; color: #979ba5; margin-right: 2px; }
.dir-row:hover .dir-op { display: inline-flex; }
.dir-op-trigger {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%; cursor: pointer; font-size: 14px;
}
.dir-op-trigger:hover { background: #fff; color: #3a84ff; }
.d-count { color: #979ba5; font-size: 12px; }
.import-steps {
  display: flex; align-items: center; justify-content: center;
  gap: 12px; margin-bottom: 14px;
}
.step-node { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; color: #63656e; }
.step-node i {
  font-style: normal; width: 22px; height: 22px; line-height: 22px; text-align: center;
  border: 1px solid #c4c6cc; border-radius: 50%; font-size: 12px; color: #63656e;
}
.step-node.active { color: #3a84ff; font-weight: 500; }
.step-node.active i { background: #3a84ff; border-color: #3a84ff; color: #fff; }
.step-node.done i { border-color: #3a84ff; color: #3a84ff; }
.step-dash { width: 80px; border-top: 1px dashed #c4c6cc; }
.import-footer { display: flex; gap: 8px; margin-top: 16px; }
.upload-area { display: flex; flex-direction: column; align-items: center; gap: 6px; color: #63656e; padding: 18px 0; }
.upload-area .upload-icon { font-size: 32px; color: #979ba5; }
.upload-area .link, .upload-tips .link { color: #3a84ff; cursor: pointer; }
.upload-tips { font-size: 12px; color: #63656e; margin-top: 8px; }
.parse-summary { display: flex; gap: 8px; margin-bottom: 10px; }
.relation-section { margin-top: 6px; }
.relation-title { font-size: 14px; font-weight: 700; color: #313238; margin-bottom: 8px; }
.main-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 12px 16px 12px; }
/* 表格视觉契约统一在全局 .legacy-table(bk-legacy.css) */
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.toolbar .spacer { flex: 1; }
.refresh-time { color: #979ba5; font-size: 12px; margin: 0 4px; }
.option-filter.active { color: #3A84FF; border-color: #3A84FF; }
.table-footer {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0 0; font-size: 12px; color: #63656E;
}
.table-footer .spacer { flex: 1; }
.import-toolbar { display: flex; align-items: center; gap: 8px; }
.hint { color: #979ba5; font-size: 12px; margin-left: 10px; }
</style>
