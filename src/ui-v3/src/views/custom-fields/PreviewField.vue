<template>
  <!-- 旧版 preview-field 复刻:按分组渲染真实表单( label 上置 + 控件 ) -->
  <div class="preview-field">
    <div v-for="(group, gi) in groups" :key="gi" class="property-group">
      <div class="group-collapse" @click="toggle(gi)">
        <i :class="['bk-cmdb-icon icon-cc-triangle group-arrow', { collapsed: collapsedMap[gi] }]" />
        <span class="group-name">{{ group.info.bk_group_name || '默认分组' }}</span>
      </div>
      <div v-show="!collapsedMap[gi]" class="property-list">
        <div v-for="p in formProperties(group)" :key="p.bk_property_id" class="property-item">
          <div class="property-name">
            <span class="property-name-text" :class="{ required: p.isrequired }">{{ p.bk_property_name }}</span>
          </div>
          <div class="property-value">
            <el-select
              v-if="p.bk_property_type === 'enum'"
              v-model="values[p.bk_property_id]"
              :placeholder="'请选择' + p.bk_property_name"
              style="width: 100%"
            >
              <el-option v-for="opt in enumOptions(p)" :key="String(opt.id)" :label="opt.name" :value="opt.id" />
            </el-select>
            <el-select
              v-else-if="p.bk_property_type === 'bool'"
              v-model="values[p.bk_property_id]"
              placeholder="请选择"
              style="width: 100%"
            >
              <el-option label="是" :value="true" />
              <el-option label="否" :value="false" />
            </el-select>
            <el-date-picker
              v-else-if="p.bk_property_type === 'date'"
              v-model="values[p.bk_property_id]"
              type="date"
              value-format="YYYY-MM-DD"
              :placeholder="'请选择' + p.bk_property_name"
              style="width: 100%"
            />
            <el-date-picker
              v-else-if="p.bk_property_type === 'time'"
              v-model="values[p.bk_property_id]"
              type="datetime"
              value-format="YYYY-MM-DD HH:mm:ss"
              :placeholder="'请选择' + p.bk_property_name"
              style="width: 100%"
            />
            <el-input-number
              v-else-if="p.bk_property_type === 'int' || p.bk_property_type === 'float'"
              v-model="values[p.bk_property_id]"
              :controls="false"
              :precision="p.bk_property_type === 'float' ? 2 : 0"
              :placeholder="'请输入' + p.bk_property_name"
              style="width: 100%"
            />
            <el-input
              v-else-if="p.bk_property_type === 'longchar'"
              v-model="values[p.bk_property_id]"
              type="textarea"
              :rows="2"
              :placeholder="'请输入' + p.bk_property_name"
            />
            <el-input
              v-else
              v-model="values[p.bk_property_id]"
              :placeholder="p.bk_property_type === 'objuser' ? ('请输入' + p.bk_property_name) : ('请输入' + p.bk_property_name)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
  groups: { type: Array, default: () => [] }
})

const collapsedMap = reactive({})
const values = reactive({})
const ASST_TYPES = ['singleasst', 'multiasst', 'foreignkey']

// enum 字段预填默认项(旧版预览行为)
watch(() => props.groups, (groups) => {
  for (const group of groups || []) {
    for (const p of group.properties || []) {
      if (p.bk_property_type !== 'enum' || values[p.bk_property_id] !== undefined) continue
      const def = enumOptions(p).find((opt) => opt.is_default)
      if (def) values[p.bk_property_id] = def.id
    }
  }
}, { immediate: true, deep: true })

function toggle(gi) {
  collapsedMap[gi] = !collapsedMap[gi]
}

// 旧版预览不渲染关联类型字段
function formProperties(group) {
  return (group.properties || []).filter((p) => !ASST_TYPES.includes(p.bk_property_type))
}

function enumOptions(p) {
  const option = p.option
  if (Array.isArray(option)) {
    return option.map((opt) => (typeof opt === 'object' ? { id: opt.id ?? opt.name, name: opt.name ?? opt.id, is_default: opt.is_default } : { id: opt, name: opt }))
  }
  return []
}
</script>

<style scoped>
.preview-field {
  height: 100%;
  overflow-y: auto;
  padding: 0 24px 20px;
}
.property-group {
  padding: 7px 0 10px;
}
.property-group:first-child {
  padding-top: 28px;
}
.group-collapse {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}
.group-arrow {
  font-size: 12px;
  color: #63656E;
  transition: transform 0.15s;
}
.group-arrow.collapsed {
  transform: rotate(-90deg);
}
.group-name {
  font-size: 14px;
  line-height: 14px;
  color: #333948;
}
.property-list {
  padding: 4px 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
}
.property-item {
  flex: 0 0 48%;
  margin: 8px 0 16px;
  font-size: 12px;
}
.property-name {
  display: block;
  margin: 6px 0 9px;
  color: #63656E;
  line-height: 16px;
  font-size: 14px;
}
.property-name-text.required::after {
  content: "*";
  color: #EA3636;
  margin-left: 4px;
}
.property-value :deep(.el-input__inner),
.property-value :deep(.el-textarea__inner),
.property-value :deep(.el-input-number .el-input__inner) {
  border-radius: 2px;
}
</style>
