<template>
  <div class="page-card category-wrapper" v-loading="loading">
    <h1 class="page-title">服务分类</h1>
    <p class="page-tips">服务分类用于对服务进行分类管理，支持两级层级（一级分类 / 二级分类），二级分类可关联服务模板。</p>

    <div class="category-filter">
      <el-input
        v-model="keyword"
        class="filter-input"
        clearable
        :prefix-icon="'Search'"
        placeholder="请输入关键字"
      />
    </div>

    <div class="category-list">
      <div
        v-for="main in displayList"
        :key="main.id"
        :class="['category-item', { editing: editMainStatus === main.id }]"
      >
        <div class="category-title" :style="{ 'background-color': editMainStatus === main.id ? '#f0f1f5' : '' }">
          <div class="main-edit" v-if="editMainStatus === main.id" :style="{ width: '100%' }">
            <CategoryInput
              ref="editInputRefs"
              v-model="mainCategoryName"
              placeholder="请输入一级分类"
              @on-confirm="(name) => handleEditCategory(main, 'main', name)"
              @on-cancel="handleCloseEditMain"
            />
          </div>
          <template v-else>
            <div class="category-name">
              <template v-if="main.is_built_in">
                <div class="category-name-text is-built-in">
                  <div class="text-inner">
                    <span class="main-name" :title="main.name">{{ main.name }}</span>
                    <span class="main-id">{{ main.id }}</span>
                  </div>
                </div>
                <span class="built-in-sign">内置</span>
              </template>
              <div v-else class="category-name-text" @click.stop="handleEditMain(main.id, main.name)">
                <div class="text-inner">
                  <span class="main-name" :title="main.name">{{ main.name }}</span>
                  <span class="main-id">{{ main.id }}</span>
                </div>
              </div>
            </div>
            <div v-if="!main.is_built_in" class="menu-operational">
              <el-button class="menu-btn" link :icon="'Plus'" @click="handleShowAddChild(main.id)" />
              <el-tooltip
                v-if="!main.child_category_list || main.child_category_list.length"
                content="请先清空二级分类"
                placement="right"
              >
                <span class="menu-btn no-allow-btn"><el-icon><Delete /></el-icon></span>
              </el-tooltip>
              <el-button
                v-else
                class="menu-btn"
                link
                :icon="'Delete'"
                @click="handleDeleteCategory(main.id, 'main')"
              />
            </div>
          </template>
        </div>

        <div class="child-category">
          <div
            v-for="child in main.child_category_list"
            :key="child.id"
            :class="['child-item', { 'child-edit': editChildStatus === child.id, 'is-built-in': child.is_built_in }]"
          >
            <CategoryInput
              v-if="editChildStatus === child.id"
              ref="editInputRefs"
              class="child-input"
              v-model="childCategoryName"
              placeholder="请输入二级分类"
              @on-confirm="(name) => handleEditCategory(child, 'child', name)"
              @on-cancel="handleCloseEditChild"
            />
            <template v-else>
              <div class="child-title">
                <span :title="child.name">{{ child.name }}</span>
                <span class="child-id" :title="child.id">#{{ child.id }}</span>
                <div v-if="!child.is_built_in" class="child-edit">
                  <el-button class="child-edit-btn" link :icon="'Edit'" @click.stop="handleEditChild(child.id, child.name)" />
                  <el-button
                    v-if="!child.usage_amount"
                    class="child-edit-btn"
                    link
                    :icon="'Close'"
                    @click.stop="handleDeleteCategory(main.id, 'child', child.id)"
                  />
                  <el-tooltip v-else content="二级分类已被使用，无法删除" placement="top">
                    <el-icon class="child-edit-btn disabled-icon"><Close /></el-icon>
                  </el-tooltip>
                </div>
              </div>
            </template>
          </div>

          <!-- + 添加二级分类 -->
          <div v-if="!main.is_built_in && !isAddingChild(main.id) && !editMainStatus" class="child-item is-add">
            <div class="child-title">
              <el-button class="add-btn" link @click="handleShowAddChild(main.id)">
                <el-icon class="btn-icon"><Plus /></el-icon>
                <span>添加</span>
              </el-button>
            </div>
          </div>

          <!-- 二级分类输入框 -->
          <div v-if="addChildStatus === main.id" class="child-item child-edit">
            <CategoryInput
              ref="addInputRefs"
              class="child-input"
              v-model="newCategoryName"
              :edit-id="main.bk_root_id || main.id"
              placeholder="请输入二级分类"
              @on-confirm="(name, rootId) => handleAddCategory(name, rootId)"
              @on-cancel="handleCloseAddChild"
            />
          </div>
        </div>
      </div>

      <!-- 新建一级分类卡片 -->
      <div
        v-show="!keyword"
        class="category-item add-item"
        :style="{ 'border-style': showAddMainCategory ? 'solid' : 'dashed' }"
      >
        <div class="category-title" :style="{ 'border-bottom-style': showAddMainCategory ? 'solid' : 'dashed' }">
          <div v-if="showAddMainCategory" class="main-edit" :style="{ width: '100%' }">
            <CategoryInput
              ref="addMainInputRef"
              v-model="newCategoryName"
              placeholder="请输入一级分类"
              @on-confirm="(name) => handleAddCategory(name, 0)"
              @on-cancel="handleCloseAddBox"
            />
          </div>
        </div>
        <div class="child-category" />
        <el-button
          v-show="!showAddMainCategory"
          class="add-btn add-main-btn"
          :disabled="!bizId"
          @click="handleAddBox"
        />
      </div>
    </div>

    <el-empty
      v-if="!loading && displayList.length === 0"
      description="暂无服务分类"
      :image-size="100"
      class="empty-content"
    >
      <template #default>
        <div class="empty-default">
          <p>{{ keyword ? '没有匹配的服务分类' : '暂无服务分类' }}</p>
          <el-button v-if="keyword" link type="primary" @click="handleClearFilter">清空筛选</el-button>
        </div>
      </template>
    </el-empty>

    <el-empty v-if="!bizId" description="请先选择业务" :image-size="100" class="empty-content" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { Plus, Edit, Delete, Close, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useBizStore } from '../../stores/biz'
