import { describe, expect, it } from 'vitest'
import { buildGraphIndex } from '../../src/renderer/core/graph'
import { validatePack } from '../../src/renderer/core/schema'
import {
  emptyProgress,
  lightLeaf,
  orphanedLitIds,
  toggleLearning
} from '../../src/renderer/core/progress'
import { miniPack } from '../fixtures/mini'

const validation = validatePack(JSON.parse(JSON.stringify(miniPack)))
if (!validation.ok) throw new Error('fixture 校验失败: ' + validation.errors.join('; '))
const index = buildGraphIndex(validation.pack)

describe('emptyProgress', () => {
  it('字段齐全且 xp 为 0', () => {
    const p = emptyProgress('mini')
    expect(p).toEqual({ packId: 'mini', lit: {}, learning: {}, xp: 0, history: [] })
  })
})

describe('lightLeaf', () => {
  it('点亮 +2 xp 并写入 history', () => {
    let p = emptyProgress('mini')
    p = lightLeaf(p, 'u1.k1', index, '2026-11-08T10:00:00Z')
    expect(p.lit['u1.k1']?.at).toBe('2026-11-08T10:00:00Z')
    expect(p.xp).toBe(2)
    expect(p.history).toEqual([{ id: 'u1.k1', at: '2026-11-08T10:00:00Z', xp: 2 }])
  })
  it('重复点亮幂等', () => {
    let p = emptyProgress('mini')
    p = lightLeaf(p, 'u1.k1', index, '2026-11-08T10:00:00Z')
    const before = JSON.stringify(p)
    p = lightLeaf(p, 'u1.k1', index, '2026-11-08T11:00:00Z')
    expect(JSON.stringify(p)).toBe(before)
  })
  it('不存在的节点不点亮', () => {
    let p = emptyProgress('mini')
    p = lightLeaf(p, 'ghost', index, '2026-11-08T10:00:00Z')
    expect(p.xp).toBe(0)
    expect(Object.keys(p.lit)).toHaveLength(0)
  })
})

describe('toggleLearning', () => {
  it('加后删', () => {
    let p = emptyProgress('mini')
    p = toggleLearning(p, 'b1', '2026-11-08')
    expect(p.learning['b1']).toBe('2026-11-08')
    p = toggleLearning(p, 'b1', '2026-11-08')
    expect(p.learning['b1']).toBeUndefined()
  })
})

describe('orphanedLitIds', () => {
  it('pack 中不存在的点亮 id 被识别', () => {
    let p = emptyProgress('mini')
    p = lightLeaf(p, 'u1.k1', index, '2026-11-08T10:00:00Z')
    p.lit['ghost'] = { at: '2026-11-08T10:00:00Z' }
    expect(orphanedLitIds(p, index)).toEqual(['ghost'])
  })
})
