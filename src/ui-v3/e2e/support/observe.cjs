function captureRequests(page, matcher = () => true) {
  const items = []
  const handler = (request) => {
    if (!matcher(request)) return
    let body = null
    try { body = request.postDataJSON() } catch { body = request.postData() }
    items.push({ method: request.method(), url: request.url(), body })
  }
  page.on('request', handler)
  return {
    items,
    last: () => items[items.length - 1],
    clear: () => { items.length = 0 },
    dispose: () => page.off('request', handler)
  }
}

function assertNoRequest(capture, predicate, message) {
  if (capture.items.some(predicate)) throw new Error(message)
}

module.exports = { captureRequests, assertNoRequest }
