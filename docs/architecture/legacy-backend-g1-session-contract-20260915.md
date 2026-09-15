# G1-F.1 登录、登出、Session 与身份头契约 — 2026-09-15

## 结论

本批次只新增 contract runner、纯 helper 单测和本证据文档；没有改业务实现、`run-all` 或 destructive test。

| 层级 | 状态 | 结论 |
|---|---|---|
| local-infra | **blocked** | 本地 8090 登录、`c_url`、`/userinfo`、`/is_login`、身份头清洗和 UI session-expiry 分支可执行；当前部署是 `skip-login`，登出后 API 请求又被自动登录，不能证明真实 session 失效，因此不能伪造通过。 |
| offline | **passed** | 纯 helper 对 `401`、HTML 登录页、`1306000`、外部身份头清洗、重复身份头、内部请求头和同源 `c_url` 守卫通过。 |
| external-OIDC | **blocked** | runner 没有联系外部 IdP；当前配置无 issuer/credential/multi-user fixture，真实 OIDC、多用户 session 和外部 logout 未验收。 |

整体 runner 状态为 `blocked`，退出码 `2` 是预期的阻塞报告，不是 runner 崩溃，也不表示 local session contract 已通过。

## 覆盖的契约

### 老后端本地登录与回跳

事实源：

- `src/web_server/service/login.go`：`GET /login`、`POST /login`、表单 `username/password`、query `c_url`、同 host 回跳保护；
- `src/web_server/service/service.go`：`/login`、`/userinfo`、`/is_login`、`/logout` route；
- `src/web_server/service/user.go`：`/userinfo` response data；
- `src/web_server/middleware/user/plugins/method/opensource/userinfo.go`、`skip/userinfo.go`：内置账号/skip-login 身份行为；
- `src/ui-v3/e2e/run-login.cjs`：既有内置账号登录流程。

runner 实际验证：

- 登录页存在 `#username`、`#password`、`#login-form`；
- 错误密码返回非空模板错误（没有未渲染的 `{{...}}`）；
- `admin:admin` 本地登录成功，same-host `c_url=/#/index` 回跳成功；
- foreign-host `c_url=https://example.com/escape` 没有逃逸到外部 host；
- `/userinfo` 返回 `result=true`，并包含 `data.username`；
- `/is_login` 返回 HTTP 200、`result=true`、`bk_error_code=0`。

### logout/session

事实源：

- `src/web_server/service/login.go:LogOutUser`：`session.Clear()` 后必须 `session.Save()`，返回 `result/data.url`；
- `src/ui-v3/src/stores/session.js`：POST `/logout`，传 `{http_scheme: "http"|"https"}`，成功后 `clear()` 并返回 logout URL；
- `src/ui-v3/src/main.js`、`src/ui-v3/src/stores/session.js`：session expired 后重定向 `/login`。

本地结果：

- `POST /logout` 本身返回 HTTP 200、`result=true`、`data.url`；
- 但当前本地 `deploy/standalone/configs/web.yaml` 使用 `login.version: skip-login`。登出后对 `/api/v3/find/objectattr/web` 的请求返回 HTTP 200，skip-login 自动重新建立 `admin` session；
- 因此 `logout` stage 标记为 `blocked`，没有把这个结果解释成 logout/session expiry 通过。要获得真实 session invalidation 证据，需要用 `opensource` 内置账号配置（或真实 OIDC）重跑，并在登出后的 `/userinfo`、`/is_login` 和受保护 API 上断言未登录/401。

### session expiry / API response

事实源：`src/ui-v3/src/api/http.js`。

实际 UI mock 分支覆盖：

- HTTP `401` → dispatch `cmdb-session-expired` → `/login`；
- `result=false, bk_error_code=1306000` → dispatch session expired → `/login`；
- HTML 登录页响应 → dispatch session expired → `/login`。

三条 UI 分支均在本次本地 runner 中重定向到 `/login`，但它们是浏览器本地 route mock，不能替代后端真实失效响应。

### 身份头清洗

事实源：

- `src/web_server/middleware/identity.go`；
- `src/web_server/middleware/api_key.go`；
- `src/web_server/middleware/api_key_test.go`。

