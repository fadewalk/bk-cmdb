#!/usr/bin/env node

const assert = require('node:assert/strict')

;(async () => {
  const { renderSafeMarkdown, sortVersions, currentVersion, shouldAutoOpen } = await import('../src/utils/version-log.js')

  const versions = [
    { version: 'v1.9', time: '2026-01-01' },
    { version: 'v1.10', time: '2026-02-01', is_current: true },
    { version: 'v1.2', time: '2025-12-01' }
  ]
  assert.deepEqual(sortVersions(versions).map(item => item.version), ['v1.10', 'v1.9', 'v1.2'])
  assert.equal(currentVersion(versions), 'v1.10')
  assert.equal(shouldAutoOpen('v1.9', 'v1.10'), true)
  assert.equal(shouldAutoOpen('v1.10', 'v1.10'), false)

  const html = renderSafeMarkdown('# Release\n\n- **Safe**\n\n<script>alert(1)</script>\n\n[docs](https://example.com/docs)')
  assert.match(html, /<h1>Release<\/h1>/)
  assert.match(html, /<strong>Safe<\/strong>/)
  assert.ok(!html.includes('<script>'))
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /rel="noopener noreferrer"/)

  process.stdout.write('P1 version log unit checks passed\n')
})().catch(error => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1 })
