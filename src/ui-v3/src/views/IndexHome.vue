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
              <textarea
                v-model="keyword"
                class="search-input"
                :placeholder="placeholder"
                rows="1"
                @keydown.enter.exact.prevent="handleSearch"
              />
              <el-button type="primary" class="search-btn" :loading="searching" @click="handleSearch">
                <el-icon style="margin-right: 4px"><Search /></el-icon>搜索
              </el-button>
              <el-link type="primary" class="advanced-link" @click="handleSetFilters">高级筛选</el-link>
            </div>
            <div v-if="isShowPopover" class="picking-popover-content">
              <p>未在输入的内容中检测到有效IP，请问你希望以哪种方式进行搜索？</p>
              <div class="popover-actions">
                <el-button size="small" @click="handleAssetSearch">固资编号</el-button>
                <el-button size="small" type="primary" @click="handleIpFuzzySearch">IP模糊搜索</el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AdvancedHostFilter
      v-model="filterVisible"
      :properties="properties"
      :initial="filterInitial"
      @submit="handleAdvancedSubmit"
      @reset="handleAdvancedReset"
    />

    <div class="map-wrap">
      <img :src="mapUrl" alt="" class="map-img" :style="mapStyle">
    </div>
    <div class="the-footer">
      <p class="footer-links"><a href="https://wpa1.qq.com/KziXGWJs?_type=wpa&qidian=true" target="_blank" rel="noopener noreferrer">技术支持</a><span>|</span><a href="https://bk.tencent.com/s-mart/community/" target="_blank" rel="noopener noreferrer">社区论坛</a><span>|</span><a href="https://bk.tencent.com/index/" target="_blank" rel="noopener noreferrer">产品官网</a></p>
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
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import AdvancedHostFilter from '../components/AdvancedHostFilter.vue'
import { searchUserCustom, saveUserCustom } from '../api/cmdb'
import {
  hasValidHostIp, parseHostSearch, serializeIpCondition, splitSearchText,
  fetchHostFilterProperties, resolveInitialConditions, toUserBehavior, RESOURCE_FILTER_USERCUSTOM_KEY
} from '../utils/host-filter'

const router = useRouter()
const tab = ref('host')
const keyword = ref('')
const searching = ref(false)
const fullTipVisible = ref(false)
const filterVisible = ref(false)
const isShowPopover = ref(false)
const properties = ref([])
const filterUsercustom = ref(null)
const filterInitial = ref({ IP: { text: '', inner: true, outer: true, exact: true }, conditions: [] })
const mapWidth = ref(857)

const mapUrl = import.meta.env.BASE_URL + 'map.svg'
const placeholder = '请输入IP、管控区域ID:IP、固资编号进行搜索,支持搜索多个,使用组合键 Shift + Enter 换行'
const paddingTop = computed(() => Math.max(40, Math.floor((window.innerHeight - 58) / 3)))
const mapStyle = computed(() => ({
  width: `${mapWidth.value}px`,
  height: `${Math.floor(mapWidth.value * 404 / 857)}px`,
  left: `${Math.floor(window.innerWidth * 0.17)}px`
}))

function resize() {
  mapWidth.value = Math.max(480, Math.floor(window.innerWidth * 0.66))
}

