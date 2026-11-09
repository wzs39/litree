/**
 * tests/view/domStub.ts — 项目里没有 jsdom / happy-dom，且不能为了写测试去动
 * package.json（队友正在别的分支改依赖），所以这里自带一个**最小 DOM 实现**，
 * 只覆盖 view/ 组件用到的那部分 API。
 *
 * 覆盖：createElement / createElementNS / createDocumentFragment / body、
 * 属性与 dataset、classList、children、appendChild/append/removeChild/replaceChildren、
 * closest / querySelector / querySelectorAll（逗号分组 + 复合选择器：tag #id .class [attr] [attr="v"] *）、
 * addEventListener / removeEventListener / dispatchEvent（含冒泡、preventDefault、stopPropagation）、
 * focus 与 document.activeElement、hidden 属性、textContent、style、getBoundingClientRect、offsetWidth、
 * window.innerWidth/innerHeight/matchMedia、requestAnimationFrame。
 *
 * 用法：
 *   const dom = installDom()
 *   try { ...断言... } finally { dom.restore() }
 */

export interface StubEventInit {
  bubbles?: boolean
  cancelable?: boolean
  target?: StubNode
  relatedTarget?: StubNode | null
  key?: string
  code?: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  clientX?: number
  clientY?: number
  deltaY?: number
}

type Listener = (ev: StubEvent) => void

export class StubEvent {
  readonly type: string
  bubbles: boolean
  cancelable: boolean
  defaultPrevented = false
  propagationStopped = false
  target: StubNode | null = null
  currentTarget: StubNode | null = null
  relatedTarget: StubNode | null = null
  key = ''
  code = ''
  shiftKey = false
  ctrlKey = false
  metaKey = false
  clientX = 0
  clientY = 0
  deltaY = 0

  constructor(type: string, init: StubEventInit = {}) {
    this.type = type
    this.bubbles = init.bubbles !== false
    this.cancelable = init.cancelable !== false
    this.relatedTarget = init.relatedTarget ?? null
    if (init.key !== undefined) this.key = init.key
    if (init.code !== undefined) this.code = init.code
    if (init.shiftKey !== undefined) this.shiftKey = init.shiftKey
    if (init.ctrlKey !== undefined) this.ctrlKey = init.ctrlKey
    if (init.metaKey !== undefined) this.metaKey = init.metaKey
    if (init.clientX !== undefined) this.clientX = init.clientX
    if (init.clientY !== undefined) this.clientY = init.clientY
    if (init.deltaY !== undefined) this.deltaY = init.deltaY
  }
  preventDefault(): void {
    this.defaultPrevented = true
  }
  stopPropagation(): void {
    this.propagationStopped = true
  }
  stopImmediatePropagation(): void {
    this.propagationStopped = true
  }
}

/** 复合选择器解析（不支持后代组合，组件与测试都不需要） */
interface Compound {
  tag: string | null
  id: string | null
  classes: string[]
  attrs: { name: string; value: string | null }[]
}

