# Handoff Report — Survey Task 2: Web Popular AI Video Pipelines & Methodologies

**Agent**: teamwork_explorer (Survey Task 2)  
**Working Directory**: `C:\Users\qwe\.dsh\agy-unlock\.agents\teamwork\explorer_survey_2`  
**Deliverable**: `C:\Users\qwe\.dsh\agy-unlock\.agents\teamwork\explorer_survey_2\report.md`  
**Recipient**: Project Orchestrator (`a0a7b029-c80a-4629-8d2e-b88e0b060884`)  

---

### 1. Observation
- 任务派发指令明确要求针对 5 大流派（Genre A: Manim 数学算法动画, Genre B: Remotion 响应式 UI 动效, Genre C: AI 影视级视觉叙事, Genre D: 数字人与虚拟主播, Genre E: 全自动短视频管线）进行全网技术调研，产出生产级报告并包含具体提示词模板、分镜结构与自动化脚本。
- 本地预置了三大核心 Agent Skill 资产：
  - `manim-video` (`C:\Users\qwe\.gemini\config\skills\manim-video\SKILL.md`): 包含基于 Kokoro TTS 的精确时间对齐管线、`lint-subtitles.py` 静态时间预算模拟器、独立场景多类切分与无缝 Mux 规范。
  - `remotion-video` (`C:\Users\qwe\.gemini\config\skills\remotion-video\SKILL.md`): 包含 React 4.0.541 语法体系、Spring 物理弹簧阻尼插值模型、Windows 环境下 Edge/Playwright Chromium 离线指定补丁、Whisper 字幕高亮组件。
  - `video-prompting` (`C:\Users\qwe\.gemini\config\skills\video-prompting\SKILL.md`): 包含针对 Wan 2.1/2.2、MiniMax H3、LTX 等模型的结构化 Prompt 规范，以及 Character Sheet 多角度一致性 Turnaround 提示词工作流。
- 互联网前沿检索查证到：
  - 影视级生视频（Genre C）的最佳工程实践为“锚点先行（Anchor Frame First）”：由 Flux/Midjourney 产出定帧静态图，再利用 Wan 2.1 / Kling / Hailuo 做 I2V（图生视频），避免 T2V 盲盒抽卡导致的概念漂移与高弃片成本。
  - 剪映草稿自动化工具 `pyJianYingDraft` 可直接修改 Windows 本地 `draft_content.json`，支持 Python 脚本自动装配视频轨、音频轨、字幕轨与转场，无需人工进入剪辑界面拖拽。
  - 数字人（Genre D）在轻量自部署场景下以快手 `LivePortrait` 为主（隐式关键点位移，单卡 30~50 FPS 无网格依赖），商业演播厅场景下以 `HeyGen` / `Hedra` 为主。
  - 全自动流派（Genre E）中，`MoneyPrinterTurbo` 实现了 LLM 编剧 + Pexels 免费素材爬取 + Edge-TTS + FFmpeg 压限装配；`VideoLingo` 实现了 Demucs 人声剥离 + WhisperX 词级强对齐 + Netflix 单行断句标准 + GPT-SoVITS 原音克隆与动态变速自适应。

### 2. Logic Chain
1. 从教育与技术解释视频的核心本质出发：严肃知识传授对“确定性（Determinism）”与“抗幻觉（Anti-Hallucination）”要求极高。
2. 观察显示，单纯依赖纯文生图/文生视频（Genre C）或素材库匹配（Genre E），会产生严重的科学概念漂移与配图脱节问题（如“内存泄漏”配“水管破裂”），不可作为核心数理及代码教学的唯一支撑。
3. 相比之下，流派 A（Manim）与流派 B（Remotion）具备 100% 像素级和逻辑级确定性，代码及公式推导零幻觉；但其弱点是缺乏宏观情境感与讲师亲和力。
4. 流派 D（数字人）可以极低成本在画面右下角加入真人讲师伴读，增强课堂代入感与观看留存率。
5. 因此，单一流派无法通吃所有教学场景，生产级落地的唯一最优解为“分层混合架构（The Golden Composite Pipeline）”：由语义路由器分流，将公式推导分配至 Manim，将系统交互分配至 Remotion，将宏观概念直觉分配至 Flux+Wan2.1，将讲师伴讲分配至 LivePortrait 画中画，最终通过 `pyJianYingDraft` 脚本秒级组装成工程交付。

### 3. Caveats
- 视频模型领域技术迭代迅猛（如 Wan 2.1、HunyuanVideo 的开源权重与 ComfyUI 节点），生产环境中本地推理需注意显存门槛（fp8 / GGUF 量化需至少 16GB~24GB VRAM）。
- `pyJianYingDraft` 依赖特定版本的剪映草稿 JSON 协议规范，剪映大版本重大升级时需保持该库版本对应更新。

### 4. Conclusion
1. 调研任务已圆满完成，在 `C:\Users\qwe\.dsh\agy-unlock\.agents\teamwork\explorer_survey_2\report.md` 输出了逾 7 大章节、全方位覆盖 5 大范式的高密度生产级调研报告。
2. 报告包含五大流派全景对比矩阵、完整提示词工程模板（Character Sheet、Wan 2.1 I2V、MiniMax H3 音视频多模态）、分镜 JSON Schema、以及 Manim 与 CapCut 草稿全自动装配 Python 脚本。
3. 提出了以 LLM 语义路由为调度中枢、多渲染器分工合成、剪映草稿全自动拼装的“黄金混合教学视频生产管线”。

### 5. Verification Method
1. 校验交付文件完整性与可读性：
   ```powershell
   Get-Item "C:\Users\qwe\.dsh\agy-unlock\.agents\teamwork\explorer_survey_2\report.md"
   ```
2. 检查 `report.md` 中代码片段语法合法性（Python / TypeScript / JSON 均遵循标准语法）。
3. 检查报告是否完全覆盖了任务要求中的 Genre A ~ Genre E 五大流派及其对比。
