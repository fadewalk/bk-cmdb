# IAM 开源方案立项设计（替代蓝鲸权限中心）

> 状态：立项设计稿（2026-09-08）。方向已确认：**不依赖蓝鲸权限中心/IAM，对接开源方案体系**。
> 本文为实施前设计基线，落地时按阶段修订。
> 关联文档：`docs/architecture/frontend-migration-matrix.md`、`docs/architecture/ui-v3-session-handoff-20260908.md`

## 1. 背景与目标

standalone-docker 分支已实现去蓝鲸部署：登录走 skip-login（自动 admin），服务间不调蓝鲸 IAM。但鉴权体系仍是缺位的：

- 登录是硬编码 admin（`skip` 插件），无真实用户体系
- 所有服务 `--enable-auth=false`，接口层完全不做权限判断
- 机器调用有 API-Key 边缘（独立于蓝鲸），但无多凭据/多租户概念

目标：建立 **开箱即用、不依赖任何蓝鲸组件** 的完整 IAM：

1. 真实登录（OIDC 对接外部 IdP，同时保留本地账号兜底）
2. 接口级 RBAC（菜单/功能权限）
3. 资源级权限（业务维度：谁管哪个业务/业务集/项目）
4. 演进路径明确：单管理员模式 → 多用户 RBAC，可分阶段上线

## 2. 现状盘点（代码事实）

### 2.1 登录层（web_server）

- 插件化登录：`src/web_server/middleware/user/plugins/`，按 `login.version` 配置选择插件
  - `skip`（当前使用）：`LoginUser` 直接返回硬编码 admin，`GetUserList` 只返回一个 admin
  - `opensource`：cookie + session 时间戳校验的本地弱登录（无密码验证，生产不可用）
  - `blueking`：调 ESB 登录服务（蓝鲸，standalone 不用）
- 会话：gin-contrib/sessions（redis 存储），关键 session 字段 `WEBSessionUinKey`/`WEBSessionOwnerUinKey`/`HTTPCookieBKToken`
- 登录态校验链：`middleware/login.go ValidLogin → isAuthed → handleAuthedReq`，未登录重定向到 `GetLoginUrl`
- `/login`、`/is_login`、`/static`、`/healthz` 在白名单内免鉴权

### 2.2 机器鉴权（已独立于蓝鲸，可复用）

- `src/web_server/middleware/api_key.go` `StandaloneAPIKeyProxy`：
  - 环境变量 `CMDB_API_KEY`（单凭据），`X-API-Key` 或 `Bearer` 头
  - 常量时间比较，身份映射为 `CMDB_API_USER`（默认 admin）+ supplier account
  - 通过后 JWT 签名直通 apiserver（绕过浏览器会话链路）

### 2.3 服务内鉴权（当前全链路关闭）

- 开关：`src/common/auth/auth.go`，全局 `--enable-auth` flag，`auth.EnableAuthorize()` 判定
- 鉴权调用点：各 scene_server（topo/proc/host...）通过 `AuthManager.Authorizer`（auth_server SDK）向蓝鲸 IAM 发起 `Authorize`/`RegisterResourceCreatorAction`；`src/scene_server/auth_server` 是 IAM 的代理/缓存层
- standalone 部署所有服务 `--enable-auth=false`：调用点全部短路，等价于"不鉴权"
- `web.yaml`：`login.version: skip-login`、`site.authscheme/app.authscheme: internal`

### 2.4 前端

- ui-v3 目前无权限指令/按钮态（老版有 `v-bk-tooltips` + auth 指令按 IAM 返回裁剪按钮）

## 3. 方案选型

### 3.1 身份源（IdP）——OIDC/OAuth2

