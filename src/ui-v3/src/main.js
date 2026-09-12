import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
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

app.mount('#app')
