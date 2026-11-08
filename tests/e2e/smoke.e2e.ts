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
