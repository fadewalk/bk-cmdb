# P2/P3 K8s Pod/Container detail parity evidence

Date: 2026-09-15

## Implemented contract

- Pod list/detail uses the existing `searchKubePods` wrapper (`POST /findmany/kube/pod`).
- Pod detail loads topology with the existing `getKubePodPath` wrapper (`POST /find/kube/pod_path`, `{ bk_biz_id, ids: [podId] }`).
- Container list/detail uses the existing `searchKubeContainers` wrapper (`POST /findmany/kube/container`, including `bk_biz_id` and `bk_pod_id`).
- Attribute metadata uses the backend-registered `GET /find/kube/{object}/attributes` route through the new `searchKubeAttributes` wrapper; `bk_biz_id` is preserved as a query parameter.
- `/business/:bizId/index/pod/:podId/container/:containerId` redirects to the v3 Pod detail while preserving `containerId` and selecting the Container tab.

## UI parity scope

- Pod detail renders the Pod attribute tab and topology path (`业务 / Cluster / Namespace / Workload / Pod`).
- Pod detail renders the `Container(s)` tab and links to Container detail.
- Container detail renders Container metadata and attributes while retaining Pod topology context.
- K8s capability errors remain explicit dependency-blocked states; no mock data is presented as live K8s data.

## Isolated evidence

Runner: `src/ui-v3/e2e/run-p2-p3-k8s-detail.cjs`

The runner uses Playwright `page.route` mocks for request/response contract assertions and covers:

- Pod list to Pod detail;
- Pod attributes and topology path;
- Container list and Container attributes;
- Legacy container deep link;
- K8s dependency failure with no Container request;
- no unhandled requests and no page errors.

This evidence is contract/mock evidence only. It does not claim a live Kubernetes cluster, CMDB informer, or production K8s data path.
