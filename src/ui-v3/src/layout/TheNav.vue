<template>
  <nav class="the-nav" :class="{ 'no-child': !currentChild }">
    <!-- 业务选择器(业务组页面显示,对齐旧版 cmdb-business-mix-selector) -->
    <div class="biz-selector-wrap" v-if="currentTop?.id === 'business' && currentChild?.biz">
      <el-select
        :model-value="bizStore.bizId"
        filterable
        placeholder="选择业务"
        size="small"
        style="width: 100%"
        @change="bizStore.select"
      >
        <el-option
          v-for="b in bizStore.bizList"
          :key="b.bk_biz_id"
          :label="b.bk_biz_name"
          :value="b.bk_biz_id"
        />
      </el-select>
    </div>

    <div class="menu-list">
      <template v-for="child in currentTop?.children || []" :key="child.id">
        <router-link
          class="menu-item"
          :class="{ active: isActive(child) }"
          :to="child.path"
        >
          <h3 class="menu-info">
            <span class="menu-dot" />
            <span class="menu-name">{{ child.name }}</span>
          </h3>
        </router-link>
      </template>
    </div>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { findMenuByPath } from './menu-config'
import { useBizStore } from '../stores/biz'

const route = useRoute()
const bizStore = useBizStore()

const currentTop = computed(() => findMenuByPath(route.path)?.top || null)
const currentChild = computed(() => findMenuByPath(route.path)?.child || null)

function isActive(child) {
  return route.path === child.path
}
</script>

<style scoped>
.the-nav {
  width: 260px;
  height: 100%;
  background: #fff;
  border-right: 1px solid #DCDEE5;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.biz-selector-wrap {
  padding: 10px 16px;
  border-bottom: 1px solid #E7E9EF;
}
.menu-list { flex: 1; padding: 6px 0; }
.menu-item {
  display: block;
  height: 42px;
  line-height: 42px;
  padding: 0 0 0 24px;
  color: #63656E;
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
}
.menu-item:hover { background-color: #F6F6F9; }
.menu-item.active {
  background-color: #E1ECFF;
  color: #3A84FF;
}
.menu-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 14px;
  font-weight: 400;
}
.menu-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: #c4c6cc;
}
.menu-item.active .menu-dot { background-color: #3A84FF; }
.the-nav.no-child { display: none; }
</style>
