import axios from 'axios'
import { ElMessage } from 'element-plus'

// 所有请求走 web_server 同源代理(/api/v3 -> apiserver),会话由 web_server 中间件维护
const http = axios.create({
  baseURL: '/api/v3',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

// 独立模式(skip-login):全局注入用户/开发商账号头,与老版 preload 设置对齐。
// 部分接口(如 find/classificationobject)按 X-Bkcmdb-User 过滤归属,缺失时返回空列表。
http.interceptors.request.use((config) => {
  config.headers['X-Bkcmdb-User'] = 'admin'
  config.headers['X-Bkcmdb-Supplier-Account'] = '0'
  // multipart/form-data 由 axios 根据 FormData 自动生成 boundary,不要手动覆盖
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

function isHtml(data) {
  return typeof data === 'string' && /<html|<!doctype/i.test(data)
}

http.interceptors.response.use(
  (response) => {
    const res = response.data
    // 会话失效时 web_server 会 302 到登录页,XHR 跟随后拿到 HTML;重新加载页面即可重建会话
    if (isHtml(res)) {
      window.location.reload()
      return Promise.reject(new Error('session expired'))
    }
    if (res && typeof res === 'object' && 'result' in res) {
      if (res.result === true) return res.data
      const msg = res.bk_error_msg || '请求失败'
      ElMessage.error(`${msg} (code: ${res.bk_error_code})`)
      return Promise.reject(new Error(msg))
    }
    return res
  },
  (error) => {
    ElMessage.error(error.response ? `HTTP ${error.response.status}` : '网络错误')
    return Promise.reject(error)
  }
)

export default http
