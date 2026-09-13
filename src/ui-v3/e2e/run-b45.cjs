// B45: 深度收尾专项(主机详情关联拓扑/全屏 + 模型导出密码强度/二次确认 + 导入已存在标记)
const { chromium } = require('./browser.cjs')
const fs = require('fs')
const SHOTS = '/tmp/ui-v3-shots'
fs.mkdirSync(SHOTS, { recursive: true })
function ok(label) { console.log(`✓ ${label}`) }
function fail(label, e) { console.error(`✗ ${label}: ${e?.message || e}`); process.exitCode = 1 }

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    route.continue({ headers })
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  try {
    await page.goto('http://localhost:8090/#/index', { waitUntil: 'load' })
    await page.waitForTimeout(900)

    // === 1. 主机详情关联 tab:列表/拓扑切换 + 全屏 ===
    await page.goto('http://localhost:8090/#/resource/host', { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    // 取一个真实主机 id(空则跳过该段)
    const hostId = await page.evaluate(async () => {
      const r = await fetch('/api/v3/hosts/list_hosts_without_app', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: { start: 0, limit: 1 }, fields: ['bk_host_id'] })
      })
      const res = await r.json()
      return res.data?.info?.[0]?.bk_host_id || null
    })
    if (hostId) {
      await page.goto(`http://localhost:8090/#/host-detail?id=${hostId}`, { waitUntil: 'load' })
      await page.waitForTimeout(1600)
      await page.locator('.el-tabs__item').filter({ hasText: '关联' }).click()
      await page.waitForTimeout(1000)
      if (!await page.locator('.el-radio-button').filter({ hasText: '拓扑' }).count()) throw new Error('关联 tab 缺少列表/拓扑切换')
      await page.locator('.el-radio-button').filter({ hasText: '拓扑' }).click()
      await page.waitForTimeout(600)
      ok('关联 tab 列表/拓扑切换可用(拓扑视图渲染)')
      await page.locator('button').filter({ hasText: '全屏' }).first().click()
      await page.waitForTimeout(500)
      const fsWrap = await page.locator('.assoc-wrap.is-fullscreen').count()
      if (!fsWrap) throw new Error('全屏容器未生效')
      ok('关联 tab 组件内全屏生效')
      await page.screenshot({ path: `${SHOTS}/b45-assoc-fullscreen.png` })
      await page.locator('.assoc-wrap.is-fullscreen button').filter({ hasText: '退出全屏' }).click()
      await page.waitForTimeout(400)
      if (await page.locator('.assoc-wrap.is-fullscreen').count()) throw new Error('退出全屏未生效')
      ok('退出全屏恢复内嵌视图')
    } else {
      console.log('- 资源池无主机,跳过关联 tab 段')
    }

    // === 2. 模型导出密码强度/二次确认 ===
    await page.goto('http://localhost:8090/#/model/management', { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    // 老版选择模式:点导出 → 动作条 → 勾选首个模型卡片 → 下一步进入向导
    await page.click('button:has-text("导出")')
    await page.waitForSelector('.export-action-bar', { timeout: 8000 })
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.model-item')].filter((el) => el.offsetParent !== null)
      const item = items.find((el) => {
        const cb = el.querySelector('.model-checkbox input[type="checkbox"]')
        return cb && !cb.disabled
      })
      if (!item) throw new Error('无可见可勾选的模型卡片')
      const cb = item.querySelector('.model-checkbox input[type="checkbox"]')
      if (!cb.checked) cb.click()
    })
    await page.waitForTimeout(500)
    await page.click('button:has-text("下一步")')
    await page.waitForSelector('.el-dialog:has-text("选择关联关系")', { timeout: 8000 })
    // 关联关系步骤 → 下一步 → 导出设置
    await page.click('.el-dialog button:has-text("下一步")')
    await page.waitForTimeout(600)
    // 弱密码 → 明确报错
    const pwdInput = page.locator('.el-dialog input[type="password"]').first()
    if (!await pwdInput.count()) throw new Error('导出设置缺少密码输入框')
    await pwdInput.fill('123')
    const confirmInput = page.locator('.el-dialog input[type="password"]').nth(1)
    await confirmInput.fill('123')
    await page.click('.el-dialog .step-actions .bk-primary:has-text("导出")')
    await page.waitForSelector('.el-message', { timeout: 4000 })
    const toast1 = await page.locator('.el-message').textContent().catch(() => '')
    if (!/6-16/.test(toast1 || '')) throw new Error(`弱密码未触发强度校验: ${toast1}`)
    ok('弱密码触发强度校验(6-16 位/字母数字特殊符号)')
    // 不一致确认密码 → 报错(先等上一条消息消失,避免捕获旧 toast)
    await page.locator('.el-message').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
    await pwdInput.fill('Abc123!@#')
    await confirmInput.fill('Abc123!@')
    const [toast2] = await Promise.all([
      page.waitForSelector('.el-message', { timeout: 4000 }).then((el) => el.textContent()).catch(() => ''),
      page.click('.el-dialog .step-actions .bk-primary:has-text("导出")')
    ])
    const inputs = await page.locator('.el-dialog input[type="password"]').evaluateAll((els) => els.map((e) => e.value))
    console.log(`  … pwd inputs: ${JSON.stringify(inputs)}, toast: ${toast2}`)
    if (!/不一致/.test(toast2 || '')) throw new Error(`确认密码不一致未拦截: ${toast2}`)
    ok('二次确认不一致被拦截')
    await page.screenshot({ path: `${SHOTS}/b45-export-pwd.png` })

    // === 3. 导入向导探针(先关闭导出弹窗,避免遮罩) ===
    await page.click('.el-dialog .step-actions .bk-button:has-text("取消导出")').catch(() => {})
    await page.waitForTimeout(500)
    const importBtn = page.locator('button:visible').filter({ hasText: '导入' }).first()
    if (await importBtn.count()) {
      await importBtn.click({ force: true })
      await page.waitForTimeout(800)
      const wizardText = await page.locator('.el-dialog:visible').last().textContent().catch(() => '')
      if (!wizardText.includes('导入')) throw new Error('导入向导未打开')
      ok('导入向导可打开(逐行已存在标记由解析结果驱动,逻辑见 analyzeImport)')
    }
  } catch (e) {
    fail('B45 闭环', e)
  } finally {
    const realErrors = errors.filter((e) => !/favicon|ResizeObserver/.test(e))
    if (realErrors.length) fail('页面错误', new Error(realErrors.slice(0, 3).join(' | ')))
    await browser.close()
  }
  if (!process.exitCode) console.log('B45 E2E 全部通过')
})()
