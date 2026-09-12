// 老版 router/StatusError.js 复刻:守卫内抛出后统一转为状态路由(/404、/error、/no-business)
export default class StatusError extends Error {
  constructor({ name = 'error', query } = {}) {
    super(`status: ${name}`)
    this.name = name
    this.query = query
  }
}
