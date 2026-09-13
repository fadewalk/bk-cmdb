import { defineStore } from 'pinia'
import { http, searchKubePods, searchFullText } from '../api/cmdb'

let loadPromise = null

export const useCapabilityStore = defineStore('capabilities', {
  state: () => ({
    loaded: false,
    loading: false,
    k8s: { configured: false, healthy: false, reason: '尚未检测' },
    es: { configured: false, healthy: false, reason: '尚未检测' }
  }),
  actions: {
    async ensureLoaded(force = false) {
      if (this.loaded && !force) return this
      if (!loadPromise) {
        loadPromise = (async () => {
          this.loading = true
          try {
            const [k8s, es] = await Promise.all([
              this.probeK8s(),
              this.probeEs()
            ])
            this.k8s = k8s
            this.es = es
            this.loaded = true
          } finally {
            this.loading = false
          }
        })()
        loadPromise.finally(() => { loadPromise = null })
      }
      await loadPromise
      return this
    },
    async probeK8s() {
      const bizId = Number(localStorage.getItem('selectedBusiness'))
      if (!bizId) return { configured: false, healthy: false, reason: '没有可探测的业务上下文' }
      try {
        const data = await searchKubePods({
          bk_biz_id: bizId,
          filter: {},
          fields: ['id'],
          page: { enable_count: true }
        })
        // count=0 也代表路由和数据模型可用;只有接口/权限错误才算不可用
        if (data && typeof data === 'object') return { configured: true, healthy: true, reason: '' }
        return { configured: true, healthy: false, reason: 'K8s Pod 接口返回格式异常' }
      } catch (error) {
        return { configured: false, healthy: false, reason: error?.message || 'K8s 数据链路不可用' }
      }
    },
    async probeEs() {
      try {
        const data = await searchFullText({
          bk_biz_id: Number(localStorage.getItem('selectedBusiness')) || 0,
          filter: { models: [], instances: [] },
          query_string: '__cmdb_capability_probe__',
          page: { start: 0, limit: 1 }
        })
        if (data && typeof data === 'object') return { configured: true, healthy: true, reason: '' }
        return { configured: true, healthy: false, reason: '全文检索返回格式异常' }
      } catch (error) {
        return { configured: false, healthy: false, reason: error?.message || 'Elasticsearch 未开启或不可达' }
      }
    }
  }
})
