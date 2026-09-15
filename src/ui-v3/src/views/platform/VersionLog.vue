<template>
  <div class="version-log-page page-card">
    <div class="version-log-header">
      <div>
        <div class="page-title">版本日志</div>
        <div class="page-subtitle">查看产品版本变更和功能更新</div>
      </div>
      <el-button @click="loadList" :loading="listLoading">刷新</el-button>
    </div>

    <el-alert v-if="listError" type="error" :closable="false" show-icon class="state-alert">
      {{ listError }}
      <el-button link type="primary" @click="loadList">重试</el-button>
    </el-alert>

    <el-empty v-else-if="!listLoading && !versions.length" description="暂无版本日志" />
    <div v-else class="version-log-body" v-loading="listLoading">
      <aside class="version-list">
        <button
          v-for="item in versions"
          :key="item.version"
          class="version-item"
          :class="{ active: item.version === selectedVersion }"
          type="button"
          @click="selectVersion(item.version)"
        >
          <span class="version-item-title">{{ item.version }}</span>
          <span class="version-item-date">{{ item.time || '--' }}</span>
          <el-tag v-if="item.is_current" size="small" type="success">当前版本</el-tag>
        </button>
      </aside>
      <main class="version-detail" v-loading="detailLoading">
        <el-alert v-if="detailError" type="error" :closable="false" show-icon>
          {{ detailError }}
          <el-button link type="primary" @click="loadDetail">重试</el-button>
        </el-alert>
        <el-empty v-else-if="!detailContent && !detailLoading" description="请选择版本" />
        <article v-else class="markdown-container" v-html="detailContent" />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { getChangelogDetail, getChangelogList } from '../../api/cmdb'
import { currentVersion, renderSafeMarkdown, shouldAutoOpen, sortVersions } from '../../utils/version-log'

const versions = ref([])
const selectedVersion = ref('')
const detailContent = ref('')
const listLoading = ref(false)
const detailLoading = ref(false)
const listError = ref('')
const detailError = ref('')
const autoOpened = ref(false)

const selectedItem = computed(() => versions.value.find(item => item.version === selectedVersion.value))

async function loadList() {
  listLoading.value = true
  listError.value = ''
  try {
    const data = await getChangelogList({ page: { start: 0, limit: 100, sort: '-version' } })
    const list = Array.isArray(data) ? data : (data?.info || [])
    versions.value = sortVersions(list)
    const latest = currentVersion(versions.value)
    const previous = localStorage.getItem('newVersion') || ''
    const requested = selectedVersion.value && versions.value.some(item => item.version === selectedVersion.value)
      ? selectedVersion.value
      : latest
    selectedVersion.value = requested
    if (shouldAutoOpen(previous, latest)) autoOpened.value = true
    if (latest) localStorage.setItem('newVersion', latest)
    if (selectedVersion.value) await loadDetail()
  } catch (error) {
    listError.value = error?.message || '版本日志加载失败'
  } finally {
    listLoading.value = false
  }
}

async function loadDetail() {
  if (!selectedVersion.value) return
  detailLoading.value = true
  detailError.value = ''
  try {
    const data = await getChangelogDetail(selectedVersion.value)
    const markdown = typeof data === 'string' ? data : (data?.content || data?.detail || '')
    detailContent.value = renderSafeMarkdown(markdown)
  } catch (error) {
    detailError.value = error?.message || '版本日志详情加载失败'
    detailContent.value = ''
  } finally {
    detailLoading.value = false
  }
}

async function selectVersion(version) {
  selectedVersion.value = version
  await loadDetail()
}

onMounted(loadList)
</script>

<style scoped>
.version-log-page { min-height: calc(100vh - 110px); }
.version-log-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 18px; }
.page-title { color: #313238; font-size: 20px; font-weight: 600; line-height: 28px; }
.page-subtitle { color: #979ba5; font-size: 13px; margin-top: 4px; }
.state-alert { margin-bottom: 16px; }
.version-log-body { display: flex; min-height: 560px; border: 1px solid #dcdee5; background: #fff; }
.version-list { width: 250px; flex: 0 0 250px; padding: 10px 0; border-right: 1px solid #eaebf0; background: #fafbfd; overflow: auto; }
.version-item { position: relative; width: 100%; display: block; padding: 14px 18px; border: 0; border-left: 3px solid transparent; background: transparent; color: #63656e; text-align: left; cursor: pointer; }
.version-item:hover { background: #f0f1f5; }
.version-item.active { border-left-color: #3a84ff; background: #eaf2ff; color: #1768d5; }
.version-item-title { display: block; font-size: 14px; font-weight: 600; }
.version-item-date { display: block; margin-top: 6px; color: #979ba5; font-size: 12px; }
.version-item .el-tag { position: absolute; right: 12px; top: 14px; }
.version-detail { flex: 1; min-width: 0; padding: 28px 38px; overflow: auto; }
.markdown-container { color: #63656e; font-size: 14px; line-height: 1.7; }
.markdown-container :deep(h1), .markdown-container :deep(h2), .markdown-container :deep(h3), .markdown-container :deep(h4), .markdown-container :deep(h5), .markdown-container :deep(h6) { color: #313238; margin: 0 0 14px; line-height: 1.4; }
.markdown-container :deep(h1) { font-size: 26px; }.markdown-container :deep(h2) { font-size: 22px; }.markdown-container :deep(h3) { font-size: 18px; }
.markdown-container :deep(p) { margin: 0 0 14px; }.markdown-container :deep(ul) { padding-left: 22px; margin: 0 0 14px; }
.markdown-container :deep(code) { padding: 2px 5px; color: #c7254e; background: #f7f7f9; border-radius: 3px; }
.markdown-container :deep(pre) { padding: 12px; overflow: auto; background: #f5f6fa; border: 1px solid #dcdee5; border-radius: 3px; }
.markdown-container :deep(pre code) { padding: 0; color: #63656e; background: transparent; }
.markdown-container :deep(a) { color: #3a84ff; }
</style>
