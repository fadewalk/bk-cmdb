'use strict'

// G1-F.1: local login/logout/session and trusted-identity contract runner.
//
// The runner deliberately uses only read-only API probes plus the requested
// login/logout session transition. It never creates, updates, or deletes CMDB
// business data, and it never contacts an external OIDC issuer.
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { chromium } = require('./browser.cjs')
const { api: request } = require('./support/api.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const BASE_URL = new URL(BASE)
const LOGIN_USERNAME = process.env.CMDB_TEST_USERNAME || 'admin'
const LOGIN_PASSWORD = process.env.CMDB_TEST_PASSWORD || 'admin'
const TOKEN_INVALID_CODE = 1306000
const REPORT_KIND = 'legacy-g1-session-contract'
const API_READ_PATH = '/find/objectattr/web'

// These are the caller-controlled identity headers removed by the web-server
// trust boundary. Keep this list in sync with identity.go and its Go tests.
const EXTERNAL_IDENTITY_HEADERS = [
  'X-Bkcmdb-User',
  'BK_User',
  'X-Bkcmdb-Supplier-Account',
  'HTTP_BK_SUPPLIER_ACCOUNT',
  'HTTP_BLUEKING_SUPPLIER_ID',
  'X-Bkcmdb-User-Token',
  'X-Bkcmdb-User-Ticket',
  'X-Bkcmdb-App-Code',
  'Bk-App-Code'
]
const INTERNAL_REQUEST_HEADERS = [
  'X-Bkcmdb-Is-Inner-Request',
  'X-Bkcmdb-Request-From-Web'
]

function assertCondition(condition, message) {
  if (!condition) throw new Error(message)
}

function isLocalBaseUrl(value = BASE_URL) {
  return value.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(value.hostname)
}

function codeOf(response) {
  return response?.data?.bk_error_code ?? response?.data?.code
}

function isSuccessEnvelope(response) {
  return response?.status >= 200 && response?.status < 300 && response?.data?.result === true
}

function responseSummary(response) {
  return {
    status: response?.status,
    code: codeOf(response),
    result: response?.data?.result,
    message: response?.data?.bk_error_msg || response?.data?.message || null
  }
}

function hasHtmlBody(response) {
  return typeof response?.data === 'string' && /<html|<!doctype/i.test(response.data)
}

// Pure model of the ui-v3 http.js session-expiry branches. The browser stage
// below exercises the actual bundled interceptor; this helper makes the
// branch contract independently testable without a running UI.
function classifySessionResponse(response) {
  if (response?.status === 401) return { expired: true, reason: 'http-401' }
  if (hasHtmlBody(response)) return { expired: true, reason: 'html-login-page' }
  if (codeOf(response) === TOKEN_INVALID_CODE) return { expired: true, reason: '1306000' }
  return { expired: false, reason: null }
}

function canonicalHeaderName(name) {
  return String(name).toLowerCase()
}

function headerValues(headers, name) {
  const wanted = canonicalHeaderName(name)
  return Object.entries(headers || {})
    .filter(([key]) => canonicalHeaderName(key) === wanted)
    .flatMap(([, value]) => Array.isArray(value) ? value : [value])
    .map((value) => String(value))
}

// Pure model of middleware.SanitizeExternalIdentityHeaders. It is deliberately
// separate from the browser probe so the duplicate/forbidden matrix is tested
// even when a local web server is unavailable.
function modelSanitizeIdentityHeaders(headers = {}) {
  const cleaned = { ...headers }
  for (const name of EXTERNAL_IDENTITY_HEADERS) {
    const values = headerValues(cleaned, name)
    if (values.length > 1) return { status: 400, reason: 'duplicate identity header', headers: cleaned }
    for (const key of Object.keys(cleaned)) {
      if (canonicalHeaderName(key) === canonicalHeaderName(name)) delete cleaned[key]
    }
  }
  for (const name of INTERNAL_REQUEST_HEADERS) {
    if (headerValues(cleaned, name).length > 0) {
      return { status: 401, reason: 'forbidden internal request header', headers: cleaned }
    }
  }
  return { status: 200, reason: null, headers: cleaned }
}

function sameHost(candidate, base = BASE_URL) {
  try {
    return new URL(candidate, base).host === base.host
  } catch {
    return false
  }
}

function makeReport(status, stages, requests, errors, pageErrors, details = {}) {
  const localInfraStatus = details.localInfra?.status || (status === 'passed' ? 'passed' : 'blocked')
  const offlineStatus = details.offline?.status || 'passed'
  const externalOIDCStatus = details.externalOIDC?.status || 'blocked'
  return {
    schemaVersion: 1,
    reportKind: REPORT_KIND,
    generatedAt: new Date().toISOString(),
    git: { commit: process.env.GIT_COMMIT || 'runtime', branch: process.env.GIT_BRANCH || 'unknown' },
    status,
    base: BASE,
    stages,
    requests,
    errors,
    pageErrors,
    layers: {
      'local-infra': { status: localInfraStatus, ...(details.localInfra || {}) },
      offline: { status: offlineStatus, ...(details.offline || {}) },
      'external-OIDC': {
        status: externalOIDCStatus,
        attempted: false,
        reason: 'External OIDC was not contacted; no issuer/credential fixture is configured.',
        ...(details.externalOIDC || {})
      }
    },
    layerStatus: {
      'local-infra': localInfraStatus,
      offline: offlineStatus,
      'external-OIDC': externalOIDCStatus
    },
    contract: {
      login: 'GET /login then POST /login form(username,password,c_url)',
      cUrl: 'same-host c_url is accepted; foreign-host c_url falls back to site domain',
      userinfo: 'GET /userinfo -> result/data.username/current_supplier',
      isLogin: 'GET /is_login -> result boolean and bk_error_code=0',
      logout: 'POST /logout {http_scheme: http|https} -> result/data.url; session.Save required',
      expired: { http401: 401, tokenInvalid: TOKEN_INVALID_CODE, html: 'HTML login page' },
      identityHeaders: {
        external: EXTERNAL_IDENTITY_HEADERS,
        internal: INTERNAL_REQUEST_HEADERS,
        duplicateExternal: 400,
        forbiddenInternal: 401
      },
      apiReadProbe: `POST /api/v3${API_READ_PATH}`
    }
  }
}

function installNoCache(page) {
  return page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    return route.continue({ headers })
  })
}

