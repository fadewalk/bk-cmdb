<template>
  <div class="field-detail-form">
    <el-form :model="form" label-width="100px" size="default">
      <el-form-item label="字段 ID">
        <el-input v-model="form.bk_property_id" :disabled="mode === 'edit'" placeholder="字母数字下划线,如 bk_asset_id" />
      </el-form-item>
      <el-form-item label="字段名称" required>
        <el-input v-model="form.bk_property_name" placeholder="请输入字段名称" />
      </el-form-item>
      <el-form-item label="字段类型" required>
        <el-select v-model="form.bk_property_type" :disabled="mode === 'edit'" style="width: 100%">
          <el-option v-for="t in types" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="所属分组">
        <el-select v-model="form.bk_property_group" style="width: 100%">
          <el-option v-for="g in groups" :key="g.bk_group_id" :label="g.bk_group_name" :value="g.bk_group_id" />
        </el-select>
      </el-form-item>
      <el-form-item label="必填">
        <el-switch v-model="form.isrequired" />
      </el-form-item>
      <el-form-item label="占位提示">
        <el-input v-model="form.placeholder" placeholder="鼠标悬停时显示" />
      </el-form-item>
      <el-form-item label="默认值">
        <el-input v-model="form.default" placeholder="可选" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="3" />
      </el-form-item>
      <el-form-item v-if="form.bk_property_type === 'enum' || form.bk_property_type === 'list'" label="枚举值">
        <el-input
          v-model="enumText"
          type="textarea"
          :rows="4"
          placeholder="每行一个: key=value"
        />
      </el-form-item>
    </el-form>
    <div class="form-footer">
      <el-button @click="$emit('cancel')">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  mode: { type: String, default: 'create' }, // create | edit | view
  property: { type: Object, default: () => ({}) },
  properties: { type: Array, default: () => [] },
  groups: { type: Array, default: () => [] },
  isMainLineModel: { type: Boolean, default: false }
})
const emit = defineEmits(['save', 'cancel'])

const types = [
  { label: '短字符', value: 'shortchar' },
  { label: '长字符', value: 'longchar' },
  { label: '数字', value: 'int' },
  { label: '浮点', value: 'float' },
  { label: '枚举', value: 'enum' },
  { label: '列表', value: 'list' },
  { label: '日期', value: 'date' },
  { label: '时间', value: 'time' },
  { label: '布尔', value: 'bool' }
]

const saving = ref(false)
const form = ref({
  bk_property_id: '',
  bk_property_name: '',
  bk_property_type: 'shortchar',
  bk_property_group: '',
  isrequired: false,
  placeholder: '',
  default: '',
  description: ''
})
const enumText = ref('')

watch(() => props.property, (p) => {
  if (!p) return
  form.value = {
    bk_property_id: p.bk_property_id || '',
    bk_property_name: p.bk_property_name || '',
    bk_property_type: p.bk_property_type || 'shortchar',
    bk_property_group: p.bk_property_group || '',
    isrequired: !!p.isrequired,
    placeholder: p.placeholder || '',
    default: p.default || '',
    description: p.description || ''
  }
  if ((p.bk_property_type === 'enum' || p.bk_property_type === 'list') && Array.isArray(p.option)) {
    enumText.value = p.option.map((o) => `${o.id || o.name || o.key || ''}=${o.name || o.value || ''}`).join('\n')
  } else {
    enumText.value = ''
  }
}, { immediate: true, deep: true })

async function onSave() {
  if (!form.value.bk_property_id.trim()) { ElMessage.warning('请输入字段 ID'); return }
  if (!form.value.bk_property_name.trim()) { ElMessage.warning('请输入字段名称'); return }
  const payload = { ...form.value }
  if (form.value.bk_property_type === 'enum' || form.value.bk_property_type === 'list') {
    payload.option = enumText.value.split('\n').map((line) => {
      const [k, v] = line.split('=')
      return { id: (k || '').trim(), name: (v || k || '').trim() }
    }).filter((o) => o.id)
  }
  emit('save', payload)
}
</script>

<style scoped>
.field-detail-form { padding: 16px; }
.form-footer { padding: 16px; border-top: 1px solid #DCDEE5; text-align: right; }
</style>
