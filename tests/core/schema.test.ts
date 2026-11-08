import { describe, expect, it } from 'vitest'
import { validatePack } from '../../src/renderer/core/schema'
import type { Pack } from '../../src/renderer/core/types'

// 计划 Task 2 fixture：b1 + u1/u2 + 3 叶 + hard u1→u2，domain D1
export const validPack: Pack = {
  schema: 'litree/pack-v1',
  id: 'mini',
  title: { zh: 'mini' },
  domains: [{ id: 'D1', name: '域一', color: '#3DD6C3' }],
  nodes: [
    { id: 'b1', parent: null, kind: 'branch', title: { zh: '分支一' }, domain: 'D1' },
    { id: 'u1', parent: 'b1', kind: 'unit', title: { zh: '单元一' }, domain: 'D1', core: true },
    { id: 'u1.k1', parent: 'u1', kind: 'leaf', title: { zh: '点一' }, domain: 'D1' },
    { id: 'u1.k2', parent: 'u1', kind: 'leaf', title: { zh: '点二' }, domain: 'D1' },
    { id: 'u1.k3', parent: 'u1', kind: 'leaf', title: { zh: '点三' }, domain: 'D1' },
    { id: 'u2', parent: 'b1', kind: 'unit', title: { zh: '单元二' }, domain: 'D1', core: true }
  ],
  edges: [{ from: 'u1', to: 'u2', type: 'hard', reason: 'r' }]
}

function cloneWith(mutate: (p: Pack) => void): unknown {
  const p: Pack = JSON.parse(JSON.stringify(validPack))
  mutate(p)
  return p
}

describe('validatePack', () => {
  it('合法包通过', () => {
    const r = validatePack(JSON.parse(JSON.stringify(validPack)))
    expect(r.ok).toBe(true)
  })

  it('重复 id 拒绝且错误含该 id', () => {
    const r = validatePack(
      cloneWith((p) => {
        p.nodes.push({ ...p.nodes[2]! })
      })
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join('\n')).toContain('u1.k1')
  })

  it('parent 不存在拒绝', () => {
    const r = validatePack(
      cloneWith((p) => {
        p.nodes[2]!.parent = 'ghost'
      })
    )
    expect(r.ok).toBe(false)
  })

  it('边端点不存在拒绝', () => {
    const r = validatePack(
      cloneWith((p) => {
        p.edges.push({ from: 'u1', to: 'ghost', type: 'soft' })
      })
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join('\n')).toContain('ghost')
  })

  it('未声明的 domain 拒绝', () => {
    const r = validatePack(
      cloneWith((p) => {
        p.nodes[1]!.domain = 'D9'
      })
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join('\n')).toContain('D9')
  })

  it('hard+soft 混合成环拒绝', () => {
    const r = validatePack(
      cloneWith((p) => {
        p.edges.push({ from: 'u2', to: 'u1', type: 'soft', reason: '反向参考' })
      })
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join('\n')).toContain('环')
  })

  it('hard 边仅限 unit 层（leaf 参与拒绝）', () => {
    const r = validatePack(
      cloneWith((p) => {
        p.edges.push({ from: 'u1.k1', to: 'u2', type: 'hard' })
      })
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join('\n')).toContain('unit')
  })

  it('soft 边同样仅限 unit 层', () => {
    const r = validatePack(
      cloneWith((p) => {
        p.edges.push({ from: 'u1.k1', to: 'u2', type: 'soft' })
      })
    )
    expect(r.ok).toBe(false)
  })

  it('schema 字段错误值拒绝', () => {
    const r = validatePack(cloneWith((p) => {
      ;(p as unknown as { schema: string }).schema = 'other/v1'
    }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join('\n')).toContain('schema')
  })

  it('parent 链成环拒绝', () => {
    const r = validatePack(
      cloneWith((p) => {
        // b1 的 parent 指到自己的后代 u1 → 环
        p.nodes[0]!.parent = 'u1'
        p.nodes[1]!.parent = 'b1'
      })
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join('\n')).toContain('环')
  })

  it('自环边拒绝', () => {
    const r = validatePack(
      cloneWith((p) => {
        p.edges.push({ from: 'u1', to: 'u1', type: 'hard' })
      })
    )
    expect(r.ok).toBe(false)
  })

  it('非法输入（null/数组/缺字段）拒绝且收集多条错误', () => {
    const r1 = validatePack(null)
    expect(r1.ok).toBe(false)
    const r2 = validatePack([1, 2, 3])
    expect(r2.ok).toBe(false)
    const r3 = validatePack({ schema: 'litree/pack-v1' })
    expect(r3.ok).toBe(false)
    if (!r3.ok) expect(r3.errors.length).toBeGreaterThan(1)
  })
})

describe('叶子必须有 unit 祖先（终审 Critical 防回归）', () => {
  it('叶子直接挂在 branch 下且无 unit 祖先 → 拒绝', () => {
    const p: Pack = JSON.parse(JSON.stringify(validPack))
    p.nodes.push({ id: 'b1.x', parent: 'b1', kind: 'leaf', title: { zh: '悬空叶' }, domain: 'D1' })
    const r = validatePack(p)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join('\n')).toContain('unit 节点')
  })
  it('叶子经章分组（branch）间接挂在 unit 下 → 通过', () => {
    const p: Pack = JSON.parse(JSON.stringify(validPack))
    p.nodes.push(
      { id: 'u1.c0', parent: 'u1', kind: 'branch', title: { zh: '章' }, domain: 'D1' },
      { id: 'u1.c0.k0', parent: 'u1.c0', kind: 'leaf', title: { zh: '章下叶' }, domain: 'D1' }
    )
    expect(validatePack(p).ok).toBe(true)
  })
})

describe('routes 可选字段（v2 路线首页数据）', () => {
  it('合法 routes 通过并保留', () => {
    const p: Pack = JSON.parse(JSON.stringify(validPack))
    p.routes = [
      { name: '入门路线', note: '先学单元一', ids: ['u1', 'u2'] }
    ]
    const r = validatePack(p)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.pack.routes?.[0]?.ids).toEqual(['u1', 'u2'])
  })
  it('routes 引用不存在的 id → 拒绝', () => {
    const p: Pack = JSON.parse(JSON.stringify(validPack))
    p.routes = [{ name: '坏路线', ids: ['u1', 'ghost'] }]
    const r = validatePack(p)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join('\n')).toContain('ghost')
  })
  it('routes 引用非 unit 节点 → 拒绝', () => {
    const p: Pack = JSON.parse(JSON.stringify(validPack))
    p.routes = [{ name: '坏路线', ids: ['u1.k1'] }]
    const r = validatePack(p)
    expect(r.ok).toBe(false)
  })
  it('routes 缺 name 或 ids 为空 → 拒绝', () => {
    const p: Pack = JSON.parse(JSON.stringify(validPack))
    p.routes = [{ name: '', ids: [] }]
    const r = validatePack(p)
    expect(r.ok).toBe(false)
  })
})
