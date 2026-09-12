# 架构与运行文档索引

> 本目录是 bk-cmdb 架构、独立部署、前端迁移与安全边界文档的入口。
>
> **状态规则（2026-09-11）**：文档中的“已完成”必须绑定提交、测试脚本、部署环境和数据前置条件。当前工作树存在未提交并行修改，因此工作树观察不自动等同于已交付能力。

## 权威性与冲突处理

当不同文档结论不一致时，按以下优先级判断：

1. 当前代码和可复现测试结果；
2. 最新的当前交接文档；
3. 迁移矩阵和 API 契约审计；
4. 设计文档；
5. 日期化历史 handoff、早期计划和旧切换指南。

“页面存在”“主流程可用”“API 写入可回读”“视觉对照通过”“旧版全量可达”“正式权限完成”是不同状态，不能合并为一个“完成”。

## 当前审计与决策文档

- [全面架构与行业对标审计](architecture-industry-benchmark-audit.md) — 后端架构、数据一致性、安全、部署可靠性、前端迁移和行业先进基线。
- [bk-cmdb 与 bk-lite CMDB 对比](bk-cmdb-vs-bk-lite-cmdb.md) — 两套系统的定位、能力矩阵、选型边界和融合路线。
- [Standalone 安全边界](standalone-security-boundary.md) — skip-login、API Key、OIDC/Casbin、身份头、密钥、上传和生产门禁。
- [Standalone 可靠性 Runbook](standalone-reliability-runbook.md) — 单容器多进程、Mongo/Redis/ZK、Change Stream、webserver 重启、备份恢复和故障归因。

## 前端迁移与兼容

- [Vue3 前端迁移矩阵](frontend-migration-matrix.md) — 页面、路由、深链和迁移门禁的主矩阵；状态应继续按模块更新。
- [UI v3 后端兼容检查](ui-v3-backend-compatibility.md) — 历史 API 兼容检查，当前 API 细节以后续契约审计为准。
- [UI v3 旧前端切换指南](../../src/ui-v3/REPLACE_OLD_UI.md) — 构建、部署、hash 验证和回滚操作；不是完整迁移状态表。
- [Vue3 全量替代与生产化交接计划](ui-v3-production-parity-handoff-20260912.md) — 当前生产判定、缺口分级、B37-B44 执行路线、统一完成定义和新会话启动清单。

## 设计与独立化

- [传统架构设计](../overview/architecture.md)
- [代码目录与服务边界](../overview/code_framework.md)
- [独立化依赖清单](independent-dependency-inventory.md)
- [IAM 开源方案](iam-open-source-design.md) — 当前工作树版本需要先核对完整性；HEAD 基线是 IAM 设计，工作树曾出现源码覆盖。
- [Standalone 部署说明](../../deploy/standalone/README.md)
- [Helm 部署入口](../support-file/helm/README.md)

## 历史文档

以下文档保留用于追溯，不作为当前状态权威来源：

- `ui-v3-session-handoff-20260908.md`
- `ui-v3-session-handoff-20260909.md`
- `ui-v3-parity-handoff-20260909.md`
- `ui-v3-handoff-b13-b16.md`
- `src/ui-v3/REPLICATION_PLAN.md`

这些文件中的批次、E2E 数量、工作树状态和“最新提交”可能早于当前 HEAD。

## 审计边界

本轮审计未替代生产环境验证。外部 CI、Prometheus、备份平台、云厂商凭据、Kubernetes 集群和正式 IdP 如果不在仓库内，文档只记录“仓库未发现证据”，不据此断言环境一定不存在。