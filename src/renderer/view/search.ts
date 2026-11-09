/**
 * view/search.ts — 全局搜索命令面板（Ctrl+K / /）
 *
 * 分两层：
 *  1) 纯逻辑层 `buildSearchIndex(nodes)` —— 无 DOM 依赖，可单测、可复用。
 *     一次建索引（每个节点只遍历一次，见 stats.traversed），多次查询。
 *  2) DOM 层 `createSearch(mount, deps)` —— 覆盖层 + 键盘导航 + 焦点陷阱。
 *
 * 约束：不 import core/store / view/graphCanvas；只依赖 core/types 的类型；
 * 跳转由 lead 在 main.ts 的 onSelect 里实现（ancestorStack + setStack + openPanel）。
 */
import type { PackNode } from '../core/types'

/** 结果项固定 class / 容器 id —— e2e 与样式契约 */
export const SEARCH_SELECTORS = {
  overlay: 'search-overlay',
  input: 'search-input',
  itemClass: 'search-item',
  results: 'search-results',
  empty: 'search-empty'
} as const

export type SearchScore = 3 | 2 | 1 // 3=前缀 2=包含 1=子序列

export interface SearchHit {
  id: string
  node: PackNode
  /** 命中的字段名，供 UI 标注 */
  field: 'title.zh' | 'title.en' | 'id' | 'domain' | 'summary'
  score: SearchScore
  /** 归一化排序权重：score*1000 - 长度惩罚 - 深度惩罚，越大越靠前 */
  rank: number
  /** 层级路径「学科 › lane › unit › 章」，由 parent 链上溯 */
  path: string[]
  /** 命中片段：[before, mark, after]，UI 只把 mark 包 <mark> */
  snippet: [string, string, string]
}

export interface SearchStats {
  /** 建索引时对 nodes 的遍历次数（必须等于 nodes.length，用于「只遍历一次」断言） */
  traversed: number
  nodes: number
  /** 累计查询次数 */
  queries: number
  /** 累计被扫描的条目数：每次查询 = size（单趟线性扫描），用于确定性断言扫描上界 */
  scanned: number
}

export interface SearchIndex {
  /** 查询；大小写不敏感；结果按 rank 降序；上限 limit（默认 50，硬上限 50） */
  search(query: string, limit?: number): SearchHit[]
  /** 命中片段的字段名集合，供 UI 展示 */
  readonly size: number
  readonly stats: SearchStats
}

const MAX_RESULTS = 50

/** 子序列判定：needle 的字符按序出现在 haystack 中即命中（不要求连续） */
export function isSubsequence(needle: string, haystack: string): boolean {
  if (needle.length === 0) return true
  let i = 0
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack.charCodeAt(j) === needle.charCodeAt(i)) i++
  }
  return i === needle.length
}

/** 三档打分：前缀 3 / 包含 2 / 子序列 1；都不满足返回 0 */
export function scoreField(needle: string, haystack: string): SearchScore | 0 {
  if (needle.length === 0 || haystack.length === 0) return 0
  if (haystack.startsWith(needle)) return 3
  if (haystack.includes(needle)) return 2
  if (isSubsequence(needle, haystack)) return 1
  return 0
}

/** 截取命中片段：以 needle 首次出现处为中心，前后各留 PAD 个字符 */
const PAD = 18
function makeSnippet(text: string, needle: string, whole: boolean): [string, string, string] {
  if (text.length === 0) return ['', '', '']
  const at = whole ? 0 : text.toLowerCase().indexOf(needle)
  if (at < 0) return [text.slice(0, PAD * 2), '', '']
  const start = Math.max(0, at - PAD)
  const end = Math.min(text.length, at + needle.length + PAD)
  return [
    (start > 0 ? '…' : '') + text.slice(start, at),
    text.slice(at, at + needle.length),
    text.slice(at + needle.length, end) + (end < text.length ? '…' : '')
  ]
}

/**
 * 建一次可复用的搜索索引。
 * 单次遍历 nodes：为每个节点拼出小写 hay（title.zh|title.en|id|domain|summary），
 * 并缓存 parent 指针用于事后上溯路径（不在此时展开，避免 O(n·depth) 建索引成本）。
 */
