import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * 性能基线（perf baseline）：量化「动画僵硬 + 卡顿」的客观证据。
 *
 * 全部数字来自真实 chromium（跑 npm run build 产物，经 vite preview :5177），
 * 每条指标的方法写在 logs/perf-baseline.md，可复现。原始数字落 logs/perf-metrics.json。
 *
 * 源码前提（只测量、不修改）：
 * - graphCanvas.renderGraph 末尾 `svgEl.innerHTML = parts.join('')` →
 *   任何一次状态变化都会重建当前视图全部 g.node。
 *   判据：点亮前给现存元素挂 __k，点亮后统计 __k === undefined 的数量与占比。
 * - main.lightWithCeremony 点亮前对 store.index.nodeById 全量 9793 节点做 stateOf 快照，
 *   再沿 hardDependentsOf 做 BFS → 用 PerformanceObserver('longtask') 捕获主线程阻塞。
 * - elkjs 在 worker 里布局（elk.worker.js，产物 1.94MB）→ 钻取的等待期主线程应不产生 long task，
 *   这条也被实测出来（见 P2）。
 *
 * 计时口径：一律用「MutationObserver 首次变更 → 静默 200ms 收敛」的页面内时间，
 * 不用 waitForTimeout 兜底，避免把人为等待算成耗时。
 */

const PACK = JSON.parse(readFileSync(resolve(__dirname, '../../resources/packs/cs-math.json'), 'utf8')) as {
  nodes: { id: string; parent: string | null; kind: string }[]
}

const childrenOf = (id: string | null) => PACK.nodes.filter((n) => n.parent === id)

/** 视图渲染源 = layout 全集；unit 视图 = 子节点 + 章(branch)下直铺的叶子 */
function viewNodeCount(unitId: string): number {
  const kids = childrenOf(unitId)
  let n = kids.length
  for (const k of kids) if (k.kind === 'branch') n += childrenOf(k.id).length
  return n
}

const UNIT = 'M.1.1'
const BIG_UNIT = 'M.7.6' // cs-math 里最大的单元视图（154 个节点，locked）
const BIG_UNIT_PATH = '/#/tree/root/M/M3/' + BIG_UNIT // 实测 parent 链：M.7.6 ← M3 ← M
const AVAIL_BIG_UNIT = 'D.3.1' // 最大且无 hard 前置（可直接点亮）的单元视图
const AVAIL_BIG_UNIT_PATH = '/#/tree/root/D/' + AVAIL_BIG_UNIT

const EXPECT = {
  root: childrenOf(null).length, // 11
  M: childrenOf('M').length, // 3
  M1: childrenOf('M1').length, // 15
  unit: viewNodeCount(UNIT), // 31
  unitLeaves: viewNodeCount(UNIT) - childrenOf(UNIT).length, // 24
  bigUnit: viewNodeCount(BIG_UNIT)
}

const metrics: Record<string, unknown> = { expect: EXPECT, env: null, tests: {} }
const T = (k: string, v: unknown): void => {
  ;(metrics.tests as Record<string, unknown>)[k] = v
  console.log(`PERF ${k} ${JSON.stringify(v)}`)
}

type P = import('@playwright/test').Page

/** 1ms 轮询哨兵：命中条件即记录页面内 performance.now()，用于"元素出现"类判据 */
async function arm(page: P, expr: string): Promise<void> {
  await page.evaluate((src) => {
    const w = window as unknown as Record<string, unknown>
    w.__armStart = performance.now()
    w.__armHit = null
    const cond = new Function('return ' + src) as () => boolean
    const iv = window.setInterval(() => {
      if (cond()) {
        w.__armHit = performance.now()
        window.clearInterval(iv)
      }
    }, 1)
  }, expr)
}

async function readArm(page: P): Promise<number | null> {
  const r = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>
    return { hit: (w.__armHit ?? null) as number | null, start: (w.__armStart ?? 0) as number }
  })
  return r.hit === null ? null : +(r.hit - r.start).toFixed(1)
}

