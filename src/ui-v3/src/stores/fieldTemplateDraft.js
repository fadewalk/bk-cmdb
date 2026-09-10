import { defineStore } from 'pinia'

// 字段组合模板新建/编辑向导草稿(旧版 vuex fieldTemplate/templateDraft 复刻)
export const useFieldTemplateDraft = defineStore('fieldTemplateDraft', {
  state: () => ({
    templateId: null, // 编辑模式下的模板 id
    basic: { name: '', description: '' },
    fieldList: [], // [{ field, extra }] 与旧版结构一致
    uniqueList: [] // [{ id, keys: [field.id] }]
  }),
  actions: {
    setBasic(basic) {
      this.basic = { ...this.basic, ...basic }
    },
    setFields(fieldList) {
      this.fieldList = fieldList
    },
    setUniques(uniqueList) {
      this.uniqueList = uniqueList
    },
    clear() {
      this.templateId = null
      this.basic = { name: '', description: '' }
      this.fieldList = []
      this.uniqueList = []
    }
  }
})
