// B30: 资源导航入口与页面动线 smoke
const { chromium } = require('./browser.cjs')

const BASE = process.env.UI_V3_BASE_URL || 'http://localhost:8090'
const MENU = [
  ['资源目录', '/resource/index'],
  ['项目', '/resource/project'],
  ['业务集', '/resource/biz-set'],
  ['业务', '/resource/business'],
  ['主机', '/resource/host'],
  ['管控区域', '/resource/cloud-area'],
  ['云账户', '/resource/cloud-account'],
  ['云资源发现', '/resource/cloud-discover']
]

function ok(label) { console.log(`✓ ${label}`) }
function fail(label, error) { console.error(`✗ ${label}: ${error?.message || error}`); process.exitCode = 1 }
function normalizeHash(value) {
  const raw = String(value || '').replace(/^#/, '')
  const [path, query = ''] = raw.split('?')
  const params = [...new URLSearchParams(query).entries()].sort(([a], [b]) => a.localeCompare(b))
  return `${path}?${new URLSearchParams(params)}`.replace(/\?$/, '')
}
async function openHash(page, path, expected = path) {
  await page.evaluate((url) => window.location.assign(url), `${BASE}/#${path}`)
  await page.waitForFunction((expectedPath) => {
    const normalize = (value) => {
      const raw = String(value || '').replace(/^#/, '')
      const [path, query = ''] = raw.split('?')
      const params = [...new URLSearchParams(query).entries()].sort(([a], [b]) => a.localeCompare(b))
      return `${path}?${new URLSearchParams(params)}`.replace(/\?$/, '')
    }
    return normalize(window.location.hash) === normalize(expectedPath)
  }, expected, { timeout: 30000 })
  await page.waitForTimeout(250)
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    route.continue({ headers })
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(`console.error: ${message.text()}`)
  })

  try {
    await openHash(page, '/resource?from=b30', '/resource/index?from=b30')
    ok('旧 /resource 入口重定向并保留 query')
    await openHash(page, '/resource/cloud-resource?from=b30', '/resource/cloud-discover?from=b30')
    ok('旧 /resource/cloud-resource 入口重定向并保留 query')

    for (const [label, path] of MENU) {
      await openHash(page, path)
      const bodyText = await page.locator('body').innerText()
      if (!bodyText.includes(label)) throw new Error(`页面未呈现菜单文案「${label}」`)
      ok(`${label} canonical route ${path}`)
    }

    await openHash(page, '/resource/project')
    await page.getByRole('button', { name: '新建' }).click()
    if (!await page.locator('.el-drawer:visible').isVisible()) throw new Error('项目新建抽屉未打开')
    if (!await page.locator('.el-drawer:visible').getByText('创建 项目').count()) throw new Error('项目新建标题不匹配')
    if (!await page.locator('.el-drawer:visible').getByText('基础信息').count()) throw new Error('项目新建缺少基础信息分组')
    if (!await page.locator('.el-drawer:visible').getByRole('button', { name: '提交' }).count()) throw new Error('项目新建缺少提交按钮')
    await page.keyboard.press('Escape')
    ok('项目新建抽屉动线(老版 800px sideslider 形态)')

    await openHash(page, '/resource/business')
    await page.getByRole('button', { name: '新建' }).click()
    if (!await page.locator('.el-drawer:visible').isVisible()) throw new Error('业务新建抽屉未打开')
    if (!await page.locator('.el-drawer:visible').getByText('创建 业务').count()) throw new Error('业务新建标题不匹配')
    await page.keyboard.press('Escape')
    ok('业务新建抽屉动线')

    await openHash(page, '/resource/cloud-account')
    await page.getByRole('button', { name: '新建' }).click()
    if (!await page.locator('.el-drawer:visible').isVisible()) throw new Error('云账户新建抽屉未打开')
    if (!await page.locator('.el-drawer:visible').getByText('新建账户').count()) throw new Error('云账户新建标题不匹配')
    await page.keyboard.press('Escape')
    ok('云账户新建抽屉动线')

    if (errors.length) throw new Error(errors.join('\n'))
    console.log('✓ B30 资源导航 smoke 通过')
  } catch (error) {
    fail('B30 资源导航 smoke', error)
  } finally {
    await browser.close()
  }
})()
