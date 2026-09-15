// Field template response and workflow helpers shared by list and deep-link pages.

export function responseList(response) {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.info)) return response.info
  if (Array.isArray(response?.data?.info)) return response.data.info
  if (Array.isArray(response?.data)) return response.data
  return []
}

export function modelIdOf(model) {
  return model?.id ?? model?.bk_obj_id
}

export function modelKeyOf(model) {
  const id = modelIdOf(model)
  return id === undefined || id === null ? '' : String(id)
}

export function modelObjectIdOf(model) {
  const value = modelIdOf(model)
  if (value === undefined || value === null || value === '') return value
  const number = Number(value)
  return Number.isFinite(number) ? number : value
}

export function modelNameOf(model) {
  return model?.bk_obj_name || model?.name || model?.bk_obj_id || model?.id || '--'
}

export function extractTaskIds(response) {
  if (Array.isArray(response)) {
    return response.flatMap((item) => {
      if (typeof item === 'string' || typeof item === 'number') return [String(item)]
      return item?.task_id || item?.taskId ? [String(item.task_id ?? item.taskId)] : []
    })
  }
  if (Array.isArray(response?.task_ids)) return response.task_ids.map(String)
  if (Array.isArray(response?.data?.task_ids)) return response.data.task_ids.map(String)
  if (Array.isArray(response?.data)) return extractTaskIds(response.data)
  return []
}

export function extractTaskRows(response) {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.info)) return response.info
  if (Array.isArray(response?.data?.info)) return response.data.info
  if (Array.isArray(response?.data)) return response.data
  return []
}

export function taskStatusOf(task) {
  return String(task?.status || '').toLowerCase()
}

export function isTerminalTaskStatus(task) {
  return ['finished', 'success', 'failure'].includes(taskStatusOf(task))
}

export function isFailureTaskStatus(task) {
  return taskStatusOf(task) === 'failure'
}

function diffArray(value) {
  return Array.isArray(value) ? value : []
}

function diffValue(source, ...keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null) return source[key]
  }
  return []
}

export function normalizeTemplateDiff(response) {
  const source = response?.data && !Array.isArray(response.data) ? response.data : response || {}
  const create = diffValue(source, 'create', 'created', 'creates')
  const update = diffValue(source, 'update', 'updated', 'changes', 'changed')
  const conflict = diffValue(source, 'conflict', 'conflicts', 'conflicted')
  const unchanged = diffValue(source, 'unchanged')
  const count = (value) => Array.isArray(value) ? value.length : (typeof value === 'number' ? value : 0)
  return {
    create: diffArray(create),
    update: diffArray(update),
    conflict: diffArray(conflict),
    unchanged: diffArray(unchanged),
    counts: {
      create: count(create),
      update: count(update),
      conflict: count(conflict),
      unchanged: count(unchanged)
    }
  }
}

export function persistedFieldId(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'string' && value.startsWith('f-')) return undefined
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : undefined
}

export function normalizeTemplateAttribute(field) {
  const payload = {
    bk_property_id: field?.bk_property_id,
    bk_property_name: field?.bk_property_name,
    bk_property_type: field?.bk_property_type,
    unit: field?.unit || '',
    option: field?.option || '',
    default: field?.default || null,
    ismultiple: !!field?.ismultiple,
    placeholder: {
      lock: true,
      value: typeof field?.placeholder === 'object' ? (field.placeholder?.value || '') : (field?.placeholder || '')
    },
    isrequired: {
      lock: true,
      value: typeof field?.isrequired === 'object' ? !!field.isrequired?.value : !!field?.isrequired
    },
    editable: {
      lock: true,
      value: typeof field?.editable === 'object' ? field.editable?.value !== false : field?.editable !== false
    }
  }
  const id = persistedFieldId(field?.id)
  if (id !== undefined) payload.id = id
  return payload
}

export function uniqueFieldNames(unique, fields) {
  return (unique?.keys || []).map((key) => {
    const field = fields.find((item) => String(item?.id) === String(key)
      || String(item?.bk_property_id) === String(key))
    return field?.bk_property_name || String(key)
  })
}
