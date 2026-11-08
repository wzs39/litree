/** 渲染进程引导：T8 为钻取浏览最小装配，T9 换入 AppStore 全量接线 */
import './styles/tokens.css'
import './styles/graph.css'
import { createWebApi } from './api/webApi'
import { aggregateState, buildGraphIndex } from './core/graph'
import { layoutSubview } from './layout/elk'
import { renderBreadcrumb, type Crumb } from './view/breadcrumb'
import { renderGraph } from './view/graphCanvas'

const svgEl = document.getElementById('graph') as unknown as SVGSVGElement
const crumbEl = document.getElementById('breadcrumb')!

async function boot(): Promise<void> {
  const api = createWebApi()
  const packId = await api.defaultPackId()
  const loaded = await api.loadPack(packId)
  const appEl = document.getElementById('app')!
  if ('error' in loaded) {
    appEl.textContent = '数据包加载失败: ' + loaded.error
    return
  }
  const pack = loaded
  const index = buildGraphIndex(pack)

  const lit = new Set<string>()
  const learning: Record<string, string> = {}
  let viewStack: string[] = ['root']
  let viewToken = 0

  const stateOf = (id: string) => aggregateState(id, index, lit, learning)

  function trail(): Crumb[] {
    const out: Crumb[] = [{ id: 'root', label: pack.title.zh }]
    for (const id of viewStack.slice(1)) {
      const n = index.nodeById.get(id)
      if (n) out.push({ id, label: n.title.zh })
    }
    return out
  }

  async function renderView(): Promise<void> {
    const token = ++viewToken
    const containerId = viewStack[viewStack.length - 1]!
    const layout = await layoutSubview(pack, index, containerId)
    if (token !== viewToken) return // 已切视图，丢弃过期结果
    renderGraph(svgEl, pack, index, containerId, layout, stateOf, {
      onStubClick: (extId) => {
        const n = index.nodeById.get(extId)
        if (n) jumpTo(n.parent ?? 'root')
      }
    })
    fitView()
    renderBreadcrumb(crumbEl, trail(), (i) => {
      viewStack = viewStack.slice(0, i + 1)
      void renderView()
    })
  }

  function jumpTo(containerId: string): void {
    if (viewStack.includes(containerId)) {
      viewStack = viewStack.slice(0, viewStack.indexOf(containerId) + 1)
    } else {
      viewStack.push(containerId)
    }
    void renderView()
  }

  // 双击进入容器；stub 徽章跳转
  svgEl.addEventListener('dblclick', (e) => {
    const g = (e.target as Element).closest('g.node')
    if (!(g instanceof SVGGElement)) return
    const id = g.getAttribute('data-id')
    const node = id ? index.nodeById.get(id) : undefined
    if (node && (node.kind === 'branch' || node.kind === 'unit')) jumpTo(node.id)
  })
  svgEl.addEventListener('stub-click', (e) => {
    const extId = (e as CustomEvent<string>).detail
    const n = index.nodeById.get(extId)
    if (n) jumpTo(n.parent ?? 'root')
  })
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && viewStack.length > 1) {
      viewStack.pop()
      void renderView()
    }
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
    const stage = document.getElementById('stage')!
    const sw = stage.clientWidth
    const sh = stage.clientHeight
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