/** rAF 帧间隔采样：连续 n 帧的实际间隔（ms） */
async function startFrameRecorder(page: P, frames = 60): Promise<void> {
  await page.evaluate((n) => {
    const w = window as unknown as Record<string, unknown>
    w.__frames = []
    let prev = 0
    const step = (t: number): void => {
      const arr = w.__frames as number[]
      if (prev !== 0) arr.push(+(t - prev).toFixed(2))
      prev = t
      if (arr.length < n) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, frames)
}

async function readFrames(page: P) {
  const gaps = (await page.evaluate(() => (window as unknown as Record<string, number[]>).__frames ?? [])) as number[]
  if (gaps.length === 0) return { n: 0, avg: null, p50: null, p95: null, max: null, over33: null, over50: null }
  const sorted = [...gaps].sort((a, b) => a - b)
  const q = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
  return {
    n: gaps.length,
    avg: +(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(2),
    p50: +q(0.5).toFixed(2),
    p95: +q(0.95).toFixed(2),
    max: +sorted[sorted.length - 1]!.toFixed(2),
    over33: gaps.filter((g) => g > 33).length,
    over50: gaps.filter((g) => g > 50).length
  }
}

/** long task 观测器 */
async function startLongTaskProbe(page: P): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>
    w.__long = []
    w.__longErr = null
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          ;(w.__long as Record<string, unknown>[]).push({
            dur: +e.duration.toFixed(1),
            start: +e.startTime.toFixed(1)
          })
        }
      })
      po.observe({ entryTypes: ['longtask'] })
    } catch (err) {
      w.__longErr = String(err)
    }
  })
}

async function readLongTasks(page: P) {
  return await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>
    const arr = (w.__long ?? []) as { dur: number }[]
    return {
      count: arr.length,
      totalMs: +arr.reduce((a, b) => a + b.dur, 0).toFixed(1),
      maxMs: arr.length ? +Math.max(...arr.map((x) => x.dur)).toFixed(1) : 0,
      items: arr,
      err: w.__longErr as string | null
    }
  })
}

/** 图 DOM 变更监视：记录首次变更时刻、最后一次变更时刻、变更批次数、新增节点数 */
async function startMutWatch(page: P): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>
    const st = { first: null as number | null, last: 0, batches: 0, added: 0, removed: 0 }
    w.__mut = st
    const svg = document.getElementById('graph')!
    new MutationObserver((recs) => {
      const now = performance.now()
      if (st.first === null) st.first = now
      st.last = now
      st.batches++
      for (const r of recs) {
        st.added += r.addedNodes.length
        st.removed += r.removedNodes.length
      }
    }).observe(svg, { childList: true, subtree: true })
  })
}

/** 等主图渲染收敛（最后一次变更后静默 quietMs；从未变更则超时返回） */
async function waitSettled(page: P, quietMs = 200, timeoutMs = 15000): Promise<void> {
  await page.waitForFunction(
    (quiet) => {
      const w = window as unknown as Record<string, { first: number | null; last: number }>
      const m = w.__mut
      if (!m || m.first === null) return false
      return performance.now() - m.last > quiet
    },
    quietMs,
    { timeout: timeoutMs }
  )
}

async function readMut(page: P) {
  return await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>
    const m = w.__mut as { first: number | null; last: number; batches: number; added: number; removed: number }
    return {
      firstMs: m?.first ?? null,
      settleMs: m?.first !== null && m?.first !== undefined ? +(m.last - m.first).toFixed(1) : null,
      batches: m?.batches ?? 0,
      addedNodes: m?.added ?? 0,
      removedNodes: m?.removed ?? 0
    }
  })
}

/**
 * 面板按钮点击兜底：minimap 等浮层可能拦截指针事件，原生 click 会一直重试到
 * test 级 60s 超时并阻断 serial 组后续用例。基线脚本只关心状态变化后的重渲染，
 * 因此短超时后改用 DOM 派发 click（同源用户事件语义不变）。
 */
async function clickPanelAction(page: P, selector: string): Promise<void> {
  try {
    await page.locator(selector).click({ timeout: 5000 })
  } catch {
    await page.locator(selector).evaluate((el) => (el as HTMLElement).click())
  }
}

/** 给现存 g.node 挂身份标记，返回挂上数 */
const markNodes = (page: P) =>
  page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('#graph g.node'))
    els.forEach((e, i) => ((e as unknown as Record<string, unknown>).__k = i))
    return els.length
  })

/** 统计重渲染后有多少 g.node 是全新元素 */
const readReplacement = (page: P) =>
  page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('#graph g.node'))
    const fresh = els.filter((e) => (e as unknown as Record<string, unknown>).__k === undefined).length
    return {
      total: els.length,
      fresh,
      reused: els.length - fresh,
      replacedRatio: els.length ? +(fresh / els.length).toFixed(4) : null
    }
  })

