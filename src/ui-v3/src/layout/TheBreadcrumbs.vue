<template>
  <!-- 旧版 dynamic-breadcrumbs 复刻:单级标题栏(当前页名),无父级链;子页显示返回箭头 -->
  <div class="the-breadcrumbs" v-if="title">
    <i v-if="backLink" class="bk-cmdb-icon icon-cc-arrow back-arrow" title="返回" @click="goBack" />
    <h1 class="current">{{ title }}</h1>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { resolveMenuByRoute, menuLinkPath } from './menu-config'
import { useBizStore } from '../stores/biz'

const route = useRoute()
const router = useRouter()
const bizStore = useBizStore()

const menu = computed(() => resolveMenuByRoute(route))
// 旧版取值顺序:自定义标题 > 路由 meta.title > 菜单名
const title = computed(() => route.meta.title || menu.value?.child?.name || menu.value?.top?.name || '')

// 子页(模板详情/主机详情等)显示返回箭头,回到所属菜单规范页;菜单入口页无箭头
const backLink = computed(() => {
  const m = menu.value
  if (!m?.child) return null
  const canonical = menuLinkPath(m.child, bizStore.bizId)
  return route.path === canonical ? null : canonical
})

function goBack() {
  if (backLink.value) router.push(backLink.value)
}
</script>

<style scoped>
/* 旧版 .breadcrumbs-layout 同款:白底 53px,阴影,16px 单级标题 */
.the-breadcrumbs {
  display: flex;
  align-items: center;
  padding: 14px 20px;
  height: 53px;
  flex: 0 0 53px;
  background: #fff;
  box-shadow: 0px 2px 4px 0px rgba(0, 0, 0, 0.06);
}
.back-arrow {
  width: 24px;
  height: 24px;
  line-height: 24px;
  font-size: 14px;
  text-align: center;
  margin-right: 3px;
  color: #3A84FF;
  cursor: pointer;
}
.back-arrow:hover {
  color: #699df4;
}
.current {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  color: #313238;
  font-weight: normal;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