export function buildSearchIndex(nodes: readonly PackNode[]): SearchIndex {
  const byId = new Map<string, PackNode>()
  for (const n of nodes) byId.set(n.id, n)

  interface Entry {
    node: PackNode
    hayZh: string
    hayEn: string
    hayId: string
    hayDomain: string
    haySummary: string
    /** 主命中字段的小写原文（用于片段截取） */
    primary: string
    depth: number
    len: number
  }

  const entries: Entry[] = []
  let traversed = 0
  for (const node of nodes) {
    traversed++
    const zh = (node.title.zh ?? '').toLowerCase()
    const en = (node.title.en ?? '').toLowerCase()
    const id = node.id.toLowerCase()
    const domain = (node.domain ?? '').toLowerCase()
    const summary = (node.summary ?? '').toLowerCase()
    let depth = 0
    let cur = node.parent
    const guardLimit = nodes.length + 8
    let guard = 0
    while (cur !== null && guard++ < guardLimit) {
      const p = byId.get(cur)
      if (p === undefined) break
      depth++
      cur = p.parent
    }
    entries.push({
      node,
      hayZh: zh,
      hayEn: en,
      hayId: id,
      hayDomain: domain,
      haySummary: summary,
      primary: zh.length > 0 ? node.title.zh : node.id,
      depth,
      len: zh.length + en.length + id.length
    })
  }

  /** 沿 parent 上溯拼层级路径（根在前）；深度上限 16 层，防御性 */
  function pathOf(node: PackNode): string[] {
    const out: string[] = []
    let cur: PackNode | undefined = node
    let guard = 0
    while (cur !== undefined && guard++ < 16) {
      out.unshift(cur.title.zh || cur.id)
      cur = cur.parent === null ? undefined : byId.get(cur.parent)
    }
    return out
  }

  const index: SearchIndex = {
    size: entries.length,
    stats: { traversed, nodes: entries.length, queries: 0, scanned: 0 },
    search(query: string, limit = MAX_RESULTS): SearchHit[] {
      const needle = query.trim().toLowerCase()
      if (needle.length === 0) return []
      index.stats.queries++
      index.stats.scanned += entries.length
      const cap = Math.min(Math.max(1, Math.floor(limit)), MAX_RESULTS)
      const hits: SearchHit[] = []
      for (const e of entries) {
        let best: SearchScore | 0 = 0
        let field: SearchHit['field'] = 'title.zh'
        let raw = e.node.title.zh
        const probes: [SearchScore | 0, SearchHit['field'], string][] = [
          // 中文按「前缀 + 包含」为主，子序列给中文场景权重压低（长度惩罚更重）
          [scoreField(needle, e.hayZh), 'title.zh', e.node.title.zh],
          [scoreField(needle, e.hayEn), 'title.en', e.node.title.en ?? e.node.id],
          [scoreField(needle, e.hayId), 'id', e.node.id],
          [scoreField(needle, e.hayDomain), 'domain', e.node.domain],
          [scoreField(needle, e.haySummary), 'summary', e.node.summary ?? '']
        ]
        for (const [s, f, original] of probes) {
          if (s > best) {
            best = s
            field = f
            raw = original
          }
        }
        if (best === 0) continue
        // 标题命中优先于摘要命中：同为「包含」时，短字段更值得靠前
        const fieldBonus = field === 'title.zh' || field === 'title.en' ? 200 : field === 'id' ? 120 : field === 'domain' ? 60 : 0
        hits.push({
          id: e.node.id,
          node: e.node,
          field,
          score: best,
          rank: best * 1000 + fieldBonus - Math.min(e.len, 400) - e.depth,
          path: pathOf(e.node),
          snippet: makeSnippet(raw, needle, field === 'title.zh' && raw.length > 0 && raw.toLowerCase().startsWith(needle))
        })
      }
      hits.sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id))
      return hits.length > cap ? hits.slice(0, cap) : hits
    }
  }
  return index
}

/** 字段名的中文标注 */
export const FIELD_LABEL: Record<SearchHit['field'], string> = {
  'title.zh': '名称',
  'title.en': '英文名',
  id: '编号',
  domain: '学科',
  summary: '简介'
}

// ───────────────────────────── DOM 层 ─────────────────────────────

export interface SearchDeps {
  index: SearchIndex
  onSelect: (nodeId: string, node: PackNode) => void
  /** 可选：面板打开/关闭钩子，lead 用来暂停画布快捷键 */
  onOpen?: () => void
  onClose?: () => void
  /** 面板标题文案 */
  placeholder?: string
}

export interface SearchHandle {
  readonly root: HTMLElement
  open(): void
  close(): void
  toggle(): void
  readonly isOpen: boolean
  /** 供 lead 复用：查询并渲染（单测与程序化调用都走这里） */
  query(q: string): SearchHit[]
  /** 卸载并解绑全部监听 */
  destroy(): void
}

/**
 * 面板内可聚焦元素。刻意用 `querySelectorAll('*')` + JS 过滤（而不是复合 CSS 选择器）：
 * 既避免选择器在旧 Safari 上的 :not 兼容坑，也让单测里的最小 DOM 能跑同一条路径。
 */
