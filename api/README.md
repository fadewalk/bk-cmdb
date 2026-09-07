# 独立版 CMDB Open API

这是独立版配置管理系统的 API 契约入口。

## 当前版本

- **兼容 API:** `/api/v3/...`
- **规范:** OpenAPI 3.0.3
- **文档:** [`openapi.yaml`](./openapi.yaml)
- **认证:** 独立 API Key（`X-API-Key`；兼容 `Authorization: Bearer`）
- **来源:** 现有 CMDB 开放接口目录 `docs/apidoc/apigw/open/`
- **当前规模:** 150 个路径、156 个操作

`/api/v3` 是现有 CMDB 业务接口，当前先保持路径和响应兼容，方便已有系统迁移。它不要求腾讯蓝鲸 API Gateway；部署时请求经过 CMDB 自己的 `web_server → apiserver` 入口即可。

## 调用边界

外部系统只应调用公开 API：

```text
外部系统
  → CMDB Web/API 入口
  → /api/v3
  → apiserver
  → 场景服务
  → 核心服务
```

不要：

- 直接访问 MongoDB 或 Redis；
- 直接访问 `topo_server`、`host_server`、`coreservice` 等内部服务；
- 把 ZooKeeper 服务发现地址当成公共 API 地址；
- 使用浏览器 `cc3` Session Cookie 作为机器调用凭证。

## 认证说明

独立版机器调用使用 API Key。standalone Compose 通过 `CMDB_API_KEY` 启用认证；未设置时保持现有开发/封闭环境的浏览器 Session/skip-login 行为。

生产环境建议至少设置：

```bash
export CMDB_API_KEY='replace-with-a-long-random-secret'
export CMDB_API_USER='cmdb-automation'
export CMDB_API_SUPPLIER_ACCOUNT='0'
export CMDB_API_APP_CODE='standalone-api'
docker compose -f deploy/standalone/docker-compose.yml up -d --build
```

调用方式：

```http
X-API-Key: <standalone-api-key>
```

也兼容：

```http
Authorization: Bearer <standalone-api-key>
```

API Key 只在 Web/API 入口验证，随后映射为 CMDB 用户、开发商账号和 app code，并继续经过现有 `/api/v3` 代理链。当前版本使用环境变量作为单凭证配置；多凭证、哈希存储、轮换和本地 RBAC 属于下一阶段，不应把环境变量方案当成完整的多租户生产 IAM。

浏览器 Session 仍然保留，用于 `src/ui-v3` 和旧版 UI。不要在独立版中依赖以下蓝鲸凭证：

- `bk_token`
- `bk_ticket`
- `app_code` / `app_secret`
- 蓝鲸登录跳转
- BlueKing API Gateway 的签名头

## 兼容策略

1. `/api/v3` 是兼容层，首个独立版本不批量修改路径、字段和错误码。
2. 新增公共能力先补充 OpenAPI 文档和示例，再实现路由。
3. 破坏性变更记录在 [`changelog.md`](./changelog.md)，至少经过一个弃用周期。
4. `/api/v3` 中的 `bk_biz_id`、`bk_obj_id`、`bk_inst_id` 等字段暂时保留，它们已经是 CMDB 数据/API 协议的一部分，不代表运行时必须依赖蓝鲸平台。
5. 服务内部接口和迁移接口不属于公共兼容 API，不能由普通 API 凭证调用。

## 来源文件

仓库原有的 `docs/apidoc/apigw/open/` 仍然保留，作为历史中文/英文接口说明和兼容核对材料。它下面的 `bk_apigw_resources_bk-cmdb.yaml` 是给蓝鲸 API Gateway 导入的 Swagger 2.0 资源映射，不是独立版唯一契约。

生成/刷新独立版契约：

```bash
python3 scripts/generate-standalone-openapi.py
```

生成脚本只复制路径、HTTP 方法和操作元数据，主动去除 `x-bk-apigateway-resource`、蓝鲸限流插件和蓝鲸网关认证配置。
