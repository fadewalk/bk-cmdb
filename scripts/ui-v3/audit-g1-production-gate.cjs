#!/usr/bin/env node

// G.2: read-only production security/release gate audit.
// It never changes configuration, restarts services, or writes CMDB data.
const fs = require('node:fs')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const CONTEXT = process.env.G1_GATE_DOCKER_CONTEXT || 'colima-xwssd'
const CONTAINER = process.env.G1_GATE_CONTAINER || 'cmdb'

function read(file) {
  try { return fs.readFileSync(path.join(ROOT, file), 'utf8') } catch { return '' }
}
function hash(file) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex') } catch { return null }
}
function command(command, args) {
  try { return { ok: true, stdout: execFileSync(command, args, { encoding: 'utf8', timeout: 15000 }).trim() } } catch (error) { return { ok: false, stdout: '', error: error.message } }
}
function evidenceClassFor(name) {
  if (/runtime|port exposure|profile matches|script matches|non-root|rootfs|capabilities/i.test(name)) return 'isolated-runtime'
  if (/OIDC|skip-login|TLS verification|secret/i.test(name)) return 'source'
  if (/CSRF|SBOM|backup/i.test(name)) return 'external-infra'
  return 'source'
}
function check(name, passed, detail, evidence = [], evidenceClass = evidenceClassFor(name), requiredForRelease = true) {
  return { name, status: passed === true ? 'passed' : 'blocked', evidenceClass, requiredForRelease, detail, evidence }
}
function has(text, pattern) { return pattern.test(text) }
function inspectContainers() {
  const result = command('docker', ['--context', CONTEXT, 'inspect', CONTAINER, 'cmdb-mongodb', 'cmdb-redis', 'cmdb-zookeeper'])
  if (!result.ok) return []
  try { return JSON.parse(result.stdout) } catch { return [] }
}
function getContainer(containers, name) { return containers.find(item => (item.Name || '').replace(/^\//, '') === name) }
function env(container, key) { return (container?.Config?.Env || []).find(value => value.startsWith(`${key}=`))?.slice(key.length + 1) || null }

function audit() {
  const checks = []
  const web = read('deploy/standalone/configs/web.yaml')
  const common = read('deploy/standalone/configs/common.yaml')
  const compose = read('deploy/standalone/docker-compose.yml')
  const security = read('docs/architecture/standalone-security-boundary.md')
  const reliability = read('docs/architecture/standalone-reliability-runbook.md')
  const containers = inspectContainers()
  const cmdb = getContainer(containers, CONTAINER)
  const portBindings = cmdb?.HostConfig?.PortBindings?.['8090/tcp'] || []
  const externalPort = portBindings.some(binding => ['', '0.0.0.0', '::'].includes(binding.HostIp))
  const profile = env(cmdb, 'STANDALONE_PROFILE')
  const cloudProcess = command('docker', ['--context', CONTEXT, 'exec', CONTAINER, 'sh', '-lc', 'ps -eo pid=,args= | grep -E "[c]mdb_cloudserver( |$)" || true'])
  const cloudProbeOk = cloudProcess.ok
  const cloudRunning = cloudProbeOk && Boolean(cloudProcess.stdout)
  const runHash = command('docker', ['--context', CONTEXT, 'exec', CONTAINER, 'sh', '-lc', 'sha256sum /run.sh 2>/dev/null | cut -d" " -f1'])
  const checkoutRunHash = hash('deploy/standalone/run.sh')

  checks.push(check('source security boundary documented', security.length > 0, security ? 'security boundary document present' : 'document missing', ['docs/architecture/standalone-security-boundary.md']))
  checks.push(check('source reliability runbook documented', reliability.length > 0, reliability ? 'reliability runbook present' : 'document missing', ['docs/architecture/standalone-reliability-runbook.md']))
  checks.push(check('OIDC enabled in checkout', has(web + common, /oidc[\s\S]{0,200}enabled:\s*true/i), 'checkout configuration must enable external OIDC for production', ['deploy/standalone/configs/web.yaml', 'deploy/standalone/configs/common.yaml']))
  checks.push(check('skip-login disabled in checkout', !has(web + common, /skip-login|skip_login/i), 'skip-login must not be enabled for production', ['deploy/standalone/configs/web.yaml', 'deploy/standalone/configs/common.yaml']))
  checks.push(check('TLS verification is strict', !has(web + common + compose, /insecureSkipVerify\s*:\s*true|insecure_skip_verify\s*:\s*true/i), 'insecure TLS verification remains configured or not explicitly disabled', ['deploy/standalone/configs/web.yaml', 'deploy/standalone/configs/common.yaml']))
  checks.push(check('external port exposure blocked', !externalPort, JSON.stringify(portBindings), ['docker inspect runtime']))
  checks.push(check('runtime profile matches expected process set', cloudProbeOk && !(profile === 'core' && cloudRunning), JSON.stringify({ profile, probeOk: cloudProbeOk, cloudRunning, process: cloudProcess.stdout }), ['docker inspect/runtime process probe'], 'isolated-runtime'))
  checks.push(check('runtime script matches checkout', Boolean(checkoutRunHash && runHash.stdout && checkoutRunHash === runHash.stdout), JSON.stringify({ checkoutRunHash, runtimeHash: runHash.stdout || null }), ['deploy/standalone/run.sh', 'docker exec /run.sh']))
  checks.push(check('container is non-root', cmdb?.Config?.User && cmdb.Config.User !== '0' && cmdb.Config.User !== 'root', cmdb?.Config?.User || 'default/root', ['docker inspect runtime']))
  checks.push(check('readonly rootfs enabled', cmdb?.HostConfig?.ReadonlyRootfs === true, String(cmdb?.HostConfig?.ReadonlyRootfs), ['docker inspect runtime']))
  checks.push(check('capabilities dropped', Array.isArray(cmdb?.HostConfig?.CapDrop) && cmdb.HostConfig.CapDrop.length > 0, JSON.stringify(cmdb?.HostConfig?.CapDrop || null), ['docker inspect runtime']))
  checks.push(check('session/DB/Redis/ZK secrets are externalized', false, 'external secret manager/rotation evidence required; source keyword presence is not proof', ['external-infra evidence required'], 'external-infra'))
  checks.push(check('CSRF/cookie hardening documented', false, 'runtime HTTPS cookie/CSRF evidence required', ['external-infra evidence required'], 'external-infra'))
  checks.push(check('SBOM/signature/provenance documented', false, 'artifact SBOM/signature/provenance evidence required', ['external-infra evidence required'], 'external-infra'))
  checks.push(check('backup/restore documented', false, 'isolated restore drill and production PITR evidence required', ['external-infra evidence required'], 'external-infra'))
  checks.push(check('dirty worktree blocks clean release', command('git', ['status', '--porcelain']).stdout === '', 'working tree must be clean for release gate', ['git status --porcelain']))

  const blocked = checks.filter(item => item.status === 'blocked')
  return {
    schemaVersion: 1,
    reportKind: 'g1-production-security-gate',
    generatedAt: new Date().toISOString(),
    status: blocked.length ? 'blocked' : 'passed',
    readOnly: true,
    environment: { dockerContext: CONTEXT, container: CONTAINER, profile, externalPort, checkoutRunHash, runtimeRunHash: runHash.stdout || null },
    checks,
    blockers: blocked.map(item => `${item.name}: ${item.detail}`),
    releaseDecision: blocked.length ? 'do not release; do not retire legacy src/ui' : 'eligible for next review only; external evidence still required'
  }
}

if (require.main === module) {
  const report = audit()
  const output = JSON.stringify(report, null, 2)
  if (process.env.G1_PRODUCTION_GATE_REPORT_PATH) fs.writeFileSync(process.env.G1_PRODUCTION_GATE_REPORT_PATH, `${output}\n`)
  process.stdout.write(`${output}\n`)
  if (report.status !== 'passed') process.exitCode = 2
}

module.exports = { audit, check }
