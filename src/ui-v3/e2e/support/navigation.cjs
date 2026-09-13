function normalizeHash(value) {
  const raw = String(value || '').replace(/^#/, '') || '/'
  const [pathname, query = ''] = raw.split('?')
  const params = [...new URLSearchParams(query).entries()].sort(([a], [b]) => a.localeCompare(b))
  const result = new URLSearchParams(params).toString()
  return result ? `${pathname}?${result}` : pathname
}

async function openHash(page, hash, expected = hash, timeout = 30000) {
  await page.evaluate((url) => window.location.assign(url), hash)
  await page.waitForFunction((target) => {
    const current = normalizeHash(window.location.href.split('#')[1] || '/')
    return current === normalizeHash(target)
  }, expected, { timeout })
}

function hashQuery(page) {
  return page.evaluate(() => Object.fromEntries(new URLSearchParams((window.location.hash.split('?')[1] || ''))))
}

module.exports = { normalizeHash, openHash, hashQuery }