function parseCompound(text: string): Compound {
  const c: Compound = { tag: null, id: null, classes: [], attrs: [] }
  const re = /([#.]?[\w-]+)|(\[[\w-]+(?:=["']?[^\]"']*["']?)?\])|(\*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const tok = m[0]!
    if (tok === '*') continue
    if (tok.startsWith('#')) c.id = tok.slice(1)
    else if (tok.startsWith('.')) c.classes.push(tok.slice(1))
    else if (tok.startsWith('[')) {
      const inner = tok.slice(1, -1)
      const eq = inner.indexOf('=')
      if (eq === -1) c.attrs.push({ name: inner, value: null })
      else {
        let v = inner.slice(eq + 1).trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
        c.attrs.push({ name: inner.slice(0, eq), value: v })
      }
    } else c.tag = tok.toLowerCase()
  }
  return c
}

function matchCompound(node: StubNode, c: Compound): boolean {
  if (c.tag !== null && node.tagName.toLowerCase() !== c.tag) return false
  if (c.id !== null && node.getAttribute('id') !== c.id) return false
  for (const cls of c.classes) if (!node.classList.contains(cls)) return false
  for (const a of c.attrs) {
    const v = node.getAttribute(a.name)
    if (v === null) return false
    if (a.value !== null && v !== a.value) return false
  }
  return true
}

function matchSelector(node: StubNode, selector: string): boolean {
  for (const group of selector.split(',')) {
    const text = group.trim()
    if (text.length === 0) continue
    if (matchCompound(node, parseCompound(text))) return true
  }
  return false
}

export class StubNode {
  readonly tagName: string
  readonly namespaceURI: string | null
  readonly childNodes: StubNode[] = []
  parentNode: StubNode | null = null
  private attrs = new Map<string, string>()
  private listeners = new Map<string, Listener[]>()
  /** 记录本节点收到过的事件，便于断言 */
  readonly received: StubEvent[] = []

  constructor(tagName: string, namespaceURI: string | null = null) {
    this.tagName = namespaceURI === null ? tagName.toUpperCase() : tagName
    this.namespaceURI = namespaceURI
  }

  get children(): StubNode[] {
    return this.childNodes.filter((c) => c instanceof StubElement)
  }
  get firstElementChild(): StubElement | null {
    return (this.children[0] as StubElement | undefined) ?? null
  }
  get nextElementSibling(): StubElement | null {
    if (this.parentNode === null) return null
    const sibs = this.parentNode.children
    const i = sibs.indexOf(this as unknown as StubElement)
    if (i < 0) return null
    return (sibs[i + 1] as StubElement | undefined) ?? null
  }
  get parentElement(): StubElement | null {
    return this.parentNode instanceof StubElement ? this.parentNode : null
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, String(value))
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name)
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name)
  }
  toggleAttribute(name: string, force?: boolean): boolean {
    const on = force ?? !this.attrs.has(name)
    if (on) this.attrs.set(name, '')
    else this.attrs.delete(name)
    return on
  }
  getAttributeNames(): string[] {
    return [...this.attrs.keys()]
  }

  get className(): string {
    return this.attrs.get('class') ?? ''
  }
  set className(v: string) {
    this.attrs.set('class', v)
  }
  get classList(): {
    add: (...c: string[]) => void
    remove: (...c: string[]) => void
    contains: (c: string) => boolean
    toggle: (c: string, force?: boolean) => boolean
    toString: () => string
  } {
    const self = this
    const list = (): string[] => self.className.split(/\s+/).filter((s) => s.length > 0)
    const write = (arr: string[]): void => {
      self.className = arr.join(' ')
    }
    return {
      add(...cs: string[]) {
        const cur = list()
        for (const c of cs) if (!cur.includes(c)) cur.push(c)
        write(cur)
      },
      remove(...cs: string[]) {
        write(list().filter((c) => !cs.includes(c)))
      },
      contains(c: string) {
        return list().includes(c)
      },
      toggle(c: string, force?: boolean) {
        const cur = list()
        const on = force ?? !cur.includes(c)
        if (on) {
          if (!cur.includes(c)) cur.push(c)
        } else {
          const i = cur.indexOf(c)
          if (i >= 0) cur.splice(i, 1)
        }
        write(cur)
        return on
      },
      toString() {
        return list().join(' ')
      }
    }
  }

  get hidden(): boolean {
    return this.attrs.has('hidden')
  }
  set hidden(v: boolean) {
    if (v) this.attrs.set('hidden', '')
    else this.attrs.delete('hidden')
  }

  get dataset(): Record<string, string> {
    const self = this
    const kebab = (prop: string): string => prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
    const camel = (name: string): string => name.slice(5).replace(/-(\w)/g, (_s, c: string) => c.toUpperCase())
    return new Proxy({} as Record<string, string>, {
      get(_t, prop: string | symbol): string | undefined {
        if (typeof prop !== 'string') return undefined
        return self.getAttribute('data-' + kebab(prop)) ?? undefined
      },
      set(_t, prop: string | symbol, value: unknown): boolean {
        if (typeof prop === 'string') {
          self.setAttribute('data-' + kebab(prop), String(value))
        }
        return true
      },
      has(_t, prop: string | symbol): boolean {
        return typeof prop === 'string' && self.hasAttribute('data-' + kebab(prop))
      },
      deleteProperty(_t, prop: string | symbol): boolean {
        if (typeof prop === 'string') self.removeAttribute('data-' + kebab(prop))
        return true
      },
      ownKeys(): string[] {
        return self.getAttributeNames().filter((n) => n.startsWith('data-')).map(camel)
      },
      getOwnPropertyDescriptor(): PropertyDescriptor {
        return { enumerable: true, configurable: true }
      }
    })
  }

  get textContent(): string {
    if (this instanceof StubText) return this.data
    let out = ''
    for (const c of this.childNodes) out += c.textContent
    return out
  }
  set textContent(v: string) {
    this.childNodes.length = 0
    if (v.length > 0) this.appendChild(new StubText(v))
  }

  appendChild<T extends StubNode>(node: T): T {
    if (node instanceof StubFragment) {
      for (const c of node.childNodes.slice()) this.appendChild(c)
      node.childNodes.length = 0
      return node
    }
    node.parentNode?.removeChild(node)
    node.parentNode = this
    this.childNodes.push(node)
    return node
  }
  append(...nodes: (StubNode | string)[]): void {
    for (const n of nodes) this.appendChild(typeof n === 'string' ? new StubText(n) : n)
  }
  removeChild<T extends StubNode>(node: T): T {
    const i = this.childNodes.indexOf(node)
    if (i >= 0) this.childNodes.splice(i, 1)
    node.parentNode = null
    return node
  }
  replaceChildren(...nodes: (StubNode | string)[]): void {
    this.childNodes.length = 0
    for (const n of nodes) this.appendChild(typeof n === 'string' ? new StubText(n) : n)
  }
  remove(): void {
    this.parentNode?.removeChild(this)
  }

  descendants(): StubNode[] {
    const out: StubNode[] = []
    const walk = (n: StubNode): void => {
      for (const c of n.childNodes) {
        if (c instanceof StubElement) out.push(c)
        walk(c)
      }
    }
    walk(this)
    return out
  }

  querySelectorAll(selector: string): StubElement[] {
    return this.descendants().filter((n) => matchSelector(n, selector)) as StubElement[]
  }
  querySelector(selector: string): StubElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }
  closest(selector: string): StubElement | null {
    let cur: StubNode | null = this
    while (cur !== null) {
      if (cur instanceof StubElement && matchSelector(cur, selector)) return cur
      cur = cur.parentNode
    }
    return null
  }

  addEventListener(type: string, fn: Listener): void {
    const arr = this.listeners.get(type) ?? []
    arr.push(fn)
    this.listeners.set(type, arr)
  }
  removeEventListener(type: string, fn: Listener): void {
    const arr = this.listeners.get(type)
    if (arr === undefined) return
    const i = arr.indexOf(fn)
    if (i >= 0) arr.splice(i, 1)
  }
  dispatchEvent(ev: StubEvent): boolean {
    ev.target = ev.target ?? this
    let node: StubNode | null = this
    while (node !== null) {
      ev.currentTarget = node
      for (const fn of (node.listeners.get(ev.type) ?? []).slice()) {
        fn(ev)
        if (ev.propagationStopped) break
      }
      if (!ev.bubbles || ev.propagationStopped) break
      node = node.parentNode
    }
    return !ev.defaultPrevented
  }
  fire(type: string, init: StubEventInit = {}): StubEvent {
    const ev = new StubEvent(type, init)
    ev.target = init.target ?? this
    this.dispatchEvent(ev)
    return ev
  }
}

