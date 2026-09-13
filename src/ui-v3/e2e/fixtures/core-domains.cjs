function ok(data) { return { result: true, code: 0, message: 'success', permission: null, data } }
function error(code, message, permission = null) { return { result: false, bk_error_code: code, bk_error_msg: message, permission, data: null } }
module.exports = {
  ok, error,
  iam: { allow: ok([{ is_pass: true }]), deny: (r) => ok([{ ...r, is_pass: false }]), skipUrl: ok('https://iam.example.test/apply/mock-123') },
  kube: { pods: ok({ count: 1, info: [{ id: 101, name: 'pod-mock-1', namespace: 'default', labels: { app: 'cmdb' }, ip: '10.0.0.10', ips: [], status: 'Running' }] }), containers: ok({ count: 1, info: [{ id: 201, name: 'cmdb', container_uid: 'container-mock-1', image: 'cmdb:test', ports: [], args: [], started: true, limits: {}, requests: {}, liveness: {}, environment: {}, mounts: [] }] }), podPath: ok({ info: [{ bk_biz_id: 2, bk_cluster_id: 1, bk_namespace_id: 1, bk_workload_id: 1, workload_type: 'deployment', pod_id: 101 }] }) },
  fullText: ok({ total: 1, aggregations: [{ kind: 'instance', key: 'host', count: 1 }], hits: [{ kind: 'instance', key: 'host', source: { bk_host_name: 'mock-host', bk_host_innerip: '10.0.0.10' }, highlight: {} }], attrs: { attributes: {}, groups: {} } }),
  service: { previewCreate: ok({ count: 1, info: [{ action: 'create', service_instance_name: 'mock-service' }] }), previewDelete: ok({ count: 1, info: [{ id: 301, name: 'mock-service' }] }), taskPending: ok({ task_ids: ['task-mock-1'] }), taskDone: ok({ info: [{ task_id: 'task-mock-1', status: 'success' }] }) },
  template: { attributeDiff: ok({ created: [{ id: 'new' }], updated: [], conflict: [] }), uniqueDiff: ok({ created: [], updated: [], conflict: [] }), syncTasks: ok({ task_ids: ['task-template-1'] }), taskDone: ok({ info: [{ task_id: 'task-template-1', status: 'success' }] }) },
  network: { unavailable: error(404, 'collector network service unavailable') }
}