function focusable(root: HTMLElement): HTMLElement[] {
  const all = root.querySelectorAll<HTMLElement>('*')
  const out: HTMLElement[] = []
  for (const el of Array.from(all)) {
    const tag = el.tagName.toUpperCase()
    const tabbable = tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'A' || el.tabIndex === 0
    if (!tabbable) continue
    if ((el as HTMLButtonElement).disabled === true) continue
    if (el.getAttribute('tabindex') === '-1') continue
    out.push(el)
  }
  return out
}

/** 建全局快捷键代理：Ctrl+K / Cmd+K / 裸 `/`（焦点不在输入框里时） */
export interface SearchHotkeyHandle {
  detach(): void
}
/** 最小事件目标（便于单测注入假目标；真实场景就是 window） */
export interface HotkeyTarget {
  addEventListener(type: string, listener: (ev: Event) => void): void
  removeEventListener(type: string, listener: (ev: Event) => void): void
}
function defaultHotkeyTarget(): HotkeyTarget {
  const g = globalThis as unknown as { window?: HotkeyTarget }
  return g.window ?? (globalThis as unknown as HotkeyTarget)
}
export function attachSearchHotkey(
  search: { open(): void },
  target?: HotkeyTarget
): SearchHotkeyHandle {
  const t = target ?? defaultHotkeyTarget()
  const fn = (ev: Event): void => {
    const e = ev as KeyboardEvent
    const typed = e as unknown as { target?: HTMLElement | null }
    const el = typed.target ?? null
    const typing =
      el !== null &&
      (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true)
    const mod = e.ctrlKey === true || e.metaKey === true
    if (mod && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault()
      search.open()
      return
    }
    if (!mod && e.key === '/' && !typing) {
      e.preventDefault()
      search.open()
    }
  }
  t.addEventListener('keydown', fn)
  return { detach: () => t.removeEventListener('keydown', fn) }
}

