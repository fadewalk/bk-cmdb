const { chromium } = require('../browser.cjs')

async function installNoCache(page) {
  await page.route('**/*', (route) => {
    const headers = { ...route.request().headers(), 'Cache-Control': 'no-cache' }
    delete headers['if-none-match']
    return route.continue({ headers })
  })
}

async function createPage({ baseURL = 'http://localhost:8090', viewport = { width: 1440, height: 900 } } = {}) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport, baseURL })
  const page = await context.newPage()
  await installNoCache(page)
  return { browser, context, page }
}

module.exports = { chromium, installNoCache, createPage }
