<template>
  <el-select
    class="biz-mix-selector"
    :model-value="modelValue"
    filterable
    :filter-method="handleSearch"
    placeholder="请选择业务"
    popper-class="biz-mix-popover"
    @change="handleChange"
    @visible-change="handleToggle"
  >
    <el-option
      v-for="option in displayList"
      :key="option.id"
      :label="option.rawName"
      :value="option.id"
    >
      <div class="option-item-content" :title="option.rawName">
        <span class="text">
          <span class="item-name">{{ option.rawName }}</span>
          <span class="item-id">({{ option.rawId }})</span>
        </span>
        <i
          v-if="option.isBizSet"
          class="bk-cmdb-icon icon-cc-business-set bizset-flag"
          title="业务集"
        />
        <i
          class="bk-cmdb-icon icon-cc-star collect"
          :class="{ collected: isCollected(option) }"
          title="收藏"
          @click.prevent.stop="bizStore.toggleCollect(option.id)"
        />
      </div>
    </el-option>
    <div v-if="!displayList.length" class="mix-empty">
      <div v-if="searchKeyword">搜索结果为空</div>
      <div v-else>暂无数据</div>
    </div>
    <template #footer>
      <div class="mix-extension">
        <a class="extension-link" href="javascript:;" @click="goCreate('/resource/business')">新建业务</a>
        <a class="extension-link" href="javascript:;" @click="goCreate('/resource/biz-set')">新建业务集</a>
      </div>
    </template>
  </el-select>
</template>

<script setup>
// 旧版 cmdb-business-mix-selector 复刻(src/ui/src/components/ui/selector/business-mix.vue):
// 业务 + 业务集混合下拉、name (id) 展示、业务集角标、收藏置顶、底部新建入口。
// 值格式沿用旧版 `${id}-biz` / `${id}-bizset`。
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useBizStore } from '../stores/biz'

defineProps({
  modelValue: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'select'])

const router = useRouter()
const bizStore = useBizStore()
const searchKeyword = ref('')

const options = computed(() => {
  const list = [
    ...bizStore.bizList.map((biz) => ({
      isBizSet: false,
      rawId: biz.bk_biz_id,
      rawName: biz.bk_biz_name,
      id: `${biz.bk_biz_id}-biz`
    })),
    ...bizStore.bizSetList.map((bizSet) => ({
      isBizSet: true,
      rawId: bizSet.bk_biz_set_id,
      rawName: bizSet.bk_biz_set_name,
      id: `${bizSet.bk_biz_set_id}-bizset`
    }))
  ]
  return list
})

// 旧版排序:收藏优先(按收藏先后),其余保持业务在前、业务集在后,id 正序
const sortedList = computed(() => options.value.slice().sort((a, b) => {
  const isACollected = isCollected(a)
  const isBCollected = isCollected(b)
  if (isACollected && isBCollected) {
    return bizStore.collections.indexOf(a.id) - bizStore.collections.indexOf(b.id)
  }
  if (isACollected !== isBCollected) return isACollected ? -1 : 1
  if (a.isBizSet !== b.isBizSet) return a.isBizSet ? 1 : -1
  return a.rawId - b.rawId
}))

const displayList = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return sortedList.value
  return sortedList.value.filter((option) => `${option.rawName} (${option.rawId})`.toLowerCase().includes(keyword))
})

function isCollected(option) {
  return bizStore.isCollected(option.id)
}

function handleSearch(keyword) {
  searchKeyword.value = String(keyword || '')
}

function handleChange(value) {
  const [rawId, type] = String(value).split('-')
  emit('update:modelValue', value)
  emit('select', value, Number(rawId), type === 'bizset')
}

function handleToggle(isOpen) {
  // 每次展开重新排序,使收藏变化即时生效(旧版 handleSelectToggle)
  if (isOpen) searchKeyword.value = ''
}

function goCreate(path) {
  router.push({ path, query: { create: 1 } })
}
</script>

<style scoped>
.option-item-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #63656E;
  font-size: 12px;
}
.option-item-content .text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.option-item-content .item-id {
  color: #C4C6CC;
}
.bizset-flag {
  margin-left: 8px;
  font-size: 14px;
  color: #979BA5;
}
.option-item-content .collect {
  display: none;
  margin-left: 8px;
  padding: 2px;
  font-size: 14px;
  color: #979BA5;
  cursor: pointer;
}
.option-item-content .collect.collected {
  display: block;
  color: #FFB400;
}
.option-item-content:hover .collect {
  display: block;
}
.mix-empty {
  padding: 10px 0;
  text-align: center;
  color: #63656E;
  font-size: 12px;
}
</style>

<style>
.el-select__popper.biz-mix-popover {
  min-width: 320px !important;
}
.biz-mix-popover .el-select-dropdown__footer {
  padding: 0;
  border-top: 1px solid #E7E9EF;
}
.biz-mix-popover .mix-extension {
  display: flex;
  width: 100%;
  background-color: #FAFBFD;
}
.biz-mix-popover .extension-link {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  height: 38px;
  font-size: 12px;
  color: #63656E;
  cursor: pointer;
}
.biz-mix-popover .extension-link:hover {
  opacity: .85;
}
.biz-mix-popover .extension-link + .extension-link::before {
  position: absolute;
  top: 13px;
  left: 0;
  width: 1px;
  height: 12px;
  content: "";
  background: #C4C6CC;
}
</style>
