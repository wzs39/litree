"""Batch2: 学习者闭环——叶子面板回退单元内容/学习中/note/下一个可学/关闭语义/滚动保持/今日/域卡/首页按钮"""
import io

# ---------- detailPanel.ts 重写关键段 ----------
p = 'src/renderer/view/detailPanel.ts'
s = io.open(p, encoding='utf-8').read()

old = """export interface DetailHandlers {
  /** 确认点亮（main 层执行仪式：store.lightLeaf + 动效） */
  onLight(id: string): void
  /** 进入容器视图（stack 需含其祖先链） */
  onEnter(id: string): void
  /** 跳到任意节点的所属视图 */
  onJump(id: string): void
}"""
new = """export interface DetailHandlers {
  /** 确认点亮（main 层执行仪式：store.lightLeaf + 动效） */
  onLight(id: string): void
  /** 进入容器视图（stack 需含其祖先链） */
  onEnter(id: string): void
  /** 跳到任意节点的所属视图 */
  onJump(id: string): void
  /** 关闭面板（main 层清 selectedId） */
  onClose(): void
}"""
assert old in s, 'handlers'
s = s.replace(old, new, 1)

old = """  const unit = unitId ? store.index.nodeById.get(unitId) : undefined
  const canLight =
    node.kind === 'leaf' && state === 'available'
  const missingFirst = closure.length > 0 ? store.index.nodeById.get(closure[0])?.title.zh : undefined"""
new = """  const unit = unitId ? store.index.nodeById.get(unitId) : undefined
  // 点亮资格按门控语义（leafAvailable），不用视觉态——learning 标记不得阻断点亮
  const canLight = node.kind === 'leaf' && leafAvailable(node.id, store.index, store.litLeaves())
  const missingFirst = closure.length > 0 ? store.index.nodeById.get(closure[0])?.title.zh : undefined
  // 叶子内容回退：叶子自身无 summary/资源/练习/证据时展示所属单元的（审查 P0：面板空壳）
  const contentNode: PackNode | undefined =
    node.kind === 'leaf' ? (unit && unit.kind === 'unit' ? unit : undefined) : node
  const contentFromUnit = node.kind === 'leaf'"""
assert old in s, 'canLight'
s = s.replace(old, new, 1)

old = """import { minimalHardClosure, type GraphIndex } from '../core/graph'"""
new = """import { leafAvailable, minimalHardClosure, type GraphIndex } from '../core/graph'"""
assert old in s, 'import leafAvailable'
s = s.replace(old, new, 1)

# 模板：summary/资源/练习/证据 取 contentNode；加"来自单元"行；note 文本域；学习中按钮；下一个可学
old = """  const resList = (node.resources ?? [])
    .map(
      (r) =>
        `<a class="dp-res" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">` +
        `<span class="dp-res-lang">${r.lang === 'en' ? 'EN' : r.lang === 'zh' ? '中' : '·'}</span>` +
        `<span class="dp-res-body"><span class="dp-res-title">${esc(r.title)}</span>` +
        `<span class="dp-res-url">${esc(r.url.replace(/^https?:\\/\\//, '').slice(0, 42))}</span></span></a>`
    )
    .join('')

  const exList = (node.exercises ?? [])
    .map((ex) => `<div class="dp-exercise">${esc(ex)}</div>`)
    .join('')"""
new = """  const resList = (contentNode?.resources ?? [])
    .map(
      (r) =>
        `<a class="dp-res" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">` +
        `<span class="dp-res-lang">${r.lang === 'en' ? 'EN' : r.lang === 'zh' ? '中' : '·'}</span>` +
        `<span class="dp-res-body"><span class="dp-res-title">${esc(r.title)}</span>` +
        `<span class="dp-res-url">${esc(r.url.replace(/^https?:\\/\\//, '').slice(0, 42))}</span></span></a>`
    )
    .join('')

  const exList = (contentNode?.exercises ?? [])
    .map((ex) => `<div class="dp-exercise">${esc(ex)}</div>`)
    .join('')

  const litNote =
    node.kind === 'leaf' && state === 'lit'
      ? `<div class="dp-cap">我的笔记</div>` +
        `<textarea id="dp-note" class="dp-note" placeholder="卡住了？记录上下文…">${esc(store.progress.lit[node.id]?.note ?? '')}</textarea>`
      : ''"""
