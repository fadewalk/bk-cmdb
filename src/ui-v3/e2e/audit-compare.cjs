// 老 UI 走 8091 时,先到首页选业务,再访问菜单
const { chromium } = require('/tmp/e2e/node_modules/playwright')
const fs = require('fs')
const path = require('path')
const OUT = path.join(__dirname, '../screenshots/audit-compare')
fs.mkdirSync(OUT, { recursive: true })

const OLD = {
  topo: 'http://localhost:8091/#/business/topo',
  serviceTemplate: 'http://localhost:8091/#/service/template',
  setTemplate: 'http://localhost:8091/#/set/template',
  serviceCategory: 'http://localhost:8091/#/business/service/cagetory',
  hostApply: 'http://localhost:8091/#/host-apply/module',
  dynamicGroup: 'http://localhost:8091/#/custom-query',
  customFields: 'http://localhost:8091/#/custom-fields',
  resourceHost: 'http://localhost:8091/#/host',
  cloudArea: 'http://localhost:8091/#/cloud-area',
  cloudAccount: 'http://localhost:8091/#/cloud-account',
  cloudDiscover: 'http://localhost:8091/#/cloud-resource',
  models: 'http://localhost:8091/#/model',
  modelTopology: 'http://localhost:8091/#/all/topology/new',
  modelRelation: 'http://localhost:8091/#/association',
  audit: 'http://localhost:8091/#/audit',
  operation: 'http://localhost:8091/#/operation'
}

const NEW = {
  topo: 'http://localhost:8090/#/business/topo',
  serviceTemplate: 'http://localhost:8090/#/business/service-template',
  setTemplate: 'http://localhost:8090/#/business/set-template',
  serviceCategory: 'http://localhost:8090/#/business/service-category',
  hostApply: 'http://localhost:8090/#/business/host-apply',
  dynamicGroup: 'http://localhost:8090/#/business/dynamic-group',
  customFields: 'http://localhost:8090/#/business/custom-fields',
  resourceHost: 'http://localhost:8090/#/resource/host',
  cloudArea: 'http://localhost:8090/#/resource/cloud-area',
  cloudAccount: 'http://localhost:8090/#/resource/cloud-account',
  cloudDiscover: 'http://localhost:8090/#/resource/cloud-discover',
  models: 'http://localhost:8090/#/model/management',
  modelTopology: 'http://localhost:8090/#/model/topology',
  modelRelation: 'http://localhost:8090/#/model/relation',
  audit: 'http://localhost:8090/#/analysis/audit',
  operation: 'http://localhost:8090/#/analysis/operation'
}

async function ensureNoCache(page) {
  await page.route('**/*', (r) => {
    const h = { ...r.request().headers() }; delete h['if-none-match']
    h['cache-control'] = 'no-cache'; r.continue({ headers: h })
  })
}

async function dismissDialogs(page) {
  for (let i = 0; i < 3; i++) {
    const c = page.locator('.bk-dialog-close, .bk-close-btn, .el-dialog__close, .el-message-box__close').first()
    if (await c.count({ timeout: 500 })) { try { await c.click({ timeout: 800 }); await page.waitForTimeout(300); } catch {} } else break
  }
}

// 老 UI 进入主页后,选择业务下拉里的第一项
async function selectFirstBizOld(page) {
  // 找业务下拉触发器
  const trigger = page.locator('.biz-select, .bk-selector, [data-test-id*="business"], .bk-form-select .bk-form-input').first()
  if (await trigger.count({ timeout: 1500 })) {
    await trigger.click({ timeout: 1500 }).catch(() => {})
    await page.waitForTimeout(500)
    // 点选项
    const opt = page.locator('.bk-option, .bk-dropdown-list .item, [class*="option-content"]').first()
    if (await opt.count({ timeout: 1500 })) await opt.click({ timeout: 1500 }).catch(() => {})
    await page.waitForTimeout(800)
    return true
  }
  return false
}

;(async () => {
  const browser = await chromium.launch()
  async function shot(prefix, pages, focus, port) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log(`[${prefix} ${focus} err]`, e.message))
    await ensureNoCache(page)
    const url = pages[focus]
    if (!url) { await ctx.close(); return }
    console.log(`[${prefix}] ${focus}`)
    if (prefix === 'old') {
      // 老 UI 先到首页选业务
      await page.goto('http://localhost:8091/', { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForTimeout(3500)
      await dismissDialogs(page)
      await page.waitForTimeout(800)
      await selectFirstBizOld(page)
      await page.waitForTimeout(1500)
    }
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(4500)
    await dismissDialogs(page)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(OUT, `${prefix}-${focus}.png`), fullPage: true })
    await ctx.close()
  }
  const targets = Object.keys(NEW)
  for (const t of targets) {
    await shot('old', OLD, t, 8091)
    await shot('new', NEW, t, 8090)
  }
  await browser.close()
  console.log('done')
})().catch((e) => { console.error(e); process.exit(1) })
