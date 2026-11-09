/** 渲染进程引导（v2 spec）：路由驱动 + DetailPanel 内容本体 + 点亮仪式 */
import './styles/tokens.css'
import './styles/graph.css'
import './styles/ui.css'
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
import { createToolbar, TOOLBAR_IDS } from './view/toolbar'
import { buildSearchIndex, createSearch } from './view/search'
import { createMinimap } from './view/minimap'
import { createPackSwitcher } from './view/packSwitcher'
import { createIoProgress } from './view/ioProgress'
import { createHelpOverlay, createOnboarding } from './view/helpOverlay'
import { computeHighlight, applyHighlight, clearHighlight } from './view/highlightPath'
import { createPathTrace } from './view/pathTrace'

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

  // ── 工具栏挂载点 ──
  const toolbarMount = document.createElement('div')
  crumbEl.parentNode?.insertBefore(toolbarMount, crumbEl)

  // ── 搜索索引 + 搜索面板 ──
  let searchIndex = buildSearchIndex(store.pack.nodes)
  const searchMount = document.createElement('div')
  document.body.appendChild(searchMount)
  const search = createSearch(searchMount, {
    index: searchIndex,
    onSelect: (nodeId) => {
      jumpToNode(nodeId)
      openPanel(nodeId)
      search.close()
    }
  })

  // ── minimap 挂载 ──
  const minimapMount = document.createElement('div')
  stageEl.appendChild(minimapMount)
  const minimap = createMinimap(minimapMount, {
    onPanTo: (wx, wy) => {
      // 把视口中心移到世界坐标 (wx, wy)
      const sw = stageEl.clientWidth
      const sh = stageEl.clientHeight
      tx = sw / 2 - wx * scale
      ty = sh / 2 - wy * scale
      applyTransform()
    },
    onZoom: (delta) => {
      const factor = delta > 0 ? 1.15 : 0.87
      const rect = svgEl.getBoundingClientRect()
      const mx = rect.width / 2
      const my = rect.height / 2
      tx = mx - (mx - tx) * factor
      ty = my - (my - ty) * factor
      scale *= factor
      scale = Math.max(0.15, Math.min(4, scale))
      applyTransform()
    }
  })

  // ── 包切换 ──
  const packSwitcherMount = document.createElement('div')
  document.body.appendChild(packSwitcherMount)
  let packSwitcher = createPackSwitcher(packSwitcherMount, {
    packs: [{ id: store.pack.id, title: store.pack.title.zh }],
    currentId: store.pack.id,
    onPick: async (id) => {
      if (id === store.pack.id) { packSwitcher.close(); return }
      // 切包：重建 store（进度按包独立保存）
      const api = createWebApi()
      const newStore = new AppStore(api)
      await newStore.init()
      // 重建索引与搜索
      searchIndex = buildSearchIndex(newStore.pack.nodes)
      packSwitcher.update({ packs: [{ id: newStore.pack.id, title: newStore.pack.title.zh }], currentId: newStore.pack.id })
      // 简化：直接替换 store 引用（后续 render 用新 store）
      // 注：完整重建需要重写订阅，这里先记录
      console.warn('[pack-switch] 切换到', id, '（完整重建待集成收尾）')
      packSwitcher.close()
    }
  })

  // ── 导入导出 ──
  const ioMount = document.createElement('div')
  document.body.appendChild(ioMount)
  const io = createIoProgress(ioMount, {
    getProgress: () => store.progress,
    expectedPackId: () => store.pack.id,
    onMessage: (text, kind) => console[kind === 'error' ? 'error' : 'warn']('[io]', text),
    onApply: (p) => { store.progress = p; store.saveNow() }
  })

  // ── 帮助/引导 ──
  const helpMount = document.createElement('div')
  document.body.appendChild(helpMount)
  const help = createHelpOverlay(helpMount, { onClose: () => undefined })
  const onboardingMount = document.createElement('div')
  document.body.appendChild(onboardingMount)
  const onboarding = createOnboarding(onboardingMount, {
    storage: {
      getItem: (k: string) => localStorage.getItem(k),
      setItem: (k: string, v: string) => localStorage.setItem(k, v)
    },
    onDone: () => undefined
  })

  // ── 工具栏回调 ──
  const toolbar = createToolbar(toolbarMount, {
    onZoomIn: () => { zoomBy(1.15) },
    onZoomOut: () => { zoomBy(0.87) },
    onFit: () => fitView(),
    onReset: () => { scale = 1; tx = stageEl.clientWidth / 2; ty = 60; applyTransform() },
    onBack: () => store.back(),
    onSearch: () => search.toggle(),
    onPack: () => packSwitcher.toggle(),
    onExport: () => { io.exportNow() },
    onImport: () => { io.importButton?.click?.() },
    onHelp: () => help.toggle()
  }, { crumbSlot: document.createElement('div') })

  // ── Ctrl+K / / 打开搜索 ──
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.toggle(); return }
    if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault(); search.open()
    }
  })

  // ── hover 依赖链高亮 ──
  svgEl.addEventListener('mouseover', (e) => {
    const g = (e.target as Element).closest('g.node')
    if (!(g instanceof SVGGElement)) return
    const id = g.getAttribute('data-id')
    if (!id) return
    const hl = computeHighlight(id, store.index, store.litLeaves(), { soft: false })
    applyHighlight(svgEl, hl)
  })
  svgEl.addEventListener('mouseout', (e) => {
    const g = (e.target as Element).closest('g.node')
    if (!(g instanceof SVGGElement)) return
    clearHighlight(svgEl)
  })

  // ── pathTrace 挂载到 detailPanel ──
  // 注意：pathTraceMount 不能在 boot 时 append 到 panelEl，
  // 因为 renderDetailPanel 用 innerHTML 全量重建 panelEl 会销毁它。
  // 改在 renderPanel() 里 renderDetailPanel 之后 append。
  const pathTraceMount = document.createElement('div')
  const pathTrace = createPathTrace(pathTraceMount, {
    index: store.index,
    litLeavesProvider: () => store.litLeaves(),
    onLightLeaf: (leafId) => { void lightWithCeremony(leafId) },
    onJump: (nodeId) => { jumpToNode(nodeId); openPanel(nodeId) },
    // 收起偏好持久化（组件内部键 litree:path-trace:collapsed）
    storage: {
      getItem: (k: string) => localStorage.getItem(k),
      setItem: (k: string, v: string) => localStorage.setItem(k, v)
    }
  })

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

    // pathTraceMount 被 renderDetailPanel 的 innerHTML 重建销毁，每次 renderPanel 后重新挂载
    if (pathTraceMount.parentNode !== panelEl) panelEl.appendChild(pathTraceMount)

    // pathTrace：选中 locked 节点时打开，否则关闭
    const sel = selectedId ? store.index.nodeById.get(selectedId) : undefined
    const selState = sel ? store.stateOf(sel.id) : null
    const isLockedTarget = sel !== undefined && selState === 'locked' && (sel.kind === 'unit' || sel.kind === 'leaf' || sel.kind === 'branch')
    if (isLockedTarget) {
      pathTrace.open(sel!.id)
    } else {
      pathTrace.close()
    }
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
      minimap.clear()
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
    // minimap 更新（当前视图节点 + 视口框）
    const vp = svgEl.querySelector('.viewport')
    if (vp instanceof SVGGElement) {
      const bb = vp.getBBox()
      const miniNodes: { id: string; x: number; y: number; width: number; height: number; kind: 'branch' | 'unit' | 'leaf'; state: import('./core/graph').NodeState }[] = []
      for (const [id, pos] of currentLayout) {
        const n = store.index.nodeById.get(id)
        if (!n) continue
        miniNodes.push({
          id, x: pos.x, y: pos.y, width: pos.width, height: pos.height,
          kind: n.kind as 'branch' | 'unit' | 'leaf',
          state: store.stateOf(id)
        })
      }
      const viewRect = { x: bb.x, y: bb.y, width: bb.width, height: bb.height }
      minimap.update(miniNodes, viewRect, viewRect)
    }
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
    // 点亮前可用性快照：只遍历 hardDependentsOf 可达子集（旧实现遍历全部 9793 节点）
    const before = new Map<string, boolean>()
    const reachQueue = [id]
    const seen = new Set<string>([id])
    while (reachQueue.length > 0) {
      const cur = reachQueue.shift()!
      for (const dep of store.index.hardDependentsOf(cur)) {
        if (seen.has(dep.id)) continue
        seen.add(dep.id)
        before.set(dep.id, store.stateOf(dep.id) === 'available')
        reachQueue.push(dep.id)
      }
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
    const seen2 = new Set<string>([id])
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const dep of store.index.hardDependentsOf(cur.id)) {
        if (seen2.has(dep.id)) continue
        seen2.add(dep.id)
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
    // stub 徽章点击（跨视图前置/后继）→ 打开锚点面板
    const stub = (e.target as Element).closest('g.stub')
    if (stub instanceof SVGGElement) {
      const anchorId = stub.getAttribute('data-anchor')
      if (anchorId && store.index.nodeById.get(anchorId)) {
        openPanel(anchorId)
        return
      }
    }
    const g = (e.target as Element).closest('g.node')
    if (!(g instanceof SVGGElement)) return
    const id = g.getAttribute('data-id')
    if (id && store.index.nodeById.get(id)) {
      // locked 节点误触反馈（spec §9.3：抖动 + 锁图标确认动画）。
      // 不能 return：锁定单元也要打开面板，才能看到「还差 N 步」与 pathTrace 点亮路径，
      // 否则用户点锁着的节点只看到抖一下、什么信息都没有（操作复杂的根因之一）。
      if (store.stateOf(id) === 'locked') {
        g.classList.add('node--denied')
        window.setTimeout(() => g.classList.remove('node--denied'), 300)
      }
      openPanel(id)
    }
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
    // 粒子层坐标系同步（审查 P0：旧实现粒子位置错乱）
    effects.setTransform(tx, ty, scale)
    toolbar.setZoomPercent(scale)
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
  function zoomBy(factor: number): void {
    const rect = svgEl.getBoundingClientRect()
    const mx = rect.width / 2
    const my = rect.height / 2
    tx = mx - (mx - tx) * factor
    ty = my - (my - ty) * factor
    scale *= factor
    scale = Math.max(0.15, Math.min(4, scale))
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
    scale = Math.max(0.15, Math.min(4, scale))
    applyTransform()
  })
  let dragging = false
  let lastX = 0
  let lastY = 0
  let dragMoved = false
  svgEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return // 右键不进入拖拽（审查：旧实现右键也 dragging）
    dragging = true
    dragMoved = false
    lastX = e.clientX
    lastY = e.clientY
    svgEl.classList.add('panning')
  })
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true // 位移阈值：抑制随之而来的 click
    tx += dx
    ty += dy
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

  window.addEventListener('resize', () => {
    // 审查：旧实现只有 effects 监听 resize，视口不重新 fit
    if (renderedContainerId !== null && renderedContainerId !== 'home') fitView()
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
