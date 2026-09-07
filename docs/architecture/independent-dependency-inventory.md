# 独立化依赖基线

> 这份清单用于指导蓝鲸适配删除。目录删除前必须重新生成并复核；不能仅凭目录名或配置开关删除代码。

## 分析环境

- Repository: `/Volumes/xwssd/code/bk-cmdb`
- Branch: `standalone-docker`
- Working-tree HEAD at baseline: `660eade575`
- GitNexus index commit: `660eade575`
- Index status: up-to-date
- Refresh command: `pnpm --allow-build=@ladybugdb/core --allow-build=gitnexus --allow-build=tree-sitter --allow-build=tree-sitter-kotlin --allow-build=tree-sitter-swift --allow-build=tree-sitter-c-sharp --allow-build=tree-sitter-c dlx gitnexus@latest analyze`
- Refresh result: successful incremental analysis; 52,445 nodes, 219,310 edges, 300 execution flows.
- The initial refresh was blocked by missing native parser packages; parser builds were then enabled explicitly and the current index was regenerated successfully.

## Preliminary external caller counts

These counts came from the existing GitNexus graph and are not a substitute for a refreshed index:

| Package | External `CALLS` edges | Preliminary action |
|---|---:|---|
| `src/ac/iam` | 72 | replace with neutral authorization provider first |
| `src/thirdparty/monitor` | 31 | keep interface; use noop/OTel implementation |
| `src/common/resource/esb` | 21 | remove after web/login callers migrate |
| `src/common/resource/apigw` | 8 | remove after web callers migrate |
| `src/thirdparty/apigw` | 7 | remove after BlueKing deployment branch is gone |
| `src/thirdparty/gse` | 7 | replace only GSE/NodeMan boundary; keep collection business logic |
| `src/thirdparty/esbserver` | 4 | remove after BlueKing login/ESB callers migrate |
| `src/scene_server/auth_server` | 3 | remove only after local authorization replacement |
| `src/common/backbone` | 284 | internal CMDB mainline; do not treat as BlueKing adapter |
| `src/apimachinery/discovery` | 16 | internal discovery contract; keep while ZooKeeper is retained |

## Symbol impact samples

The following impacts were run before changing any authentication or service symbol:

| Symbol | Direction | Result | Meaning |
|---|---|---|---|
| `initWebService` in `src/web_server/app/server.go` | upstream | LOW, 2 symbols | app/options wiring |
| `ValidLogin` in `src/web_server/middleware/login.go` | upstream | HIGH, 3 symbols | web app and middleware path |
| `handleAuthedReq` in `src/web_server/middleware/login.go` | upstream | HIGH, 3 symbols | authenticated request proxy path |
| `authFilter` in `src/apiserver/service/filter.go` | upstream | LOW, 0 callers in index | verify with fresh index before editing |
| `verifyAuthorizeStatus` in `src/apiserver/service/filter.go` | upstream | LOW, 1 direct caller | authorization request path |
| `NewAuthorizer` in `src/ac/iam/iam.go` | upstream | HIGH, 22 symbols, 1 process | IAM replacement is a high-risk change |
| `ApiGWMiddleware` in `src/web_server/middleware/apigw.go` | upstream | LOW, 0 callers in index | candidate for deletion after route check |
| `InitEsbClient` in `src/common/resource/esb/esb.go` | upstream | LOW, 7 symbols | ESB adapter has a small caller set |

## Current active standalone boundary

The standalone core profile builds/starts:

```text
apiserver
web_server
admin_server
topo_server
host_server
proc_server
event_server
task_server
datacollection
operation_server
coreservice
cacheservice
```

The following business services remain in source and are not deleted by the current plan:

```text
cloud_server
synchronize_server
transfer-service
```

They may be omitted from a deployment profile, but their cloud discovery, cross-CMDB synchronization, and transfer logic remain available for later profiles. Only their BlueKing/GSE/ESB/API Gateway adapters are candidates for replacement.

## Deletion gate

Before deleting any package or symbol:

1. Refresh GitNexus successfully, or document why the parser/runtime issue has been fixed or separately worked around.
2. Run `impact --direction upstream` for the exact symbol/file.
3. Run `go list -deps` and repository-wide import/reference scans.
4. Replace every active caller or prove it belongs only to an unused compatibility build.
5. Run `go test ./...`, standalone build, API contract checks, and a clean-data deployment.
6. Run `detect-changes --scope all` and compare with `master` before committing.
