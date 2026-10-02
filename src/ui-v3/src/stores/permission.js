import { defineStore } from 'pinia'
import axios from 'axios'
import { http } from '../api/cmdb'

let loadPromise = null

// meta.auth 老键空间(resource_type/action)→ 边缘归一器键空间(object/action);
// 必须镜像 web_server PermissionForPath 的映射——审批写出的策略要与边缘
// 实际执行的对象一致,否则审批通过也过不了边缘。边缘 403 事件携带的
// {object,action,domain} 已是边缘键空间,直接透传。
function normalizeAuthDecl(resource) {
  if (!resource) return null
  if (resource.object && resource.action) {
    return { object: resource.object, action: resource.action, domain: resource.domain || '*' }
  }
  if (resource.resource_type === 'configAdmin') return { object: 'iam', action: 'admin' }
  const objectMap = { host: 'host', cloud_area: 'instance', model: 'instance' }
  const object = objectMap[resource.resource_type]
    || (String(resource.resource_type || '').startsWith('comobj_') ? 'search' : resource.resource_type)
  const actionMap = { find: 'read' }
  const action = actionMap[resource.action] || resource.action
  if (!object || !action) return null
  return { object, action }
}

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
      // 冷加载深链时路由守卫先于 Header 挂载执行,mode 可能未探测;必须先探测
      // (404-fail-closed 的 /iam/verify 会把开放模式误判为无权限)
      if (!this.mode) await this.ensureLoaded()
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
      if (!this.mode) await this.ensureLoaded()
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
        const norm = normalizeAuthDecl(resource)
        if (!norm) return false
        return this.verify({ ...norm, domain: '*' })
      }
      const allowed = await decide()
      this.resourceResults[key] = allowed
      return allowed
    },

    // 站内权限申请(standalone-iam 模式):写入待审批记录,管理员在
    // /platform/iam 审批通过后即写入持久化 allow 策略
    async applyInApp(authDecl) {
      const norm = normalizeAuthDecl(authDecl)
      if (!norm) throw new Error('无法解析权限申请对象')
      const data = await http.post('/iam/apply', { ...norm, domain: '*', reason: '' }, { baseURL: '' })
      if (!data?.id) throw new Error('申请提交失败')
      return data
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
