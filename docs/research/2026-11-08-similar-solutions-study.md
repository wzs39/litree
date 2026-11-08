# 同类方案深度调研报告

日期：2026-11-08 ｜ 范围：六个同类方案的实际实现（代码/schema/治理流程），非表面对比
用途：为 LitTree M3（编辑器）/ M4（打磨）提供经过验证的设计决策

## 0. 结论速览

| 方案 | 一句话定位 | LitTree 直接吸收 |
|---|---|---|
| **Metacademy**（687★，休眠） | citation 式学习依赖图鼻祖，487 概念/7,947 前置对 | 数据模型、学习时间估算、**其内容库可直接转换为我们的 AI/ML 学科包** |
| **aoe2techtree**（284★，活跃） | 游戏科技树 Web 渲染标杆 | hover 高亮的 SVG z-order 技巧、kind→颜色映射 |
| **PoB 被动树**（开源社区） | 点亮分配 UX 天花板 | path trace：闭包内可点亮节点支持链式点亮 |
| **roadmap.sh**（371k★） | 工业级渲染+进度 | React Flow 兼容 JSON 格式的生态价值 |
| **learning-tech-tree**（17★） | 通用 schema 参照 | `outcome`/`caution`/`milestone` 字段；进度与定义分离的 schema 级强制 |
| **cs-math-skill-tree**（29★） | 内容治理管线 | 编辑器写 curation 层不写产物；截图回归+a11y 审计的测试体系 |

## 1. Metacademy —— citation 式学习图的鼻祖

`metacademy/metacademy-application`（Django，master 分支）+ `metacademy/metacademy-content`（91★，纯内容库）。

**数据模型**（`server/apps/graph/models.py`）：
- `Concept` + `Dependency(source, target, reason:500字, ordering)` —— 与我们 `edges {from,to,type,reason}` 同构，**reason 是一等公民**
- `Goal`（用户学习目标）→ 每个 Goal 缓存一份**前置闭包子图**（pre_delete 钩子里 DFS 重建），我们的 Inspector 闭包计算与之同思路
- 进度：`uprof.learned`（已点亮概念集合）+ starred；API 返回 `{"concepts":[{"id","learned","starred"}]}` —— 进度=集合，与我们 lit map 一致

**学习时间估算**（`time_estimates.py`）：解析资源定位符（"pages 12-45" → 页数，"lecture sequence" → 5 讲）自动估算每概念学习时长。→ **可移植为我们 XP/估时的数据驱动基准**（resource.covers/pages → 估时）。

**⚠️ 高价值发现**：metacademy-content 就是现成的机器学习概念图（487 概念、7,947 前置对，学术界至今用作 prerequisite mining 的 ground truth）。**第二个学科数据包（AI/ML）可以直接从它转换**，走我们已有的 cs-math 转换管线模式。

## 2. aoe2techtree —— 游戏科技树 Web 渲染

`SiegeEngineers/aoe2techtree`（MIT，284★，2026-10 仍活跃）。纯静态（svg.min.js + data.json 965KB）。

**hover 高亮链**（`js/main.js:141-165`）：`highlightPath(caretId)` 沿 parent 连线加 `is-highlight` class；关键细节：**`line.front()` 把高亮线提到最上层**，否则其他未高亮线的绘制会覆盖高亮效果。我们的 `.in-path` 边高亮存在同样隐患（分层布局下边可能重叠），M4 走查时应采用同款 z-order 处理。

**其他模式**：TYPES 常量表（Building/Unit/UniqueUnit/Technology → 颜色）；文明差异 = 全局图上的 id 过滤列表（数据裁剪而非复制图）；多语言 = i18n key 间接引用（strings 表），文本全部走 key 查询。

## 3. Path of Building 被动树 —— 点亮 UX 的天花板

`PathOfBuildingCommunity/PathOfBuilding-PoE2`。核心交互（help.txt 路径追踪模式）：**高亮"通往目标节点的路径"→ 点击树上任意节点时，沿高亮路径批量分配**。

映射到 LitTree：Inspector 已计算最小前置闭包；下一步让**闭包内 available 的节点可一键点亮**（点亮它 → 自动重算闭包 → 依次点亮），把"还差 N 步"变成 N 次点击的引导路径，而不是 N 次手动寻找。M4 实现。

## 4. roadmap.sh —— 工业级渲染与进度

渲染体系（DeepWiki 文档 + 仓库）：路线图 = **React Flow 风格 nodes/edges JSON**（`renderer: editor` 时 `EditorRoadmap` 组件渲染交互式 SVG 画布），内容经 `generate:roadmap-content-json` 脚本同步生成。游客进度存 localStorage，登录后服务端。

对我们的启示：React Flow JSON 是**编辑器生态事实标准**（edit.roadmap.sh 可直接产出）。M3 编辑器设计 schema 时，字段命名向 React Flow 的 `{id, position, data}` 靠拢一处是小成本高回报的兼容性投资（不必兼容，命名相近即可降低用户的心智迁移成本）。

## 5. learning-tech-tree —— schema 对照