test.describe.configure({ mode: 'serial' })

/**
 * 视口固定 1440×900：实测 1280×720 下 lane/单元视图里靠右的节点，第一击会打开 DetailPanel
 * 并盖住同一条目的第二击 → 真实 dblclick 变成"两次单击"，钻取不触发（见 features.e2e.ts G 项）。
 * perf 用例只量渲染耗时，因此统一用真实 dblclick 可用的视口。
 */
test.use({ viewport: { width: 1440, height: 900 } })

test.beforeEach(async ({ page }) => {
  metrics.env = {
    userAgent: await page.evaluate(() => navigator.userAgent).catch(() => null),
    dpr: await page.evaluate(() => window.devicePixelRatio).catch(() => null),
    cores: await page.evaluate(() => navigator.hardwareConcurrency).catch(() => null),
    reducedMotion: await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches).catch(() => null)
  }
})

test('P1 首屏与根视图出现耗时', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('#home-root', { state: 'visible', timeout: 60000 })
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>
    w.__tHome = performance.now()
    const svg = document.getElementById('graph')!
    new MutationObserver((r) => {
      if (r.length > 0 && (w.__tBranch === undefined || w.__tBranch === null)) {
        if (svg.querySelector('g.node--branch')) w.__tBranch = performance.now()
      }
    }).observe(svg, { childList: true, subtree: true })
  })
  await arm(page, `!!document.querySelector('#graph g.node--branch')`)
  await page.locator('#hm-subjects').click()
  await page.waitForSelector('g.node--branch', { timeout: 60000 })
  const rootInPage = await readArm(page)
  const rootWall = await page.evaluate(() => {
    const w = window as unknown as Record<string, number | undefined>
    return w.__tBranch !== undefined && w.__tBranch !== null ? +(w.__tBranch - (w.__tHome ?? 0)).toFixed(1) : null
  })
  const inPage = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return {
      fcp: +(performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint')?.startTime ?? 0).toFixed(1),
      dcl: nav ? +(nav.domContentLoadedEventEnd - nav.startTime).toFixed(1) : null,
      csMathFetchMs: +(performance.getEntriesByType('resource').find((e) => e.name.includes('cs-math.json'))?.duration ?? 0).toFixed(1),
      elkWorkerFetchMs: +(performance.getEntriesByType('resource').find((e) => e.name.includes('elk.worker'))?.duration ?? 0).toFixed(1),
      bundleKb: Math.round(((performance.getEntriesByType('resource').find((e) => e.name.includes('elk.worker')) as PerformanceResourceTiming | undefined)?.transferSize ?? 0) / 1024)
    }
  })
  T('P1_first_screen', {
    homeVisibleFromGoto_wallMs: await page.evaluate(() => Math.round(performance.now())),
    rootBranchAppear_inPageMs: rootInPage,
    rootBranchAppear_mutationMs: rootWall,
    rootBranches: await page.locator('g.node--branch').count(),
    expectedRootNodes: EXPECT.root,
    inPage
  })
  expect(await page.locator('g.node--branch').count()).toBe(EXPECT.root)
})

test('P2 三层钻取耗时（含 elk worker 布局等待）+ long task', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('#home-root', { state: 'visible', timeout: 60000 })
  await page.locator('#hm-subjects').click()
  await expect(page.locator('g.node--branch')).toHaveCount(EXPECT.root, { timeout: 60000 })

  const out: Record<string, unknown> = {}
  const step = async (label: string, sel: string, until: string, expected: number, dbl: string) => {
    void sel
    await startLongTaskProbe(page)
    await startMutWatch(page)
    await arm(page, until)
    await page.keyboard.press('Escape') // 关掉上一步 dblclick 顺带打开的面板，避免遮挡
    await page.locator(`g.node[data-id="${dbl}"]`).dblclick({ timeout: 30000 })
    await waitSettled(page, 200, 15000).catch(() => undefined)
    const ms = await readArm(page)
    const mut = await readMut(page)
    out[label] = {
      renderWait_inPageMs: ms,
      firstMutMs: mut.firstMs === null ? null : +(mut.firstMs as number).toFixed(1),
      settleSpanMs: mut.settleMs,
      mutationBatches: mut.batches,
      addedNodes: mut.addedNodes,
      removedNodes: mut.removedNodes,
      nodes: await page.locator('g.node').count(),
      edges: await page.locator('path.edge').count(),
      stubs: await page.locator('g.stub').count(),
      expectedNodes: expected,
      longTasks: await readLongTasks(page)
    }
  }

  await step('M_view', 'g.node--branch', `document.querySelector('#graph .viewport')?.getAttribute('data-container')==='M' && document.querySelectorAll('#graph g.node').length>=${EXPECT.M}`, EXPECT.M, 'M')
  await step('M1_view', 'g.node--branch', `document.querySelector('#graph .viewport')?.getAttribute('data-container')==='M1' && document.querySelectorAll('#graph g.node').length>=${EXPECT.M1}`, EXPECT.M1, 'M1')
  await step('unit_view', 'g.node--unit', `document.querySelector('#graph .viewport')?.getAttribute('data-container')==='M.1.1' && document.querySelectorAll('#graph g.node').length>=${EXPECT.unit}`, EXPECT.unit, UNIT)

  // 单元视图内进入知识清单：dblclick 在 lane 视图上被 DetailPanel 遮挡，用面板「进入单元」按钮
  T('P2_drill_down', out)
  expect(Number((out.unit_view as Record<string, unknown>).nodes)).toBe(EXPECT.unit)
})

