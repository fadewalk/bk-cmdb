import { defineStore } from 'pinia'

// 原位状态视图(老版 meta.view=error|permission 语义)。导航期由 router 守卫
// 写 route.meta;运行时事件(边缘 403)经此 store 驱动——route.meta 运行时替换
// 不触发 MainLayout computed(vue-router 快照),pinia 状态必然响应。
export const useUiStatusStore = defineStore('ui-status', {
  state: () => ({
    permission: null,
    view: null
  }),
  actions: {
    setPermission(detail) {
      this.view = 'permission'
      this.permission = detail || null
    },
    clear() {
      this.view = null
      this.permission = null
    }
  }
})
