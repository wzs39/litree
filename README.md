# Nebula Knowledge Graph · 项目资产交互式星云图谱

> 将全量项目文档、技能（Skills）与模块资产结构化重构为发光星系与引力图谱。

**🌌 在线体验 (GitHub Pages)**: [https://wzs39.github.io/litree/](https://wzs39.github.io/litree/)

---

## 🌟 核心特性

- **三大发光星系拓扑**：
  - 📘 **文档星系 (Documents Galaxy)**：极光青蓝，汇聚核心工程、架构与规范文档；
  - 🔮 **技能星座 (Skills Constellation)**：深邃星紫，映射 `.agents/skills` 沉淀的代理能力资产；
  - 🪐 **模块星轨 (Modules Orbit)**：恒星琥珀金，连接底层系统实现与核心调度模块。
- **动态引力物理仿真**：基于 Canvas 2D + D3.js Force 仿真引擎驱动，60 FPS 流畅物理渲染、惯性拖拽与滚轮锚定缩放（0.15x ~ 6.0x）。
- **雷达探测与星体跳跃**：支持快捷键 `/` 快速搜索任意文档、技能或模块；星体间点击一键星体跳跃（Star Hopping）聚焦。
- **玻璃拟态详情抽屉**：点击任意天体滑出 380px 毛玻璃侧边栏，呈现元数据、标签、物理路径与关联引力链。
- **纯静态与双模离线兼容**：本地内置离线 D3.js 核心库，采用 JSON + JS 双模数据源，支持双击离线 `file:///` 零报错秒级载入，亦支持标准 HTTP 服务部署。

---

## 🚀 本地快速启动

### 方式一：双击一键启动（推荐）
在 Windows 环境下直接双击项目根目录的 `run_nebula.cmd`，自动分配可用端口并在默认浏览器中唤起星云视图。

### 方式二：直接离线浏览
无需启动任何服务，在文件管理器中直接双击打开 `nebula_view/index.html`。

### 方式三：Python 服务启动
```powershell
python run_nebula.py
```

---

## 🛠️ 项目结构

```text
├── nebula_view/                   # 交互式星云前端套件
│   ├── index.html                 # 视口主页面与控制台
│   ├── nebula_graph.js            # Canvas + D3 力导向物理引擎
│   ├── nebula_style.css           # 深空玻璃拟态样式
│   ├── nebula_data.json           # 结构化星云拓扑数据
│   ├── nebula_data.js             # 离线双模数据兜底
│   ├── vendor/d3.v7.min.js        # 离线 D3 核心库
│   └── verification_screenshot.png # E2E 渲染验收高清快照
├── docs/                          # 项目核心架构与规范文档
├── .agents/skills/                # 项目沉淀的代理能力技能集
├── scripts/                       # 自动化扫描与门禁验证套件
│   ├── scan_nebula_assets.py      # AST 与元数据资产扫描提取器
│   ├── verify_nebula_data.py      # Gate 1 静态拓扑完整性校验
│   └── verify_nebula_view.py      # Gate 2 无头浏览器 E2E 交互校验
├── run_nebula.cmd                 # Windows 一键启动脚本
├── run_nebula.py                  # 本地服务启动器
└── README.md
```

---

## 📊 质量验证与审计

- **天体星体总数**：88 个天体（29 篇文档、39 个技能、20 个核心模块），物理路径有效率 **100%**。
- **引力光纤连线**：348 条边（包含 27 对文档-技能双生镜像、74 条技能工作流流转、22 条跨星系引力桥接）。
- **图连通度**：全连通分量数 = 1，孤立天体数 = 0。
- **自动化门禁**：Gate 1（数据真实性校验）与 Gate 2（无头浏览器端到端交互）全部 100% PASS。
- **独立胜利审计**：经第三方隔离审计（Victory Audit）最终确认为 **VICTORY CONFIRMED**。