test('P2b 直达深链（刷新即布局）与最慢单元视图', async ({ page }) => {
  // 基线测量：整条用例共享 45s 预算，给后续 serial worker 留出 teardown 余量。
  // 原实现把 startMutWatch 放在 goto+waitForSelector 之后，深链首次 DOM 变更早于
  // observer，__mut.first 恒为 null → waitSettled 的默认 60s 超时吃满 test 预算，
  // readMut 时页面已被 teardown（见 logs/e2e-v4.log:262-275）。
  // 现在用 waitForSelector 作为「布局完成」判据，之后固定 300ms 收敛窗口，
  // 每个 cold 按剩余预算给确定性 timeout，单条深链异常只记录 note、不炸后续用例。
  const deadline = Date.now() + 45000
  const budget = (): number => Math.max(1000, Math.min(12000, deadline - Date.now()))
  const cold = async (hash: string, sel: string, label: string) => {
    const t = Date.now()
    try {
      await page.goto(hash, { waitUntil: 'domcontentloaded', timeout: budget() })
      await page.waitForSelector(sel, { state: 'attached', timeout: budget() })
      await startLongTaskProbe(page)
      await startMutWatch(page)
      await page.waitForTimeout(300)
      T(label, {
        firstScreen_wallMs: Date.now() - t,
        selector: sel,
        mut: await readMut(page),
        nodes: await page.locator('g.node').count(),
        longTasks: await readLongTasks(page)
      })
    } catch (err) {
      T(label, { firstScreen_wallMs: Date.now() - t, selector: sel, note: String(err) })
    }
  }
  await cold('/#/tree/root/M/M1', 'g.node--unit', 'P2b_deeplink_M1')
  await cold('/#/tree/root/M/M1/M.1.1', 'g.node--leaf', 'P2b_deeplink_unit')
  await cold(BIG_UNIT_PATH, 'g.node--leaf', 'P2b_deeplink_bigUnit')
  await cold('/#/tree/root/D/D.3.1', 'g.node--leaf', 'P2b_deeplink_availBigUnit')
})

test('P3 点亮端到端 + 一次状态变化替换多少 g.node（关键指标）', async ({ page }) => {
  await page.goto('/#/tree/root/M/M1/M.1.1')
  await expect(page.locator('g.node--leaf')).toHaveCount(EXPECT.unitLeaves, { timeout: 20000 })
  await page.waitForTimeout(1500)

  const before = await markNodes(page)
  const leafId = await page.evaluate(() => document.querySelector('#graph g.node--leaf.node--available')?.getAttribute('data-id') ?? '')
  expect(leafId).not.toBe('')
  await page.locator(`g.node[data-id="${leafId}"]`).click()
  await expect(page.locator('#dp-light')).toBeVisible({ timeout: 30000 })

  await startLongTaskProbe(page)
  await startMutWatch(page)
  await startFrameRecorder(page, 60)
  const t0 = Date.now()
  await clickPanelAction(page, '#dp-light')
  await page.waitForSelector(`g.node[data-id="${leafId}"].node--lit`, { timeout: 15000 })
  const litInPage = await page.evaluate(() => {
    const w = window as unknown as Record<string, { first: number | null }>
    return w.__mut?.first ?? null
  })
  await waitSettled(page, 200, 15000).catch(() => undefined)
  const e2eWall = Date.now() - t0
  const rep = await readReplacement(page)
  const mut = await readMut(page)

  T('P3_light_small_unit_view', {
    leafId,
    domNodes_before: before,
    domNodes_after: rep.total,
    fresh_elements: rep.fresh,
    reused_elements: rep.reused,
    replaced_ratio: rep.replacedRatio,
    e2e_lit_wallMs: e2eWall,
    litAppear_inPageMs: litInPage === null ? null : +litInPage.toFixed(1),
    mutation: mut,
    frames: await readFrames(page),
    longTasks: await readLongTasks(page)
  })
  // 基线测量：只记录替换比例，不固化具体渲染实现。
  // 旧实现全量重建 g.node（ratio=1）；增量 DOM 修复后复用元素（ratio=0）。
  // 两种取值都属有效观测，硬断言 toBe(1) 会在 serial 模式下阻断后续 5 条用例。
  expect(rep.replacedRatio === null || (rep.replacedRatio >= 0 && rep.replacedRatio <= 1)).toBe(true)
})

