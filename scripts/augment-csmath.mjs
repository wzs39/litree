/**
 * scripts/augment-csmath.mjs
 *
 * 为 litree 的核心数据包 cs-math.json 注入前沿技术知识库、语言专精与推荐学习路线：
 * - 10 个核心前沿与语言单元（Unit）：
 *   1. A.3.5.1   大语言模型原理与预训练
 *   2. A.3.5.2   LLM 对齐、微调与模型量化
 *   3. A.3.5.3   RAG 检索增强与向量知识库
 *   4. A.4.5     AI Agent 智能体架构与工作流
 *   5. C.4.4     云原生架构与容器编排治理
 *   6. C.4.5     分布式高并发与共识容灾系统
 *   7. P.5.6     现代全栈工程与响应式架构
 *   8. S.1.4     Web3 智能合约与去中心化密码系统
 *   9. P.2.5     Rust 现代系统编程与内存安全
 *   10. P.2.3.1  Python 高级工程与高性能实战
 * - 36 个章节分组（Branch），174 个高标准 Leaf 知识点芯片
 * - 16 条 Hard 依赖边与 13 条 Soft 推荐依赖边（严格拓扑排序无环）
 * - 6 条专属工业级推荐路线（大模型全栈、云原生分布式、现代全栈工程、Web3去中心化、Rust系统级开发、Python全能路线）
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PACK_PATH = join(ROOT, 'resources/packs/cs-math.json')

export const AUGMENTED_UNITS = [
  {
    id: 'A.3.5.1',
    parent: 'A',
    kind: 'unit',
    title: { zh: '大语言模型原理与预训练', en: 'LLM Fundamentals & Pretraining' },
    domain: 'A',
    core: true,
    summary: '自注意力机制与 Decoder-Only 架构，因果语言建模，Tokenization、词表与嵌入，Scaling Laws 与分布式大规模预训练。',
    resources: [
      { title: 'Google Brain: Attention Is All You Need (Vaswani et al.)', url: 'https://arxiv.org/abs/1706.03762', lang: 'en' },
      { title: 'Google DeepMind: Gemma Architecture & Technical Report', url: 'https://arxiv.org/abs/2403.08295', lang: 'en' },
      { title: 'Stanford CS324: Large Language Models', url: 'https://stanford-cs324.github.io/winter2022/', lang: 'en' },
      { title: 'Andrej Karpathy: Let\'s build GPT: from scratch, in code, spelled out', url: 'https://www.youtube.com/watch?v=kCc8FmEb1nY', lang: 'en' },
      { title: 'The Illustrated Transformer (Jay Alammar)', url: 'https://jalammar.github.io/illustrated-transformer/', lang: 'en' },
      { title: 'FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness (Dao et al.)', url: 'https://arxiv.org/abs/2205.14135', lang: 'en' }
    ],
    exercises: [
      '(1) 详细解释 Multi-Head Self-Attention 与 Grouped Query Attention (GQA) 的计算过程，并计算 KV Cache 显存节约比例。',
      '(2) 比较 BPE、WordPiece 和 Unigram Tokenization 的分词算法原理与词表构建差异。',
      '(3) 什么是 Kaplan 与 Chinchilla Scaling Law？给定 100 亿计算预算 (FLOPs)，如何分配参数量 N 与训练 Token 数 D？',
      '(4) 解释 RoPE (Rotary Position Embedding) 的复数旋转几何原理及其在外推长度时的作用。'
    ],
    evidence: 'Stanford CS324 / CS224N：前置依赖 Transformer 架构（A.2.3.1）与深度模型反向传播（A.2.3）。',
    chapters: [
      {
        title: '自注意力与 Transformer 进阶',
        leaves: [
          '自注意力数学推导与计算复杂度',
          '因果自注意力掩码（Causal Masking）',
          '多头注意力（MHA）与分组查询注意力（GQA）',
          '多查询注意力（MQA）机制',
          'KV Cache 原理与显存占用分析',
          'FlashAttention 与 IO 感知注意力加速',
          '旋转位置编码（RoPE）与 ALiBi 相对位置编码'
        ]
      },
      {
        title: '分词与文本表示',
        leaves: [
          'BPE (Byte Pair Encoding) 字节级分词',
          'WordPiece 与 Unigram 算法',
          '词表大小选择与 Out-Of-Vocabulary 策略',
          '嵌入层查找与权重绑定（Weight Tying）',
          '特殊标记（Special Tokens）与 Prompt 模板格式'
        ]
      },
      {
        title: '预训练数据与规模定律',
        leaves: [
          '大规模语料清洗与去重（MinHash / Exact Deduplication）',
          '合成数据生成与清洗过滤机制',
          'Kaplan Scaling Law 与计算最优 Chinchilla 边界',
          '数据退火（Data Annealing）与冷启动策略',
          '分布式预训练：3D 并行（DP / TP / PP）与 ZeRO 显存优化'
        ]
      }
    ]
  },
  {
    id: 'A.3.5.2',
    parent: 'A',
    kind: 'unit',
    title: { zh: 'LLM 对齐、微调与模型量化', en: 'Alignment, Fine-Tuning & Quantization' },
    domain: 'A',
    core: true,
    summary: '指令微调（SFT）、参数高效微调（PEFT/LoRA）、基于人类反馈强化学习（RLHF/DPO）与后训练权重量化优化。',
    resources: [
      { title: 'Google DeepMind: Alignment & Post-Training Principles', url: 'https://deepmind.google/discover/blog/', lang: 'en' },
      { title: 'The RLHF Book (Nathan Lambert)', url: 'https://rlhfbook.com/', lang: 'en' },
      { title: 'LoRA: Low-Rank Adaptation of Large Language Models (Hu et al.)', url: 'https://arxiv.org/abs/2106.09685', lang: 'en' },
      { title: 'Direct Preference Optimization: Your Language Model is Secretly a Reward Model (Rafailov et al.)', url: 'https://arxiv.org/abs/2305.18290', lang: 'en' },
      { title: 'Hugging Face PEFT Documentation', url: 'https://huggingface.co/docs/peft/index', lang: 'en' }
    ],
    exercises: [
      '(1) 证明 LoRA 的前向传播公式 h = W0 x + (B * A) x * (alpha / r)，并解释秩 r 和缩放因子 alpha 的选取准则。',
      '(2) 详细对比 PPO-RLHF 与 DPO 的损失函数差异，说明为什么 DPO 可以跳过显式奖励模型训练。',
      '(3) 解释后训练量化 (PTQ) 中对称量化与非对称量化的区别，并推导 Scale 和 Zero-Point 的计算公式。',
      '(4) 简述 QLoRA 如何结合 NormalFloat4 (NF4) 与双重量化 (Double Quantization) 实现显存极限压缩。'
    ],
    evidence: 'RLHF/Post-Training：前置需要因果语言模型（A.3.5.1），偏好优化依赖强化学习基本概念（A.2.4）。',
    chapters: [
      {
        title: '指令微调与高效微调（PEFT）',
        leaves: [
          '指令遵循数据集构建与 SFT 训练流程',
          'LoRA 低秩自适应数学原理',
          'QLoRA 与 NF4 数据类型量化',
          'DoRA (Weight-Decomposed Low-Rank Adaptation)',
          'Prefix Tuning 与 Prompt Tuning 原理'
        ]
      },
      {
        title: '人类对齐与偏好优化',
        leaves: [
          'RLHF 经典三阶段流水线',
          '奖励模型（Reward Model）训练与 Bradley-Terry 偏好模型',
          'PPO 在 LLM 对齐中的状态、动作与优势函数',
          'DPO (Direct Preference Optimization) 闭式解推导',
          'KTO 与 ORPO 偏好对齐前沿算法',
          '对齐税（Alignment Tax）与越狱对抗防御'
        ]
      },
      {
        title: '模型推理加速与模型量化',
        leaves: [
          'INT8 / INT4 线性量化与剪枝',
          'GPTQ 二阶误差补偿量化',
          'AWQ (Activation-aware Weight Quantization) 激活感知量化',
          'GGUF 格式与 llama.cpp 端侧推理引擎',
          '投机采样（Speculative Decoding）与批处理吞吐优化'
        ]
      }
    ]
  },
  {
    id: 'A.3.5.3',
    parent: 'A',
    kind: 'unit',
    title: { zh: 'RAG 检索增强与向量知识库', en: 'RAG & Vector Knowledge Engineering' },
    domain: 'A',
    core: true,
    summary: '多模态非结构化解析分块、文本稠密嵌入模型、向量相似度索引（HNSW/IVF-PQ）、混合检索与 Cross-Encoder 重排序。',
    resources: [
      { title: 'Google Research: ScaNN Scalable Nearest Neighbors Vector Search', url: 'https://github.com/google-research/google-research/tree/master/scann', lang: 'en' },
      { title: 'Google Cloud: Architecture of Enterprise Generative AI & Vector Search', url: 'https://cloud.google.com/architecture', lang: 'en' },
      { title: 'LlamaIndex Documentation & Architecture Guides', url: 'https://docs.llamaindex.ai/', lang: 'en' },
      { title: 'Dense Passage Retrieval for Open-Domain Question Answering (Karpukhin et al.)', url: 'https://arxiv.org/abs/2004.04906', lang: 'en' },
      { title: 'Pinecone: What is Vector Search?', url: 'https://www.pinecone.io/learn/vector-search-basics/', lang: 'en' },
      { title: 'RAG Triad Assessment with TruLens / RAGAS', url: 'https://www.trulens.org/', lang: 'en' }
    ],
    exercises: [
      '(1) 比较分块策略中固定滑动窗口、递归分块与语义分块的优劣与召回率影响。',
      '(2) 推导余弦相似度、内积与欧氏距离在归一化向量下的等价性，并比较 HNSW 与 IVF-PQ 索引的召回精度与构建速度。',
      '(3) 什么是 Reciprocal Rank Fusion (RRF)？写出结合 BM25 稀疏检索与稠密向量检索的融合评分公式。',
      '(4) 为什么在向量召回后需要 Cross-Encoder 重排序模型？分析计算开销与检索精度的权衡。'
    ],
    evidence: '工程落地需要 Python（P.2.3）、表示学习（A.2.3.1）以及数据库存储内核基础（D.1.2）。',
    chapters: [
      {
        title: '文档处理与分块策略',
        leaves: [
          'PDF 与多格式非结构化文档结构化提取',
          '递归字符分块与滑动窗口 Overlap 机制',
          '语义感知分块与文档父子分块（Parent-Child Chunking）',
          '元数据提取与过滤索引构建'
        ]
      },
      {
        title: '文本嵌入与向量索引',
        leaves: [
          '稠密向量嵌入（Dense Embeddings）与对比学习训练',
          '稀疏向量（SPLADE / BM25）特征提取',
          'ANN 近似最近邻搜索算法',
          'HNSW (Hierarchical Navigable Small World) 图索引',
          'IVF-PQ 倒排量化乘积索引与内存压缩'
        ]
      },
      {
        title: '混合检索与高级 RAG 架构',
        leaves: [
          '稠密与稀疏混合检索（Hybrid Search）',
          'RRF (Reciprocal Rank Fusion) 多路召回融合',
          'Cross-Encoder 深度重排序（Rerank）模型',
          '查询重写（Query Rewriting）与假设性文档嵌入（HyDE）',
          'Self-RAG 与自适应路由机制',
          'RAG 评估三元组：忠实度、上下文相关度与答案相关度（RAGAS）'
        ]
      }
    ]
  },
  {
    id: 'A.4.5',
    parent: 'A',
    kind: 'unit',
    title: { zh: 'AI Agent 智能体架构与工作流', en: 'Autonomous Agents & Workflows' },
    domain: 'A',
    core: true,
    summary: '工具调用标准协议、ReAct 推理规划循环、长短期情景记忆系统、多 Agent 协作网络与人机在环治理。',
    resources: [
      { title: 'Google DeepMind: Project Astra & Multimodal Agents', url: 'https://deepmind.google/technologies/gemini/project-astra/', lang: 'en' },
      { title: 'Google Cloud: Building Multi-Agent Systems on Vertex AI', url: 'https://cloud.google.com/vertex-ai/docs', lang: 'en' },
      { title: 'ReAct: Synergizing Reasoning and Acting in Language Models (Yao et al.)', url: 'https://arxiv.org/abs/2210.03629', lang: 'en' },
      { title: 'Anthropic: Building Effective Agents', url: 'https://www.anthropic.com/research/building-effective-agents', lang: 'en' },
      { title: 'Model Context Protocol (MCP) Specification', url: 'https://modelcontextprotocol.io/', lang: 'en' },
      { title: 'LangGraph Documentation & State Machine Workflows', url: 'https://langchain-ai.github.io/langgraph/', lang: 'en' }
    ],
    exercises: [
      '(1) 绘制 ReAct (Reasoning + Acting) 范式的状态转移图，并写出包含 Thought、Action、Observation 的结构化 Prompt。',
      '(2) 比较 Tool Calling 中 Function Calling JSON 校验机制与直接解析纯文本的区别，说明如何处理参数幻觉。',
      '(3) 设计一个基于分层记忆（Working Memory / Episodic Memory / Semantic Memory）的 Agent 对话上下文压缩策略。',
      '(4) 阐述 MCP (Model Context Protocol) 的 Client-Host-Server 三层架构，以及它如何解决传统插件孤岛问题。'
    ],
    evidence: '智能体开发必须以大语言模型原理（A.3.5.1）与高级面向对象与异步编程（P.1.4）为支撑。',
    chapters: [
      {
        title: 'Agent 规划与推理范式',
        leaves: [
          'ReAct (Thought-Action-Observation) 推理循环',
          'Plan-and-Solve 分解规划模式',
          'Reflexion 自我反思与错误修正机制',
          '结构化输出与 JSON Schema 强类型约束'
        ]
      },
      {
        title: '工具调用与环境集成',
        leaves: [
          'LLM Tool / Function Calling 标准协议',
          'Model Context Protocol (MCP) 标准协议与 Server 发现',
          '沙箱环境命令执行与代码解释器集成',
          '网络搜索与外部 API 自动化调度',
          '幂等性控制与工具调用的权限安全门禁'
        ]
      },
      {
        title: '记忆系统与上下文工程',
        leaves: [
          '滑动窗口上下文与对话摘要压缩',
          '情景记忆（Episodic Memory）与语义知识检索',
          '全局状态图与持久化检查点（Checkpoints）',
          '长上下文缓存（Prompt Caching）与成本优化'
        ]
      },
      {
        title: '多智能体协作与系统治理',
        leaves: [
          'Router 集中分发与自组织 Peer 协作拓扑',
          'Supervisor 监督者模式与层级任务拆解',
          '多 Agent 辩论（Multi-Agent Debate）与一致性达成',
          'Human-in-the-loop (HITL) 关键动作审批拦截',
          'Agent 轨迹追踪与 Observability（OpenTelemetry / LangSmith）'
        ]
      }
    ]
  },
  {
    id: 'C.4.4',
    parent: 'C',
    kind: 'unit',
    title: { zh: '云原生架构与容器编排治理', en: 'Cloud Native & Container Orchestration' },
    domain: 'C',
    core: true,
    summary: 'Kubernetes 控制平面与调度、声明式 CRD 与 Operator 模式、CNI/CSI 机制、Istio 服务网格与云原生可观测性。',
    resources: [
      { title: 'Google Research: Large-scale cluster management at Google with Borg', url: 'https://research.google/pubs/pub43438/', lang: 'en' },
      { title: 'Google Cloud: GKE & Kubernetes Best Practices', url: 'https://cloud.google.com/kubernetes-engine/docs/best-practices', lang: 'en' },
      { title: 'Kubernetes The Hard Way (Kelsey Hightower)', url: 'https://github.com/kelseyhightower/kubernetes-the-hard-way', lang: 'en' },
      { title: 'CNCF Cloud Native Interactive Landscape', url: 'https://landscape.cncf.io/', lang: 'en' },
      { title: 'Istio Service Mesh Architecture & Concepts', url: 'https://istio.io/latest/docs/concepts/', lang: 'en' }
    ],
    exercises: [
      '(1) 画出 Kubernetes 控制平面架构图，说明 API Server、etcd、Controller Manager 和 Scheduler 的协同闭环。',
      '(2) 详细解释 Pod 的生命周期状态流转，包括 Init Container、PostStart、Readiness 与 Liveness Probe。',
      '(3) 什么是声明式 API？推导控制器调和循环（Reconciliation Loop）如何实现期望状态与实际状态的收敛。',
      '(4) 阐述 Envoy 边车代理（Sidecar Proxy）如何透明拦截 TCP 流量，并实现 mTLS 双向认证与流量金丝雀切流。'
    ],
    evidence: 'CNCF 体系前置建立在容器化（C.2.3）、TCP/IP网络协议（C.3.2）与云计算（C.4.2）基石之上。',
    chapters: [
      {
        title: '容器运行时与 Linux 底层机制',
        leaves: [
          'Linux Namespace (PID/NET/MNT/IPC) 资源隔离',
          'Cgroups v2 资源配额与限制机制',
          'OCI 容器镜像标准与分层写时复制（OverlayFS）',
          'Containerd 与 CRI (Container Runtime Interface) 契约'
        ]
      },
      {
        title: 'Kubernetes 核心架构与调度',
        leaves: [
          'Kube-apiserver、etcd 与控制器架构',
          'Kubelet、Kube-proxy 与节点生命周期',
          'Pod、Deployment、StatefulSet 与 DaemonSet 抽象',
          '调度器调度算法：过滤（Predicates）与打分（Priorities）',
          '节点亲和性、污点（Taints）与容忍（Tolerations）'
        ]
      },
      {
        title: '云原生网络与持久化存储',
        leaves: [
          'CNI (Container Network Interface) 规范与 Calico/Cilium 实现',
          'Overlay 网络与 eBPF 高性能网络加速',
          'Service 负载均衡、ClusterIP 与 Ingress 网关',
          'CSI (Container Storage Interface) 插件机制',
          'PV (PersistentVolume) 与 PVC 动态绑定'
        ]
      },
      {
        title: '扩展机制与服务网格',
        leaves: [
          'CRD (Custom Resource Definition) 声明式扩展',
          'Operator 模式与自定义 Controller 编写',
          'Istio / Envoy 服务网格与流量镜像切流',
          'mTLS 零信任服务间身份认证与授权',
          'Prometheus 指标监控、Loki 日志聚合与 OpenTelemetry 链路追踪'
        ]
      }
    ]
  },
  {
    id: 'C.4.5',
    parent: 'C',
    kind: 'unit',
    title: { zh: '分布式高并发与共识容灾系统', en: 'Distributed Systems & Consensus' },
    domain: 'C',
    core: true,
    summary: 'Raft 与 Multi-Paxos 状态机复制协议、CAP/BASE 定理、分布式事务（2PC/TCC/Saga）、一致性哈希与容灾削峰。',
    resources: [
      { title: 'Google Research: Spanner: Google\'s Globally Distributed Database (Corbett et al.)', url: 'https://research.google/pubs/pub39966/', lang: 'en' },
      { title: 'Google SRE: Site Reliability Engineering (Beyer et al., Google / O\'Reilly)', url: 'https://sre.google/sre-book/table-of-contents/', lang: 'en' },
      { title: 'In Search of an Understandable Consensus Algorithm (Extended Raft Paper)', url: 'https://raft.github.io/raft.pdf', lang: 'en' },
      { title: 'Designing Data-Intensive Applications (Martin Kleppmann)', url: 'https://dataintensive.net/', lang: 'en' },
      { title: 'MIT 6.824: Distributed Systems Course Lectures', url: 'https://pdos.csail.mit.edu/6.824/', lang: 'en' }
    ],
    exercises: [
      '(1) 证明 Raft 选举安全（Election Safety）与领导者完全性（Leader Completeness）定理。',
      '(2) 比较 2PC (Two-Phase Commit) 与 TCC (Try-Confirm-Cancel) 在处理网络分区时的单点故障与阻塞机制。',
      '(3) 什么是向量时钟（Vector Clock）？如何通过向量时钟判断两个事件具有因果关系或是并发冲突？',
      '(4) 分析分布式锁实现中，Redis Redlock 算法在系统时钟跳变或 GC 长停顿下的安全性边界。'
    ],
    evidence: '分布式共识要求并发同步机制（C.2.2）、分布式基础（C.4.1）以及算法分析（F.1.2）。',
    chapters: [
      {
        title: '时间、因果与逻辑一致性',
        leaves: [
          '物理时钟偏转、NTP 漂移与单调时钟',
          'Lamport 逻辑时钟与偏序全序关系',
          '向量时钟（Vector Clocks）与因果冲突检测',
          'CAP 定理、PACELC 定理与 BASE 理论权衡',
          '强一致性、因果一致性与最终一致性模型'
        ]
      },
      {
        title: '共识协议与状态机复制',
        leaves: [
          '经典 Paxos 与 Multi-Paxos 协议两阶段推导',
          'Raft Leader 选举与心跳租约机制',
          'Raft 日志复制、安全性证明与日志压缩快照',
          '拜占庭容错（BFT）与 PBFT 算法基础'
        ]
      },
      {
        title: '分布式事务与数据一致性',
        leaves: [
          '2PC (两阶段提交) 协议与协调者单点风险',
          '3PC (三阶段提交) 超时解脱机制',
          'TCC (Try-Confirm-Cancel) 业务型补偿事务',
          'Saga 模式：向前恢复与向后重试机制',
          '分布式事务 Seata 框架 AT 模式原理'
        ]
      },
      {
        title: '高并发系统架构与容灾防护',
        leaves: [
          '一致性哈希（Consistent Hashing）与虚拟节点',
          '分布式缓存并发更新：Cache-Aside 与布隆过滤器穿透防范',
          '分布式锁演进：从 Redis Redlock 到 ZooKeeper 临时顺序节点',
          '高并发削峰：消息队列解耦与背压（Backpressure）机制',
          '限流算法：令牌桶与漏桶；熔断降级（Circuit Breaker）'
        ]
      }
    ]
  },
  {
    id: 'P.5.6',
    parent: 'P',
    kind: 'unit',
    title: { zh: '现代全栈工程与响应式架构', en: 'Modern Fullstack & Systems Architecture' },
    domain: 'P',
    core: true,
    summary: 'TypeScript 进阶类型系统、现代前端同构渲染（SSR/RSC/流式水合）、端到端类型安全契约与 DDD 领域驱动设计重构。',
    resources: [
      { title: 'Google Web.dev: Modern Web Architecture & Core Web Vitals', url: 'https://web.dev/learn', lang: 'en' },
      { title: 'TypeScript Official Handbook (Advanced Types)', url: 'https://www.typescriptlang.org/docs/handbook/2/types-from-types.html', lang: 'en' },
      { title: 'Domain-Driven Design: Tackling Complexity in the Heart of Software (Eric Evans)', url: 'https://www.domainlanguage.com/ddd/', lang: 'en' },
      { title: 'Next.js & React Server Components Architecture Guide', url: 'https://nextjs.org/docs/app/building-your-application/rendering/server-components', lang: 'en' }
    ],
    exercises: [
      '(1) 使用 TypeScript 编写泛型工具类型 DeepPartial<T> 和 Flatten<T>，并说明条件类型分发规则。',
      '(2) 比较 SPA、SSR (服务端渲染)、SSG (静态生成) 与 ISR (增量静态再生成) 的渲染时机、TTFB 与 SEO 优缺点。',
      '(3) 什么是 React Server Components (RSC)？它与传统 SSR 结合客户端水合（Hydration）有什么本质区别？',
      '(4) 简述 DDD (领域驱动设计) 中的实体（Entity）、值对象（Value Object）、聚合根（Aggregate Root）与仓储（Repository）职责边界。'
    ],
    evidence: '现代工程建立在面向对象（P.1.2）、Web基础（P.5.1）与软件架构理念（P.4.4）之上。',
    chapters: [
      {
        title: '现代 TypeScript 强类型编程',
        leaves: [
          '条件类型（Conditional Types）与 infer 关键字',
          '映射类型（Mapped Types）与模板字面量类型',
          '类型收窄（Type Narrowing）与自定义类型守卫',
          '逆变与协变（Variance）类型推断'
        ]
      },
      {
        title: '现代 Web 架构与同构全栈',
        leaves: [
          'SPA 客户端渲染与首屏性能瓶颈',
          '同构 SSR、流式渲染（Streaming SSR）与水合优化',
          'React Server Components (RSC) 无客户端包体架构',
          '边缘运行时（Edge Runtime）与 Serverless 状态管理',
          '端到端类型安全 API（tRPC / GraphQL / OpenAPI CodeGen）'
        ]
      },
      {
        title: '领域驱动设计与大型系统重构',
        leaves: [
          '战略设计：统一语言（Ubiquitous Language）与界限上下文（Bounded Context）',
          '战术设计：实体、值对象与聚合根封装',
          '仓储模式（Repository）与领域服务（Domain Service）',
          '领域事件（Domain Events）与 CQRS 读写分离架构',
          '六边形架构（Ports and Adapters）与依赖倒置落地'
        ]
      }
    ]
  },
  {
    id: 'S.1.4',
    parent: 'S',
    kind: 'unit',
    title: { zh: 'Web3 智能合约与去中心化密码系统', en: 'Web3, Smart Contracts & ZK Systems' },
    domain: 'S',
    core: false,
    summary: '以太坊虚拟机（EVM）架构与字节码执行模型、Solidity 智能合约开发与重入安全防护、零知识证明（ZKP）基础。',
    resources: [
      { title: 'Google Security: Post-Quantum Cryptography & Zero-Trust Engineering', url: 'https://security.googleblog.com/', lang: 'en' },
      { title: 'Mastering Ethereum (Andreas M. Antonopoulos, Gavin Wood)', url: 'https://github.com/ethereumbook/ethereumbook', lang: 'en' },
      { title: 'OpenZeppelin Smart Contract Security Best Practices', url: 'https://docs.openzeppelin.com/contracts/', lang: 'en' },
      { title: 'Proofs, Arguments, and Zero-Knowledge (Justin Thaler)', url: 'https://people.cs.georgetown.edu/jthaler/ProofsArgsAndZK.html', lang: 'en' }
    ],
    exercises: [
      '(1) 详细解释重入漏洞（Reentrancy Attack）的发生机理，并分别用 Checks-Effects-Interactions 模式和互斥锁修补代码。',
      '(2) 简述 EVM 存储布局：Storage、Memory 与 Calldata 的读写成本（Gas）与生命周期差异。',
      '(3) 什么是 ERC-20 与 ERC-721 标准？写出 approve 和 transferFrom 的安全状态更新逻辑。',
      '(4) 解释零知识证明中的完备性（Completeness）、可靠性（Soundness）与零知识性（Zero-Knowledge），并举例说明 zk-SNARKs 原理。'
    ],
    evidence: '区块链与智能合约必须以密码学原理（S.1.2）、分布式系统（C.4.1）以及高级语言编程（P.1.4）为支撑。',
    chapters: [
      {
        title: '区块链底层与 EVM 虚拟机',
        leaves: [
          '默克尔树（Merkle Tree）与默克尔帕特里夏树（MPT）',
          'UTXO 模型与账户余额模型比对',
          'EVM 栈机架构、字节码与 Gas 计费模型',
          'Storage 插槽存储布局与内存寻址'
        ]
      },
      {
        title: 'Solidity 智能合约工程',
        leaves: [
          'Solidity 面向对象特性与修饰符（Modifiers）',
          'ERC-20 代币标准接口与状态转移规范',
          'ERC-721 与 ERC-1155 非同质化代币协议',
          '智能合约可升级代理模式（Transparent / UUPS Proxy）',
          '预言机（Oracle）与 Chainlink 外部数据馈送'
        ]
      },
      {
        title: '智能合约安全审计与防护',
        leaves: [
          '经典重入攻击（Reentrancy）与 Checks-Effects 规范',
          '整数溢出与 SafeMath 原理',
          '抢跑交易（Front-Running）与 MEV (矿工可提取价值)',
          '重放攻击与 EIP-712 签名验签防伪',
          '静态代码分析工具（Slither）与形式化验证'
        ]
      },
      {
        title: '零知识证明与隐私扩容',
        leaves: [
          '交互式零知识证明与 Fiat-Shamir 变换',
          'zk-SNARKs 与多项式承诺方案（KZG）',
          'zk-STARKs 免可信设置（Transparent）优势',
          'Layer 2 扩容：Optimistic Rollups 与 ZK-Rollups 机制'
        ]
      }
    ]
  },
  {
    id: 'P.2.5',
    parent: 'P',
    kind: 'unit',
    title: { zh: 'Rust 现代系统编程与内存安全', en: 'Rust & Systems Programming' },
    domain: 'P',
    core: true,
    summary: '所有权机制与借用检查、生命周期消除、RAII 与内存安全、无畏并发、Tokio 异步系统与 Unsafe 底层互操作。',
    resources: [
      { title: 'Google Comprehensive Rust: Multi-Day Rust Course by Android Team', url: 'https://google.github.io/comprehensive-rust/', lang: 'en' },
      { title: 'Google Security: Memory Safe Languages in Android 13+', url: 'https://security.googleblog.com/2022/12/memory-safe-languages-in-android-13.html', lang: 'en' },
      { title: 'The Rust Programming Language (Steve Klabnik & Carol Nichols)', url: 'https://doc.rust-lang.org/book/', lang: 'en' },
      { title: 'Rust for Rustaceans (Jon Gjengset)', url: 'https://rust-for-rustaceans.com/', lang: 'en' },
      { title: 'The Rustonomicon: The Dark Arts of Unsafe Rust', url: 'https://doc.rust-lang.org/nomicon/', lang: 'en' },
      { title: 'Tokio Tutorial & Async Rust in Practice', url: 'https://tokio.rs/tokio/tutorial', lang: 'en' }
    ],
    exercises: [
      '(1) 阐述 Rust 所有权三大规则，并编写代码说明什么是移动语义（Move）与克隆（Clone）。',
      '(2) 什么是生命周期消除规则（Lifetime Elision Rules）？在结构体中存储引用时何时必须显式标注 \'a？',
      '(3) 证明 Send 与 Sync 特质在多线程并发中的作用。为什么 Rc<T> 不是 Send 且不是 Sync，而 Arc<T> 是？',
      '(4) 在 Unsafe Rust 中，简述裸指针解引用与引用转换时需要遵守的严格别名规则（Aliasing Rules）。'
    ],
    evidence: 'Rust 编程建立在程序设计基础（P.1.1）与计算机组成原理（C.1.1）之上的现代内存安全范式。',
    chapters: [
      {
        title: '所有权系统与内存管理',
        leaves: [
          '所有权规则与移动语义',
          '借用检查器与生命周期标注',
          'RAII 资源自动回收机制',
          '智能指针（Box / Rc / Arc / RefCell）',
          '无垃圾回收的堆栈内存布局'
        ]
      },
      {
        title: '类型系统与高级泛型',
        leaves: [
          '代数数据类型与模式匹配',
          'Trait 抽象与孤儿规则',
          '静态分发与动态分发（Trait Object）',
          '关联类型与泛型约束',
          '过程宏与派生宏（Derive Macro）'
        ]
      },
      {
        title: '无畏并发与异步系统',
        leaves: [
          'Send 与 Sync 标记特质',
          '跨线程通信（MPSC Channel）',
          '共享状态互斥锁（Mutex 与 RwLock）',
          'async/await 状态机生成机制',
          'Tokio 异步运行时与任务调度'
        ]
      },
      {
        title: '底层系统与跨语言互操作',
        leaves: [
          'Unsafe Rust 与裸指针解引用',
          'FFI (外部函数接口) 与 C 语言双向绑定',
          'Miri 未定义行为（UB）静态检测',
          'SIMD 指令集与编译期内联优化',
          'Cargo 编译缓存与工作区管理'
        ]
      }
    ]
  },
  {
    id: 'P.2.3.1',
    parent: 'P',
    kind: 'unit',
    title: { zh: 'Python 高级工程与高性能实战', en: 'Advanced Python & Performance Engineering' },
    domain: 'P',
    core: true,
    summary: 'CPython 解释器内核机制、GIL 锁与内存管理、高级元编程、asyncio 异步并发与 PyO3/C 扩展加速。',
    resources: [
      { title: 'Google Python Style Guide (Official Engineering Practices)', url: 'https://google.github.io/styleguide/pyguide.html', lang: 'en' },
      { title: 'Google for Education: Google Python Class', url: 'https://developers.google.com/edu/python', lang: 'en' },
      { title: 'Fluent Python, 2nd Edition (Luciano Ramalho)', url: 'https://www.oreilly.com/library/view/fluent-python-2nd/9781492056348/', lang: 'en' },
      { title: 'CPython Internals (Anthony Shaw)', url: 'https://realpython.com/cpython-internals/', lang: 'en' },
      { title: 'PyO3 User Guide: Rust bindings for Python', url: 'https://pyo3.rs/', lang: 'en' },
      { title: 'Python Asyncio Official Documentation & Architecture', url: 'https://docs.python.org/3/library/asyncio.html', lang: 'en' }
    ],
    exercises: [
      '(1) 深入剖析 CPython 对象的引用计数机制与分代垃圾回收（Generational GC）如何解决循环引用。',
      '(2) 编写一个基于描述符协议（Descriptor）的类型安全字段验证器，说明 __get__ 和 __set__ 的触发机制。',
      '(3) 详细解释 Python 3.13+ Free-Threaded (nogil) 模式下的偏向锁与内存开销权衡。',
      '(4) 比较 asyncio 事件循环中的 create_task 与 run_in_executor，说明在处理 CPU 密集型任务时的架构选择。'
    ],
    evidence: '进阶 Python 建立在基础语法（P.1.1）与科学工具栈（P.2.3）之上，深入系统并发机制。',
    chapters: [
      {
        title: '高级对象模型与元编程',
        leaves: [
          '数据模型（Dunder Special Methods）',
          '属性查找机制与描述符协议（Descriptor）',
          '元类（Metaclass）与 __init_subclass__',
          '闭包与带参装饰器进阶',
          '动态代码执行与 AST 抽象语法树分析'
        ]
      },
      {
        title: '解释器底层机制与并发模型',
        leaves: [
          'CPython 内存管理与引用计数垃圾回收',
          'GIL (全局解释器锁) 原理与 Free-Threaded 演进',
          '多线程与多进程共享内存',
          'asyncio 事件循环与 Task/Future 状态机',
          'uvloop 高性能网络事件驱动'
        ]
      },
      {
        title: '现代工程化与类型规范',
        leaves: [
          'PEP 484 泛型类型注解与 Protocol 结构子类型',
          'Pydantic V2 编译级数据校验',
          '现代构建工具链（uv / Poetry / Ruff / uvx）',
          'pytest 夹具机制与属性驱动测试（Hypothesis）'
        ]
      },
      {
        title: '高性能计算与混合扩展',
        leaves: [
          'Cython 静态类型编译加速',
          'PyO3 (Rust 与 Python 零拷贝互调用)',
          'Numba JIT 动态编译与并行循环',
          'NumPy 跨步（Strides）与内存连续性视图优化'
        ]
      }
    ]
  }
]

export const AUGMENTED_EDGES = [
  // A.3.5.1
  { from: 'A.2.3', to: 'A.3.5.1', type: 'hard', reason: '大规模语言模型预训练依赖深度学习基础与梯度反向传播。' },
  { from: 'A.2.3.1', to: 'A.3.5.1', type: 'hard', reason: '现代 LLM 的底层架构全面建立在 Transformer 自注意力机制之上。' },
  { from: 'A.2.3.2', to: 'A.3.5.1', type: 'soft', reason: '预训练大模型需要分布式显存切分与大规模训练集群调度能力。' },

  // A.3.5.2
  { from: 'A.3.5.1', to: 'A.3.5.2', type: 'hard', reason: '指令微调与人类对齐是对预训练基座模型的后处理强化。' },
  { from: 'A.2.4', to: 'A.3.5.2', type: 'soft', reason: 'RLHF 依赖强化学习策略梯度与优势函数概念。' },

  // A.3.5.3
  { from: 'P.2.3', to: 'A.3.5.3', type: 'hard', reason: 'RAG 系统的文档解析、嵌入调用与向量管道主要采用 Python 工具栈。' },
  { from: 'A.2.3.1', to: 'A.3.5.3', type: 'hard', reason: '向量检索依赖深度表示学习与稠密向量嵌入空间。' },
  { from: 'D.1.2', to: 'A.3.5.3', type: 'soft', reason: '向量数据库的持久化与索引与传统数据库内核原理相通。' },

  // A.4.5
  { from: 'A.3.5.1', to: 'A.4.5', type: 'hard', reason: '自主智能体的推理、计划与反思能力直接受基座模型的上下文理解与生成质量制约。' },
  { from: 'P.1.4', to: 'A.4.5', type: 'hard', reason: 'Agent 状态图机、工具异步调用与沙箱集成需要高级程序设计能力。' },
  { from: 'A.3.5.3', to: 'A.4.5', type: 'soft', reason: 'Agent 的长期记忆与外部工具知识库往往依赖 RAG 架构支撑。' },

  // C.4.4
  { from: 'C.2.3', to: 'C.4.4', type: 'hard', reason: 'Kubernetes 编排的原子单位是容器，必须掌握 cgroups、namespace 与容器镜像机制。' },
  { from: 'C.3.2', to: 'C.4.4', type: 'hard', reason: '云原生服务网络、Ingress 与 Service Mesh 强依赖 TCP/IP 与网络路由协议。' },
  { from: 'C.4.2', to: 'C.4.4', type: 'soft', reason: '容器编排是现代云计算与微服务基础设施的核心承载平台。' },

  // C.4.5
  { from: 'C.2.2', to: 'C.4.5', type: 'hard', reason: '高并发系统与共识算法的核心难点在于多线程并发同步与状态安全。' },
  { from: 'C.4.1', to: 'C.4.5', type: 'hard', reason: '容灾与一致性设计建立在分布式系统异步通信与节点故障模型之上。' },
  { from: 'F.1.2', to: 'C.4.5', type: 'soft', reason: '共识算法的正确性证明与一致性哈希需要严谨的算法设计与分析基础。' },

  // P.5.6
  { from: 'P.1.2', to: 'P.5.6', type: 'hard', reason: '大型前端与后端架构的抽象封装与设计模式依赖面向对象与模块化设计。' },
  { from: 'P.5.1', to: 'P.5.6', type: 'hard', reason: '全栈现代架构是对传统 Web 开发在强类型、同构渲染与边缘计算维度的全面演进。' },
  { from: 'P.4.4', to: 'P.5.6', type: 'soft', reason: 'DDD 领域驱动设计是大型全栈系统防技术债与架构分层落地的核心思想。' },

  // S.1.4
  { from: 'S.1.2', to: 'S.1.4', type: 'hard', reason: '区块链交易防伪、数字签名与默克尔树底层建立在密码学基础之上。' },
  { from: 'C.4.1', to: 'S.1.4', type: 'hard', reason: '去中心化账本属于典型的分布式拜占庭容错点对点系统。' },
  { from: 'P.1.4', to: 'S.1.4', type: 'soft', reason: '智能合约需要精密控制变量内存布局与状态转移，需要严谨的程序设计能力。' },

  // P.2.5 (Rust)
  { from: 'P.1.1', to: 'P.2.5', type: 'hard', reason: 'Rust 学习需要扎实的程序设计基础与基本算法思想。' },
  { from: 'C.1.1', to: 'P.2.5', type: 'hard', reason: 'Rust 内存安全与栈堆内存管理需要理解计算机组成原理与底层内存模型。' },
  { from: 'P.2.2', to: 'P.2.5', type: 'soft', reason: 'C/C++ 手动内存管理与指针经验有助于深刻理解 Rust 所有权与借用检查器。' },
  { from: 'C.2.2', to: 'P.2.5', type: 'soft', reason: 'Rust 的无畏并发与 Tokio 异步运行时建立在并发同步理论之上。' },

  // P.2.3.1 (Python 高级)
  { from: 'P.1.1', to: 'P.2.3.1', type: 'hard', reason: '进阶 Python 需要掌握基础控制流、数据类型与函数式抽象。' },
  { from: 'P.2.3', to: 'P.2.3.1', type: 'hard', reason: '高级工程化是在 Python 科学计算与通用工具链之上的深度深化。' },
  { from: 'C.2.2', to: 'P.2.3.1', type: 'soft', reason: '理解 GIL、事件循环与多进程并发需要系统级并发同步基础。' }
]

export const AUGMENTED_ROUTES = [
  {
    name: '大模型与生成式AI系统路线',
    note: '从线性代数与Python基石出发，贯穿Transformer架构、大规模预训练、指令微调量化、向量检索到自主智能体工作流落地。',
    ids: ['M.3.1', 'P.2.3', 'A.2.3', 'A.2.3.1', 'A.2.3.2', 'A.3.5.1', 'A.3.5.2', 'A.3.5.3', 'A.4.5', 'A.4.1']
  },
  {
    name: '云原生与高并发分布式路线',
    note: '从单机体系结构与操作系统出发，递进到容器编排网格、共识算法与亿级高并发容灾体系。',
    ids: ['C.1.1', 'C.2.1', 'C.2.2', 'C.3.2', 'C.2.4', 'C.2.3', 'C.4.1', 'C.4.2', 'C.4.4', 'C.4.5']
  },
  {
    name: '现代全栈与企业级系统架构路线',
    note: '全栈工程体系化：涵盖强类型全栈开发、同构SSR/流式架构、DDD领域建模重构与云原生发布治理。',
    ids: ['P.1.1', 'F.1.1', 'P.1.2', 'C.3.2', 'D.1.2', 'P.4.4', 'P.4.5', 'P.5.1', 'P.5.6', 'C.4.4']
  },
  {
    name: 'Web3与去中心化信任系统路线',
    note: '以离散结构与密码学为基石，深入分布式账本、以太坊EVM执行机制、智能合约工程与零知识证明。',
    ids: ['M.5.3', 'P.1.1', 'F.1.1', 'S.1.2', 'C.2.2', 'C.4.1', 'S.1.3', 'S.1.4']
  },
  {
    name: 'Rust现代系统级开发路线',
    note: '从单机体系与系统编程出发，透彻掌握Rust所有权内存安全、无畏并发与异步系统，通向云原生与高并发分布式基础设施。',
    ids: ['C.1.1', 'P.1.1', 'F.1.1', 'C.2.1', 'C.2.2', 'P.2.5', 'C.4.1', 'C.4.4', 'C.4.5']
  },
  {
    name: 'Python现代工程与数据/AI全能路线',
    note: '以Python为核心主线，打通面向对象、CPython内核机制、高性能异步元编程、数据分析到大语言模型系统的全流程栈。',
    ids: ['P.1.1', 'F.1.1', 'P.1.2', 'P.2.3', 'P.2.3.1', 'D.3.1', 'A.2.3', 'A.3.5.1', 'A.4.5']
  }
]

function validatePackLocally(pack) {
  const errors = []
  if (pack.schema !== 'litree/pack-v1') errors.push('schema 必须为 litree/pack-v1')
  const domainIds = new Set(pack.domains.map((d) => d.id))
  const nodeMap = new Map()
  const unitIds = new Set()

  for (const n of pack.nodes) {
    if (nodeMap.has(n.id)) errors.push(`重复的节点 id: ${n.id}`)
    nodeMap.set(n.id, n)
    if (n.kind === 'unit') unitIds.add(n.id)
    if (!domainIds.has(n.domain)) errors.push(`节点 ${n.id} 的 domain ${n.domain} 未注册`)
  }

  for (const n of pack.nodes) {
    if (n.parent !== null && !nodeMap.has(n.parent)) {
      errors.push(`节点 ${n.id} 的父节点 ${n.parent} 不存在`)
    }
  }

  // Kahn 拓扑排序检查有向无环
  const inDeg = new Map()
  const adj = new Map()
  for (const uid of unitIds) {
    inDeg.set(uid, 0)
    adj.set(uid, [])
  }
  for (const e of pack.edges) {
    if (!unitIds.has(e.from) || !unitIds.has(e.to)) {
      errors.push(`边 ${e.from} -> ${e.to} 引用了非 unit 节点`)
      continue
    }
    adj.get(e.from).push(e.to)
    inDeg.set(e.to, inDeg.get(e.to) + 1)
  }

  const queue = [...unitIds].filter((uid) => inDeg.get(uid) === 0)
  let visited = 0
  while (queue.length > 0) {
    const cur = queue.pop()
    visited++
    for (const next of adj.get(cur)) {
      const d = inDeg.get(next) - 1
      inDeg.set(next, d)
      if (d === 0) queue.push(next)
    }
  }
  if (visited !== unitIds.size) {
    errors.push('Unit 依赖图中存在环形依赖（Cycle detected）')
  }

  // 路线校验
  for (const r of pack.routes ?? []) {
    for (const uid of r.ids) {
      if (!unitIds.has(uid)) errors.push(`路线 ${r.name} 包含非 unit 节点 ${uid}`)
    }
  }

  return { ok: errors.length === 0, errors }
}

export function augmentPack(basePack) {
  const pack = JSON.parse(JSON.stringify(basePack))
  const augmentedUnitIds = new Set(AUGMENTED_UNITS.map((u) => u.id))
  const augmentedRouteNames = new Set(AUGMENTED_ROUTES.map((r) => r.name))

  // 幂等支持：若包含已注入的节点/边/路线，先过滤剔除以确保可重复增量编译
  pack.nodes = pack.nodes.filter((n) => {
    if (augmentedUnitIds.has(n.id)) return false
    for (const uid of augmentedUnitIds) {
      if (n.id.startsWith(uid + '.')) return false
    }
    return true
  })
  pack.edges = pack.edges.filter(
    (e) => !augmentedUnitIds.has(e.from) && !augmentedUnitIds.has(e.to)
  )
  pack.routes = (pack.routes ?? []).filter((r) => !augmentedRouteNames.has(r.name))

  const existingNodeIds = new Set(pack.nodes.map((n) => n.id))

  const newNodes = []
  let newLeavesCount = 0
  let newChaptersCount = 0

  for (const u of AUGMENTED_UNITS) {
    const unitNode = {
      id: u.id,
      parent: u.parent,
      kind: 'unit',
      title: u.title,
      domain: u.domain,
      core: u.core,
      summary: u.summary,
      resources: u.resources,
      exercises: u.exercises,
      evidence: u.evidence
    }
    newNodes.push(unitNode)
    existingNodeIds.add(u.id)

    let unitLeafCount = 0
    u.chapters.forEach((chap, cIdx) => {
      const chapId = `${u.id}.c${cIdx}`
      const chapNode = {
        id: chapId,
        parent: u.id,
        kind: 'branch',
        title: { zh: chap.title },
        domain: u.domain
      }
      newNodes.push(chapNode)
      existingNodeIds.add(chapId)
      newChaptersCount++

      chap.leaves.forEach((leafTitle) => {
        const leafId = `${u.id}.k${unitLeafCount++}`
        const leafNode = {
          id: leafId,
          parent: chapId,
          kind: 'leaf',
          title: { zh: leafTitle },
          domain: u.domain
        }
        newNodes.push(leafNode)
        existingNodeIds.add(leafId)
        newLeavesCount++
      })
    })
  }

  pack.nodes.push(...newNodes)

  for (const edge of AUGMENTED_EDGES) {
    if (!existingNodeIds.has(edge.from) || !existingNodeIds.has(edge.to)) {
      throw new Error(`Edge 依赖节点不存在: ${edge.from} -> ${edge.to}`)
    }
    pack.edges.push(edge)
  }

  pack.routes = pack.routes ?? []
  for (const route of AUGMENTED_ROUTES) {
    for (const uid of route.ids) {
      if (!existingNodeIds.has(uid)) {
        throw new Error(`路线 "${route.name}" 包含不存在的单元 ID: ${uid}`)
      }
    }
    pack.routes.push(route)
  }

  return {
    pack,
    stats: {
      units: AUGMENTED_UNITS.length,
      chapters: newChaptersCount,
      leaves: newLeavesCount,
      edges: AUGMENTED_EDGES.length,
      routes: AUGMENTED_ROUTES.length
    }
  }
}

// 运行执行
const raw = JSON.parse(readFileSync(PACK_PATH, 'utf-8'))
const { pack, stats } = augmentPack(raw)

console.log(`[Augment] 数据注入完成：新增 ${stats.units} 单元 / ${stats.chapters} 章节 / ${stats.leaves} 叶子 / ${stats.edges} 边 / ${stats.routes} 路线`)

const val = validatePackLocally(pack)
if (!val.ok) {
  console.error('[Augment] 校验失败:', val.errors)
  process.exit(1)
}

writeFileSync(PACK_PATH, JSON.stringify(pack, null, 2), 'utf-8')
console.log(`[Augment] 成功覆写写入 ${PACK_PATH}，符合 litree/pack-v1 规范。`)
