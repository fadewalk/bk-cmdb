import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { ElMessage } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import './styles/bk-theme.css'
import './styles/bk-legacy.css'

import App from './App.vue'
import router from './router'
import { useSessionStore } from './stores/session'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

const sessionStore = useSessionStore(pinia)
const publicPaths = ['/login', '/404']

router.beforeEach(async (to) => {
  if (publicPaths.includes(to.path)) return true
  const authenticated = await sessionStore.ensureLoaded()
  if (!authenticated) {
    sessionStore.redirectToLogin()
    return false
  }
  return true
})

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 全局异常兜底(老版无此机制,B39 补齐):同秒去重避免异常风暴刷屏
let errorToastAt = 0
function reportGlobalError(message, detail) {
  console.error('[cmdb] global error:', message, detail || '')
  const now = Date.now()
  if (now - errorToastAt > 1000) {
    errorToastAt = now
    ElMessage.error(message || '页面运行异常')
  }
}
app.config.errorHandler = (err, _instance, info) => {
  reportGlobalError(err?.message || '页面运行异常', info)
}
window.addEventListener('error', (event) => {
  // 资源加载失败(脚本/样式)不弹 toast,只记录
  if (event.target && event.target !== window && (event.target.src || event.target.href)) return
  reportGlobalError(event.message || '页面运行异常')
})
window.addEventListener('unhandledrejection', (event) => {
  reportGlobalError(event.reason?.message || '异步操作异常', event.reason)
})

// 路由异步 chunk 加载失败(发版后旧 hash 失效):提示并整页重载一次
router.onError((error) => {
  const message = String(error?.message || '')
  if (/Failed to fetch dynamically imported module|Loading chunk|Importing a module script/i.test(message)) {
    const key = 'cmdb_chunk_reload'
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, String(Date.now()))
      window.location.reload()
      return
    }
  }
  reportGlobalError('页面加载失败', error)
})
sessionStorage.removeItem('cmdb_chunk_reload')

app.mount('#app')
