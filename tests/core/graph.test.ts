import { describe, expect, it } from 'vitest'
import { validatePack } from '../../src/renderer/core/schema'
import {
  aggregateState,
  buildGraphIndex,
  detectCycle,
  isLit,
  leafAvailable,
  minimalHardClosure,
  unitAvailable
} from '../../src/renderer/core/graph'
import type { Pack } from '../../src/renderer/core/types'

// 统一 fixture（与 dev-mini.json 同构）：
// b1(D1){ u1(3叶,无前置); u2(2叶, hard←u1) }; b2(D2){ u3(1叶, hard←u2) }
const mini: Pack = {
  schema: 'litree/pack-v1',
  id: 'mini',
  title: { zh: 'mini' },
  domains: [
    { id: 'D1', name: '域一', color: '#3DD6C3' },
    { id: 'D2', name: '域二', color: '#F0B429' }
  ],
  nodes: [
    { id: 'b1', parent: null, kind: 'branch', title: { zh: '分支一' }, domain: 'D1' },
    { id: 'u1', parent: 'b1', kind: 'unit', title: { zh: '单元一' }, domain: 'D1', core: true },
    { id: 'u1.k1', parent: 'u1', kind: 'leaf', title: { zh: '点一' }, domain: 'D1' },
    { id: 'u1.k2', parent: 'u1', kind: 'leaf', title: { zh: '点二' }, domain: 'D1' },
    { id: 'u1.k3', parent: 'u1', kind: 'leaf', title: { zh: '点三' }, domain: 'D1' },
    { id: 'u2', parent: 'b1', kind: 'unit', title: { zh: '单元二' }, domain: 'D1', core: true },
    { id: 'u2.k1', parent: 'u2', kind: 'leaf', title: { zh: '点四' }, domain: 'D1' },
    { id: 'u2.k2', parent: 'u2', kind: 'leaf', title: { zh: '点五' }, domain: 'D1' },
    { id: 'b2', parent: null, kind: 'branch', title: { zh: '分支二' }, domain: 'D2' },
    { id: 'u3', parent: 'b2', kind: 'unit', title: { zh: '单元三' }, domain: 'D2', core: true },
    { id: 'u3.k1', parent: 'u3', kind: 'leaf', title: { zh: '点六' }, domain: 'D2' }
  ],
  edges: [
    { from: 'u1', to: 'u2', type: 'hard', reason: '单元一先学' },
    { from: 'u2', to: 'u3', type: 'hard', reason: '单元二先学' }
  ]
}

const validation = validatePack(JSON.parse(JSON.stringify(mini)))
if (!validation.ok) throw new Error('fixture 校验失败: ' + validation.errors.join('; '))
const pack = validation.pack
const index = buildGraphIndex(pack)

const U1_LEAVES = ['u1.k1', 'u1.k2', 'u1.k3']
const ALL_LEAVES = [...U1_LEAVES, 'u2.k1', 'u2.k2', 'u3.k1']
const litSet = (ids: string[]) => new Set(ids)

describe('unitAvailable / leafAvailable（硬门控）', () => {
  it('u2 在 u1 未亮时锁定', () => {
    expect(unitAvailable('u2', index, litSet([]))).toBe(false)
  })
  it('u1 全部叶子点亮后 u2 可用', () => {
    expect(unitAvailable('u2', index, litSet(U1_LEAVES))).toBe(true)
  })
  it('叶子随所属单元门控', () => {
    expect(leafAvailable('u1.k1', index, litSet([]))).toBe(true)
    expect(leafAvailable('u3.k1', index, litSet([]))).toBe(false)
    expect(leafAvailable('u3.k1', index, litSet(ALL_LEAVES.slice(0, 5)))).toBe(true)
  })
})

describe('aggregateState（四态聚合）', () => {
  it('空进度: u2 locked、u1 available、b2 locked', () => {
    expect(aggregateState('u2', index, litSet([]), {})).toBe('locked')
    expect(aggregateState('u1', index, litSet([]), {})).toBe('available')
    expect(aggregateState('b2', index, litSet([]), {})).toBe('locked')
    expect(aggregateState('b1', index, litSet([]), {})).toBe('available')
  })
  it('u1 全亮: u1=lit、u2=available、b1=available（u2 未全亮）', () => {
    expect(aggregateState('u1', index, litSet(U1_LEAVES), {})).toBe('lit')
    expect(aggregateState('u2', index, litSet(U1_LEAVES), {})).toBe('available')
    expect(aggregateState('b1', index, litSet(U1_LEAVES), {})).toBe('available')
  })
  it('u2 全亮后 b1=lit', () => {
    expect(aggregateState('b1', index, litSet([...U1_LEAVES, 'u2.k1', 'u2.k2']), {})).toBe('lit')
  })
  it('learning 标记任意层（lit 优先）', () => {
    expect(aggregateState('u1', index, litSet([]), { u1: '2026-11-08' })).toBe('learning')
    expect(aggregateState('u1', index, litSet(U1_LEAVES), { u1: '2026-11-08' })).toBe('lit')
  })
})