export class StubText extends StubNode {
  data: string
  constructor(data: string) {
    super('#text')
    this.data = data
  }
  override get textContent(): string {
    return this.data
  }
  override set textContent(v: string) {
    this.data = v
  }
}

export class StubFragment extends StubNode {
  constructor() {
    super('#fragment')
  }
}

export class StubElement extends StubNode {
  readonly style: Record<string, string> = {}
  tabIndex = -1
  disabled = false
  value = ''
  type = ''
  id = ''
  /** 记录 click() 调用，不触发真实导航 */
  clicked = 0
  files: StubNode[] | undefined = undefined
  private rect = { left: 40, top: 60, width: 800, height: 600 }

  constructor(tag: string, ns: string | null = null) {
    super(tag, ns)
  }

  override getAttribute(name: string): string | null {
    if (name === 'id') return this.id.length > 0 ? this.id : super.getAttribute(name)
    return super.getAttribute(name)
  }
  override setAttribute(name: string, value: string): void {
    if (name === 'id') {
      this.id = String(value)
      super.setAttribute(name, String(value))
      return
    }
    if (name === 'tabindex') this.tabIndex = Number.parseInt(String(value), 10) || 0
    super.setAttribute(name, value)
  }

  get innerText(): string {
    return this.textContent
  }
  get offsetWidth(): number {
    return this.rect.width
  }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number; right: number; bottom: number } {
    const { left, top, width, height } = this.rect
    return { left, top, width, height, right: left + width, bottom: top + height }
  }
  setStubRect(r: Partial<typeof this.rect>): void {
    this.rect = { ...this.rect, ...r }
  }
  scrollIntoView(_o?: unknown): void {
    /* 无布局，什么都不做 */
  }
  click(): void {
    this.clicked++
    this.fire('click')
  }
  focus(): void {
    doc.setActive(this)
  }
  blur(): void {
    doc.setActive(null)
  }
}