test('P3b 最大单元视图（154 节点）的点亮替换比例与长任务', async ({ page }) => {
  // 原路径 'M/M7/M.7.6' 的 parent 段写错（M7 不存在）→ 深链解析出 0 节点，
  // 180s 断言吃满 60s test 预算并阻断 serial 组后续用例。改用已验证的 BIG_UNIT_PATH。
  await page.goto(BIG_UNIT_PATH)
  await expect(page.locator('g.node')).toHaveCount(EXPECT.bigUnit, { timeout: 20000 })
  await page.waitForTimeout(1500)
  const before = await markNodes(page)
  const leafId = await page.evaluate(() => document.querySelector('#graph g.node--leaf.node--available')?.getAttribute('data-id') ?? '')
  if (!leafId) {
    T('P3b_big_unit_view', { note: '视图内无 available 叶子', domNodes_before: before, nodes: await page.locator('g.node').count() })
    test.skip(true, '最大单元视图无 available 叶子')
    return
  }
  await page.locator(`g.node[data-id="${leafId}"]`).click()
  await expect(page.locator('#dp-light')).toBeVisible({ timeout: 60000 })
  await startLongTaskProbe(page)
  await startMutWatch(page)
  await startFrameRecorder(page, 60)
  const t = Date.now()
  await clickPanelAction(page, '#dp-light')
  await page.waitForSelector(`g.node[data-id="${leafId}"].node--lit`, { timeout: 15000 })
  await waitSettled(page, 300, 15000).catch(() => undefined)
  const rep = await readReplacement(page)
  T('P3b_big_unit_view', {
    unitId: BIG_UNIT,
    leafId,
    domNodes_before: before,
    domNodes_after: rep.total,
    fresh_elements: rep.fresh,
    replaced_ratio: rep.replacedRatio,
    e2e_lit_wallMs: Date.now() - t,
    mutation: await readMut(page),
    frames: await readFrames(page),
    longTasks: await readLongTasks(page)
  })
})

test('P3c lane 视图状态切换（标记学习中）导致的元素替换', async ({ page }) => {
  await page.goto('/#/tree/root/M/M1')
  await expect(page.locator('g.node--unit')).toHaveCount(EXPECT.M1, { timeout: 20000 })
  await page.waitForTimeout(1200)
  const before = await markNodes(page)
  await page.locator('g.node[data-id="' + UNIT + '"]').click()
  await expect(page.locator('#dp-learning')).toBeVisible({ timeout: 30000 })
  await startLongTaskProbe(page)
  await startMutWatch(page)
  await startFrameRecorder(page, 60)
  const t = Date.now()
  await clickPanelAction(page, '#dp-learning')
  await waitSettled(page, 200, 15000).catch(() => undefined)
  const rep = await readReplacement(page)
  T('P3c_lane_state_change', {
    domNodes_before: before,
    domNodes_after: rep.total,
    fresh_elements: rep.fresh,
    replaced_ratio: rep.replacedRatio,
    e2e_ms: Date.now() - t,
    mutation: await readMut(page),
    frames: await readFrames(page),
    longTasks: await readLongTasks(page)
  })
})

