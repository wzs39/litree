/** DetailPanel（v2 spec §2）：节点内容本体——摘要/资源/练习/证据/前置链 + 确认点亮 */
import { minimalHardClosure, type GraphIndex } from '../core/graph'
import type { AppStore } from '../core/store'
import type { PackNode } from '../core/types'
import { esc } from './escape'
import { icon } from './icons'

export interface DetailHandlers {
  /** 确认点亮（main 层执行仪式：store.lightLeaf + 动效） */
  onLight(id: string): void
  /** 进入容器视图（stack 需含其祖先链） */
  onEnter(id: string): void
  /** 跳到任意节点的所属视图 */
  onJump(id: string): void
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
  const kindLabel = node.core === false ? '选修' : node.kind === 'unit' ? '主干' : node.kind === 'branch' ? '分支' : '知识点'
  const state = store.stateOf(node.id)

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
  const canLight =
    node.kind === 'leaf' && state === 'available'
  const missingFirst = closure.length > 0 ? store.index.nodeById.get(closure[0])?.title.zh : undefined

  const resList = (node.resources ?? [])
    .map(
      (r) =>
        `<a class="dp-res" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">` +
        `<span class="dp-res-lang">${r.lang === 'en' ? 'EN' : r.lang === 'zh' ? '中' : '·'}</span>` +
        `<span class="dp-res-body"><span class="dp-res-title">${esc(r.title)}</span>` +
        `<span class="dp-res-url">${esc(r.url.replace(/^https?:\/\//, '').slice(0, 42))}</span></span></a>`
    )
    .join('')

  const exList = (node.exercises ?? [])
    .map((ex) => `<div class="dp-exercise">${esc(ex)}</div>`)
    .join('')

  const closureRows = closure
    .map((cid) => {
      const c = store.index.nodeById.get(cid)
      if (!c) return ''
      const lit = store.stateOf(cid) === 'lit'
      return `<div class="dp-dep${lit ? ' dp-dep--lit' : ''}" data-jump="${esc(cid)}">` +
        `<span class="dp-dep-state">${lit ? '●' : '○'}</span>${esc(c.title.zh)}</div>`
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

  const actionArea = (() => {
    if (node.kind === 'leaf') {
      if (state === 'lit') {
        return `<div class="dp-action dp-action--done">✓ 已点亮</div>`
      }
      if (canLight) {
        return `<button id="dp-light" class="dp-action dp-action--light" type="button">我已掌握，点亮</button>`
      }
      return `<div class="dp-action dp-action--locked">🔒 还差 ${closure.length} 步${missingFirst ? ` · 缺「${esc(missingFirst)}」` : ''}</div>`
    }
    if (node.kind === 'unit') {
      const avail = state === 'available'
      return (
        `<button id="dp-enter" class="dp-action dp-action--enter" type="button">进入单元</button>` +
        (avail && store.index.leavesOf(node.id).some((l) => store.progress.lit[l.id] === undefined)
          ? `<button id="dp-light-all" class="dp-action dp-action--light" type="button">批量点亮全部知识点</button>`
          : '')
      )
    }
    return `<button id="dp-enter" class="dp-action dp-action--enter" type="button">进入${node.kind === 'branch' ? '分支' : ''}</button>`
  })()

  el.innerHTML = `
    <div class="dp-colorbar" style="background:${esc(color)}"></div>
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
    ${node.summary ? `<div class="dp-summary">${esc(node.summary)}</div>` : ''}
    ${resList ? `<div class="dp-cap">学习资源</div>${resList}` : ''}
    ${exList ? `<div class="dp-cap">练习</div>${exList}` : ''}
    ${node.evidence ? `<div class="dp-cap">前置依据</div><div class="dp-evidence">${esc(node.evidence)}</div>` : ''}
    ${closureRows ? `<div class="dp-cap">前置链（还差 ${closure.length} 步）</div><div class="dp-deps">${closureRows}</div>` : ''}
    ${dependentRows ? `<div class="dp-cap">后继${dependentTotal > 3 ? `（共 ${dependentTotal} 个，显示前 3）` : ''}</div><div class="dp-deps">${dependentRows}</div>` : ''}
    <div class="dp-actions">${actionArea}</div>
  `
  el.style.display = 'block'

  el.querySelector('#dp-close')?.addEventListener('click', () => renderDetailPanel(el, store, null, handlers))
  el.querySelector('#dp-light')?.addEventListener('click', () => handlers.onLight(node.id))
  el.querySelector('#dp-enter')?.addEventListener('click', () => {
    if (node.kind !== 'leaf') handlers.onEnter(node.id)
  })
  el.querySelector('#dp-light-all')?.addEventListener('click', () => {
    try {
      store.lightAllLeaves(node.id)
    } catch (err) {
      console.error(err)
    }
    renderDetailPanel(el, store, node.id, handlers)
  })
  el.querySelectorAll('[data-jump]').forEach((item) => {
    item.addEventListener('click', () => {
      const id = (item as HTMLElement).dataset['jump']
      if (id) handlers.onJump(id)
    })
  })
}
