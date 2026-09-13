# ui-v3 外部集成验证证据

> 验证日期：2026-09-13
> 分支：`standalone-docker`
> 目的：记录真实 Kubernetes、Elasticsearch、全文检索、IAM 和生产门禁验证，不把 mock 结果写成外部能力完成。

## 结论

| 能力 | 结果 | 证据 | 状态 |
|---|---|---|---|
| Colima/Kubernetes | K3s 节点 Ready，系统 Pod Running | `kubectl get nodes -o wide`、`kubectl get pods -A` | 基础设施可用 |
| K8s Pod/Container → CMDB | K3s 原生测试 Pod Running，但 CMDB 查询 `count:0` | `/tmp/ui-v3-external-evidence-20260913/k8s-probe-pod.json`、`cmdb-pod-query.json` | 依赖阻塞：仓库无生产 client-go informer/collector |
| Elasticsearch | ES 7.17 单节点 green，CMDB 可连接 | `es-health.json`、`es-aliases.txt` | 查询依赖可用 |
| `/find/full_text` | 合法非空 filter 请求返回 `result:true` 空结果 | `fulltext-query.json` | 查询链路通过，数据同步未通过 |
| Mongo → ES / Monstache | 未完成 | 运行包缺少 `monstache` 和 `monstache-plugin.so`，无真实业务索引文档 | 依赖阻塞 |
| IAM | deny/申请 mock 矩阵通过 | `node src/ui-v3/e2e/run-iam.cjs` | mock 契约通过，真实 IdP/多用户未验证 |
| collector | 阻塞页和无伪造请求 mock 通过 | `run-core-domains-mock.cjs` | 依赖阻塞 |
| 生产放行 | 未通过 | OIDC/auth disabled、TLS verify disabled、rootfs 可写、无 cap drop、默认 skip-login 开发配置 | 生产阻断 |

## K8s 验证

```text
colima profile xwssd: Kubernetes enabled
node colima-xwssd: Ready, v1.35.0+k3s1
system pods: coredns/local-path-provisioner/metrics-server Running

测试 Pod: cmdb-k8s-chain-probe
Kubernetes status: Running, container ready=true, podIP=10.42.0.5
CMDB POST /api/v3/findmany/kube/pod (bk_biz_id=2, name filter):
  result=true, data.count=0, data.info=[]
```

CMDB Kube API 读取 Mongo 的 `cc_PodBase` / `cc_ContainerBase`。仓库未发现生产 Kubernetes client/informer（`rest.InClusterConfig`、`kubernetes.NewForConfig`、informer）；K3s 原生对象不会自动进入 CMDB。测试 Pod 已清理。

## Elasticsearch 验证

临时启动 `docker.elastic.co/elasticsearch/elasticsearch:7.17.22`，加入 `standalone_default`。首次使用 `127.0.0.1:9200` 时 topo server 无法连接 ES；改为 Docker 网络地址 `http://cmdb-elasticsearch:9200` 后：

```text
ES cluster health: green, one node
CMDB healthz: 200/healthy
POST /api/v3/find/full_text with filter.models=["biz"]:
  result=true, total=0, hits=null
```

临时创建的 `bk_cmdb.*` aliases 仅用于验证查询路由，不包含业务文档，随后已删除。Monstache 目录只有配置和说明，缺少可执行文件与插件 `.so`，因此 Mongo→ES 真实索引同步没有通过。临时 ES 和 aliases 已清理，standalone 已恢复 `fullTextSearch: "off"`。

## 本轮代码修复

真实后端校验要求 `filter.models` 或 `filter.instances` 至少一个非空；新版此前发送空数组，真实请求会被拒绝。已修复：

- `src/ui-v3/src/views/FullTextSearch.vue`
  - 复用 resource store 加载模型；
  - 过滤 `bk_ishidden !== true`、`bk_ispaused !== true`；
  - 对可见模型去重，放入 `filter.models` 和 `filter.instances`；
  - 无可见模型时不发送全文请求，保持老版 guard。
- `src/ui-v3/src/stores/capabilities.js`
  - ES capability probe 使用合法 `filter.instances: ['biz']`。
- `src/ui-v3/e2e/run-core-domains-mock.cjs`
  - 增加可见/隐藏/暂停模型 fixture；
  - 断言 capability probe 非空 filter 和实际搜索模型过滤结果。

验证结果：

```text
npm ci && npm run build: passed
served bundle: index-BtVN_cv-.js
web=200, healthz=200
run-core-domains-mock.cjs: passed
run-core-domains-errors.cjs: passed
run-core-domains.cjs: passed
run-iam.cjs: passed
```

## 生产门禁审计

当前运行态检查结果：

```text
OIDC enabled: false
web auth enabled: false
TLS insecureSkipVerify: true
container user: root/default
ReadonlyRootfs: false
CapDrop: null
collector process/endpoint: absent
```

因此不能宣称真实 IAM/OIDC、多用户资源级授权、collector、secret manager/TLS、SBOM/签名、PITR 或生产切流完成。旧前端继续保留，standalone 默认仅允许本机/隔离网络开发。

## 机器证据目录

```text
/tmp/ui-v3-external-evidence-20260913/
  api-audit.json
  api-manifest.json
  cmdb-pod-query.json
  es-aliases.txt
  es-health.json
  fulltext-query.json
  healthz-final.json
  healthz-after-restore.json       # 恢复重启早期窗口，非最终状态
  k8s-nodes.txt
  k8s-probe-pod.json
```

`api-manifest.json` 当前静态计数：legacyDefinitions 335、legacyUniqueMethodEndpoints 306、v3Exports 249、v3ExportsWithCallers 204、v3UnusedExports 45、v3RouteGaps 0、v3GenericProxyMatches 18。静态计数不等于生产完成。
