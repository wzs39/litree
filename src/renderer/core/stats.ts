/** 统计纯逻辑（spec §5/统计面板）：仅统计叶子；孤立点亮 id 不计入领域/总进度 */
import type { GraphIndex } from './graph'
import type { Progress } from './types'

export interface DomainStat {
  domainId: string
  lit: number
  total: number
}

export function domainStats(index: GraphIndex, litLeaves: Set<string>): DomainStat[] {
  // domain 是节点字段 token（lane id），不是容器节点 id——按字段聚合
  const counts = new Map<string, { lit: number; total: number }>()
  for (const domain of index.pack.domains) counts.set(domain.id, { lit: 0, total: 0 })
  for (const n of index.pack.nodes) {
    if (n.kind !== 'leaf') continue
    const c = counts.get(n.domain)
    if (c === undefined) continue
    c.total++
    if (litLeaves.has(n.id)) c.lit++
  }
  return index.pack.domains.map((d) => ({
    domainId: d.id,
    ...(counts.get(d.id) ?? { lit: 0, total: 0 })
  }))
}

export function overallProgress(
  index: GraphIndex,
  litLeaves: Set<string>
): { lit: number; total: number } {
  const stats = domainStats(index, litLeaves)
  return {
    lit: stats.reduce((a, s) => a + s.lit, 0),
    total: stats.reduce((a, s) => a + s.total, 0)
  }
}

export function recentHistory(
  progress: Progress,
  index: GraphIndex,
  limit: number
): { id: string; titleZh: string; at: string }[] {
  return [...progress.history]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
    .map((h) => ({
      id: h.id,
      titleZh: index.nodeById.get(h.id)?.title.zh ?? '（已不存在的知识点）',
      at: h.at
    }))
}