import {
  searchServiceCategories,
  createServiceCategory,
  updateServiceCategory,
  deleteServiceCategory
} from '../../api/cmdb'
import CategoryInput from './children/CategoryInput.vue'

const bizStore = useBizStore()
const bizId = computed(() => bizStore.bizId)

const loading = ref(false)
const keyword = ref('')
const list = ref([])            // 后端原始树形
const displayList = ref([])     // 过滤后展示的树形

const editMainStatus = ref(null)
const editChildStatus = ref(null)
const addChildStatus = ref(null)
const showAddMainCategory = ref(false)
const newCategoryName = ref('')
const mainCategoryName = ref('')
const childCategoryName = ref('')

const editInputRefs = ref([])
const addInputRefs = ref([])
const addMainInputRef = ref(null)

function isAddingChild(id) {
  return addChildStatus.value === id
}

function focusInput(refs) {
  nextTick(() => {
    const arr = Array.isArray(refs.value) ? refs.value : [refs.value]
    const r = arr.find(Boolean)
    r?.focus?.()
  })
}

async function loadCategories() {
  if (!bizId.value) return
  loading.value = true
  try {
    const data = await searchServiceCategories(bizId.value)
    const info = data?.info || []
    list.value = info.map((item) => {
      const main = item.category
      return {
        ...main,
        usage_amount: item.usage_amount ?? main.usage_amount ?? 0,
        child_category_list: (item.sub_categories || []).map((sub) => ({
          ...sub.category,
          usage_amount: sub.usage_amount ?? 0
        }))
      }
    }).filter((m) => m && m.name)
    // 过滤掉名为 Default 的内置根分类（旧逻辑保留）
    const filtered = list.value.filter((m) => !(m.is_built_in && m.name === 'Default'))
    applyFilter(filtered)
  } finally {
    loading.value = false
  }
}

function applyFilter(arr) {
  if (!keyword.value) {
    displayList.value = arr
    return
  }
  const reg = new RegExp(keyword.value, 'i')
  displayList.value = arr.filter((m) => {
    if (reg.test(m.name) || reg.test(String(m.id))) return true
    return m.child_category_list.some((c) => reg.test(c.name) || reg.test(String(c.id)))
  })
}

let filterTimer = null
watch(keyword, () => {
  clearTimeout(filterTimer)
  filterTimer = setTimeout(() => applyFilter(list.value), 200)
})
watch(list, (v) => applyFilter(v))

watch(bizId, () => {
  resetAll()
  loadCategories()
})

onMounted(() => {
  resetAll()
  loadCategories()
})

function resetAll() {
  editMainStatus.value = null
  editChildStatus.value = null
  addChildStatus.value = null
  showAddMainCategory.value = false
  newCategoryName.value = ''
  mainCategoryName.value = ''
  childCategoryName.value = ''
}

