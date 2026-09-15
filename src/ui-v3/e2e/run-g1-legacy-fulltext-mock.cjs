// E.1: legacy full_text off/empty/error contract.
//
// This runner is deliberately UI-independent.  It models the request built by
// src/ui/src/views/index/children/full-text-search/use-result.js and the
// validation/error envelope of POST /api/v3/find/full_text.  Keeping the
// contract helper pure makes the offline evidence runnable without a served UI,
// Elasticsearch, Monstache, MongoDB, or a live browser session.
const fs = require('node:fs')
const assert = require('node:assert/strict')

const API_PATH = '/find/full_text'
const REPORT_KIND = 'legacy-g1-fulltext-mock'
const FULLTEXT_ON = 'on'
const MAX_QUERY_LENGTH = 50

// These are the backend constants used by FullTextSearch in
// src/scene_server/topo_server/service/fulltextsearch.go.
const ERROR_CODES = Object.freeze({
  PARAM_INVALID: 1199006,
  ES_FIND_ERROR: 1101088,
  ES_CLIENT_NOT_INITIALIZED: 1101089,
  AUTH_FAILURE: 9900403
})

const SINGLE_SPECIAL_CHARACTER = /[!"#$%&'()\*,-\./:;<=>?@\[\\\]^_`{}\|~]{1}/
const BACKEND_SPECIAL_CHARACTER = new Set([
  '`', '~', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '=', '+',
  '[', '{', ']', '}', '\\', '"', '|', ';', ':', "'", ',', '.', '<', '>', '/', '?'
])

const EMPTY_RESULT = Object.freeze({
  total: 0,
  aggregations: [],
  hits: [],
  attrs: { attributes: {}, groups: {} }
})

function clone(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

function codeOf(response) {
  return response?.data?.bk_error_code ?? response?.data?.code
}

function isOk(response) {
  return response?.status >= 200 && response?.status < 300 && response?.data?.result === true && codeOf(response) === 0
}

function responseSummary(response) {
  return {
    status: response?.status,
    code: codeOf(response),
    result: response?.data?.result,
    message: response?.data?.bk_error_msg || response?.data?.err_msg || response?.data?.message || null
  }
}

/**
 * Exact client-side transformation from legacy use-result.js.
 * The legacy API receives wildcard wrapping for a non-word query and strips a
 * single punctuation character before wrapping it.  Backend escaping happens
 * later, in FullTextSearchReq.Validate().
 */
function buildLegacyQueryString(keyword) {
  const value = String(keyword ?? '')
  const nonLetter = /\W/.test(value)
  const queryString = value.length === 1 ? value.replace(SINGLE_SPECIAL_CHARACTER, '') : value
  return nonLetter ? `*${queryString}*` : queryString
}

/**
 * Build the legacy POST body.  `page` may contain route-query strings; the old
 * use-result.js converts both page and limit through Number before dispatch.
 */
function buildLegacyFullTextRequest({ keyword = '', models = [], instances = [], page = {}, subResource } = {}) {
  const body = {
    filter: {
      models: Array.isArray(models) ? models.slice() : models,
      instances: Array.isArray(instances) ? instances.slice() : instances
    },
    query_string: buildLegacyQueryString(keyword),
    page: {
      start: Number(page.start ?? 0),
      limit: Number(page.limit ?? 10)
    }
  }

  if (subResource !== undefined && subResource !== null) body.sub_resource = clone(subResource)
  return body
}

/**
 * The old search result composable returns before dispatch when the feature is
 * off, the input is empty, or the model inventory is empty.  This is the
 * no-request gate that the offline matrix records explicitly.
 */
function shouldRequestFullText({ fullTextSearch = FULLTEXT_ON, keyword = '', allModelIds = [] } = {}) {
  if (fullTextSearch !== FULLTEXT_ON) return false
  if (String(keyword ?? '').trim().length === 0) return false
  if (!buildLegacyQueryString(keyword).length) return false
  return Array.isArray(allModelIds) && allModelIds.length > 0
}

function invalid(reason) {
  return { valid: false, code: ERROR_CODES.PARAM_INVALID, reason }
}

/**
 * Pure equivalent of the backend request validation used for the mock.  The
 * API's successful empty result is intentionally different from invalid empty
 * filter/keyword input.
 */
function validateFullTextRequest(body) {
  if (!body || typeof body !== 'object') return invalid('request body is missing')

  const queryString = body.query_string
  if (typeof queryString !== 'string' || queryString.length === 0) return invalid("can't search with the empty keyword")
  if (queryString.length === 1 && BACKEND_SPECIAL_CHARACTER.has(queryString)) {
    return invalid(`can't search with the special character: ${queryString}`)
  }

  const rawString = queryString.replace(/^\*+|\*+$/g, '')
  const utf8Length = Array.from(rawString).length
  if (utf8Length > MAX_QUERY_LENGTH) {
    return invalid(`invalid search string[${rawString}], length[${utf8Length}] in UTF-8 encoding is too large, max: ${MAX_QUERY_LENGTH}`)
  }

  const filter = body.filter
  if (!filter || typeof filter !== 'object') return invalid('invalid search request filter, filter is missing')
  if (!Array.isArray(filter.models) || !Array.isArray(filter.instances)) return invalid('invalid search request filter, models/instances must be arrays')

  const duplicate = (values, label) => {
    const seen = new Set()
    for (const value of values) {
      if (seen.has(value)) return `repeated ${label}[${value}]`
      seen.add(value)
    }
    return null
  }
  const duplicateModel = duplicate(filter.models, 'model')
  if (duplicateModel) return invalid(`invalid search request filter, ${duplicateModel}`)
  const duplicateInstance = duplicate(filter.instances, 'instance')
  if (duplicateInstance) return invalid(`invalid search request filter, ${duplicateInstance}`)
  if (filter.models.length === 0 && filter.instances.length === 0) {
    return invalid('invalid search request filter, empty models and instances filter')
  }

  const page = body.page
  if (!page || typeof page !== 'object') return invalid('page is missing')
  if (!Number.isInteger(page.start) || page.start < 0) return invalid('page start must great than or equal to 0')
  if (!Number.isInteger(page.limit) || page.limit <= 0) return invalid('page limit must great than 0')
  if (page.limit > 100) return invalid('page limit must less than or equal to 100')

  // The backend does not call Filter.Validate on sub_resource.  It is only
  // translated into the ES query when present, so preserve that compatibility.
  return { valid: true, code: 0, reason: null }
}

function envelope(status, result, code, data, message = '') {
  return {
    status,
    data: {
      result,
      bk_error_code: code,
      bk_error_msg: message || (code === 0 ? 'success' : ''),
      permission: null,
      data
    }
  }
}

function mockFullTextResponse(body, mode = 'success') {
  if (mode === 'es-500') {
    return envelope(500, false, ERROR_CODES.ES_FIND_ERROR, null, 'full text search failed')
  }
  if (mode === 'unavailable') {
    return envelope(503, false, ERROR_CODES.ES_CLIENT_NOT_INITIALIZED, null, 'full text search client is unavailable')
  }
  if (mode === 'forbidden') {
    return envelope(403, false, ERROR_CODES.AUTH_FAILURE, null, 'permission denied')
  }

  const validation = validateFullTextRequest(body)
  if (!validation.valid) return envelope(200, false, validation.code, null, validation.reason)
  if (mode === 'empty') return envelope(200, true, 0, clone(EMPTY_RESULT))

  return envelope(200, true, 0, {
    total: 1,
    aggregations: [{ kind: 'instance', key: 'host', count: 1 }],
    hits: [{ kind: 'instance', key: 'host', source: { bk_host_name: 'g1-mock-host' }, highlight: {} }],
    attrs: { attributes: {}, groups: {} }
  })
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

function runOfflineMatrix() {
  const requests = []
  const scenarios = {}

  function submit(name, options, mode = 'success', gate = {}) {
    if (!shouldRequestFullText({
      fullTextSearch: gate.fullTextSearch ?? FULLTEXT_ON,
      keyword: options.keyword,
      allModelIds: gate.allModelIds ?? ['host']
    })) {
      scenarios[name] = { status: 'passed', requested: false, response: null }
      return null
    }

    const body = buildLegacyFullTextRequest(options)
    const response = mockFullTextResponse(body, mode)
    requests.push({ method: 'POST', path: API_PATH, body, response: responseSummary(response) })
    scenarios[name] = { status: isOk(response) ? 'passed' : 'passed', requested: true, body, response: responseSummary(response) }
    return { body, response }
  }

  // Feature gate and the two client-side no-dispatch guards.
  submit('fullTextSearch-off-no-request', { keyword: 'host', models: ['host'], instances: ['host'] }, 'success', { fullTextSearch: 'off' })
  expect(scenarios['fullTextSearch-off-no-request'].requested === false, 'fullTextSearch off dispatched a request')
  submit('empty-keyword-no-request', { keyword: '', models: ['host'], instances: ['host'] })
  expect(scenarios['empty-keyword-no-request'].requested === false, 'empty keyword dispatched a request')
  submit('empty-model-inventory-no-request', { keyword: 'host', models: ['host'], instances: ['host'] }, 'success', { allModelIds: [] })
  expect(scenarios['empty-model-inventory-no-request'].requested === false, 'empty model inventory dispatched a request')

  // The legacy client sends wildcard-wrapped punctuation and the backend
  // accepts it after trimming the outer stars and escaping ES syntax.
  const special = submit('special-characters', { keyword: 'foo+bar', models: ['host'], instances: ['host'] }, 'empty')
  expect(special.body.query_string === '*foo+bar*', `special-character query_string mismatch: ${special.body.query_string}`)
  const singleSpecial = buildLegacyFullTextRequest({ keyword: '!', models: ['host'], instances: ['host'] })
  expect(singleSpecial.query_string === '**', `single special query_string mismatch: ${singleSpecial.query_string}`)
  expect(validateFullTextRequest(singleSpecial).valid, 'legacy single-special wildcard body should be valid')

  const tooLong = submit('over-50-characters', { keyword: 'a'.repeat(51), models: ['host'], instances: ['host'] })
  expect(codeOf(tooLong.response) === ERROR_CODES.PARAM_INVALID, 'over-50-character request did not return parameter error')
  expect(tooLong.body.query_string === 'a'.repeat(51), 'over-50-character body was unexpectedly wildcard-wrapped')

  const emptyFilter = submit('empty-models-and-instances', { keyword: 'host', models: [], instances: [] })
  expect(codeOf(emptyFilter.response) === ERROR_CODES.PARAM_INVALID, 'empty models/instances did not return parameter error')
  const modelsEmpty = submit('models-empty-instances-present', { keyword: 'host', models: [], instances: ['host'] }, 'empty')
  expect(isOk(modelsEmpty.response), 'empty models with instances should be legal')
  const instancesEmpty = submit('instances-empty-models-present', { keyword: 'host', models: ['host'], instances: [] }, 'empty')
  expect(isOk(instancesEmpty.response), 'empty instances with models should be legal')

  const empty = submit('legal-empty-result', { keyword: 'does-not-exist', models: ['host'], instances: ['host'], page: { start: 0, limit: 10 } }, 'empty')
  expect(empty.body.query_string === '*does-not-exist*', 'legal empty query_string mismatch')
  expect(isOk(empty.response) && empty.response.data.data.total === 0, 'legal empty result envelope mismatch')

  const scoped = submit('page-filter-sub-resource', {
    keyword: 'host-01',
    models: ['host', 'biz'],
    instances: ['host', 'biz'],
    page: { start: 20, limit: 10 },
    subResource: { hosts: ['host-01', 'host-02'] }
  }, 'success')
  expect(scoped.body.query_string === '*host-01*', 'scoped query_string mismatch')
  expect(scoped.body.filter.models.join(',') === 'host,biz', 'filter.models mismatch')
  expect(scoped.body.filter.instances.join(',') === 'host,biz', 'filter.instances mismatch')
  expect(scoped.body.page.start === 20 && scoped.body.page.limit === 10, 'page.start/limit mismatch')
  expect(JSON.stringify(scoped.body.sub_resource) === JSON.stringify({ hosts: ['host-01', 'host-02'] }), 'sub_resource mismatch')
  expect(isOk(scoped.response) && scoped.response.data.data.hits.length === 1, 'successful full_text envelope mismatch')

  const es500 = submit('es-500', { keyword: 'host', models: ['host'], instances: ['host'] }, 'es-500')
  expect(es500.response.status === 500 && codeOf(es500.response) === ERROR_CODES.ES_FIND_ERROR, 'ES 500 contract mismatch')
  const unavailable = submit('es-unavailable', { keyword: 'host', models: ['host'], instances: ['host'] }, 'unavailable')
  expect(unavailable.response.status === 503 && codeOf(unavailable.response) === ERROR_CODES.ES_CLIENT_NOT_INITIALIZED, 'ES unavailable contract mismatch')
  const forbidden = submit('forbidden-9900403', { keyword: 'host', models: ['host'], instances: ['host'] }, 'forbidden')
  expect(forbidden.response.status === 403 && codeOf(forbidden.response) === ERROR_CODES.AUTH_FAILURE, '403/9900403 contract mismatch')

  return { status: 'passed', scenarios, requests }
}

function makeReport(status, matrix, errors = []) {
  return {
    schemaVersion: 1,
    reportKind: REPORT_KIND,
    generatedAt: new Date().toISOString(),
    status,
    stages: {
      offline: status === 'passed' ? 'passed' : 'failed',
      esMonstache: 'blocked',
      mongoToEs: 'not-verified'
    },
    matrix: matrix?.scenarios || {},
    requests: matrix?.requests || [],
    errors,
    layers: {
      offline: {
        status: status === 'passed' ? 'passed' : 'failed',
        evidence: 'pure contract helper; no live backend request'
      },
      esMonstache: {
        status: 'blocked',
        reason: 'ES/Monstache runtime and real full-text index are intentionally not part of E.1'
      },
      mongoToEs: {
        status: 'not-verified',
        reason: 'Mongo -> change stream -> Monstache -> ES synchronization was not verified'
      }
    },
    layerStatus: {
      offline: status === 'passed' ? 'passed' : 'failed',
      'ES/Monstache': 'blocked',
      'Mongo->ES': 'not-verified'
    },
    contract: {
      method: 'POST',
      path: API_PATH,
      requestFields: ['query_string', 'filter.models', 'filter.instances', 'page.start', 'page.limit', 'sub_resource'],
      maxQueryStringRunes: MAX_QUERY_LENGTH,
      pageLimit: { min: 1, max: 100 },
      errorCodes: ERROR_CODES,
      legalEmptyResponse: clone(EMPTY_RESULT)
    }
  }
}

function run() {
  try {
    const matrix = runOfflineMatrix()
    return makeReport('passed', matrix)
  } catch (error) {
    return makeReport('failed', { status: 'failed', scenarios: {}, requests: [] }, [error.message])
  }
}

if (require.main === module) {
  const report = run()
  const output = `${JSON.stringify(report, null, 2)}\n`
  if (process.env.G1_LEGACY_FULLTEXT_REPORT_PATH) fs.writeFileSync(process.env.G1_LEGACY_FULLTEXT_REPORT_PATH, output)
  process.stdout.write(output)
  if (report.status !== 'passed') process.exitCode = 1
}

module.exports = {
  API_PATH,
  REPORT_KIND,
  FULLTEXT_ON,
  MAX_QUERY_LENGTH,
  ERROR_CODES,
  EMPTY_RESULT,
  codeOf,
  isOk,
  responseSummary,
  buildLegacyQueryString,
  buildLegacyFullTextRequest,
  shouldRequestFullText,
  validateFullTextRequest,
  mockFullTextResponse,
  runOfflineMatrix,
  makeReport,
  run
}
