export function normalizeProcessInfo(property = {}) {
  const info = { ...property }
  if (!Array.isArray(info.bind_info)) {
    const bindIp = info.bk_bind_ip || info.bind_ip
    const port = info.port || info.bk_port
    if (bindIp || port) info.bind_info = [{ ip: bindIp || '127.0.0.1', port: port || '', protocol: info.protocol || '1', enable: info.enable !== false }]
  }
  delete info.bk_bind_ip
  delete info.bk_port
  delete info.protocol
  delete info.enable
  return info
}

export function buildRawCloneInstance(source, hostId, name) {
  return {
    bk_host_id: hostId,
    service_instance_name: name || `${source?.name || source?.id || '实例'}-clone`,
    processes: (source?.processes || []).map((process) => ({ process_info: normalizeProcessInfo(process?.property || process || {}) }))
  }
}
