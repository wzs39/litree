/** 统计面板（spec §5/统计）：总进度环 + 各领域进度条 + 最近点亮时间线 */
import type { AppStore } from '../core/store'
import { domainStats, overallProgress, recentHistory } from '../core/stats'
import { icon } from './icons'

export function renderSidebar(el: HTMLElement, store: AppStore): void {
  const lit = store.litLeaves()
  const overall = overallProgress(store.index, lit)
  const domains = domainStats(store.index, lit)
  const recent = recentHistory(store.progress, store.index, 8)

  const frac = overall.total > 0 ? overall.lit / overall.total : 0
  const ringR = 26
  const ringC = 2 * Math.PI * ringR

  el.innerHTML = `
    <div class="side-xp">${icon('learning', 14)} XP ${store.progress.xp}</div>
    <div class="side-overall">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle class="side-ring-bg" cx="32" cy="32" r="${ringR}"/>
        <circle class="side-ring" cx="32" cy="32" r="${ringR}"
          stroke-dasharray="${(ringC * frac).toFixed(1)} ${ringC.toFixed(1)}"/>
        <text class="side-ring-num" x="32" y="30">${overall.lit}/${overall.total}</text>
        <text class="side-ring-cap" x="32" y="42">知识点</text>
      </svg>
    </div>
    <div class="side-domains">
      ${domains
        .map((d) => {
          const color = store.pack.domains.find((x) => x.id === d.domainId)?.color ?? '#888'
          const pct = d.total > 0 ? Math.round((d.lit / d.total) * 100) : 0
          return `<div class="side-domain">
            <div class="side-domain-name"><span class="dot" style="background:${color}"></span>${d.domainId} ${d.lit}/${d.total}</div>
            <div class="side-bar"><div class="side-bar-fill" style="width:${pct}%;background:${color}"></div></div>
          </div>`
        })
        .join('')}
    </div>
    <div class="side-recent">
      <div class="side-cap">最近点亮</div>
      ${recent
        .map(
          (r) =>
            `<div class="side-item" data-id="${r.id}">${r.titleZh}<span class="side-time">${r.at.slice(5, 16).replace('T', ' ')}</span></div>`
        )
        .join('') || '<div class="side-empty">暂无记录</div>'}
    </div>
  `
}
