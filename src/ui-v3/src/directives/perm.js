import { usePermissionStore } from '../stores/permission'

// v-perm="{ object: 'biz', action: 'create', domain: '2' }"
// 无权限时禁用元素(按钮置灰、容器不可点),与老版 cmdb-auth 灰置语义对齐;
// 开放模式(open)恒放行。判定结果由 permission store 缓存。
function apply(el, allowed) {
  if (allowed) {
    el.classList.remove('perm-denied')
    if (el.dataset.permDisabled === '1') {
      el.disabled = false
      delete el.dataset.permDisabled
    }
    return
  }
  el.classList.add('perm-denied')
  if ('disabled' in el) {
    el.dataset.permDisabled = '1'
    el.disabled = true
  } else {
    el.style.pointerEvents = 'none'
  }
  el.title = el.title || '无操作权限'
}

async function evaluate(el, binding) {
  const value = binding.value || {}
  if (!value.object || !value.action) return
  const store = usePermissionStore()
  const allowed = await store.verify({ object: value.object, action: value.action, domain: value.domain || '*' })
  apply(el, allowed)
}

export default {
  mounted(el, binding) { evaluate(el, binding) },
  updated(el, binding) { evaluate(el, binding) }
}
