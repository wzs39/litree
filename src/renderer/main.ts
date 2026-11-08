/** 渲染进程引导（spec §5.4/§9.3）：AppStore 驱动钻取浏览 + 点亮编排 */
import './styles/tokens.css'
import './styles/graph.css'
import { createWebApi } from './api/webApi'
import { AppStore } from './core/store'
import { layoutSubview, ROOT_VIEW, type LaidOutNode } from './layout/elk'
import { renderBreadcrumb, type Crumb } from './view/breadcrumb'
import { createEffectLayer } from './view/effects'
import { icon } from './view/icons'
import { renderGraph } from './view/graphCanvas'

const svgEl = document.getElementById('graph') as unknown as SVGSVGElement
const crumbEl = document.getElementById('breadcrumb')!
const stageEl = document.getElementById('stage')!

async function boot(): Promise<void> {
  const store = new AppStore(createWebApi())
  await store.init()
  const effects = createEffectLayer(stageEl)

  let viewToken = 0
  let currentLayout = new Map<string, LaidOutNode>()
  let lastRender: Promise<void> = Promise.resolve()

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
    const layout = await layoutSubview(store.pack, store.index, containerId)
    if (token !== viewToken) return // 已切视图，丢弃过期结果
    currentLayout = layout
    renderGraph(svgEl, store.pack, store.index, containerId, layout, (id) => store.stateOf(id), {
      progressOf: (id) => store.progressOfContainer(id)
    })
    fitView()
    renderBreadcrumb(crumbEl, trail(), (i) => {
      store.jumpTo(i)
    })
  }

  function scheduleRender(): void {
    lastRender = renderView().catch((err) => console.error('renderView 失败', err))
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

  // 单击：available 叶子点亮；locked 抖动反馈（spec §5.2/§9.3）
  svgEl.addEventListener('click', (e) => {
    const g = (e.target as Element).closest('g.node')
    if (!(g instanceof SVGGElement)) return
    const id = g.getAttribute('data-id')
    const node = id ? store.index.nodeById.get(id) : undefined
    if (!node || node.kind !== 'leaf') return
    const state = store.stateOf(node.id)
    if (state === 'available') {
      void lightWithCeremony(node.id)
    } else if (state === 'locked') {
      g.classList.add('node--denied')
      window.setTimeout(() => g.classList.remove('node--denied'), 320)
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
    if (e.key === 'Escape') store.back()
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

  await renderView()
}

void boot()
