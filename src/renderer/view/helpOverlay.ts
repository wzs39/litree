/**
 * view/helpOverlay.ts — 操作说明面板 + 首次使用一次性引导
 *
 * 两块能力，同一模块：
 *  1) createHelpOverlay：可折叠的快捷键/操作说明面板（`?` 或工具栏按钮打开），
 *     role=dialog + 焦点陷阱 + Esc 关闭。Esc 语义：本组件消费后 stopPropagation，
 *     不与既有「关面板 → 返回」冲突（既有实现监听 window 的 Escape，本面板关闭时不冒泡）。
 *  2) createOnboarding：三步气泡引导（继续学习 → 双击钻取 → 点亮确认），可跳过，
 *     一次性标记写 deps.storage（键 `litree:onboarded`），prefers-reduced-motion 下不做动画。
 *
 * storage / matchMedia 都走 deps 注入，方便单测（不依赖真实 localStorage）。
 */

export const HELP_IDS = {
  overlay: 'help-overlay',
  onboarding: 'onboarding-overlay'
} as const

export const ONBOARDED_KEY = 'litree:onboarded'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 操作说明条目：term = 操作名，desc = 说明 */
export interface HelpEntry {
  term: string
  desc: string
  /** 分类标题；同一 section 的条目合并显示 */
  section: '鼠标操作' | '键盘快捷键' | '其它'
}

/** 默认说明表。与既有实现（main.ts）逐条核对过：
 *  单击详情、双击进入、右键单元批量点亮、滚轮缩放、拖拽平移、Esc 关面板再返回。 */
export const DEFAULT_HELP_ENTRIES: readonly HelpEntry[] = [
  { term: '单击节点', desc: '打开右侧详情面板', section: '鼠标操作' },
  { term: '双击学科 / 单元', desc: '钻取进入下一层视图', section: '鼠标操作' },
  { term: '右键单元', desc: '弹出「点亮本单元全部知识点」批量点亮菜单', section: '鼠标操作' },
  { term: '滚轮', desc: '以光标为中心缩放画布', section: '鼠标操作' },
  { term: '按住左键拖拽', desc: '平移画布；也可用右下角缩略图直接拖视口框', section: '鼠标操作' },
  { term: 'Ctrl + K（或 /）', desc: '打开全局搜索，输入即出结果，Enter 直达知识点', section: '键盘快捷键' },
  { term: 'Esc', desc: '先关闭详情面板 / 弹出层，再返回上一层', section: '键盘快捷键' },
  { term: '?', desc: '打开 / 关闭本帮助面板', section: '键盘快捷键' },
  { term: '← → ↑ ↓', desc: '在知识点之间移动焦点（需应用接入键盘导航）', section: '键盘快捷键' },
  { term: '顶部工具栏', desc: '缩放、适配、返回、搜索、切换学科包、导出/导入进度', section: '其它' },
  { term: '点亮规则', desc: '只能在最细的「知识点」上点亮；单元的前置全部点亮后才解锁', section: '其它' }
]

/** 三步引导的锚点与文案 */
export interface OnboardingStep {
  /** 高亮/定位的目标元素；找不到则居中显示 */
  targetSelector?: string
  title: string
  body: string
}

export const DEFAULT_ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    targetSelector: '[id="home-continue"], .home-continue, #toolbar-search',
    title: '从这里继续',
    body: '首页的「继续学习 ▸」直接回到你上次的位置；想从头翻就点「浏览全部学科 →」。'
  },
  {
    targetSelector: '#graph, #stage',
    title: '双击钻取',
    body: '双击学科或单元进入下一层，滚轮缩放、按住拖拽平移；顶部工具栏也有「适配」和「100%」。'
  },
  {
    targetSelector: '#sidebar, .detail-panel',
    title: '点亮知识点',
    body: '在右侧面板点「我已掌握，点亮」记分；整单元都学完可以右键用「点亮本单元全部知识点」。前置没点亮时按钮会显示「🔒 还差 N 步 · 缺「X」」。'
  }
]

// ───────────────────────────── 帮助面板 ─────────────────────────────

export interface HelpOverlayDeps {
  entries?: readonly HelpEntry[]
  /** 关闭时的回调（lead 用来恢复画布快捷键） */
  onClose?: () => void
  /** 面板标题 */
  title?: string
}