function handleEditMain(id, name) {
  editMainStatus.value = id
  mainCategoryName.value = name
  editChildStatus.value = null
  addChildStatus.value = null
  showAddMainCategory.value = false
  focusInput(editInputRefs)
}
function handleCloseEditMain() {
  editMainStatus.value = null
}
function handleEditChild(id, name) {
  editChildStatus.value = id
  childCategoryName.value = name
  addChildStatus.value = null
  editMainStatus.value = null
  showAddMainCategory.value = false
  focusInput(editInputRefs)
}
function handleCloseEditChild() {
  editChildStatus.value = null
}
function handleShowAddChild(id) {
  addChildStatus.value = id
  editMainStatus.value = null
  editChildStatus.value = null
  showAddMainCategory.value = false
  newCategoryName.value = ''
  focusInput(addInputRefs)
}
function handleCloseAddChild() {
  addChildStatus.value = null
  newCategoryName.value = ''
}
function handleAddBox() {
  showAddMainCategory.value = true
  newCategoryName.value = ''
  addChildStatus.value = null
  editMainStatus.value = null
  editChildStatus.value = null
  focusInput({ value: addMainInputRef.value })
}
function handleCloseAddBox() {
  showAddMainCategory.value = false
  newCategoryName.value = ''
}

function handleClearFilter() {
  keyword.value = ''
}

async function handleAddCategory(name, rootId = 0) {
  if (!name || !name.trim()) {
    ElMessage.warning('请输入分类名称')
    return
  }
  if (!bizId.value) return
  try {
    const res = await createServiceCategory(bizId.value, name.trim(), rootId || 0)
    ElMessage.success('保存成功')
    if (rootId) {
      // 二级：本地插入
      const main = list.value.find((m) => m.bk_root_id === rootId || m.id === rootId)
      if (main) {
        main.child_category_list.push(res)
      } else {
        await loadCategories()
      }
      handleCloseAddChild()
    } else {
      handleCloseAddBox()
      await loadCategories()
    }
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  }
}

async function handleEditCategory(target, type, name) {
  if (!name || !name.trim()) {
    ElMessage.warning('请输入分类名称')
    return
  }
  if (name.trim() === target.name) {
    type === 'main' ? handleCloseEditMain() : handleCloseEditChild()
    return
  }
  if (!bizId.value) return
  try {
    const res = await updateServiceCategory(bizId.value, target.id, name.trim())
    ElMessage.success('保存成功')
    type === 'main' ? handleCloseEditMain() : handleCloseEditChild()
    if (type === 'child') {
      const main = list.value.find((m) => m.id === res.bk_root_id)
      if (main) {
        const idx = main.child_category_list.findIndex((c) => c.id === res.id)
        if (idx >= 0) main.child_category_list.splice(idx, 1, { ...res, usage_amount: target.usage_amount })
      }
    } else {
      const idx = list.value.findIndex((m) => m.id === res.id)
      if (idx >= 0) {
        list.value[idx] = { ...list.value[idx], ...res }
      }
    }
    applyFilter(list.value)
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  }
}

