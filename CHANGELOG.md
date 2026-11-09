# Changelog

## Unreleased (2026-11-09)

本轮针对用户反馈的「操作复杂、功能不全、动画僵硬」做系统性修复。写法统一为 **根因 → 修法 → 证据**。

验证基线：`npm run typecheck` 0 error、`npm test` vitest **104 passed**、`npm run build` 0；e2e `smoke` **9/9**、`features` 全绿、`render-kernel` DOM 复用 **0.00%**。

### 一、动画僵硬 · 渲染内核重写

**`graphCanvas.ts` 全量重建打断动画**
- 根因：每次状态更新走 `innerHTML` 全量重建，一次点亮使 `g.node` 元素引用 **100%** 被替换，CSS 动画每帧从头开始。
- 修法：改为 keyed 增量 DOM 同步，按 key 复用节点元素，只更新变更属性。
- 证据：一次点亮被替换的 `g.node` 从 100% 降到 **0.00%**（DOM 元素引用保持不变），`tests/e2e/render-kernel.e2e.ts` 硬指标。

**`view/viewport.ts` 视口变换瞬时跳变**
- 根因：缩放/平移一步到位，无锚点、无惯性，拖拽位移易误触 click。
- 修法：新增 `view/viewport.ts`，rAF 指数补间、光标锚定缩放（clamp **0.15~4**）、拖拽惯性、位移 **>4px** 抑制误触 click。
- 证据：`features` e2e 工具栏缩放/拖拽全绿；4px 门控生效，`104 passed` 单测基线不回归。

**`effects.ts` 粒子坐标系与飞行路径**
- 根因：粒子用 world 坐标直接画到 screen canvas，直线飞、线性缓动，与边不对齐。
- 修法：world→screen 变换、粒子沿贝塞尔边飞、easeOutQuint 缓动 + `lighter` 加色混合、`setTransform` 注入。
- 证据：坐标系偏差 **1.12px < 8px** 阈值；点亮仪式不再出现粒子与边错位。

**`layout/elk.ts` 每次布局新建 Worker**
- 根因：每个布局请求都创建 ELK Worker，反复初始化开销大且失败后不可恢复。
- 修法：ELKApi/Worker 改为模块级惰性单例，失败可重试。
- 证据：`tests/layout/elk.test.ts` 覆盖；单次会话内 **1** 个 Worker 复用，`104 passed` 保持。

**`styles/graph.css` infinite 动画为 CPU 重项**
- 根因：`filter: drop-shadow` 的 infinite 呼吸/脉冲动画持续触发重绘。
- 修法：删除 infinite 动画，改静态发光 + 一次性 bloom（`transform: scale`）；补 `prefers-reduced-motion` 降级；删除 `#inspector` 死 CSS。
- 证据：`render-kernel` e2e **0.00%** DOM 复用率，动画不再被重建打断。

### 二、操作复杂 · 交互补全

**顶部工具栏**
- 根因：缩放、返回、搜索、包切换、导入导出、帮助入口分散，操作链路长。
- 修法：新增顶部工具栏，聚合缩放 ± / 适配 / 重置、返回、搜索、包切换、导入导出、帮助。
- 证据：`features` e2e 工具栏用例全绿，`smoke 9/9` 不回归。

**全局搜索**
- 根因：**20000+** 节点无索引、无快捷入口，找知识点靠逐层钻取。
- 修法：`Ctrl+K` / `/` 唤起，三档打分 + 20000+ 节点索引，结果带层级路径直达。
- 证据：`features` e2e 搜索用例全绿，索引覆盖全部已注册数据包节点。

**minimap**
- 根因：大图缩放后缺少全局方位参照。
- 修法：新增缩略图 + 视口框，支持拖拽、点击、滚轮交互。
- 证据：`features` e2e minimap 用例全绿；Roadmap M4 该项勾选 `- [x]`。

**hover 依赖链高亮**
- 根因：前置链与缺失前置在图上不可见。
- 修法：`.edge.in-path` / `.edge.missing-prereq` **2** 类高亮 + SVG z-order 把边提到上层。
- 证据：`features` e2e hover 用例全绿。

**误触反馈与鼠标语义**
- 根因：click/dblclick 语义混用、locked 节点误触无反馈、窗口缩放后视图不重适配、左右键不区分。
- 修法：locked 误触抖动（`node--denied`）+ 按下态、帮助面板 + 首次引导、click 选中与 dblclick 钻取分离、`window resize` 重新 fit、mousedown 区分左右键。
- 证据：`features` e2e 误触套件全绿；位移 **>4px** 抑制误触 click。

### 三、功能补全与性能

**`pathTrace` 链式点亮**
- 根因：门控只提示「还差 N 步」，不给可达路径；拓扑排序有误。
- 修法：PoB 式链式点亮，把「还差 N 步」变成「按顺序点下去」，每步重新校验 `leafAvailable` 门控；修复拓扑排序。
- 证据：`tests/view/pathTrace.test.ts` **14 个单测**，vitest 合计 **104 passed**。

**学科包切换 / 进度导出导入 / stub 徽章**
- 根因：`listPacks` 之前无人调用、README 承诺的进度导出导入代码不存在、`stub-click` 永不派发。
- 修法：工具栏与首页接入 `listPacks` 切换；实现进度 JSON 导出/导入；跨视图 stub 徽章点击真正派发跳转。
- 证据：`features` e2e 包切换 / 导入导出 / 跨视图用例全绿，`smoke 9/9` 保持。

**`schema.ts` 保留 edge `reason`**
- 根因：`validatePack` 丢弃 `reason`，**660 条边 100%** 携带 reason 但 UI 看不到前置依据。
- 修法：校验后保留 `reason` 字段并透传到 DetailPanel 前置依据。
- 证据：660 条边 **100%** 保留 reason；`tests/core/schema.test.ts` 覆盖。

**统计与快照收敛**
- 根因：`homeView.ts` 在 `domains.map` 内重复全量重算 `domainStats`；`lightWithCeremony` 的 `before` 快照遍历全量 **9793** 节点；`core/graph.ts` 关系查询无缓存。
- 修法：`domainStats` 提到循环外一次计算；`before` 快照收敛到 `hardDependentsOf` 可达子集；`childrenOf` / `leavesOf` / `unitsOf` 与边关系 memo 化 + 统计计数器。
- 证据：单次点亮快照从 9793 节点降到可达子集；`tests/core/stats.test.ts` 与 `tests/core/graph.test.ts` 纳入 **104 passed**。

**死代码清理**
- 根因：`nodeIdFromEvent`、`nodeRectOf`、`RenderOptions.onStubClick` 无调用点。
- 修法：删除 **3** 处死代码。
- 证据：`npm run typecheck` **0 error**，`npm run build` **0**，引用链无残留。
