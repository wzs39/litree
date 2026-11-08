# LitTree · 点亮之树

学科科技树：把一门学科建模为**带前置依赖的分层知识图谱**，学习者在其中**点亮**知识点记录掌握进度——兼具游戏科技树的解锁感与学术引用链的可溯源性（每条前置边可附证据）。

**在线使用**：<https://overthinknow.github.io/litree/>（GitHub Pages，纯静态、数据本地存储）

## 特性

- **嵌套钻取**：学科 → 分支 → 单元 → 知识点，四层森林结构，双击逐层进入
- **硬门控点亮**：必须前置未全部点亮时单元锁定，卡片直接显示"还差 N 步 · 缺 X"
- **DetailPanel**：摘要、中英学习资源（含费用/语言标）、练习、前置依据、前置链/后继、确认点亮、个人笔记
- **路线首页**：推荐学习路线卡片 + "继续学习"直达上次位置 + 按领域浏览全包
- **知识清单视图**：单元内章节分组 + 知识点芯片网格（叶子是清单，不是 DAG）
- **点亮仪式**：级联解锁动画、光尘粒子沿边飘向下游、XP 与统计面板
- **纯静态**：无账号无后端；进度存 localStorage，hash 路由支持刷新/返回键/分享链接（`?node=` 恢复选中）

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

## 数据包格式（litree/pack-v1）

一个数据包是一个 JSON：`nodes`（`parent` 森林 + `kind: branch|unit|leaf`）、`edges`（`hard` 必须前置 AND 门控 / `soft` 推荐前置，均需 `reason`）、`domains`（领域色）、`routes`（推荐路线）。**点亮判定只在叶子层**；容器状态由后代聚合（空容器不虚亮）。校验：id 唯一、parent 链无环、边端点存在且限 unit 层、hard+soft 合并无环、资源 URL 仅 http(s)。

完整 schema 见 [docs/superpowers/specs/2026-11-08-litree-design.md](docs/superpowers/specs/2026-11-08-litree-design.md) §4。进度与内容分离存储（`litree:progress:<packId>`），可导出 JSON 备份。

## 自制学科数据包

1. 复制 `resources/packs/dev-mini.json` 作为骨架
2. 按上述 schema 填充节点/边（节点 id 建议带层级前缀，如 `M.1.1`）
3. 放入 `resources/packs/` 并在 `resources/packs/index.json` 注册
4. `npm run dev` 首页即可切换

## 技术栈

Electron 方案已弃用（v2 起纯 Web）。Vite + TypeScript(strict) + SVG/Canvas 渲染 + [elkjs](https://github.com/kieler/elkjs)（Worker 内分层布局）+ vitest + Playwright。无 UI 框架。

## Roadmap

- [ ] M3：全功能可视化编辑器（增删节点/连线、环校验、数据包导入导出）
- [ ] M4：minimap、全局搜索、领域筛选、设置
- [ ] 第二学科包（候选：从 metacademy 依赖图骨架转换 AI/ML）

## License

MIT。内置数据包内容源自 [cs-math-skill-tree](https://github.com/zeroa234/cs-math-skill-tree)（MIT），布局引擎 [elkjs](https://github.com/kieler/elkjs)（EPL-2.0）。
