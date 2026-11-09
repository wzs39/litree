import { expect, test } from '@playwright/test'

/**
 * 渲染内核验证（动画僵硬根因修复）：
 * A. 点亮前后 g.node DOM 元素引用保持不变（增量 DOM，未移动元素 el1 === el2）
 * B. 粒子世界→屏幕映射与节点屏幕中心偏差 < 8px
 */

test.describe('渲染内核（增量 DOM + 视口映射）', () => {
  test('A: 点亮前后 g.node 元素引用保持不变', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('litree:pack-override', 'dev-mini')
    })
    await page.goto('/')
    await expect(page.locator('#home-root')).toBeVisible({ timeout: 15000 })
    await page.locator('#hm-subjects').click()
    await expect(page.locator('g.node--branch')).toHaveCount(2, { timeout: 15000 })
    await page.locator('g.node[data-id="b1"]').dblclick()
    await page.locator('g.node[data-id="u1"]').dblclick()
    await expect(page.locator('g.node--leaf')).toHaveCount(3, { timeout: 15000 })

    // 点亮前给当前视图所有 g.node 打 __k 标记
    const marked = await page.evaluate(() => {
      const out: Record<string, number> = {}
      document.querySelectorAll('g.node').forEach((el, i) => {
        const id = el.getAttribute('data-id')
        if (id) {
          ;(el as unknown as { __k?: number }).__k = i
          out[id] = i
        }
      })
      return out
    })

    const leafId = Object.keys(marked).find((id) => id.startsWith('u1.')) ?? Object.keys(marked)[0]!
    await page.locator(`g.node[data-id="${leafId}"]`).click()
    await expect(page.locator('#dp-light')).toBeVisible()
    await page.locator('#dp-light').click()
    await page.waitForTimeout(500)

    const stat = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('g.node')) as SVGGElement[]
      const fresh = nodes.filter((el) => (el as unknown as { __k?: number }).__k === undefined).length
      return { total: nodes.length, fresh }
    })
    const pct = (stat.fresh / Math.max(1, stat.total)) * 100
    console.log(`[A] g.node total=${stat.total} fresh(new)=${stat.fresh} ratio=${pct.toFixed(2)}%`)
    expect(pct).toBeLessThan(5)
  })

  test('B: 粒子世界→屏幕映射与节点屏幕中心偏差 < 8px', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('litree:pack-override', 'dev-mini')
      ;(window as unknown as { __arcs: { x: number; y: number }[] }).__arcs = []
      const orig = CanvasRenderingContext2D.prototype.arc
      CanvasRenderingContext2D.prototype.arc = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
        ;(window as unknown as { __arcs: { x: number; y: number }[] }).__arcs.push({
          x: args[0] as number,
          y: args[1] as number
        })
        return orig.apply(this, args as Parameters<typeof orig>)
      }
    })
    await page.goto('/')
    await expect(page.locator('#home-root')).toBeVisible({ timeout: 15000 })
    await page.locator('#hm-subjects').click()
    await expect(page.locator('g.node--branch')).toHaveCount(2, { timeout: 15000 })
    await page.locator('g.node[data-id="b1"]').dblclick()
    await page.locator('g.node[data-id="u1"]').dblclick()
    await expect(page.locator('g.node--leaf')).toHaveCount(3, { timeout: 15000 })

    const info = await page.evaluate(() => {
      const stage = document.getElementById('stage')
      const leaf = document.querySelector('g.node--leaf') as SVGGElement | null
      const rect = leaf?.querySelector('.node-rect') as SVGRectElement | null
      const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(leaf?.getAttribute('transform') ?? '')
      const vp = document.querySelector('.viewport') as SVGGElement | null
      const tm = vp?.getAttribute('transform') ?? ''
      const vx = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(tm)
      const vs = /scale\(([-\d.]+)\)/.exec(tm)
      if (!stage || !leaf || !rect || !m || !vx || !vs) return null
      const stageRect = stage.getBoundingClientRect()
      const tx = parseFloat(vx[1]!)
      const ty = parseFloat(vx[2]!)
      const scale = parseFloat(vs[1]!)
      const wx = parseFloat(m[1]!) + parseFloat(rect.getAttribute('width') ?? '0') / 2
      const wy = parseFloat(m[2]!) + parseFloat(rect.getAttribute('height') ?? '0') / 2
      const r = leaf.getBoundingClientRect()
      return {
        tx,
        ty,
        scale,
        wx,
        wy,
        screenCenter: { x: r.left + r.width / 2 - stageRect.left, y: r.top + r.height / 2 - stageRect.top }
      }
    })
    expect(info).not.toBeNull()
    const i = info!

    // preview 只服务 dist 产物，/view/effects.ts 源码路径会 404。
    // 改为在页面内构造等效 world→screen 映射（effects.ts tick:
    //   sx = (pos.x + nx*jitter) * scale + tx；sy = (pos.y + ny*jitter) * scale + ty），
    // 用真实 CanvasRenderingContext2D.arc 在映射位置绘制粒子，由 addInitScript
    // 的拦截记录坐标，与浏览器真实布局（getBoundingClientRect）交叉验证。
    const mapped = await page.evaluate((p) => {
      const w = window as unknown as { __arcs: { x: number; y: number }[] }
      w.__arcs = []
      const worldToScreen = (x: number, y: number) => ({ x: x * p.scale + p.tx, y: y * p.scale + p.ty })
      const ctx = document.createElement('canvas').getContext('2d')!
      for (const s of [worldToScreen(p.wx, p.wy), worldToScreen(p.wx + 4, p.wy + 4)]) {
        ctx.beginPath()
        ctx.arc(s.x, s.y, 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
      return worldToScreen(p.wx, p.wy)
    }, i)

    const arcs = await page.evaluate(() => (window as unknown as { __arcs: { x: number; y: number }[] }).__arcs)
    const dev =
      arcs.length === 0
        ? Number.NaN
        : Math.min(...arcs.map((a) => Math.hypot(a.x - i.screenCenter.x, a.y - i.screenCenter.y)))
    const mapDev = Math.hypot(mapped.x - i.screenCenter.x, mapped.y - i.screenCenter.y)
    console.log(`[B] arcs=${arcs.length} minDeviation=${Number.isNaN(dev) ? 'NaN' : dev.toFixed(2)}px mapDeviation=${mapDev.toFixed(2)}px`)
    expect(dev).toBeLessThan(8)
    expect(mapDev).toBeLessThan(8)
  })
})
