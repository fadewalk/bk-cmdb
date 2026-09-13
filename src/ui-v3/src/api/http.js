import axios from 'axios'
import { ElMessage } from 'element-plus'

// 所有请求走 web_server 同源代理(/api/v3 -> apiserver),身份由可信 session/API Key 注入
const http = axios.create({
  baseURL: '/api/v3',
  timeout: 30000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' }
})

http.interceptors.request.use((config) => {
  // multipart/form-data 由 axios 根据 FormData 自动生成 boundary,不要手动覆盖
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

function isHtml(data) {
  return typeof data === 'string' && /<html|<!doctype/i.test(data)
}

// 老版 api/index.js 特殊码:9900403 权限不足、1306000 登录态失效
const PERMISSION_CODE = 9900403
const TOKEN_INVALID_CODE = 1306000

function notifySessionExpired() {
  window.dispatchEvent(new CustomEvent('cmdb-session-expired'))
}

http.interceptors.response.use(
  (response) => {
    const res = response.data
    if (isHtml(res)) {
      notifySessionExpired()
      return Promise.reject(new Error('session expired'))
    }
    if (res && typeof res === 'object' && 'result' in res) {
      if (res.result === true) return res.data
      if (res.bk_error_code === TOKEN_INVALID_CODE) {
        notifySessionExpired()
        return Promise.reject(new Error('login expired'))
      }
      const msg = res.bk_error_msg || '请求失败'
      if (res.bk_error_code === PERMISSION_CODE) {
        // IAM 资源级权限弹窗另行立项;当前与老版语义一致给出明确无权限反馈,不能静默
        ElMessage.error('无权限执行该操作')
        const permissionError = new Error('无权限执行该操作')
        permissionError.permission = res.permission
        window.dispatchEvent(new CustomEvent('cmdb-permission-denied', { detail: res.permission }))
        return Promise.reject(permissionError)
      }
      ElMessage.error(`${msg} (code: ${res.bk_error_code})`)
      return Promise.reject(new Error(msg))
    }
    return res
  },
  (error) => {
    if (error.response?.status === 401) {
      notifySessionExpired()
    } else {
      ElMessage.error(error.response ? `HTTP ${error.response.status}` : '网络错误')
    }
    return Promise.reject(error)
  }
)

export default http
