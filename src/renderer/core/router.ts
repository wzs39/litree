/** hash 路由（v2 spec §1）：viewStack ↔ URL 双向绑定，返回键/刷新/分享全部可用 */
import type { AppStore } from './store'
import type { GraphIndex } from './graph'

export function stackToHash(stack: string[], node?: string | null): string {
  const base =
    stack.length === 1 && stack[0] === 'home'
      ? '#/home'
      : stack.length <= 1
        ? '#/tree/root'
        : '#/tree/' + stack.join('/')
  return node ? `${base}?node=${encodeURIComponent(node)}` : base
}

export function hashToStack(
  hash: string,
  index: GraphIndex
): { stack: string[]; valid: boolean; node: string | null } {
  const qIndex = hash.indexOf('?')
  const path = qIndex === -1 ? hash : hash.slice(0, qIndex)
  const query = qIndex === -1 ? null : hash.slice(qIndex + 1)
  const nodeParam = query !== null ? new URLSearchParams(query).get('node') : null
  const node = nodeParam !== null && nodeParam.length > 0 ? nodeParam : null
  if (!path.startsWith('#/')) return { stack: ['home'], valid: false, node }
  if (path === '#/home' || path === '#/' || path === '#') return { stack: ['home'], valid: true, node }
  if (!path.startsWith('#/tree/')) return { stack: ['home'], valid: false, node }
  const parts = path.slice('#/tree/'.length).split('/').filter((p) => p.length > 0)
  if (parts.length === 0 || parts[0] !== 'root') return { stack: ['home'], valid: false, node }
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
}

function sameStack(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => b[i] === id)
}

/** 接线：hashchange → setStack；store 变化 → location.hash（触发 hashchange，回声按相等跳过） */
export interface RouterHandle {
  detach(): void
  /** 面板选中节点变化时同步 URL（replace，不污染历史） */
  syncNode(node: string | null): void
}

export function attachRouter(store: AppStore, hooks?: { onNodeRestore?(node: string): void }): RouterHandle {
  let lastNode: string | null = null
  const onHashChange = (): void => {
    const { stack, valid, node } = hashToStack(window.location.hash, store.index)
    if (!valid) {
      // 非法 hash（手工改坏 URL）：替换为 home，不新增历史
      window.history.replaceState(null, '', stackToHash(['home']))
      if (!sameStack(store.viewStack, ['home'])) store.setStack(['home'])
      return
    }
    if (!sameStack(stack, store.viewStack)) store.setStack(stack)
    // URL 无 node 参数（导航离开选中节点）→ 清空跟踪；有则恢复
    if (node === null) {
      lastNode = null
    } else if (node !== lastNode) {
      lastNode = node
      hooks?.onNodeRestore?.(node)
    }
  }

  // 启动恢复：合法 hash 恢复位置与选中节点；无 hash / 非法 hash → 默认首页。
  // 必须先于订阅执行（直接赋值不 notify，避免订阅者把恢复当作新导航再推一条历史）
  const initial = hashToStack(window.location.hash, store.index)
  if (initial.valid) {
    if (!sameStack(initial.stack, store.viewStack)) store.viewStack = initial.stack
    if (initial.node !== null) {
      lastNode = initial.node
      hooks?.onNodeRestore?.(initial.node)
    }
  } else {
    window.history.replaceState(null, '', stackToHash(['home']))
    if (!sameStack(store.viewStack, ['home'])) store.viewStack = ['home']
  }

  const unsub = store.subscribe(() => {
    // 栈变化推入携带当前选中节点的 hash（保持选中态可分享/可恢复）
    const desired = stackToHash(store.viewStack, lastNode)
    if (window.location.hash !== desired) window.location.hash = desired
  })

  window.addEventListener('hashchange', onHashChange)

  return {
    detach() {
      window.removeEventListener('hashchange', onHashChange)
      unsub()
    },
    syncNode(node: string | null) {
      lastNode = node
      const desired = stackToHash(store.viewStack, node)
      if (window.location.hash !== desired) window.history.replaceState(null, '', desired)
    }
  }
}
