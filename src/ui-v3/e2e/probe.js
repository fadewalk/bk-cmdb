// Minimal verification: confirm Playwright + cmdb_webserver can load the SPA
const { chromium } = require('/tmp/e2e/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE.ERROR:', msg.text()) })

  // Disable cache + first load
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    route.continue({ headers })
  })

  await page.goto('http://localhost:8090/', { waitUntil: 'load' })
  await page.waitForTimeout(3000)
  const info = await page.evaluate(() => ({
    bodyLen: document.body.innerHTML.length,
    appLen: document.querySelector('#app')?.innerHTML?.length || 0,
    hasMain: !!document.querySelector('main, .layout, .el-tabs, .topo-page, .res-index, .page-card'),
    title: document.title,
    url: location.href
  }))
  console.log(JSON.stringify(info, null, 2))
  await page.screenshot({ path: '/tmp/ui-v3-shots/probe.png', fullPage: true })
  await browser.close()
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })