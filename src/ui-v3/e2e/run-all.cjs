// B12: 回归 - 合并所有 E2E,按顺序跑,出现一个 fail 立即停下
const path = require('path')
const fs = require('fs')

const e2eDir = path.resolve(__dirname)
const scripts = [
  'run-route-smoke.cjs', 'run.cjs', 'run-b5.cjs', 'run-b6.cjs', 'run-b7.cjs', 'run-b8.cjs',
  'run-b9.cjs', 'run-b10.cjs', 'run-b11.cjs', 'run-b13.cjs', 'run-b14-column-config.cjs',
  // A/B/C 批(动态分组/云账户、主机/业务批量编辑、进程模板 bind_info)与 B18/B20 资源模型域、转移确认页
  'run-b15-batch-a.cjs', 'run-b16-batch-b.cjs', 'run-b17-batch-c.cjs', 'run-b18.cjs', 'run-b20.cjs',
  // B24 首页高级筛选;B25 假端点修复/新建关联/模板整页编辑;B26 集群模板同步差异页/业务同步逐进程差异
  'run-b24.cjs', 'run-b25.cjs', 'run-b26.cjs'
]

// cmdb-mongodb 被外部周期性重启(约 1 次/分钟),写接口在重启窗口会失败。
// 每个脚本开跑前等待 mongo 进入"静默窗口"(StartedAt 连续 12s 不变,即刚过重启点),从周期头部跑完整个脚本。
const { execSync: exec } = require('child_process')
function mongoStartedAt() {
  try {
    return exec(`docker --context colima-xwssd inspect cmdb-mongodb --format '{{.State.StartedAt}}'`, { timeout: 5000 }).toString().trim()
  } catch { return null }
}
async function waitForQuietWindow() {
  const t0 = Date.now()
  let last = mongoStartedAt()
  let stableSince = last ? Date.now() : 0
  while (Date.now() - t0 < 90000) {
    await new Promise((r) => setTimeout(r, 3000))
    const cur = mongoStartedAt()
    if (!cur) { stableSince = 0; continue }
    if (cur !== last) { last = cur; stableSince = Date.now(); continue }
    if (Date.now() - stableSince >= 12000) return
  }
  console.log('- 静默窗口等待超时(90s),照常尝试')
}

;(async () => {
  for (const s of scripts) {
    const p = path.join(e2eDir, s)
    if (!fs.existsSync(p)) { console.log(`- 跳过 ${s}(不存在)`); continue }
    await waitForQuietWindow()
    console.log(`\n========== 运行 ${s} ==========`)
    const { execSync } = require('child_process')
    try {
      execSync(`node ${p}`, { stdio: 'inherit' })
      console.log(`✓ ${s} 通过`)
    } catch (first) {
      // 环境抖动(mongo 被外部周期性重启)会打中个别写窗口;失败自动重跑一次并如实报告
      console.log(`↻ ${s} 首跑失败,自动重跑一次`)
      await waitForQuietWindow()
      try {
        execSync(`node ${p}`, { stdio: 'inherit' })
        console.log(`✓ ${s} 重跑通过`)
      } catch (e) {
        console.log(`✗ ${s} 重跑仍失败(已停)`)
        process.exit(1)
      }
    }
  }
  console.log('\n✓ 全部 E2E 通过')
})()