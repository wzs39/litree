"""Batch2b: store.saveNow + 记忆化 + notify 隔离 + history 修剪 + main 接线 + home 今日/域卡 + 面包屑首页 + router ?node="""
import io

# ---------- store.ts：saveNow + 记忆化 + notify 隔离 + enter 查重 ----------
p = 'src/renderer/core/store.ts'
s = io.open(p, encoding='utf-8').read()

old = """  litLeaves(): Set<string> {
    return new Set(Object.keys(this.progress.lit))
  }

  stateOf(id: string): NodeState {
    return aggregateState(id, this.index, this.litLeaves(), this.progress.learning)
  }"""
new = """  /** litLeaves 记忆化：progress 换代时失效（审查实测 20ms/点击的根因之一） */
  litLeaves(): Set<string> {
    if (this.litCache === null || this.litCacheProgress !== this.progress) {
      this.litCache = new Set(Object.keys(this.progress.lit))
      this.litCacheProgress = this.progress
    }
    return this.litCache
  }

  private litCache: Set<string> | null = null
  private litCacheProgress: Progress | null = null
  private stateCache: Map<string, NodeState> | null = null
  private stateCacheProgress: Progress | null = null

  stateOf(id: string): NodeState {
    if (this.stateCache === null || this.stateCacheProgress !== this.progress) {
      this.stateCache = new Map()
      this.stateCacheProgress = this.progress
    }
    const cached = this.stateCache.get(id)
    if (cached !== undefined) return cached
    const st = aggregateState(id, this.index, this.litLeaves(), this.progress.learning)
    this.stateCache.set(id, st)
    return st
  }"""
assert old in s, 'memo'
s = s.replace(old, new, 1)

old = """  private notify(): void {
    for (const fn of this.listeners) fn()
  }"""
new = """  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn()
      } catch (err) {
        console.error('store 订阅者异常', err)
      }
    }
  }

  /** 立即落盘（供面板 note 等即时保存场景） */
  saveNow(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    void this.api.saveProgress(this.pack.id, this.progress)
  }"""
assert old in s, 'notify'
s = s.replace(old, new, 1)

old = """  enter(id: string): void {
    this.viewStack.push(id)
    this.notify()
  }"""
new = """  enter(id: string): void {
    if (this.viewStack.includes(id)) return // 查重：重复 id 会生成非法 hash
    this.viewStack.push(id)
    this.notify()
  }"""
assert old in s, 'enter'
s = s.replace(old, new, 1)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ---------- progress.ts：history 修剪 500 ----------
p = 'src/renderer/core/progress.ts'
s = io.open(p, encoding='utf-8').read()
old = """    return {
      ...progress,
      lit: { ...progress.lit, [leafId]: { at } },
      xp: progress.xp + XP_PER_LEAF,
      history: [...progress.history, { id: leafId, at, xp: XP_PER_LEAF }]
    }"""
new = """    const history = [...progress.history, { id: leafId, at, xp: XP_PER_LEAF }]
    return {
      ...progress,
      lit: { ...progress.lit, [leafId]: { at } },
      xp: progress.xp + XP_PER_LEAF,
      history: history.length > 500 ? history.slice(history.length - 500) : history
    }"""
assert old in s, 'history trim'
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ---------- graphCanvas.ts：esc 去重 ----------
p = 'src/renderer/view/graphCanvas.ts'
s = io.open(p, encoding='utf-8').read()
old = """function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}"""
new = """import { esc } from './escape'"""
assert old in s, 'local esc'
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ---------- router.ts：?node= 选中态持久化 ----------
p = 'src/renderer/core/router.ts'
s = io.open(p, encoding='utf-8').read()
old = """export function stackToHash(stack: string[]): string {
  if (stack.length === 1 && stack[0] === 'home') return '#/home'
  if (stack.length <= 1) return '#/tree/root'
  return '#/tree/' + stack.join('/')
}"""
new = """export function stackToHash(stack: string[], node?: string | null): string {
  const base =
    stack.length === 1 && stack[0] === 'home'
      ? '#/home'
      : stack.length <= 1
        ? '#/tree/root'
        : '#/tree/' + stack.join('/')
  return node ? `${base}?node=${encodeURIComponent(node)}` : base
}"""
assert old in s, 'stackToHash'
s = s.replace(old, new, 1)

old = """export function hashToStack(
  hash: string,
  index: GraphIndex
): { stack: string[]; valid: boolean } {
  if (!hash.startsWith('#/')) return { stack: ['home'], valid: false }"""
new = """export function hashToStack(
  hash: string,
  index: GraphIndex
): { stack: string[]; valid: boolean; node: string | null } {
  const [path, query] = hash.split('?')
  const nodeParam = query !== undefined ? new URLSearchParams(query).get('node') : null
  const node = nodeParam !== null && nodeParam.length > 0 ? nodeParam : null
  if (!path.startsWith('#/')) return { stack: ['home'], valid: false, node }
  if (path === '#/home' || path === '#/' || path === '#') return { stack: ['home'], valid: true, node }
  if (!path.startsWith('#/tree/')) return { stack: ['home'], valid: false, node }
  const parts = path.slice('#/tree/'.length).split('/').filter((p) => p.length > 0)"""
