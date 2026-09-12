// 旧版 $tools.formatTime 契约:moment(原值).format(),ISO 时间按浏览器本地时区渲染;空值返回空串,非法值原样返回
export function formatTime(value, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const p = (n) => String(n).padStart(2, '0')
  const map = {
    YYYY: String(d.getFullYear()),
    MM: p(d.getMonth() + 1),
    DD: p(d.getDate()),
    HH: p(d.getHours()),
    mm: p(d.getMinutes()),
    ss: p(d.getSeconds())
  }
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (t) => map[t])
}