export function createSearch(mount: HTMLElement, deps: SearchDeps): SearchHandle {
  let lastFocus: HTMLElement | null = null
  let panelOpen = false
  let activeIndex = -1
  let currentHits: SearchHit[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  const listeners: { el: EventTarget; type: string; fn: (e: Event) => void }[] = []

  function on(el: EventTarget, type: string, fn: (e: Event) => void): void {
    el.addEventListener(type, fn)
    listeners.push({ el, type, fn })
  }

  const root = document.createElement('div')
  root.id = SEARCH_SELECTORS.overlay
  root.className = 'ui-search'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', '全局搜索')
  root.setAttribute('aria-hidden', 'true')
  root.hidden = true

  const box = document.createElement('div')
  box.className = 'ui-search__box'

  const input = document.createElement('input')
  input.id = SEARCH_SELECTORS.input
  input.type = 'search'
  input.className = 'ui-search__input'
  input.autocomplete = 'off'
  input.spellcheck = false
  input.setAttribute('aria-label', '搜索知识点')
  input.setAttribute('aria-controls', SEARCH_SELECTORS.results)
  input.placeholder = deps.placeholder ?? '搜索知识点、单元、编号…'

  const results = document.createElement('ul')
  results.id = SEARCH_SELECTORS.results
  results.className = 'ui-search__results'
  results.setAttribute('role', 'listbox')
  results.setAttribute('aria-label', '搜索结果')

  const empty = document.createElement('div')
  empty.className = SEARCH_SELECTORS.empty
  empty.id = SEARCH_SELECTORS.empty
  empty.textContent = '输入关键词开始搜索'

  const hint = document.createElement('div')
  hint.className = 'ui-search__hint'
  hint.textContent = '↑↓ 选择 · Enter 打开 · Esc 关闭'

  box.append(input, empty, results, hint)
  root.appendChild(box)
  mount.appendChild(root)

  function renderEmpty(text: string): void {
    empty.textContent = text
    empty.hidden = false
    results.replaceChildren()
    currentHits = []
    activeIndex = -1
    input.removeAttribute('aria-activedescendant')
  }

  /** 渲染结果列表；返回渲染条数 */
  function renderHits(hits: SearchHit[]): number {
    if (hits.length === 0) {
      renderEmpty('没有匹配的知识点')
      return 0
    }
    empty.hidden = true
    const frag = document.createDocumentFragment()
    hits.forEach((hit, i) => {
      const li = document.createElement('li')
      li.className = SEARCH_SELECTORS.itemClass
      li.setAttribute('role', 'option')
      li.id = `search-item-${i}`
      li.dataset['nodeId'] = hit.id
      li.setAttribute('aria-selected', String(i === activeIndex))

      const title = document.createElement('span')
      title.className = 'ui-search__title'
      const [before, mark, after] = hit.snippet
      if (before.length > 0) title.appendChild(document.createTextNode(before))
      if (mark.length > 0) {
        const m = document.createElement('mark')
        m.textContent = mark
        title.appendChild(m)
      }
      if (after.length > 0) title.appendChild(document.createTextNode(after))

      const path = document.createElement('span')
      path.className = 'ui-search__path'
      path.textContent = hit.path.slice(0, -1).join(' › ') || hit.node.domain

      const badge = document.createElement('span')
      badge.className = 'ui-search__kind'
      badge.textContent = FIELD_LABEL[hit.field]

      li.append(title, path, badge)
      frag.appendChild(li)
    })
    results.replaceChildren(frag)
    return hits.length
  }

  function setActive(i: number): void {
    const items = Array.from(results.querySelectorAll<HTMLElement>(`.${SEARCH_SELECTORS.itemClass}`))
    if (items.length === 0) return
    const next = ((i % items.length) + items.length) % items.length
    if (activeIndex >= 0 && items[activeIndex] !== undefined) {
      items[activeIndex]!.setAttribute('aria-selected', 'false')
    }
    activeIndex = next
    const el = items[activeIndex]
    if (el !== undefined) {
      el.setAttribute('aria-selected', 'true')
      el.scrollIntoView({ block: 'nearest' })
      input.setAttribute('aria-activedescendant', el.id)
    }
  }

  function commit(index: number): void {
    const hit = currentHits[index]
    if (hit === undefined) return
    close()
    deps.onSelect(hit.id, hit.node)
  }

  function runQuery(q: string): SearchHit[] {
    currentHits = deps.index.search(q)
    const n = renderHits(currentHits)
    if (n > 0) setActive(0)
    return currentHits
  }

  // 输入即出结果：30ms 合并，避免 8400 节点下逐字符全量重排
  on(input, 'input', () => {
    if (timer !== null) clearTimeout(timer)
    const q = (input as HTMLInputElement).value
    timer = setTimeout(() => {
      timer = null
      runQuery(q)
    }, 30)
  })

  on(results, 'click', (e) => {
    const li = (e.target as HTMLElement).closest(`.${SEARCH_SELECTORS.itemClass}`) as HTMLElement | null
    if (li === null) return
    const idx = Array.from(results.children).indexOf(li)
    if (idx >= 0) commit(idx)
  })

  // 键盘：上下 / Enter / Esc / Tab 焦点陷阱。
  // Esc 语义：本组件消费后 stopPropagation，不与既有「关面板再返回」冲突（面板关闭由 lead 的 Esc 处理）。
  on(root, 'keydown', (ev) => {
    const e = ev as KeyboardEvent
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(activeIndex + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(activeIndex - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(activeIndex)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      const f = focusable(root)
      if (f.length === 0) return
      const first = f[0]!
      const last = f[f.length - 1]!
      const cur = document.activeElement as Element | null
      if (e.shiftKey && (cur === first || cur === null)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && cur === last) {
        e.preventDefault()
        first.focus()
      }
    }
  })

  // 点击遮罩空白处关闭
  on(root, 'mousedown', (e) => {
    if (e.target === root) close()
  })

  function open(): void {
    if (panelOpen) {
      input.focus()
      return
    }
    lastFocus = document.activeElement as HTMLElement | null
    panelOpen = true
    root.hidden = false
    root.setAttribute('aria-hidden', 'false')
    if (currentHits.length === 0) renderEmpty('输入关键词开始搜索')
    deps.onOpen?.()
    // 等一帧再 focus，规避部分浏览器对 hidden 切换的时序问题
    requestAnimationFrame(() => input.focus())
  }

  function close(): void {
    if (!panelOpen) return
    panelOpen = false
    root.hidden = true
    root.setAttribute('aria-hidden', 'true')
    if (lastFocus !== null && typeof lastFocus.focus === 'function') lastFocus.focus()
    lastFocus = null
    deps.onClose?.()
  }

  return {
    root,
    get isOpen() {
      return panelOpen
    },
    open,
    close,
    toggle() {
      if (panelOpen) close()
      else open()
    },
    query(q: string) {
      return runQuery(q)
    },
    destroy() {
      if (timer !== null) clearTimeout(timer)
      for (const l of listeners) l.el.removeEventListener(l.type, l.fn)
      listeners.length = 0
      if (root.parentNode !== null) root.parentNode.removeChild(root)
    }
  }
}