| 维度 | Casdoor（推荐） | Keycloak | Authentik |
|---|---|---|---|
| 定位 | 轻量 IAM/UI 完整 | 全功能企业 IdP | 现代 IdP |
| 资源占用 | 低（单二进制+DB） | 高（JVM，≥1GB 内存） | 中 |
| OIDC/OAuth2/SAML/LDAP | 全支持 | 全支持 | 全支持 |
| 本地账号+外联源（LDAP/GitHub/企业微信等） | 好 | 好 | 好 |
| 二次开发/中文生态 | 好（国产，中文文档） | 一般 | 一般 |
| 运维复杂度 | 低 | 高 | 中 |

**推荐：Casdoor**（单容器即可跑，资源占用小，适合 standalone 场景；协议齐全，未来可平滑换 Keycloak——应用侧只见 OIDC，不感知 IdP 差异）。**备选：Keycloak**（对协议兼容性/生态要求高时）。

应用侧只依赖标准 OIDC（Authorization Code + PKCE），IdP 可替换是硬性设计约束。

### 3.2 应用内授权（API/资源权限）

| 维度 | Casbin（推荐） | OPA | SpiceDB/OpenFGA |
|---|---|---|---|
| 形态 | 库（嵌入进程） | 独立策略引擎（sidecar/服务） | 独立关系库服务 |
| 模型表达 | RBAC/ABAC/域(domain) | Rego 全编程 | Zanzibar 关系元组 |
| 与 CMDB 匹配度 | 高（业务域 RBAC 正好） | 高但重 | 关系型场景才需要 |
| 运维成本 | 无新增组件 | 新增组件 | 新增组件+数据同步 |
| 生态 | Go 事实标准 | 云原生 | Google 系 |

**推荐：Casbin 以库形态嵌入 web_server**。理由：
- CMDB 权限本质是「用户/角色 × 业务域 × 资源类型 × 操作」，Casbin 的 `domain` 概念直接映射业务维度，PERM 模型一行可表达
- 不引入新组件（standalone 核心原则）；policy 存 MongoDB（已有）或 redis（已有），adapter 现成
- OPA/SpiceDB 适合多服务共享策略或海量关系场景，当前规模是杀鸡用牛刀

## 4. 当前实现状态

本轮已落地第一版可回滚骨架：

- `webServer.oidc` 配置结构与环境变量 `CMDB_OIDC_CLIENT_SECRET` 覆盖；默认 `enabled: false`
- 新增 OIDC 插件：`src/web_server/middleware/user/plugins/method/oidc/`
- 新增回调入口：`GET /login/oidc/start`、`GET /login/oidc/callback`
- 使用 Authorization Code + PKCE、服务端 Redis session 保存 state/nonce/verifier，回调校验 issuer/audience/signature/nonce，并用随机应用 session token 兼容现有 `bk_token` 校验
- 新增 Casbin 边缘授权骨架：`src/web_server/middleware/authorization/`；默认关闭，`webServer.auth.enabled: true` 才挂载
- 现阶段 Casbin 为内存策略，bootstrap 用户通过 `webServer.auth.bootstrapUsers` 配置；尚未实现策略持久化、资源级实例过滤和权限管理 UI
- `skip-login`、API-Key、原有蓝鲸 IAM 适配链路保持不变

当前实现的验收边界：OIDC/Casbin 默认关闭时 standalone 行为与之前一致；启用 OIDC 需要外部兼容 OIDC 的 IdP（Casdoor/Keycloak 等），启用 Casbin 目前提供边缘接口级 RBAC，不宣称已替换所有原有资源级 IAM 语义。

## 5.1 第二阶段实现状态：Casbin 策略管理 API

当前已增加以下 web_server API（仅在 `webServer.auth.enabled=true` 时开放）：

- `GET /iam/me/permissions`：返回当前 subject、内存策略和 groupings
- `GET /iam/policies`：策略管理员查看策略
- `POST /iam/policies` / `DELETE /iam/policies`：策略管理员增删五元组策略 `[subject, domain, object, action, effect]`
- `GET /iam/groupings`：查看用户/角色/域绑定
- `POST /iam/groupings` / `DELETE /iam/groupings`：管理用户角色域绑定
- `PUT /iam/policy/reload`：当前内存策略实现的幂等 reload/health 入口

