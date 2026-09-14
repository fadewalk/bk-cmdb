// P50: real HostList Excel import contract and read-back.
const fs = require('fs')
const path = require('path')
const os = require('os')
const { createRequire } = require('module')
const { chromium } = require('./browser.cjs')

const requireLocal = createRequire(__filename)
const XLSX = requireLocal('../node_modules/xlsx')
const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const PREFIX = 'p50-physical-probe-'
const errors = []

function assert(condition, message) { if (!condition) throw new Error(message) }

async function api(page, method, url, body) {
  const target = url.startsWith('http') ? url : `${BASE}${url}`
  return page.evaluate(async ({ method, url, body }) => {
    const response = await fetch(url, {
      method,
      credentials: 'include',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    return { status: response.status, data: await response.json() }
  }, { method, url: target, body })
}

function resourceHosts(body) { return body?.data?.data?.info || body?.data?.info || body?.info || [] }

async function cleanup(page) {
  const response = await api(page, 'POST', '/api/v3/findmany/hosts/search/resource', { condition: [], page: { start: 0, limit: 200 } })
  for (const item of resourceHosts(response)) {
    const host = item.host || item
    if (String(host.bk_host_name || '').startsWith(PREFIX)) {
      await api(page, 'DELETE', '/api/v3/hosts/batch', { bk_host_id: String(host.bk_host_id), bk_supplier_account: '0' })
    }
  }
}

async function makeFixture() {
  const template = await (await fetch(`${BASE}/importtemplate/host`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).arrayBuffer()
  const workbook = XLSX.read(Buffer.from(template))
  const sheet = workbook.Sheets.host
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
  const fieldIds = rows[2]
  const row = Array(fieldIds.length).fill('')
  const set = (field, value) => { const index = fieldIds.indexOf(field); if (index < 0) throw new Error(`template field missing: ${field}`); row[index] = value }
  const hostName = `${PREFIX}${Date.now()}`
  set('bk_addressing', 'static'); set('bk_cloud_id', 'Default Area[0]'); set('bk_host_innerip', '192.0.2.44'); set('bk_host_name', hostName); set('bk_comment', 'P50 real HostList import fixture'); set('import_from', 'excel'); set('bk_os_name', 'Linux'); set('bk_cpu', '2'); set('bk_mem', '2048')
  const output = path.join(os.tmpdir(), `p50-host-${Date.now()}.xlsx`)
  workbook.Sheets.host = XLSX.utils.aoa_to_sheet(rows.slice(0, 6).concat([row]))
  XLSX.writeFile(workbook, output)
  return { output, hostName, ip: '192.0.2.44' }
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.route('**/*', (route) => { const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }; delete headers['if-none-match']; return route.continue({ headers }) })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  try {
    await page.goto(`${BASE}/#/resource/host`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForSelector('.host-page', { timeout: 15000 })
    await cleanup(page)
    const fixture = await makeFixture()
    const requests = []
    page.on('request', (request) => { if (request.url().endsWith('/hosts/import')) requests.push({ method: request.method(), headers: request.headers(), body: request.postData() || '' }) })
    await page.getByRole('button', { name: '导入主机' }).click()
    await page.locator('input[type=file]').setInputFiles(fixture.output)
    const op1 = page.waitForResponse((response) => response.url().endsWith('/hosts/import') && response.request().method() === 'POST', { timeout: 15000 })
    await page.getByRole('button', { name: '下一步' }).click()
    const op1Body = await op1.then((response) => response.json())
    assert(op1Body.result === true && Object.prototype.hasOwnProperty.call(op1Body.data || {}, 'association'), `op=1 response shape mismatch: ${JSON.stringify(op1Body)}`)
    const op2 = page.waitForResponse((response) => response.url().endsWith('/hosts/import') && response.request().method() === 'POST', { timeout: 15000 })
    await page.getByRole('button', { name: '导入', exact: true }).click()
    const op2Body = await op2.then((response) => response.json())
    assert(op2Body.result === true && op2Body.data?.success?.length, `op=2 failed: ${JSON.stringify(op2Body)}`)
    assert(requests.length >= 2 && requests.every((request) => request.headers['content-type']?.includes('multipart/form-data')), 'multipart request contract mismatch')
    assert(/"op"\s*:\s*1/.test(requests[0].body) && /"op"\s*:\s*2/.test(requests[1].body), 'op sequence mismatch')
    const readback = await api(page, 'POST', '/api/v3/findmany/hosts/search/resource', { condition: [{ bk_obj_id: 'host', fields: ['bk_host_id', 'bk_host_innerip', 'bk_host_name'], condition: [{ field: 'bk_host_innerip', operator: '$eq', value: fixture.ip }] }], page: { start: 0, limit: 20, sort: 'bk_host_id' } })
    const hit = resourceHosts(readback).map((item) => item.host || item).find((host) => host.bk_host_innerip === fixture.ip)
    assert(hit?.bk_host_name === fixture.hostName, `host read-back mismatch: ${JSON.stringify(hit)}`)
    console.log(`✓ HostList import op=1/op=2 and read-back passed host=${hit.bk_host_id}`)
  } catch (error) { console.error(`✗ P50 HostList import: ${error.message}`); process.exitCode = 1 } finally { await cleanup(page).catch((error) => { console.error(`✗ P50 cleanup: ${error.message}`); process.exitCode = 1 }); await browser.close() }
  if (errors.length) { console.error(`✗ page errors: ${errors.join('; ')}`); process.exitCode = 1 }
})()