export interface HelpOverlayHandle {
  readonly root: HTMLElement
  open(): void
  close(): void
  toggle(): void
  readonly isOpen: boolean
  /** 重新渲染条目（lead 追加快捷键时调用） */
  update(entries: readonly HelpEntry[]): void
  destroy(): void
}

function trapTab(container: HTMLElement, e: KeyboardEvent): void {
  const items = Array.from(container.querySelectorAll<HTMLElement>('button, [href], input, select, textarea')).filter(
    (el) => (el as HTMLButtonElement).disabled !== true
  )
  if (items.length === 0) return
  const first = items[0]!
  const last = items[items.length - 1]!
  const cur = document.activeElement as Element | null
  if (e.shiftKey && (cur === first || cur === null)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && cur === last) {
    e.preventDefault()
    first.focus()
  }
}

export function createHelpOverlay(mount: HTMLElement, deps: HelpOverlayDeps = {}): HelpOverlayHandle {
  let entries: HelpEntry[] = (deps.entries ?? DEFAULT_HELP_ENTRIES).slice()
  let panelOpen = false
  let lastFocus: HTMLElement | null = null
  const listeners: { el: EventTarget; type: string; fn: (e: Event) => void }[] = []
  function on(el: EventTarget, type: string, fn: (e: Event) => void): void {
    el.addEventListener(type, fn)
    listeners.push({ el, type, fn })
  }

  const root = document.createElement('div')
  root.id = HELP_IDS.overlay
  root.className = 'ui-help'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', deps.title ?? '操作与快捷键帮助')
  root.setAttribute('aria-hidden', 'true')
  root.hidden = true

  const box = document.createElement('div')
  box.className = 'ui-help__box'

  const header = document.createElement('div')
  header.className = 'ui-help__header'
  const h2 = document.createElement('h2')
  h2.className = 'ui-help__title'
  h2.textContent = deps.title ?? '怎么用这棵树'
  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'ui-btn ui-help__close'
  closeBtn.textContent = '关闭'
  closeBtn.setAttribute('aria-label', '关闭帮助')
  header.append(h2, closeBtn)

  const body = document.createElement('div')
  body.className = 'ui-help__body'

  box.append(header, body)
  root.appendChild(box)
  mount.appendChild(root)

  function render(): void {
    const frag = document.createDocumentFragment()
    const order: HelpEntry['section'][] = ['鼠标操作', '键盘快捷键', '其它']
    for (const section of order) {
      const rows = entries.filter((e) => e.section === section)
      if (rows.length === 0) continue
      const h3 = document.createElement('h3')
      h3.className = 'ui-help__section'
      h3.textContent = section
      const dl = document.createElement('dl')
      dl.className = 'ui-help__list'
      for (const r of rows) {
        const dt = document.createElement('dt')
        dt.className = 'ui-help__term'
        dt.textContent = r.term
        const dd = document.createElement('dd')
        dd.className = 'ui-help__desc'
        dd.textContent = r.desc
        dl.append(dt, dd)
      }
      frag.append(h3, dl)
    }
    body.replaceChildren(frag)
  }
  render()

  // 折叠：条目分组标题可点，收起/展开该组
  on(body, 'click', (ev) => {
    const t = ev.target as HTMLElement
    if (t.tagName !== 'H3') return
    const dl = t.nextElementSibling
    if (dl === null) return
    const collapsed = dl.getAttribute('aria-hidden') === 'true'
    dl.setAttribute('aria-hidden', String(!collapsed))
    dl.toggleAttribute('hidden', !collapsed)
    t.setAttribute('aria-expanded', String(collapsed))
    t.classList.toggle('ui-help__section--collapsed', !collapsed)
  })

  on(closeBtn, 'click', () => close())

  on(root, 'keydown', (ev) => {
    const e = ev as KeyboardEvent
    if (e.key === 'Escape') {
      // 既有 Esc 语义是「关详情面板 → 返回」；本面板优先，消费后停止冒泡
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    if (e.key === 'Tab') trapTab(box, e)
  })

  on(root, 'mousedown', (e) => {
    if (e.target === root) close()
  })

  function open(): void {
    if (panelOpen) {
      closeBtn.focus()
      return
    }
    lastFocus = document.activeElement as HTMLElement | null
    panelOpen = true
    root.hidden = false
    root.setAttribute('aria-hidden', 'false')
    // 默认展开：把每个分组的 aria-expanded 写进标题
    for (const h3 of Array.from(body.querySelectorAll('h3'))) h3.setAttribute('aria-expanded', 'true')
    closeBtn.focus()
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
    update(next: readonly HelpEntry[]) {
      entries = next.slice()
      render()
    },
    destroy() {
      for (const l of listeners) l.el.removeEventListener(l.type, l.fn)
      listeners.length = 0
      if (root.parentNode !== null) root.parentNode.removeChild(root)
    }
  }
}

/** `?` 快捷键（Shift+/）。lead 也可用工具栏 #toolbar-help 直接调 toggle() */
export interface HelpHotkeyTarget {
  addEventListener(type: string, listener: (ev: Event) => void): void
  removeEventListener(type: string, listener: (ev: Event) => void): void
}
function defaultHelpTarget(): HelpHotkeyTarget {
  const g = globalThis as unknown as { window?: HelpHotkeyTarget }
  return (g.window as HelpHotkeyTarget) ?? (globalThis as unknown as HelpHotkeyTarget)
}
export function attachHelpHotkey(
  help: { toggle(): void },
  target?: HelpHotkeyTarget
): { detach(): void } {
  const t = target ?? defaultHelpTarget()
  const fn = (ev: Event): void => {
    const e = ev as KeyboardEvent
    const el = (e as unknown as { target?: HTMLElement | null }).target ?? null
    const typing =
      el !== null && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true)
    if (typing) return
    if (e.key === '?' || (e.shiftKey === true && (e.key === '/' || e.code === 'Slash'))) {
      e.preventDefault()
      help.toggle()
    }
  }
  t.addEventListener('keydown', fn)
  return { detach: () => t.removeEventListener('keydown', fn) }
}

