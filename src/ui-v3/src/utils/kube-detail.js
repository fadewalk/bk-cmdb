export const KUBE_POD_LIST_FIELDS = ['id', 'name', 'namespace', 'labels', 'ip', 'ips', 'status']

export const KUBE_POD_DETAIL_FIELDS = [
  'id', 'name', 'bk_biz_id', 'bk_cluster_id', 'bk_namespace_id', 'bk_node_id', 'bk_host_id',
  'namespace', 'labels', 'ip', 'ips', 'status', 'priority', 'controlled_by', 'container_uid',
  'qos_class', 'volumes', 'node_selectors', 'tolerations', 'operator', 'ref'
]

export const KUBE_CONTAINER_DETAIL_FIELDS = [
  'id', 'name', 'bk_pod_id', 'bk_biz_id', 'bk_cluster_id', 'bk_namespace_id', 'ref',
  'container_uid', 'image', 'ports', 'host_ports', 'args', 'started', 'limits', 'requests',
  'liveness', 'environment', 'mounts'
]

const POD_LABELS = {
  id: 'ID',
  name: 'Pod 名称',
  bk_biz_id: '业务 ID',
  bk_cluster_id: '所属 Cluster',
  bk_namespace_id: '所属 Namespace',
  bk_node_id: '所属 Node',
  bk_host_id: '主机 ID',
  namespace: '所属命名空间',
  labels: 'Pod 标签',
  ip: 'Pod 容器网络IP',
  ips: 'Pod 容器网络IPs',
  status: '状态',
  priority: 'Pod 优先级',
  controlled_by: '所属副本控制器',
  container_uid: '容器ID',
  qos_class: 'Pod 服务质量',
  volumes: 'Pod 卷信息',
  node_selectors: '将 Pod 指派给节点',
  tolerations: 'Pod 污点',
  operator: '负责人',
  ref: '所属 Workload'
}

const CONTAINER_LABELS = {
  id: 'ID',
  name: '名称',
  bk_pod_id: '所属 Pod',
  bk_biz_id: '业务 ID',
  bk_cluster_id: '所属 Cluster',
  bk_namespace_id: '所属 Namespace',
  ref: '所属 Workload',
  container_uid: '容器ID',
  image: '镜像信息',
  ports: '容器端口',
  host_ports: '主机端口映射',
  args: '启动参数',
  started: '启动时间',
  limits: '资源限制',
  requests: '申请资源大小',
  liveness: '存活探针',
  environment: '环境变量',
  mounts: '挂载卷'
}

export function kubePropertyLabel(field, object = 'pod') {
  const labels = object === 'container' ? CONTAINER_LABELS : POD_LABELS
  return labels[field] || field
}

export function normalizeKubeAttributes(attributes, object = 'pod') {
  const list = Array.isArray(attributes) ? attributes : (attributes?.info || [])
  return list.map((attribute) => ({
    ...attribute,
    field: attribute.field || attribute.bk_property_id,
    label: kubePropertyLabel(attribute.field || attribute.bk_property_id, object)
  })).filter((attribute) => attribute.field)
}

export function formatKubeValue(value) {
  if (value === null || value === undefined || value === '') return '--'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  return String(value)
}
