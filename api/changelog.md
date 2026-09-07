# Open API 变更记录

## 1.0.0（独立版兼容契约）

- 首次发布标准 OpenAPI 3.0.3 契约。
- 固化现有 `/api/v3` 路径和操作 ID。
- 移除腾讯蓝鲸 API Gateway 专属扩展，仅保留 CMDB 业务接口描述。
- 增加可选的 standalone API Key 机器调用认证（`CMDB_API_KEY`）。
- 保留浏览器 Session/skip-login 兼容路径；未配置 API Key 时不改变现有开发环境行为。
- 本版本不改变现有 CMDB 路由、字段和响应 envelope。

## 兼容承诺

`/api/v3` 在独立版稳定期间作为兼容 API 使用。任何破坏性变更都必须先在本文件记录，并经过调用方迁移和弃用周期。
