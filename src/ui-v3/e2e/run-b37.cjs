#!/usr/bin/env node
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')

const root = path.resolve(__dirname, '../../..')
const audit = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/ui-v3/audit-parity.cjs')], { cwd: root }))

assert.equal(audit.gates.fixedIdentityHeadersRemoved, true, 'v3 HTTP client must not send fixed identity headers')
assert.ok(audit.fixedIdentityHits.length > 0, 'audit should expose remaining fixed identity/security defaults as evidence')

console.log(JSON.stringify({
  batch: 'B37',
  status: '依赖阻塞',
  checks: {
    auditRuns: true,
    fixedIdentityEvidenceCaptured: audit.fixedIdentityHits.length,
    realIdpSessionE2E: 'blocked: no external IdP or multi-user fixture configured',
    productionGate: 'blocked: development standalone profile remains localhost-only'
  }
}, null, 2))
