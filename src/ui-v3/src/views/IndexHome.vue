<template>
  <div class="index-home" :style="{ '--pt': paddingTop + 'px' }">
    <div class="search-layout">
      <div class="search-top">
        <div class="search-tab">
          <span
            :class="['tab-item', { active: tab === 'host' }]"
            @click="tab = 'host'"
          >主机搜索</span>
          <span
            :class="['tab-item', { active: tab === 'fullText', disabled: true }]"
            @click="showFullTip"
          >全文检索</span>
        </div>
        <div class="tab-content">
          <div class="host-search-layout">
            <div class="search-bar">
              <el-input
                v-model="keyword"
                class="search-input"
                :placeholder="placeholder"
                size="large"
                @keyup.enter="handleSearch"
              />
              <el-button type="primary" class="search-btn" :loading="searching" @click="handleSearch">
                <el-icon style="margin-right: 4px"><Search /></el-icon>搜索
              </el-button>
              <el-link type="primary" class="advanced-link" @click="goAdvanced">高级筛选</el-link>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="map-wrap">
      <img :src="mapUrl" alt="" class="map-img" :style="mapStyle">
    </div>
    <div class="the-footer">
      <p class="footer-links"><a href="javascript:;">技术支持</a><span>|</span><a href="javascript:;">社区论坛</a><span>|</span><a href="javascript:;">产品官网</a></p>
      <p class="copyright">Copyright © 2012 Tencent BlueKing. All Rights Reserved. community-v3.14</p>
    </div>

    <el-dialog v-model="fullTipVisible" title="未开启全文检索功能" width="480px">
      <p style="margin: 0 0 8px; font-size: 12px; color: #63656E">
        使用全文检索,可以对所有纳管的资源进行无差别搜索,帮助你快速定位资源。
      </p>
      <p style="margin: 0; font-size: 12px; color: #63656E">
        独立部署模式默认未启用 Elasticsearch,如需使用请配置 ES 并开启 fullTextSearch。
      </p>
      <template #footer>
        <el-button @click="fullTipVisible = false">知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const tab = ref('host')
const keyword = ref('')
const searching = ref(false)
const fullTipVisible = ref(false)
const mapWidth = ref(857)

const mapUrl = import.meta.env.BASE_URL + 'map.svg'
const placeholder = '请输入主机IP,多个以逗号分隔'
const paddingTop = computed(() => Math.max(40, Math.floor((window.innerHeight - 58) / 3)))
const mapStyle = computed(() => ({
  width: `${mapWidth.value}px`,
  height: `${Math.floor(mapWidth.value * 404 / 857)}px`,
  left: `${Math.floor(window.innerWidth * 0.17)}px`
}))

function resize() {
  mapWidth.value = Math.max(480, Math.floor(window.innerWidth * 0.66))
}

function handleSearch() {
  const kw = keyword.value.trim()
  if (!kw) return
  searching.value = true
  router.push({ path: '/resource/catalog', query: { ip: kw } })
}

function goAdvanced() {
  router.push({ path: '/resource/catalog', query: { advanced: 1 } })
}

function showFullTip() {
  fullTipVisible.value = true
}

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
})
onBeforeUnmount(() => window.removeEventListener('resize', resize))
</script>

<style scoped>
.index-home {
  position: relative;
  min-height: 100%;
  padding: var(--pt, 120px) 0 52px;
  background-color: #F5F6FA;
  overflow-y: auto;
}
.search-layout { height: 100%; }

.search-tab {
  max-width: 806px;
  margin: 0 auto;
  font-size: 0;
}
.tab-item {
  display: inline-block;
  position: relative;
  height: 30px;
  line-height: 30px;
  text-align: center;
  padding: 0 14px;
  margin: 0 4px -1px 0;
  font-size: 14px;
  color: #63656E;
  background-color: #DCDEE5;
  border: 1px solid #C4C6CC;
  border-radius: 6px 6px 0 0;
  transition: all 0.2s;
  cursor: pointer;
}
.tab-item.active {
  background-color: #FFFFFF;
  border-bottom-color: #FFFFFF !important;
  z-index: 1000;
}
.tab-item.disabled { cursor: not-allowed; }

.host-search-layout {
  position: relative;
  width: 100%;
  max-width: 806px;
  height: 42px;
  margin: 0 auto;
}
.search-bar {
  position: absolute;
  width: 100%;
  height: 42px;
  z-index: 999;
  display: flex;
}
.search-input :deep(.el-input__wrapper) {
  height: 42px;
  border-radius: 2px 0 0 2px;
  box-shadow: 0 0 0 1px #C4C6CC inset;
}
.search-input :deep(.el-input__inner) {
  font-size: 14px;
  color: #63656E;
}
.search-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #3A84FF inset;
}
.search-btn {
  width: 86px;
  height: 42px;
  border-radius: 0 2px 2px 0;
}
.advanced-link {
  margin-left: 8px;
  font-size: 12px;
}

.map-wrap {
  /* 对齐老版: fixed 全屏背景层,搜索框叠在地图上方
     z-index 0 + 内容层 z-index 1,因为父容器有背景色会盖住 -1 */
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: visible;
}
.map-img {
  position: absolute;
  top: 181px;
  opacity: 0.5745;
  user-select: none;
}
.search-layout, .the-footer { position: relative; z-index: 1; }

.the-footer {
  position: absolute;
  left: 25px;
  right: 25px;
  bottom: 0;
  padding-top: 8px;
  height: 52px;
  font-size: 12px;
  text-align: center;
  color: #63656E;
  border-top: 1px solid #DCDEE5;
  background-color: #F5F6FA;
}
.the-footer p { margin: 2px 0; }
.footer-links a { color: #3A84FF; text-decoration: none; margin: 0 4px; font-size: 12px; }
.footer-links span { color: #C4C6CC; margin: 0 2px; }
.copyright { color: #979BA5; }
</style>
