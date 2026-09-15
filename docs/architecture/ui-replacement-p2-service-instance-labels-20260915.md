# P2 服务实例标签真实闭环 — 2026-09-15

## 旧版事实

旧版服务实例标签是 `map[string]string`，后端接口：

```text
POST   /createmany/proc/service_instance/labels
POST   /updatemany/proc/service_instance/labels
DELETE /deletemany/proc/service_instance/labels
POST   /findmany/proc/service_instance/labels/aggregation
```

标签没有独立 creator/create_time record；后端语义是：

- add：合并写入，key 覆盖 value；
- update：整体替换指定实例的 labels map；
- delete：按 key 删除；
- aggregation：返回 `{ key: values[] }`。

## v3 本批修改

`src/ui-v3/src/views/service/ServiceInstance.vue`：

- 删除不存在的 creator/create_time 假字段；
- 单条标签支持新增、编辑、删除；
- 编辑使用完整 `updateInstanceLabels` map；
- 批量编辑可新增/删除已有 key，分别调用 add/delete API；
- 复刻后端 key/value 字符集、首尾字符和 63 字符长度限制；
- 重复 key 前端阻止；
- 操作成功后刷新列表并重新取当前实例 labels，不做 optimistic 假回写。

`src/ui-v3/src/utils/service-instance-labels.js`：

- 提供 label map/rows 转换和纯校验函数，避免组件复制规则。

## 证据

- v3 构建：通过；
- 旧 `run-b13.cjs` 浏览器回归：当前执行环境 Playwright 模块解析失败，未宣称通过；
- 真实后端读回：需要专用可写基础设施和有效服务实例夹具，当前共享 standalone 不执行 destructive runner；
- 下一步应扩展 B13 或新增 contract runner，断言 create/update/delete 的 method/body 和列表 read-back。

## 边界

- BusinessTopo 旧入口仍只有批量新增标签，下一批需将同一能力接入旧深链承接的业务拓扑服务实例 tab；
- aggregation 标签筛选仍待接入；
- 模板服务实例的标签权限需真实 IAM 环境单独验证。
