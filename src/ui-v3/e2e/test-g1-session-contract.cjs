'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  BASE_URL,
  TOKEN_INVALID_CODE,
  REPORT_KIND,
  EXTERNAL_IDENTITY_HEADERS,
  INTERNAL_REQUEST_HEADERS,
  codeOf,
  isSuccessEnvelope,
  responseSummary,
  classifySessionResponse,
  modelSanitizeIdentityHeaders,
  sameHost,
  makeReport,
  runOfflineContractChecks
} = require('./run-g1-session-contract.cjs')

const ROOT = path.resolve(__dirname, '../../..')
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8')

// Response/envelope helpers are intentionally pure and must handle both the
// legacy code field and the web-server HTTP status branches.
assert.equal(codeOf({ status: 200, data: { result: true, bk_error_code: 0 } }), 0)
assert.equal(codeOf({ status: 200, data: { result: false, code: TOKEN_INVALID_CODE } }), TOKEN_INVALID_CODE)
assert.equal(isSuccessEnvelope({ status: 200, data: { result: true } }), true)
assert.equal(isSuccessEnvelope({ status: 401, data: { result: false } }), false)
assert.deepEqual(responseSummary({ status: 401, data: { result: false, bk_error_msg: 'log out' } }), {
  status: 401,
  code: undefined,
  result: false,
  message: 'log out'
})

assert.deepEqual(classifySessionResponse({ status: 401, data: { status: 'log out' } }), {
  expired: true,
  reason: 'http-401'
})
assert.deepEqual(classifySessionResponse({
  status: 200,
  data: { result: false, bk_error_code: TOKEN_INVALID_CODE }
}), { expired: true, reason: '1306000' })
assert.deepEqual(classifySessionResponse({
  status: 200,
  data: '<!doctype html><html><body>login</body></html>'
}), { expired: true, reason: 'html-login-page' })
assert.deepEqual(classifySessionResponse({ status: 200, data: { result: true } }), {
  expired: false,
  reason: null
})

const spoofed = modelSanitizeIdentityHeaders({
  'x-bkcmdb-user': 'attacker',
  'BK_User': 'legacy-attacker',
  'X-Bkcmdb-Supplier-Account': '999',
  'HTTP_BK_SUPPLIER_ACCOUNT': '999',
  'X-Bkcmdb-App-Code': 'evil-app',
  'Bk-App-Code': 'evil-app',
  'X-Request-Id': 'keep-me'
})
assert.equal(spoofed.status, 200)
assert.equal(spoofed.headers['x-bkcmdb-user'], undefined)
assert.equal(spoofed.headers.BK_User, undefined)
assert.equal(spoofed.headers['X-Bkcmdb-Supplier-Account'], undefined)
assert.equal(spoofed.headers.HTTP_BK_SUPPLIER_ACCOUNT, undefined)
assert.equal(spoofed.headers['X-Bkcmdb-App-Code'], undefined)
assert.equal(spoofed.headers['Bk-App-Code'], undefined)
assert.equal(spoofed.headers['X-Request-Id'], 'keep-me')

const duplicate = modelSanitizeIdentityHeaders({ 'X-Bkcmdb-User': ['one', 'two'] })
assert.equal(duplicate.status, 400)
assert.equal(duplicate.reason, 'duplicate identity header')
const duplicateCaseInsensitive = modelSanitizeIdentityHeaders({ 'x-bkcmdb-user': ['one', 'two'] })
assert.equal(duplicateCaseInsensitive.status, 400)
const internal = modelSanitizeIdentityHeaders({ 'x-bkcmdb-is-inner-request': 'true' })
assert.equal(internal.status, 401)
assert.equal(internal.reason, 'forbidden internal request header')
const internalWeb = modelSanitizeIdentityHeaders({ 'X-Bkcmdb-Request-From-Web': 'true' })
assert.equal(internalWeb.status, 401)

