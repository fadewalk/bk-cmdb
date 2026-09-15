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
