import { expect, test } from '@playwright/test'

/** e2e 冒烟（spec §10）：dev-mini 确定性流程 + cs-math 真实包加载冒烟 */

test.describe('dev-mini 确定性流程', () => {
  test.use({
    // 固定加载 dev-mini（真实包默认在前，dev-mini 需 override）
    contextOptions: {}
  })

  test('根视图 → 钻取 → 点亮 → 持久化', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('litree:pack-override', 'dev-mini')
    })
    await page.goto('/')

    // 1. 根视图含 2 个分支节点
    await expect(page.locator('g.node--branch')).toHaveCount(2, { timeout: 15000 })

    // 2. 双击 b1 → 面包屑含标题、视图含 2 个单元
    await page.locator('g.node[data-id="b1"]').dblclick()
    await expect(page.locator('#breadcrumb')).toContainText('分支一')
    await expect(page.locator('g.node--unit')).toHaveCount(2)

    // 双击 u1 → 3 个叶子
    await page.locator('g.node[data-id="u1"]').dblclick()
    await expect(page.locator('g.node--leaf')).toHaveCount(3)

    // 3. 点亮一个 available 叶子 → lit + XP=2
    await page.locator('g.node--leaf.node--available').first().click()
    await expect(page.locator('g.node--leaf.node--lit')).toHaveCount(1)
    await expect(page.locator('#sidebar')).toContainText('XP 2')

    // 4. 重载后状态保持（localStorage 持久化）
    await page.reload()
    await expect(page.locator('g.node--branch')).toHaveCount(2, { timeout: 15000 })
    await page.locator('g.node[data-id="b1"]').dblclick()
    await page.locator('g.node[data-id="u1"]').dblclick()
    await expect(page.locator('g.node--leaf.node--lit')).toHaveCount(1)
    await expect(page.locator('#sidebar')).toContainText('XP 2')
  })
})

test.describe('cs-math 真实包冒烟', () => {
  test('根视图 11 学科 + 数学分支含 3 lane + 单元规模断言', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('litree:pack-override')
    })
    await page.goto('/')
    await expect(page.locator('g.node--branch')).toHaveCount(11, { timeout: 30000 })

    // 数学 M → M1/M2/M3 三条 lane
    await page.locator('g.node[data-id="M"]').dblclick()
    await expect(page.locator('g.node--branch')).toHaveCount(3)
    await page.locator('g.node[data-id="M1"]').dblclick()
    // M1 lane 的单元数（宽松下限）
    await expect(page.locator('g.node--unit').first()).toBeVisible({ timeout: 20000 })
    const unitCount = await page.locator('g.node--unit').count()
    expect(unitCount).toBeGreaterThanOrEqual(10)
    // 至少一个可用单元可进入点亮
    expect(await page.locator('g.node--unit.node--available').count()).toBeGreaterThanOrEqual(1)
  })
})

test.describe('终审修复回归', () => {
  test('F5: 点亮不重置缩放平移', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('litree:pack-override', 'dev-mini'))
    await page.goto('/')
    await expect(page.locator('g.node--branch')).toHaveCount(2, { timeout: 15000 })
    await page.locator('g.node[data-id="b1"]').dblclick()
    await page.locator('g.node[data-id="u1"]').dblclick()
    await expect(page.locator('g.node--leaf')).toHaveCount(3)
    const vp = page.locator('.viewport')
    const before = await vp.getAttribute('transform')
    await page.mouse.wheel(0, -240)
    await page.waitForTimeout(150)
    const zoomed = await vp.getAttribute('transform')
    expect(zoomed).not.toBe(before)
    await page.locator('g.node--leaf.node--available').first().click()
    await page.waitForTimeout(400)
    expect(await vp.getAttribute('transform')).toBe(zoomed)
  })

  test('F3: 孤立进度提示与一键清理', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('litree:pack-override', 'dev-mini')
      // 仅首次播种（addInitScript 在每次导航都会执行，reload 不能重新覆盖清理结果）
      if (localStorage.getItem('litree:e2e-seeded')) return
      localStorage.setItem('litree:e2e-seeded', '1')
      localStorage.setItem(
        'litree:progress:dev-mini',
        JSON.stringify({
          packId: 'dev-mini',
          lit: { ghost: { at: '2026-11-08T00:00:00Z' } },
          learning: {},
          xp: 2,
          history: [{ id: 'ghost', at: '2026-11-08T00:00:00Z', xp: 2 }]
        })
      )
    })
    await page.goto('/')
    await expect(page.locator('g.node--branch')).toHaveCount(2, { timeout: 15000 })
    await expect(page.locator('#sidebar')).toContainText('孤立')
    await page.locator('#orphan-clean').click()
    await expect(page.locator('#sidebar')).not.toContainText('孤立')
    await page.reload()
    await expect(page.locator('g.node--branch')).toHaveCount(2, { timeout: 15000 })
    await expect(page.locator('#sidebar')).not.toContainText('孤立') // 清理已持久化
  })

  test('F2: 数据包加载失败呈现错误面板而非白屏', async ({ page }) => {
    await page.route('**/packs/index.json', (route) => route.fulfill({ status: 404, body: 'gone' }))
    await page.goto('/')
    await expect(page.locator('#boot-error')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#boot-error')).toContainText('加载失败')
  })
})

test.describe('v2 路由', () => {
  test('hash 路由：刷新恢复位置 + 返回键回退', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('g.node--branch')).toHaveCount(11, { timeout: 30000 })
    await page.locator('g.node[data-id="M"]').dblclick()
    await expect(page.locator('#breadcrumb')).toContainText('数学基础与方法')
    expect(await page.evaluate(() => location.hash)).toBe('#/tree/root/M')

    await page.reload()
    await expect(page.locator('#breadcrumb')).toContainText('数学基础与方法', { timeout: 30000 })

    await page.goBack()
    await page.playwright?.waitForTimeout?.(0) // no-op 兼容
    await expect(page.locator('#breadcrumb')).toContainText('计算机 + 数学', { timeout: 10000 })
    expect(await page.evaluate(() => location.hash)).toBe('#/home')
  })
})
