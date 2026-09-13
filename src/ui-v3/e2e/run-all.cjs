// B46: structured regression runner. Keeps first failures, retry outcomes and environment fingerprint.
const path = require('path')
const fs = require('fs')
const { execFileSync, spawnSync } = require('child_process')

const e2eDir = path.resolve(__dirname)
const reportPath = process.env.UI_V3_REGRESSION_REPORT || '/tmp/ui-v3-regression-report.json'
const scripts = [
  'run-route-smoke.cjs', 'run-b5.cjs', 'run-b6.cjs', 'run-b7.cjs', 'run-b8.cjs', 'run-b9.cjs', 'run-b10.cjs', 'run-b11.cjs', 'run-b13.cjs', 'run-b14-column-config.cjs',
  'run-b15-batch-a.cjs', 'run-b16-batch-b.cjs', 'run-b17-batch-c.cjs', 'run-b18.cjs', 'run-b20.cjs',
  'run-b24.cjs', 'run-b25.cjs', 'run-b26.cjs', 'run-b27.cjs', 'run-b28.cjs', 'run-b29.cjs', 'run-b30.cjs', 'run-b31.cjs', 'run-b32.cjs', 'run-b33.cjs', 'run-b34.cjs', 'run-b35.cjs', 'run-field-template.cjs',
  'run-b38.cjs', 'run-b39.cjs', 'run-b40.cjs', 'run-b41.cjs', 'run-login.cjs', 'run-iam.cjs', 'run-core-domains.cjs', 'run-core-domains-mock.cjs', 'run-core-domains-errors.cjs', 'run-b45.cjs'
]

function command(command, args, fallback = null) {
  try { return execFileSync(command, args, { encoding: 'utf8', timeout: 10000 }).trim() || fallback } catch { return fallback }
}
function mongoStartedAt() { return command('docker', ['--context', 'colima-xwssd', 'inspect', 'cmdb-mongodb', '--format', '{{.State.StartedAt}}']) }
function servedBundle() {
  const html = command('curl', ['-fsS', 'http://localhost:8090/']) || ''
  return html.match(/index-[A-Za-z0-9_-]*\.js/)?.[0] || null
}
async function waitForQuietWindow() {
  const started = Date.now(); let last = mongoStartedAt(); let stableSince = last ? Date.now() : 0
  while (Date.now() - started < 90000) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const current = mongoStartedAt()
    if (!current) { stableSince = 0; continue }
    if (current !== last) { last = current; stableSince = Date.now(); continue }
    if (Date.now() - stableSince >= 12000) return { status: 'stable', waitedMs: Date.now() - started }
  }
  return { status: 'timeout', waitedMs: Date.now() - started }
}
function classifyFailure(output) {
  if (/ResizeObserver|Mongo|1199018|1199998|ECONNRESET|connection refused|quiet window/i.test(output)) return 'environment'
  if (/pageerror|console\.error/i.test(output)) return 'pageerror'
  if (/cleanup|清理/i.test(output)) return 'cleanup'
  if (/payload|契约|endpoint|路由|API|请求/i.test(output)) return 'contract'
  return 'assertion'
}
function runScript(script, attempt) {
  const startedAt = new Date().toISOString(); const started = Date.now()
  const result = spawnSync(process.execPath, [path.join(e2eDir, script)], { encoding: 'utf8', timeout: 600000 })
  const output = `${result.stdout || ''}${result.stderr || ''}`
  const status = result.status === 0 ? 'pass' : 'fail'
  return {
    attempt, status, exitCode: result.status ?? 1, signal: result.signal || null,
    startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - started,
    failureClass: status === 'pass' ? null : classifyFailure(output),
    outputTail: output.slice(-4000)
  }
}

;(async () => {
  const startedAt = new Date().toISOString(); const results = []
  let stopped = false
  for (const script of scripts) {
    const file = path.join(e2eDir, script)
    if (!fs.existsSync(file)) {
      results.push({ script, status: 'skipped', reason: 'script-not-found', attempts: [] })
      continue
    }
    const quiet = await waitForQuietWindow()
    console.log(`\n========== 运行 ${script} (mongo=${quiet.status}) ==========`)
    const first = runScript(script, 1)
    const item = { script, status: first.status, attempts: [first], quietWindow: quiet }
    if (first.status === 'fail') {
      console.log(`↻ ${script} 首跑失败(${first.failureClass}),自动重跑一次`)
      const quietRetry = await waitForQuietWindow()
      const second = runScript(script, 2)
      item.attempts.push(second); item.retryQuietWindow = quietRetry; item.status = second.status
    }
    results.push(item)
    console.log(item.status === 'pass' ? `✓ ${script} 通过` : `✗ ${script} 失败(停止)`)
    if (item.status === 'fail') { stopped = true; break }
  }
  const report = {
    schemaVersion: 1,
    runId: `${Date.now()}-${process.pid}`,
    startedAt, finishedAt: new Date().toISOString(),
    git: { commit: command('git', ['rev-parse', 'HEAD']), branch: command('git', ['branch', '--show-current']), dirty: Boolean(command('git', ['status', '--porcelain'])) },
    environment: { uiBaseUrl: process.env.UI_V3_BASE_URL || 'http://localhost:8090', servedBundle: servedBundle(), mongoStartedAt: mongoStartedAt(), node: process.version },
    runner: {
      scriptCount: scripts.length, executed: results.filter((r) => r.status !== 'skipped').length,
      passed: results.filter((r) => r.status === 'pass').length, failed: results.filter((r) => r.status === 'fail').length,
      skipped: results.filter((r) => r.status === 'skipped').length, retried: results.filter((r) => r.attempts.length > 1).length,
      stopped, firstFailurePreserved: results.some((r) => r.attempts.some((a) => a.attempt === 1 && a.status === 'fail'))
    },
    scripts: results
  }
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`\n报告已写入 ${reportPath}`)
  if (stopped) process.exitCode = 1
  else console.log('✓ 全部 E2E 通过')
})()