assert old in s, 'resList'
s = s.replace(old, new, 1)

old = """  const actionArea = (() => {
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
  })()"""
new = """  // 点亮后的"下一步"：所属单元内第一个可点亮叶子
  const nextUp =
    node.kind === 'leaf' && state === 'lit' && unitId
      ? store.index
          .leavesOf(unitId)
          .find((l) => l.id !== node.id && leafAvailable(l.id, store.index, store.litLeaves()) && store.stateOf(l.id) !== 'lit')
      : undefined

  const actionArea = (() => {
    const learningBtn =
      state !== 'lit'
        ? `<button id="dp-learning" class="dp-action dp-action--secondary" type="button">${state === 'learning' ? '取消"学习中"标记' : '标记为学习中'}</button>`
        : ''
    if (node.kind === 'leaf') {
      if (state === 'lit') {
        return (
          `<div class="dp-action dp-action--done">✓ 已点亮</div>` +
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
      return `<div class="dp-action dp-action--locked">🔒 还差 ${closure.length} 步${missingFirst ? ` · 缺「${esc(missingFirst)}」` : ''}</div>` + learningBtn
    }
    if (node.kind === 'unit') {
      const avail = state === 'available'
      return (
        `<button id="dp-enter" class="dp-action dp-action--enter" type="button">进入单元</button>` +
        (avail && store.index.leavesOf(node.id).some((l) => store.progress.lit[l.id] === undefined)
          ? `<button id="dp-light-all" class="dp-action dp-action--light" type="button">批量点亮全部知识点</button>`
          : '') +
        learningBtn
      )
    }
    return (
      `<button id="dp-enter" class="dp-action dp-action--enter" type="button">进入${node.kind === 'branch' ? '分支' : ''}</button>` +
      learningBtn
    )
  })()"""
assert old in s, 'actionArea'
s = s.replace(old, new, 1)

# 模板主体：summary/资源/练习/证据改 contentNode；加 contentFromUnit 提示、litNote；关闭走 onClose
old = """    ${progressLine}
    ${node.summary ? `<div class="dp-summary">${esc(node.summary)}</div>` : ''}
    ${resList ? `<div class="dp-cap">学习资源</div>${resList}` : ''}
    ${exList ? `<div class="dp-cap">练习</div>${exList}` : ''}
    ${node.evidence ? `<div class="dp-cap">前置依据</div><div class="dp-evidence">${esc(node.evidence)}</div>` : ''}"""
new = """    ${progressLine}
    ${contentFromUnit && contentNode ? `<div class="dp-from">以下内容来自单元「<span class="dp-from-link" data-jump="${esc(contentNode.id)}">${esc(contentNode.title.zh)}</span>」</div>` : ''}
    ${contentNode?.summary ? `<div class="dp-summary">${esc(contentNode.summary)}</div>` : ''}
    ${resList ? `<div class="dp-cap">学习资源</div>${resList}` : ''}
    ${exList ? `<div class="dp-cap">练习</div>${exList}` : ''}
    ${contentNode?.evidence ? `<div class="dp-cap">前置依据</div><div class="dp-evidence">${esc(contentNode.evidence)}</div>` : ''}
    ${litNote}"""
assert old in s, 'template body'
s = s.replace(old, new, 1)

# 关闭/事件接线：onClose；note blur 写入；学习中；下一个
old = """  el.querySelector('#dp-close')?.addEventListener('click', () => renderDetailPanel(el, store, null, handlers))
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
  })"""
new = """  el.querySelector('#dp-close')?.addEventListener('click', () => handlers.onClose())
  el.querySelector('#dp-light')?.addEventListener('click', () => handlers.onLight(node.id))
  el.querySelector('#dp-enter')?.addEventListener('click', () => {
    if (node.kind !== 'leaf') handlers.onEnter(node.id)
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
  })"""
assert old in s, 'event wiring'
s = s.replace(old, new, 1)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('DETAIL PANEL PATCHED')
