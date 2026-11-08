/** 路线首页（v2 spec §1）：总进度 + 继续学习 + 推荐路线卡片 + 全部学科入口 */
import { continueTarget, type HomeTarget } from '../core/home'
import type { AppStore } from '../core/store'
import { esc } from './escape'

export interface HomeHandlers {
  onContinue(target: HomeTarget): void
  onOpenUnit(id: string): void
  onOpenSubjects(): void
}

function unitState(store: AppStore, id: string): 'lit' | 'available' | 'locked' | 'learning' {
  return store.stateOf(id)
}

const STATE_LABEL: Record<string, string> = {
  lit: '已点亮',
  available: '可学习',
  learning: '学习中',
  locked: '待解锁'
}
const STATE_COLOR: Record<string, string> = {
  lit: 'var(--node-lit-stroke)',
  available: 'var(--node-avail-stroke)',
  learning: 'var(--node-learning-stroke)',
  locked: 'var(--ink-faint)'
}

export function renderHome(el: HTMLElement, store: AppStore, handlers: HomeHandlers): void {
  const overall = store.progressOfContainer(ROOT)
  const frac = overall.total > 0 ? overall.lit / overall.total : 0
  const target = continueTarget(store.pack, store.index, store.progress)
  const routes = store.pack.routes ?? []

  const routeCards = routes
    .map((r, i) => {
      const chips = r.ids
        .map((id) => {
          const n = store.index.nodeById.get(id)
          if (!n) return ''
          const st = unitState(store, id)
          return (
            `<button class="hm-chip hm-chip--${st}" data-unit="${esc(id)}" type="button">` +
            `<span class="hm-dot" style="background:${STATE_COLOR[st]}"></span>${esc(n.title.zh)}</button>`
          )
        })
        .join('')
      let lit = 0
      let total = 0
      for (const id of r.ids) {
        const p = store.progressOfContainer(id)
        lit += p.lit
        total += p.total
      }
      const pct = total > 0 ? Math.round((lit / total) * 100) : 0
      return `<div class="hm-route" data-route="${i}">
        <div class="hm-route-head">
          <div class="hm-route-name">${esc(r.name)}<span class="hm-route-pct">${lit}/${total} · ${pct}%</span></div>
          ${r.note ? `<div class="hm-route-note">${esc(r.note)}</div>` : ''}
        </div>
        <div class="hm-route-bar"><div class="hm-route-bar-fill" style="width:${pct}%"></div></div>
        <div class="hm-chips">${chips}</div>
      </div>`
    })
    .join('')

  const continueBtn = target
    ? `<button id="hm-continue" class="hm-continue" type="button">
         继续学习 ▸ ${esc(store.index.nodeById.get(target.unitId)?.title.zh ?? '')}
       </button>`
    : ''

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
      <div class="hm-section">推荐学习路线</div>
      <div class="hm-routes">${routeCards || '<div class="hm-empty">此数据包暂无路线</div>'}</div>
      <button id="hm-subjects" class="hm-subjects" type="button">浏览全部学科 →</button>
    </div>
  `

  el.querySelector('#hm-continue')?.addEventListener('click', () => {
    if (target) handlers.onContinue(target)
  })
  el.querySelector('#hm-subjects')?.addEventListener('click', () => {
    handlers.onOpenSubjects()
  })
  el.querySelectorAll('[data-unit]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const id = (chip as HTMLElement).dataset['unit']
      if (id) handlers.onOpenUnit(id)
    })
  })
}

const ROOT = 'root'
