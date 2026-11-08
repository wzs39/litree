import type { Pack, PackEdge, PackNode } from './types'

export type ValidationResult = { ok: true; pack: Pack } | { ok: false; errors: string[] }

const SCHEMA = 'litree/pack-v1'
const KINDS = new Set(['branch', 'unit', 'leaf'])
const EDGE_TYPES = new Set(['hard', 'soft'])

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function validTitle(v: unknown): boolean {
  return isRecord(v) && typeof v['zh'] === 'string' && (v['zh'] as string).length > 0
}

/** Kahn 拓扑：unit 子图（hard+soft 全部边）是否无环 */
function hasEdgeCycle(nodes: PackNode[], edges: PackEdge[]): string[] | null {
  const units = new Set(nodes.filter((n) => n.kind === 'unit').map((n) => n.id))
  const inDeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const id of units) {
    inDeg.set(id, 0)
    adj.set(id, [])
  }
  for (const e of edges) {
    if (!units.has(e.from) || !units.has(e.to)) continue
    adj.get(e.from)!.push(e.to)
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1)
  }
  const queue = [...units].filter((id) => (inDeg.get(id) ?? 0) === 0)
  let visited = 0
  while (queue.length > 0) {
    const cur = queue.pop()!
    visited++
    for (const next of adj.get(cur) ?? []) {
      const d = (inDeg.get(next) ?? 0) - 1
      inDeg.set(next, d)
      if (d === 0) queue.push(next)
    }
  }
  if (visited === units.size) return null
  // 找出环上的节点用于错误信息
  const onCycle = [...units].filter((id) => (inDeg.get(id) ?? 0) > 0)
  return onCycle
}

