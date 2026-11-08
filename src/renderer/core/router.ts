/** hash 路由（v2 spec §1）：viewStack ↔ URL 双向绑定，返回键/刷新/分享全部可用 */
import type { AppStore } from './store'
import type { GraphIndex } from './graph'

export function stackToHash(stack: string[]): string {
  if (stack.length <= 1) return '#/home'
  return '#/tree/' + stack.join('/')
}

export function hashToStack(
  hash: string,
  index: GraphIndex
): { stack: string[]; valid: boolean } {
  if (!hash.startsWith('#/')) return { stack: ['root'], valid: false }
  if (hash === '#/home' || hash === '#/' || hash === '#') return { stack: ['root'], valid: true }
  if (!hash.startsWith('#/tree/')) return { stack: ['root'], valid: false }
  const parts = hash.slice('#/tree/'.length).split('/').filter((p) => p.length > 0)
  if (parts.length === 0 || parts[0] !== 'root') return { stack: ['root'], valid: false }
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
}

function sameStack(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => b[i] === id)
}

/** 接线：hashchange → setStack；store 变化 → location.hash（触发 hashchange，回声按相等跳过） */
export function attachRouter(store: AppStore): () => void {
  const onHashChange = (): void => {
    const { stack, valid } = hashToStack(window.location.hash, store.index)
    if (!valid) {
      // 非法 hash（手工改坏 URL）：替换为 home，不新增历史
      window.history.replaceState(null, '', stackToHash(['root']))
      if (!sameStack(store.viewStack, ['root'])) store.setStack(['root'])
      return
    }
    if (!sameStack(stack, store.viewStack)) store.setStack(stack)
  }

  const unsub = store.subscribe(() => {
    const desired = stackToHash(store.viewStack)
    if (window.location.hash !== desired) window.location.hash = desired
  })

  window.addEventListener('hashchange', onHashChange)
  // 启动恢复：先解析现有 hash（刷新/分享链接），合法则恢复位置，否则才写 home
  const initial = hashToStack(window.location.hash, store.index)
  if (!sameStack(initial.stack, store.viewStack)) {
    if (initial.valid) {
      store.setStack(initial.stack)
    } else {
      window.history.replaceState(null, '', stackToHash(store.viewStack))
    }
  }

  return () => {
    window.removeEventListener('hashchange', onHashChange)
    unsub()
  }
}
