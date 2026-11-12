# Interactive Nebula Knowledge Graph (交互式星云图谱与视图)

> 本地工作区全量文档、Agent Skills、核心网关与子系统拓扑的高保真交互式星云可视化系统。

---

## 1. 系统概览 (System Overview)

本系统将工作区 `C:\Users\qwe\.dsh\agy-unlock` 下的 29 篇工程与生产力架构文档、39 个专业级 Agent Skills、19 个核心代码模块与技术规范结构化映射为一个逼真绚丽的宇宙星云图谱：
- **三大星系引力聚类 (Galactic Clustering)**：
  - **文档星系 (Documents Galaxy)**：极光青蓝（Cyan `#00f2fe`），汇聚 `docs/**/*.md` 知识与规范体系。
  - **技能星座 (Skills Constellation)**：深邃星紫（Mystic Violet `#b388ff`），汇聚 `.agents/skills/*` 流程与专长技能体系。
  - **模块星轨 (Modules System)**：恒星琥珀金（Stellar Gold `#ffd166`），汇聚核心网关中间件、测试套件与独立子系统。
- **高阶天体力学与渲染引擎**：
  - 基于 **Canvas 2D + D3.js Force** 仿真引擎，支持 80+ 恒星天体与 320+ 引力连线的高性能 60 FPS 稳定渲染。
  - 动态呼吸微粒星尘（Cosmic Dust）、恒星外层发光光晕（Glow Halos）、加色合成与引力光纤脉冲粒子（Luminous Photons）。
- **玻璃拟态交互操控 (Glassmorphism HUD & Drawer)**：
  - **浮动探测 HUD**：悬停即刻探测天体属性、类型、简述与连线数。
  - **380px 侧边抽屉**：点击选中恒星，展开完整元数据、物理路径、一键复制按钮、描述、标签及引力关联星体列表（支持点击直接在星图中镜头飞掠跃迁）。
  - **星海雷达检索与分类过滤**：实时关键词模糊匹配，未命中节点自动淡化，分类胶囊一键聚焦。

---

## 2. 架构设计与文件清单 (Architecture Layout)

系统完全采用非侵入性设计，所有新增实现均隔离在独立目录中，对工作区现有代码零改动：

```
C:\Users\qwe\.dsh\agy-unlock\
├── nebula_view/                         # 星云视图专用独立目录
│   ├── index.html                       # 视图页面入口 (支持 file:// 与 http:// 双模)
│   ├── nebula_style.css                 # 深空星云美学与玻璃拟态 UI 样式
│   ├── nebula_graph.js                  # 核心仿真引擎、Canvas 渲染与交互控制器
│   ├── nebula_data.json                 # 结构化图谱数据集 (JSON 协议)
│   ├── nebula_data.js                   # 离线自载数据集 (window.NEBULA_DATA)
│   ├── vendor/
│   │   └── d3.v7.min.js                 # 离线自包含 D3.js v7 库 (零外部网络依赖)
│   └── README.md                        # 本架构与操作说明文档
├── scripts/
│   ├── scan_nebula_assets.py            # 本地资产扫描与关系映射引擎
│   ├── verify_nebula_data.py            # 门禁 1: 数据解析与完整性断言脚本
│   └── verify_nebula_view.py            # 门禁 2: Playwright 无头浏览器与交互断言脚本
├── run_nebula.cmd                       # Windows 双击一键启动器
└── run_nebula.py                        # 跨平台本地 HTTP 服务与浏览器启动器
```

---

## 3. 日常生产启动与使用说明 (Launch Guide)

本系统针对日常生产使用场景提供了三种便捷的启动方式：

### 方式 1：Windows 双击一键启动 (推荐)
直接在文件资源管理器中双击根目录下的 **`run_nebula.cmd`**：
1. 脚本自动调用 `scripts/scan_nebula_assets.py` 刷新工作区最新资产数据；
2. 启动本地轻量 HTTP 服务；
3. 自动在系统默认浏览器中打开星云图谱视图页面。

### 方式 2：命令行跨平台启动
在工作区根目录下执行：
```powershell
python run_nebula.py
```
终端将自动输出服务地址（默认 `http://localhost:8765/nebula_view/index.html`）并唤起默认浏览器。
若在无图形界面的 CI/测试环境中运行，可添加 `--no-browser` 参数：
```powershell
python run_nebula.py --no-browser
```

