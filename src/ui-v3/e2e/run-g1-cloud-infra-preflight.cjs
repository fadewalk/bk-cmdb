#!/usr/bin/env node

const crypto = require('node:crypto')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

const ROOT = require('node:path').resolve(__dirname, '../../..')
const CONTEXT = process.env.G1_CLOUD_DOCKER_CONTEXT || 'colima-xwssd'
const CONTAINER = process.env.G1_CLOUD_CONTAINER || 'cmdb'
const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'

function run(command, args, options = {}) {
  try {
    return { ok: true, stdout: execFileSync(command, args, { encoding: 'utf8', timeout: 15000, ...options }).trim() }
  } catch (error) {
    return { ok: false, stdout: '', error: error.message }
  }
}

function sha256(file) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') } catch { return null }
}

function check(condition, name, detail) {
  return { name, status: condition ? 'passed' : 'blocked', detail }
}

function dockerInspect() {
  const result = run('docker', ['--context', CONTEXT, 'inspect', CONTAINER, 'cmdb-mongodb', 'cmdb-redis', 'cmdb-zookeeper'])
  if (!result.ok) return { containers: [], error: result.error }
  try { return { containers: JSON.parse(result.stdout) } } catch (error) { return { containers: [], error: error.message } }
}

function containerByName(containers, name) {
  return containers.find(container => (container.Name || '').replace(/^\//, '') === name)
}

function envValue(container, key) {
  const env = container?.Config?.Env || []
  const value = env.find(item => item.startsWith(`${key}=`))
  return value ? value.slice(key.length + 1) : null
}

async function httpCheck(path) {
  try {
    const response = await fetch(`${BASE}${path}`, { redirect: 'manual' })
    const text = await response.text()
    let body = null
    try { body = JSON.parse(text) } catch { /* retain non-JSON response */ }
    return { status: response.status, ok: response.status >= 200 && response.status < 300, result: body?.result, body }
  } catch (error) {
    return { status: null, ok: false, error: error.message }
  }
}

async function runPreflight() {
  const checks = []
  const inspection = dockerInspect()
  const cmdb = containerByName(inspection.containers, CONTAINER)
  const mongo = containerByName(inspection.containers, 'cmdb-mongodb')
  const redis = containerByName(inspection.containers, 'cmdb-redis')
  const zookeeper = containerByName(inspection.containers, 'cmdb-zookeeper')

  checks.push(check(Boolean(cmdb), 'cmdb container exists', inspection.error || CONTAINER))
  checks.push(check(cmdb?.State?.Status === 'running', 'cmdb container running', cmdb?.State?.Status || 'missing'))
  checks.push(check(Boolean(mongo), 'Mongo container exists', 'cmdb-mongodb'))
  checks.push(check(mongo?.State?.Health?.Status === 'healthy', 'Mongo healthy', mongo?.State?.Health?.Status || 'unknown'))
  checks.push(check(Boolean(redis), 'Redis container exists', 'cmdb-redis'))
  checks.push(check(redis?.State?.Health?.Status === 'healthy', 'Redis healthy', redis?.State?.Health?.Status || 'unknown'))
  checks.push(check(Boolean(zookeeper), 'ZooKeeper container exists', 'cmdb-zookeeper'))
  checks.push(check(zookeeper?.State?.Status === 'running', 'ZooKeeper running', zookeeper?.State?.Status || 'missing'))

  const portBindings = cmdb?.HostConfig?.PortBindings?.['8090/tcp'] || []
  const externallyBound = portBindings.some(binding => binding.HostIp === '0.0.0.0' || binding.HostIp === '::' || binding.HostIp === '')
  checks.push(check(!externallyBound, 'web port is loopback-bound', JSON.stringify(portBindings)))

  const profile = envValue(cmdb, 'STANDALONE_PROFILE')
  const processProbe = run('docker', ['--context', CONTEXT, 'exec', CONTAINER, 'sh', '-lc', 'ps -eo pid=,args= | grep -E "[c]mdb_cloudserver( |$)" || true'])
  const cloudRunning = processProbe.ok && Boolean(processProbe.stdout)
  checks.push(check(!(profile === 'core' && cloudRunning), 'core profile does not run cloudserver', JSON.stringify({ profile, cloudRunning, process: processProbe.stdout })))

  const checkoutRun = `${ROOT}/deploy/standalone/run.sh`
  const checkoutHash = sha256(checkoutRun)
  const runtimeHashResult = run('docker', ['--context', CONTEXT, 'exec', CONTAINER, 'sh', '-lc', 'sha256sum /run.sh 2>/dev/null | cut -d" " -f1'])
  const runtimeHash = runtimeHashResult.stdout || null
  checks.push(check(Boolean(checkoutHash && runtimeHash && checkoutHash === runtimeHash), 'runtime run.sh matches checkout', JSON.stringify({ checkoutHash, runtimeHash })))

  const web = await httpCheck('/')
  checks.push(check(web.ok, 'web root ready', JSON.stringify(web)))
  const health = await httpCheck('/healthz')
  checks.push(check(health.ok && health.result === true, 'API healthz ready', JSON.stringify({ probePath: '/healthz', ...health })))

  const blocked = checks.filter(item => item.status === 'blocked')
  return {
    schemaVersion: 1,
    reportKind: 'legacy-g1-cloud-infra-preflight',
    generatedAt: new Date().toISOString(),
    status: blocked.length ? 'blocked' : 'ready',
    writeSafety: 'no database/API writes performed',
    environment: { base: BASE, dockerContext: CONTEXT, container: CONTAINER, profile },
    checks,
    blockedReasons: blocked.map(item => `${item.name}: ${item.detail}`),
    nextAction: blocked.length ? 'Use a dedicated isolated runtime; do not run real cloud CRUD against the current shared instance.' : 'Run the isolated C.1 CRUD runner with unique markers and finally cleanup.'
  }
}

if (require.main === module) {
  runPreflight().then(report => {
    const output = JSON.stringify(report, null, 2)
    if (process.env.G1_CLOUD_PREFLIGHT_REPORT_PATH) fs.writeFileSync(process.env.G1_CLOUD_PREFLIGHT_REPORT_PATH, `${output}\n`)
    process.stdout.write(`${output}\n`)
    if (report.status !== 'ready') process.exitCode = 2
  }).catch(error => { process.stderr.write(`C.1 preflight failed: ${error.stack || error}\n`); process.exitCode = 1 })
}

module.exports = { check, envValue, containerByName, runPreflight }
