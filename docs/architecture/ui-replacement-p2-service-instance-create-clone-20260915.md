# P2 服务实例 create/clone parity — 2026-09-15

## 旧版事实

旧版服务实例 create/clone 最终都调用：

```text
POST /api/v3/create/proc/service_instance
```

payload 需要保留：

- `bk_biz_id`；
- `bk_module_id`；
- `instances[].bk_host_id`；
- `service_instance_name`；
- `processes[].process_info`；
- raw 进程的完整 `bind_info`；
- 模板进程的 `process_template_id`。

旧版没有可用的 `/create/proc/service_instance/preview` handler；v3 不应调用不存在的 preview 路由。

## 本批修复

### `ServiceInstance.vue`

- 移除不存在的 `previewCreateServiceInstances` 调用；
- clone 直接调用真实 create API；
- clone 必须选择目标模块和目标主机；
- 模板实例不显示裸实例 clone 入口；
- 保留源进程完整属性，不再白名单丢弃 `bind_info` 等字段；
- clone 成功后刷新列表。

### `BusinessTopo.vue`

- BusinessTopo clone 增加目标主机选择；
- 排除源主机，避免错误地把 clone 发回原主机；
- 模板实例不允许裸实例 clone；
- raw 模块候选主机允许复用模块内主机；模板模块才使用“无服务实例主机”限制；
- 服务实例 tab 查询增加当前模块条件；
- 模板进程查询使用后端实际的单数 `service_template_id`；
- 模板进程保留 `process_template_id`；
- 模板属性兼容 `{value, as_default_value}`，并统一 `bind_info` payload。

### `cmdb.js`

`searchServiceInstances` 增加可选 `moduleId`，独立服务实例页继续业务级查询，BusinessTopo 使用模块级查询。

### `service-instance-payload.js`

新增 raw clone payload helper：

- 保留完整进程属性；
- 将旧的顶层 `bk_bind_ip/port` 兼容归一到 `bind_info`；
- 不再伪造不存在的字段或调用未注册 preview。

## 验证

- v3 isolated build：通过；
- 当前环境 Playwright 模块解析不稳定，浏览器回归需设置可解析的 `PLAYWRIGHT_MODULE_PATH` 后执行；
- 真实 create/clone read-back 需要业务、模块、主机夹具，当前共享 standalone 不执行 destructive 写入。

下一步应扩展 B40 为真实请求 contract：捕获 create body、目标 host、bind_info、模板 process_template_id，并在专用环境 read-back 实例/进程。
