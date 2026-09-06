<template>
  <div class="preview-field">
    <div v-for="(group, gi) in propertyGroups" :key="gi" class="property-group">
      <div class="group-name">{{ group.bk_group_name || '默认分组' }}</div>
      <ul class="property-list">
        <li v-for="p in group.properties || []" :key="p.bk_property_id" class="property-item">
          <span class="property-name" :class="{ required: p.isrequired }">{{ p.bk_property_name }}</span>
          <span class="property-type">({{ p.bk_property_type }})</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
defineProps({
  properties: { type: Array, default: () => [] },
  propertyGroups: { type: Array, default: () => [] }
})
</script>

<style scoped>
.preview-field { padding: 16px; }
.property-group { margin-bottom: 20px; }
.group-name { font-size: 14px; font-weight: 500; color: #313238; padding: 8px 0; border-bottom: 1px solid #DCDEE5; margin-bottom: 8px; }
.property-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
.property-item { padding: 6px 0; font-size: 13px; color: #63656e; display: flex; align-items: center; gap: 6px; }
.property-name.required::before { content: '*'; color: #ff5656; margin-right: 2px; }
.property-type { color: #C4C6CC; font-size: 12px; }
</style>
