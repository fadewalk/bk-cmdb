<template>
  <!-- 老版 non-exist-business.vue 三分支:业务不存在 / 无任何业务权限 / 无当前业务权限 -->
  <StatusPage v-if="isNotFound" icon="icon-cc-no-authority" title="业务不存在"
    desc="您访问的业务可能已被归档或删除，请确认后重试">
    <el-button type="primary" @click="$router.push('/resource/business')">创建业务</el-button>
  </StatusPage>
  <StatusPage v-else-if="isUnauthed" icon="icon-cc-no-authority" title="无当前业务权限"
    desc="您没有当前业务的访问权限，请联系管理员申请权限">
    <el-button @click="$router.push('/resource/business')">查看有权限的业务</el-button>
  </StatusPage>
  <StatusPage v-else icon="icon-cc-no-authority" title="无操作权限"
    desc="您还没有相应操作的权限，请先申请相关操作的权限">
    <el-button type="primary" :loading="applying" :disabled="!permission" @click="apply">去申请权限</el-button>
  </StatusPage>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePermissionStore } from '../../stores/permission'
import { useRoute } from 'vue-router'
import StatusPage from './StatusPage.vue'

// 分支开关由业务 interceptor 写入 route.meta.extra(老版 isNotFound/isUnauthed 同名)
const route = useRoute()
const permissionStore = usePermissionStore()
const applying = ref(false)
const permission = computed(() => route.meta.extra?.permission || route.meta.permission || null)
async function apply() {
  applying.value = true
  try {
    await permissionStore.applyPermission(permission.value)
    ElMessage.success('已打开权限申请页面')
  } catch (error) {
    ElMessage.error(error?.message || '权限申请失败')
  } finally { applying.value = false }
}
const isNotFound = computed(() => route.meta.extra?.isNotFound === true)
const isUnauthed = computed(() => route.meta.extra?.isUnauthed === true)
</script>