assert old in s, 'hashToStack head'
s = s.replace(old, new, 1)

old = """  if (parts.length === 0 || parts[0] !== 'root') return { stack: ['home'], valid: false }
  // 逐级校验 parent 链：第一级必须是根节点（parent null），后续每级 parent === 前一级 id
  let prev = 'root'
  const stack: string[] = ['root']
  for (const id of parts.slice(1)) {
    const node = index.nodeById.get(id)
    if (node === undefined) return { stack: ['root'], valid: false }
    const expectedParent = prev === 'root' ? null : prev
    if (node.parent !== expectedParent) return { stack: ['root'], valid: false }
    stack.push(id)
    prev = id
  }
  return { stack, valid: true }
}"""
new = """  if (parts.length === 0 || parts[0] !== 'root') return { stack: ['home'], valid: false, node }
  // 逐级校验 parent 链：第一级必须是根节点（parent null），后续每级 parent === 前一级 id
  let prev = 'root'
  const stack: string[] = ['root']
  for (const id of parts.slice(1)) {
    const n = index.nodeById.get(id)
    if (n === undefined) return { stack: ['root'], valid: false, node }
    const expectedParent = prev === 'root' ? null : prev
    if (n.parent !== expectedParent) return { stack: ['root'], valid: false, node }
    stack.push(id)
    prev = id
  }
  return { stack, valid: true, node }
}"""
assert old in s, 'hashToStack tail'
s = s.replace(old, new, 1)

old = """export function attachRouter(store: AppStore): () => void {
  const onHashChange = (): void => {
    const { stack, valid } = hashToStack(window.location.hash, store.index)
    if (!valid) {
      // 非法 hash（手工改坏 URL）：替换为 home，不新增历史
      window.history.replaceState(null, '', stackToHash(['home']))
      if (!sameStack(store.viewStack, ['home'])) store.setStack(['home'])
      return
    }
    if (!sameStack(stack, store.viewStack)) store.setStack(stack)
  }

  const unsub = store.subscribe(() => {
    const desired = stackToHash(store.viewStack)
    if (window.location.hash !== desired) window.location.hash = desired
  })

  window.addEventListener('hashchange', onHashChange)
  // 启动恢复：合法 hash 恢复位置；无 hash / 非法 hash → 默认首页
  const initial = hashToStack(window.location.hash, store.index)
  if (initial.valid) {
    if (!sameStack(initial.stack, store.viewStack)) store.setStack(initial.stack)
  } else {
    window.history.replaceState(null, '', stackToHash(['home']))
    if (!sameStack(store.viewStack, ['home'])) store.setStack(['home'])
  }

  return () => {
    window.removeEventListener('hashchange', onHashChange)
    unsub()
  }
}"""
new = """export interface RouterHooks {
  /** hash 中带选中节点时的恢复回调（刷新/分享链接） */
  onNodeRestore?(node: string): void
}

export function attachRouter(store: AppStore, hooks?: RouterHooks): () => void {
  let lastNode: string | null = null

  const onHashChange = (): void => {
    const { stack, valid, node } = hashToStack(window.location.hash, store.index)
    if (!valid) {
      window.history.replaceState(null, '', stackToHash(['home']))
      if (!sameStack(store.viewStack, ['home'])) store.setStack(['home'])
      return
    }
    if (!sameStack(stack, store.viewStack)) store.setStack(stack)
    if (node !== null && node !== lastNode) {
      lastNode = node
      hooks?.onNodeRestore?.(node)
    }
  }

  const unsub = store.subscribe(() => {
    const desired = stackToHash(store.viewStack, lastNode)
    if (window.location.hash !== desired) window.location.hash = desired
  })

  /** 面板选中节点变化时同步 URL（replace，不污染历史） */
  const syncNode = (node: string | null): void => {
    lastNode = node
    const desired = stackToHash(store.viewStack, node)
    if (window.location.hash !== desired) window.history.replaceState(null, '', desired)
  }

  window.addEventListener('hashchange', onHashChange)
  // 启动恢复：合法 hash 恢复位置与选中节点；无 hash / 非法 hash → 默认首页
  const initial = hashToStack(window.location.hash, store.index)
  if (initial.valid) {
    if (!sameStack(initial.stack, store.viewStack)) store.setStack(initial.stack)
    if (initial.node !== null) hooks?.onNodeRestore?.(initial.node)
  } else {
    window.history.replaceState(null, '', stackToHash(['home']))
    if (!sameStack(store.viewStack, ['home'])) store.setStack(['home'])
  }

  return () => {
    window.removeEventListener('hashchange', onHashChange)
    unsub()
    void syncNode
  }
}"""
assert old in s, 'attachRouter'
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('BATCH2B PATCHED')
