// B12: 回归 - 合并所有 E2E,按顺序跑,出现一个 fail 立即停下
const path = require('path')
const fs = require('fs')

const e2eDir = path.resolve(__dirname)
const scripts = ['run-route-smoke.cjs', 'run.cjs', 'run-b5.cjs', 'run-b6.cjs', 'run-b7.cjs', 'run-b8.cjs', 'run-b9.cjs', 'run-b10.cjs', 'run-b11.cjs', 'run-b13.cjs']

;(async () => {
  for (const s of scripts) {
    const p = path.join(e2eDir, s)
    if (!fs.existsSync(p)) { console.log(`- 跳过 ${s}(不存在)`); continue }
    console.log(`\n========== 运行 ${s} ==========`)
    try {
      const { execSync } = require('child_process')
      const out = execSync(`node ${p}`, { stdio: 'inherit' })
      console.log(`✓ ${s} 通过`)
    } catch (e) {
      console.log(`✗ ${s} 失败(已停)`)
      process.exit(1)
    }
  }
  console.log('\n✓ 全部 E2E 通过')
})()