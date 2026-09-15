# E.1 老前端 `full_text` mock contract — 2026-09-15

## 结论

E.1 完成老前端全文检索 `POST /api/v3/find/full_text` 的离线 mock contract。测试只验证老前端请求构造、后端输入校验和响应 envelope；没有打开 standalone 的 `fullTextSearch`，没有修改 ui-v3 业务页面或 `run-all.cjs`。

- `offline`: **passed**
- `ES/Monstache`: **blocked**（本批不启动、不伪造 Elasticsearch/Monstache）
- `Mongo -> ES`: **not verified**（未验证 Mongo change stream → Monstache/plugin → ES index/alias）

## 事实源与调用边界

请求构造来自：

- `src/ui/src/store/modules/api/full-text-search.js`
  - action 原样调用 `$http.post('find/full_text', params, config)`；在 `/api/v3` 网关下即 `POST /api/v3/find/full_text`。
- `src/ui/src/views/index/children/full-text-search/use-result.js`
  - `filter.models` / `filter.instances`：高级筛选非空时使用选择值，否则回退 `allModelIds`；
  - `query_string`：普通单词原样发送；包含非 word 字符时客户端用 `*...*` 包裹；单个特殊字符先被替换为空字符串，再得到 `**`；
  - 结果页默认 `page.start = (page - 1) * limit`、`page.limit = Number(limit)`；联想模式为 `start=0, limit=10`；
  - 有分类下钻时增加 `sub_resource`，键名为 `${kind}s`，值为路由 `c` 逗号拆分后的数组；
  - `!params.value.query_string.length || !allModelIds.value.length` 时直接 return，不 dispatch 请求。
- `src/ui/src/views/index/index.vue`
  - 只有 `$Site.fullTextSearch === 'on'` 才允许切换到全文检索；off 时点击全文检索只打开功能依赖提示，不发全文接口请求。
- `src/scene_server/topo_server/service/fulltextsearch.go`
  - 空关键词、单个特殊字符、UTF-8 rune 长度超过 50、空 `models` 与 `instances`、分页边界均由后端校验；
  - `filter` 必须存在，`models` 与 `instances` 都空是非法；只空其中一方是合法请求；
  - `page.start >= 0`，`1 <= page.limit <= 100`；
  - 服务成功响应的 `data` 是 `{total, aggregations, hits, attrs}`；合法无结果仍是成功 envelope，`total=0`、`hits=[]`；
  - ES 客户端未初始化使用 `1101089`，ES 查询失败使用 `1101088`；权限失败由 IAM envelope 返回 HTTP 403 和 `9900403`。

## 精确请求 contract

```text
POST /api/v3/find/full_text
Content-Type: application/json
```

典型结果页请求：

```json
{
  "filter": {
    "models": ["host", "biz"],
    "instances": ["host", "biz"]
  },
  "query_string": "*host-01*",
  "page": {
    "start": 20,
    "limit": 10
  },
  "sub_resource": {
    "hosts": ["host-01", "host-02"]
  }
}
```

`sub_resource` 只在下钻分类时出现，不能把它强制加到普通检索请求。`models=[]` 或 `instances=[]` 单独出现是合法的；两者同时为空是后端参数错误。客户端空关键词、无模型库存和 `fullTextSearch=off` 都是不请求，不是“请求后返回 empty”。

## 错误与空结果矩阵

| 场景 | 是否发 `POST /find/full_text` | mock 结果 |
| --- | ---: | --- |
| `fullTextSearch=off` | 否 | offline passed；无 ES 请求 |
| 空关键词 | 否 | offline passed；无 API 请求 |
| 模型库存为空 | 否 | offline passed；无 API 请求 |
| `foo+bar` 等特殊字符 | 是 | 保留老前端 `*foo+bar*` 请求形状；合法后返回 empty |
| 单个 `!` | 是 | 老前端发 `**`；纯 helper 校验通过（后端看到的是通配后的请求） |
| 51 个字符 | 是 | HTTP 200 业务错误 envelope，code `1199006` |
| `models=[]`, `instances=[]` | 是 | HTTP 200 业务错误 envelope，code `1199006` |
| 只有一侧 filter 为空 | 是 | 合法请求；可返回 empty |
| 合法 empty | 是 | HTTP 200，`result=true`, `code=0`, `data.total=0`, `hits=[]` |
| ES 查询失败 | 是 | HTTP 500，`1101088` |
| ES client unavailable | 是 | HTTP 503，`1101089` |
| 无权限 | 是 | HTTP 403，`9900403` |

错误 envelope 保留 CMDB 客户端兼容字段：`result=false`、`code`、`bk_error_code`、`bk_error_msg`、`data=null`。成功 envelope 的 `data` 保留全文响应 shape：

```json
{
  "total": 0,
  "aggregations": [],
  "hits": [],
  "attrs": { "attributes": {}, "groups": {} }
}
```

## 脚本与运行结果

纯函数和离线矩阵在：

- `/Users/fadewalk/Documents/code/bk-cmdb/src/ui-v3/e2e/run-g1-legacy-fulltext-mock.cjs`
- `/Users/fadewalk/Documents/code/bk-cmdb/src/ui-v3/e2e/test-g1-legacy-fulltext-mock.cjs`

运行：

```bash
node --check src/ui-v3/e2e/run-g1-legacy-fulltext-mock.cjs
node --check src/ui-v3/e2e/test-g1-legacy-fulltext-mock.cjs
node src/ui-v3/e2e/test-g1-legacy-fulltext-mock.cjs
node src/ui-v3/e2e/run-g1-legacy-fulltext-mock.cjs
```

runner 输出的 report 会明确包含：

```text
offline: passed
ES/Monstache: blocked
Mongo->ES: not-verified
```

该 runner 是纯 contract helper，不依赖 8090、Playwright、ES、Monstache、MongoDB 或真实 IAM；因此本批不把后端基础设施可用性误报为通过。`run-all.cjs` 未修改，业务页面未修改。
