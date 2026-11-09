import { expect, test } from '@playwright/test'

/**
 * D 队友交付的 8 个自包含 UI 组件的 id/class 契约断言（e2e）。
 *
 * 状态：组件已全部由 lead 接线到 main.ts，本文件 8 条断言现在应当全部通过。
 * 这些断言锁死组件对外暴露的 id/class 契约，后续重构不得随意改名。
 *
 * 契约来源（逐字抄自各组件文件顶部的常量表，勿改）：
 * - toolbar.ts        → TOOLBAR_IDS：root 'toolbar' / search 'toolbar-search' /
 *                       pack 'toolbar-pack' / export 'toolbar-export' / import 'toolbar-import' /
 *                       help 'toolbar-help' / zoomIn 'zoom-in' / zoomOut 'zoom-out' /
 *                       zoomFit 'zoom-fit' / zoomReset 'zoom-reset' / back 'nav-back' /
 *                       crumbSlot 'toolbar-crumb-slot'
 * - search.ts         → SEARCH_SELECTORS：overlay 'search-overlay' / input 'search-input' /
 *                       itemClass 'search-item' / results 'search-results' / empty 'search-empty'
 * - minimap.ts        → MINIMAP_IDS：root 'minimap' / viewport 'minimap-viewport'
 * - packSwitcher.ts   → PACK_SWITCHER_IDS：root 'pack-switcher' / optionClass 'pack-option'
 * - ioProgress.ts     → IO_PROGRESS_IDS：exportButton 'export-progress' /
 *                       importButton 'import-progress' / fileInput 'import-file'
 * - helpOverlay.ts    → HELP_IDS：overlay 'help-overlay'
 * - highlightPath.ts  → applyHighlight/clearHighlight + `.edge.in-path` / `.edge.missing-prereq` /
 *                       `.node.in-path`
 * - pathTrace.ts      → `#path-trace` / `.trace-step` / `#trace-light-all` / `#trace-progress`
 *
 * 确定性：全部用 dev-mini 包（localStorage 'litree:pack-override'），cs-math 仅用于真实规模断言。
 */

/** 工具栏上需要「可见」的按钮 id（TOOLBAR_IDS 除 crumbSlot 外的全部） */
const TOOLBAR_BUTTON_IDS = [
  'toolbar-search',
  'toolbar-pack',
  'toolbar-export',
  'toolbar-import',
  'toolbar-help',
  'zoom-in',
  'zoom-out',
  'zoom-fit',
  'zoom-reset',
  'nav-back'
] as const

