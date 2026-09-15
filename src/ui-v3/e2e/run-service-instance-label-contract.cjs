#!/usr/bin/env node
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const ROOT = path.resolve(__dirname, '..')
const helperPath = path.join(ROOT, 'src/utils/service-instance-search.js')
const source = fs.readFileSync(helperPath, 'utf8')
const transformed = source
  .replace(/^export function /gm, 'function ')
  .replace(/^export \{[^\n]+\}\s*$/gm, '')
const context = {}
vm.runInNewContext(`${transformed}\nthis.api = { normalizeLabelAggregation, buildServiceInstanceSelectors, buildServiceInstanceSearchOptions, uniqueNonEmpty }`, context)

function plain(value) { return JSON.parse(JSON.stringify(value)) }

function run() {
  const { api } = context
  assert.deepEqual(plain(api.normalizeLabelAggregation({ env: ['prod', 'prod', '', null], zone: [], bad: 'prod' })), { env: ['prod'], bad: ['prod'] })
  assert.deepEqual(plain(api.normalizeLabelAggregation([])), {})
  assert.deepEqual(plain(api.buildServiceInstanceSelectors([
    { id: 'tagValue', condition: { id: 'env' }, values: [{ name: 'prod' }, { name: 'prod' }] },
    { id: 'tagKey', values: [{ id: 'zone', name: 'zone' }] }
  ])), [
    { key: 'env', operator: 'in', values: ['prod'] },
    { key: 'zone', operator: 'exists', values: [] }
  ])
  assert.deepEqual(plain(api.buildServiceInstanceSelectors([{ id: 'tagValue', condition: { id: 'env' }, values: [] }])), [])
  assert.deepEqual(plain(api.buildServiceInstanceSearchOptions({ searchKey: ' svc ', labelKey: 'env', labelValues: ['prod'] })), {
    search_key: 'svc', selectors: [{ key: 'env', operator: 'in', values: ['prod'] }]
  })
  assert.deepEqual(plain(api.buildServiceInstanceSearchOptions({})), { search_key: '', selectors: [] })
  return { status: 'passed', cases: 5, contract: {
    aggregation: 'POST /findmany/proc/service_instance/labels/aggregation -> { key: uniqueValues[] }',
    list: 'POST /findmany/proc/service_instance { bk_biz_id, bk_module_id?, page, search_key, selectors, with_name }',
    selectors: ['in', 'exists'],
    emptyAggregation: '{}',
    incompleteTagValue: 'ignored'
  } }
}

if (require.main === module) process.stdout.write(`${JSON.stringify(run(), null, 2)}\n`)
module.exports = { run }
