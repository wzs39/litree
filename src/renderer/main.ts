/** 渲染进程引导（v2 spec）：路由驱动 + DetailPanel 内容本体 + 点亮仪式 */
import './styles/tokens.css'
import './styles/graph.css'
import { createWebApi } from './api/webApi'
import { attachRouter } from './core/router'
import { AppStore } from './core/store'
import { layoutSubview, ROOT_VIEW, type LaidOutNode } from './layout/elk'
import { renderBreadcrumb, type Crumb } from './view/breadcrumb'
import { createEffectLayer } from './view/effects'
import { renderDetailPanel, ancestorStack } from './view/detailPanel'
import { renderGraph } from './view/graphCanvas'
import { renderSidebar } from './view/sidebar'

const svgEl = document.getElementById('graph') as unknown as SVGSVGElement
const crumbEl = document.getElementById('breadcrumb')!
const stageEl = document.getElementById('stage')!
const sidebarEl = document.getElementById('sidebar')!
const panelEl = document.createElement('div')
panelEl.id = 'detail-panel'
stageEl.appendChild(panelEl)

async function boot(): Promise<void> {
  const store = new AppStore(createWebApi())
  await store.init()
  const effects = createEffectLayer(stageEl)

  let viewToken = 0
  let currentLayout = new Map<string, LaidOutNode>()
  let lastRender: Promise<void> = Promise.resolve()
  let selectedId: string | null = null
  // 布局与进度无关：按容器缓存（M3 编辑 layoutOverride 后需失效）
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

  function renderPanel(): void {
    renderDetailPanel(panelEl, store, selectedId, {
      onLight: (id) => void lightWithCeremony(id),
      onEnter: (id) => jumpToNode(id),
      onJump: (id) => {
        jumpToNode(id)
        selectedId = id
        renderPanel()
      }
    })
  }

  function openPanel(id: string): void {
    selectedId = id
    renderPanel()
  }

  function sameStack(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((v, i) => b[i] === v)
  }

  /** 跳到任意节点的所属视图（祖先链作为视图栈；叶子停留其 unit 视图） */
  function jumpToNode(id: string): void {
    const stack = ancestorStack(store.index, id)
    const node = store.index.nodeById.get(id)
    if (node?.kind === 'leaf') stack.pop()
    if (!sameStack(stack, store.viewStack)) store.setStack(stack)
  }

  async function renderView(): Promise<void> {
    const token = ++viewToken
    const containerId = store.viewStack[store.viewStack.length - 1]!
    const containerChanged = containerId !== renderedContainerId
    if (containerChanged) {
      let layout = layoutCache.get(containerId)
      if (!layout) {
        layout = await layoutSubview(store.pack, store.index, containerId)
        if (token !== viewToken) return
        layoutCache.set(containerId, layout)
      }
      currentLayout = layout
      renderedContainerId = containerId
    }
    renderGraph(svgEl, store.pack, store.index, containerId, currentLayout, (id) => store.stateOf(id), {
      progressOf: (id) => store.progressOfContainer(id)
    })
    applyTransform()
    if (containerChanged) fitView()
    renderBreadcrumb(crumbEl, trail(), (i) => {
      store.jumpTo(i)
    })
    // 选中节点不存在时清空面板
    if (selectedId && !store.index.nodeById.get(selectedId)) {
      selectedId = null
      renderPanel()
    }
  }

  function scheduleRender(): void {
    renderSidebar(sidebarEl, store)
    renderPanel()
    lastRender = renderView()
      .then(() => undefined)
      .catch((err) => console.error('renderView 失败', err))
  }
  store.subscribe(scheduleRender)
  attachRouter(store)

  /** 点亮仪式（v2：由 DetailPanel 确认触发） */
  async function lightWithCeremony(id: string): Promise<void> {
    const node = store.index.nodeById.get(id)
    if (!node || node.kind !== 'leaf') return
    // 点亮前可用性快照，用于解锁级联
    const before = new Map<string, boolean>()
    for (const nid of store.index.nodeById.keys()) {
      before.set(nid, store.stateOf(nid) === 'available')
    }
    store.lightLeaf(id)
    await lastRender
    const g = svgEl.querySelector(`g.node[data-id="${CSS.escape(id)}"]`)
    if (g instanceof SVGGElement) {
      g.classList.add('node--bloom')
      window.setTimeout(() => g.classList.remove('node--bloom'), 400)
    }
    const from = centerOf(id)
    const newly: { id: string; depth: number }[] = []
    const queue: { id: string; depth: number }[] = [{ id, depth: 0 }]
    const seen = new Set<string>([id])
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const dep of store.index.hardDependentsOf(cur.id)) {
        if (seen.has(dep.id)) continue
        seen.add(dep.id)
        if (!before.get(dep.id) && store.stateOf(dep.id) === 'available') {
          newly.push({ id: dep.id, depth: cur.depth + 1 })
        }
        queue.push({ id: dep.id, depth: cur.depth + 1 })
      }
    }
    effects.playLightUp(
      from.x,
      from.y,
      newly.map((n) => ({ id: n.id, ...centerOf(n.id) }))
    )
    effects.spawnXpFloat(from.x, from.y - 14, '+2')
    for (const n of newly) {
      window.setTimeout(() => {
        const ng = svgEl.querySelector(`g.node[data-id="${CSS.escape(n.id)}"]`)
        if (ng instanceof SVGGElement) {
          ng.classList.add('node--unlocking')
          window.setTimeout(() => ng.classList.remove('node--unlocking'), 420)
        }
      }, 360 + n.depth * 80)
    }
    renderPanel() // 面板切换为"已点亮"态
  }

  // 单击 = 打开/更新 DetailPanel（v2 spec §3）
  svgEl.addEventListener('click', (e) => {
    const g = (e.target as Element).closest('g.node')
    if (!(g instanceof SVGGElement)) return
    const id = g.getAttribute('data-id')
    if (id && store.index.nodeById.get(id)) openPanel(id)
  })

  // 双击容器 = 进入（面板跟随）
  svgEl.addEventListener('dblclick', (e) => {
    const g = (e.target as Element).closest('g.node')
    if (!(g instanceof SVGGElement)) return
    const id = g.getAttribute('data-id')
    const node = id ? store.index.nodeById.get(id) : undefined
    if (node && (node.kind === 'branch' || node.kind === 'unit')) {
      jumpToNode(node.id)
      openPanel(node.id)
    }
  })
  svgEl.addEventListener('stub-click', (e) => {
    const extId = (e as CustomEvent<string>).detail
    if (store.index.nodeById.get(extId)) openPanel(extId)
  })
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (selectedId !== null) {
      selectedId = null
      renderPanel()
    } else {
      store.back()
    }
  })

  // 单元右键菜单：批量点亮（快捷入口）
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

  // 平移/缩放
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

  scheduleRender()
  await lastRender
}

boot().catch((err: unknown) => {
  stageEl.innerHTML = `
    <div id="boot-error">
      <div class="boot-title">加载失败</div>
      <div class="boot-msg">${String((err as Error)?.message ?? err)}</div>
      <button id="boot-retry" type="button">重试</button>
    </div>`
  document.getElementById('boot-retry')?.addEventListener('click', () => location.reload())
})
