# Standalone 可靠性 Runbook

> 适用于 `deploy/standalone` 的开发/测试环境和生产化改造评审。
>
> 本文不把“容器 Up”当作服务健康；请同时检查进程、HTTP、依赖和业务结果。

## 1. 当前运行形态与边界

standalone 是 ZooKeeper + MongoDB + Redis + 一个多进程 `cmdb` 容器：

- `deploy/standalone/docker-compose.yml:1-132`
- `deploy/standalone/run.sh:41-166`
- `deploy/standalone/README.md:16-36`

`run.sh` 用 `nohup` 启动多个 Go 子进程，只做初始 `pgrep`，随后让 shell 长时间睡眠。子进程之后退出时，容器可能仍然显示 Up：

- `run.sh:41-52`
- `run.sh:136-166`

生产基线应是一进程一容器/Pod，或至少使用 tini/s6/supervisord；每个服务单独有 restart、readiness、liveness、日志和退出码。

## 2. Profile 与 cloudserver 口径核对

文档声称 core 与 cloud/sync/transfer 可选，但当前实现必须单独核对：

- Dockerfile 基础 targets 已包含 cloudserver：`deploy/standalone/Dockerfile:43-60`；
- `run.sh:113-116` 无条件启动 cloudserver；
- `run.sh:118-121` 在 cloud/full profile 再追加 cloudserver；
- `run.sh:143-149` 的 required service 列表也可能重复 cloudserver；
- `configs/common.yaml:186-195` 固定 `standalone.profile: core`，与环境变量 profile 形成多源事实。

### 排查命令

```bash
docker --context colima-xwssd ps --format '{{.Names}} {{.Status}}'
docker --context colima-xwssd exec cmdb pgrep -a cmdb_
docker --context colima-xwssd exec cmdb sh -lc 'grep -a "standalone profile\|WARNING" /data/cmdb/logs/*/std.log 2>/dev/null'
```

在 profile 文档和脚本修正前，不要宣称 core/cloud/full 边界已完全正确。

## 3. 健康检查顺序

### 中间件

```bash
docker --context colima-xwssd ps --format '{{.Names}} {{.Status}}'
docker --context colima-xwssd exec cmdb sh -lc 'echo > /dev/tcp/zookeeper/2181'
docker --context colima-xwssd exec cmdb sh -lc 'echo > /dev/tcp/mongodb/27017'
docker --context colima-xwssd exec cmdb sh -lc 'echo > /dev/tcp/redis/6379'
```

TCP 成功不等于 Mongo 已成为可写 primary，也不等于 Redis/ ZK 状态满足业务条件。

### Web 与 API

```bash
curl -fsS -o /dev/null -w 'web=%{http_code}\n' http://localhost:8090/
curl -fsS -o /dev/null -w 'healthz=%{http_code}\n' http://localhost:8090/healthz
curl -fsS http://localhost:8090/metrics | head
```

需要区分：

- `cmdb` 容器是否 Up；
- `cmdb_webserver` 进程是否存在；
- 8090 是否返回新静态资源；
- API 是否真正返回 `result:true`；
- task/cache/event 进程是否仍在运行。

### 建议的未来探针

- `/livez`：只证明本进程事件循环仍活着；
- `/readyz`：证明关键依赖和配置已就绪；
- `/dependencies`：异步展示下游状态，不让所有依赖拖垮 liveness；
- 每个服务独立端口和进程探针。

当前 healthz 存在同步 fan-out：`src/apiserver/service/healthz.go:59-140`；应设置依赖调用 deadline，避免下游慢导致整体探针雪崩。

## 4. 静态资源部署与 webserver 重启

构建/部署实际需要：

1. 在 `/tmp/ui-v3-build` 构建，避免不可靠卷污染；
2. `docker cp dist/. cmdb:/data/cmdb/cmdb_webserver/web`；
3. 重启真正的 `cmdb_webserver` 进程，而不是只重启容器；
4. 对比本地与 served `index-*.js` hash。

建议检查：

```bash
LOCAL=$(ls /tmp/ui-v3-build/src/ui-v3/dist/assets/index-*.js | xargs -n1 basename | head -1)
SERVED=$(curl -s http://localhost:8090/ | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1)
printf 'local=%s served=%s\n' "$LOCAL" "$SERVED"
docker --context colima-xwssd exec cmdb pgrep -a cmdb_webserver
```

已知问题：容器可能仍 Up，但 webserver 已退出；端口代理可能短时间存在但请求 reset/refused。重启时应等待旧进程完全退出，再启动新进程，避免端口释放竞态。

## 5. Mongo 周期重启与 E2E 归因

本项目环境历史上出现过 `cmdb-mongodb` 外部周期重启、RestartCount 高、ExitCode 0 的情况；写请求可能暂时返回 `1199018` 或 `1199998`。这类错误先检查：

```bash
docker --context colima-xwssd inspect cmdb-mongodb --format '{{json .State}}'
docker --context colima-xwssd events --since 10m --filter container=cmdb-mongodb
```

处理原则：

- 写入型 E2E 在 quiet window 重试一次可以作为测试策略；
- 产品代码不能把重试当一致性修复；
- 失败需区分 Mongo 重启、API 404、payload 校验、前端选择器和真实业务错误；
- 每个夹具脚本必须清理 host/module/template/association，避免孤儿数据污染后续测试；
- 回归日志要保留首次失败原因，不要只保留重跑成功。

## 6. Change Stream/cache 服务故障

