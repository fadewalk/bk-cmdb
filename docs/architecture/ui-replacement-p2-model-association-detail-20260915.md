# P2 模型低频 caller：关联类型详情 — 2026-09-15

## 旧版事实

关联类型列表页面在查看/编辑行时需要拉取详情，而不是只使用列表行：

```text
POST /find/associationtype
```

当前 v3 已有 `/find/associationtype` wrapper，但过去没有 caller；本批将 `AssociationType.vue` 的行点击和编辑接入该详情读取：

- `condition.id` 使用当前关联类型 ID；
- `page.start=0/page.limit=1`；
- 成功后用详情回填抽屉；
- 失败显示错误且不打开空详情；
- 内置关联类型仍保持只读/保护语义。

## 同批 ModelDetail

当前 HEAD 已包含字段跨分组移动/解除分组 caller：

```text
PUT /update/objectattgroupproperty
DELETE /objectatt/group/owner/:owner/object/:obj/propertyids/:propertyids/groupids/:groupids
```

字段移动后 reload/read-back，失败显示错误。

## 验证

- `run-b46.cjs`：列表行详情 payload/read-back 和详情失败态；
- `run-b38.cjs`：字段分组改名、移动、清理、死接口守卫；
- v3 isolated build：通过；
- Playwright 运行依赖若不可加载，保留 infra blocked，不伪造页面通过。
