import { defineStore } from 'pinia'
import axios from 'axios'

const state = {
  loaded: false,
  authenticated: false,
  loading: false,
  error: null,
  user: null
}

function normalizeUser(data) {
  const value = data?.data || data || {}
  return {
    username: value.username || value.userName || '',
    chname: value.chname || value.chName || '',
    supplier: value.current_supplier || value.supplier || '',
    supplierList: value.supplier_list || [],
    avatar: value.avatar_url || value.avatarUrl || ''
  }
}

export const useSessionStore = defineStore('session', {
  state: () => ({ ...state }),
  getters: {
    displayName: (store) => store.user?.chname || store.user?.username || '未登录'
  },
  actions: {
    async ensureLoaded(force = false) {
      if (this.loading || (this.loaded && !force)) return this.authenticated
      this.loading = true
      this.error = null
      try {
        const response = await axios.get('/userinfo', { timeout: 10000, withCredentials: true })
        const payload = response.data
        if (payload?.result === false) throw new Error(payload.bk_error_msg || '未登录')
        this.user = normalizeUser(payload)
        this.authenticated = Boolean(this.user.username)
        this.loaded = true
        return this.authenticated
      } catch (error) {
        this.error = error
        this.user = null
        this.authenticated = false
        this.loaded = true
        return false
      } finally {
        this.loading = false
      }
    },
    clear() {
      this.user = null
      this.authenticated = false
      this.loaded = false
      this.error = null
    },
    async logout() {
      const response = await axios.post('/logout', { http_scheme: window.location.protocol === 'https:' ? 'https' : 'http' }, {
        timeout: 10000,
        withCredentials: true
      })
      this.clear()
      return response.data?.data?.url || '/login'
    },
    redirectToLogin() {
      const returnUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const target = `/login?c_url=${encodeURIComponent(returnUrl)}`
      if (!window.location.pathname.startsWith('/login')) window.location.replace(target)
    }
  }
})

window.addEventListener('cmdb-session-expired', () => {
  const store = useSessionStore()
  store.clear()
  store.redirectToLogin()
})
