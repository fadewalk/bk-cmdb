#!/usr/bin/env node

const assert = require('node:assert/strict')
const {
  API_PATH,
  REPORT_KIND,
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
  makeReport
} = require('./run-g1-legacy-fulltext-mock.cjs')

assert.equal(API_PATH, '/find/full_text')
assert.equal(REPORT_KIND, 'legacy-g1-fulltext-mock')
assert.equal(buildLegacyQueryString('host'), 'host')
assert.equal(buildLegacyQueryString('foo+bar'), '*foo+bar*')
assert.equal(buildLegacyQueryString('!'), '**')
assert.equal(buildLegacyQueryString('中文'), '*中文*')

assert.equal(shouldRequestFullText({ fullTextSearch: 'off', keyword: 'host', allModelIds: ['host'] }), false)
assert.equal(shouldRequestFullText({ fullTextSearch: 'on', keyword: '', allModelIds: ['host'] }), false)
assert.equal(shouldRequestFullText({ fullTextSearch: 'on', keyword: 'host', allModelIds: [] }), false)
assert.equal(shouldRequestFullText({ fullTextSearch: 'on', keyword: 'host', allModelIds: ['host'] }), true)

const scoped = buildLegacyFullTextRequest({
  keyword: 'host-01',
  models: ['host', 'biz'],
  instances: ['host', 'biz'],
  page: { start: '20', limit: '10' },
  subResource: { hosts: ['host-01', 'host-02'] }
})
assert.deepEqual(scoped, {
  filter: { models: ['host', 'biz'], instances: ['host', 'biz'] },
  query_string: '*host-01*',
  page: { start: 20, limit: 10 },
  sub_resource: { hosts: ['host-01', 'host-02'] }
})
assert.equal(validateFullTextRequest(scoped).valid, true)

assert.equal(validateFullTextRequest({
  query_string: '',
  filter: { models: ['host'], instances: ['host'] },
  page: { start: 0, limit: 10 }
}).valid, false)
assert.equal(validateFullTextRequest({
  query_string: '!',
  filter: { models: ['host'], instances: ['host'] },
  page: { start: 0, limit: 10 }
}).valid, false)
assert.equal(validateFullTextRequest({
  query_string: '*a'.repeat(26),
  filter: { models: ['host'], instances: ['host'] },
  page: { start: 0, limit: 10 }
}).valid, false)
assert.equal(validateFullTextRequest({
  query_string: 'host',
  filter: { models: [], instances: [] },
  page: { start: 0, limit: 10 }
}).valid, false)
assert.equal(validateFullTextRequest({
  query_string: 'host',
  filter: { models: [], instances: ['host'] },
  page: { start: 0, limit: 10 }
}).valid, true)
assert.equal(validateFullTextRequest({
  query_string: 'host',
  filter: { models: ['host'], instances: [] },
  page: { start: 0, limit: 10 }
}).valid, true)
assert.equal(validateFullTextRequest({
  query_string: 'host',
  filter: { models: ['host'], instances: ['host'] },
  page: { start: 0, limit: 101 }
}).valid, false)

const empty = mockFullTextResponse({
  query_string: '*does-not-exist*',
  filter: { models: ['host'], instances: ['host'] },
  page: { start: 0, limit: 10 }
}, 'empty')
assert.equal(isOk(empty), true)
assert.deepEqual(empty.data.data, EMPTY_RESULT)
const es500 = mockFullTextResponse(scoped, 'es-500')
assert.equal(es500.status, 500)
assert.equal(codeOf(es500), ERROR_CODES.ES_FIND_ERROR)
const unavailable = mockFullTextResponse(scoped, 'unavailable')
assert.equal(unavailable.status, 503)
assert.equal(codeOf(unavailable), ERROR_CODES.ES_CLIENT_NOT_INITIALIZED)
const forbidden = mockFullTextResponse(scoped, 'forbidden')
assert.equal(forbidden.status, 403)
assert.equal(codeOf(forbidden), ERROR_CODES.AUTH_FAILURE)
assert.deepEqual(responseSummary(forbidden), {
  status: 403,
  code: ERROR_CODES.AUTH_FAILURE,
  result: false,
  message: 'permission denied'
})

const matrix = runOfflineMatrix()
assert.equal(matrix.status, 'passed')
assert.equal(matrix.scenarios['fullTextSearch-off-no-request'].requested, false)
assert.equal(matrix.scenarios['empty-keyword-no-request'].requested, false)
assert.equal(matrix.scenarios['empty-model-inventory-no-request'].requested, false)
assert.equal(matrix.scenarios['page-filter-sub-resource'].requested, true)
assert.ok(matrix.requests.every((request) => request.method === 'POST' && request.path === API_PATH))
assert.ok(matrix.requests.some((request) => request.response.status === 500))
assert.ok(matrix.requests.some((request) => request.response.status === 503))
assert.ok(matrix.requests.some((request) => request.response.status === 403 && request.response.code === ERROR_CODES.AUTH_FAILURE))

const report = makeReport('passed', matrix)
assert.equal(report.reportKind, REPORT_KIND)
assert.equal(report.stages.offline, 'passed')
assert.equal(report.stages.esMonstache, 'blocked')
assert.equal(report.stages.mongoToEs, 'not-verified')
assert.equal(report.layers.offline.status, 'passed')
assert.equal(report.layers.esMonstache.status, 'blocked')
assert.equal(report.layers.mongoToEs.status, 'not-verified')
assert.deepEqual(report.contract.requestFields, [
  'query_string',
  'filter.models',
  'filter.instances',
  'page.start',
  'page.limit',
  'sub_resource'
])

process.stdout.write('G1 legacy full_text mock contract unit checks passed\n')