assert.ok(EXTERNAL_IDENTITY_HEADERS.includes('X-Bkcmdb-User'))
assert.ok(EXTERNAL_IDENTITY_HEADERS.includes('BK_User'))
assert.ok(EXTERNAL_IDENTITY_HEADERS.includes('Bk-App-Code'))
assert.deepEqual(INTERNAL_REQUEST_HEADERS, ['X-Bkcmdb-Is-Inner-Request', 'X-Bkcmdb-Request-From-Web'])
assert.equal(sameHost('/#/index'), true)
assert.equal(sameHost('https://example.com/escape'), false)
assert.equal(sameHost(`${BASE_URL.origin}/#/index`), true)

const report = makeReport('blocked', { logout: 'blocked' }, [], ['session incomplete'], [], {
  localInfra: { status: 'blocked', reason: 'skip-login profile' },
  offline: { status: 'passed', checks: ['1306000'] },
  externalOIDC: { status: 'blocked', attempted: false }
})
assert.equal(report.reportKind, REPORT_KIND)
assert.equal(report.contract.expired.tokenInvalid, TOKEN_INVALID_CODE)
assert.equal(report.layers['local-infra'].status, 'blocked')
assert.equal(report.layers.offline.status, 'passed')
assert.equal(report.layers['external-OIDC'].status, 'blocked')
assert.equal(report.layerStatus['external-OIDC'], 'blocked')
assert.equal(report.contract.logout, 'POST /logout {http_scheme: http|https} -> result/data.url; session.Save required')

// Static contract guards ensure this runner continues to describe the exact
// implementation it verifies, without changing application code in F.1.
const sessionSource = read('src/ui-v3/src/stores/session.js')
assert.match(sessionSource, /axios\.get\('\/userinfo'/)
assert.match(sessionSource, /axios\.post\('\/logout'/)
assert.match(sessionSource, /this\.clear\(\)/)
assert.match(sessionSource, /redirectToLogin/)

const httpSource = read('src/ui-v3/src/api/http.js')
assert.match(httpSource, /baseURL:\s*'\/api\/v3'/)
assert.match(httpSource, /withCredentials:\s*true/)
assert.match(httpSource, /TOKEN_INVALID_CODE\s*=\s*1306000/)
assert.match(httpSource, /error\.response\?\.status\s*===\s*401/)
assert.match(httpSource, /cmdb-session-expired/)
assert.doesNotMatch(httpSource, /['"]X-Bkcmdb-(?:User|Supplier-Account|App-Code)['"]\s*:/)

const legacyLogin = read('src/web_server/service/login.go')
assert.match(legacyLogin, /session\.Clear\(\)/)
assert.match(legacyLogin, /session\.Save\(\)/)
assert.match(legacyLogin, /c\.Query\("c_url"\)/)
assert.match(legacyLogin, /parsedURL\.Host\s*==\s*s\.Config\.Site\.ParsedDomainUrl\.Host/)

const identitySource = read('src/web_server/middleware/identity.go')
assert.match(identitySource, /duplicate identity header/)
assert.match(identitySource, /forbidden internal request header/)
assert.match(identitySource, /header\.IsInnerReqHeader/)
assert.match(identitySource, /header\.ReqFromWebHeader/)

const apiKeySource = read('src/web_server/middleware/api_key.go')
assert.match(apiKeySource, /standaloneAPIKeyHeader\s*=\s*"X-API-Key"/)
assert.match(apiKeySource, /ConstantTimeCompare/)
assert.match(apiKeySource, /setStandaloneAPIHeaders/)

const existingGoHeaderTest = read('src/web_server/middleware/api_key_test.go')
assert.match(existingGoHeaderTest, /TestSanitizeExternalIdentityHeaders/)
assert.match(existingGoHeaderTest, /duplicate status = %d/)

runOfflineContractChecks().then((offline) => {
  assert.equal(offline.status, 'passed')
  process.stdout.write('G1 session contract unit checks passed\n')
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
})
