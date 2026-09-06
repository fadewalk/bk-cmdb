<template>
  <div class="category-input">
    <el-input
      ref="inputRef"
      v-model="localValue"
      :placeholder="placeholder"
      size="default"
      class="category-input-el"
      @keydown.enter="handleConfirm"
    />
    <div class="operation">
      <span class="text-primary btn-confirm" @click.stop="handleConfirm">确定</span>
      <span class="text-primary" @click="handleCancel">取消</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  editId: { type: Number, default: 0 }
})
const emit = defineEmits(['update:modelValue', 'on-confirm', 'on-cancel'])

const inputRef = ref(null)
const localValue = ref(props.modelValue)

watch(() => props.modelValue, (v) => { localValue.value = v })
watch(localValue, (v) => emit('update:modelValue', v))

function handleConfirm() {
  emit('on-confirm', localValue.value, props.editId)
}
function handleCancel() {
  emit('on-cancel')
}
function focus() {
  inputRef.value?.focus?.()
}
defineExpose({ focus })
</script>

<style scoped>
.category-input {
  display: flex;
  align-items: center;
  width: 100%;
  font-weight: normal;
  :deep(.el-input__wrapper) {
    background-color: transparent !important;
    box-shadow: none !important;
    padding: 0;
  }
  :deep(.el-input__inner) {
    font-size: 14px;
    color: #63656e;
    border: none;
    outline: none;
    font-weight: normal;
    height: 32px;
    line-height: 32px;
  }
  :deep(.el-input__wrapper.is-focus) {
    background-color: #ffffff !important;
    box-shadow: 0 0 0 1px #c4c6cc inset !important;
  }
}
.category-input.el-input {
  flex: 1;
  margin-right: 10px;
  :deep(.el-input__wrapper) {
    padding: 0 8px;
  }
  :deep(.el-input__inner) {
    border: 1px solid #c4c6cc;
    background-color: #ffffff !important;
  }
}
.operation {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  .text-primary {
    color: #3a84ff;
    cursor: pointer;
    line-height: 1;
  }
  .btn-confirm {
    position: relative;
    margin-right: 8px;
    padding-right: 8px;
    &::after {
      content: '';
      position: absolute;
      top: 3px;
      right: 0;
      display: inline-block;
      width: 1px;
      height: 14px;
      background-color: #dcdee5;
    }
  }
}
</style>
