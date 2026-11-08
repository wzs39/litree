import { describe, expect, it } from 'vitest'
import { buildGraphIndex } from '../../src/renderer/core/graph'
import { emptyProgress, lightLeaf } from '../../src/renderer/core/progress'
import { domainStats, overallProgress, recentHistory } from '../../src/renderer/core/stats'
import { validatePack } from '../../src/renderer/core/schema'
import { miniPack } from '../fixtures/mini'

const validation = validatePack(JSON.parse(JSON.stringify(miniPack)))
if (!validation.ok) throw new Error('fixture 校验失败: ' + validation.errors.join('; '))
const index = buildGraphIndex(validation.pack)

describe('domainStats', () => {
  it('全空: D1 0/5、D2 0/1；孤立 id 不计入', () => {
    const p = emptyProgress('mini')
    p.lit['ghost'] = { at: 'x' }
    const stats = domainStats(index, new Set(Object.keys(p.lit)))
    const d1 = stats.find((s) => s.domainId === 'D1')
    const d2 = stats.find((s) => s.domainId === 'D2')
    expect(d1).toEqual({ domainId: 'D1', lit: 0, total: 5 })
    expect(d2).toEqual({ domainId: 'D2', lit: 0, total: 1 })
  })
  it('点亮 u1 的 2 叶: D1 2/5', () => {
    let p = emptyProgress('mini')
    p = lightLeaf(p, 'u1.k1', index, 't1')
    p = lightLeaf(p, 'u1.k2', index, 't2')
    const d1 = domainStats(index, new Set(Object.keys(p.lit))).find((s) => s.domainId === 'D1')
    expect(d1).toEqual({ domainId: 'D1', lit: 2, total: 5 })
  })
})

describe('overallProgress', () => {
  it('点亮 u1 的 2 叶: 总进度 2/6', () => {
    let p = emptyProgress('mini')
    p = lightLeaf(p, 'u1.k1', index, 't1')
    p = lightLeaf(p, 'u1.k2', index, 't2')
    expect(overallProgress(index, new Set(Object.keys(p.lit)))).toEqual({ lit: 2, total: 6 })
  })
})

describe('recentHistory', () => {
  it('按时间降序并截断 limit；标题来自 pack', () => {
    let p = emptyProgress('mini')
    p = lightLeaf(p, 'u1.k1', index, '2026-11-08T10:00:00Z')
    p = lightLeaf(p, 'u1.k2', index, '2026-11-08T11:00:00Z')
    p = lightLeaf(p, 'u1.k3', index, '2026-11-08T12:00:00Z')
    const recent = recentHistory(p, index, 2)
    expect(recent.map((r) => r.id)).toEqual(['u1.k3', 'u1.k2'])
    expect(recent[0]!.titleZh).toBe('点三')
  })
  it('孤立 id 标题显示为占位', () => {
    const p = emptyProgress('mini')
    p.lit['ghost'] = { at: '2026-11-08T10:00:00Z' }
    p.history.push({ id: 'ghost', at: '2026-11-08T10:00:00Z', xp: 2 })
    const recent = recentHistory(p, index, 10)
    expect(recent[0]!.titleZh).toBe('（已不存在的知识点）')
  })
})
