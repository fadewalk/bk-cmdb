import { defineStore } from 'pinia'
import { http } from '../api/cmdb'

let loadPromise = null

// 对齐旧版 preload.js:非 IAM 模式默认允许, IAM 模式校验 configAdmin.update
export const usePermissionStore = defineStore('permission', {
  state: () => ({
    platformAuth: null,
    resourceResults: {},
    lastPermission: null
  }),
  getters: {
    canPlatformManage: (state) => state.platformAuth === true,
    canResource: (state) => (key) => state.resourceResults[key] === true
  },
  actions: {
    async ensureLoaded() {
      if (this.platformAuth !== null) return this.platformAuth
      if (!loadPromise) {
        loadPromise = (async () => {
          if (window.Site?.authscheme !== 'iam') {
            this.platformAuth = true
            return true
          }
          try {
            const data = await http.post('/auth/verify', {
              resources: [{ action: 'update', resource_type: 'configAdmin' }]
            })
            const results = Array.isArray(data) ? data : []
            this.platformAuth = results.length > 0 && results.every((item) => item.is_pass === true)
          } catch {
            // 菜单可见性按旧版权限语义 fail-closed,后端鉴权仍是最终边界
            this.platformAuth = false
          }
          return this.platformAuth
        })()
        loadPromise.finally(() => { loadPromise = null })
      }
      return loadPromise
    },

    async verifyResource(resource) {
      const key = JSON.stringify(resource)
      if (this.resourceResults[key] !== undefined) return this.resourceResults[key]
      if (window.Site?.authscheme !== 'iam') {
        this.resourceResults[key] = true
        return true
      }
      try {
        const data = await http.post('/auth/verify', { resources: [resource] })
        const results = Array.isArray(data) ? data : []
        const passed = results.length === 1 && results[0].is_pass === true
        this.resourceResults[key] = passed
        return passed
      } catch {
        this.resourceResults[key] = false
        return false
      }
    },
    async applyPermission(permission) {
      if (!permission) throw new Error('缺少权限申请信息')
      const url = await http.post('/auth/skip_url', permission)
      if (!url || typeof url !== 'string') throw new Error('权限申请地址无效')
      window.open(url, '_blank', 'noopener,noreferrer')
      this.lastPermission = permission
      return url
    },
  }
})