test.describe('D 组件 UI 契约', () => {
  // 固定加载 dev-mini：真实包默认在前，dev-mini 需 override（与 smoke.e2e.ts 同口径）
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('litree:pack-override', 'dev-mini')
    })
  })

  test('工具栏契约：#toolbar 可见，含 10 个按钮 id + 面包屑插槽 #toolbar-crumb-slot', async ({ page }) => {
    // 用户诉求：顶部有统一工具栏，能缩放 / 返回 / 搜索 / 切包 / 导入导出 / 帮助
    await page.goto('/')
    await expect(page.locator('#home-root')).toBeVisible({ timeout: 15000 })

    await expect(page.locator('#toolbar')).toBeVisible({ timeout: 15000 })
    for (const id of TOOLBAR_BUTTON_IDS) {
      await expect(page.locator(`#${id}`)).toBeVisible()
    }
    // 面包屑插槽是 div，可能为空，只断言存在
    await expect(page.locator('#toolbar-crumb-slot')).toHaveCount(1)
  })

  test('搜索面板契约：Ctrl+K 打开 #search-overlay，#search-input 可见，输入关键词后 .search-item 出现', async ({ page }) => {
    // 用户诉求：Ctrl+K 或 / 唤起全局搜索，输入即出结果
    await page.goto('/')
    await expect(page.locator('#home-root')).toBeVisible({ timeout: 15000 })

    await page.keyboard.press('Control+k')
    await expect(page.locator('#search-overlay')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#search-input')).toBeVisible()

    await page.locator('#search-input').fill('单元')
    await expect(page.locator('.search-item').first()).toBeVisible({ timeout: 10000 })
    expect(await page.locator('.search-item').count()).toBeGreaterThan(0)
  })

  test('minimap 契约：#minimap 可见，#minimap-viewport 存在', async ({ page }) => {
    // 用户诉求：右下角缩略图显示整图与当前视口框
    await page.goto('/')
    await expect(page.locator('#home-root')).toBeVisible({ timeout: 15000 })

    await expect(page.locator('#minimap')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#minimap-viewport')).toHaveCount(1)
  })

  test('包切换契约：点 #toolbar-pack 打开 #pack-switcher，含 .pack-option', async ({ page }) => {
    // 用户诉求：点「学科包」弹出选择层，列出可切换的包
    await page.goto('/')
    await expect(page.locator('#home-root')).toBeVisible({ timeout: 15000 })

    await page.locator('#toolbar-pack').click()
    await expect(page.locator('#pack-switcher')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.pack-option').first()).toBeVisible()
    expect(await page.locator('.pack-option').count()).toBeGreaterThan(0)
  })

  test('导入导出契约：#toolbar-export/#toolbar-import 可点，ioProgress 的 #export-progress/#import-progress/#import-file 存在', async ({ page }) => {
    // 用户诉求：能把进度导出为 JSON，也能从 JSON 导入
    await page.goto('/')
    await expect(page.locator('#home-root')).toBeVisible({ timeout: 15000 })

    await expect(page.locator('#toolbar-export')).toBeVisible()
    await expect(page.locator('#toolbar-import')).toBeVisible()
    await expect(page.locator('#toolbar-export')).toBeEnabled()
    await expect(page.locator('#toolbar-import')).toBeEnabled()

    // ioProgress 组件自身的 id 契约（按钮 + 隐藏文件选择 input）
    await expect(page.locator('#export-progress')).toBeVisible()
    await expect(page.locator('#import-progress')).toBeVisible()
    await expect(page.locator('#import-file')).toHaveCount(1)
  })

  test('hover 高亮契约：悬停 locked 单元 u2，其前置边出现 .edge.missing-prereq，移开后消失', async ({ page }) => {
    // 用户诉求：悬停锁定单元时，前置链高亮，能看出「为什么锁着」
    await page.goto('/')
    await expect(page.locator('#home-root')).toBeVisible({ timeout: 15000 })
    await page.locator('#hm-subjects').click()
    await expect(page.locator('g.node--branch')).toHaveCount(2, { timeout: 15000 })
    await page.locator('g.node[data-id="b1"]').dblclick()
    await expect(page.locator('g.node--unit')).toHaveCount(2, { timeout: 15000 })

    // dev-mini：u1 → u2 是 hard 前置边；u2 锁定（u1 未点亮）
    const prereqEdge = page.locator(
      '#graph path.edge.edge--hard[data-from="u1"][data-to="u2"]'
    )
    await expect(prereqEdge).toHaveCount(1)

    await page.locator('g.node[data-id="u2"]').hover()
    await expect(prereqEdge).toHaveClass(/missing-prereq/)

    await page.mouse.move(0, 0)
    await expect(prereqEdge).not.toHaveClass(/missing-prereq/)
  })

  test('误触反馈契约：点 locked 单元 u2 → .node--denied 出现后消失（shake）', async ({ page }) => {
    // 用户诉求：误点锁定单元时有 shake 反馈，而不是静默无反应
    await page.goto('/')
    await expect(page.locator('#home-root')).toBeVisible({ timeout: 15000 })
    await page.locator('#hm-subjects').click()
    await expect(page.locator('g.node--branch')).toHaveCount(2, { timeout: 15000 })
    await page.locator('g.node[data-id="b1"]').dblclick()
    await expect(page.locator('g.node--unit')).toHaveCount(2, { timeout: 15000 })

    await page.locator('g.node[data-id="u2"]').click()
    await expect(page.locator('g.node[data-id="u2"].node--denied')).toHaveCount(1, { timeout: 5000 })
    await expect(page.locator('g.node[data-id="u2"].node--denied')).toHaveCount(0, { timeout: 5000 })
  })

  test('pathTrace 契约：打开 locked 单元 u2 的 detailPanel → #path-trace 可见，含 .trace-step', async ({ page }) => {
    // 用户诉求：锁定单元的详情里给出「按顺序点下去」的点亮路径
    await page.goto('/')
    await expect(page.locator('#home-root')).toBeVisible({ timeout: 15000 })
    await page.locator('#hm-subjects').click()
    await expect(page.locator('g.node--branch')).toHaveCount(2, { timeout: 15000 })
    await page.locator('g.node[data-id="b1"]').dblclick()
    await expect(page.locator('g.node--unit')).toHaveCount(2, { timeout: 15000 })

    await page.locator('g.node[data-id="u2"]').click()
    await expect(page.locator('#detail-panel')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#path-trace')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.trace-step').first()).toBeVisible()
    expect(await page.locator('.trace-step').count()).toBeGreaterThan(0)
  })
})
