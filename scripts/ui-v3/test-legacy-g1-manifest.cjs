#!/usr/bin/env node

const assert = require('node:assert/strict')
const { normalizePath, endpointPath, routeMatch } = require('./legacy-g1-manifest.cjs')
const { validate, summarize } = require('./validate-legacy-g1-manifest.cjs')

assert.equal(normalizePath('find/inst/object/${objId}'), '/find/inst/object/*')
assert.equal(endpointPath('${window.API_HOST}object/importmany'), 'object/importmany')

const backend = {
  routes: [{ path: '/find/hosts/*', rawPath: '/find/hosts/{id}', file: 'fixture.go', line: 10 }],
  genericProxy: false
}
assert.equal(routeMatch('find/hosts/42', backend).kind, 'direct-route-match')
assert.equal(routeMatch('missing/path', backend).kind, 'unmatched')
assert.equal(routeMatch('missing/path', { routes: [], genericProxy: true }).kind, 'generic-proxy-only')

const record = {
  source: { kind: 'vuex-action', file: 'fixture.js', line: 1 },
  callers: [{ file: 'fixture.vue', line: 3, kind: 'vuex-dispatch' }],
  http: { method: 'POST', endpointTemplate: 'find/hosts', routeMatch: { kind: 'direct-route-match' } },
  request: {},
  response: { unknowns: ['runtime response keys require contract test'] },
  permissions: {},
  errors: {},
  evidence: { current: ['static source extraction only'], required: ['runtime trace'] },
  status: '仅静态',
  externalDependencies: []
}
const manifest = {
  schemaVersion: 1,
  reportKind: 'legacy-g1-contract-manifest',
  generatedAt: new Date().toISOString(),
  git: { commit: 'fixture', branch: 'test', dirty: false },
  counts: {},
  records: [record],
  notes: []
}
assert.deepEqual(validate(manifest), [])
assert.equal(summarize(manifest).recordCount, 1)
assert.equal(summarize(manifest).validStaticStatusesOnly, true)
assert.ok(validate({}).length > 0)
assert.ok(validate({ ...manifest, records: [{ ...record, status: 'invalid' }] }).some(error => error.includes('invalid status')))

process.stdout.write('legacy G1 manifest unit checks passed\n')
