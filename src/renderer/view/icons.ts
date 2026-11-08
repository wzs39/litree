/** 手绘 SVG 图标单一来源（spec §9.1）：24×24 网格、2px 描边、圆角端点，零 emoji */
export const icons = {
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.6"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  learning: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  zoomIn: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M11 9v4M9 11h4"/>',
  zoomOut: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M9 11h4"/>'
} as const

export type IconName = keyof typeof icons

export function icon(name: IconName, size = 16): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`
  )
}