默认 bootstrap 策略为 `admin` 全权限，`webServer.auth.bootstrapUsers` 中的用户绑定到 `admin`。当前策略只存在进程内内存，服务重启会恢复配置中的 bootstrap 策略；Mongo 持久化、审计和资源级实例过滤仍是后续阶段，不能将当前骨架描述为完整替代蓝鲸 IAM。



```
                     ┌────────────┐
   浏览器 ──OIDC────▶│  Casdoor   │（身份源，可替换为任意 OIDC IdP）
                     └─────▲──────┘
                           │ (3) code 换 token
 ┌─────────────────────────┴──────────────┐
 │ web_server                             │
 │  ① oidc login plugin（替代 skip）       │
 │  ② Authorize middleware（Casbin RBAC） │──Casbin policy──▶ MongoDB
 │  ③ StandaloneAPIKeyProxy（机器凭据）    │
 └──────────────┬─────────────────────────┘
                │ JWT（现有链路不变）
                ▼
            apiserver → 各 scene_server（继续 --enable-auth=false，
                        服务内 IAM 调用点保持短路，鉴权收敛在边缘）
```

设计原则：**鉴权收敛在 web_server 边缘**，不动各 scene_server 的业务代码。scene_server 的 IAM 调用点继续被 `--enable-auth=false` 短路，避免逐服务改造成本；将来如需服务级细粒度再评估。

### 4.1 登录层：新增 `oidc` login plugin

- 新增 `src/web_server/middleware/user/plugins/method/oidc/`，实现 `LoginUser`/`GetLoginUrl`/`GetUserList` 三接口（与 skip/opensource 同签名），注册进 plugin manager
- 流程：
  1. `GetLoginUrl` 返回 IdP 授权页地址（`/login/oidc/redirect` 由新 plugin 提供回调路由）
  2. 回调用 code 换 token → 解析 id_token（`go-oidc` 库）→ 取 `preferred_username`/email
  3. **写入现有 session 字段**（`WEBSessionUinKey`=username、`WEBSessionOwnerUinKey`="0"、token 存 `HTTPCookieBKToken` 位）——下游 `handleAuthedReq`、页面 header 全部无感知复用
  4. 首次登录可选自动创建 CMDB 用户（写入 bk_user 模型或仅 session 级，P0 先 session 级）
- 配置（web.yaml 新增节）：
  ```yaml
  webServer:
    oidc:
      issuerUrl: https://casdoor.example.com
      clientId: bk-cmdb
      clientSecret: "***"
      redirectUrl: http://cmdb.example.com/login/oidc/callback
      scopes: [openid, profile, email]
      autoCreateUser: true
  ```
- 兜底：保留本地管理员账号（web.yaml 哈希口令），IdP 不可用时可用 `?local=1` 走本地登录——解决"IdP 挂了进不去系统"的运维风险
- skip-login 保留为部署开关（测试环境/CI 继续用），生产配置切 `login.version: oidc`

### 4.2 授权层：Casbin 中间件

- 挂载点：`ValidLogin` 之后（登录成功才进鉴权），仅作用于 `/api/*` 代理路径与页面路由
- 数据面：policy 存 MongoDB（`cc_Policy` 集合，casbin-mongodb-adapter 现成），enforcer 启动加载 + watch 热更新
- 管理接口：`/api/v3/iam/policy/*`（查看/增删 policy，仅 admin 角色可调），ui-v3 后续加「权限管理」页

权限模型（初始版，够用且可演进）：

```ini
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act

[role_definition]
g = _, _, _        # 用户 → 角色(带业务域)

[matchers]
m = g(r.sub, p.sub, r.dom) && (r.dom == p.dom || p.dom == "*") && globMatch(r.obj, p.obj) && (r.act == p.act || p.act == "*")
```

资源类型映射（obj 取请求路径第一段语义，中间件内做 path→(dom,obj,act) 归一）：

