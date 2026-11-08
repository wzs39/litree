import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppStore } from '../../src/renderer/core/store'
import { createWebApi, type LitreeApi } from '../../src/renderer/api/webApi'
import { miniPack } from '../fixtures/mini'
import type { Progress } from '../../src/renderer/core/types'

interface SavedCall {
  packId: string
  progress: Progress
}

/** 内存 fake api：与 webApi 相同接口（vitest fake timers 驱动 debounce 断言） */
function makeFakeApi() {
  const saves: SavedCall[] = []
  const packs = new Map<string, unknown>([['mini', JSON.parse(JSON.stringify(miniPack))]])
  const progressStore = new Map<string, Progress>()
  const api: LitreeApi = {
    listPacks: async () => [{ id: 'mini', title: 'mini' }],
    loadPack: async (packId) => {
      const p = packs.get(packId)
      return p ? (p as typeof miniPack) : { error: 'missing' }
    },
    defaultPackId: async () => 'mini',
    loadProgress: async (packId) => progressStore.get(packId) ?? null,
    saveProgress: async (packId, progress) => {
      saves.push({ packId, progress })
      progressStore.set(packId, progress)
    }
  }
  return { api, saves }
}

let fake: ReturnType<typeof makeFakeApi>

beforeEach(() => {
  vi.useFakeTimers()
  fake = makeFakeApi()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('AppStore', () => {
  it('init：加载 pack 并校验，viewStack=[root]', async () => {
    const store = new AppStore(fake.api)
    await store.init()
    expect(store.pack.id).toBe('mini')
    expect(store.index.nodeById.size).toBe(11)
    expect(store.viewStack).toEqual(['root'])
    expect(store.progress.xp).toBe(0)
  })

  it('init：pack 校验失败抛错', async () => {
    const badApi = { ...fake.api, loadPack: async () => ({ error: 'x' }) } as LitreeApi
    const store = new AppStore(badApi)
    await expect(store.init()).rejects.toThrow()
  })

  it('lightLeaf：点亮 + xp+2 + 容器计数', async () => {
    const store = new AppStore(fake.api)
    await store.init()
    store.lightLeaf('u1.k1')
    expect(store.stateOf('u1.k1')).toBe('lit')
    expect(store.progress.xp).toBe(2)
    expect(store.progressOfContainer('u1')).toEqual({ lit: 1, total: 3 })
    expect(store.progressOfContainer('b1')).toEqual({ lit: 1, total: 5 })
  })

  it('debounce 500ms 后保存', async () => {
    const store = new AppStore(fake.api)
    await store.init()
    store.lightLeaf('u1.k1')
    expect(fake.saves).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(500)
    expect(fake.saves).toHaveLength(1)
    expect(fake.saves[0]!.progress.xp).toBe(2)
    store.lightLeaf('u1.k2')
    await vi.advanceTimersByTimeAsync(200)
    store.lightLeaf('u1.k3')
    await vi.advanceTimersByTimeAsync(500)
    expect(fake.saves).toHaveLength(2) // 连续点亮只触发最后一次保存
  })

  it('toggleLearning + subscribe 通知', async () => {
    const store = new AppStore(fake.api)
    await store.init()
    let calls = 0
    const unsub = store.subscribe(() => calls++)
    store.toggleLearning('b1')
    expect(store.stateOf('b1')).toBe('learning')
    unsub()
    store.toggleLearning('b1')
    expect(calls).toBe(1)
  })

  it('enter/back 变更 viewStack', async () => {
    const store = new AppStore(fake.api)
    await store.init()
    store.enter('b1')
    expect(store.viewStack).toEqual(['root', 'b1'])
    store.back()
    expect(store.viewStack).toEqual(['root'])
    store.back()
    expect(store.viewStack).toEqual(['root']) // 根不可再退
  })

  it('门控：locked 单元的叶子点亮抛错', async () => {
    const store = new AppStore(fake.api)
    await store.init()
    expect(() => store.lightLeaf('u2.k1')).toThrow(/前置/)
  })

  it('点亮 u1 全部叶子后 u2 解锁为 available', async () => {
    const store = new AppStore(fake.api)
    await store.init()
    store.lightLeaf('u1.k1')
    store.lightLeaf('u1.k2')
    expect(store.stateOf('u2')).toBe('locked')
    store.lightLeaf('u1.k3')
    expect(store.stateOf('u2')).toBe('available')
  })

  it('批量点亮 lightAllLeaves：xp 累计 +4，u3 解锁；对 locked 单元抛错', async () => {
    const store = new AppStore(fake.api)
    await store.init()
    expect(() => store.lightAllLeaves('u3')).toThrow(/前置/) // u3 尚 locked
    for (const id of ['u1.k1', 'u1.k2', 'u1.k3']) store.lightLeaf(id)
    store.lightAllLeaves('u2')
    expect(store.stateOf('u2')).toBe('lit')
    expect(store.progress.xp).toBe(10) // 3×2 + 2×2
    expect(store.stateOf('u3')).toBe('available')
  })

  it('webApi 接口与 AppStore 兼容（真实现冒烟，mock fetch/storage）', async () => {
    const storage = new Map<string, string>()
    const memStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k)
    }
    const fetchFn = (async (input: unknown) => {
      const url = String(input)
      const body = url.includes('index.json')
        ? [{ id: 'mini', title: 'mini', file: 'dev-mini.json' }]
        : miniPack
      return { ok: true, status: 200, json: async () => body } as Response
    }) as typeof fetch
    const store = new AppStore(createWebApi(fetchFn, memStorage))
    await store.init()
    store.lightLeaf('u1.k1')
    await vi.advanceTimersByTimeAsync(500)
    expect(storage.get('litree:progress:mini')).toBeDefined()
    const store2 = new AppStore(createWebApi(fetchFn, memStorage))
    await store2.init()
    expect(store2.stateOf('u1.k1')).toBe('lit') // 重新 init 读回持久化进度
  })
})

describe('AppStore.flushSave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fake = makeFakeApi()
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  it('debounce 未到即 flush 立即落盘', async () => {
    const store = new AppStore(fake.api)
    await store.init()
    store.lightLeaf('u1.k1')
    expect(fake.saves).toHaveLength(0)
    store.flushSave()
    expect(fake.saves).toHaveLength(1)
    expect(fake.saves[0]!.progress.xp).toBe(2)
    await vi.advanceTimersByTimeAsync(500)
    expect(fake.saves).toHaveLength(1) // 不重复保存
  })
})
