const LABEL_KEY_RULE = /^[a-zA-Z]([a-z0-9A-Z\-_.]*[a-z0-9A-Z])?$/

const asTrimmedString = (value) => String(value ?? '').trim()

export function uniqueNonEmpty(values = []) {
  const source = Array.isArray(values)
    ? values
    : (typeof values === 'string' || typeof values === 'number' ? [values] : [])
  return [...new Set(source.map(asTrimmedString).filter(Boolean))]
}

/** Legacy aggregation shape: { key: uniqueValues[] }. */
export function normalizeLabelAggregation(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
  return Object.fromEntries(
    Object.entries(data)
      .map(([key, values]) => [asTrimmedString(key), uniqueNonEmpty(values)])
      .filter(([key, values]) => key && values.length)
  )
}

/** Convert legacy search-select entries into backend selectors. */
export function buildServiceInstanceSelectors(filters = []) {
  const selectors = []
  for (const filter of Array.isArray(filters) ? filters : []) {
    if (!filter) continue
    if (filter.id === 'tagValue') {
      const key = asTrimmedString(filter.condition?.id || filter.condition?.key)
      const values = uniqueNonEmpty((filter.values || []).map((value) => value?.name ?? value))
      if (key && values.length) selectors.push({ key, operator: 'in', values })
      continue
    }
    if (filter.id === 'tagKey') {
      const key = asTrimmedString(filter.key || filter.values?.[0]?.id || filter.values?.[0]?.name)
      if (key) selectors.push({ key, operator: 'exists', values: [] })
      continue
    }
    if (filter.key && filter.operator) {
      const key = asTrimmedString(filter.key)
      const values = uniqueNonEmpty(filter.values)
      if (key && LABEL_KEY_RULE.test(key)) selectors.push({ key, operator: asTrimmedString(filter.operator), values })
    }
  }
  return selectors
}

export function buildServiceInstanceSearchOptions({ searchKey = '', labelKey = '', labelValues = [] } = {}) {
  const key = asTrimmedString(labelKey)
  const values = uniqueNonEmpty(labelValues)
  return {
    search_key: asTrimmedString(searchKey),
    selectors: key ? [{ key, operator: values.length ? 'in' : 'exists', values }] : []
  }
}

/** Legacy process/expand-list request: the server accepts its no-limit sentinel. */
export function buildProcessDetailsByIdsRequest(bizId, processIds = []) {
  const ids = [...new Set((Array.isArray(processIds) ? processIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isSafeInteger(id) && id > 0))]
  return {
    bk_biz_id: bizId,
    process_ids: ids,
    page: { limit: 999999999 }
  }
}

/** Extract the process ids already returned by the ordinary service-instance query. */
export function extractProcessIds(data) {
  const rows = Array.isArray(data?.info) ? data.info : (Array.isArray(data) ? data : [])
  return [...new Set(rows
    .map((row) => row?.property?.bk_process_id ?? row?.process_id)
    .map((id) => Number(id))
    .filter((id) => Number.isSafeInteger(id) && id > 0))]
}

/** The by_ids endpoint returns the shared count/info envelope after http unwrapping. */
export function normalizeProcessDetailsByIdsResponse(data) {
  if (!data || !Array.isArray(data.info)) throw new Error('进程详情响应缺少 info')
  const parsedCount = Number(data.count)
  return {
    count: Number.isFinite(parsedCount) ? parsedCount : data.info.length,
    info: data.info.filter(Boolean)
  }
}

export function processDetailsErrorMessage(error) {
  return error?.message || '进程详情查询失败'
}
