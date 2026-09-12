import { defineStore } from 'pinia'
import { searchClassificationWithObjects, searchUserCustom, saveUserCustom } from '../api/cmdb'

// 老版 user-custom.js 的 MENU_RESOURCE_COLLECTION / BUILTIN_MODEL_COLLECTION_KEYS 契约
export const RESOURCE_COLLECTION_KEY = 'menu_resource_collection'
export const RESOURCE_COLLECTION_COMPAT_KEY = 'resource.collection'
export const BUILTIN_COLLECTION_KEYS = {
  host: 'menu_resource_host_collection',
  biz: 'menu_resource_business_collection',
  bk_biz_set_obj: 'menu_resource_business_set_collection',
  bk_project: 'menu_resource_project_collection'
}
export const BUILTIN_RESOURCE_ROUTES = {
  host: '/resource/host',
  biz: '/resource/business',
  bk_biz_set_obj: '/resource/biz-set',
  bk_project: '/resource/project'
}

let loadPromise = null

function modelList(data) {
  return (data || []).flatMap((group) => group.bk_objects || [])
}

export const useResourceStore = defineStore('resource', {
  state: () => ({
    collections: [],
    models: [],
    loaded: false
  }),
  getters: {
    availableModelIds: (state) => new Set(state.models.map((m) => m.bk_obj_id)),
    collectionModels: (state) => {
      const available = new Set(state.models.map((m) => m.bk_obj_id))
      return state.collections.filter((id) => available.has(id))
    }
  },
  actions: {
    async ensureLoaded() {
      if (this.loaded) return
      if (!loadPromise) {
        loadPromise = (async () => {
          const [usercustom, classifications] = await Promise.all([
            searchUserCustom().catch(() => ({})),
            searchClassificationWithObjects().catch(() => [])
          ])
          this.models = modelList(classifications)
          const custom = usercustom || {}
          let saved = Array.isArray(custom[RESOURCE_COLLECTION_KEY])
            ? [...custom[RESOURCE_COLLECTION_KEY]]
            : []
          // 一次兼容资源目录旧 localStorage 收藏,随后统一写入 usercustom
          try {
            const legacy = JSON.parse(localStorage.getItem(RESOURCE_COLLECTION_COMPAT_KEY) || 'null')
            if (!saved.length && Array.isArray(legacy)) saved = [...legacy]
          } catch { /* ignore malformed legacy data */ }
          // 老版四个内置模型默认收藏,单独 key=false 时关闭
          for (const [modelId, key] of Object.entries(BUILTIN_COLLECTION_KEYS)) {
            if (custom[key] !== false && !saved.includes(modelId)) saved.unshift(modelId)
          }
          const available = new Set(this.models.map((m) => m.bk_obj_id))
          this.collections = saved.filter((id, index) => available.has(id) && saved.indexOf(id) === index)
          this.loaded = true
        })()
        loadPromise.finally(() => { loadPromise = null })
      }
      return loadPromise
    },
    isCollected(modelId) {
      return this.collections.includes(modelId)
    },
    async toggleCollect(modelId) {
      const wasCollected = this.isCollected(modelId)
      const next = wasCollected
        ? this.collections.filter((id) => id !== modelId)
        : [...this.collections, modelId]
      this.collections = next
      const payload = { [RESOURCE_COLLECTION_KEY]: next }
      const builtinKey = BUILTIN_COLLECTION_KEYS[modelId]
      if (builtinKey) payload[builtinKey] = !wasCollected
      await saveUserCustom(payload).catch(() => {})
      try { localStorage.setItem(RESOURCE_COLLECTION_COMPAT_KEY, JSON.stringify(next)) } catch { /* compatibility best effort */ }
    }
  }
})
