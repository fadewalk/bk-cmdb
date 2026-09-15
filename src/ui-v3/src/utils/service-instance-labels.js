const LABEL_KEY_RULE = /^[a-zA-Z]([a-z0-9A-Z\-_.]*[a-z0-9A-Z])?$/
const LABEL_VALUE_RULE = /^[a-z0-9A-Z]([a-z0-9A-Z\-_.]*[a-z0-9A-Z])?$/
const LABEL_MAX_LENGTH = 63

export function validateLabelPair(key, value, existingKeys = []) {
  const normalizedKey = String(key ?? '').trim()
  const normalizedValue = String(value ?? '').trim()
  if (!LABEL_KEY_RULE.test(normalizedKey) || normalizedKey.length > LABEL_MAX_LENGTH) {
    return '标签键格式错误或超过 63 个字符'
  }
  if (!LABEL_VALUE_RULE.test(normalizedValue) || normalizedValue.length > LABEL_MAX_LENGTH) {
    return '标签值格式错误或超过 63 个字符'
  }
  if (existingKeys.includes(normalizedKey)) return '标签键不能重复'
  return ''
}

export function labelsToRows(labels = {}) {
  return Object.entries(labels || {}).map(([key, value]) => ({
    key: String(key),
    value: String(value ?? ''),
    remove: false
  }))
}

export function rowsToLabelOperations(rows = []) {
  const entries = rows.map((row) => ({
    key: String(row?.key ?? '').trim(),
    value: String(row?.value ?? '').trim(),
    remove: row?.remove === true
  }))
  return {
    active: entries.filter((row) => row.key && !row.remove),
    removed: entries.filter((row) => row.key && row.remove).map((row) => row.key)
  }
}

export function labelsFromRows(rows = []) {
  const { active } = rowsToLabelOperations(rows)
  return Object.fromEntries(active.map((row) => [row.key, row.value]))
}

export { LABEL_MAX_LENGTH }
