import { defineStore } from 'pinia'
import axios from 'axios'
import { http } from '../api/cmdb'

let loadPromise = null

// 权限判定三档契约(优先级从高到低):
// 1. standalone-iam:自研 IAM 开启(/iam/me/permissions 可达)→ /iam/verify 判定
// 2. legacy-iam:window.Site.authscheme==='iam' 的老蓝鲸契约 → /auth/verify(行为不变)
// 3. open:两者皆无 → 默认允许(standalone skip-login 单管理员形态)
export const usePermissionStore = defineStore('permission', {
  state: () => ({
    platformAuth: null,
    // null=未探测 'standalone-iam'|'legacy-iam'|'open'
    mode: null,
    iamSubject: '',
    resourceResults: {},
    verifyResults: {},
    lastPermission: null
  }),
  getters: {
    canPlatformManage: (state) => state.platformAuth === true,
    canResource: (state) => (key) => state.resourceResults[key] === true
  },
  actions: {
    async ensureLoaded() {
      if (this.mode) return this.platformAuth
      if (!loadPromise) {
        loadPromise = (async () => {
          // 探测自研 IAM(/iam/status 无条件 200,探测不产生资源 404 噪音);
          // 裸 axios 走 validateStatus,异常不得弹全局 toast
          let probe = null
          try {
            probe = await axios.get('/iam/status', {
              baseURL: '',
              withCredentials: true,
              validateStatus: () => true,
              timeout: 5000
            })
          } catch { /* 网络异常按未开启处理 */ }
          if (probe?.status === 200 && probe.data?.enabled === true) {
            this.mode = 'standalone-iam'
            this.iamSubject = probe.data.subject || ''
            // 平台管理可见性 = 自研 IAM 的 iam:admin
            this.platformAuth = await this.verify({ object: 'iam', action: 'admin' })
            return this.platformAuth
          }
          if (window.Site?.authscheme === 'iam') {
            this.mode = 'legacy-iam'
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
          }
          this.mode = 'open'
          this.platformAuth = true
          return true
        })()
        loadPromise.finally(() => { loadPromise = null })
      }
      return loadPromise
    },

    // 自研 IAM 判定(object/action 同归一器键空间,domain 缺省 *)
    async verify({ object, action, domain = '*' }) {
      const key = JSON.stringify([this.mode, object, action, domain])
      if (this.verifyResults[key] !== undefined) return this.verifyResults[key]
      if (this.mode === 'open' || this.mode === 'legacy-iam') {
        // 开放模式恒放行;老蓝鲸契约无边缘判定键空间,UI 不灰置(后端仍是边界)
        this.verifyResults[key] = true
        return true
      }
      try {
        const data = await http.post('/iam/verify', { object, action, domain }, { baseURL: '' })
        const allowed = data?.allowed === true
        this.verifyResults[key] = allowed
        return allowed
      } catch {
        // fail-closed:判定不可达时不放行
        this.verifyResults[key] = false
        return false
      }
    },

    async verifyResource(resource) {
      const key = JSON.stringify(resource)
      if (this.resourceResults[key] !== undefined) return this.resourceResults[key]
      const decide = async () => {
        if (this.mode === 'open') return true
        if (this.mode === 'legacy-iam') {
          try {
            const data = await http.post('/auth/verify', { resources: [resource] })
            const results = Array.isArray(data) ? data : []
            return results.length === 1 && results[0].is_pass === true
          } catch {
            return false
          }
        }
        // standalone-iam:meta.auth 的老键空间翻译到归一器键空间
        if (resource?.resource_type === 'configAdmin') {
          return this.verify({ object: 'iam', action: 'admin' })
        }
        const objectMap = { cloud_area: 'cloud' }
        const object = objectMap[resource?.resource_type] || resource?.resource_type
        const actionMap = { find: 'read' }
        const action = actionMap[resource?.action] || resource?.action
        if (!object || !action) return false
        return this.verify({ object, action })
      }
      const allowed = await decide()
      this.resourceResults[key] = allowed
      return allowed
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
