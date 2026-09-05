<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="560px"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form label-width="100px">
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
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="$emit('save')">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
// form 为父组件的 reactive 对象,此处直接修改其属性
defineProps({
  visible: Boolean,
  title: String,
  mode: { type: String, default: 'instance' }, // instance | template
  form: { type: Object, required: true },
  saving: Boolean
})
defineEmits(['update:visible', 'save'])
</script>
