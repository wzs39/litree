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
import { minimalHardClosure } from './core/graph'
import { renderGraph } from './view/graphCanvas'
import { renderHome } from './view/homeView'
import { renderSidebar } from './view/sidebar'

const svgEl = document.getElementById('graph') as unknown as SVGSVGElement
const crumbEl = document.getElementById('breadcrumb')!
const stageEl = document.getElementById('stage')!
const sidebarEl = document.getElementById('sidebar')!
const panelEl = document.createElement('div')
panelEl.id = 'detail-panel'
stageEl.appendChild(panelEl)
const homeEl = document.getElementById('home-root')!

/** 面板选中节点 → URL 同步（由 attachRouter 的句柄赋值；先声明后赋值，调用点均在赋值后触发） */
let routerSyncNode: ((node: string | null) => void) | null = null

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
    // 面板是滚动容器：内容重建后保持滚动位置（审查 P1）
    const prevTop = panelEl.scrollTop
    renderDetailPanel(panelEl, store, selectedId, {
      onLight: (id) => void lightWithCeremony(id).catch((err) => console.error('点亮失败', err)),
      onEnter: (id) => jumpToNode(id),
      onJump: (id) => {
        jumpToNode(id)
        selectedId = id
        renderPanel()
      },
      onClose: () => {
        selectedId = null
        routerSyncNode?.(null)
        renderPanel()
      }
    })
    panelEl.scrollTop = prevTop
  }

  function openPanel(id: string): void {
    selectedId = id
    routerSyncNode?.(id)
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
    // home 虚拟视图：DOM 首页替代 SVG
    if (containerId === 'home') {
      renderedContainerId = 'home'
      svgEl.style.display = 'none'
      homeEl.style.display = 'block'
      crumbEl.style.display = 'none'
      renderHome(homeEl, store, {
        onContinue: (t) => {
          jumpToNode(t.unitId)
          openPanel(t.unitId)
        },
        onOpenUnit: (id) => {
          jumpToNode(id)
          openPanel(id)
        },
        onOpenSubjects: () => store.setStack(['root']),
        onOpenDomain: (id) => {
          // 领域 token 即 lane id（branch 节点）：进入其第一个子视图
          const lane = store.index.nodeById.get(id)
          if (lane) jumpToNode(id)
          else store.setStack(['root'])
        }
      })
      renderBreadcrumb(crumbEl, [], () => undefined)
      return
    }
    svgEl.style.display = 'block'
    homeEl.style.display = 'none'
    crumbEl.style.display = 'flex'
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
      progressOf: (id) => store.progressOfContainer(id),
      missingHint: (id) => {
        if (store.stateOf(id) !== 'locked') return null
        const closure = minimalHardClosure(id, store.index, store.litLeaves())
        if (closure.length === 0) return null
        const first = store.index.nodeById.get(closure[0]!)?.title.zh
        return `还差 ${closure.length} 步 · 缺 ${first ?? '?'}`
      },
      domainColor: (id) => {
        const d = store.index.nodeById.get(id)?.domain
        return d ? store.pack.domains.find((x) => x.id === d)?.color ?? null : null
      }
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
  const router = attachRouter(store, {
    onNodeRestore: (node) => {
      // 刷新/分享链接恢复选中节点（v2 spec §1 ?node=）
      if (store.index.nodeById.get(node) !== undefined) {
        selectedId = node
        renderPanel()
      }
    }
  })
  routerSyncNode = router.syncNode
  void router.detach

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
    const anchorId = (e as CustomEvent<string>).detail
    if (store.index.nodeById.get(anchorId)) openPanel(anchorId)
  })
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (selectedId !== null) {
      selectedId = null
      routerSyncNode?.(null)
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
      // 下限 0.7（审查 P0：57 个大单元 fitView 缩到 4.5px 不可读），超出交给平移缩放
      scale = Math.min(1.2, Math.max(0.7, Math.min(sw / (bbox.width + 80), sh / (bbox.height + 80))))
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
  const msg = String((err as Error)?.message ?? err)
  const isFile = window.location.protocol === 'file:'
  stageEl.innerHTML = `
    <div id="boot-error">
      <div class="boot-title">加载失败</div>
      <div class="boot-msg"></div>
      ${isFile ? '<div class="boot-msg">检测到 file:// 协议：请用静态服务器打开，例如 npx serve dist</div>' : '<button id="boot-retry" type="button">重试</button>'}
    </div>`
  // textContent 防注入（错误消息可能携带第三方包内容）
  const msgEl = stageEl.querySelector('.boot-msg')
  if (msgEl !== null) msgEl.textContent = msg
  document.getElementById('boot-retry')?.addEventListener('click', () => location.reload())
})
