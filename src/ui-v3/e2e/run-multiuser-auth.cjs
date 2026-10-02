// 真实多用户授权链路 E2E(opt-in:CMDB_MULTIUSER_E2E=1 才运行,不在 run-all 默认集)
//
// 前置:docker --context colima-xwssd 可用;当前部署为 skip-login 默认态。
// 流程:临时切换 web.yaml(opensource 登录 + admin:admin,bob:bob123 + auth.enabled)→
//   bob 登录 → 新建项目被边缘 403 → 原位 permission 视图 → 站内申请 →
//   admin 登录审批通过 → bob 重试创建成功 → 创建者自动获得 biz_admin →
//   admin 清理测试项目 → finally 恢复原 web.yaml 并重启。
// 这是整条自研 IAM(判定/申请/审批/基线/创建者授权)对真实后端的首次全链验证。
const { chromium } = require('./browser.cjs')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const DOCKER = ['docker', '--context', 'colima-xwssd']
// 唯一备份名:避免与手工调试的备份文件互相覆盖污染 restore 源
const BACKUP = path.join(os.tmpdir(), `web.yaml.multiuser-backup-${process.pid}-${Date.now()}`)
const BIZ_NAME = 'e2e-mu-biz'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sh(args, opts = {}) {
  return execFileSync(args[0], args.slice(1), { encoding: 'utf8', ...opts })
}

function containerYaml() {
  return sh([...DOCKER, 'exec', 'cmdb', 'cat', '/data/cmdb/cmdb_webserver/web.yaml'])
}

function toggleMultiUser() {
  let yaml = containerYaml()
  fs.writeFileSync(BACKUP, yaml)
  yaml = yaml
    .replace(/^    version: skip-login$/m, '    version: opensource')
    .replace(/^    userInfo: .*$/m, '    userInfo: admin:admin,bob:bob123')
    .replace(/^  auth:\n    enabled: false/m, '  auth:\n    enabled: true')
  assert(yaml.includes('version: opensource') && yaml.includes('bob:bob123'), 'web.yaml 切换失败(锚点未命中)')
  fs.writeFileSync('/tmp/web.yaml.multiuser-test', yaml)
  sh([...DOCKER, 'cp', '/tmp/web.yaml.multiuser-test', 'cmdb:/data/cmdb/cmdb_webserver/web.yaml'])
  sh([...DOCKER, 'restart', 'cmdb'])
}

function restore() {
  try {
    let yaml = fs.existsSync(BACKUP) ? fs.readFileSync(BACKUP, 'utf8') : ''
    // 备份本身可能是中途 toggled 态(如手工调试覆盖):校验特征,异常则回退 git HEAD 默认
    if (!yaml.includes('version: skip-login') || yaml.includes('bob:bob123')) {
      yaml = execFileSync('git', ['-C', path.resolve(__dirname, '../..'), 'show', 'HEAD:deploy/standalone/configs/web.yaml'], { encoding: 'utf8' })
      console.log('⚠ 备份异常,已回退 git HEAD 默认 web.yaml')
    }
    fs.writeFileSync('/tmp/web.yaml.multiuser-restore', yaml)
    sh([...DOCKER, 'cp', '/tmp/web.yaml.multiuser-restore', 'cmdb:/data/cmdb/cmdb_webserver/web.yaml'])
    sh([...DOCKER, 'restart', 'cmdb'])
    waitReady()
    console.log('✓ 已恢复原 web.yaml 并重启(skip-login 默认态)')
  } catch (error) {
    console.error(`✗ 恢复失败,请手工检查容器 web.yaml: ${error.message}`)
    process.exitCode = 1
  }
}

function waitReady(timeoutMs = 60000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const out = sh(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '3', `${BASE}/login`])
      if (out.trim() === '200') return
    } catch { /* retry */ }
    execFileSync('sleep', ['3'])
  }
  throw new Error('cmdb 重启后 60s 内未就绪')
}

async function login(page, username, password) {
  await page.goto(`${BASE}/login?c_url=${encodeURIComponent(`${BASE}/#/index`)}`, { waitUntil: 'load' })
  await page.fill('#username', username)
  await page.fill('#password', password)
  // login.html 是原生表单,EP 环境下程序化 click 偶发不触发 submit,直接调 form.submit()
  await page.evaluate(() => document.querySelector('#login-form').submit())
  await page.waitForURL(/#\/index/, { timeout: 20000 })
  // 等 SPA 真正挂载(URL 到达不代表 index.html 完成 mount)
  await page.locator('.the-header').waitFor({ timeout: 20000 })
  await page.waitForTimeout(1200)
}

// 按名预清理上一轮残留(唯一约束会挡住重跑)
async function cleanupProjectByName(page, name) {
  await page.evaluate(async (projectName) => {
    const res = await fetch('/api/v3/findmany/project', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: { start: 0, limit: 50 } }) })
    const data = (await res.json())?.data?.info || []
    const ids = data.filter((p) => p.bk_project_name === projectName).map((p) => p.id)
    if (ids.length) {
      await fetch('/api/v3/deletemany/project', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
    }
  }, name)
}

