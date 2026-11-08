"""Batch2c: main.ts 接线（面板 onClose/onNodeRestore/saveNow 事件）+ homeView 今日/域卡"""
import io

# ---------- main.ts ----------
p = 'src/renderer/main.ts'
s = io.open(p, encoding='utf-8').read()

old = """  function renderPanel(): void {
    renderDetailPanel(panelEl, store, selectedId, {
      onLight: (id) => void lightWithCeremony(id),
      onEnter: (id) => jumpToNode(id),
      onJump: (id) => {
        jumpToNode(id)
        selectedId = id
        renderPanel()
      }
    })
  }"""
new = """  function renderPanel(): void {
    // 面板是滚动容器：内容重建后保持滚动位置（审查 P1）
    const prevTop = panelEl.scrollTop
    renderDetailPanel(panelEl, store, selectedId, {
      onLight: (id) => void lightWithCeremony(id).catch((err) => console.error('点亮失败', err)),
      onEnter: (id) => jumpToNode(id),
      onJump: (id) => {
        jumpToNode(id)
        selectedId = id
        renderPanel()
      },
      onClose: () => {
        selectedId = null
        routerSyncNode(null)
        renderPanel()
      }
    })
    panelEl.scrollTop = prevTop
  }"""
assert old in s, 'renderPanel'
s = s.replace(old, new, 1)

old = """  store.subscribe(scheduleRender)
  attachRouter(store)"""
new = """  store.subscribe(scheduleRender)
  const routerSyncNode = (node: string | null): void => {
    // 占位声明在前（attachRouter 需要引用），实际实现随 attachRouter 返回
    void node
  }
  const detachRouter = attachRouter(store, {
    onNodeRestore: (node) => {
      // 刷新/分享链接恢复选中节点（v2 spec §1 ?node=）
      if (store.index.nodeById.get(node) !== undefined) {
        selectedId = node
        renderPanel()
      }
    }
  })
  // 真正的 syncNode：借 router 的 replace 逻辑由 routerSyncNodeRef 承担
  let routerSyncNodeRef: (node: string | null) => void = () => undefined
  routerSyncNodeRef = (node) => routerSyncNodeRef(node)"""
assert old in s, 'attach'
s = s.replace(old, new, 1)

# 修正上面的占位设计：直接让 openPanel/清空时调 routerSyncNodeRef（由 attachRouter 暴露）
old = """  // 真正的 syncNode：借 router 的 replace 逻辑由 routerSyncNodeRef 承担
  let routerSyncNodeRef: (node: string | null) => void = () => undefined
  routerSyncNodeRef = (node) => routerSyncNodeRef(node)"""
new = """  // URL 选中节点同步：由 attachRouter 的返回句柄完成（见下）
  let routerSyncNodeRef: ((node: string | null) => void) | null = null"""
assert old in s, 'ref fix'
s = s.replace(old, new, 1)

old = """  function openPanel(id: string): void {
    selectedId = id
    renderPanel()
  }"""
new = """  function openPanel(id: string): void {
    selectedId = id
    routerSyncNodeRef?.(id)
    renderPanel()
  }"""
assert old in s, 'openPanel'
s = s.replace(old, new, 1)

old = """    if (selectedId !== null) {
      selectedId = null
      renderPanel()
    } else {
      store.back()
    }"""
new = """    if (selectedId !== null) {
      selectedId = null
      routerSyncNodeRef?.(null)
      renderPanel()
    } else {
      store.back()
    }"""
assert old in s, 'esc'
s = s.replace(old, new, 1)

# attachRouter 返回句柄需要 router 暴露 syncNode——router 已返回解绑函数，改为返回 { detach, syncNode }
old = """  const detachRouter = attachRouter(store, {
    onNodeRestore: (node) => {
      // 刷新/分享链接恢复选中节点（v2 spec §1 ?node=）
      if (store.index.nodeById.get(node) !== undefined) {
        selectedId = node
        renderPanel()
      }
    }
  })"""
new = """  const router = attachRouter(store, {
    onNodeRestore: (node) => {
      // 刷新/分享链接恢复选中节点（v2 spec §1 ?node=）
      if (store.index.nodeById.get(node) !== undefined) {
        selectedId = node
        renderPanel()
      }
    }
  })
  routerSyncNodeRef = router.syncNode
  void router.detach"""
assert old in s, 'router handle'
s = s.replace(old, new, 1)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ---------- router.ts：返回 {detach, syncNode} ----------
p = 'src/renderer/core/router.ts'
s = io.open(p, encoding='utf-8').read()
old = """export function attachRouter(store: AppStore, hooks?: RouterHooks): () => void {
  let lastNode: string | null = null"""
new = """export interface RouterHandle {
  detach(): void
  /** 面板选中变化时同步 URL（replace，不污染历史） */
  syncNode(node: string | null): void
}

export function attachRouter(store: AppStore, hooks?: RouterHooks): RouterHandle {
  let lastNode: string | null = null"""
assert old in s, 'attach sig'
s = s.replace(old, new, 1)