export function validatePack(raw: unknown): ValidationResult {
  const errors: string[] = []
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['数据包必须是 JSON 对象'] }
  }
  const o = raw as Record<string, unknown>
  if (o['schema'] !== SCHEMA) {
    errors.push(`schema 字段必须为 "${SCHEMA}"`)
  }
  if (typeof o['id'] !== 'string' || o['id'].length === 0) {
    errors.push('id 必须为非空字符串')
  }
  if (!validTitle(o['title'])) {
    errors.push('title.zh 必须为非空字符串')
  }
  const domains = o['domains']
  const domainIds = new Set<string>()
  if (!Array.isArray(domains)) {
    errors.push('domains 必须为数组')
  } else {
    for (const d of domains) {
      if (isRecord(d) && typeof d['id'] === 'string') domainIds.add(d['id'])
      else errors.push('domains 项缺少 id')
    }
  }

  const nodes = o['nodes']
  const nodeById = new Map<string, PackNode>()
  if (!Array.isArray(nodes)) {
    errors.push('nodes 必须为数组')
  } else {
    for (const n of nodes) {
      if (!isRecord(n) || typeof n['id'] !== 'string') {
        errors.push('节点缺少 id')
        continue
      }
      const id = n['id']
      if (nodeById.has(id)) {
        errors.push(`节点 id 重复: ${id}`)
        continue
      }
      const kind = n['kind']
      if (typeof kind !== 'string' || !KINDS.has(kind)) {
        errors.push(`节点 ${id} kind 非法: ${String(kind)}`)
      }
      if (!validTitle(n['title'])) {
        errors.push(`节点 ${id} title.zh 必须为非空字符串`)
      }
      const domain = n['domain']
      if (typeof domain !== 'string' || !domainIds.has(domain)) {
        errors.push(`节点 ${id} 引用未声明的 domain: ${String(domain)}`)
      }
      const parent = n['parent']
      if (parent !== null && typeof parent !== 'string') {
        errors.push(`节点 ${id} parent 必须为 null 或字符串`)
      }
      nodeById.set(id, n as unknown as PackNode)
    }
    // parent 存在性 + 链无环
    for (const node of nodeById.values()) {
      const parent = node.parent
      if (parent !== null && !nodeById.has(parent)) {
        errors.push(`节点 ${node.id} 的 parent 不存在: ${parent}`)
      }
    }
    // 叶子必须有 unit 祖先（门控语义依赖 unit 层；章分组叶子的 unit 在祖先链上）
    for (const node of nodeById.values()) {
      if (node.kind !== 'leaf') continue
      let cur = node.parent
      let hasUnit = false
      let guard = 0
      while (cur !== null && guard++ < 64) {
        const p = nodeById.get(cur)
        if (p === undefined) break
        if (p.kind === 'unit') {
          hasUnit = true
          break
        }
        cur = p.parent
      }
      if (!hasUnit) {
        errors.push(`叶子 ${node.id} 的祖先链上没有 unit 节点，无法挂接门控`)
      }
    }
    for (const node of nodeById.values()) {
      const seen = new Set<string>([node.id])
      let cur = node.parent
      while (cur !== null) {
        if (seen.has(cur)) {
          errors.push(`节点 ${node.id} 的 parent 链成环`)
          break
        }
        seen.add(cur)
        const p = nodeById.get(cur)
        if (p === undefined) break
        cur = p.parent
      }
    }
  }

  const edges = o['edges']
  const validEdges: PackEdge[] = []
  if (!Array.isArray(edges)) {
    errors.push('edges 必须为数组')
  } else {
    for (const e of edges) {
      if (!isRecord(e)) {
        errors.push('边必须是对象')
        continue
      }
      const from = e['from']
      const to = e['to']
      const type = e['type']
      if (typeof from !== 'string' || !nodeById.has(from)) {
        errors.push(`边 from 端点不存在: ${String(from)}`)
        continue
      }
      if (typeof to !== 'string' || !nodeById.has(to)) {
        errors.push(`边 to 端点不存在: ${String(to)}`)
        continue
      }
      if (from === to) {
        errors.push(`边自环: ${from}`)
        continue
      }
      if (typeof type !== 'string' || !EDGE_TYPES.has(type)) {
        errors.push(`边 ${from}→${to} type 非法: ${String(type)}`)
        continue
      }
      const fromNode = nodeById.get(from)!
      const toNode = nodeById.get(to)!
      if (fromNode.kind !== 'unit' || toNode.kind !== 'unit') {
        errors.push(`边 ${from}→${to} 的两端必须是 unit 节点`)
        continue
      }
      validEdges.push({ from, to, type: type as 'hard' | 'soft' })
    }
    const cycleNodes = hasEdgeCycle([...nodeById.values()], validEdges)
    if (cycleNodes !== null) {
      errors.push(`前置边成环（hard+soft 合并检测），环上节点: ${cycleNodes.join(' → ')}`)
    }
  }

  // routes（可选）：ids 必须存在且为 unit
  const routes = o['routes']
  if (routes !== undefined && routes !== null) {
    if (!Array.isArray(routes)) {
      errors.push('routes 必须为数组')
    } else {
      for (const rt of routes) {
        if (!isRecord(rt) || typeof rt['name'] !== 'string' || rt['name'].length === 0) {
          errors.push('routes 项缺少非空 name')
          continue
        }
        const ids = rt['ids']
        if (!Array.isArray(ids) || ids.length === 0) {
          errors.push(`路线 "${rt['name']}" 的 ids 必须为非空数组`)
          continue
        }
        for (const id of ids) {
          const node = typeof id === 'string' ? nodeById.get(id) : undefined
          if (node === undefined) {
            errors.push(`路线 "${rt['name']}" 引用不存在的节点: ${String(id)}`)
          } else if (node.kind !== 'unit') {
            errors.push(`路线 "${rt['name']}" 引用了非 unit 节点: ${id}`)
          }
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    pack: {
      schema: SCHEMA,
      id: o['id'] as string,
      title: o['title'] as Pack['title'],
      domains: domains as Pack['domains'],
      nodes: [...nodeById.values()],
      edges: validEdges,
      ...(Array.isArray(routes) ? { routes: routes as Pack['routes'] } : {})
    }
  }
}
