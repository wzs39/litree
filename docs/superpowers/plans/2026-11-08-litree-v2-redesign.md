# LitTree v2 体验重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复实测体验缺陷：DetailPanel 内容展示、路线首页、层级压缩、路由与交互修复、视觉修正——core 层不动。

**Architecture:** core/*（保留）+ view 层重写（home 视图 DOM 化、DetailPanel、章分组扁平化）+ main.ts 重构为路由驱动（viewStack ↔ hash 双向）。

**Tech Stack:** 不变（Vite + TS + elkjs + vitest + Playwright）。

**Spec:** docs/superpowers/specs/2026-11-08-litree-v2-redesign.md
**诊断依据:** 实测走查记录（会话内）+ docs/research/2026-11-08-similar-solutions-study.md

## Global Constraints

- core/*、既有 67 单测不破坏（progress/graph/schema 语义不变；schema 只增 routes 可选字段）
- 标题禁止 slice 截断；进度环数字不得溢出卡片 bounding box
- 点亮必须经 DetailPanel 确认；画布每锚点 stub ≤ 1（聚合）
- 浏览器返回键 = 视图回退；刷新恢复视图位置
- e2e 关键路径全部用 cs-math 真实包；交付时 dev server 保持运行

---

### Task V2-1: routes 数据 + schema 扩展

**Files:** Modify `scripts/convert-csmath.mjs`、`src/renderer/core/types.ts`（Pack.routes?）、`src/renderer/core/schema.ts`、`resources/packs/dev-mini.json`、`tests/scripts/convert.test.ts`、`tests/core/schema.test.ts`

**Interfaces:**
- Produces: `Pack.routes?: { name: string; note?: string; ids: string[] }[]`；schema 校验 routes ids 存在且为 unit；dev-mini 含 2 条演示路线

- [ ] 写失败测试：converter fixture 加 routes 输入 → pack.routes 输出且 ids 全部有效；schema 拒绝 routes 引用不存在的 id
- [ ] RED→GREEN（实现 routes 转换 + 校验）
- [ ] 真实数据重转（routes 6 条对账）；dev-mini 手写 2 条
- [ ] 全量测试 + commit `feat: routes 数据与 schema 扩展`

### Task V2-2: hash 路由（viewStack ↔ URL）

**Files:** Modify `src/renderer/main.ts`（或抽 `src/renderer/router.ts`）、`tests/core/router.test.ts`

**Interfaces:**
- Produces（core/router.ts 纯逻辑）:
```ts
export function stackToHash(stack: string[]): string   // ['root'] → '#/home'；否则 '#/tree/root/M/M1'
export function hashToStack(hash: string, index: GraphIndex): { stack: string[]; valid: boolean }  // 校验链上每级 parent 关系
export function attachRouter(store: AppStore): () => void  // hashchange → store.jumpTo/enter；store.subscribe → replaceState
```

- [ ] 写失败测试：往返转换、非法 hash（断链）回退 home、parent 链校验
- [ ] RED→GREEN 实现 + main.ts 接线（popstate/hashchange 监听；视图变化 replaceState）
- [ ] e2e（cs-math）：进入 M1 → 页面 reload → 面包屑仍为 M1；browser back → 回到 数学 视图
- [ ] commit `feat: hash 路由与位置恢复`

### Task V2-3: DetailPanel

**Files:** Create `src/renderer/view/detailPanel.ts`；Modify `main.ts`（停用旧 inspector、单击接线）、`styles/graph.css`

**Interfaces:**
- Produces:
```ts
export function renderDetailPanel(el: HTMLElement, store: AppStore, nodeId: string | null): void
// 全字段渲染 + 动作区（点亮确认/进入/批量点亮/跳转依赖）；无节点时隐藏
```

- [ ] 写失败测试（store 级）：无独立纯逻辑——以 e2e 断言为主；单测仅 detailPanel 需要的纯函数（若抽 closure 格式化函数）
- [ ] 实现：面板 320px 右滑、全字段、确认点亮（调用 store.lightLeaf + Ceremony）、locked 显示"还差 N 步·缺 X"、跨视图依赖点击跳转
- [ ] main.ts：单击节点 → renderDetailPanel；双击容器 → enter；移除旧 inspector/路径高亮接线（高亮并入面板 hover）
- [ ] e2e（cs-math）：点击 M.1.1 → 面板含 resources 链接数 ≥1 与 exercises；点击 available 叶子 → 面板「点亮」→ lit；locked 单元面板含"还差"
- [ ] commit `feat: DetailPanel 内容展示与确认点亮`

### Task V2-4: 路线首页

**Files:** Create `src/renderer/view/homeView.ts`；Modify `main.ts`（#/home 渲染分支）、`styles/graph.css`

**Interfaces:**
- Produces:
```ts
export function renderHome(el: HTMLElement, store: AppStore, onOpenRoute: (ids: string[]) => void): void
// 总进度 + XP + 继续学习 + 路线卡片（点亮状态标记 + 路线进度）
export function continueTarget(store: AppStore): { unitId: string; routeIndex: number } | null  // 纯函数可单测
```

- [ ] 写失败测试（core/home.ts 纯函数）：continueTarget——有 history 时返回最近点亮节点的 unit；无 history 返回第一条路线第一个 available unit
- [ ] RED→GREEN + homeView DOM 实现（领域色/路线进度条/单元状态点）
- [ ] e2e：#/home 显示 6 条路线；点击路线进入 lane 视图；「继续学习」跳到目标 unit 视图
- [ ] commit `feat: 路线首页与继续学习`

### Task V2-5: 章分组扁平化 + locked 引导

**Files:** Modify `src/renderer/view/graphCanvas.ts`、`src/renderer/layout/elk.ts`（unit 视图布局）、`main.ts`

**Interfaces:**
- Produces: unit 视图布局 = 章标题条（kind=branch 渲染为 section 条，非交互）+ 叶子直挂参与 elk 分层；locked unit 卡渲染「🔒 还差 N 步 · 缺 X」

- [ ] 写失败测试（layout）：unit 视图 layoutSubview 返回章条+全部叶子（含分组叶与直挂叶混合）
- [ ] RED→GREEN：layoutSubview 对 unit 容器特殊处理（children = [章条..., 直挂叶子]；章条高度 28 宽同卡）；renderGraph 章条渲染为非交互标题条
- [ ] locked 引导：renderGraph 对 locked unit 计算 closure（store 提供 `missingHint(id)`）渲染副标题行
- [ ] e2e：进入 M.1.1 → 叶子可见且章条存在；M1 lane locked 卡含"还差"
- [ ] commit `feat: 章分组扁平化与锁定引导`

### Task V2-6: 视觉修正

**Files:** Modify `graphCanvas.ts`、`styles/graph.css`、`layout/elk.ts`（elk 参数）

- [ ] 领域色条（卡顶 2px，取 domain color）；环内嵌（数字移卡底）；标题两行 tspan 自适应（禁 slice）
- [ ] stub 聚合：每锚点 ≤1 条「N 条外部依赖 »」→ 点击打开 DetailPanel 依赖区；elk 参数收紧 + NETWORK_SIMPLEX
- [ ] 人工走查（浏览器截图）：根视图/数学/M1/单元/叶子 五层截图核对溢出与截断
- [ ] commit `fix: 视觉修正（色条/环/标题/stub 聚合/elk 参数）`

### Task V2-7: 全量回归 + 真实体验走查 + 交付

- [ ] npm test 全绿 + playwright 全绿 + build EXIT=0
- [ ] 浏览器逐层实测（home/根/数学/M1/单元/叶子/点亮/返回键/刷新），对照诊断清单逐项销项
- [ ] 交付：**dev server 保持运行**，输出验收清单
- [ ] commit `chore: v2 回归与交付`

## Review Focus（v2 计划测试未覆盖、最易咬人的输入）

1. **hash 非法值**（手工改 URL `#/tree/root/M/M99`）→ 应回退 home 不崩溃 — pin: V2-2 测试
2. **history 空时的「继续学习」** → 不得抛错，回退第一条路线首个 available — pin: V2-3 测试
3. **routes ids 指向已删节点**（编辑器未来场景）→ schema 拒绝加载并提示 — pin: V2-1 测试
4. **章条与叶子混合布局的 elk 死循环/重叠** → 人工截图走查（V2-6）
5. **DetailPanel 打开时切换视图** → 面板内容跟随当前选中节点或清空，不得残留上一视图节点 — pin: V2-7 走查
