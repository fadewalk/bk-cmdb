<template>
  <div class="choose-icon">
    <div class="icon-search legacy-input">
      <el-input v-model="searchText" clearable placeholder="请输入关键词" :suffix-icon="'Search'" />
    </div>
    <div class="icon-tab-header">系统图标</div>
    <div class="icon-tab-section">
      <ul class="icon-set" v-if="filteredIcons.length">
        <li
          v-for="icon in filteredIcons"
          :key="icon.value"
          :class="['icon', { active: icon.value === curIcon }]"
          :title="icon.nameZh"
          @click="curIcon = icon.value"
        >
          <i class="bk-cmdb-icon" :class="icon.value" />
          <span class="checked-status" />
        </li>
      </ul>
      <div v-else class="icon-empty">暂无匹配的图标</div>
    </div>
    <div class="choose-footer">
      <button class="bk-button bk-primary" @click="handleConfirm">确定</button>
      <button class="bk-button" @click="emit('close')">取消</button>
    </div>
  </div>
</template>

<script setup>
// 旧版 components/model-manage/choose-icon 的复刻:75 个系统图标网格 + 搜索 + 确认
import { computed, ref, watch } from 'vue'
import iconList from './model-icon.json'

const props = defineProps({
  modelValue: { type: String, default: 'icon-cc-default' }
})
const emit = defineEmits(['update:modelValue', 'chooseIcon', 'close'])

const searchText = ref('')
const curIcon = ref(props.modelValue)
watch(() => props.modelValue, (v) => { curIcon.value = v })

const filteredIcons = computed(() => {
  const kw = searchText.value.trim().toLowerCase()
  if (!kw) return iconList
  return iconList.filter((icon) =>
    icon.nameZh.toLowerCase().includes(kw) || icon.nameEn.toLowerCase().includes(kw))
})

function handleConfirm() {
  emit('update:modelValue', curIcon.value)
  emit('chooseIcon')
}
</script>

<style scoped>
.choose-icon {
  position: relative;
  height: 460px;
  overflow: hidden;
  background: #fff;
}
.icon-search {
  position: absolute;
  top: 12px;
  right: 20px;
  width: 240px;
  z-index: 2;
}
.icon-tab-header {
  height: 43px;
  line-height: 43px;
  margin: 0 20px;
  font-size: 14px;
  color: #313238;
  border-bottom: 1px solid #dcdee5;
}
.icon-tab-section {
  height: calc(100% - 58px - 43px);
  overflow-y: auto;
  padding: 10px 20px 0;
}
.icon-set {
  width: 560px;
  display: flex;
  flex-wrap: wrap;
  padding-bottom: 10px;
  list-style: none;
  margin: 0;
}
.icon-set .icon {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 0 0 10%;
  height: 50px;
  font-size: 24px;
  color: #63656e;
  outline: 0;
  cursor: pointer;
}
.icon-set .icon:hover {
  color: #3a84ff;
  background-color: #ebf4ff;
}
.icon-set .icon.active {
  color: #3a84ff;
  background-color: #ebf4ff;
  border: 1px dashed #3a84ff;
}
.icon-set .checked-status {
  display: none;
  position: absolute;
  bottom: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  background-color: #2dcb56;
  border-radius: 50%;
  z-index: 2;
}
.icon-set .icon.active .checked-status {
  display: block;
}
.icon-set .checked-status::before {
  content: '';
  position: absolute;
  bottom: 5px;
  right: 0;
  width: 14px;
  height: 7px;
  border-bottom: 3px solid #fff;
  border-left: 3px solid #fff;
  transform: rotate(-45deg) scale(.5);
}
.icon-empty {
  padding: 60px 0;
  text-align: center;
  color: #979ba5;
  font-size: 14px;
}
.choose-footer {
  height: 57px;
  line-height: 56px;
  text-align: right;
  font-size: 0;
  padding-right: 24px;
  background-color: #fafbfd;
  border-top: 1px solid #dcdee5;
}
.choose-footer .bk-button {
  margin-left: 10px;
}
</style>
