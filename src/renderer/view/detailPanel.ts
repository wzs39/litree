/** DetailPanel（v2 spec §2）：节点内容本体——摘要/资源/练习/证据/前置链 + 确认点亮 */
import { leafAvailable, minimalHardClosure, type GraphIndex } from '../core/graph'
import type { AppStore } from '../core/store'
import type { PackNode } from '../core/types'
import { esc } from './escape'
import { icon } from './icons'

export interface DetailHandlers {
  /** 确认点亮（main 层执行仪式：store.lightLeaf + 动效；force=true 时支持跳过门控自由点亮） */
  onLight(id: string, force?: boolean): void
  /** 撤回知识点点亮标记 */
  onUnlight?(id: string): void
  /** 批量点亮单元全部知识点（force=true 支持跳过门控） */
  onLightAll?(unitId: string, force?: boolean): void
  /** 批量撤回单元全部已点亮知识点 */
  onUnlightAll?(unitId: string): void
  /** 进入容器视图（stack 需含其祖先链） */
  onEnter(id: string): void
  /** 跳到任意节点的所属视图 */
  onJump(id: string): void
  /** 关闭面板（main 层清 selectedId） */
  onClose(): void
}

/** 节点所属的最近 unit（叶子沿 parent 链上溯；unit 即自身） */
export function owningUnit(node: PackNode): string {
  if (node.kind === 'unit') return node.id
  return node.parent ?? node.id
}

export function ancestorStack(index: GraphIndex, id: string): string[] {
  const stack: string[] = []
  let cur: string | null = id
  while (cur !== null) {
    stack.unshift(cur)
    cur = index.nodeById.get(cur)?.parent ?? null
  }
  return ['root', ...stack]
}

