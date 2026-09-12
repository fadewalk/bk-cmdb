import { defineStore } from 'pinia'
import { http } from '../api/cmdb'

let loadPromise = null

// 对齐旧版 preload.js:非 IAM 模式默认允许, IAM 模式校验 configAdmin.update
export const usePermissionStore = defineStore('permission', {
  state: () => ({
    platformAuth: null
  }),
  getters: {
    canPlatformManage: (state) => state.platformAuth === true
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
            this.platformAuth = data?.[0]?.is_pass === true
          } catch {
            // 菜单可见性按旧版权限语义 fail-closed,后端鉴权仍是最终边界
            this.platformAuth = false
          }
          return this.platformAuth
        })()
        loadPromise.finally(() => { loadPromise = null })
      }
      return loadPromise
    }
  }
})
