import { describe, expect, it } from 'vitest'
import { buildGraphIndex } from '../../src/renderer/core/graph'
import { emptyProgress, lightLeaf } from '../../src/renderer/core/progress'
import { validatePack } from '../../src/renderer/core/schema'
import { continueTarget } from '../../src/renderer/core/home'
import { miniPack } from '../fixtures/mini'

// miniPack + routes 变体
const packWithRoutes = {
  ...JSON.parse(JSON.stringify(miniPack)),
  routes: [
    { name: '入门', ids: ['u1', 'u2'] },
    { name: '进阶', ids: ['u2', 'u3'] }
  ]
} as typeof miniPack & { routes: { name: string; ids: string[] }[] }
const validation = validatePack(JSON.parse(JSON.stringify(packWithRoutes)))
if (!validation.ok) throw new Error('fixture 校验失败: ' + validation.errors.join('; '))
const index = buildGraphIndex(validation.pack)

describe('continueTarget（继续学习定位）', () => {
  it('无历史 → 第一条路线第一个 available 单元', () => {
    const t = continueTarget(validation.pack, index, emptyProgress('mini'))
    expect(t).toEqual({ unitId: 'u1', routeIndex: 0 })
  })
  it('有历史 → 最近点亮知识点所属 unit', () => {
    let p = emptyProgress('mini')
    p = lightLeaf(p, 'u2.k1', index, '2026-11-08T10:00:00Z')
    const t = continueTarget(validation.pack, index, p)
    expect(t).toEqual({ unitId: 'u2', routeIndex: 0 }) // u2 在第一条路线中
  })
  it('历史指向路线外节点 → routeIndex 0 兜底', () => {
    // routes 只含 u1/u2，u3 为路线外
    const packNoU3 = {
      ...JSON.parse(JSON.stringify(miniPack)),
      routes: [{ name: '入门', ids: ['u1', 'u2'] }]
    } as typeof miniPack & { routes: { name: string; ids: string[] }[] }
    let p = emptyProgress('mini')
    p = lightLeaf(p, 'u3.k1', index, '2026-11-08T10:00:00Z')
    const t = continueTarget(packNoU3, index, p)
    expect(t?.unitId).toBe('u3')
    expect(t?.routeIndex).toBe(0)
  })
  it('无 routes 的包 → null', () => {
    expect(continueTarget(miniPack, index, emptyProgress('mini'))).toBeNull()
  })
})
