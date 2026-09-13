function jsonResponse(route, body, { status = 200, headers = {} } = {}) {
  return route.fulfill({ status, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
}

async function mockJson(page, pattern, bodyOrHandler, options = {}) {
  await page.route(pattern, async (route) => {
    const body = typeof bodyOrHandler === 'function' ? await bodyOrHandler(route) : bodyOrHandler
    if (body === undefined) return route.continue()
    return jsonResponse(route, body, options)
  })
}

module.exports = { jsonResponse, mockJson }