| obj | 覆盖接口 | act 示例 |
|---|---|---|
| biz / biz_set / project | 业务、业务集、项目 CRUD | create/update/delete/archive |
| topology | 业务拓扑（集群/模块/转移） | create/update/delete/transfer |
| host | 主机增删改查/转移/克隆 | create/update/delete/transfer |
| instance | 通用模型实例 | create/update/delete/export |
| model | 模型/字段/关联/分组 | create/update/delete |
| service-template / set-template / category | 服务模板/集群模板/分类 | create/update/delete/sync |
| proc | 进程管理 | * |
| cloud | 云账户/云区域/云发现 | create/update/delete/sync |
| audit / operation | 审计/运营 | read |
| global-config | 全局配置 | read/update |
| dyn-group / custom-field | 动态分组/自定义字段 | * |

初始策略（零配置即可用）：

```
p, admin, *, *, *
g, <IdP用户名>, admin, *        # 首个登录用户自动授予 admin（可配置关闭）
```

- `--enable-auth=false` 语义**保留不变** = 跳过 Casbin（单管理员模式，现有部署行为完全不变）；新增 `--auth-scheme=casbin` 开启
- 机器凭据：StandaloneAPIKeyProxy 保持现状（映射为 admin）；二期扩展多凭据时给每个 key 绑定 Casbin subject 即可复用同一模型

### 4.3 前端（ui-v3）

- 后端补一个 `/api/v3/iam/user_permission` 接口（返回当前用户 dom×obj×act 集合，来源同一 enforcer）
- ui-v3 新增权限指令（如 `v-perm="{ obj: 'biz', act: 'create' }"`）控制按钮禁用/隐藏态，对齐老版"无权限灰置"体验
- 权限管理页（P2）：用户列表（IdP 只读）+ 角色绑定矩阵

## 5. 分阶段实施计划

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P0 登录**（约 1 周） | oidc plugin + 本地兜底账号 + docker-compose 加 Casdoor 容器；`--enable-auth` 保持 false | 用 Casdoor 账号登录/登出；skip-login 开关仍可用；E2E 全绿（route-smoke 补登录态用例） |
| **P1 接口 RBAC**（约 1-2 周） | Casbin enforcer + path 归一 + policy 管理 API；`--auth-scheme=casbin` 开关 | 非 admin 用户访问未授权接口返回 403 带 actionable 提示；admin 全通 |
| **P2 资源域**（约 2 周） | 业务维度 domain 策略（业务/业务集/项目范围）；创建者自动授权（替代 RegisterResourceCreatorAction 语义）；ui-v3 权限指令 + 权限管理页 | A 用户只 sees/操作其所属业务；创建业务后自动成为其 admin |
| **P3 收尾** | 老前端下线门禁核对；多凭据 API-Key 绑定角色；文档 + 默认策略模板 | 生产化检查单全过 |

依赖关系：P0/P1 不阻塞旧前端下线评估；**P2 完成才算"完整替代"门禁达成**（多用户真实使用的前提）。

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| IdP 单点故障 | 本地兜底账号（哈希口令存配置），会话保持 redis 重启不丢 |
| path→权限点归一遗漏（老接口深链/特殊路由） | 归一器单测覆盖迁移矩阵全部 23 页涉及的接口路径；默认 deny 时提供白名单开关过渡 |
| Casbin 性能（大 policy 热更新） | enforcer 内存态 + policy 量级小（千级以内）；watch 热更即可 |
| 与 scene_server 现有 IAM 调用点的双轨混乱 | 明确承诺：服务内 IAM 链路永久短路（enable-auth=false 语义冻结），鉴权只在边缘层；代码注释同步 |
| 首个 admin 引导 | 配置项指定 bootstrap 管理员用户名列表，登录即授 admin |

## 7. 明确不做

- 不对接蓝鲸 ESB/IAM 任何组件（含 auth_server 的 IAM proxy 角色）
- P0/P1 不做服务间 mTLS/服务网格化——JWT 边缘签名链路沿用
- 不做租户体系扩展（supplier account 维持 "0" 单租户）