`BOB0731/learning-tech-tree` 的 `schema/tree.schema.json`（完整读出）：
- `kind: core | optional | milestone` —— **milestone（里程碑节点）**是我们没有的类型，适合做学科树的"BOSS 节点"（如"完成高考数学"）
- `outcome`（可观测的完成标准，minLength 1，强制非空）—— 每个节点必须回答"学会的标志是什么"；比我们的自由 `summary` 更能防内容注水
- `caution`（常见误区警告）字段
- **schema 级禁止**节点定义携带 `notes`/`completedOn` —— 进度与内容分离被写进 JSON Schema 硬约束；我们目前只靠约定，M3 应加同款校验
- 交叉引用完整性、stage 边界、整图无环、start/end 可达性由外部引擎（engine.cjs）强制 —— 与我们 validatePack + detectCycle 分层一致

## 6. cs-math-skill-tree —— 内容治理管线（M3 编辑器的直接蓝本）

`docs/maintenance.md` 全文读出。核心架构：**curation 层与产物层分离**——
```
data/curation/{partition,granularity,scope,prereqs,prereq-notes,learning-resources}.json
  │  node scripts/build.mjs（检查环、算步骤、ELK 布局、来源对账）
  ▼
output/skilltree.json（产物，禁止手改）
```
编辑器（M3）应写 curation 层；我们的 pack 副本机制等价，但他们在构建期做的**验证电池**值得全盘吸收：环检测、ID 写错、卡片重叠、来源对账、资源 HTTP 审计（`audit_resources.py`，明确注明"HTTP 200 ≠ 内容合适"）、导览图标题逐条核对、**跨语言学习路线覆盖验证**（`--require-all` 才能发布）。

**测试体系**（可直接抄的做法）：
- 截图回归：`playwright-core` + 系统 Edge 无头截图，**不下载浏览器**（我们已装 Chromium，但 Edge 方案对 CI 更轻）
- axe-core 按 WCAG 2.2 AA 审计 15 个界面状态 + 纯键盘主流程
- 发布打包脚本自动统计"前置待核实"个数进 README

## 7. 布局引擎选型确认

| 库 | 定位 | 适用 |
|---|---|---|
| dagre | 快、简、基本停更 | 快速原型 |
| **ELK**（我们在用） | 最强：端口/标签/约束/正交路由 | 复杂图 ✅ |
| d3-dag | Sugiyama 可调，含 **ILP 最优交叉最小化** | 对美观有极致要求时 |

维持 ELK；若 M4 对交叉线不满意，可试 d3-dag 的 `sugiyama()` + `topological()` 对比。

## 8. 落地清单（按优先级）

1. **M3 schema 增补**：`outcome`（强制）、`caution`、`kind: milestone`；schema 级禁止节点携带进度字段【来源 5】
2. **M3 编辑器**：写 curation/副本层 + 构建期验证电池【来源 6】；字段命名贴近 React Flow【来源 4】
3. **M4 点亮路径升级**：PoB 式 path trace——闭包内 available 节点链式点亮【来源 3】
4. **M4 走查**：hover 高亮边的 z-order（`line.front()` 等价处理）【来源 2】
5. **M4 XP 基准**：resource 定位符 → 估时启发式【来源 1】
6. **第二学科包**：metacademy-content → AI/ML pack 转换脚本（复用 T7 管线）【来源 1】
7. **测试体系**：axe a11y 审计纳入 M4；截图回归沿用现有 Playwright【来源 6】

## Sources

- [SiegeEngineers/aoe2techtree](https://github.com/SiegeEngineers/aoe2techtree) ｜ [aoe2techtree.net](https://aoe2techtree.net/?lng=en)
- [metacademy/metacademy-application](https://github.com/metacademy/metacademy-application) ｜ [metacademy/metacademy-content](https://github.com/metacademy/metacademy-content) ｜ [Metacademy 数据集在学术研究中的应用](https://www.semanticscholar.org/search?q=metacademy%20prerequisite)
- [PathOfBuildingCommunity/PathOfBuilding-PoE2](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2)
- [kamranahmedse/developer-roadmap](https://github.com/kamranahmedse/developer-roadmap) ｜ [DeepWiki: 内容创建与渲染体系](https://deepwiki.com/kamranahmedse/developer-roadmap/10.1-content-creation-guide) ｜ [roadmap.sh](https://roadmap.sh)
- [BOB0731/learning-tech-tree](https://github.com/BOB0731/learning-tech-tree)
- [zeroa234/cs-math-skill-tree](https://github.com/zeroa234/cs-math-skill-tree)
- [erikbrinkman/d3-dag](https://github.com/erikbrinkman/d3-dag) ｜ [dagrejs/dagre](https://github.com/dagrejs/dagre) ｜ [React Flow 布局指南](https://reactflow.dev/learn/layouting/layouting) ｜ [Eclipse ELK](https://www.eclipse.org/elk/)
- [colinhacks/learn-anything.xyz](https://github.com/colinhacks/learn-anything.xyz) ｜ [learn-anything.xyz](https://learn-anything.xyz)
