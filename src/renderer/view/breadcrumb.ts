/** 面包屑导航（spec §5.4） */
import { icon } from './icons'

export interface Crumb {
  id: string
  label: string
}

export function renderBreadcrumb(
  el: HTMLElement,
  trail: Crumb[],
  onJump: (index: number) => void
): void {
  el.innerHTML = ''
  trail.forEach((c, i) => {
    const btn = document.createElement('button')
    btn.className = 'crumb' + (i === trail.length - 1 ? ' crumb--current' : '')
    btn.textContent = c.label
    btn.addEventListener('click', () => onJump(i))
    el.appendChild(btn)
    if (i < trail.length - 1) {
      const sep = document.createElement('span')
      sep.className = 'crumb-sep'
      sep.innerHTML = icon('back', 12)
      sep.style.transform = 'rotate(180deg)'
      el.appendChild(sep)
    }
  })
}