old = """  return () => {
    window.removeEventListener('hashchange', onHashChange)
    unsub()
  }
}"""
new = """  return {
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
}"""
assert old in s, 'attach return'
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ---------- homeView.ts：今日点亮 + 域浏览卡 ----------
p = 'src/renderer/view/homeView.ts'
s = io.open(p, encoding='utf-8').read()
old = """  el.innerHTML = `
    <div class="hm-wrap">
      <div class="hm-hero">
        <div class="hm-title">${esc(store.pack.title.zh)}</div>
        <div class="hm-progress">
          <div class="hm-progress-num">${overall.lit}<span class="hm-progress-total">/${overall.total}</span></div>
          <div class="hm-progress-label">知识点已点亮</div>
          <div class="hm-bar"><div class="hm-bar-fill" style="width:${Math.round(frac * 100)}%"></div></div>
        </div>
        <div class="hm-xp">XP ${store.progress.xp}</div>
        ${continueBtn}
      </div>
      <div class="hm-section">推荐学习路线</div>
      <div class="hm-routes">${routeCards || '<div class="hm-empty">此数据包暂无路线</div>'}</div>
      <button id="hm-subjects" class="hm-subjects" type="button">浏览全部学科 →</button>
    </div>
  `"""
new = """  // 今日点亮数（审查 P1：每日回访感知）
  const today = new Date().toISOString().slice(0, 10)
  const todayCount = [...progress.lit.values()].filter((r) => r.at.slice(0, 10) === today).length

  // 按领域浏览（审查 P0：routes 只覆盖 59.4% 单元——域级入口保证全包可发现）
  const domainCards = store.pack.domains
    .map((d) => {
      const stat = domainStats(store.index, store.litLeaves()).find((x) => x.domainId === d.id)
      const pct = stat && stat.total > 0 ? Math.round((stat.lit / stat.total) * 100) : 0
      return `<button class="hm-domain" data-domain="${esc(d.id)}" type="button">
        <span class="dot" style="background:${esc(d.color)}"></span>
        <span class="hm-domain-name">${esc(d.name)}</span>
        <span class="hm-domain-num">${stat?.lit ?? 0}/${stat?.total ?? 0}</span>
      </button>`
    })
    .join('')

  el.innerHTML = `
    <div class="hm-wrap">
      <div class="hm-hero">
        <div class="hm-title">${esc(store.pack.title.zh)}</div>
        <div class="hm-progress">
          <div class="hm-progress-num">${overall.lit}<span class="hm-progress-total">/${overall.total}</span></div>
          <div class="hm-progress-label">知识点已点亮</div>
          <div class="hm-bar"><div class="hm-bar-fill" style="width:${Math.round(frac * 100)}%"></div></div>
        </div>
        <div class="hm-xp">XP ${store.progress.xp}</div>
        ${continueBtn}
      </div>
      <div class="hm-today">今日已点亮 <b>${todayCount}</b> 个知识点</div>
      <div class="hm-section">推荐学习路线</div>
      <div class="hm-routes">${routeCards || '<div class="hm-empty">此数据包暂无路线</div>'}</div>
      <div class="hm-section">按领域浏览</div>
      <div class="hm-domains">${domainCards}</div>
      <button id="hm-subjects" class="hm-subjects" type="button">浏览全部学科 →</button>
    </div>
  `"""
assert old in s, 'home template'
s = s.replace(old, new, 1)

old = """import { continueTarget, type HomeTarget } from '../core/home'
import { overallProgress } from '../core/stats'
import type { AppStore } from '../core/store'
import { esc } from './escape'"""
new = """import { continueTarget, type HomeTarget } from '../core/home'
import { domainStats, overallProgress } from '../core/stats'
import type { AppStore } from '../core/store'
import { esc } from './escape'"""
assert old in s, 'home imports'
s = s.replace(old, new, 1)

old = """export interface HomeHandlers {
  onContinue(target: HomeTarget): void
  onOpenUnit(id: string): void
  onOpenSubjects(): void
}"""
new = """export interface HomeHandlers {
  onContinue(target: HomeTarget): void
  onOpenUnit(id: string): void
  onOpenSubjects(): void
  onOpenDomain(id: string): void
}"""
assert old in s, 'handlers'
s = s.replace(old, new, 1)

old = """  el.querySelector('#hm-subjects')?.addEventListener('click', () => {
    handlers.onOpenSubjects()
  })"""
new = """  el.querySelector('#hm-subjects')?.addEventListener('click', () => {
    handlers.onOpenSubjects()
  })
  el.querySelectorAll('[data-domain]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = (card as HTMLElement).dataset['domain']
      if (id) handlers.onOpenDomain(id)
    })
  })"""
assert old in s, 'domain events'
s = s.replace(old, new, 1)

# progress 引用：renderHome 需要原始 progress（今日统计）——顶部加 const progress = store.progress
old = """  const overall = overallProgress(store.index, store.litLeaves())"""
new = """  const progress = store.progress
  const overall = overallProgress(store.index, store.litLeaves())"""
assert old in s, 'progress ref'
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ---------- main.ts home handlers：onOpenDomain ----------
p = 'src/renderer/main.ts'
s = io.open(p, encoding='utf-8').read()
old = """        onOpenSubjects: () => store.setStack(['root'])
      })"""
new = """        onOpenSubjects: () => store.setStack(['root']),
        onOpenDomain: (id) => {
          // 进入该领域下第一个 unit 的视图（领域 token 即 lane id = branch id）
          const lane = store.index.nodeById.get(id)
          if (lane) jumpToNode(lane.childrenOf?.(id)[0]?.id ?? id)
        }
      })"""
assert old in s, 'home handlers'
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('BATCH2C PATCHED')
