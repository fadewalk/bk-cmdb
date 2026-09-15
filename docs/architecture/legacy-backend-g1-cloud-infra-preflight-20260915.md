# C.1 本地云基础设施门禁 — 2026-09-15

## 目的

C.1 真实 cloud account/area/task CRUD 不能直接对当前运行的共享 standalone 实例执行。这个 preflight 只做只读检查，不创建账户、云区域、同步任务，也不改 Mongo/Redis/ZK。

```bash
G1_CLOUD_PREFLIGHT_REPORT_PATH=/tmp/g1-cloud-preflight.json \
  node src/ui-v3/e2e/run-g1-cloud-infra-preflight.cjs
```

报告类型：`legacy-g1-cloud-infra-preflight`。

## 当前结果

```text
status: blocked
writeSafety: no database/API writes performed
```

通过项：

- `cmdb` 容器存在且运行；
- Mongo 容器 healthy；
- Redis 容器 healthy；
- ZooKeeper 容器运行；
- web root `200`。

阻断项：

- 8090 运行时暴露在所有接口，而不是 loopback；
- 环境变量显示 `STANDALONE_PROFILE=core`，但容器内仍运行 `cmdb_cloudserver`；
- 容器内 `/run.sh` 与当前 checkout 不一致；
- `/api/v3/healthz` 返回 `500`。

因此当前环境不是可证明的专用 CRUD 测试实例。禁止在此环境运行会写入 `cc_CloudAccount`、`cc_PlatBase`、`cc_CloudSyncTask` 或调用 `ClearDatabase()` 的测试。

## 真实 CRUD 进入条件

只有以下条件全部满足，才运行 C.1 真实 runner：

1. 专用 compose project、容器镜像和 checkout commit 可对账；
2. Mongo 使用独立 database/volume，`rs0` 为 PRIMARY，带认证 URI；
3. Redis 使用独立实例或隔离 DB；
4. ZooKeeper 使用独立 namespace/实例；
5. CloudServer 是否监听 change stream 已确认；
6. 8090 只绑定 loopback 或专用测试网络；
7. healthz/服务 readiness 通过；
8. 所有 fixture 使用唯一 marker，finally 逆序清理；
9. task create 与真实 vendor/HostSyncor 的异步副作用已隔离或明确关闭。

C.1 真实 runner 必须与 `run-g1-cloud-mock.cjs` 分离：mock 通过只代表 offline contract，通过不代表本地 CRUD 或真实云同步通过。

## 后续边界

- 假 secret 的账户 CRUD 不等于 account verify 或 cloud discovery 通过；
- 创建同步任务可能被 Mongo change stream 观察并触发 HostSyncor，不能在共享环境随意创建；
- Go cloud integration suite 会清库，不得在当前实例运行；
- AWS/Tencent 真实 discovery 仍属于 live-cloud 层，需要凭据和网络；
- Alibaba vendor 当前未实现。
