import { describe, expect, it } from 'vitest'
import { buildGraphIndex, leafAvailable } from '../../src/renderer/core/graph'
import type { Pack } from '../../src/renderer/core/types'
import { createPathTrace, planLightChain } from '../../src/renderer/view/pathTrace'
import { ALL_LEAVES, miniPack, U1_LEAVES } from '../fixtures/mini'
// wt-d 的 domStub（无 jsdom/happy-dom 的 node 环境里的最小 DOM 实现）。
// 跨 worktree 直接 import 在 vitest 下不可解析（项目根之外），故原样复制为本地副本，内容一致。
import { installDom } from './domStub'

const index = buildGraphIndex(miniPack)
const lit = (ids: string[]): Set<string> => new Set(ids)
const clone = (p: Pack): Pack => JSON.parse(JSON.stringify(p)) as Pack

/* ------------------------------------------------------------------ */
/* 纯函数 planLightChain                                               */
/* ------------------------------------------------------------------ */

describe('planLightChain · 基础门控', () => {
  it('1. 无前置目标（u1 已全亮）：canLightTargetNow=true、steps 空、remaining 0', () => {
    const plan = planLightChain('u1', index, lit(U1_LEAVES))
    expect(plan.canLightTargetNow).toBe(true)
    expect(plan.steps).toEqual([])
    expect(plan.remainingLeaves).toBe(0)
    expect(plan.remainingUnits).toBe(0)
    expect(plan.blockers.some((b) => b.kind === 'already-lit')).toBe(true)
    // 对照：u1 未亮时 canLightTargetNow 仍为 true（无前置），但 steps 只覆盖前置义务（此处为空）；
    // 目标自身叶子由 UI 的 ready 态 + pickNextLeafId 的 targetOwnAvailable 处理，不进 steps
    const half = planLightChain('u1', index, lit([]))
    expect(half.canLightTargetNow).toBe(true)
    expect(half.steps).toEqual([])
    expect(half.remainingLeaves).toBe(3)
  })

  it('2. 需 2 级前置（目标 u3）：steps 顺序为最深前置的叶子在前', () => {
    const plan = planLightChain('u3', index, lit([]))
    // 首轮只发已解锁的 u1（u2 被 u1 门控挡住）：最深前置的叶子在前
    expect(plan.steps.map((s) => s.leafId)).toEqual(['u1.k1', 'u1.k2', 'u1.k3'])
    expect(plan.steps.map((s) => s.order)).toEqual([1, 2, 3])
    // 面包屑：首元素恒为虚拟根 'root'，pathLabels 与 path 同长
    for (const s of plan.steps) {
      expect(s.path[0]).toBe('root')
      expect(s.pathLabels.length).toBe(s.path.length)
    }
    // 拓扑定序：closureUnitIds 最深在前（u1 是 2 级前置，rank 最大）
    expect(plan.closureUnitIds).toEqual(['u1', 'u2'])
    expect(plan.remainingUnits).toBe(2)
    expect(plan.remainingLeaves).toBe(6)
  })

  it('3. 门控不破：每个 step 的 leafAvailable 为真；未解锁 unit 的叶子绝不出现', () => {
    const plan = planLightChain('u3', index, lit([]))
    for (const s of plan.steps) {
      expect(leafAvailable(s.leafId, index, lit([]))).toBe(true)
    }
    const ids = plan.steps.map((s) => s.leafId)
    // u2/u3 未解锁 → 其叶子绝不出现
    expect(ids.some((id) => id.startsWith('u2.') || id.startsWith('u3.'))).toBe(false)
    // u1 全亮后：u2 的叶子进入 steps 且全部可点亮，u3 仍被挡
    const plan2 = planLightChain('u3', index, lit(U1_LEAVES))
    expect(plan2.steps.map((s) => s.leafId)).toEqual(['u2.k1', 'u2.k2'])
    for (const s of plan2.steps) {
      expect(leafAvailable(s.leafId, index, lit(U1_LEAVES))).toBe(true)
    }
    expect(plan2.steps.some((s) => s.leafId === 'u3.k1')).toBe(false)
  })

  it('4. 迭代收敛：点亮 steps[0] → 重新 plan → remaining 严格递减，直到达成（有上界，不死循环）', () => {
    let litSet = lit([])
    let plan = planLightChain('u3', index, litSet)
    let rounds = 0
    const CAP = 100
    while (rounds++ < CAP) {
      const prev = plan
      if (plan.steps.length > 0) {
        // 有义务步骤：点亮 steps[0]（与 UI lightOne 同一口径）
        const step = plan.steps[0]!
        expect(leafAvailable(step.leafId, index, litSet)).toBe(true)
        litSet = new Set(litSet)
        litSet.add(step.leafId)
      } else if (plan.canLightTargetNow && plan.remainingLeaves > 0) {
        // 义务清空但目标自身未亮：模拟 UI pickNextLeafId 的 targetOwnAvailable 回退
        const own = [...index.leavesOf('u3')]
          .filter((l) => !litSet.has(l.id) && leafAvailable(l.id, index, litSet))
          .map((l) => l.id)
        expect(own).toEqual(['u3.k1'])
        litSet = new Set(litSet)
        litSet.add(own[0]!)
      } else {
        break
      }
      plan = planLightChain('u3', index, litSet)
      // 收敛判据：remainingLeaves 每轮严格 -1（litLeavesInScope 会随 scope 收缩回退，不用它）
      expect(plan.remainingLeaves).toBe(prev.remainingLeaves - 1)
    }
    expect(rounds).toBeLessThan(CAP) // 上界断言：没有死循环
    expect(plan.steps).toEqual([])
    expect(plan.canLightTargetNow).toBe(true)
    expect(plan.remainingLeaves).toBe(0)
    // 全链路点亮顺序：u1 三叶 → u2 两叶 → u3 一叶
    expect([...litSet].sort()).toEqual([...ALL_LEAVES].sort())
  })

  it('5. soft 边不影响 steps：不新增义务、不改 canLightTargetNow；仅同 rank 内调整先后', () => {
    // 基线（mini，无 soft）
    const base = planLightChain('u3', index, lit([]))
    const baseSteps = base.steps.map((s) => s.leafId)
    const baseClosure = base.closureUnitIds

    // 5a. 仅加一条 soft 边（u3 soft 依赖 u2）：soft 不参与门控 → steps 与闭包不变
    const softOnly = clone(miniPack)
    softOnly.edges.push({ from: 'u2', to: 'u3', type: 'soft', reason: 'soft 参考' })
    const idxSoft = buildGraphIndex(softOnly)
    const p1 = planLightChain('u3', idxSoft, lit([]))
    expect(p1.steps.map((s) => s.leafId)).toEqual(baseSteps)
    expect(p1.closureUnitIds).toEqual(baseClosure)
    expect(p1.remainingUnits).toBe(base.remainingUnits)
    expect(p1.canLightTargetNow).toBe(base.canLightTargetNow)
    // includeSoftPrereq=true 也只作排序参考：同上
    const p1b = planLightChain('u3', idxSoft, lit([]), { includeSoftPrereq: true })
    expect(p1b.steps.map((s) => s.leafId)).toEqual(baseSteps)
    expect(p1b.closureUnitIds).toEqual(baseClosure)

    // 5b. soft 偏置只在同 rank 内生效：b2 与 u2 同为 rank 1，soft 成员 u2 提前
    const softBiasPack = clone(miniPack)
    softBiasPack.nodes.push(
      { id: 'b2', parent: null, kind: 'unit', title: { zh: '乙单元' }, domain: 'D1', core: true },
      { id: 'b2.k1', parent: 'b2', kind: 'leaf', title: { zh: '乙点' }, domain: 'D1' },
      { id: 'y1', parent: null, kind: 'unit', title: { zh: '软单元' }, domain: 'D1' },
      { id: 'y1.k1', parent: 'y1', kind: 'leaf', title: { zh: '软点' }, domain: 'D1' }
    )
    softBiasPack.edges.push(
      { from: 'b2', to: 'u3', type: 'hard' }, // u3 hard 依赖 b2（新增义务）
      { from: 'u2', to: 'y1', type: 'soft' }, // y1 soft 依赖 u2
      { from: 'y1', to: 'u3', type: 'soft' } // u3 soft 依赖 y1 → soft={u2, y1}
    )
    const idxBias = buildGraphIndex(softBiasPack)
    const noBias = planLightChain('u3', idxBias, lit([]))
    const withBias = planLightChain('u3', idxBias, lit([]), { includeSoftPrereq: true })
    // steps 不受 soft 影响（u2 首轮被 u1 门控挡住，b2 首轮可发）
    expect(withBias.steps.map((s) => s.leafId)).toEqual(noBias.steps.map((s) => s.leafId))
    expect(withBias.remainingUnits).toBe(noBias.remainingUnits)
    expect(withBias.canLightTargetNow).toBe(noBias.canLightTargetNow)
    // 闭包成员集合一致（soft 未新增义务：y1 不在闭包里）
    expect([...withBias.closureUnitIds].sort()).toEqual([...noBias.closureUnitIds].sort())
    expect(withBias.closureUnitIds).not.toContain('y1')
    // 同 rank 内 soft 成员提前：无 soft 时 b2 排在 u2 前（id 升序），开启 soft 后 u2 提前
    expect(noBias.closureUnitIds).toEqual(['u1', 'b2', 'u2'])
    expect(withBias.closureUnitIds).toEqual(['u1', 'u2', 'b2'])
  })

  it('6. 数据异常：parent 指向不存在节点 → blockers 含 missing-pack-node，不抛异常', () => {
    const bad = clone(miniPack)
    bad.nodes = bad.nodes.map((n) => (n.id === 'u3.k1' ? { ...n, parent: 'ghost-unit' } : n))
    const badIndex = buildGraphIndex(bad)
    // 目标叶子 parent 断链：owningUnitOf 触发 onMissing → emptyPlan，不抛异常
    const plan = planLightChain('u3.k1', badIndex, lit([]))
    expect(plan.blockers.some((b) => b.kind === 'missing-pack-node' && b.id === 'ghost-unit')).toBe(
      true
    )
    expect(plan.steps).toEqual([])
    // 对照：正常目标不受坏叶子影响，且坏叶子被门控挡掉（不进 steps）
    const plan2 = planLightChain('u3', badIndex, lit([]))
    expect(plan2.steps.map((s) => s.leafId)).toEqual(['u1.k1', 'u1.k2', 'u1.k3'])
    // 边端点缺失也不抛异常（safeHardPrereqIds 防御）
    const badEdge = clone(miniPack)
    badEdge.edges.push({ from: 'u1', to: 'ghost-unit', type: 'hard' })
    const badEdgeIndex = buildGraphIndex(badEdge)
    expect(() => planLightChain('u3', badEdgeIndex, lit([]))).not.toThrow()
  })

  it('7. 拓扑定序正确性：rank 降序、最深在前、同 rank 按 id 升序（幂等）', () => {
    // 链式：u1(2 级) 最深在前，u2(1 级) 随后
    const plan = planLightChain('u3', index, lit([]))
    expect(plan.closureUnitIds).toEqual(['u1', 'u2'])
    // 幂等：重复调用结果一致
    const again = planLightChain('u3', index, lit([]))
    expect(again.closureUnitIds).toEqual(plan.closureUnitIds)
    expect(again.steps.map((s) => s.leafId)).toEqual(plan.steps.map((s) => s.leafId))

    // 同 rank 按 id 升序：a1/z9 与 u2 同为 rank 1 → a1 < u2 < z9
    const two = clone(miniPack)
    two.nodes.push(
      { id: 'z9', parent: null, kind: 'unit', title: { zh: '九单元' }, domain: 'D1', core: true },
      { id: 'z9.k1', parent: 'z9', kind: 'leaf', title: { zh: '九点' }, domain: 'D1' },
      { id: 'a1', parent: null, kind: 'unit', title: { zh: '甲单元' }, domain: 'D1', core: true },
      { id: 'a1.k1', parent: 'a1', kind: 'leaf', title: { zh: '甲点' }, domain: 'D1' }
    )
    two.edges.push(
      { from: 'z9', to: 'u3', type: 'hard' },
      { from: 'a1', to: 'u3', type: 'hard' }
    )
    const idx2 = buildGraphIndex(two)
    const p2 = planLightChain('u3', idx2, lit([]))
    expect(p2.closureUnitIds).toEqual(['u1', 'a1', 'u2', 'z9'])
    // 步骤也遵守最深在前：首轮发 u1（最深，rank 2）+ 同 rank 无前置的 a1/z9（id 升序）；
    // u2 被 u1 门控挡住不进首轮
    expect(p2.steps.map((s) => s.leafId)).toEqual(['u1.k1', 'u1.k2', 'u1.k3', 'a1.k1', 'z9.k1'])
  })

  it('环检测：hard 前置成环 → cycle-suspected blocker，环上 unit 不进 steps，不抛异常', () => {
    const cyc = clone(miniPack)
    cyc.nodes.push(
      { id: 'c1', parent: null, kind: 'unit', title: { zh: '环一' }, domain: 'D1', core: true },
      { id: 'c1.k1', parent: 'c1', kind: 'leaf', title: { zh: '环叶一' }, domain: 'D1' },
      { id: 'c2', parent: null, kind: 'unit', title: { zh: '环二' }, domain: 'D1', core: true },
      { id: 'c2.k1', parent: 'c2', kind: 'leaf', title: { zh: '环叶二' }, domain: 'D1' }
    )
    cyc.edges.push(
      { from: 'c1', to: 'c2', type: 'hard' }, // c2 依赖 c1
      { from: 'c2', to: 'c1', type: 'hard' }, // c1 依赖 c2 → 环
      { from: 'c1', to: 'u1', type: 'hard' } // u1 依赖环
    )
    const idxCyc = buildGraphIndex(cyc)
    const plan = planLightChain('u1', idxCyc, lit([]))
    const cycBlocker = plan.blockers.find((b) => b.kind === 'cycle-suspected')
    expect(cycBlocker).toBeDefined()
    expect((cycBlocker as { ids: string[] }).ids).toEqual(expect.arrayContaining(['c1', 'c2']))
    expect(plan.steps.map((s) => s.unitId)).not.toContain('c1')
    expect(plan.steps.map((s) => s.unitId)).not.toContain('c2')
    expect(plan.progressed).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/* UI 层 createPathTrace（domStub，无 jsdom）                          */
/* ------------------------------------------------------------------ */

describe('createPathTrace · UI 契约（domStub）', () => {
  function setup(): {
    dom: ReturnType<typeof installDom>
    mount: ReturnType<ReturnType<typeof installDom>['document']['createElement']>
    handle: ReturnType<typeof createPathTrace>
    lit: Set<string>
    lights: string[]
  } {
    const dom = installDom()
    const mount = dom.document.createElement('div')
    dom.document.body.appendChild(mount)
    const litSet = new Set<string>()
    const lights: string[] = []
    const handle = createPathTrace(mount as unknown as HTMLElement, {
      index,
      litLeavesProvider: () => litSet,
      onLightLeaf: (id) => {
        litSet.add(id)
        lights.push(id)
      },
      onJump: () => {}
    })
    return { dom, mount, handle, lit: litSet, lights }
  }

  it('初始隐藏；open 后渲染 id/class 契约（#path-trace / #trace-title / #trace-progress / 按钮 / 步骤行）', () => {
    const { dom, handle } = setup()
    try {
      expect(handle.el.id).toBe('path-trace')
      expect(handle.el.className).toContain('trace-panel')
      expect(handle.el.className).toContain('trace-panel--hidden')

      handle.open('u3')
      expect(handle.el.className).not.toContain('trace-panel--hidden')
      expect(handle.el.getAttribute('aria-hidden')).toBe('false')

      const title = handle.el.querySelector('#trace-title')
      expect(title?.textContent).toContain('点亮路径')
      const progress = handle.el.querySelector('#trace-progress')
      expect(progress?.textContent).toMatch(/已点亮 0 \/ 还需 6/)

      expect(handle.el.querySelector('#trace-light-all')).not.toBeNull()
      expect(handle.el.querySelector('#trace-light-one')).not.toBeNull()
      expect(handle.el.querySelector('#trace-collapse')).not.toBeNull()
      expect(handle.el.querySelector('#trace-close')).not.toBeNull()

      const rows = handle.el.querySelectorAll('.trace-step')
      expect(rows.length).toBe(3)
      expect(handle.el.querySelector('.trace-step-light')?.getAttribute('data-leaf')).toBe('u1.k1')
      expect(handle.el.querySelector('.trace-step-jump')).not.toBeNull()
    } finally {
      dom.restore()
    }
  })

  it('单步点亮：点击 #trace-light-one 触发 onLightLeaf 并推进进度', () => {
    const { dom, handle, lit, lights } = setup()
    try {
      handle.open('u3')
      const one = handle.el.querySelector('#trace-light-one') as HTMLElement
      one.click()
      expect(lights).toEqual(['u1.k1'])
      expect(lit.has('u1.k1')).toBe(true)
      const progress = handle.el.querySelector('#trace-progress')
      expect(progress?.textContent).toMatch(/已点亮 1 \/ 还需 5/)
    } finally {
      dom.restore()
    }
  })

  it('全部点亮：#trace-light-all 按门控顺序点亮 6 叶，最终目标可点亮', () => {
    const { dom, handle, lights } = setup()
    try {
      handle.open('u3')
      const all = handle.el.querySelector('#trace-light-all') as HTMLElement
      all.click()
      expect(lights).toEqual(['u1.k1', 'u1.k2', 'u1.k3', 'u2.k1', 'u2.k2', 'u3.k1'])
      // 进度文案按 plan 公式渲染：全部点亮后 obligations 清空、scope 收缩到目标自身，
      // litLeavesInScope 只数目标自己的已亮叶（u3.k1），remainingLeaves 归 0。
      const progress = handle.el.querySelector('#trace-progress')
      expect(progress?.textContent).toMatch(/已点亮 \d+ \/ 还需 0/)
    } finally {
      dom.restore()
    }
  })

  it('目标已全亮时显示 trace-ready「目标已点亮」', () => {
    const { dom, handle, lit } = setup()
    try {
      for (const id of U1_LEAVES) lit.add(id)
      handle.open('u1')
      const ready = handle.el.querySelector('.trace-ready')
      expect(ready).not.toBeNull()
      expect(ready?.querySelector('.trace-ready-msg')?.textContent).toBe('目标已点亮')
      const progress = handle.el.querySelector('#trace-progress')
      expect(progress?.textContent).toMatch(/已点亮 3 \/ 还需 0/)
    } finally {
      dom.restore()
    }
  })

  it('收起 / 关闭：collapse 隐藏 body，close 回到隐藏态', () => {
    const { dom, handle } = setup()
    try {
      handle.open('u3')
      const collapse = handle.el.querySelector('#trace-collapse') as HTMLElement
      collapse.click()
      expect(handle.el.querySelector('.trace-body')?.className).toContain('trace-body--hidden')
      collapse.click()
      expect(handle.el.querySelector('.trace-body')?.className).not.toContain('trace-body--hidden')
      const close = handle.el.querySelector('#trace-close') as HTMLElement
      close.click()
      expect(handle.el.className).toContain('trace-panel--hidden')
    } finally {
      dom.restore()
    }
  })

  it('destroy 移除面板', () => {
    const { dom, handle, mount } = setup()
    try {
      handle.open('u3')
      handle.destroy()
      expect(mount.querySelector('#path-trace')).toBeNull()
    } finally {
      dom.restore()
    }
  })
})
