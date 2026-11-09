# LitTree · 点亮之树

学科科技树：把一门学科建模为**带前置依赖的分层知识图谱**，学习者在其中**点亮**知识点记录掌握进度——兼具游戏科技树的解锁感与学术引用链的可溯源性（每条前置边可附证据）。

**在线使用**：<https://wzs39.github.io/litree/>（GitHub Pages，纯静态、数据本地存储）

## 特性

- **嵌套钻取**：学科 → 分支 → 单元 → 知识点，四层森林结构，双击逐层进入
- **硬门控点亮**：必须前置未全部点亮时单元锁定，卡片直接显示"还差 N 步 · 缺 X"
- **DetailPanel**：摘要、中英学习资源（含费用/语言标）、练习、前置依据、前置链/后继、确认点亮、个人笔记
- **路线首页**：推荐学习路线卡片 + "继续学习"直达上次位置 + 按领域浏览全包
- **知识清单视图**：单元内章节分组 + 知识点芯片网格（叶子是清单，不是 DAG）
- **点亮仪式**：级联解锁动画；光尘粒子沿贝塞尔边飞向下游（world→screen 坐标系已修正，偏差 1.12px < 8px）、easeOutQuint 缓动 + `lighter` 加色混合、一次性 bloom（`transform: scale`）；keyed 增量 DOM 同步保证 CSS 动画不再被打断；XP 与统计面板
- **纯静态**：无账号无后端；进度存 localStorage，hash 路由支持刷新/返回键/分享链接（`?node=` 恢复选中）
- **顶部工具栏**：缩放 ± / 适配 / 重置、返回、搜索、包切换、导入导出、帮助一屏可达
- **全局搜索**：`Ctrl+K` 或 `/` 唤起，三档打分 + 20000+ 节点索引，结果带层级路径可直达
- **minimap**：缩略图 + 视口框，支持拖拽、点击、滚轮平移缩放
- **依赖链高亮**：hover 时 `.edge.in-path` / `.edge.missing-prereq` 标出前置链与缺失前置，SVG z-order 保证边在上层
- **链式点亮（pathTrace）**：PoB 式按拓扑顺序逐步点亮，把「还差 N 步」变成「按顺序点下去」，每步重新校验 `leafAvailable` 门控
- **学科包切换**：调用 `listPacks`，首页/工具栏直接切换已注册的数据包
- **进度导出/导入**：进度与内容分离存储，导出 JSON 备份、导入还原
- **跨视图 stub 徽章**：点击可跳转对应视图（`stub-click` 已真正派发）
- **键盘与鼠标**：`Ctrl+K` / `/` 搜索；click 选中与 dblclick 钻取语义分离，拖拽位移 >4px 抑制误触 click；locked 节点误触抖动（`node--denied`）、按下态、帮助面板与首次引导；`window resize` 重新 fit，mousedown 区分左右键

内置数据包：**计算机 + 数学**（192 学习单元、260 条必须前置、400 条推荐前置、8112 个知识点、6 条推荐路线——每条前置边附课程证据，源自 [cs-math-skill-tree](https://github.com/zeroa234/cs-math-skill-tree)，MIT）

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
```

其他命令：

```bash
npm run build          # 构建到 dist/（纯静态，任意静态服务器可托管）
npm run typecheck      # tsc --noEmit 门禁
npm test               # vitest 单测
npm run test:e2e       # Playwright e2e 冒烟
npm run convert:csmath -- <上游output目录> <输出.json> [--force]
                       # 从上游 cs-math-skill-tree 重建数据包（有差异需 --force 确认）
```

## 开发

提交前跑三道门禁（本轮基线：typecheck 0 / vitest 104 passed / build 0）：

```bash
npm run typecheck   # tsc --noEmit：0 error 才算过
npm test            # vitest run：单测全绿（当前 104 passed）
npm run test:e2e    # Playwright：针对 dist 预览产物跑 e2e
```

- `npm run test:e2e` 会先 `npm run build` 再 `vite preview`（`playwright.config.ts` 的 `webServer` 配置，端口 5177），验证的是用户实际拿到的 `dist/`，不是 dev server。
- 本轮新增 `tests/view/`：视口与路径逻辑单测（`pathTrace` 拓扑排序 + `leafAvailable` 门控，14 个单测；`domStub.ts` 提供 DOM 夹具）。
- 本轮新增 `tests/e2e/render-kernel.e2e.ts`：**渲染内核硬指标**——一次点亮后被替换的 `g.node` 占比必须为 **0.00%**（keyed 增量 DOM 同步保持元素引用不变，CSS 动画不中断）。另有 `smoke`（9/9）与 `features`（工具栏 / 搜索 / minimap / 包切换 / 导入导出 / hover 依赖链 / 误触抖动）套件。
- e2e 基线：`smoke 9/9`、`features` 全绿、`render-kernel` DOM 复用 0.00%。

## 数据包格式（litree/pack-v1）

一个数据包是一个 JSON：`nodes`（`parent` 森林 + `kind: branch|unit|leaf`）、`edges`（`hard` 必须前置 AND 门控 / `soft` 推荐前置，均需 `reason`）、`domains`（领域色）、`routes`（推荐路线）。**点亮判定只在叶子层**；容器状态由后代聚合（空容器不虚亮）。校验：id 唯一、parent 链无环、边端点存在且限 unit 层、hard+soft 合并无环、资源 URL 仅 http(s)。

完整 schema 见 [docs/superpowers/specs/2026-11-08-litree-design.md](docs/superpowers/specs/2026-11-08-litree-design.md) §4。进度与内容分离存储（`litree:progress:<packId>`），可导出 JSON 备份。

## 自制学科数据包

1. 复制 `resources/packs/dev-mini.json` 作为骨架
2. 按上述 schema 填充节点/边（节点 id 建议带层级前缀，如 `M.1.1`）
3. 放入 `resources/packs/` 并在 `resources/packs/index.json` 注册
4. `npm run dev` 首页即可切换

## 技术栈

Electron 方案已弃用（v2 起纯 Web）。Vite + TypeScript(strict) + SVG/Canvas 渲染 + [elkjs](https://github.com/kieler/elkjs)（Worker 内分层布局）+ vitest + Playwright。无 UI 框架。渲染内核采用 keyed 增量 DOM 同步（不再 `innerHTML` 全量重建）+ `view/viewport.ts` 的 rAF 指数补间视口（光标锚定缩放 clamp 0.15~4、拖拽惯性）+ Canvas 粒子世界/屏幕坐标系修正（world→screen，沿贝塞尔边飞行）。ELKApi/Worker 为模块级惰性单例，失败可重试。

## Roadmap

- [ ] M3：全功能可视化编辑器（增删节点/连线、环校验、数据包导入导出）
- [x] M4：minimap（缩略图 + 视口框 + 拖拽/点击/滚轮）
- [x] M4：全局搜索（`Ctrl+K` / `/`，三档打分 + 层级路径）
- [ ] M4：领域筛选、设置
- [ ] 第二学科包（候选：从 metacademy 依赖图骨架转换 AI/ML）

## License

MIT。内置数据包内容源自 [cs-math-skill-tree](https://github.com/zeroa234/cs-math-skill-tree)（MIT），布局引擎 [elkjs](https://github.com/kieler/elkjs)（EPL-2.0）。
