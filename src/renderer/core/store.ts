/** 应用状态容器（spec §5/§7）：持有 pack/进度/视图栈，订阅驱动视图重渲染 */
import type { LitreeApi } from '../api/webApi'
import {
  aggregateState,
  buildGraphIndex,
  leafAvailable,
  unitAvailable,
  type GraphIndex,
  type NodeState
} from './graph'
import { emptyProgress, lightLeaf, unlightLeaf, orphanedLitIds, toggleLearning } from './progress'
import { validatePack } from './schema'
import type { Pack, Progress } from './types'

const SAVE_DEBOUNCE_MS = 500

export class AppStore {
  pack!: Pack
  index!: GraphIndex
  progress!: Progress
  viewStack: string[] = ['root']

  private listeners = new Set<() => void>()
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly api: LitreeApi) {}

  async init(): Promise<void> {
    const packId = await this.api.defaultPackId()
    const loaded = await this.api.loadPack(packId)
    if ('error' in loaded) throw new Error(loaded.error)
    const v = validatePack(loaded)
    if (!v.ok) throw new Error('数据包校验失败: ' + v.errors.join('; '))
    this.pack = v.pack
    this.index = buildGraphIndex(this.pack)
    this.progress =
      (await this.api.loadProgress(this.pack.id)) ?? emptyProgress(this.pack.id)
    this.notify()
  }

  /** litLeaves 记忆化：progress 换代时失效（审查实测 20ms/点击的根因之一） */
  litLeaves(): Set<string> {
    if (this.litCache === null || this.litCacheProgress !== this.progress) {
      this.litCache = new Set(Object.keys(this.progress.lit))
      this.litCacheProgress = this.progress
    }
    return this.litCache
  }

  private litCache: Set<string> | null = null
  private litCacheProgress: Progress | null = null
  private stateCache: Map<string, NodeState> | null = null
  private stateCacheProgress: Progress | null = null

  stateOf(id: string): NodeState {
    if (this.stateCache === null || this.stateCacheProgress !== this.progress) {
      this.stateCache = new Map()
      this.stateCacheProgress = this.progress
    }
    const cached = this.stateCache.get(id)
    if (cached !== undefined) return cached
    const st = aggregateState(id, this.index, this.litLeaves(), this.progress.learning)
    this.stateCache.set(id, st)
    return st
  }

  progressOfContainer(id: string): { lit: number; total: number } {
    const leaves = this.index.leavesOf(id)
    const litN = leaves.filter((l) => this.progress.lit[l.id] !== undefined).length
    return { lit: litN, total: leaves.length }
  }

  /** 点亮知识点：硬门控（默认所属单元的 hard 前置须全部点亮；force=true 支持自由学习未解锁内容）；500ms debounce 自动保存 */
  lightLeaf(id: string, force = false): void {
    const node = this.index.nodeById.get(id)
    if (node?.kind !== 'leaf') throw new Error('只有知识点可点亮: ' + id)
    if (!force && !leafAvailable(id, this.index, this.litLeaves())) {
      throw new Error('前置未满足，无法点亮: ' + id)
    }
    this.progress = lightLeaf(this.progress, id, this.index, new Date().toISOString())
    this.scheduleSave()
    this.notify()
  }

  /** 撤回知识点点亮：重新置为未学状态并扣减积分 */
  unlightLeaf(id: string): void {
    const node = this.index.nodeById.get(id)
    if (node?.kind !== 'leaf') throw new Error('只有知识点可撤回点亮: ' + id)
    if (this.progress.lit[id] === undefined) return
    this.progress = unlightLeaf(this.progress, id)
    this.scheduleSave()
    this.notify()
  }

  /** 批量点亮本单元全部知识点（spec §4.2）：默认仅当单元解锁；force=true 支持自由学习；逐个计分 */
  lightAllLeaves(unitId: string, force = false): void {
    const node = this.index.nodeById.get(unitId)
    if (node?.kind !== 'unit') throw new Error('批量点亮只作用于单元: ' + unitId)
    if (!force && !unitAvailable(unitId, this.index, this.litLeaves())) {
      throw new Error('前置未满足，无法批量点亮: ' + unitId)
    }
    for (const leaf of this.index.leavesOf(unitId)) {
      this.progress = lightLeaf(this.progress, leaf.id, this.index, new Date().toISOString())
    }
    this.scheduleSave()
    this.notify()
  }

  /** 批量撤回本单元全部已点亮知识点 */
  unlightAllLeaves(unitId: string): void {
    const node = this.index.nodeById.get(unitId)
    if (node?.kind !== 'unit') throw new Error('批量撤回只作用于单元: ' + unitId)
    for (const leaf of this.index.leavesOf(unitId)) {
      if (this.progress.lit[leaf.id] !== undefined) {
        this.progress = unlightLeaf(this.progress, leaf.id)
      }
    }
    this.scheduleSave()
    this.notify()
  }

  toggleLearning(id: string): void {
    this.progress = toggleLearning(this.progress, id, new Date().toISOString().slice(0, 10))
    this.scheduleSave()
    this.notify()
  }

  enter(id: string): void {
    if (this.viewStack.includes(id)) return // 查重：重复 id 会生成非法 hash
    this.viewStack.push(id)
    this.notify()
  }

  back(): void {
    if (this.viewStack.length > 1) {
      this.viewStack.pop()
      this.notify()
    }
  }

  /** 跳到面包屑第 index 层 */
  jumpTo(index: number): void {
    this.viewStack = this.viewStack.slice(0, index + 1)
    this.notify()
  }

  /** 整栈替换（hash 路由回写用） */
  setStack(stack: string[]): void {
    this.viewStack = stack
    this.notify()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn()
      } catch (err) {
        console.error('store 订阅者异常', err)
      }
    }
  }

  /** 立即落盘（供面板 note 等即时保存场景） */
  saveNow(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    void this.api.saveProgress(this.pack.id, this.progress)
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.api.saveProgress(this.pack.id, this.progress)
    }, SAVE_DEBOUNCE_MS)
  }

  /** 立即落盘待保存进度（页面卸载前调用，spec §7 防丢失） */
  flushSave(): void {
    if (this.saveTimer === null) return
    clearTimeout(this.saveTimer)
    this.saveTimer = null
    void this.api.saveProgress(this.pack.id, this.progress)
  }

  /** 孤立点亮 id 数量（pack 更新后残留，spec §12） */
  orphanCount(): number {
    return orphanedLitIds(this.progress, this.index).length
  }

  /** 一键清理孤立点亮记录（数据操作，不影响点亮语义） */
  cleanOrphans(): void {
    for (const id of orphanedLitIds(this.progress, this.index)) {
      delete this.progress.lit[id]
    }
    this.scheduleSave()
    this.notify()
  }
}
