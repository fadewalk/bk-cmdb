<template>
  <div class="host-page">
    <h1 class="page-title sr-only">主机</h1>
    <!-- 全宽 scope tabs(对齐老版: 未分配/已分配/全部 在内容区顶部) -->
    <div class="scope-tabs">
      <span
        v-for="t in groupTabs" :key="t.key"
        :class="['scope-tab', { active: groupTab === t.key }]"
        @click="groupTab = t.key"
      >{{ t.label }}</span>
    </div>
    <div class="host-body">
      <!-- 左:分组目录树 -->
      <div class="group-col">
        <div class="dir-search-row">
          <el-input v-model="dirKeyword" placeholder="分组目录" size="small" clearable :prefix-icon="'Search'" />
          <el-button class="dir-add" size="small" :icon="'Plus'" link @click="openCreateDir()" />
        </div>
        <el-tree
          ref="dirTreeRef"
          :data="dirTreeData"
          :props="{ label: 'name', children: 'children' }"
          node-key="id"
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
              <span v-if="data.__count" class="d-count">{{ data.__count }}</span>
            </span>
          </template>
        </el-tree>
        <div class="dir-actions">
          <el-button size="small" :icon="'Edit'" link :disabled="currentDirId === 'default'" @click="onDirCmd('rename')">重命名</el-button>
          <el-button size="small" :icon="'Delete'" link :disabled="currentDirId === 'default'" @click="onDirCmd('delete')">删除</el-button>
        </div>
      </div>

      <!-- 右:列表 -->
      <div class="main-col">
    <div class="toolbar">
      <el-button size="small" type="primary" :icon="'Plus'" @click="importVisible = true">导入主机</el-button>
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
      <el-popover placement="bottom-end" :width="320" trigger="click" v-model:visible="filterVisible">
        <template #reference>
          <el-button size="small" :icon="'Filter'">筛选({{ activeFilterCount }})</el-button>
        </template>
            <div class="filter-panel">
              <div class="filter-row">
                <span>操作系统</span>
                <el-select v-model="filters.os" size="small" multiple collapse-tags clearable style="width: 220px" placeholder="不限">
                  <el-option v-for="o in osOptions" :key="o" :label="o" :value="o" />
                </el-select>
              </div>
              <div class="filter-row">
                <span>云区域</span>
                <el-select v-model="filters.cloudId" size="small" collapse-tags clearable style="width: 220px" placeholder="不限">
                  <el-option v-for="c in cloudOptions" :key="c.value" :label="c.label" :value="c.value" />
                </el-select>
              </div>
              <div class="filter-actions">
                <el-button size="small" @click="resetFilters">重置</el-button>
                <el-button size="small" type="primary" @click="reload">应用</el-button>
              </div>
            </div>
          </el-popover>
        </div>

        <el-table
          :data="pagedHosts"
          v-loading="loading"
          size="small"
          class="bk-table"
          @selection-change="onSelect"
        >
          <el-table-column type="selection" width="36" />
          <el-table-column label="ID" width="80" sortable>
            <template #default="{ row }">
              <el-link type="primary" :underline="false" @click="goDetail(row)">{{ row.bk_host_id }}</el-link>
            </template>
          </el-table-column>
          <el-table-column label="内网IPv4" min-width="130">
            <template #default="{ row }">
              <el-link type="primary" :underline="false" @click="goDetail(row)">{{ row.bk_host_innerip || '--' }}</el-link>
            </template>
          </el-table-column>
          <el-table-column label="内网IPv6" min-width="120">
            <template #default="{ row }">{{ row.bk_host_innerip_v6 || '--' }}</template>
          </el-table-column>
          <el-table-column label="管控区域" min-width="120">
            <template #default="{ row }">{{ cloudName(row.bk_cloud_id) }}</template>
          </el-table-column>
          <el-table-column label="业务拓扑" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ row.__topo || '资源池 / 空闲机池 / 空闲机' }}</template>
          </el-table-column>
          <el-table-column label="主机名称" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.bk_host_name || '--' }}</template>
          </el-table-column>
        </el-table>

        <div class="table-footer">
          <span>共计{{ total }}条</span>
          <span>每页</span>
          <el-select v-model="pageSize" size="small" style="width: 76px" @change="reload">
            <el-option v-for="n in [20, 50, 100]" :key="n" :label="String(n)" :value="n" />
          </el-select>
          <span>条</span>
          <span class="spacer" />
          <span>已选择{{ selectedHosts.length }}条</span>
          <el-pagination
            v-model:current-page="page"
            :page-size="pageSize"
            :total="total"
            layout="prev, pager, next"
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

    <!-- 导入主机 -->
    <el-dialog v-model="importVisible" title="导入主机" width="720px" top="6vh">
      <el-alert type="info" :closable="false" style="margin-bottom: 12px"
        title="支持 CSV 文件上传,或在下方直接粘贴 Excel/CSV 文本" />
      <div class="import-toolbar">
        <el-upload :auto-upload="false" :limit="1" accept=".csv,.xlsx,.xls" :on-change="onFileChange">
          <el-button size="small" :icon="'Upload'" :loading="parsing">选择文件并预览</el-button>
        </el-upload>
        <el-button size="small" @click="downloadTemplate">下载模板</el-button>
        <el-button size="small" type="primary" :loading="importing" :disabled="!parsedRows.length"
          @click="submitImport">导入 ({{ parsedRows.length }} 行)</el-button>
      </div>
      <el-input v-model="importText" type="textarea" :rows="6" placeholder="一行一台主机..." style="margin-top: 8px" @input="parseText" />
      <el-table :data="parsedRows" max-height="240" size="small" border style="margin-top: 8px">
        <el-table-column prop="bk_host_innerip" label="内网IP" min-width="130" />
        <el-table-column prop="bk_cloud_id" label="云区域ID" width="100" />
        <el-table-column prop="bk_host_name" label="主机名" min-width="140" />
        <el-table-column prop="bk_os_name" label="操作系统" min-width="120" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.__error" type="danger" size="small">{{ row.__error }}</el-tag>
            <el-tag v-else type="success" size="small">就绪</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, Monitor, Filter } from '@element-plus/icons-vue'
