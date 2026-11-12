import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validatePack } from '../../src/renderer/core/schema'

// 对已提交的 cs-math 数据包做回归校验（转换报告结论见账本：leaves=8124 为规范计数）
const raw = JSON.parse(readFileSync(join(process.cwd(), 'resources/packs/cs-math.json'), 'utf-8'))
const r = validatePack(raw)
if (!r.ok) throw new Error('cs-math 包校验失败: ' + r.errors.slice(0, 5).join('; '))

describe('resources/packs/cs-math.json 回归', () => {
  const pack = r.pack

  it('通过 litree/pack-v1 校验', () => {
    expect(pack.id).toBe('cs-math')
  })

  it('对账：202 单元（192基线+10前沿/语言）/ 279 hard / 411 soft / 8286 叶子 / 12 路线', () => {
    const units = pack.nodes.filter((n) => n.kind === 'unit')
    const leaves = pack.nodes.filter((n) => n.kind === 'leaf')
    const hard = pack.edges.filter((e) => e.type === 'hard')
    const soft = pack.edges.filter((e) => e.type === 'soft')
    expect(units.length).toBe(202)
    expect(hard.length).toBe(279)
    expect(soft.length).toBe(411)
    expect(leaves.length).toBe(8286)
    expect(pack.routes?.length).toBe(12)
  })

  it('结构：11 个学科根（CS 的 lane 与学科同 id 合并）、数学 3 lane 挂 M 下、全部叶子有父', () => {
    const roots = pack.nodes.filter((n) => n.parent === null)
    const topLevelBranches = pack.nodes.filter(
      (n) => n.kind === 'branch' && (n.parent === null || n.parent === 'M')
    )
    const lanesWithParent = topLevelBranches.filter((n) => n.parent === 'M')
    expect(roots.length).toBe(11)
    expect(topLevelBranches.length).toBe(14)
    expect(lanesWithParent.map((n) => n.id).sort()).toEqual(['M1', 'M2', 'M3'])
    expect(pack.domains.length).toBe(13)
  })
})