async function createProjectViaUI(page, name) {
  await page.goto(`${BASE}/#/resource/project`, { waitUntil: 'load' })
  await page.reload({ waitUntil: 'load' }).catch(() => {})
  await page.getByRole('button', { name: '新建' }).first().waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: '新建' }).first().click()
  await page.waitForTimeout(800)
  const drawer = page.locator('.el-drawer:visible', { hasText: '创建' }).first()
  await drawer.waitFor()
  // 名称与英文名同占位符前缀,先填抽屉内全部文本输入(名称/英文名/负责人/团队),类型走下拉
  const textInputs = drawer.locator('input[placeholder^="请输入"]')
  const textCount = await textInputs.count()
  for (let i = 0; i < textCount; i++) {
    const ph = await textInputs.nth(i).getAttribute('placeholder')
    // 负责人是用户引用(须存在用户名);所属团队是团队 ID 引用且非必填,留空
    if (ph.includes('团队')) continue
    if (ph.includes('负责人')) await textInputs.nth(i).fill('admin')
    else if (ph.includes('英文名')) await textInputs.nth(i).fill('e2e-mu-proj')
    else await textInputs.nth(i).fill(name)
  }
  const typeItem = drawer.locator('.el-form-item', { hasText: '项目类型' }).first()
  await typeItem.locator('.el-select').click()
  await page.locator('.el-select-dropdown__item').filter({ visible: true }).first().click()
  await page.waitForTimeout(300)
  await drawer.getByRole('button', { name: '提交' }).click()
}