### 方式 3：100% 离线直接双击浏览 (Zero Server)
由于系统配备了离线自载脚本 `nebula_data.js` 与本地自包含 `vendor/d3.v7.min.js`，用户可直接在文件资源管理器中双击：
```
nebula_view/index.html
```
页面将通过 `file:///` 协议瞬间加载，**完全不受浏览器跨域 (CORS) 限制，控制台零报错**，在无网络连接的离线环境下依然稳定可用。

---

## 4. 交互操作指引 (Interaction Cheat Sheet)

| 交互行为 | 操作方式 | 说明 |
|---|---|---|
| **画布平移 (Pan)** | 鼠标左键按住画布任意空白处拖拽 | 自由平移观察各星系与外围天体 |
| **画布缩放 (Zoom)** | 鼠标滚轮前滚/后滚 | 以鼠标当前光标位置为中心平滑缩放 (0.15x ~ 6.0x) |
| **视口控制岛** | 点击界面左下角 `[+]` / `[-]` / `[⛶]` | 逐级缩放视口或一键全局自适应居中 |
| **星系快速聚焦** | 点击视口控制岛中的 `[文档]` / `[技能]` / `[模块]` | 镜头平滑飞掠至对应星系的质心 |
| **悬停探测 (Hover)** | 鼠标悬停在任一恒星节点上方 | 弹出即时 HUD 卡片展示名称、分类与连接数，同时高亮一阶相连引力线 |
| **查看详情抽屉** | 鼠标单击任一恒星节点 | 展开右侧 380px 玻璃拟态抽屉，展示完整路径、复制按钮、指标与关系列表 |
| **引力跃迁 (Star Jump)** | 点击抽屉中的任一关联星体条目 | 镜头平滑居中聚焦至该目标星体，并同步切换抽屉档案 |
| **雷达搜索** | 键盘按 `/` 或在顶部搜索框输入关键词 | 实时模糊匹配恒星名称、路径、描述与标签，按 `Esc` 退出 |
| **星系过滤** | 点击顶部 `[全部]` / `[文档星系]` / `[技能星座]` / `[模块星轨]` | 切换星系过滤高亮，非匹配星团自动半透明暗化 |

---

## 5. 编程式全局 API (`window.nebulaViewer`)

在浏览器控制台 (F12 Console) 中，系统暴露了 `window.nebulaViewer` 接口供自动化测试与脚本控制：

```javascript
// 1. 选中指定节点并展开抽屉
window.nebulaViewer.selectNodeById('skill:ask-matt');

// 2. 聚焦至指定星系 (galaxy-documents, galaxy-skills, galaxy-modules)
window.nebulaViewer.focusCluster('galaxy-skills');

// 3. 切换分类过滤 (all, galaxy-documents, galaxy-skills, galaxy-modules)
window.nebulaViewer.setFilter('galaxy-documents');

// 4. 触发全局雷达搜索
window.nebulaViewer.search('diagnosing-bugs');

// 5. 视口居中自适应
window.nebulaViewer.resetView();

// 6. 获取当前视口缩放比例与统计数据
console.log(window.nebulaViewer.getZoom());
console.log(window.nebulaViewer.getStats());
```

---

## 6. 自动化质量验证门禁 (Quality Gates)

系统配备双轨自动化验证测试套件：

### 门禁 1：数据层解析与真实性验证
```powershell
python scripts/verify_nebula_data.py
```
- 断言节点总数严格对应实际文件系统（29 篇 Docs、39 个 Skills、19 个 Modules/Specs）；
- 断言 Schema 完整性（零缺失字段）；
- 断言磁盘物理路径真实存在（`os.path.exists` 100% 通过，杜绝虚拟/伪造数据）；
- 断言引力网络完整性（零悬垂死链，27+ 1:1 双生镜像关联）。

### 门禁 2：视图层无头浏览器端到端交互验证
```powershell
python scripts/verify_nebula_view.py
```
- 基于 Playwright + Microsoft Edge 无头模式自动化运行；
- 严苛监听页面 Console 错误与未捕获异常（断言 `len(console_errors) == 0`）；
- 自动化执行 Canvas 渲染校验、滚轮与按钮缩放平移交互、节点点击与详情抽屉展开断言、雷达搜索高亮过滤验证；
- 自动截取高分辨率全景交互快照保存至 `nebula_view/verification_screenshot.png` 供审计核验。
