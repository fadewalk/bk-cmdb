import { defineStore } from 'pinia'

// 业务选择器状态:老前端的业务类页面共享当前业务(侧栏顶部下拉)
export const useBizStore = defineStore('biz', {
  state: () => ({
    bizList: [],
    bizId: null,
    loaded: false
  }),
  getters: {
    currentBiz: (s) => s.bizList.find((b) => b.bk_biz_id === s.bizId) || null
  },
  actions: {
    async ensureLoaded() {
      if (this.loaded) return
      const { default: http } = await import('../api/http')
      const res = await http.post('/biz/search/0', { page: { start: 0, limit: 500 } })
      this.bizList = res?.info || []
      if (!this.bizId && this.bizList.length > 0) {
        this.bizId = this.bizList[0].bk_biz_id
      }
      this.loaded = true
    },
    select(id) {
      this.bizId = id
    }
  }
})
