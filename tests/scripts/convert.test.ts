import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { convertCsmath } from '../../scripts/convert-csmath.mjs'
import { validatePack } from '../../src/renderer/core/schema'

const here = dirname(fileURLToPath(import.meta.url))
const sample = JSON.parse(readFileSync(join(here, '../fixtures/csmath-sample.json'), 'utf-8'))

describe('convertCsmath（以真实结构截取的 fixture 为准）', () => {
  const { pack, report } = convertCsmath(sample.skilltree, sample.outlines)

  it('输出通过 validatePack', () => {
    const r = validatePack(JSON.parse(JSON.stringify(pack)))
    if (!r.ok) throw new Error('校验失败: ' + r.errors.join('; '))
    expect(r.ok).toBe(true)
  })

  it('report 计数与输入一致且无 diff', () => {
    expect(report.units).toBe(sample.skilltree.skills.length)
    expect(report.hard).toBe(
      sample.skilltree.skills.reduce((a: number, s: { required?: unknown[] }) => a + (s.required ?? []).length, 0)
    )
    expect(report.soft).toBe(
      sample.skilltree.skills.reduce((a: number, s: { recommended?: unknown[] }) => a + (s.recommended ?? []).length, 0)
    )
    expect(report.diffs).toEqual([])
  })

  it('L1 学科由 path[0] 派生，L2 分支 = lane', () => {
    const subjects = pack.nodes.filter((n) => n.kind === 'branch' && n.parent === null)
    expect(subjects.length).toBeGreaterThan(0)
    const branch = pack.nodes.find((n) => n.id === sample.skilltree.lanes[0]!.id)
    expect(branch).toBeDefined()
    expect(branch!.parent).toBe(subjects[0]!.id)
  })

  it('技能 → unit，parent 指向 lane，前置边 reason=why', () => {
    const unit = pack.nodes.find((n) => n.id === 'M.1.2')
    expect(unit?.kind).toBe('unit')
    const edge = pack.edges.find((e) => e.to === 'M.1.2' && e.type === 'hard')
    expect(edge?.from).toBe('M.1.1')
    expect(typeof edge?.reason).toBe('string')
  })

  it('outline 叶子 → leaf（zh 回退 title）', () => {
    const leaves = pack.nodes.filter((n) => n.kind === 'leaf' && n.id.startsWith('M.1.1.'))
    expect(leaves.length).toBeGreaterThan(0)
    for (const l of leaves) expect(l.title.zh.length).toBeGreaterThan(0)
  })

  it('>20 知识点的单元保留章分组层；≤20 直接挂单元', () => {
    // 构造 >20 的输入
    const big = JSON.parse(JSON.stringify(sample.skilltree)) as never
    const ol = {
      'M.1.1': {
        sources: [],
        outline: [
          {
            src: 'A',
            ref: '1',
            title: 'Ch1',
            zh: '第一章',
            items: Array.from({ length: 21 }, (_, i) => ({ ref: '', title: `t${i}`, zh: `点${i}` }))
          }
        ]
      }
    }
    const r2 = convertCsmath(big, {
      'M.1.1': {
        sources: [],
        outline: [
          {
            src: 'A',
            ref: '1',
            title: 'Ch1',
            zh: '第一章',
            items: Array.from({ length: 21 }, (_, i) => ({ ref: '', title: `t${i}`, zh: `点${i}` }))
          }
        ]
      },
      'M.1.2': {
        sources: [],
        outline: [
          { src: 'A', ref: '1', title: 'Ch1', zh: '小章一', items: [{ ref: '', title: 'a', zh: '点a' }, { ref: '', title: 'b', zh: '点b' }] },
          { src: 'A', ref: '2', title: 'Ch2', zh: '小章二', items: [{ ref: '', title: 'c', zh: '点c' }] }
        ]
      }
    })
    expect(r2.report.leaves).toBe(24)
    const chapter = r2.pack.nodes.find((n) => n.parent === 'M.1.1')
    expect(chapter?.kind).toBe('branch')
    // ≤20：sample 中 M.1.2 的叶子直接挂在单元下
    const m12leaves = r2.pack.nodes.filter((n) => n.kind === 'leaf' && n.parent === 'M.1.2')
    expect(m12leaves.length).toBeGreaterThan(0)
    const m12chapters = r2.pack.nodes.filter(
      (n) => n.kind === 'branch' && String(n.id).startsWith('M.1.2.c')
    )
    expect(m12chapters.length).toBe(0)
  })
})

describe('convertCsmath routes 透传（v2）', () => {
  it('上游 routes 转换为 pack.routes，无效 id 进 diffs', () => {
    const st = JSON.parse(JSON.stringify(sample.skilltree)) as never
    const stObj = st as { skills: { id: string }[]; routes?: unknown[] }
    stObj.routes = [
      { name: '路线A', note: 'n', ids: ['M.1.1', 'M.1.2'] },
      { name: '路线B', ids: ['ghost'] }
    ]
    const { pack, report } = convertCsmath(st, sample.outlines)
    expect(pack.routes?.[0]?.name).toBe('路线A')
    expect(pack.routes?.[0]?.ids).toEqual(['M.1.1', 'M.1.2'])
    expect(report.diffs.some((d: string) => d.includes('ghost'))).toBe(true)
  })
})