export function renderDetailPanel(
  el: HTMLElement,
  store: AppStore,
  nodeId: string | null,
  handlers: DetailHandlers
): void {
  if (!nodeId) {
    el.style.display = 'none'
    el.innerHTML = ''
    return
  }
  const node = store.index.nodeById.get(nodeId)
  if (!node) {
    el.style.display = 'none'
    el.innerHTML = ''
    return
  }
  const domain = store.pack.domains.find((d) => d.id === node.domain)
  const color = domain?.color ?? '#7fd0ff'
  const state = store.stateOf(node.id)
  const kindLabel =
    node.kind === 'branch'
      ? (node.core !== false ? '🌌 核心星系' : '🌌 边缘星系')
      : node.kind === 'unit'
      ? (state === 'lit' ? '☀️ 恒星级系统' : '🪐 行星级系统')
      : (node.core !== false ? '✦ 主干知识卫星' : '✦ 选修知识卫星')

  // 前置链（叶子映射所属 unit）
  const unitId = node.kind === 'leaf' ? owningUnit(node) : node.kind === 'unit' ? node.id : null
  const closure = unitId ? minimalHardClosure(unitId, store.index, store.litLeaves()) : []

  // 后继（被谁依赖）：去重 top 3
  const dependents =
    node.kind === 'unit'
      ? store.index.hardDependentsOf(node.id).slice(0, 3)
      : []
  const dependentTotal =
    node.kind === 'unit' ? store.index.hardDependentsOf(node.id).length : 0

  const unit = unitId ? store.index.nodeById.get(unitId) : undefined
  // 点亮资格按门控语义（leafAvailable），不用视觉态——learning 标记不得阻断点亮
  const canLight = node.kind === 'leaf' && leafAvailable(node.id, store.index, store.litLeaves())
  const firstId = closure[0]
  const missingFirst =
    firstId !== undefined ? store.index.nodeById.get(firstId)?.title.zh : undefined
  // 叶子内容回退：叶子自身无 summary/资源/练习/证据时展示所属单元的（审查 P0：面板空壳）
  const contentNode: PackNode | undefined =
    node.kind === 'leaf' ? (unit && unit.kind === 'unit' ? unit : undefined) : node
  const contentFromUnit = node.kind === 'leaf'

  const resList = (contentNode?.resources ?? [])
    .map(
      (r) =>
        `<a class="dp-res" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">` +
        `<span class="dp-res-lang">${r.lang === 'en' ? 'EN' : r.lang === 'zh' ? '中' : '·'}</span>` +
        `<span class="dp-res-body"><span class="dp-res-title">${esc(r.title)}</span>` +
        `<span class="dp-res-url">${esc(r.url.replace(/^https?:\/\//, '').slice(0, 42))}</span></span></a>`
    )
    .join('')

  const exList = (contentNode?.exercises ?? [])
    .map((ex) => `<div class="dp-exercise">${esc(ex)}</div>`)
    .join('')

  const litNote =
    node.kind === 'leaf' && state === 'lit'
      ? `<div class="dp-cap">我的笔记</div>` +
        `<textarea id="dp-note" class="dp-note" placeholder="卡住了？记录上下文…">${esc(store.progress.lit[node.id]?.note ?? '')}</textarea>`
      : ''

  // 边的 reason（"为什么需要这门前置"）：validatePack 现在会保留它，
  // 之前 UI 完全看不到（spec §1「每条前置边可附证据」名不副实）。
  // 按 to 端聚合，前置链每一项若命中则展示依据。
  const reasonByTo = new Map<string, string>()
  for (const e of store.pack.edges) {
    if (e.type === 'hard' && e.reason) reasonByTo.set(e.to, e.reason)
  }
  const closureRows = closure
    .map((cid) => {
      const c = store.index.nodeById.get(cid)
      if (!c) return ''
      const lit = store.stateOf(cid) === 'lit'
      const reason = reasonByTo.get(cid)
      return `<div class="dp-dep${lit ? ' dp-dep--lit' : ''}" data-jump="${esc(cid)}">` +
        `<span class="dp-dep-state">${lit ? '●' : '○'}</span>` +
        `<span class="dp-dep-body"><span class="dp-dep-title">${esc(c.title.zh)}</span>` +
        (reason ? `<span class="dp-dep-reason">${esc(reason)}</span>` : '') +
        `</span></div>`
    })
    .join('')

  const dependentRows = dependents
    .map((d) => `<div class="dp-dep" data-jump="${esc(d.id)}">→ ${esc(d.title.zh)}</div>`)
    .join('')

  const progressLine =
    node.kind !== 'leaf'
      ? (() => {
          const p = store.progressOfContainer(node.id)
          return `<div class="dp-progress">${p.lit}/${p.total} 个知识点已点亮</div>`
        })()
      : ''

  // 点亮后的"下一步"：所属单元内第一个可点亮叶子
  const nextUp =
    node.kind === 'leaf' && state === 'lit' && unitId
      ? store.index
          .leavesOf(unitId)
          .find((l) => l.id !== node.id && leafAvailable(l.id, store.index, store.litLeaves()) && store.stateOf(l.id) !== 'lit')
      : undefined

  // Google 官方资料库与学术检索快捷通道
  const searchBaseTitle = (contentNode?.title.en ? `${contentNode.title.en} ` : '') + (contentNode?.title.zh ?? node.title.zh)
  const q = encodeURIComponent(searchBaseTitle.trim())
  const googleDevUrl = `https://developers.google.com/search?q=${q}`
  const googleCloudUrl = `https://cloud.google.com/search?q=${q}`
  const googleScholarUrl = `https://scholar.google.com/scholar?q=${q}`
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchBaseTitle.trim() + ' documentation tutorial')}`

  const googleSection = `
    <div class="dp-cap">Google 官方知识库与文献</div>
    <div class="dp-google-group">
      <a class="dp-res" href="${googleDevUrl}" target="_blank" rel="noopener noreferrer">
        <span class="dp-res-lang" style="color:#4285f4; border-color:rgba(66,133,244,0.4)">G·Dev</span>
        <span class="dp-res-body">
          <span class="dp-res-title">Google Developers 官方文档与指南</span>
          <span class="dp-res-url">developers.google.com</span>
        </span>
      </a>
      <a class="dp-res" href="${googleCloudUrl}" target="_blank" rel="noopener noreferrer">
        <span class="dp-res-lang" style="color:#ea4335; border-color:rgba(234,67,53,0.4)">G·Cloud</span>
        <span class="dp-res-body">
          <span class="dp-res-title">Google Cloud 架构中心与工程实践</span>
          <span class="dp-res-url">cloud.google.com/architecture</span>
        </span>
      </a>
      <a class="dp-res" href="${googleScholarUrl}" target="_blank" rel="noopener noreferrer">
        <span class="dp-res-lang" style="color:#fbbc05; border-color:rgba(251,188,5,0.4)">Scholar</span>
        <span class="dp-res-body">
          <span class="dp-res-title">Google Scholar 学术文献与论文检索</span>
          <span class="dp-res-url">scholar.google.com</span>
        </span>
      </a>
      <a class="dp-res" href="${googleSearchUrl}" target="_blank" rel="noopener noreferrer">
        <span class="dp-res-lang" style="color:#34a853; border-color:rgba(52,168,83,0.4)">Search</span>
        <span class="dp-res-body">
          <span class="dp-res-title">Google 专题精准检索（教程与专栏）</span>
          <span class="dp-res-url">google.com</span>
        </span>
      </a>
    </div>
  `

  const actionArea = (() => {
    const learningBtn =
      state !== 'lit'
        ? `<button id="dp-learning" class="dp-action dp-action--secondary" type="button">${state === 'learning' ? '取消"学习中"标记' : '标记为学习中'}</button>`
        : ''
    if (node.kind === 'leaf') {
      if (state === 'lit') {
        return (
          `<div class="dp-action dp-action--done">✓ 已点亮</div>` +
          `<button id="dp-unlight" class="dp-action dp-action--secondary" type="button">撤回点亮标记（重新学习）</button>` +
          (nextUp
            ? `<button id="dp-next" class="dp-action dp-action--secondary" type="button">下一个可学：${esc(nextUp.title.zh.slice(0, 10))}</button>`
            : '')
        )
      }
      if (canLight) {
        return (
          `<button id="dp-light" class="dp-action dp-action--light" type="button">我已掌握，点亮</button>` + learningBtn
        )
      }
      return (
        `<div class="dp-action dp-action--locked">🔒 还差 ${closure.length} 步${missingFirst ? ` · 缺「${esc(missingFirst)}」` : ''}</div>` +
        `<button id="dp-force-light" class="dp-action dp-action--light" type="button" title="跳过前置门控限制直接点亮">跳过前置，直接点亮 (自由学习)</button>` +
        learningBtn
      )
    }
    if (node.kind === 'unit') {
      const avail = state === 'available'
      const hasUnlit = store.index.leavesOf(node.id).some((l) => store.progress.lit[l.id] === undefined)
      const hasLit = store.index.leavesOf(node.id).some((l) => store.progress.lit[l.id] !== undefined)
      return (
        `<button id="dp-enter" class="dp-action dp-action--enter" type="button">进入单元</button>` +
        (hasUnlit && avail
          ? `<button id="dp-light-all" class="dp-action dp-action--light" type="button">批量点亮全部知识点</button>`
          : '') +
        (hasUnlit && !avail
          ? `<button id="dp-force-light-all" class="dp-action dp-action--secondary" type="button" title="跳过前置限制直接学习点亮该单元">跳过前置，批量点亮全部 (自由学习)</button>`
          : '') +
        (hasLit
          ? `<button id="dp-unlight-all" class="dp-action dp-action--secondary" type="button">撤回本单元已点亮内容</button>`
          : '') +
        learningBtn
      )
    }
    return (
      `<button id="dp-enter" class="dp-action dp-action--enter" type="button">进入${node.kind === 'branch' ? '分支' : ''}</button>` +
      learningBtn
    )
  })()

  const celestialDrilldownBar =
    node.kind === 'branch' || node.kind === 'unit'
      ? `<div class="dp-celestial-focus-bar" id="dp-focus-enter" title="点击或在画布上再次点击深入星系">` +
        `<span class="dp-focus-icon">${node.kind === 'branch' ? '🌌' : state === 'lit' ? '☀️' : '🪐'}</span>` +
        `<span class="dp-focus-text">已锁定聚焦天体 · 点击深入星系</span>` +
        `<span class="dp-focus-arrow">⤓</span></div>`
      : `<div class="dp-celestial-focus-bar dp-celestial-focus-bar--leaf">` +
        `<span class="dp-focus-icon">✦</span>` +
        `<span class="dp-focus-text">已聚焦知识卫星 · 准备就绪</span></div>`

  el.innerHTML = `
    <div class="dp-colorbar" style="background:${esc(color)}"></div>
    ${celestialDrilldownBar}
    <div class="dp-head">
      <div class="dp-title">${esc(node.title.zh)}${node.title.en ? `<span class="dp-title-en">${esc(node.title.en)}</span>` : ''}</div>
      <button id="dp-close" class="dp-close" aria-label="关闭">${icon('back', 12)}</button>
    </div>
    <div class="dp-meta">
      <span class="dp-kind">${kindLabel}</span>
      <span class="dp-domain" style="background:${esc(color)}">${esc(domain?.name ?? node.domain)}</span>
      ${state === 'lit' ? '<span class="dp-state dp-state--lit">已点亮</span>' : ''}
      ${state === 'learning' ? '<span class="dp-state dp-state--learning">学习中</span>' : ''}
    </div>
    ${progressLine}
    ${contentFromUnit && contentNode ? `<div class="dp-from">以下内容来自单元「<span class="dp-from-link" data-jump="${esc(contentNode.id)}">${esc(contentNode.title.zh)}</span>」</div>` : ''}
    ${contentNode?.summary ? `<div class="dp-summary">${esc(contentNode.summary)}</div>` : ''}
    ${resList ? `<div class="dp-cap">学习资源</div>${resList}` : ''}
    ${googleSection}
    ${exList ? `<div class="dp-cap">练习</div>${exList}` : ''}
    ${contentNode?.evidence ? `<div class="dp-cap">前置依据</div><div class="dp-evidence">${esc(contentNode.evidence)}</div>` : ''}
    ${litNote}
    ${closureRows ? `<div class="dp-cap">前置链（还差 ${closure.length} 步）</div><div class="dp-deps">${closureRows}</div>` : ''}
    ${dependentRows ? `<div class="dp-cap">后继${dependentTotal > 3 ? `（共 ${dependentTotal} 个，显示前 3）` : ''}</div><div class="dp-deps">${dependentRows}</div>` : ''}
    <div class="dp-actions">${actionArea}</div>
  `
  el.style.display = 'block'

  el.querySelector('#dp-close')?.addEventListener('click', () => handlers.onClose())
  el.querySelector('#dp-focus-enter')?.addEventListener('click', () => {
    if (node.kind !== 'leaf') handlers.onEnter(node.id)
  })
  el.querySelector('#dp-light')?.addEventListener('click', () => handlers.onLight(node.id, false))
  el.querySelector('#dp-force-light')?.addEventListener('click', () => handlers.onLight(node.id, true))
  el.querySelector('#dp-unlight')?.addEventListener('click', () => {
    if (handlers.onUnlight) handlers.onUnlight(node.id)
    else store.unlightLeaf(node.id)
    renderDetailPanel(el, store, node.id, handlers)
  })
  el.querySelector('#dp-enter')?.addEventListener('click', () => {
    if (node.kind !== 'leaf') handlers.onEnter(node.id)
  })
  el.querySelector('#dp-light-all')?.addEventListener('click', () => {
    try {
      if (handlers.onLightAll) handlers.onLightAll(node.id, false)
      else store.lightAllLeaves(node.id, false)
    } catch (err) {
      console.error('批量点亮失败', err)
    }
    renderDetailPanel(el, store, node.id, handlers)
  })
  el.querySelector('#dp-force-light-all')?.addEventListener('click', () => {
    try {
      if (handlers.onLightAll) handlers.onLightAll(node.id, true)
      else store.lightAllLeaves(node.id, true)
    } catch (err) {
      console.error('批量自由点亮失败', err)
    }
    renderDetailPanel(el, store, node.id, handlers)
  })
  el.querySelector('#dp-unlight-all')?.addEventListener('click', () => {
    try {
      if (handlers.onUnlightAll) handlers.onUnlightAll(node.id)
      else store.unlightAllLeaves(node.id)
    } catch (err) {
      console.error('批量撤回失败', err)
    }
    renderDetailPanel(el, store, node.id, handlers)
  })
  el.querySelector('#dp-learning')?.addEventListener('click', () => {
    store.toggleLearning(node.id)
  })
  el.querySelector('#dp-next')?.addEventListener('click', () => {
    if (nextUp) {
      handlers.onJump(nextUp.id)
    }
  })
  el.querySelector('#dp-note')?.addEventListener('blur', (e) => {
    const value = (e.target as HTMLTextAreaElement).value
    const rec = store.progress.lit[node.id]
    if (rec && rec.note !== value) {
      rec.note = value
      store.saveNow()
    }
  })
  el.querySelectorAll('[data-jump]').forEach((item) => {
    item.addEventListener('click', () => {
      const id = (item as HTMLElement).dataset['jump']
      if (id) handlers.onJump(id)
    })
  })
}