import {
  http, listHostsWithoutApp, transferHostModule, transferHostToResource,
  transferHostsToDirectory, importHosts, listResourceDirectory, deleteHostsBatch, exportHosts,
  updateResourceDirectory, deleteResourceDirectory, createResourceDirectory,
  listHostFavorites, createHostFavorite, incrHostFavorite, deleteHostFavorite,
  getBizTopoTree, getBizInternalTopo
} from '../api/cmdb'
import { useBizStore } from '../stores/biz'

const route = useRoute()
const router = useRouter()
const bizStore = useBizStore()

const groupTabs = [
  { key: 'unassigned', label: '未分配' },
  { key: 'assigned', label: '已分配' },
  { key: 'all', label: '全部' }
]
const groupTab = ref('all')

// 资源目录
const dirTreeRef = ref()
const dirTreeData = ref([])
const dirKeyword = ref('')
const currentDirId = ref(null)
const dirOptions = computed(() => {
  // dirTreeData 已是树形,递归取所有 node 即可
  return dirTreeData.value
})

const groupList = ref([
  { id: 'idle-pool', name: '空闲机池', count: 0 },
  { id: 'host-pool', name: '主机池', count: 0 }
])
const activeGroup = ref('idle-pool')

const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const rows = ref([])
const selectedHosts = ref([])
const loading = ref(false)
const refreshText = ref('刚刚刷新')

// 筛选
const filterVisible = ref(false)
const filters = ref({ os: [], cloudId: null })
const activeFilterCount = computed(() => (filters.value.os?.length ? 1 : 0) + (filters.value.cloudId ? 1 : 0))
const osOptions = computed(() => [...new Set(rows.value.map((r) => r.bk_os_name).filter(Boolean))])
const cloudOptions = computed(() => {
  const map = new Map()
  for (const r of rows.value) if (r.bk_cloud_id !== undefined) map.set(r.bk_cloud_id, cloudName(r.bk_cloud_id))
  return [...map.entries()].map(([value, label]) => ({ value, label }))
})

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

const pagedHosts = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return rows.value.slice(start, start + pageSize.value)
})

function filterDir(value, data) {
  if (!value) return true
  return (data.name || '').toLowerCase().includes(value.toLowerCase())
}
watch(dirKeyword, (v) => dirTreeRef.value?.filter(v))

function onDirClick(node) {
  currentDirId.value = node.id
  if (node.id !== 'default') {
    ElMessage.info(`已选中目录:${node.name}(独立模式后端暂未支持按目录筛选)`)
  }
}

