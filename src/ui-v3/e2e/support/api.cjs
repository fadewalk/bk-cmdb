async function api(page, method, path, body, { root = false, headers = {}, responseType = 'json' } = {}) {
  const url = root ? path : `/api/v3${path}`
  const result = await page.evaluate(async ({ url, method, body, headers, responseType }) => {
    const response = await fetch(url, {
      method,
      credentials: 'include',
      headers: body instanceof FormData ? headers : { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : (body instanceof FormData ? body : JSON.stringify(body))
    })
    const raw = responseType === 'text' ? await response.text() : await response.text()
    let data = raw
    try { data = JSON.parse(raw) } catch {}
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), data }
  }, { url, method, body, headers, responseType })
  return result
}

function ok(data) { return { result: true, code: 0, message: 'success', permission: null, data } }
function fail(code, message, permission = null) { return { result: false, bk_error_code: code, bk_error_msg: message, permission, data: null } }

module.exports = { api, ok, fail }
