<template>
  <teleport to="body">
    <transition name="bk-fade">
      <div v-if="isShow" class="bk-dialog-mask" @click.self="cancel">
        <div class="bk-dialog-box model-dialog">
          <div class="dialog-content">
            <p class="dialog-title">{{ title }}</p>
            <div class="content clearfix">
              <div class="content-left">
                <div class="icon-wrapper" @click="iconListShow = true">
                  <i class="bk-cmdb-icon" :class="form.bk_obj_icon" />
                </div>
                <div class="text" @click="iconListShow = true">选择图标</div>
              </div>
              <div class="content-right">
                <div class="legacy-form-row" v-if="!isMainLine">
                  <span class="label-title">所属分组</span>
                  <span class="color-danger">*</span>
                  <el-select
                    v-model="form.bk_classification_id"
                    class="legacy-select row-select"
                    filterable
                    :teleported="false"
                  >
                    <el-option
                      v-for="option in classifications"
                      :key="option.bk_classification_id"
                      :label="option.bk_classification_name"
                      :value="option.bk_classification_id"
                    />
                  </el-select>
                </div>
                <div class="legacy-form-row">
                  <span class="label-title">唯一标识</span>
                  <span class="color-danger">*</span>
                  <el-input
                    v-model.trim="form.bk_obj_id"
                    class="legacy-input row-input"
                    placeholder="可使用英文、数字、下划线，需以字母开头"
                    :disabled="editing"
                  />
                  <i class="bk-cmdb-icon icon-cc-exclamation-tips row-icon" title="可使用英文、数字、下划线，需以字母开头" />
                </div>
                <div class="legacy-form-row">
                  <span class="label-title">名称</span>
                  <span class="color-danger">*</span>
                  <el-input
                    v-model.trim="form.bk_obj_name"
                    class="legacy-input row-input"
                    placeholder="请填写模型名"
                  />
                </div>
              </div>
            </div>
            <div v-if="iconListShow" class="model-icon-wrapper">
              <choose-icon
                v-model="form.bk_obj_icon"
                @choose-icon="iconListShow = false"
                @close="iconListShow = false"
              />
            </div>
          </div>
          <div class="dialog-footer">
            <button class="bk-button bk-primary" :disabled="operating" @click="confirm">提交</button>
            <button class="bk-button" :disabled="operating" @click="cancel">取消</button>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
// 旧版 components/model-manage/_create-model.vue 复刻:图标选择 + 分组/标识/名称,600px 弹窗
import { reactive, ref, watch } from 'vue'
import ChooseIcon from './ChooseIcon.vue'

const props = defineProps({
  isShow: { type: Boolean, default: false },
  title: { type: String, default: '新建模型' },
  groupId: { type: String, default: '' },
  operating: { type: Boolean, default: false },
  isMainLine: { type: Boolean, default: false },
  editing: { type: Boolean, default: false },
  classifications: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:isShow', 'update:groupId', 'confirm'])

const iconListShow = ref(false)
const form = reactive({
  bk_classification_id: '',
  bk_obj_icon: 'icon-cc-default',
  bk_obj_id: '',
  bk_obj_name: ''
})

watch(() => props.isShow, (show) => {
  if (show) {
    form.bk_obj_icon = 'icon-cc-default'
    form.bk_obj_id = ''
    form.bk_obj_name = ''
    form.bk_classification_id = props.groupId || ''
    iconListShow.value = false
  }
})
watch(() => props.groupId, (v) => { if (v) form.bk_classification_id = v })

function confirm() {
  if (!form.bk_obj_id || !form.bk_obj_name || (!form.bk_classification_id && !props.isMainLine)) return
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(form.bk_obj_id)) return
  emit('confirm', { ...form })
}
function cancel() {
  emit('update:isShow', false)
  emit('update:groupId', '')
}
</script>

<style scoped>
.bk-dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .6);
  z-index: 3000;
}
.bk-dialog-box {
  position: absolute;
  left: 50%;
  top: 20vh;
  transform: translateX(-50%);
  width: 600px;
  background: #fff;
  border-radius: 2px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, .2);
}
.bk-fade-enter-active,
.bk-fade-leave-active {
  transition: opacity .18s ease;
}
.bk-fade-enter-from,
.bk-fade-leave-to {
  opacity: 0;
}
.dialog-content {
  position: relative;
  padding: 15px 15px 20px 28px;
}
.dialog-title {
  font-size: 20px;
  color: #333948;
  line-height: 1;
  margin: 0 0 15px;
}
.content {
  display: block;
}
.content-left {
  padding-top: 20px;
  text-align: center;
  cursor: pointer;
}
.content-left .icon-wrapper {
  margin: 0 auto;
  width: 85px;
  height: 85px;
  border: 1px solid #dcdee5;
  border-radius: 50%;
  font-size: 50px;
  cursor: pointer;
}
.content-left .icon-wrapper .bk-cmdb-icon {
  line-height: 83px;
  color: #3a84ff;
}
.content-left .text {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1;
  color: #63656e;
}
.content-right {
  min-width: 0;
}
.row-select {
  vertical-align: middle;
  width: 519px;
  max-width: 100%;
}
.row-input {
  vertical-align: middle;
  width: 519px;
  max-width: 100%;
}
.model-icon-wrapper {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  background: #fff;
  z-index: 99;
}
.dialog-footer {
  padding: 12px 24px;
  text-align: right;
  font-size: 0;
  border-top: 1px solid #dcdee5;
  background: #fafbfd;
  border-radius: 0 0 2px 2px;
}
.dialog-footer .bk-primary {
  margin-right: 10px;
}
</style>
