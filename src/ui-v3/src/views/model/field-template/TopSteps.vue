<template>
  <div class="top-steps">
    <div class="steps" :style="{ width: '360px' }">
      <template v-for="(step, index) in steps" :key="index">
        <div :class="['step-item', { current: index === current, done: index < current }]">
          <span class="step-icon">
            <i v-if="index < current" class="done-check" />
            <span v-else>{{ step.icon }}</span>
          </span>
          <span class="step-text">{{ step.title }}</span>
        </div>
        <div v-if="index < steps.length - 1" class="step-line" />
      </template>
    </div>
  </div>
</template>

<script setup>
// 旧版 cmdb-steps + bk-steps 复刻:50px 白条居中,360px 步骤条
defineProps({
  steps: { type: Array, default: () => [{ title: '基础信息', icon: 1 }, { title: '字段设置', icon: 2 }] },
  current: { type: Number, default: 0 }
})
</script>

<style scoped>
.top-steps {
  display: flex;
  height: 50px;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  background-color: #fff;
  border-bottom: 1px solid #dcdee5;
}
.steps {
  display: flex;
  align-items: center;
}
.step-item {
  display: flex;
  align-items: center;
}
.step-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid #c4c6cc;
  background: #fff;
  color: #c4c6cc;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.step-item.current .step-icon {
  background: #3a84ff;
  border-color: #3a84ff;
  color: #fff;
}
.step-item.done .step-icon {
  border-color: #3a84ff;
  color: #fff;
  background: #3a84ff;
}
.done-check {
  position: relative;
  width: 10px;
  height: 6px;
}
.done-check::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 10px;
  height: 6px;
  border-bottom: 2px solid #fff;
  border-left: 2px solid #fff;
  transform: rotate(-45deg) scale(.7);
}
.step-text {
  margin-left: 8px;
  font-size: 14px;
  color: #63656e;
}
.step-item.current .step-text,
.step-item.done .step-text {
  color: #3a84ff;
}
.step-line {
  width: 100px;
  border-top: 1px dashed #979ba5;
  margin: 0 12px;
}
</style>
