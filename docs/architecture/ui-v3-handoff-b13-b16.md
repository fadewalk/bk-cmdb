# ui-v3 迁移接手记录（B13/B16 + 关联类型验收）

- 接手来源：`sess_d8d4ee63-1763-4654-9eeb-c65852476a19`，该会话最后停在关联类型页重写；`sess_640c35e7-a56e-407e-a541-8910aee63e10` 实际是后端架构评估，不是前端迁移执行会话。
- 本批修正：
  - `src/ui-v3/src/api/cmdb.js`：B13 改为 `POST /find/proc/service_template/general_difference` 和 `PUT /update/proc/service_instance/sync`；B16 标签列表改用后端真实的 labels aggregation 接口。
  - `src/ui-v3/src/views/business-sync/BusinessSync.vue`：增加业务/服务模板/模块选择链，使用后端要求的 `bk_biz_id/service_template_id/bk_module_id`，规范差异展示和同步请求。
  - `src/ui-v3/src/views/service/ServiceInstance.vue`：将 `{key: values[]}` 聚合标签响应适配为表格行。
  - `src/ui-v3/e2e/run-b5.cjs`、`run-b7.cjs`、`run-b10.cjs`：更新为当前 AssociationType drawer、HostList scope-tabs/dir-tree 结构，去除旧 `.group-item`/旧 dialog/tabs 断言。
- 验证：`npm run build`、`run-b5.cjs`、`run-b7.cjs`、`run-b10.cjs`、`run-b13.cjs`、后端 web/apiserver 包测试、Compose config、run.sh syntax 均通过。
- 已知噪声：B5 有历史测试数据重复名称 console error；B7 HostDetail 仍有旧页面路径触发的 `bk_biz_id` 校验警告；二者不阻塞本批主流程。
- 未完成迁移：`REPLACE_OLD_UI.md` 的 B13+ 其它项（进程模板独立子页、服务实例 4 步转移向导、xlsx 真解析、更多业务同步历史/标签聚合完善等）仍需后续批次。
