import { describe, expect, it } from 'vitest'
import { buildGraphIndex } from '../../src/renderer/core/graph'
import { validatePack } from '../../src/renderer/core/schema'
import { layoutSubview } from '../../src/renderer/layout/elk'
import { miniPack } from '../fixtures/mini'

const validation = validatePack(JSON.parse(JSON.stringify(miniPack)))
if (!validation.ok) throw new Error('fixture 校验失败: ' + validation.errors.join('; '))
const index = buildGraphIndex(validation.pack)

describe('layoutSubview', () => {
  it('root 视图: 两个分支节点得到有限坐标', async () => {
    const layout = await layoutSubview(validation.pack, index, 'root')
    expect(layout.size).toBe(2)
    for (const id of ['b1', 'b2']) {
      const p = layout.get(id)
      expect(p).toBeDefined()
      expect(Number.isFinite(p!.x)).toBe(true)
      expect(Number.isFinite(p!.y)).toBe(true)
      expect(p!.width).toBeGreaterThan(0)
      expect(p!.height).toBeGreaterThan(0)
    }
  })

  it('u1 视图: 3 个叶子坐标有限且互不重叠', async () => {
    const layout = await layoutSubview(validation.pack, index, 'u1')
    expect(layout.size).toBe(3)
    const pos = [...layout.values()]
    for (const a of pos) expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true)
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i]!
        const b = pos[j]!
        const separated =
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y
        expect(separated).toBe(true)
      }
    }
  })
})

describe('unit 视图清单布局（v2 章扁平化）', () => {
  it('章条 + 叶子按清单网格排布：章条在上、其叶子随后、互不重叠', async () => {
    // 构造 unit uC → 章 c0(2叶) + 章 c1(1叶) 的 fixture
    const chapterPack = {
      ...JSON.parse(JSON.stringify(miniPack)),
      nodes: [
        ...miniPack.nodes,
        { id: 'uC.c0', parent: 'u1', kind: 'branch', title: { zh: '第一章' }, domain: 'D1' },
        { id: 'uC.c1', parent: 'u1', kind: 'branch', title: { zh: '第二章' }, domain: 'D1' }
      ].map((n) =>
        n.id === 'u1.k1' ? { ...n, parent: 'uC.c0' } : n.id === 'u1.k2' ? { ...n, parent: 'uC.c0' } : n.id === 'u1.k3' ? { ...n, parent: 'uC.c1' } : n
      )
    } as typeof miniPack
    const v = validatePack(JSON.parse(JSON.stringify(chapterPack)))
    if (!v.ok) throw new Error('fixture 校验失败: ' + v.errors.join('; '))
    const idx = buildGraphIndex(v.pack)
    const layout = await layoutSubview(v.pack, idx, 'u1')
    expect(layout.size).toBe(5) // 2 章条 + 3 叶
    const c0 = layout.get('uC.c0')!
    const k1 = layout.get('u1.k1')!
    const k2 = layout.get('u1.k2')!
    const c1 = layout.get('uC.c1')!
    const k3 = layout.get('u1.k3')!
    expect(c0.y).toBeLessThan(k1.y) // 章条在其叶子之上
    expect(c0.y).toBeLessThan(k2.y)
    expect(c1.y).toBeLessThan(k3.y)
    expect(k1.y).toBe(k2.y) // 同章叶子同行
    expect(k2.x).toBeGreaterThan(k1.x) // 横向排列
    expect(k1.x + k1.width).toBeLessThanOrEqual(k2.x) // 不重叠
    expect(c0.width).toBeGreaterThan(300) // 章条为宽标题条
  })
})
