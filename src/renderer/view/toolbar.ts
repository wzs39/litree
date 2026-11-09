/**
 * view/toolbar.ts — 顶部工具栏（自包含组件，不依赖任何其它 view 模块）
 *
 * 设计约束（交付说明）：
 *  - 组件只做「渲染 + 把点击转成回调」，不含任何业务：所有行为经 deps 注入。
 *  - 不 import core/store、不 import view/graphCanvas、不碰 innerHTML。
 *  - id 是 C 队友 e2e 断言的契约，逐字固定，勿改。
 *  - 样式全部走 view/../styles/ui.css（新文件），只用 tokens.css 里的既有令牌。
 */

/** 工具栏行为回调：全部无参无返回值，业务由 lead 在 main.ts 里实现 */
export interface ToolbarDeps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onReset: () => void
  onBack: () => void
  onSearch: () => void
  onPack: () => void
  onExport: () => void
  onImport: () => void
  onHelp: () => void
}

/** 固定 id 契约表（e2e 用）；lead 可 import 本常量避免手写字符串出错 */
export const TOOLBAR_IDS = {
  root: 'toolbar',
  search: 'toolbar-search',
  pack: 'toolbar-pack',
  export: 'toolbar-export',
  import: 'toolbar-import',
  help: 'toolbar-help',
  zoomIn: 'zoom-in',
  zoomOut: 'zoom-out',
  zoomFit: 'zoom-fit',
  zoomReset: 'zoom-reset',
  back: 'nav-back',
  crumbSlot: 'toolbar-crumb-slot'
} as const

export interface ToolbarOptions {
  /** 面包屑插槽：lead 集成时把 breadcrumb 渲染进这个元素；不传则组件自建 */
  crumbSlot?: HTMLElement
  /** 初始缩放百分比显示，默认 100 */
  initialPercent?: number
}

export interface ToolbarHandle {
  /** 工具栏根节点（已挂载到 mount 上） */
  readonly root: HTMLElement
  /** 面包屑插槽节点：renderBreadcrumb(slot, trail, onJump) 的目标 */
  readonly crumbSlot: HTMLElement
  /** 更新缩放百分比显示。传 0.85 这类比例或 85 这类百分数都识别（见 zoomLabel） */
  setZoomPercent(percent: number): void
  /** 无上一级时禁用返回按钮 */
  setBackEnabled(enabled: boolean): void
  /** 运行期替换回调（例如 store 重建后重新接线） */
  update(patch: Partial<ToolbarDeps>): void
  /** 卸载：移除 DOM 并解绑全部监听 */
  destroy(): void
}

/**
 * 缩放标签：既接受比例（0.7 → "70%"），也接受百分数（140 → "140%"）。
 * 阈值取 4：图缩放范围（0.2~3）内不可能是百分数。
 */
export function zoomLabel(value: number): string {
  if (!Number.isFinite(value)) return '--'
  const percent = Math.abs(value) <= 4 ? value * 100 : value
  return `${Math.round(percent)}%`
}

function makeButton(attrs: {
  id: string
  cls: string
  text: string
  aria: string
  title: string
}): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.id = attrs.id
  btn.className = attrs.cls
  btn.textContent = attrs.text
  btn.setAttribute('aria-label', attrs.aria)
  btn.title = attrs.title
  return btn
}