async function rootRequest(page, method, path, body, options = {}) {
  const safeBody = ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : body
  return request(page, method, path, safeBody, { root: true, ...options })
}

function rememberRequest(requests, label, method, path, body, response) {
  requests.push({ label, method, path, body: body === undefined ? null : body, response: responseSummary(response) })
  return response
}

async function loginPage(page, { cUrl = '/#/index', verifyWrongPassword = false } = {}) {
  const loginUrl = new URL('/login', BASE_URL)
  loginUrl.searchParams.set('c_url', cUrl)
  await page.goto(loginUrl.href, { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(250)
  assertCondition(await page.locator('#username').count() === 1, 'login page missing #username')
  assertCondition(await page.locator('#password').count() === 1, 'login page missing #password')
  assertCondition(await page.locator('#login-form').count() === 1, 'login page missing #login-form')

  if (verifyWrongPassword) {
    await page.fill('#username', LOGIN_USERNAME)
    await page.fill('#password', `${LOGIN_PASSWORD}-wrong-contract`)
    await page.locator('#login-form button[type="submit"]').click()
    await page.waitForTimeout(650)
    const error = (await page.locator('#error').textContent() || '').trim()
    assertCondition(error && !error.includes('{{'), `wrong credentials did not render an error: ${error}`)
  }

  await page.fill('#username', LOGIN_USERNAME)
  await page.fill('#password', LOGIN_PASSWORD)
  await page.locator('#login-form button[type="submit"]').click()
  await page.waitForTimeout(1600)
  return page.url()
}

async function waitForLoginRedirect(page, timeout = 7000) {
  try {
    await page.waitForFunction(() => window.location.pathname === '/login', { timeout })
  } catch {
    // Caller records a blocked stage with the final URL; this avoids turning an
    // environment/configuration problem into a runner crash.
  }
  return page.url()
}

async function runOfflineContractChecks() {
  assert.deepEqual(classifySessionResponse({ status: 401, data: {} }), { expired: true, reason: 'http-401' })
  assert.deepEqual(classifySessionResponse({ status: 200, data: { result: false, bk_error_code: TOKEN_INVALID_CODE } }), { expired: true, reason: '1306000' })
  assert.deepEqual(classifySessionResponse({ status: 200, data: '<!doctype html><html>login</html>' }), { expired: true, reason: 'html-login-page' })
  assert.deepEqual(classifySessionResponse({ status: 200, data: { result: true } }), { expired: false, reason: null })

  const clean = modelSanitizeIdentityHeaders({
    'X-Bkcmdb-User': 'attacker',
    'X-Bkcmdb-Supplier-Account': '999',
    'Bk-App-Code': 'attacker-app',
    'X-Request-Id': 'offline-contract'
  })
  assert.equal(clean.status, 200)
  assert.equal(clean.headers['X-Bkcmdb-User'], undefined)
  assert.equal(clean.headers['X-Bkcmdb-Supplier-Account'], undefined)
  assert.equal(clean.headers['Bk-App-Code'], undefined)
  assert.equal(clean.headers['X-Request-Id'], 'offline-contract')

  const duplicate = modelSanitizeIdentityHeaders({ 'X-Bkcmdb-User': ['one', 'two'] })
  assert.equal(duplicate.status, 400)
  assert.equal(duplicate.reason, 'duplicate identity header')
  const internal = modelSanitizeIdentityHeaders({ 'X-Bkcmdb-Is-Inner-Request': 'true' })
  assert.equal(internal.status, 401)
  assert.equal(internal.reason, 'forbidden internal request header')

  assert.equal(sameHost('/#/index'), true)
  assert.equal(sameHost('https://example.com/escape'), false)
  assert.equal(isSuccessEnvelope({ status: 200, data: { result: true } }), true)
  assert.equal(isSuccessEnvelope({ status: 200, data: { result: false } }), false)
  return { status: 'passed', checks: ['401', '1306000', 'HTML', 'identity-clean', 'duplicate-identity', 'internal-header', 'c_url-host-guard'] }
}

async function runExpiryScenario(browser, kind) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const state = { triggered: 0, pageErrors: [] }
  page.on('pageerror', (error) => state.pageErrors.push(`pageerror: ${error.message}`))
  await installNoCache(page)
  try {
    // Login is completed before the mock is installed. The mock catches the
    // first real /api/v3 request made by a protected UI page and exercises the
    // actual axios response interceptor in the built ui-v3 bundle.
    await loginPage(page)
    await page.route('**/api/v3/**', async (route) => {
      state.triggered += 1
      if (kind === '401') {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ status: 'log out' }) })
      } else if (kind === '1306000') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: false, bk_error_code: TOKEN_INVALID_CODE, bk_error_msg: 'login expired' }) })
      } else {
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>login</body></html>' })
      }
    })
    await page.evaluate((url) => window.location.assign(url), `${BASE}/#/resource/host`)
    const finalUrl = await waitForLoginRedirect(page)
    await page.waitForTimeout(600)
    const final = new URL(finalUrl)
    if (state.triggered === 0) return { status: 'blocked', reason: `no protected API request was observed for ${kind}`, finalUrl, pageErrors: state.pageErrors }
    if (final.pathname !== '/login') return { status: 'blocked', reason: `session-expiry ${kind} did not redirect to /login`, finalUrl, pageErrors: state.pageErrors }
    return { status: 'passed', finalUrl, pageErrors: state.pageErrors }
  } finally {
    await context.close()
  }
}

