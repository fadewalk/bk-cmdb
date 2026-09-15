# G.2 生产安全与发布门禁初审 — 2026-09-15

## 命令

```bash
G1_PRODUCTION_GATE_REPORT_PATH=/tmp/g1-production-gate.json \
  node scripts/ui-v3/audit-g1-production-gate.cjs
```

该检查器只读：读取 checkout 配置、git 状态和 Docker inspect/process 信息；不修改配置、不重启服务、不写 Mongo/Redis/ZK。

## 当前结果

当前运行环境明确不能放行：

```text
status: blocked
releaseDecision: do not release; do not retire legacy src/ui
```

已确认的阻断信号包括：

- 当前 web 端口绑定到所有接口，不是 loopback；
- `STANDALONE_PROFILE=core` 但 cloudserver 仍在运行；
- 容器内 `/run.sh` 与当前 checkout 不一致；
- `/api/v3/healthz` 返回 500；
- 当前工作树 dirty；
- OIDC/外部身份、非 skip-login、TLS 严格校验、非 root、只读 rootfs、cap drop、NetworkPolicy、SBOM/签名等不能仅凭当前运行态标为通过。

## 证据边界

此报告是发布门禁初审，不是安全扫描的替代品。特别是：

- 文档出现 CSRF、cookie、SBOM、备份恢复等关键词，只能证明有门禁定义，不能证明运行时配置或 artifact 已符合；
- Docker inspect 的 User/ReadonlyRootfs/CapDrop 只反映当前容器，不代表下一版镜像；
- 认证/授权必须有真实 IdP、多用户、资源级 allow/deny 证据；
- Mongo backup/restore 演练不等于 PITR、异地备份或生产回滚通过；
- mock IAM、mock cloud、mock K8s/ES 不得提升为生产通过。

## 当前决策

在以下条件全部具备前，不得下线 `src/ui`、切换生产流量或进入 G1+ 新前端开发：

1. 固定 release commit、image digest、served bundle hash；
2. 独立干净环境和可追溯机器报告；
3. legacy 核心页面真实 method/payload/response/read-back/cleanup；
4. K8s legacy 查询和生命周期真实证据；
5. Mongo→ES/Monstache 真实索引同步；
6. 外部 OIDC、多用户、资源级 IAM；
7. TLS、secret、cookie、CSRF、container hardening；
8. backup/restore、kill/restart、迁移回滚和 SBOM/signature/provenance。
