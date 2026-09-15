# D.1 老前端 K8s 查询 mock contract

> 日期：2026-09-15
> 范围：老前端 `src/ui/src/service/container/*.js`、`src/ui/src/service/topology/instance.js` 的只读查询契约
> 证据：`src/ui-v3/e2e/run-g1-legacy-k8s-mock.cjs`、`src/ui-v3/e2e/test-g1-legacy-k8s-mock.cjs`

## 结论与分层口径

- **offline passed**：本批纯函数单测和本地 `page.route` mock contract 逻辑覆盖通过时，表示请求体、动态路径、响应 envelope、空态与错误矩阵符合老源码提取的契约。
- **infra required**：Playwright runner 仍需要现有 `UI_V3_BASE_URL`（默认 `http://localhost:8090`）页面可访问；页面服务器、Playwright 或 Chrome 不可用时只能报告基础设施阻塞，不能把它解释成契约失败。
- **real K8s blocked**：本批所有 K8s API 都由 `page.route` 在本地拦截；mock 通过不等于 Kubernetes、CMDB 数据库、权限链路或真实读回通过。真实 K8s 仍需单独的只读环境 runner 和证据。

## 老源码提取的路由

| Method | Route | 老前端来源 | 请求要点 | mock 响应要点 |
| --- | --- | --- | --- | --- |
| POST | `/findmany/kube/pod` | `service/container/pod.js` | `bk_biz_id`、`fields`、`filter`、`page`；`find()` 并发 `enable_count=false/true` | `{ data: { count, info } }` |
| POST | `/findmany/kube/node` | `service/container/node.js` | 同上；`find()` 并发 list/count | `{ data: { count, info } }` |
| POST | `/findmany/kube/namespace` | `service/container/namespace.js` | 同上；`find()` 并发 list/count | `{ data: { count, info } }` |
| POST | `/findmany/kube/workload/:kind` | `service/container/workload.js` | `:kind` 动态透传；本批以 `statefulSet` 覆盖；`bk_biz_id`、`fields`、`filter`、`page` | `{ data: { count, info } }` |
| POST | `/findmany/kube/container` | `service/container/container.js` | `bk_biz_id`、`bk_pod_id`、`fields`、`filter`、`page`；并发 list/count | `{ data: { count, info } }` |
| POST | `/findmany/kube/container/by_topo` | 后端 `GetContainerByTopoOption` 与老拓扑查询链路 | `bk_biz_id`、`bk_kube_nodes`、`pod_filter`、`container_filter`、`pod_fields`、`container_fields`、`page` | 非 count 返回 `container/pod/topo`，count 返回 `{ count, info: [] }` |
| POST | `/find/kube/pod_path` | `service/container/pod.js` | 详情调用 `{ bk_biz_id, ids: [bk_pod_id] }`；`getCount()` 还发送 `page.enable_count=true` | `{ data: { info: [...] } }` |
| POST | `/find/kube/topo_path` | `service/topology/instance.js` | `bk_biz_id`、`bk_reference_obj_id`、`bk_reference_id`、`page`；先 count 后 list，list limit 为 100 | `{ data: { count, info } }` |
| POST | `/find/kube/topo_node/host/count` | `service/topology/instance.js` | `bk_biz_id`、`resource_info[]`；按 `resource_info` 分块，不使用 page | 数组 `[{ kind, id, count }]` |
| POST | `/find/kube/topo_node/pod/count` | `service/topology/instance.js` | 同 host count | 数组 `[{ kind, id, count }]` |
| GET | `/find/kube/{object}/attributes` | `service/container/property.js` | object 动态；query 保留 `bk_biz_id` | 属性数组，字段包含 `field/type/required/editable` |

服务注册还确认了以下后端路径：`src/scene_server/topo_server/service/kube/service.go` 注册上述查询路由；`FindResourceAttrs` 接受标准 K8s 对象以及 `customResource`。

## 关键请求断言

### `bk_biz_id`、`bk_pod_id`、fields、condition、page