class StubDocument extends StubNode {
  body: StubElement
  documentElement: StubElement
  private active: StubElement | null = null
  constructor() {
    super('#document')
    this.documentElement = new StubElement('html')
    this.body = new StubElement('body')
    this.appendChild(this.documentElement)
    this.documentElement.appendChild(this.body)
  }
  createElement(tag: string): StubElement {
    return new StubElement(tag)
  }
  createElementNS(ns: string, tag: string): StubElement {
    return new StubElement(tag, ns)
  }
  createDocumentFragment(): StubFragment {
    return new StubFragment()
  }
  createTextNode(t: string): StubText {
    return new StubText(t)
  }
  get activeElement(): StubElement | null {
    return this.active
  }
  setActive(el: StubElement | null): void {
    this.active = el
  }
}

const doc = new StubDocument()

export interface InstalledDom {
  document: StubDocument
  window: StubWindow
  restore(): void
}

class StubWindow extends StubNode {
  innerWidth = 1280
  innerHeight = 800
  matchMediaCalls: string[] = []
  constructor() {
    super('window')
  }
  matchMedia(query: string): { matches: boolean; media: string } {
    this.matchMediaCalls.push(query)
    return { matches: false, media: query }
  }
}

const win = new StubWindow()

/** 安装 stub 到 globalThis，返回 restore() 还原原有全局。
 *  Node 21+ 的 globalThis.navigator 是只读 getter，直接赋值抛 TypeError，
 *  故统一走 setGlobal（赋值失败回退 defineProperty），restore 用原 descriptor 还原。 */
export function installDom(): InstalledDom {
  const g = globalThis as Record<string, unknown>
  const saved: Record<string, unknown> = {}
  const savedDesc: Record<string, PropertyDescriptor | undefined> = {}
  const keys = ['document', 'window', 'requestAnimationFrame', 'navigator', 'CSS']
  for (const k of keys) {
    saved[k] = g[k]
    savedDesc[k] = Object.getOwnPropertyDescriptor(g, k)
  }
  const setGlobal = (k: string, v: unknown): void => {
    try {
      g[k] = v
    } catch {
      Object.defineProperty(g, k, {
        value: v,
        writable: true,
        configurable: true,
        enumerable: true
      })
    }
  }
  doc.childNodes.length = 0
  doc.appendChild(doc.documentElement)
  doc.documentElement.childNodes.length = 0
  doc.documentElement.appendChild(doc.body)
  doc.body.childNodes.length = 0
  doc.setActive(null)
  setGlobal('document', doc)
  setGlobal('window', win)
  setGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    cb(0)
    return 1
  })
  setGlobal('navigator', { language: 'zh-CN', userAgent: 'stub' })
  setGlobal('CSS', { escape: (s: string) => s.replace(/[^\w-]/g, (c) => '\\' + c) })
  return {
    document: doc,
    window: win,
    restore() {
      for (const k of keys) {
        const d = savedDesc[k]
        if (d !== undefined) Object.defineProperty(g, k, d)
        else delete g[k]
      }
    }
  }
}

/** 便捷：造一个带 data-from/data-to 的边、带 data-id 的节点，模拟 graphCanvas 的产物结构 */
export function fakeSvg(): StubElement {
  const svg = new StubElement('svg', 'http://www.w3.org/2000/svg')
  svg.setAttribute('id', 'graph')
  return svg
}
export function fakeEdge(from: string, to: string, type: 'hard' | 'soft' = 'hard'): StubElement {
  const p = new StubElement('path', 'http://www.w3.org/2000/svg')
  p.className = `edge edge--${type}`
  p.setAttribute('data-from', from)
  p.setAttribute('data-to', to)
  return p
}
export function fakeNode(id: string, kind: 'branch' | 'unit' | 'leaf' = 'unit'): StubElement {
  const g = new StubElement('g', 'http://www.w3.org/2000/svg')
  g.className = `node node--${kind}`
  g.setAttribute('data-id', id)
  return g
}
