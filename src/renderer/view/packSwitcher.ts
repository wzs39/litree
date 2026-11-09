/**
 * view/packSwitcher.ts — 学科包切换弹层
 *
 * 背景：webApi.listPacks() 已实现但项目里没有任何调用点 → 用户永远只看到默认包。
 * 本组件只负责「显示 + 选择」：
 *  - 不发请求（packs 列表由 lead 调 api.listPacks() 后传入）
 *  - 不写 localStorage（litree:pack-override 由 lead 写）
 *  - 不做重新加载：lead 需要重建 AppStore 或新增 store.loadPack(id)（见集成说明）
 *
 * 进度按包独立保存是既有真实行为（key = `litree:progress:<packId>`），
 * 面板里明确提示，避免用户担心切包丢进度。
 */

export const PACK_SWITCHER_IDS = {
  root: 'pack-switcher',
  optionClass: 'pack-option'
} as const

export interface PackOption {
  id: string
  /** 显示名；lead 可直接用 api.listPacks() 返回的 title（string） */
  title: string
}

export interface PackSwitcherDeps {
  packs: readonly PackOption[]
  currentId: string
  onPick: (id: string) => void
  /** 可选：关闭时回调（lead 用来恢复画布快捷键） */
  onClose?: () => void
  /** 可选：把 id 显示出来，便于用户确认包与进度键一致 */
  showIds?: boolean
}

export interface PackSwitcherHandle {
  readonly root: HTMLElement
  open(): void
  close(): void
  toggle(): void
  readonly isOpen: boolean
  /** lead 拿到新的 listPacks 结果后刷新列表（不重建组件） */
  update(patch: Partial<Pick<PackSwitcherDeps, 'packs' | 'currentId'>>): void
  destroy(): void
}

/** 进度键前缀：与 webApi 的既有行为一致，仅用于文案展示 */
export const PROGRESS_KEY_PREFIX = 'litree:progress:'

export function createPackSwitcher(mount: HTMLElement, deps: PackSwitcherDeps): PackSwitcherHandle {
  let packs: PackOption[] = deps.packs.slice()
  let currentId = deps.currentId
  let showIds = deps.showIds === true
  let panelOpen = false
  let lastFocus: HTMLElement | null = null
  const listeners: { el: EventTarget; type: string; fn: (e: Event) => void }[] = []
  function on(el: EventTarget, type: string, fn: (e: Event) => void): void {
    el.addEventListener(type, fn)
    listeners.push({ el, type, fn })
  }

  const root = document.createElement('div')
  root.id = PACK_SWITCHER_IDS.root
  root.className = 'ui-pack'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', '切换学科包')
  root.setAttribute('aria-hidden', 'true')
  root.hidden = true

  const box = document.createElement('div')
  box.className = 'ui-pack__box'

  const title = document.createElement('h2')
  title.className = 'ui-pack__title'
  title.textContent = '选择学科包'

  const list = document.createElement('ul')
  list.className = 'ui-pack__list'
  list.setAttribute('role', 'listbox')
  list.setAttribute('aria-label', '学科包列表')

  const note = document.createElement('p')
  note.className = 'ui-pack__note'
  note.textContent = '进度按学科包独立保存，切换后原来的点亮记录不会丢失。'

  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'ui-btn ui-pack__close'
  closeBtn.textContent = '关闭'
  closeBtn.setAttribute('aria-label', '关闭学科包切换')
  on(closeBtn, 'click', () => close())

  box.append(title, list, note, closeBtn)
  root.appendChild(box)
  mount.appendChild(root)

  function render(): void {
    const frag = document.createDocumentFragment()
    for (const p of packs) {
      const isCurrent = p.id === currentId
      const li = document.createElement('li')
      li.className = `${PACK_SWITCHER_IDS.optionClass}${isCurrent ? ' pack-option--current' : ''}`
      li.setAttribute('role', 'option')
      li.setAttribute('aria-selected', String(isCurrent))

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ui-pack__option-btn'
      btn.dataset['packId'] = p.id
      btn.textContent = `${isCurrent ? '✓ ' : ''}${p.title}`
      if (showIds) {
        const idSpan = document.createElement('span')
        idSpan.className = 'ui-pack__id'
        idSpan.textContent = p.id
        btn.appendChild(idSpan)
      }
      btn.setAttribute(
        'aria-label',
        isCurrent ? `当前学科包 ${p.title}` : `切换到学科包 ${p.title}`
      )
      btn.addEventListener('click', () => {
        if (p.id === currentId) {
          close()
          return
        }
        currentId = p.id
        render()
        close()
        deps.onPick(p.id)
      })
      li.appendChild(btn)
      frag.appendChild(li)
    }
    list.replaceChildren(frag)
    note.textContent = `进度按学科包独立保存（${PROGRESS_KEY_PREFIX}<packId>），切换后原来的点亮记录不会丢失。`
  }
  render()

  on(root, 'keydown', (ev) => {
    const e = ev as KeyboardEvent
    if (e.key === 'Escape') {
      e.preventDefault()
      // 与既有 Esc（关面板/返回）语义共存：本组件消费后停止冒泡
      e.stopPropagation()
      close()
      return
    }
    if (e.key === 'Tab') {
      const items = Array.from(box.querySelectorAll<HTMLElement>('button'))
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
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const opts = Array.from(list.querySelectorAll<HTMLElement>('.ui-pack__option-btn'))
      if (opts.length === 0) return
      e.preventDefault()
      const at = opts.findIndex((o) => o === document.activeElement)
      const step = e.key === 'ArrowDown' ? 1 : -1
      const next = ((at === -1 ? 0 : at) + step + opts.length) % opts.length
      opts[next]?.focus()
    }
  })

  on(root, 'mousedown', (e) => {
    if (e.target === root) close()
  })

  function open(): void {
    if (panelOpen) return
    lastFocus = document.activeElement as HTMLElement | null
    panelOpen = true
    root.hidden = false
    root.setAttribute('aria-hidden', 'false')
    const first = list.querySelector<HTMLElement>('.ui-pack__option-btn')
    if (first !== null) first.focus()
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
    update(patch) {
      if (patch.packs !== undefined) packs = patch.packs.slice()
      if (patch.currentId !== undefined) currentId = patch.currentId
      render()
    },
    destroy() {
      for (const l of listeners) l.el.removeEventListener(l.type, l.fn)
      listeners.length = 0
      if (root.parentNode !== null) root.parentNode.removeChild(root)
    }
  }
}
