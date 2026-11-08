/// <reference lib="webworker" />
/** Worker 侧：直接运行 elkjs 的 worker 实现（自带协议、零外部依赖） */
// @ts-expect-error elkjs worker 实现无类型声明
import 'elkjs/lib/elk-worker.js'
