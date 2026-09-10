<template>
  <div class="create-basic-page">
    <top-steps :current="0" />
    <div class="basic-form">
      <div class="legacy-form-row form-line">
        <span class="label-title label-required">模板名称<span class="color-danger">*</span></span>
        <el-input
          v-model.trim="draft.basic.name"
          class="legacy-input form-input"
          maxlength="128"
          placeholder="请输入模板名称"
          @input="draft.setBasic({ name: draft.basic.name })"
        />
      </div>
      <div class="legacy-form-row form-line">
        <span class="label-title label-block">描述</span>
        <el-input
          v-model="draft.basic.description"
          type="textarea"
          :rows="4"
          maxlength="2000"
          class="legacy-textarea form-textarea"
          placeholder="请输入模板描述"
          @input="draft.setBasic({ description: draft.basic.description })"
        />
      </div>
    </div>
    <div class="layout-footer">
      <button class="bk-button bk-primary" @click="handleNextStep">下一步</button>
      <button class="bk-button" @click="handleCancel">取消</button>
    </div>
  </div>
</template>

<script setup>
// 新建/编辑字段组合模板第一步(旧版 field-template/create-basic.vue 复刻)
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import TopSteps from './field-template/TopSteps.vue'
import { useFieldTemplateDraft } from '../../stores/fieldTemplateDraft'

const router = useRouter()
const route = useRoute()
const draft = useFieldTemplateDraft()

onMounted(() => {
  const editId = Number(route.params.id)
  if (editId && !draft.templateId) draft.templateId = editId
})

function handleNextStep() {
  if (!draft.basic.name?.length) {
    ElMessage.warning('请输入模板名称')
    return
  }
  router.push(draft.templateId
    ? `/model/field-template/edit/${draft.templateId}/field-settings`
    : '/model/field-template/create/field-settings')
}
function handleCancel() {
  draft.clear()
  router.push('/model/field-template')
}
</script>

<style scoped>
.create-basic-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
}
.basic-form {
  width: 628px;
  margin: 64px auto 12px;
  position: relative;
  left: -36px;
  flex: 1;
}
.form-line {
  display: flex;
  align-items: flex-start;
}
.label-title {
  flex: 0 0 140px;
  font-size: 14px;
  line-height: 32px;
  color: #63656e;
  text-align: left;
}
.label-block {
  line-height: 32px;
}
.form-input,
.form-textarea {
  flex: 1;
}
.form-textarea {
  width: auto;
}
.layout-footer {
  width: 628px;
  margin: 0 auto 40px;
  padding: 0 0 0 140px;
  position: relative;
  left: -36px;
  display: flex;
  gap: 10px;
}
</style>
