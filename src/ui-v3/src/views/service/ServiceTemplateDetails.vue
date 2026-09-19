<template>
  <div class="service-template-details page-card">
      <el-alert v-if="syncStatusError" class="sync-status-error" type="error" :closable="false" show-icon>
        {{ syncStatusError }} <el-button link type="primary" @click="refreshNeedSync">重试</el-button>
      </el-alert>
      <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane name="config">
        <template #label>配置</template>
        <ServiceTemplateConfig :biz-id="bizId" :template-id="templateId" @sync-change="refreshNeedSync" />
      </el-tab-pane>
      <el-tab-pane name="instance">
        <template #label><span class="tab-label"><i v-if="needSync" class="tab-dot" />实例</span></template>
        <ServiceTemplateInstance :biz-id="bizId" :template-id="templateId" :active="activeTab === 'instance'" @sync-change="refreshNeedSync" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getServiceTemplateSyncStatus } from '../../api/cmdb'
import { useBizStore } from '../../stores/biz'
import ServiceTemplateConfig from './ServiceTemplateConfig.vue'
import ServiceTemplateInstance from './ServiceTemplateInstance.vue'

const route = useRoute()
const router = useRouter()
const bizStore = useBizStore()
const bizId = computed(() => Number(route.params.bizId) || bizStore.bizId)
const templateId = computed(() => Number(route.params.templateId))
const activeTab = ref(route.query.tab === 'instance' ? 'instance' : 'config')
const needSync = ref(false)
const syncStatusError = ref('')

function onTabChange(tab) {
  router.replace({ query: { ...route.query, tab } })
}
async function refreshNeedSync() {
  syncStatusError.value = ''
  try {
    const data = await getServiceTemplateSyncStatus(bizId.value, { service_template_ids: [templateId.value], is_partial: true })
    needSync.value = !!data?.service_templates?.some((item) => item.need_sync)
  } catch (error) {
    needSync.value = false
    syncStatusError.value = error?.message || '同步状态加载失败'
  }
}
watch(() => route.query.tab, (tab) => { if (tab === 'config' || tab === 'instance') activeTab.value = tab })
onMounted(async () => { await bizStore.ensureLoaded(); await refreshNeedSync() })
</script>

<style scoped>
.service-template-details { min-height: 100%; padding: 0 20px 20px; background: #f5f7fa; }
.tab-label { position: relative; display: inline-block; }
.tab-dot { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: #ea3636; top: 2px; right: -10px; }
</style>