export function createToolbar(mount: HTMLElement, deps: ToolbarDeps, options?: ToolbarOptions): ToolbarHandle {
  let current = { ...deps }
  const listeners: { el: HTMLElement; type: string; fn: (e: Event) => void }[] = []

  function on(el: HTMLElement, type: string, fn: (e: Event) => void): void {
    el.addEventListener(type, fn)
    listeners.push({ el, type, fn })
  }

  const root = document.createElement('div')
  root.id = TOOLBAR_IDS.root
  root.className = 'ui-toolbar'
  root.setAttribute('role', 'toolbar')
  root.setAttribute('aria-label', '视图工具栏')

  // ---- 导航组：返回 + 面包屑插槽 ----
  const navGroup = document.createElement('div')
  navGroup.className = 'ui-toolbar__group ui-toolbar__group--nav'

  const back = makeButton({
    id: TOOLBAR_IDS.back,
    cls: 'ui-btn ui-btn--nav',
    text: '← 返回',
    aria: '返回上一级',
    title: '返回上一级（Esc 在关闭面板后同样返回）'
  })
  on(back, 'click', () => current.onBack())
  navGroup.appendChild(back)

  const crumbSlot = options?.crumbSlot ?? document.createElement('div')
  crumbSlot.id = TOOLBAR_IDS.crumbSlot
  crumbSlot.className = `${crumbSlot.className ? crumbSlot.className + ' ' : ''}ui-toolbar__crumb`
  if (!crumbSlot.hasAttribute('aria-label')) crumbSlot.setAttribute('aria-label', '当前位置')
  navGroup.appendChild(crumbSlot)
  root.appendChild(navGroup)

  // ---- 缩放组 ----
  const zoomGroup = document.createElement('div')
  zoomGroup.className = 'ui-toolbar__group ui-toolbar__group--zoom'

  const zoomOut = makeButton({
    id: TOOLBAR_IDS.zoomOut,
    cls: 'ui-btn ui-btn--icon',
    text: '−',
    aria: '缩小',
    title: '缩小（滚轮向下）'
  })
  const zoomIn = makeButton({
    id: TOOLBAR_IDS.zoomIn,
    cls: 'ui-btn ui-btn--icon',
    text: '+',
    aria: '放大',
    title: '放大（滚轮向上）'
  })
  const zoomFit = makeButton({
    id: TOOLBAR_IDS.zoomFit,
    cls: 'ui-btn',
    text: '适配',
    aria: '整树适配视口',
    title: '把整棵树缩放到刚好放进屏幕'
  })
  const zoomReset = makeButton({
    id: TOOLBAR_IDS.zoomReset,
    cls: 'ui-btn ui-btn--percent',
    text: zoomLabel(options?.initialPercent ?? 100),
    aria: '重置为 100% 缩放',
    title: '恢复 100% 缩放（点击）'
  })
  on(zoomOut, 'click', () => current.onZoomOut())
  on(zoomIn, 'click', () => current.onZoomIn())
  on(zoomFit, 'click', () => current.onFit())
  on(zoomReset, 'click', () => current.onReset())
  zoomGroup.append(zoomOut, zoomIn, zoomFit, zoomReset)
  root.appendChild(zoomGroup)

  // ---- 功能入口组 ----
  const toolsGroup = document.createElement('div')
  toolsGroup.className = 'ui-toolbar__group ui-toolbar__group--tools'

  const search = makeButton({
    id: TOOLBAR_IDS.search,
    cls: 'ui-btn',
    text: '搜索',
    aria: '全局搜索知识点',
    title: '全局搜索（Ctrl+K 或 /）'
  })
  const pack = makeButton({
    id: TOOLBAR_IDS.pack,
    cls: 'ui-btn',
    text: '学科包',
    aria: '切换学科包',
    title: '切换学科包；进度按包独立保存'
  })
  const exportBtn = makeButton({
    id: TOOLBAR_IDS.export,
    cls: 'ui-btn',
    text: '导出',
    aria: '导出进度',
    title: '把当前进度导出为 JSON 文件'
  })
  const importBtn = makeButton({
    id: TOOLBAR_IDS.import,
    cls: 'ui-btn',
    text: '导入',
    aria: '导入进度',
    title: '从 JSON 文件导入进度'
  })
  const help = makeButton({
    id: TOOLBAR_IDS.help,
    cls: 'ui-btn',
    text: '帮助',
    aria: '操作与快捷键说明',
    title: '操作说明与快捷键（?）'
  })
  on(search, 'click', () => current.onSearch())
  on(pack, 'click', () => current.onPack())
  on(exportBtn, 'click', () => current.onExport())
  on(importBtn, 'click', () => current.onImport())
  on(help, 'click', () => current.onHelp())
  toolsGroup.append(search, pack, exportBtn, importBtn, help)
  root.appendChild(toolsGroup)

  mount.appendChild(root)

  return {
    root,
    crumbSlot,
    setZoomPercent(percent: number) {
      zoomReset.textContent = zoomLabel(percent)
      zoomReset.setAttribute('aria-label', `当前缩放 ${zoomLabel(percent)}，点击重置为 100%`)
    },
    setBackEnabled(enabled: boolean) {
      back.disabled = !enabled
      back.setAttribute('aria-disabled', String(!enabled))
    },
    update(patch: Partial<ToolbarDeps>) {
      current = { ...current, ...patch }
    },
    destroy() {
      for (const l of listeners) l.el.removeEventListener(l.type, l.fn)
      listeners.length = 0
      if (root.parentNode !== null) root.parentNode.removeChild(root)
    }
  }
}