function onDirContext(event, data) {
  // 阻止默认右键
  currentDirId.value = data.id
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

function onGroupClick(g) {
  activeGroup.value = g.id
  reload()
}

async function loadDirectoryTree() {
  try {
    const list = await listResourceDirectory()
    // 后端返回数组;虚拟根节点
    const items = (list?.info || list || []).map((d) => ({
      id: d.bk_module_id || d.id,
      name: d.bk_module_name || d.name,
      __count: d.bk_host_count
    }))
    dirTreeData.value = [
      {
        id: 'default', name: '默认', children: items.length ? items : [{ id: 'empty', name: '(空)' }],
        __icon: 'icon-cc-host'
      }
    ]
  } catch (e) {
    dirTreeData.value = [{ id: 'default', name: '默认', children: [] }]
  }
}

async function load() {
  loading.value = true
  try {
    const body = {
      page: { start: 0, limit: 1000, sort: 'bk_host_id' },
      fields: ['bk_host_id', 'bk_host_innerip', 'bk_host_innerip_v6', 'bk_host_name', 'bk_cloud_id', 'bk_os_name', 'bk_module_id']
    }
    if (keyword.value) {
      body.host_property_filter = {
        condition: 'AND',
        rules: [{ field: 'bk_host_innerip', operator: 'contains', value: keyword.value }]
      }
    }
    if (filters.value.cloudId !== null && filters.value.cloudId !== undefined) {
      body.host_property_filter = body.host_property_filter || { condition: 'AND', rules: [] }
      body.host_property_filter.rules.push({ field: 'bk_cloud_id', operator: 'equal', value: filters.value.cloudId })
    }
    if (filters.value.os && filters.value.os.length) {
      body.host_property_filter = body.host_property_filter || { condition: 'AND', rules: [] }
      for (const os of filters.value.os) {
        body.host_property_filter.rules.push({ field: 'bk_os_name', operator: 'contains', value: os })
      }
    }
    const raw = await http.post('/hosts/list_hosts_without_app', body)
    const list = (raw?.info || []).map((h) => h.host || h)
    rows.value = list
    total.value = list.length
    refreshText.value = '刚刚刷新'
    groupList.value = [
      { id: 'idle-pool', name: '空闲机池', count: list.length },
      { id: 'host-pool', name: '主机池', count: list.length }
    ]
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load()
}

function resetFilters() {
  filters.value = { os: [], cloudId: null }
  filterVisible.value = false
  reload()
}

function onSelect(rows) {
  selectedHosts.value = rows
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

function onBatchEdit() {
  ElMessage.info(`批量编辑 ${selectedHosts.value.length} 台主机属性(请在主机详情中逐台编辑)`)
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

// 导入
const importVisible = ref(false)
const importText = ref('')
const parsedRows = ref([])
const importing = ref(false)
const parsing = ref(false)

function parseText() {
  const lines = importText.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const rows = []
  for (const line of lines) {
    const parts = line.split(/[,\t]/).map((s) => s.trim())
    const [ip, cloudId, hostName, os] = parts
    if (!ip) continue
    let err = ''
    if (!/^[\d.]+$/.test(ip)) err = 'IP 格式错'
    else if (cloudId && !/^\d+$/.test(cloudId)) err = '云区域 ID 需为数字'
    rows.push({ bk_host_innerip: ip, bk_cloud_id: cloudId ? Number(cloudId) : 0, bk_host_name: hostName || '', bk_os_name: os || '', __error: err })
  }
  parsedRows.value = rows
}

async function onFileChange(uploadFile) {
  if (!uploadFile?.raw) return
  parsing.value = true
  try {
    const text = await uploadFile.raw.text()
    importText.value = text
    parseText()
    ElMessage.success(`已识别 ${parsedRows.value.length} 行`)
  } catch (e) { ElMessage.error('文件解析失败') }
  finally { parsing.value = false }
}

function downloadTemplate() {
  const csv = 'IP,云区域ID,主机名,操作系统\n10.0.0.100,0,host-100,Linux\n10.0.0.101,0,host-101,Windows\n'
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'host-template.csv'; a.click()
  URL.revokeObjectURL(url)
}

async function submitImport() {
  const valid = parsedRows.value.filter((r) => !r.__error)
  if (!valid.length) { ElMessage.warning('无可导入的有效行'); return }
  importing.value = true
  try {
    const csv = ['IP,云区域ID,主机名,操作系统', ...valid.map((r) => `${r.bk_host_innerip},${r.bk_cloud_id},${r.bk_host_name},${r.bk_os_name}`)].join('\n')
    const file = new File([csv], 'hosts.csv', { type: 'text/csv' })
    await importHosts(file, {})
    ElMessage.success(`成功导入 ${valid.length} 台主机`)
    importVisible.value = false
    importText.value = ''
    parsedRows.value = []
    load()
  } finally { importing.value = false }
}

onMounted(() => {
  const ip = route.query.ip
  if (ip) keyword.value = String(ip)
  if (route.query.cloudId !== undefined) filters.value.cloudId = Number(route.query.cloudId)
  if (route.query.advanced) filterVisible.value = true
  loadDirectoryTree()
  load()
})
</script>

<style scoped>
.host-page { height: 100%; display: flex; flex-direction: column; background: #fff; }
.page-title {
  font-size: 16px; color: #313238; font-weight: 400;
  padding: 0 20px; height: 50px; line-height: 50px;
  border-bottom: 1px solid #E7E9EF;
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
.d-count { color: #979ba5; font-size: 12px; }
.main-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 12px 16px 12px; }
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.toolbar .spacer { flex: 1; }
.refresh-time { color: #979ba5; font-size: 12px; margin: 0 4px; }
.filter-panel { padding: 8px 0; }
.filter-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.filter-row span { width: 60px; color: #63656E; font-size: 13px; }
.filter-actions { display: flex; justify-content: flex-end; gap: 8px; }
.table-footer {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0 0; font-size: 12px; color: #63656E;
}
.table-footer .spacer { flex: 1; }
.import-toolbar { display: flex; align-items: center; gap: 8px; }
.hint { color: #979ba5; font-size: 12px; margin-left: 10px; }
</style>