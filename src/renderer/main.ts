/** 渲染进程引导（spec §5.4/§9.3）：AppStore 驱动钻取浏览 + 点亮编排 */
import './styles/tokens.css'
import './styles/graph.css'
import { createWebApi } from './api/webApi'
import { AppStore } from './core/store'
import { layoutSubview, ROOT_VIEW, type LaidOutNode } from './layout/elk'
import { renderBreadcrumb, type Crumb } from './view/breadcrumb'
import { createEffectLayer } from './view/effects'
import { esc } from './view/escape'
import { icon } from './view/icons'
import { renderGraph } from './view/graphCanvas'
import { renderSidebar } from './view/sidebar'
import { minimalHardClosure } from './core/graph'

const svgEl = document.getElementById('graph') as unknown as SVGSVGElement
const crumbEl = document.getElementById('breadcrumb')!
const stageEl = document.getElementById('stage')!
const sidebarEl = document.getElementById('sidebar')!
const inspectorEl = document.createElement('div')
inspectorEl.id = 'inspector'
inspectorEl.style.display = 'none'
stageEl.appendChild(inspectorEl)

let selectedId: string | null = null

async function boot(): Promise<void> {
  const store = new AppStore(createWebApi())
  await store.init()
  const effects = createEffectLayer(stageEl)

  let viewToken = 0
  let currentLayout = new Map<string, LaidOutNode>()
  let lastRender: Promise<void> = Promise.resolve()
  // 布局与进度无关：按容器缓存，进度变化只重渲不重排（终审 F5；M3 编辑 layoutOverride 后需失效缓存）
  const layoutCache = new Map<string, Map<string, LaidOutNode>>()
  let renderedContainerId: string | null = null

  function centerOf(id: string): { x: number; y: number } {
    const p = currentLayout.get(id)
    if (!p) return { x: 0, y: 0 }
    return { x: p.x + p.width / 2, y: p.y + p.height / 2 }
  }

  function trail(): Crumb[] {
    const out: Crumb[] = [{ id: ROOT_VIEW, label: store.pack.title.zh }]
    for (const id of store.viewStack.slice(1)) {
      const n = store.index.nodeById.get(id)
      if (n) out.push({ id, label: n.title.zh })
    }
    return out
  }

  async function renderView(): Promise<void> {
    const token = ++viewToken
    const containerId = store.viewStack[store.viewStack.length - 1]!
    const containerChanged = containerId !== renderedContainerId
    if (containerChanged) {
      let layout = layoutCache.get(containerId)
      if (!layout) {
        layout = await layoutSubview(store.pack, store.index, containerId)
        if (token !== viewToken) return // 已切视图，丢弃过期结果
        layoutCache.set(containerId, layout)
      }
      currentLayout = layout
      renderedContainerId = containerId
    }
    renderGraph(svgEl, store.pack, store.index, containerId, currentLayout, (id) => store.stateOf(id), {
      progressOf: (id) => store.progressOfContainer(id)
    })
    applyTransform() // 重渲染重建 viewport，需重新套用当前缩放平移
    if (containerChanged) fitView() // 仅视图切换重置视野；进度变化保留缩放平移
    renderBreadcrumb(crumbEl, trail(), (i) => {
      store.jumpTo(i)
    })
  }

  function scheduleRender(): void {
    renderSidebar(sidebarEl, store)
    lastRender = renderView()
      .then(() => applyPathHighlight())
      .catch((err) => console.error('renderView 失败', err))
  }

  /** 点亮路径规划（spec §5.5）：最小必须前置闭包 + 还差 N 步 */
  function showInspector(id: string): void {
    selectedId = id
    renderInspector()
    void applyPathHighlight()
  }

  function clearSelection(): void {
    selectedId = null
    inspectorEl.style.display = 'none'
    void applyPathHighlight()
  }

  function renderInspector(): void {
    const node = selectedId ? store.index.nodeById.get(selectedId) : undefined
    if (!node) {
      inspectorEl.style.display = 'none'
      return
    }
    const unitId = node.kind === 'leaf' ? (node.parent ?? node.id) : node.id
    const unit = store.index.nodeById.get(unitId)
    if (!unit || unit.kind !== 'unit') {
      // 分支节点：显示整体进度
      const prog = store.progressOfContainer(node.id)
      inspectorEl.innerHTML = `
        <div class="insp-title"><span>${esc(node.title.zh)}</span>
          <button class="insp-close" aria-label="关闭">${icon('check', 12)}</button></div>
        <div class="insp-steps">${prog.lit}/${prog.total} 个知识点已点亮</div>`
      inspectorEl.style.display = 'block'
      inspectorEl.querySelector('.insp-close')?.addEventListener('click', clearSelection)
      return
    }
    const closure = minimalHardClosure(unit.id, store.index, store.litLeaves())
    const rows = closure
      .map((cid) => {
        const c = store.index.nodeById.get(cid)!
        const lit = store.stateOf(cid) === 'lit'
        const inView = store.viewStack.includes(cid)
        return `<div class="insp-item" data-id="${esc(cid)}">
          <span>${esc(c.title.zh)}</span><span class="tag">${lit ? '已点亮' : inView ? '在当前视图' : '跨视图 → 点击跳转'}</span></div>`
      })
      .join('')
    inspectorEl.innerHTML = `
      <div class="insp-title"><span>${esc(unit.title.zh)}</span>
        <button class="insp-close" aria-label="关闭">${icon('check', 12)}</button></div>
      <div class="insp-steps">${closure.length === 0 ? '✓ 前置已全部满足，可点亮' : `还差 ${closure.length} 步`}</div>
      <div class="insp-list">${rows || '<div class="side-empty">无必须前置</div>'}</div>`
    inspectorEl.style.display = 'block'
    inspectorEl.querySelector('.insp-close')?.addEventListener('click', clearSelection)
    inspectorEl.querySelectorAll('.insp-item').forEach((el) => {
      el.addEventListener('click', () => {
        const cid = (el as HTMLElement).dataset['id']
        if (!cid) return
        const target = store.index.nodeById.get(cid)
        if (target && !store.viewStack.includes(cid) && target.parent) {
          if (store.viewStack.includes(target.parent)) store.jumpTo(store.viewStack.indexOf(target.parent))
          else store.enter(target.parent)
        }
        showInspector(cid)
      })
    })
  }

  /** 画布高亮闭包（in-path 节点 / missing-prereq 边） */
  function applyPathHighlight(): void {
    svgEl.querySelectorAll('.in-path, .missing-prereq').forEach((el) => {
      el.classList.remove('in-path', 'missing-prereq')
    })
    if (!selectedId) return
    const node = store.index.nodeById.get(selectedId)
    if (!node) return
    const unitId = node.kind === 'leaf' ? (node.parent ?? node.id) : node.id
    const unit = store.index.nodeById.get(unitId)
    if (!unit || unit.kind !== 'unit') return
    const closure = minimalHardClosure(unit.id, store.index, store.litLeaves())
    const closureSet = new Set(closure)
    for (const cid of closure) {
      svgEl
        .querySelector(`g.node[data-id="${CSS.escape(cid)}"]`)
        ?.classList.add('in-path')
    }
    for (const e of store.pack.edges) {
      if (e.type !== 'hard') continue
      if (closureSet.has(e.from) && (closureSet.has(e.to) || e.to === unit.id)) {
        svgEl
          .querySelector(`path.edge[data-from="${CSS.escape(e.from)}"][data-to="${CSS.escape(e.to)}"]`)
          ?.classList.add('missing-prereq')
      }
    }
  }
  store.subscribe(scheduleRender)

  /** 点亮后新增解锁的节点及其 BFS 深度（级联错峰用） */
  function newlyAvailableAfter(id: string): Map<string, number> {
    const before = new Map<string, boolean>()
    for (const nid of store.index.nodeById.keys()) {
      before.set(nid, store.stateOf(nid) === 'available')
    }
    store.lightLeaf(id)
    const out = new Map<string, number>()
    const queue: { id: string; depth: number }[] = [{ id, depth: 0 }]
    const seen = new Set<string>([id])
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const dep of store.index.hardDependentsOf(cur.id)) {
        if (seen.has(dep.id)) continue
        seen.add(dep.id)
        if (!before.get(dep.id) && store.stateOf(dep.id) === 'available') {
          out.set(dep.id, cur.depth + 1)
        }
        queue.push({ id: dep.id, depth: cur.depth + 1 })
      }
    }
    return out
  }

  /** 点亮五拍：按下→绽放→粒子→XP→下游错峰解锁（spec §9.3） */
  async function lightWithCeremony(id: string): Promise<void> {
    const node = store.index.nodeById.get(id)
    if (!node || node.kind !== 'leaf') return
    const newly = newlyAvailableAfter(id) // 内部执行 lightLeaf
    await lastRender // 等待重渲染后在新 DOM 上挂动画
    const g = svgEl.querySelector(`g.node[data-id="${CSS.escape(id)}"]`)
    if (g instanceof SVGGElement) {
      g.classList.add('node--bloom')
      const iconEl = g.querySelector('.node-icon')
      if (iconEl) {
        iconEl.innerHTML = icon('unlock', 16)
        window.setTimeout(() => {
          iconEl.innerHTML = icon('check', 16)
        }, 150)
        window.setTimeout(() => {
          iconEl.remove()
        }, 300)
      }
      window.setTimeout(() => g.classList.remove('node--bloom'), 400)
    }
    const from = centerOf(id)
    effects.playLightUp(
      from.x,
      from.y,
      [...newly.keys()].map((nid) => ({ id: nid, ...centerOf(nid) }))
    )
    effects.spawnXpFloat(from.x, from.y - 14, '+2')
    for (const [nid, depth] of newly) {
      window.setTimeout(() => {
        const ng = svgEl.querySelector(`g.node[data-id="${CSS.escape(nid)}"]`)
        if (ng instanceof SVGGElement) {
          ng.classList.add('node--unlocking')
          window.setTimeout(() => ng.classList.remove('node--unlocking'), 420)
        }
      }, 360 + depth * 80)
    }
  }

  // 单击：available 叶子点亮；locked 叶子抖动+展示前置；单元/分支显示路径规划
  svgEl.addEventListener('click', (e) => {
    const g = (e.target as Element).closest('g.node')
    if (!(g instanceof SVGGElement)) return
    const id = g.getAttribute('data-id')
    const node = id ? store.index.nodeById.get(id) : undefined
    if (!node) return
    const state = store.stateOf(node.id)
    if (node.kind === 'leaf') {
      if (state === 'available') {
        void lightWithCeremony(node.id)
      } else if (state === 'locked') {
        g.classList.add('node--denied')
        window.setTimeout(() => g.classList.remove('node--denied'), 320)
        if (node.parent) showInspector(node.parent)
      }
    } else {
      showInspector(node.id)
    }
  })

  // 双击进入容器；stub 徽章跳转（spec §5.4）
  svgEl.addEventListener('dblclick', (e) => {
    const g = (e.target as Element).closest('g.node')
    if (!(g instanceof SVGGElement)) return
    const id = g.getAttribute('data-id')
    const node = id ? store.index.nodeById.get(id) : undefined
    if (node && (node.kind === 'branch' || node.kind === 'unit')) store.enter(node.id)
  })
  svgEl.addEventListener('stub-click', (e) => {
    const extId = (e as CustomEvent<string>).detail
    const n = store.index.nodeById.get(extId)
    if (n?.parent) {
      if (store.viewStack.includes(n.parent)) store.jumpTo(store.viewStack.indexOf(n.parent))
      else store.enter(n.parent)
    }
  })
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (selectedId !== null) clearSelection()
    else store.back()
  })

  // 单元右键菜单：批量点亮（spec §4.2）
  const ctxMenu = document.createElement('div')
  ctxMenu.className = 'ctx-menu'
  ctxMenu.style.display = 'none'
  document.body.appendChild(ctxMenu)
  svgEl.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    const g = (e.target as Element).closest('g.node.node--unit')
    if (!(g instanceof SVGGElement)) {
      ctxMenu.style.display = 'none'
      return
    }
    const id = g.getAttribute('data-id')
    const node = id ? store.index.nodeById.get(id) : undefined
    if (!node || node.kind !== 'unit') return
    const state = store.stateOf(node.id)
    ctxMenu.innerHTML = ''
    const btn = document.createElement('button')
    btn.textContent = '点亮本单元全部知识点'
    btn.disabled = state !== 'available'
    btn.addEventListener('click', () => {
      ctxMenu.style.display = 'none'
      try {
        store.lightAllLeaves(node.id)
        const from = centerOf(node.id)
        effects.spawnXpFloat(from.x, from.y - 14, `+${store.index.leavesOf(node.id).length * 2}`)
      } catch (err) {
        console.error(err)
      }
    })
    ctxMenu.appendChild(btn)
    ctxMenu.style.display = 'block'
    ctxMenu.style.left = `${e.clientX}px`
    ctxMenu.style.top = `${e.clientY}px`
  })
  window.addEventListener('click', () => {
    ctxMenu.style.display = 'none'
  })

  // 平移/缩放（滚轮 + 拖拽，只动 transform）
  let tx = 0
  let ty = 0
  let scale = 1
  function applyTransform(): void {
    const vp = svgEl.querySelector('.viewport')
    if (vp instanceof SVGGElement) vp.setAttribute('transform', `translate(${tx}, ${ty}) scale(${scale})`)
  }
  function fitView(): void {
    const sw = stageEl.clientWidth
    const sh = stageEl.clientHeight
    const vp = svgEl.querySelector('.viewport')
    const bbox = vp instanceof SVGGElement ? vp.getBBox() : null
    if (bbox && bbox.width > 0) {
      scale = Math.min(1.2, Math.min(sw / (bbox.width + 80), sh / (bbox.height + 80)))
      tx = (sw - bbox.width * scale) / 2 - bbox.x * scale
      ty = (sh - bbox.height * scale) / 2 - bbox.y * scale
    } else {
      scale = 1
      tx = sw / 2
      ty = 60
    }
    applyTransform()
  }
  svgEl.addEventListener('wheel', (e) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const rect = svgEl.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    tx = mx - (mx - tx) * factor
    ty = my - (my - ty) * factor
    scale *= factor
    applyTransform()
  })
  let dragging = false
  let lastX = 0
  let lastY = 0
  svgEl.addEventListener('mousedown', (e) => {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    svgEl.classList.add('panning')
  })
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return
    tx += e.clientX - lastX
    ty += e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    applyTransform()
  })
  window.addEventListener('mouseup', () => {
    dragging = false
    svgEl.classList.remove('panning')
  })

  window.addEventListener('beforeunload', () => {
    store.flushSave()
  })

  scheduleRender() // 首屏：init 的 notify 发生在 subscribe 之前，显式渲染一次侧栏与视图
  await lastRender
}

boot().catch((err: unknown) => {
  // 终审 F2：加载失败呈现错误面板而非白屏（spec Review Focus 2）
  stageEl.innerHTML = `
    <div id="boot-error">
      <div class="boot-title">加载失败</div>
      <div class="boot-msg">${esc(String((err as Error)?.message ?? err))}</div>
      <button id="boot-retry" type="button">重试</button>
    </div>`
  document.getElementById('boot-retry')?.addEventListener('click', () => location.reload())
})
