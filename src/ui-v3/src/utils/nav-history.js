// 老版 routerActions history:true 语义的轻量复刻:
// 进入详情类页面前快照来源路由,返回时弹出恢复;超深链无快照时由调用方提供相对菜单兜底
const KEY = 'cmdb-nav-history'

export function pushNavHistory(route) {
  try {
    const list = JSON.parse(sessionStorage.getItem(KEY) || '[]')
    list.push({ path: route.fullPath || route.path })
    while (list.length > 10) list.shift()
    sessionStorage.setItem(KEY, JSON.stringify(list))
  } catch { /* 存储不可用时静默,返回走兜底 */ }
}

export function popNavHistory() {
  try {
    const list = JSON.parse(sessionStorage.getItem(KEY) || '[]')
    const entry = list.pop()
    sessionStorage.setItem(KEY, JSON.stringify(list))
    return entry || null
  } catch {
    return null
  }
}