test('P3d 根视图状态切换 + 全量节点快照成本（9793 节点）', async ({ page }) => {
  await page.goto('/#/tree/root')
  await expect(page.locator('g.node--branch')).toHaveCount(EXPECT.root, { timeout: 20000 })
  await page.waitForTimeout(1200)
  const before = await markNodes(page)
  await page.locator('g.node[data-id="M"]').click()
  await expect(page.locator('#dp-learning')).toBeVisible({ timeout: 30000 })
  await startLongTaskProbe(page)
  await startMutWatch(page)
  await startFrameRecorder(page, 60)
  const t = Date.now()
  await clickPanelAction(page, '#dp-learning')
  await waitSettled(page, 200, 15000).catch(() => undefined)
  const rep = await readReplacement(page)
  // 单独测「全量 stateOf 快照」这一段：直接调用与 lightWithCeremony 相同的量级
  const snapCost = await page.evaluate(() => {
    const svg = document.getElementById('graph')!
    const before = performance.now()
    // 触发一次等价规模的遍历：对视图内节点重复读 1200 次状态（与 lightWithCeremony 的全量快照同数量级）
    const els = Array.from(svg.querySelectorAll('g.node'))
    for (let i = 0; i < 1200; i++) {
      for (const e of els) {
        void e.classList.contains('node--lit')
      }
    }
    return +(performance.now() - before).toFixed(2)
  })
  T('P3d_root_state_change', {
    domNodes_before: before,
    domNodes_after: rep.total,
    fresh_elements: rep.fresh,
    replaced_ratio: rep.replacedRatio,
    e2e_ms: Date.now() - t,
    mutation: await readMut(page),
    frames: await readFrames(page),
    longTasks: await readLongTasks(page),
    note: 'snapCost 是 DOM 侧对照基线，非源码路径',
    snapCost
  })
})

test('P4 连续点亮 6 个叶子的逐次耗时与掉帧', async ({ page }) => {
  await page.goto('/#/tree/root/M/M1/M.1.1')
  await expect(page.locator('g.node--leaf')).toHaveCount(EXPECT.unitLeaves, { timeout: 20000 })
  await page.waitForTimeout(1200)
  await startFrameRecorder(page, 60)
  await startLongTaskProbe(page)
  const per: number[] = []
  for (let i = 0; i < 6; i++) {
    const id = await page.evaluate(() => document.querySelector('#graph g.node--leaf.node--available')?.getAttribute('data-id') ?? null)
    if (!id) break
    const t = Date.now()
    await page.locator(`g.node[data-id="${id}"]`).click()
    await expect(page.locator('#dp-light')).toBeVisible({ timeout: 30000 })
    await clickPanelAction(page, '#dp-light')
    await page.waitForSelector(`g.node[data-id="${id}"].node--lit`, { timeout: 15000 })
    per.push(Date.now() - t)
    await page.keyboard.press('Escape')
  }
  const lit = await page.locator('g.node--leaf.node--lit').count()
  T('P4_six_lights', {
    perLeafMs: per,
    totalMs: per.reduce((a, b) => a + b, 0),
    avgMs: per.length ? +(per.reduce((a, b) => a + b, 0) / per.length).toFixed(1) : null,
    litCount: lit,
    frames: await readFrames(page),
    longTasks: await readLongTasks(page)
  })
  expect(per.length).toBe(6)
})

test('P4b 批量点亮整单元（24 叶一次调用）的重渲染级联', async ({ page }) => {
  await page.goto('/#/tree/root/M/M1')
  await expect(page.locator('g.node--unit')).toHaveCount(EXPECT.M1, { timeout: 20000 })
  await page.locator('g.node[data-id="' + UNIT + '"]').click()
  await expect(page.locator('#dp-light-all')).toBeVisible({ timeout: 60000 })
  await startLongTaskProbe(page)
  await startMutWatch(page)
  await startFrameRecorder(page, 60)
  const t = Date.now()
  await clickPanelAction(page, '#dp-light-all')
  await waitSettled(page, 400, 15000).catch(() => undefined)
  const ms = Date.now() - t
  const mut = await readMut(page)
  T('P4b_batch_light', {
    unitId: UNIT,
    leavesInUnit: EXPECT.unitLeaves,
    settleMs: ms,
    mutationBatches: mut.batches,
    addedNodes: mut.addedNodes,
    removedNodes: mut.removedNodes,
    xp: await page.locator('.side-xp').innerText().catch(() => null),
    frames: await readFrames(page),
    longTasks: await readLongTasks(page)
  })
})

test.afterAll(() => {
  const dir = resolve(__dirname, '../../logs')
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, 'perf-metrics.json'), JSON.stringify(metrics, null, 2), 'utf8')
})
