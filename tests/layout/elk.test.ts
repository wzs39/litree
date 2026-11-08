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