;(async () => {
  if (process.env.CMDB_MULTIUSER_E2E !== '1') {
    console.log('跳过(设置 CMDB_MULTIUSER_E2E=1 启用真实多用户链路验证)')
    return
  }
  toggleMultiUser()
  let newBizId = null
  const browser = await chromium.launch({ headless: true })
  try {
    waitReady()

    // === bob 登录,平台管理菜单应隐藏(非 admin) ===
    const bob = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    bob.setDefaultTimeout(20000)
    const bobPage = await bob.newPage()
    // 项目创建请求全程观测(响应码+耗时)
    const projectRequests = []
    bobPage.on('request', (r) => {
      if (r.url().includes('createmany/project')) {
        const entry = { url: r.url().slice(-40), method: r.method(), postData: (r.postData() || '').slice(0, 200), response: null, ms: null }
        projectRequests.push(entry)
        r.response().then(async (res) => {
          entry.response = res.status()
          entry.ms = Date.now() - entry.started
          try { entry.result = (await res.text()).slice(0, 160) } catch { /* body gone */ }
        }).catch(() => { entry.response = 'no-response' })
        entry.started = Date.now()
      }
    })
    await login(bobPage, 'bob', 'bob123')
    assert(!(await bobPage.getByRole('link', { name: '平台管理' }).count()), 'bob 不应看到平台管理菜单')
    console.log('✓ bob 内置账号登录,平台管理菜单按 iam:admin 隐藏')

    // === 新建业务被边缘 403 → 原位 permission 视图 → 站内申请 ===
    await createProjectViaUI(bobPage, BIZ_NAME)
    await bobPage.getByText('无操作权限').waitFor()
    const applyButton = bobPage.getByRole('button', { name: '去申请权限' })
    assert(await applyButton.isEnabled(), '去申请权限按钮不可用(边缘 403 未接线申请流)')
    await applyButton.click()
    await bobPage.waitForTimeout(1500)
    console.log('✓ 边缘 403 → permission 视图 → 站内申请提交')

    // === admin 登录审批 ===
    const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    admin.setDefaultTimeout(20000)
    const adminPage = await admin.newPage()
    await login(adminPage, 'admin', 'admin')
    await cleanupProjectByName(adminPage, BIZ_NAME)
    await adminPage.goto(`${BASE}/#/platform/iam`, { waitUntil: 'load' })
    await adminPage.reload({ waitUntil: 'load' }).catch(() => {})
    const pendingRow = adminPage.getByTestId('iam-apply-table').locator('tbody tr').filter({ hasText: 'project' }).filter({ hasText: 'bob' })
    await pendingRow.waitFor()
    await pendingRow.getByText('通过', { exact: true }).click()
    await adminPage.getByText('已通过,策略已生效').waitFor()
    console.log('✓ admin 审批通过 bob 的 biz/create 申请')

    // === bob 重试创建成功 + 创建者自动授权 biz_admin ===
    await createProjectViaUI(bobPage, BIZ_NAME)
    await bobPage.waitForTimeout(3000)
    // 授权终点断言:审批后创建真实成功(1209011 组织字段空串校验已修)
    const lastReq = projectRequests[projectRequests.length - 1]
    assert(lastReq, '审批后未发出创建请求')
    assert(lastReq.response === 200 && String(lastReq.result || '').includes('"result":true'),
      `审批后创建未成功: ${JSON.stringify(lastReq)}`)
    // createmany/project 响应契约:data.ids 数组
    const createdId = JSON.parse(lastReq.result)?.data?.ids?.[0]
    console.log(`✓ 审批后 bob 创建项目成功(${createdId})`)

    // === 创建者自动授权:成功创建即绑定 biz_admin@新项目域 ===
    const bobPermAfterCreate = await bobPage.evaluate(async () => (await fetch('/iam/me/permissions', { credentials: 'include' })).json())
    const creatorBinding = (bobPermAfterCreate.groupings || []).find((g) => g[0] === 'bob' && g[1] === 'biz_admin' && g[2] === String(createdId))
    assert(creatorBinding, `创建者自动授权缺失 biz_admin@${createdId}: ${JSON.stringify(bobPermAfterCreate.groupings)}`)
    console.log(`✓ 创建者自动授权 bob → biz_admin@${createdId}`)

    // admin 清理测试项目
    await adminPage.evaluate(async (pid) => {
      await fetch('/api/v3/deletemany/project', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [Number(pid)] }) })
    }, createdId)

    // === biz_admin 域角色:真实后端 enforcer 上验证域语义 ===
    // (创建成功自动绑定钩子受项目模型 organization 字段空串校验 1199011 阻塞,已单独记录)
    await adminPage.evaluate(async () => {
      await fetch('/iam/groupings', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: 'bob', role: 'biz_admin', domain: '2' }) })
    })
    await bobPage.waitForTimeout(500)
    const bobPerm = await bobPage.evaluate(async () => (await fetch('/iam/me/permissions', { credentials: 'include' })).json())
    const bizAdminBound = (bobPerm.groupings || []).some((g) => g[0] === 'bob' && g[1] === 'biz_admin' && g[2] === '2')
    assert(bizAdminBound, `bob 缺少 biz_admin@2 绑定: ${JSON.stringify(bobPerm.groupings)}`)
    const domainChecks = await bobPage.evaluate(async () => {
      const probe = (object, action, domain) => fetch('/iam/verify', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ object, action, domain }) }).then((r) => r.json())
      return {
        inDomain: await probe('biz', 'create', '2'),
        crossDomain: await probe('biz', 'create', '9'),
        iamAdmin: await probe('iam', 'admin', '*')
      }
    })
    assert(domainChecks.inDomain.allowed === true, 'biz_admin 域内放行失败')
    assert(domainChecks.crossDomain.allowed === false, 'biz_admin 跨域应拒绝')
    assert(domainChecks.iamAdmin.allowed === false, 'biz_admin 不得获得 iam:admin')
    await adminPage.evaluate(async () => {
      await fetch('/iam/groupings', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: 'bob', role: 'biz_admin', domain: '2' }) })
    })
    console.log('✓ biz_admin 域语义:域内放行/跨域拒绝/iam 隔离(真实 enforcer)')
    // (创建成功自动授权经 biz_admin 域语义断言与钩子单测覆盖;项目模型
    //  organization 字段 1199011 校验缺陷阻塞真实创建路径,单独记录)

    // === admin 清理测试业务(归档 + 彻底删除) ===
    await adminPage.evaluate(async (bizId) => {
      await fetch('/api/v3/deletemany/project', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [Number(bizId)] }) })
    }, newBizId)
    console.log(`✓ admin 清理测试项目 ${newBizId}`)

    await bob.close()
    await admin.close()
    await browser.close()
    console.log('多用户真实链路 E2E 全部通过')
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`)
    process.exitCode = 1
    await browser.close().catch(() => {})
  } finally {
    restore()
  }
})()
