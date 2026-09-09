import { defineStore } from 'pinia'
import { searchBusinessSets, saveUserCustom, searchUserCustom } from '../api/cmdb'

// 旧版同名持久化 key:business-interceptor.js 的 selectedBusiness、menu-symbol 的 BUSINESS_SELECTOR_COLLECTION
const SELECTED_BIZ_KEY = 'selectedBusiness'
const COLLECTION_KEY = 'business_selector_collection'

// ensureLoaded 可能被路由守卫与 MainLayout 并发触发,用模块级 promise 去重
let loadPromise = null

// 业务选择器状态:旧版 cmdb-business-mix-selector 的数据模型(业务 + 业务集混合)
export const useBizStore = defineStore('biz', {
  state: () => ({
    bizList: [],
    bizSetList: [],
    bizId: null,
    loaded: false,
    collections: []
  }),
  getters: {
    currentBiz: (s) => s.bizList.find((b) => b.bk_biz_id === s.bizId) || null
  },
  actions: {
    async ensureLoaded() {
      if (this.loaded) return
      if (!loadPromise) {
        loadPromise = (async () => {
          const [bizRes, bizSetRes] = await Promise.all([
            (async () => {
              const { default: http } = await import('../api/http')
              return http.post('/biz/search/0', { page: { start: 0, limit: 500 } })
            })(),
            searchBusinessSets({ start: 0, limit: 500 }).catch(() => ({ info: [] }))
          ])
          this.bizList = bizRes?.info || []
          this.bizSetList = bizSetRes?.info || []

          const stored = Number(localStorage.getItem(SELECTED_BIZ_KEY))
          if (stored && this.bizList.some((b) => b.bk_biz_id === stored)) this.bizId = stored
          else if (this.bizList.length > 0) this.bizId = this.bizList[0].bk_biz_id

          try {
            const custom = await searchUserCustom()
            this.collections = Array.isArray(custom?.[COLLECTION_KEY]) ? custom[COLLECTION_KEY] : []
          } catch {
            this.collections = []
          }

          this.loaded = true
        })()
        loadPromise.finally(() => { loadPromise = null })
      }
      return loadPromise
    },
    select(id) {
      this.bizId = id
      if (id) localStorage.setItem(SELECTED_BIZ_KEY, String(id))
    },
    isCollected(optionId) {
      return this.collections.includes(optionId)
    },
    async toggleCollect(optionId) {
      const next = this.isCollected(optionId)
        ? this.collections.filter((id) => id !== optionId)
        : [...this.collections, optionId]
      this.collections = next
      try {
        await saveUserCustom({ [COLLECTION_KEY]: next })
      } catch { /* usercustom 接口不可用时保留本地收藏状态 */ }
    }
  }
})
