# P50 物理机 Host 导入验收证据 — 2026-09-14

## 已验证链路

使用真实 standalone CMDB、ui-v3 8090、官方 `/importtemplate/host` 下载的 Excel 模板生成隔离 fixture：

```text
POST /importtemplate/host
→ 生成 host sheet fixture
→ HostList UI setInputFiles
→ POST /hosts/import multipart params={op:1}
→ 后端返回 data.association={}
→ POST /hosts/import multipart params={op:2}
→ 返回 data.success=[Excel 行号]
→ /findmany/hosts/search/resource 读回 Host
→ finally DELETE /hosts/batch 清理
```

测试输出：

```text
✓ HostList import op=1/op=2 and read-back passed host=78
```

关键事实：

- `op=1` 是后端导入流程的关联表/第一步语义，不是普通主机行预览；不能把它误报为已解析主机数。
- `op=2` 才执行真实主机写入。
- 成功数组是 Excel 行号，不是 Host ID；Host ID 必须通过资源池读回获得。
- multipart 请求同时包含 `file` 和 JSON 字符串 `params`，Content-Type 使用 boundary。
- UI axios 已解包 response，导入结果应读取 `resp.success/resp.error`，同时兼容 `resp.data` 形态。
- 空 success/error 显示“未解析到可导入数据”，不显示成功 0 条。

## 回归结果

```text
npm ci && npm run build: passed
served bundle: index-B3LUZ6nY.js
web=200, healthz=200
run-host-import.cjs: passed
run-b16-batch-b.cjs: passed
run-b31.cjs: passed
run-route-smoke.cjs: passed
```

B16 还验证了真实主机属性批量编辑和读回；B31 验证主机表头、列配置、排序和分页。

## 本轮修复

`src/ui-v3/src/views/HostList.vue`：

- 修复导入预览错误读取 `resp.data.info` 的问题；
- 支持当前解包后的 `resp.success/resp.error`；
- 兼容未解包的 `resp.data.success/resp.data.error`；
- 修复空数组 truthy 导致“成功 0 条/失败 0 条”误展示的问题。

`src/ui-v3/e2e/run-host-import.cjs`：

- 官方模板生成真实 Excel fixture；
- 断言 op=1/op=2 multipart 请求；
- 读回主机名称/IP；
- 清理隔离测试主机；
- 失败时保留错误并让测试退出非零。

## 生产边界

这证明了受审计 Excel 初始化/补录路径可用，不等于物理机自动采集生产完成。生产还需要：

- 真实 Agent/资产系统作为持续事实源；
- Agent bind/unbind ownership 和 ui-v3 页面/API 方案；
- 多用户 IAM/OIDC、导入权限和审计；
- 资产唯一身份、重复/冲突处理、失联/报废状态策略；
- Secret manager、TLS、备份恢复和生产发布门禁。

云虚拟机真实 cloudserver/cloudsync 仍需云厂商凭据、网络和 secret manager，未在本次 P50 中宣称通过。