function resizeSearchInput() {
  const input = document.querySelector('.index-home .search-input')
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.min(400, Math.max(42, input.scrollHeight))}px`
}

function handleSearch() {
  const kw = keyword.value.trim()
  if (!kw) return
  const parsed = parseHostSearch(kw)
  if (parsed.cloudIdSet.size > 50) { ElMessage.warning('最多支持50个不同管控区域的混合搜索'); return }
  if (parsed.IPv4List.length + parsed.IPv6List.length + parsed.IPv4WithCloudList.length + parsed.IPv6WithCloudList.length > 10000) {
    ElMessage.warning('最多支持搜索10000条数据'); return
  }
  searching.value = true
  sessionStorage.setItem('homeHostSearchContent', JSON.stringify(kw))
  router.push({ path: '/resource/host', query: { ip: serializeIpCondition({ text: kw, inner: true, outer: true, exact: true }), scope: 'all' } })
}

function handleSetFilters() {
  isShowPopover.value = false
  const content = keyword.value.trim()
  if (content && !hasValidHostIp(content)) {
    isShowPopover.value = true
    return
  }
  openFilter(content)
}

function openFilter(content = '') {
  // 旧版 setupNormalProperty:优先用户保存行为,否则预置默认条件行(集群名/模块名/维护人/管控区域)
  filterInitial.value = {
    IP: { text: content, inner: true, outer: true, exact: true },
    conditions: resolveInitialConditions(properties.value, filterUsercustom.value)
  }
  filterVisible.value = true
}

function handleAssetSearch() {
  const content = keyword.value.trim()
  isShowPopover.value = false
  openFilter('')
  filterInitial.value.conditions = [{
    id: 'host.bk_asset_id',
    property: { id: 'host.bk_asset_id', bk_obj_id: 'host', bk_property_id: 'bk_asset_id', bk_property_name: '固资编号', bk_property_type: 'singlechar' },
    operator: 'in',
    value: splitSearchText(content)
  }]
}

function handleIpFuzzySearch() {
  const content = keyword.value.trim()
  isShowPopover.value = false
  openFilter(content)
  filterInitial.value.IP.exact = false
}

function handleAdvancedReset() {
  filterInitial.value = { IP: { text: '', inner: true, outer: true, exact: true }, conditions: [] }
}

function handleAdvancedSubmit(result) {
  // 旧版行为:查询后把本次所选字段保存为用户习惯
  saveUserCustom({ [RESOURCE_FILTER_USERCUSTOM_KEY]: toUserBehavior(result.conditions) }).catch(() => {})
  const query = {
    scope: 'all',
    adv: '1',
    ip: serializeIpCondition(result.IP),
    filter: result.filter || ''
  }
  router.push({ path: '/resource/host', query })
}

function showFullTip() {
  fullTipVisible.value = true
}

onMounted(async () => {
  resize()
  window.addEventListener('resize', resize)
  try {
    const saved = JSON.parse(sessionStorage.getItem('homeHostSearchContent') || '""')
    if (typeof saved === 'string') keyword.value = saved
  } catch { /* ignore invalid browser state */ }
  try {
    properties.value = await fetchHostFilterProperties()
  } catch { properties.value = [] }
  filterUsercustom.value = await searchUserCustom().catch(() => null)
  nextTick(resizeSearchInput)
})
watch(keyword, () => nextTick(resizeSearchInput))
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
.search-input {
  display: block;
  box-sizing: border-box;
  flex: 1;
  min-height: 42px;
  max-height: 400px;
  padding: 8px 12px;
  border: 1px solid #C4C6CC;
  border-right: 0;
  border-radius: 2px 0 0 2px;
  outline: none;
  resize: none;
  overflow-y: auto;
  background: #fff;
  font: inherit;
  font-size: 14px;
  line-height: 26px;
  color: #63656E;
}
.search-input:focus { border-color: #3A84FF; }
.search-btn {
  width: 86px;
  height: 42px;
  flex: 0 0 86px;
  border-radius: 0 2px 2px 0;
}
.advanced-link {
  margin-left: 8px;
  font-size: 12px;
}
.picking-popover-content {
  position: absolute;
  top: 54px;
  right: 0;
  z-index: 1000;
  width: 280px;
  padding: 12px;
  background: #fff;
  border: 1px solid #DCDEE5;
  box-shadow: 0 2px 8px rgba(0, 0, 0, .12);
  color: #63656E;
  font-size: 12px;
}
.picking-popover-content p { margin: 0 0 12px; line-height: 18px; }
.popover-actions { display: flex; justify-content: flex-end; gap: 8px; }

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