// ───────────────────────────── 首次引导 ─────────────────────────────

export interface OnboardingDeps {
  storage: StorageLike
  steps?: readonly OnboardingStep[]
  /** 完成/跳过时回调（lead 可记埋点） */
  onDone?: (skipped: boolean) => void
  /** 动画判定注入；默认用 window.matchMedia('(prefers-reduced-motion: reduce)') */
  prefersReducedMotion?: () => boolean
  /** 一次性标记的键，默认 litree:onboarded */
  storageKey?: string
  /** 定位目标元素的根；默认 document */
  queryRoot?: ParentNode
  /** 找到 target 后是否滚动到可见；默认 true（reduced-motion 下不做平滑） */
  scrollIntoView?: boolean
}

export interface OnboardingHandle {
  readonly root: HTMLElement
  /** 未 onboarded 才启动；返回是否真的启动 */
  maybeStart(): boolean
  start(): void
  /** 直接标记完成并关闭（跳过） */
  skip(): void
  readonly stepIndex: number
  readonly running: boolean
  destroy(): void
}

export function createOnboarding(mount: HTMLElement, deps: OnboardingDeps): OnboardingHandle {
  const key = deps.storageKey ?? ONBOARDED_KEY
  const steps = (deps.steps ?? DEFAULT_ONBOARDING_STEPS).slice()
  const reduced = (): boolean =>
    deps.prefersReducedMotion !== undefined
      ? deps.prefersReducedMotion()
      : typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false

  let index = 0
  let running = false
  const listeners: { el: EventTarget; type: string; fn: (e: Event) => void }[] = []
  function on(el: EventTarget, type: string, fn: (e: Event) => void): void {
    el.addEventListener(type, fn)
    listeners.push({ el, type, fn })
  }

  const root = document.createElement('div')
  root.id = HELP_IDS.onboarding
  root.className = 'ui-onboarding'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-label', '第一次使用引导')
  root.hidden = true

  const bubble = document.createElement('div')
  bubble.className = 'ui-onboarding__bubble'

  const dots = document.createElement('div')
  dots.className = 'ui-onboarding__dots'
  dots.setAttribute('aria-hidden', 'true')

  const titleEl = document.createElement('h3')
  titleEl.className = 'ui-onboarding__title'
  const bodyEl = document.createElement('p')
  bodyEl.className = 'ui-onboarding__body'

  const actions = document.createElement('div')
  actions.className = 'ui-onboarding__actions'
  const skipBtn = document.createElement('button')
  skipBtn.type = 'button'
  skipBtn.className = 'ui-btn ui-btn--ghost'
  skipBtn.textContent = '跳过引导'
  skipBtn.setAttribute('aria-label', '跳过第一次使用引导')
  const nextBtn = document.createElement('button')
  nextBtn.type = 'button'
  nextBtn.className = 'ui-btn ui-btn--primary'
  nextBtn.textContent = '下一步'
  const backBtn = document.createElement('button')
  backBtn.type = 'button'
  backBtn.className = 'ui-btn ui-btn--ghost'
  backBtn.textContent = '上一步'
  actions.append(backBtn, skipBtn, nextBtn)

  bubble.append(dots, titleEl, bodyEl, actions)
  root.appendChild(bubble)
  mount.appendChild(root)

  function targetOf(step: OnboardingStep): Element | null {
    if (step.targetSelector === undefined) return null
    const root0 = deps.queryRoot ?? document
    for (const sel of step.targetSelector.split(',')) {
      const el = root0.querySelector(sel.trim())
      if (el !== null) return el
    }
    return null
  }

  function paint(): void {
    const step = steps[index]
    if (step === undefined) return
    titleEl.textContent = step.title
    bodyEl.textContent = step.body
    nextBtn.textContent = index === steps.length - 1 ? '开始使用' : '下一步'
    backBtn.hidden = index === 0
    // 步骤点
    const frag = document.createDocumentFragment()
    steps.forEach((_, i) => {
      const d = document.createElement('span')
      d.className = 'ui-onboarding__dot' + (i === index ? ' ui-onboarding__dot--active' : '')
      frag.appendChild(d)
    })
    dots.replaceChildren(frag)
    root.setAttribute('aria-label', `第一次使用引导 第 ${index + 1} / ${steps.length} 步`)

    // 定位：把气泡放到目标元素附近；reduced-motion 下不做任何 transition 类
    const el = targetOf(step)
    bubble.classList.toggle('ui-onboarding__bubble--centered', el === null)
    bubble.classList.toggle('ui-onboarding__bubble--noanim', reduced())
    if (el !== null) {
      const r = el.getBoundingClientRect()
      const bw = bubble.offsetWidth || 320
      const left = Math.max(12, Math.min(window.innerWidth - bw - 12, r.left))
      const top = r.bottom + 12 < window.innerHeight - 160 ? r.bottom + 12 : Math.max(12, r.top - 172)
      bubble.style.left = `${left}px`
      bubble.style.top = `${top}px`
      if (deps.scrollIntoView !== false && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' })
      }
    } else {
      bubble.style.left = ''
      bubble.style.top = ''
    }
  }

  function finish(skipped: boolean): void {
    try {
      deps.storage.setItem(key, new Date().toISOString())
    } catch {
      // 存储被拒（隐私模式/配额）：不阻塞关闭
    }
    running = false
    index = 0
    root.hidden = true
    deps.onDone?.(skipped)
  }

  on(nextBtn, 'click', () => {
    if (index >= steps.length - 1) finish(false)
    else {
      index++
      paint()
      nextBtn.focus()
    }
  })
  on(backBtn, 'click', () => {
    if (index > 0) {
      index--
      paint()
    }
  })
  on(skipBtn, 'click', () => finish(true))
  on(root, 'keydown', (ev) => {
    const e = ev as KeyboardEvent
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      finish(true)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (index >= steps.length - 1) finish(false)
      else {
        index++
        paint()
      }
      return
    }
    if (e.key === 'Tab') trapTab(bubble, e)
  })

  function startInternal(): void {
    running = true
    index = 0
    root.hidden = false
    paint()
    nextBtn.focus()
  }

  return {
    root,
    get stepIndex() {
      return index
    },
    get running() {
      return running
    },
    maybeStart() {
      let done: string | null = null
      try {
        done = deps.storage.getItem(key)
      } catch {
        done = null
      }
      if (done !== null && done.length > 0) return false
      if (steps.length === 0) return false
      startInternal()
      return true
    },
    start: startInternal,
    skip() {
      finish(true)
    },
    destroy() {
      for (const l of listeners) l.el.removeEventListener(l.type, l.fn)
      listeners.length = 0
      if (root.parentNode !== null) root.parentNode.removeChild(root)
    }
  }
}
