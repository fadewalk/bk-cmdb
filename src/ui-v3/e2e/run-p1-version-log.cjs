#!/usr/bin/env node

const fs = require('node:fs')
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const REPORT_KIND = 'ui-replacement-p1-version-log'
const versions = [
  { version: 'v1.9', time: '2026-01-01', is_current: false },
  { version: 'v1.10', time: '2026-02-01', is_current: true },
  { version: 'v1.2', time: '2025-12-01', is_current: false }
]
const markdown = '# Release v1.10\n\n- **Improved** search\n\n<script>alert(1)</script>'

function ok(data) { return { result: true, code: 0, message: 'success', data } }
function error(code, message) { return { result: false, bk_error_code: code, bk_error_msg: message, data: null } }
function assert(condition, message) { if (!condition) throw new Error(message) }
function parseBody(route) { const raw = route.request().postData(); if (!raw) return undefined; try { return JSON.parse(raw) } catch { return raw } }
function safeList(data) { return Array.isArray(data) ? data : data?.info || [] }
function safeMarkdown(text) { return String(text).replace(/<script[\s\S]*?<\/script>/gi, '') }
function makeReport(status, scenarios, requests, errors, pageErrors) {
  return {
    schemaVersion: 1,
    reportKind: REPORT_KIND,
    generatedAt: new Date().toISOString(),
    status,
    scenarios,
    requests,
    errors,
    pageErrors,
    layers: { mock: { status: status === 'passed' ? 'passed' : 'failed' }, realBackend: { status: 'not-verified' }, external: { status: 'not-required' } },
    contract: { list: 'POST /findmany/changelog', detail: 'POST /find/changelog/detail {version}', empty: '暂无版本日志', security: 'Markdown is escaped before rendering' }
  }
}

async function run() {
  const scenarios = { list: 'pending', detail: 'pending', sortCurrent: 'pending', empty: 'pending', errorRetry: 'pending', xss: 'pending' }
  const requests = []
  const errors = []
  const pageErrors = []
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.route('**/*', route => { const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }; delete headers['if-none-match']; return route.continue({ headers }) })
    await page.route('**/userinfo', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: true, data: { username: 'version-test', chname: 'Version Test', current_supplier: '0' } }) }))
    let detailAttempts = 0
    let empty = false
    let failList = false
    await page.route('**/api/v3/**', async route => {
      const request = route.request(); const url = new URL(request.url()); const path = url.pathname.replace('/api/v3', ''); const body = parseBody(route)
      requests.push({ method: request.method(), path, body: body || null })
      if (path === '/findmany/changelog' && request.method() === 'POST') {
        if (failList) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify(error(500, 'changelog unavailable')) })
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(empty ? { count: 0, info: [] } : { count: versions.length, info: versions })) })
      }
      if (path === '/find/changelog/detail' && request.method() === 'POST') {
        detailAttempts += 1
        if (detailAttempts === 1 && process.env.VERSION_LOG_RETRY === '1') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify(error(500, 'detail unavailable')) })
        assert(body?.version === 'v1.10', `detail payload mismatch: ${JSON.stringify(body)}`)
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok(markdown)) })
      }
      return route.continue()
    })
    await page.goto(`${BASE}/#/platform/version-log`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(700)
    assert((await page.locator('.version-list').textContent()).includes('v1.10'), 'version list missing current version')
    scenarios.list = 'passed'
    scenarios.sortCurrent = (await page.locator('.version-item').first().textContent()).includes('v1.10') ? 'passed' : 'failed'
    await page.locator('.version-item').first().click()
    await page.waitForTimeout(300)
    assert((await page.locator('.markdown-container').textContent()).includes('Release v1.10'), 'version detail missing')
    scenarios.detail = 'passed'
    scenarios.xss = !(await page.locator('.markdown-container').innerHTML()).includes('<script>') ? 'passed' : 'failed'
    empty = true
    await context.close()

    const emptyContext = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const emptyPage = await emptyContext.newPage()
    await emptyPage.route('**/userinfo', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: true, data: { username: 'empty', current_supplier: '0' } }) }))
    await emptyPage.route('**/api/v3/findmany/changelog', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: 0, info: [] })) }))
    await emptyPage.goto(`${BASE}/#/platform/version-log`, { waitUntil: 'domcontentloaded', timeout: 30000 }); await emptyPage.waitForTimeout(500)
    scenarios.empty = (await emptyPage.locator('.el-empty').count()) > 0 ? 'passed' : 'failed'; await emptyContext.close()

    const errorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const errorPage = await errorContext.newPage()
    let retried = false
    await errorPage.route('**/userinfo', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ result: true, data: { username: 'error', current_supplier: '0' } }) }))
    await errorPage.route('**/api/v3/findmany/changelog', async route => { if (!retried) { retried = true; return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify(error(500, 'unavailable')) }) }; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ok({ count: versions.length, info: versions })) }) })
    await errorPage.goto(`${BASE}/#/platform/version-log`, { waitUntil: 'domcontentloaded', timeout: 30000 }); await errorPage.waitForTimeout(500)
    assert((await errorPage.locator('.state-alert').count()) > 0, 'error state missing'); await errorPage.getByRole('button', { name: '重试' }).click(); await errorPage.waitForTimeout(500)
    scenarios.errorRetry = (await errorPage.locator('.version-list').textContent()).includes('v1.10') ? 'passed' : 'failed'; await errorContext.close()
    await browser.close()
  } catch (error) { errors.push(error.message); if (browser) await browser.close() }
  const status = Object.values(scenarios).every(value => value === 'passed') ? 'passed' : 'failed'
  return makeReport(status, scenarios, requests, errors, pageErrors)
}

if (require.main === module) run().then(report => { const output = JSON.stringify(report, null, 2); if (process.env.P1_VERSION_LOG_REPORT_PATH) fs.writeFileSync(process.env.P1_VERSION_LOG_REPORT_PATH, `${output}\n`); process.stdout.write(`${output}\n`); if (report.status !== 'passed') process.exitCode = 1 }).catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { versions, markdown, safeMarkdown, makeReport, run }