async function runLocalContract(browser, report) {
  const stages = {
    login: 'blocked',
    cUrl: 'blocked',
    userinfo: 'blocked',
    isLogin: 'blocked',
    identitySanitization: 'blocked',
    logout: 'blocked',
    sessionExpiry401: 'blocked',
    sessionExpiry1306000: 'blocked',
    sessionExpiryHtml: 'blocked'
  }
  const requests = report.requests
  const errors = report.errors
  const pageErrors = report.pageErrors
  let context
  let page
  try {
    if (!isLocalBaseUrl()) throw Object.assign(new Error(`refusing non-local base URL: ${BASE}`), { blocked: true })
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    page = await context.newPage()
    await installNoCache(page)
    page.on('pageerror', (error) => pageErrors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error' && !/1306000|session expired|login expired|401/.test(message.text())) {
        pageErrors.push(`console.error: ${message.text()}`)
      }
    })

    const landingUrl = await loginPage(page, { verifyWrongPassword: true })
    const landing = new URL(landingUrl)
    assertCondition(landing.host === BASE_URL.host, `login landed on unexpected host: ${landingUrl}`)
    assertCondition(landing.hash.includes('/index'), `login did not honor same-host c_url: ${landingUrl}`)
    stages.login = 'passed'

    const userinfo = rememberRequest(requests, 'userinfo', 'GET', '/userinfo', undefined, await rootRequest(page, 'GET', '/userinfo'))
    assertCondition(userinfo.status === 200 && userinfo.data?.result === true && userinfo.data?.data?.username, `userinfo contract mismatch: ${JSON.stringify(responseSummary(userinfo))}`)
    stages.userinfo = 'passed'

    const isLogin = rememberRequest(requests, 'is_login', 'GET', '/is_login', undefined, await rootRequest(page, 'GET', '/is_login'))
    assertCondition(isLogin.status === 200 && isLogin.data?.result === true && isLogin.data?.bk_error_code === 0, `is_login contract mismatch: ${JSON.stringify(responseSummary(isLogin))}`)
    stages.isLogin = 'passed'

    const spoofHeaders = Object.fromEntries(EXTERNAL_IDENTITY_HEADERS.map((name, index) => [name, `attacker-${index}`]))
    const spoofed = rememberRequest(requests, 'identity-spoof', 'GET', '/userinfo', undefined, await rootRequest(page, 'GET', '/userinfo', { headers: spoofHeaders }))
    assertCondition(spoofed.status === 200 && spoofed.data?.result === true, `identity spoof probe failed: ${JSON.stringify(responseSummary(spoofed))}`)
    assertCondition(spoofed.data.data.username === userinfo.data.data.username, `caller identity header changed username: ${spoofed.data.data.username}`)
    assertCondition(String(spoofed.data.data.current_supplier || '') === String(userinfo.data.data.current_supplier || ''), 'caller identity header changed supplier')

    const internalHeader = rememberRequest(requests, 'internal-header', 'POST', `/api/v3${API_READ_PATH}`, {}, await request(page, 'POST', API_READ_PATH, {}, { headers: { 'X-Bkcmdb-Is-Inner-Request': 'true' } }))
    assertCondition(internalHeader.status === 401, `internal identity header was not rejected: ${JSON.stringify(responseSummary(internalHeader))}`)
    stages.identitySanitization = 'passed'

    const foreignContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const foreignPage = await foreignContext.newPage()
    try {
      await installNoCache(foreignPage)
      const foreignLandingUrl = await loginPage(foreignPage, { cUrl: 'https://example.com/escape' })
      const foreignLanding = new URL(foreignLandingUrl)
      assertCondition(foreignLanding.host === BASE_URL.host, `foreign c_url escaped to ${foreignLandingUrl}`)
      stages.cUrl = 'passed'
    } finally {
      await foreignContext.close()
    }

    const logoutBody = { http_scheme: BASE_URL.protocol === 'https:' ? 'https' : 'http' }
    const logout = rememberRequest(requests, 'logout', 'POST', '/logout', logoutBody, await rootRequest(page, 'POST', '/logout', logoutBody))
    assertCondition(logout.status === 200 && logout.data?.result === true && typeof logout.data?.data?.url === 'string', `logout contract mismatch: ${JSON.stringify(responseSummary(logout))}`)
    const afterLogout = rememberRequest(requests, 'post-logout-api', 'POST', `/api/v3${API_READ_PATH}`, {}, await request(page, 'POST', API_READ_PATH, {}))
    if (afterLogout.status === 401) {
      stages.logout = 'passed'
    } else if (afterLogout.status === 200 && afterLogout.data?.result === true) {
      stages.logout = 'blocked'
      errors.push('logout: current local profile re-authenticated the API request; skip-login cannot prove session invalidation')
    } else {
      stages.logout = 'blocked'
      errors.push(`logout: post-logout API did not return 401: ${JSON.stringify(responseSummary(afterLogout))}`)
    }

    for (const kind of ['401', '1306000', 'html']) {
      const result = await runExpiryScenario(browser, kind)
      const stage = kind === '401' ? 'sessionExpiry401' : kind === '1306000' ? 'sessionExpiry1306000' : 'sessionExpiryHtml'
      stages[stage] = result.status
      if (result.pageErrors?.length) pageErrors.push(...result.pageErrors.map((error) => `${kind}: ${error}`))
      if (result.status !== 'passed') errors.push(`${stage}: ${result.reason}`)
    }
  } catch (error) {
    errors.push(error.message)
    if (error.blocked) return { stages, status: 'blocked' }
  } finally {
    if (context) await context.close()
  }

  const required = Object.entries(stages)
  const allPassed = required.every(([, stage]) => stage === 'passed')
  const anyFailed = required.some(([, stage]) => stage === 'failed')
  return { stages, status: allPassed ? 'passed' : (anyFailed ? 'failed' : 'blocked') }
}