- Pod、Node、Namespace、Workload 查询必须保留选定业务 `bk_biz_id=2`。
- Container 查询必须保留 `bk_pod_id=101`。
- `fields` 和 `filter` 原样向后端传递；本批使用 `condition: "AND"`、`rules` 中的 `field/operator/value` 作为可审计 fixture。
- 普通 list 请求使用 `page.start=0`、`page.limit=20`、`page.sort="id"`；count 请求使用 `page.start=0`、`page.limit=0`、`page.sort=""`。
- `find/kube/topo_path` 的列表分页使用 `limit=100`，符合老版 `rollReqUseCount(..., { limit: 100 })`。
- topology count 请求使用 `resource_info`，不能误写成普通 `page` 分页。

### `enable_count` 双请求

老版 Pod/Node/Namespace/Workload/Container `find()` 都执行：

```text
POST same endpoint, page.enable_count=false  -> info list
POST same endpoint, page.enable_count=true   -> count
```

runner 对两种 body 分别断言，并确认 count 响应不被误当作 list 响应。`pod_path.getCount()` 的历史行为也单独保留并记录：它对 `/find/kube/pod_path` 发送 `enable_count=true`，但后端 `PodPathData` 仍返回 `info`。

### 动态 workload kind

`workload.js` 使用 ``findmany/kube/workload/${params.kind}``，不是固定的 workload 路由。本批使用 `statefulSet`，同时断言路径中的 kind 与响应 `WORKLOAD.kind` 一致。其它合法 workload kind 可在同一 runner 的 fixture 中扩展，但不能把动态 kind 收敛成固定 `workload`。

### Container by topology

后端 `GetContainerByTopoOption` 的字段名是：

```json
{
  "bk_biz_id": 2,
  "bk_kube_nodes": [{ "kind": "statefulSet", "id": 13 }],
  "pod_filter": { "condition": "AND", "rules": [] },
  "container_filter": { "condition": "AND", "rules": [] },
  "pod_fields": ["id", "name", "namespace"],
  "container_fields": ["id", "name", "container_uid"],
  "page": { "start": 0, "limit": 20, "sort": "id", "enable_count": false }
}
```

后端会把 topology node 条件合并到 Pod/Container 查询，因此 mock 只验证入口契约，不伪造 Mongo 聚合或真实拓扑统计。

## 空态、500、403

- **empty**：Pod list/count、Pod path、topology path、attributes 返回空数组或 count=0；这是“查询结果为空”，不是 K8s 不可用。
- **500**：`/findmany/kube/pod` 返回 HTTP 500，body 使用 CMDB 错误 envelope，runner 断言 `isOk=false`。
- **403**：返回 HTTP 403 与 `bk_error_code=9900403`、`bk_error_msg="permission denied"`；权限失败不是空态，也不是真实集群可用性证明。
- 每个错误场景使用 fresh browser context，防止 capability/session 状态跨场景泄漏。

## 执行方式

```bash
node --check /Users/fadewalk/Documents/code/bk-cmdb/src/ui-v3/e2e/run-g1-legacy-k8s-mock.cjs
node --check /Users/fadewalk/Documents/code/bk-cmdb/src/ui-v3/e2e/test-g1-legacy-k8s-mock.cjs
node /Users/fadewalk/Documents/code/bk-cmdb/src/ui-v3/e2e/test-g1-legacy-k8s-mock.cjs
UI_V3_BASE_URL=http://localhost:8090 node /Users/fadewalk/Documents/code/bk-cmdb/src/ui-v3/e2e/run-g1-legacy-k8s-mock.cjs
```

runner 支持 `G1_LEGACY_K8S_REPORT_PATH` 写机器报告。退出码约定：`0` 为 mock/offline passed；`2` 为 infra required；`1` 为 mock assertion/runner failure。无论退出码如何，报告中的 `realK8s` / `real-k8s` 都固定为 `blocked`。

## 未覆盖与后续门禁

- 没有修改 ui-v3 业务页面、`run-all` 或用户文件。
- 没有创建或修改 K8s 集群、CMDB fixture、Mongo、权限配置或同步器。
- 没有执行真实 K8s read-back；需要可访问的 K3s/K8s、CMDB K8s 数据、同业务 Host/Node 映射和权限凭据后单独验收。
- 本批不覆盖写接口、Pod delete、Container update、生命周期同步、跨业务共享集群真实数据和真实 IAM。
