// 资源域 + 模型域 8 页:老版 8091 与新版 8090 同尺寸截图对照
const { chromium } = require('./browser.cjs')
const fs = require('fs')
const path = require('path')
const OUT = path.join(__dirname, '../screenshots/resource-model')
fs.mkdirSync(OUT, { recursive: true })

const OLD = {
  resourceIndex: 'http://localhost:8091/#/resource/index',
  cloudArea: 'http://localhost:8091/#/resource/cloud-area',
  cloudAccount: 'http://localhost:8091/#/resource/cloud-account',
  cloudDiscover: 'http://localhost:8091/#/resource/cloud-resource',
  modelManage: 'http://localhost:8091/#/model',
  modelTopology: 'http://localhost:8091/#/model/all/topology/new',
  modelAssociation: 'http://localhost:8091/#/model/association',
  fieldTemplate: 'http://localhost:8091/#/model/field-template'
}

const NEW = {
  resourceIndex: 'http://localhost:8090/#/resource/index',
  cloudArea: 'http://localhost:8090/#/resource/cloud-area',
  cloudAccount: 'http://localhost:8090/#/resource/cloud-account',
  cloudDiscover: 'http://localhost:8090/#/resource/cloud-discover',
  modelManage: 'http://localhost:8090/#/model/management',
  modelTopology: 'http://localhost:8090/#/model/topology',
  modelAssociation: 'http://localhost:8090/#/model/association',
  fieldTemplate: 'http://localhost:8090/#/model/field-template'
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

// 老 UI 进入主页后选择业务下拉里的第一项
async function selectFirstBizOld(page) {
  const trigger = page.locator('.biz-select, .bk-selector, [data-test-id*="business"], .bk-form-select .bk-form-input').first()
  if (await trigger.count({ timeout: 1500 })) {
    await trigger.click({ timeout: 1500 }).catch(() => {})
    await page.waitForTimeout(500)
    const opt = page.locator('.bk-option, .bk-dropdown-list .item, [class*="option-content"]').first()
    if (await opt.count({ timeout: 1500 })) await opt.click({ timeout: 1500 }).catch(() => {})
    await page.waitForTimeout(800)
    return true
  }
  return false
}

;(async () => {
  const browser = await chromium.launch()
  async function shot(prefix, pages, focus) {
    const url = pages[focus]
    if (!url) return
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log(`[${prefix} ${focus} err]`, e.message))
    await ensureNoCache(page)
    console.log(`[${prefix}] ${focus}`)
    if (prefix === 'old') {
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
    await shot('old', OLD, t)
    await shot('new', NEW, t)
  }
  await browser.close()
  console.log('done ->', OUT)
})().catch((e) => { console.error(e); process.exit(1) })
