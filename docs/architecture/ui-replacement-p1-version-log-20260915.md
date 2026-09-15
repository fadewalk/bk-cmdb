# P1-1 版本日志复刻 — 2026-09-15

## 旧版事实源

- Header 帮助菜单入口：`src/ui/src/components/layout/header.vue`；
- 版本列表/详情组件：`src/ui/src/components/version-log/index.vue`；
- API store：`src/ui/src/store/modules/api/version-log.js`。

契约：

```text
POST /findmany/changelog
POST /find/changelog/detail  { version: <version> }
```

旧版会按版本排序、识别 `is_current`、把当前版本写入 `localStorage.newVersion`，检测到新版本时自动打开日志；详情内容是 Markdown，空列表文案是“暂无版本日志”。

## v3 实现

- `src/ui-v3/src/api/cmdb.js`：新增 changelog list/detail API；
- `src/ui-v3/src/router/index.js`：新增 `/platform/version-log` 和 `/platform-management/version-log` 兼容入口；
- `src/ui-v3/src/layout/TheHeader.vue`：新增帮助菜单“版本日志”；
- `src/ui-v3/src/views/platform/VersionLog.vue`：版本列表、当前版本、详情、空态、加载态、错误/重试和自动打开；
- `src/ui-v3/src/utils/version-log.js`：排序、当前版本、自动打开和受限 Markdown 渲染；
- Markdown 先转义文本，只允许有限格式；原始 HTML/script 不会直接注入 `v-html`。

## 验证

纯单测：

```bash
node src/ui-v3/e2e/test-p1-version-log.cjs
```

mock E2E：

```bash
P1_VERSION_LOG_REPORT_PATH=/tmp/p1-version-log.json \
  node src/ui-v3/e2e/run-p1-version-log.cjs
```

覆盖：

- list method/path/body；
- 版本排序和当前版本标记；
- 详情 body `{version}`；
- Markdown 渲染和 XSS 过滤；
- 空态；
- 500 错误和重试；
- mock 与真实 backend 分层。

真实环境可用时还要验证真实 changelog API/read-back；mock 通过不能替代后端真实证据。

## 下一批

继续补非生态缺口：业务历史深链、HostApply 多阶段、Pod/Container 详情、字段模板 binding/sync、服务实例 create/clone，以及 45 个 v3 无 caller wrapper 的接入/删除判定。