describe('detectCycle', () => {
  it('加入 u2→u1 hard 成环，路径首尾均为 u1', () => {
    const path = detectCycle({ from: 'u2', to: 'u1', type: 'hard' }, pack)
    expect(path).not.toBeNull()
    expect(path![0]).toBe('u1')
    expect(path![path!.length - 1]).toBe('u1')
  })
  it('不冲突的边返回 null', () => {
    expect(detectCycle({ from: 'u1', to: 'u3', type: 'soft' }, pack)).toBeNull()
  })
})

describe('minimalHardClosure（不含目标自身，按依赖深度排序）', () => {
  it('空进度: u3 的闭包为 [u1, u2]', () => {
    expect(minimalHardClosure('u3', index, litSet([]))).toEqual(['u1', 'u2'])
  })
  it('u1 全亮后: [u2]', () => {
    expect(minimalHardClosure('u3', index, litSet(U1_LEAVES))).toEqual(['u2'])
  })
  it('前置全亮后: 空数组', () => {
    expect(minimalHardClosure('u3', index, litSet([...U1_LEAVES, 'u2.k1', 'u2.k2']))).toEqual([])
  })
})

describe('isLit', () => {
  it('叶子按集合；容器按叶子后代全亮', () => {
    expect(isLit('u1.k1', index, litSet(['u1.k1']))).toBe(true)
    expect(isLit('u1', index, litSet(U1_LEAVES))).toBe(true)
    expect(isLit('u1', index, litSet(['u1.k1']))).toBe(false)
    expect(isLit('b1', index, litSet([...U1_LEAVES, 'u2.k1', 'u2.k2']))).toBe(true)
    expect(isLit('b1', index, litSet(U1_LEAVES))).toBe(false)
  })
})

describe('章分组层下的门控（终审 Critical 修复回归）', () => {
  // unit uC (hard←u1) → 章 c(branch) → 叶子挂在章下
  const chapterPack: Pack = {
    schema: 'litree/pack-v1',
    id: 'chapter-mini',
    title: { zh: 'chapter-mini' },
    domains: [{ id: 'D1', name: '域', color: '#3DD6C3' }],
    nodes: [
      { id: 'b', parent: null, kind: 'branch', title: { zh: '分支' }, domain: 'D1' },
      { id: 'uP', parent: 'b', kind: 'unit', title: { zh: '前置单元' }, domain: 'D1', core: true },
      { id: 'uP.k1', parent: 'uP', kind: 'leaf', title: { zh: '前置叶' }, domain: 'D1' },
      { id: 'uC', parent: 'b', kind: 'unit', title: { zh: '分组单元' }, domain: 'D1', core: true },
      { id: 'uC.c0', parent: 'uC', kind: 'branch', title: { zh: '第一章' }, domain: 'D1' },
      { id: 'uC.c0.k0', parent: 'uC.c0', kind: 'leaf', title: { zh: '章下叶A' }, domain: 'D1' },
      { id: 'uC.c0.k1', parent: 'uC.c0', kind: 'leaf', title: { zh: '章下叶B' }, domain: 'D1' }
    ],
    edges: [{ from: 'uP', to: 'uC', type: 'hard', reason: '前置' }]
  }
  const v = validatePack(JSON.parse(JSON.stringify(chapterPack)))
  if (!v.ok) throw new Error('chapter fixture 校验失败: ' + v.errors.join('; '))
  const ci = buildGraphIndex(v.pack)

  it('前置未点亮时，章下叶子不可点亮（沿 parent 链上溯到 unit）', () => {
    expect(leafAvailable('uC.c0.k0', ci, litSet([]))).toBe(false)
    expect(unitAvailable('uC', ci, litSet([]))).toBe(false)
  })
  it('前置单元叶子全亮后，章下叶子可点亮', () => {
    expect(leafAvailable('uC.c0.k0', ci, litSet(['uP.k1']))).toBe(true)
  })
  it('章分支的聚合状态随单元门控', () => {
    expect(aggregateState('uC.c0', ci, litSet([]), {})).toBe('locked')
    expect(aggregateState('uC.c0', ci, litSet(['uP.k1']), {})).toBe('available')
  })
})
