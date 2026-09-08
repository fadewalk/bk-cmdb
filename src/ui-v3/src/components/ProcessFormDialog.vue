<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="620px"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form label-width="130px">
      <!-- 动态全量字段(template 模式 + 传入进程模型属性),对齐老版按模型属性渲染 -->
      <template v-if="mode === 'template' && editableAttrs.length">
        <el-form-item
          v-for="f in editableAttrs"
          :key="f.bk_property_id"
          :label="f.bk_property_name"
          :required="!!f.isrequired"
        >
          <el-select
            v-if="enumOptions(f).length"
            v-model="form[f.bk_property_id]"
            clearable
            style="width: 100%"
          >
            <el-option v-for="o in enumOptions(f)" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
          <el-switch
            v-else-if="f.bk_property_type === 'bool'"
            v-model="form[f.bk_property_id]"
          />
          <el-input-number
            v-else-if="f.bk_property_type === 'int' || f.bk_property_type === 'float'"
            v-model="form[f.bk_property_id]"
            :controls="false"
            style="width: 100%"
          />
          <el-input
            v-else-if="f.bk_property_type === 'longchar'"
            v-model="form[f.bk_property_id]"
            type="textarea"
            :rows="2"
          />
          <el-input v-else v-model="form[f.bk_property_id]" />
        </el-form-item>
        <!-- bind_info(端口绑定,多行编辑,对齐老版 process-form-property-table) -->
        <el-form-item label="端口绑定">
          <div style="width: 100%">
            <el-table :data="form.__bind_rows" size="small" border style="width: 100%">
              <el-table-column label="监听类型" width="110">
                <template #default="{ row }">
                  <el-select v-model="row.ip" size="small">
                    <el-option label="本机" value="1" />
                    <el-option label="全部" value="2" />
                    <el-option label="内网" value="3" />
                    <el-option label="外网" value="4" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="协议" width="100">
                <template #default="{ row }">
                  <el-select v-model="row.protocol" size="small">
                    <el-option label="TCP" value="1" />
                    <el-option label="UDP" value="2" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="端口" min-width="110">
                <template #default="{ row }">
                  <el-input v-model="row.port" size="small" placeholder="如 8080" />
                </template>
              </el-table-column>
              <el-table-column label="启用" width="70">
                <template #default="{ row }">
                  <el-switch v-model="row.enable" size="small" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="60">
                <template #default="{ $index }">
                  <el-button link type="danger" size="small" @click="removeBindRow($index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-button size="small" :icon="'Plus'" style="margin-top: 6px" @click="addBindRow">添加绑定</el-button>
          </div>
        </el-form-item>
      </template>

      <!-- 兼容回退:未传属性元数据时按原字段渲染 -->
      <template v-else>
        <el-form-item label="进程名称" required>
          <el-input v-model="form.bk_func_name" placeholder="如 java / nginx" @input="form.bk_process_name = form.bk_func_name" />
        </el-form-item>
        <template v-if="mode === 'instance'">
          <el-form-item label="监听 IP">
            <el-input v-model="form.bk_bind_ip" placeholder="如 127.0.0.1" />
          </el-form-item>
          <el-form-item label="端口">
            <el-input v-model="form.port" placeholder="如 8080,多个用逗号分隔" />
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="绑定端口">
            <el-input v-model="form.__bind_port" placeholder="如 8080(留空则不绑定端口)" />
          </el-form-item>
          <el-form-item label="监听类型">
            <el-select v-model="form.__bind_ip" style="width: 100%">
              <el-option label="本机" value="1" />
              <el-option label="全部" value="2" />
              <el-option label="内网" value="3" />
              <el-option label="外网" value="4" />
            </el-select>
          </el-form-item>
          <el-form-item label="协议">
            <el-select v-model="form.__bind_protocol" style="width: 100%">
              <el-option label="TCP" value="1" />
              <el-option label="UDP" value="2" />
            </el-select>
          </el-form-item>
        </template>
        <el-form-item label="启动用户">
          <el-input v-model="form.user" />
        </el-form-item>
        <el-form-item label="工作路径">
          <el-input v-model="form.work_path" />
        </el-form-item>
        <el-form-item label="启动命令">
          <el-input v-model="form.start_cmd" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="停止命令">
          <el-input v-model="form.stop_cmd" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
      </template>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="$emit('save')">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
// form 为父组件的 reactive 对象,此处直接修改其属性
import { computed } from 'vue'

const props = defineProps({
  visible: Boolean,
  title: String,
  mode: { type: String, default: 'instance' }, // instance | template
  form: { type: Object, required: true },
  saving: Boolean,
  // 进程模型属性列表(template 模式动态渲染);不传则回退到内置字段
  attrs: { type: Array, default: () => [] }
})
defineEmits(['update:visible', 'save'])

// 进程实例主键/系统字段不进表单;bind_info 单独渲染
const SKIP_FIELDS = new Set([
  'bk_process_id', 'bk_func_id', 'bk_biz_id', 'bk_supplier_account',
  'bk_template_id', 'bk_service_template_id', 'bind_info',
  'bk_process_name', // 跟随进程名称,与老版一致不在表单重复出现
  'create_time', 'last_time', 'bk_created_at', 'bk_updated_at', 'bk_created_by', 'bk_updated_by'
])

const editableAttrs = computed(() => {
  if (props.mode !== 'template') return []
  return (props.attrs || []).filter((f) => !SKIP_FIELDS.has(f.bk_property_id))
    .sort((a, b) => {
      // 进程名称放最前,其余按属性序
      if (a.bk_property_id === 'bk_func_name') return -1
      if (b.bk_property_id === 'bk_func_name') return 1
      return (a.bk_property_index || 0) - (b.bk_property_index || 0)
    })
})

function enumOptions(f) {
  const opt = f.option
  if (Array.isArray(opt)) return opt.filter((o) => o && o.id !== undefined)
  return []
}

function addBindRow() {
  props.form.__bind_rows.push({ ip: '1', protocol: '1', port: '', enable: true })
}
function removeBindRow(idx) {
  props.form.__bind_rows.splice(idx, 1)
}
</script>