Change Stream 错误路径存在 Fatal：

- `src/storage/stream/event/watch.go:99-107`
- `src/storage/stream/event/list_watch.go:90-103`

缓存服务退出后容器仍可能存活，需检查：

```bash
docker --context colima-xwssd exec cmdb pgrep -a cmdb_cacheservice
docker --context colima-xwssd sh -lc 'grep -a -i "watch\|fatal\|resume\|rebuild" /data/cmdb/logs/cmdb_cacheservice/std.log | tail -100'
```

长期修复：

1. watcher 状态机：Connected/Retrying/TokenExpired/FullRebuild/Ready；
2. token CAS 和事件 ID 幂等；
3. token 失效时全量重建并报告进度；
4. 周期性主库—缓存对账；
5. 取消业务路径 Fatal，交给 supervisor 重启。

## 7. 备份、恢复和 RPO/RTO

当前 Compose 只有 Mongo volume；Redis 无持久化，ZooKeeper 没有配套持久卷和恢复演练：

- `deploy/standalone/docker-compose.yml:14-26,58-99`
- `deploy/standalone/README.md:81-82`

发布前必须补齐：

- Mongo 全量备份 + oplog/PITR 策略；
- 备份加密、对象存储、保留周期和校验；
- ZK 配置/注册状态可重建或持久化边界；
- Redis 明确哪些是可丢缓存、哪些是会话/锁/任务状态；
- 每季度隔离环境 restore drill；
- 记录 RPO/RTO、恢复步骤和验收命令。

admin `export` backup 仍存在未完成实现迹象：

- `src/scene_server/admin_server/command/import.go:38-51`
- `src/scene_server/admin_server/command/export.go:26-29`

不能把业务 snapshot 或导出接口当作灾备备份替代品。

### 演练记录（2026-09-13,本地 standalone 通过）

使用 `deploy/standalone/scripts/{backup-mongo.sh,restore-mongo.sh}` 完成一轮完整演练：

1. 备份（220KB 有效档,脚本体积门禁校验）；
2. 备份点之后创建标记数据（模型分类 `b43_drill_marker`）；
3. 停 cmdb 容器（停写）→ `restore-mongo.sh` 恢复 → 重启；
4. 验证：标记消失（恢复真实覆盖）、备份点数据完好（分类 5/业务 1/主机读写正常）、`/` 与 `/healthz` 200。

生产执行注意：演练脚本默认 `--drop` 全量覆盖,必须先停写；Mongo 账号经 `MONGO_USER/MONGO_PASSWORD` 注入,勿用默认 root 口令。

## 8. 升级与回滚

当前升级脚本偏向停机、原地覆盖和手工 restart：

- `scripts/upgrade.sh:11-68`
- `docs/overview/upgrade-from-ce.md:31-180`
- Helm migration hook：`docs/support-file/helm/backend/templates/job/migrate-db-job.yaml:11-50`

生产升级顺序应为：

1. 备份和恢复点确认；
2. 兼容性/容量/索引 preflight；
3. expand/contract schema；
4. 新旧二进制兼容验证；
5. canary/健康门禁；
6. 切流；
7. 观察期；
8. 失败回滚二进制和经过演练的数据恢复路径。

注意：Deployment rollback 通常只能回滚镜像，不能自动回滚已执行的 Mongo schema migration。

## 9. 连接池与资源预算

Mongo/Redis 默认连接池较大：

- `src/storage/dal/mongo/config.go:30-49`
- `src/storage/dal/redis/redis.go:50-80`
- `deploy/standalone/configs/mongodb.yaml:3-14`

单容器多进程下要按服务和请求量预算连接，而不是每个进程统一使用 1000/3000。应监控：

- pool in use/idle/wait;
- Mongo command latency;
- Redis command latency;
- goroutine/heap/file descriptors;
- queue depth;
- request p50/p95/p99;
- change stream lag。

## 10. 观测性与发布门禁

已有：

- `/healthz`、`/metrics`；
- Prometheus registry/请求延迟；
- 可选 OTel；
- Helm ServiceMonitor；
- 结构化任务/审计日志。

当前仓库未形成统一的：

- PrometheusRule；
- Grafana dashboard；
- SLO/error budget；
- trace-log correlation；
- backup restore CI；
- Compose restart/kill recovery；
- 镜像 SBOM/sign/provenance。

发布门禁建议：

```text
unit + race
Mongo/Redis integration
clean standalone boot
API smoke
E2E with real readback
kill/restart service recovery
migration forward/rollback rehearsal
backup restore validation
Helm lint/template/schema validation
vulnerability + SBOM + image signature
```

## 11. 事故处理速查

| 现象 | 首先检查 | 不要直接假设 |
|---|---|---|
| 8090 返回 reset/refused | webserver 进程、端口、日志、旧进程是否退出 | 容器 Up 就等于 Web 健康 |
| E2E 写 1199018/1199998 | Mongo state/events、quiet window | 一定是 payload 或代码回归 |
| 页面仍是旧 JS | served index hash、静态目录、webserver 重启 | docker cp 成功就已经生效 |
| API 404 | 路由注册位置：`/api/v3` vs Web 根路径 | 所有接口都挂在 `/api/v3` |
| 缓存数据不更新 | cacheservice 进程、Change Stream 日志、token/rebuild 状态 | Redis 清空就能解决 |

本文是运行处置和生产化改造基线；安装参数仍以 `deploy/standalone/README.md` 为准，但 profile/安全口径冲突应优先按代码和实际探针复核。