async function handleDeleteCategory(mainId, type, childId) {
  if (!bizId.value) return
  const target =
    type === 'main'
      ? list.value.find((m) => m.id === mainId)
      : list.value.find((m) => m.id === mainId)?.child_category_list.find((c) => c.id === childId)
  if (!target) return
  try {
    await ElMessageBox.confirm(`确认删除分类「${target.name}」？`, '确认删除分类', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  try {
    await deleteServiceCategory(bizId.value, target.id)
    ElMessage.success('删除成功')
    if (type === 'main') {
      list.value = list.value.filter((m) => m.id !== mainId)
    } else {
      const main = list.value.find((m) => m.id === mainId)
      if (main) {
        main.child_category_list = main.child_category_list.filter((c) => c.id !== childId)
      }
    }
    applyFilter(list.value)
  } catch (e) {
    ElMessage.error('删除失败: ' + (e?.message || '后端异常'))
  }
}
</script>

<style scoped>
.category-wrapper {
  padding: 15px 20px 0;
  position: relative;
  min-height: 400px;
}

.category-filter {
  margin-bottom: 12px;
  .filter-input {
    width: 260px;
  }
}

.category-list {
  display: flex;
  flex-flow: row wrap;
}

.category-item {
  position: relative;
  flex: 0 0 calc(25% - 15px);
  border: 1px solid #dcdee5;
  border-radius: 0 0 2px 2px;
  margin-left: 20px;
  margin-bottom: 20px;
  overflow: hidden;
  background: #fff;
  &:hover:not(.add-item) {
    box-shadow: 0 2px 6px 0 rgba(0, 0, 0, 0.1);
    .menu-operational { display: flex; }
  }
  &:nth-child(4n+1) {
    margin-left: 0;
  }
  &.add-item {
    min-height: 332px;
    background: #fafbfd;
    .category-title {
      background-color: #fafbfd;
      border-bottom-style: dashed !important;
    }
    .add-main-btn {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: transparent;
      border: none;
      &::before, &::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 20px;
        height: 3px;
        background-color: #3a84ff;
        transform: translate(-50%, -50%);
      }
      &::before {
        width: 3px;
        height: 20px;
      }
    }
  }
}

.category-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #fafbfd;
  padding: 0 12px;
  height: 52px;
  font-size: 14px;
  color: #63656e;
  font-weight: bold;
  border-bottom: 1px solid #dcdee5;
  .main-edit {
    display: flex;
    align-items: center;
  }
  .category-name {
    display: flex;
    align-items: center;
    flex: 1;
    overflow: hidden;
    .category-name-text {
      max-width: 100%;
      cursor: pointer;
      .text-inner {
        display: inline-flex;
        flex-direction: column;
        padding: 2px 6px;
        line-height: normal;
        max-width: 100%;
        &:hover { background: #f0f1f5; }
      }
      .main-name {
        height: 20px;
        line-height: 20px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .main-id {
        font-size: 12px;
        font-weight: 400;
        color: #c4c6cc;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        &::before { content: '#'; }
      }
      &.is-built-in {
        cursor: initial;
        .text-inner:hover { background: transparent; }
      }
    }
    .built-in-sign {
      display: inline-block;
      height: 20px;
      line-height: 20px;
      margin-left: 4px;
      padding: 0 6px;
      font-size: 12px;
      color: #fff;
      background-color: #d3d5dd;
      border-radius: 2px;
    }
  }
}

.menu-operational {
  display: none;
  padding: 6px 0;
  align-items: center;
  .menu-btn {
    color: #979ba5;
    padding: 0 7px;
    height: 30px;
    &:hover { color: #3a84ff; }
    &.no-allow-btn {
      cursor: not-allowed;
      color: #dcdee5;
    }
    :deep(.el-icon) { font-size: 16px; }
  }
}

.child-category {
  height: 280px;
  padding: 0 10px 10px 38px;
  overflow-y: auto;
  .child-item {
    position: relative;
    z-index: 10;
    line-height: 32px;
    display: flex;
    align-items: center;
    &.child-edit {
      &:first-child::after { height: 32px; }
      .child-input { margin-left: 10px; padding-left: 8px; }
    }
    &:hover:not(.is-built-in):not(.is-add):not(.child-edit) {
      .child-title {
        background-color: #fafbfd;
        color: #3a84ff;
      }
      .child-id { display: none; }
    }
    &:first-child {
      padding-top: 14px;
      &::after { height: 30px; top: 0; }
    }
    &::after {
      content: '';
      position: absolute;
      top: -15px;
      left: -20px;
      width: 30px;
      height: 32px;
      border-bottom: 1px solid #dcdee5;
      border-left: 1px solid #dcdee5;
      z-index: -1;
    }
    .child-title {
      flex: 1;
      display: flex;
      align-items: center;
      color: #63656e;
      font-size: 14px;
      padding: 0 8px 0 18px;
      margin-left: 10px;
      min-height: 32px;
      overflow: hidden;
      > span:first-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding-right: 10px;
        max-width: 100%;
      }
      .child-id {
        min-width: 42px;
        font-size: 12px;
        color: #c4c6cc;
        text-align: right;
        padding-right: 6px;
        &::before { content: '#'; }
      }
    }
    .child-edit {
      display: none;
      margin-left: auto;
      .child-edit-btn {
        color: #3a84ff;
        padding: 0 4px;
        &.disabled-icon {
          color: #dcdee5;
          cursor: not-allowed;
          font-size: 12px;
        }
        :deep(.el-icon) { font-size: 14px; }
      }
    }
    &.is-add .add-btn {
      color: #979ba5;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding-left: 18px;
      &:hover { color: #3a84ff; }
    }
  }
}

.empty-content {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  .empty-default {
    text-align: center;
    p { color: #63656e; margin-bottom: 8px; }
  }
}

@media screen and (min-width: 1920px) {
  .category-item {
    flex: 0 0 calc(20% - 16px) !important;
    &:nth-child(4n+1) { margin-left: 20px !important; }
    &:nth-child(5n+1) { margin-left: 0 !important; }
  }
}
</style>