覆盖头集合：

```text
X-Bkcmdb-User
BK_User
X-Bkcmdb-Supplier-Account
HTTP_BK_SUPPLIER_ACCOUNT
HTTP_BLUEKING_SUPPLIER_ID
X-Bkcmdb-User-Token
X-Bkcmdb-User-Ticket
X-Bkcmdb-App-Code
Bk-App-Code
```

覆盖结果：

- 登录后以 caller-provided identity headers 请求 `/userinfo`，返回用户仍由 session 决定，spoofed username/supplier 没有生效；
- `X-Bkcmdb-Is-Inner-Request` 返回 HTTP 401；
- 纯 helper 验证外部身份头被清除；
- 外部身份头重复值返回 400 `duplicate identity header`；
- `X-Bkcmdb-Request-From-Web` / `X-Bkcmdb-Is-Inner-Request` 返回 401 `forbidden internal request header`；
- 本 runner 没有启用或调用 live API-key proxy，也没有伪造 API-key 通过。已有 Go 单测仍是 `src/web_server/middleware/api_key_test.go` 的事实证据。

## 文件与运行方式

新增文件：

- `/Users/fadewalk/Documents/code/bk-cmdb/src/ui-v3/e2e/run-g1-session-contract.cjs`
- `/Users/fadewalk/Documents/code/bk-cmdb/src/ui-v3/e2e/test-g1-session-contract.cjs`
- `/Users/fadewalk/Documents/code/bk-cmdb/docs/architecture/legacy-backend-g1-session-contract-20260915.md`

运行：

```bash
cd /Users/fadewalk/Documents/code/bk-cmdb
node --check src/ui-v3/e2e/run-g1-session-contract.cjs
node --check src/ui-v3/e2e/test-g1-session-contract.cjs
node src/ui-v3/e2e/test-g1-session-contract.cjs
G1_SESSION_REPORT_PATH=/tmp/g1-session-contract.json \
  node src/ui-v3/e2e/run-g1-session-contract.cjs
```

本次结果：

```text
node --check runner: passed
node --check unit test: passed
G1 session contract unit checks passed
runner: blocked (exit 2)
```

机器可读报告：`/tmp/g1-session-contract.json`（运行时产物，不提交）。关键摘要：

```text
login: passed
cUrl: passed
userinfo: passed
isLogin: passed
identitySanitization: passed
logout: blocked
sessionExpiry401: passed
sessionExpiry1306000: passed
sessionExpiryHtml: passed
offline: passed
local-infra: blocked
external-OIDC: blocked
pageErrors: 0
```

既有专项也已在同一本地环境执行成功：

```text
node src/ui-v3/e2e/run-login.cjs
登录页渲染: passed
错误凭据: passed
内置账号登录/c_url/userinfo: passed
```

## 未执行/阻塞项

- 未运行任何创建、更新、删除 CMDB 业务数据的 destructive test；
- 未修改 `run-all`；
- 未接触外部 OIDC、真实蓝鲸 login、真实多用户 IAM 或外部 API Key；
- 尝试运行已有 Go identity/API-key 单测时，环境在依赖编译阶段被 `crypto-golang-sdk` 缺少 `openssl/evp.h` 阻断；这不影响本次 JS 纯 helper 单测结果，也不被记录为 Go 单测通过：

```text
go test ./src/web_server/middleware -run 'Test(SanitizeExternalIdentityHeaders|StandaloneAPIKeyIdentity|StandaloneAPIKeyProxyRejectsMissingKeyWhenRequired|StandaloneAPIKeyProxyRejectsInvalidKey)$' -count=1
FAIL: fatal error: 'openssl/evp.h' file not found
```

下一次真实 local-infra 验证应在非 `skip-login` 的本地配置下执行，例如显式 `CMDB_LOGIN_VERSION=opensource` 与临时非默认账号，并重新验证 logout 后 `/userinfo`、`/is_login`、受保护 API 均不自动恢复；生产/shared 环境还必须遵守现有启动脚本的账号、API Key、session secret 和 TLS 门禁。