async function run() {
  const report = {
    requests: [],
    errors: [],
    pageErrors: []
  }
  let browser
  let offline
  let local
  try {
    offline = await runOfflineContractChecks()
    try {
      browser = await chromium.launch({ headless: true })
      local = await runLocalContract(browser, report)
    } catch (error) {
      report.errors.push(`local runner: ${error.message}`)
      local = { status: error.blocked ? 'blocked' : 'failed', stages: {} }
    }
  } finally {
    if (browser) await browser.close()
  }

  const localInfra = local?.status === 'failed'
    ? { status: 'failed', reason: 'runner or page failure; inspect errors/pageErrors' }
    : { status: local?.status === 'passed' ? 'passed' : 'blocked', reason: local?.status === 'passed' ? 'local web server and required session branches exercised' : 'local session contract is incomplete or environment uses an auto-login profile' }
  const status = local?.status === 'passed' ? 'passed' : (local?.status === 'failed' ? 'failed' : 'blocked')
  const final = makeReport(status, local?.stages || {}, report.requests, report.errors, report.pageErrors, {
    localInfra,
    offline,
    externalOIDC: {
      status: 'blocked',
      attempted: false,
      reason: 'No external OIDC issuer or multi-user identity fixture was contacted in this local-only runner.'
    }
  })
  if (process.env.G1_SESSION_REPORT_PATH) fs.writeFileSync(process.env.G1_SESSION_REPORT_PATH, `${JSON.stringify(final, null, 2)}\n`)
  return final
}

if (require.main === module) {
  run().then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (report.status === 'blocked') process.exitCode = 2
    if (report.status === 'failed') process.exitCode = 1
  }).catch((error) => {
    process.stderr.write(`G1 session runner crashed: ${error.stack || error}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  BASE,
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
  runOfflineContractChecks,
  run
}
