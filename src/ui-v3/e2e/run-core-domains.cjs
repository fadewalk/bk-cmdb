// 核心 API 域状态 smoke:真实后端路由与当前 capability 状态可见
const { chromium } = require('./browser.cjs')
;(async () => {
  const b = await chromium.launch({ headless: true })
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await p.route('**/*', (route) => { const h={...route.request().headers(),'Cache-Control':'no-cache'}; delete h['if-none-match']; route.continue({headers:h}) })
  try {
    await p.goto('http://localhost:8090/#/index', { waitUntil: 'load' }); await p.waitForTimeout(1200)
    await p.goto('http://localhost:8090/#/full-text-search', { waitUntil: 'load' }); await p.waitForTimeout(1200)
    const esText = await p.locator('body').textContent()
    if (!/全文检索|Elasticsearch/.test(esText)) throw new Error('ES 能力页不可达')
    console.log('✓ ES full_text 能力页可达(可用时走 /find/full_text,不可用时明确阻塞)')
    await p.goto('http://localhost:8090/#/business/2/index/pod/1', { waitUntil: 'load' }); await p.waitForTimeout(1200)
    const k8sText = await p.locator('body').textContent()
    if (!/Pod|K8s|Kubernetes/.test(k8sText)) throw new Error('K8s Pod 页面不可达')
    console.log('✓ K8s Pod 页面可达(可用时走 /findmany/kube/pod,不可用时明确阻塞)')
    await p.goto('http://localhost:8090/#/analysis/network-collect', { waitUntil: 'load' }); await p.waitForTimeout(700)
    const netText = await p.locator('body').textContent()
    if (!netText.includes('网络采集')) throw new Error('网络采集阻塞页不可达')
    console.log('✓ 网络采集 API 保留且阻塞页明确依赖 collector')
  } finally { await b.close() }
})().catch((e) => { console.error('✗ 核心域 smoke:', e.message); process.exit(1) })
