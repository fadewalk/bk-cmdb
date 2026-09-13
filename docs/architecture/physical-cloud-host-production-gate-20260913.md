# P48 主机生产目标边界审计

## 当前可证明

- K8s worker 可以通过显式 `node name → existing CMDB host ID` 映射接入 CMDB；真实 Colima 验证已完成：Host 75 → Node 407 → Pod 5 → Container 5。
- 新增同步器默认 `existing-only`，找不到 Host 时 fail-closed，不自动创建主机或跨业务绑定。
- 云虚拟机路径仍由现有 `cloudserver/cloudsync` 负责，当前环境没有真实云账号、云 API 网络和云同步生产凭据，因此未做真实云主机验收。
- 物理机路径不由 K8s 同步器覆盖，需要 Agent、资产系统、采集器或受审计的导入来源；当前没有真实物理机数据源。

## 当前生产阻断

- standalone 仍是开发安全基线：skip-login/auth disabled、TLS verify disabled；同步器需要 Secret manager、API Key 轮换、RBAC、NetworkPolicy、非 root/只读 rootfs、SBOM 和签名。
- P48 测试发现旧/测试 CMDB K8s 夹具存在业务归属异常（曾出现 Cluster `bk_biz_id=0`），并且现有公开删除路由对残留 Pod/Node/Cluster 的清理会被关联保护阻断。没有执行 Mongo 直删；需要受审计的迁移/清理任务后才能宣称数据库干净。
- 同步器创建 Cluster 现在要求创建后按 `bk_biz_id + uid` 读回，业务不一致或读回失败即停止后续 Namespace/Node/Pod 写入。

## 验收分层

```text
K8s worker 管理：真实单集群、单业务、显式 Host 映射通过
云虚拟机管理：等待真实云账户/cloudsync 验证
物理机管理：等待真实 Agent/资产来源验证
全量生产放行：未通过
```
