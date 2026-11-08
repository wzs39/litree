import { describe, expect, it } from 'vitest'
import { createWebApi } from '../../src/renderer/api/webApi'

interface MockFetchEntry {
  match: (url: string) => boolean
  status: number
  body: unknown
}

function makeFetch(entries: MockFetchEntry[]): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input)
    const entry = entries.find((e) => e.match(url))
    return {
      ok: entry ? entry.status < 400 : false,
      status: entry?.status ?? 404,
      json: async () => entry?.body
    } as Response
  }) as typeof fetch
}

class MemStorage {
  private map = new Map<string, string>()
  getItem(k: string): string | null {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v)
  }
  removeItem(k: string): void {
    this.map.delete(k)
  }
}

const manifest = [
  { id: 'cs-math', title: '计算机 + 数学', file: 'cs-math.json' },
  { id: 'dev-mini', title: '开发迷你树', file: 'dev-mini.json' }
]
const miniPackJson = {
  schema: 'litree/pack-v1',
  id: 'dev-mini',
  title: { zh: '开发迷你树' },
  domains: [],
  nodes: [],
  edges: []
}

function baseFetch(): typeof fetch {
  return makeFetch([
    { match: (u) => u.includes('index.json'), status: 200, body: manifest },
    { match: (u) => u.includes('dev-mini.json'), status: 200, body: miniPackJson }
  ])
}

describe('createWebApi', () => {
  it('listPacks 返回清单', async () => {
    const api = createWebApi(baseFetch(), new MemStorage())
    expect(await api.listPacks()).toEqual([
      { id: 'cs-math', title: '计算机 + 数学' },
      { id: 'dev-mini', title: '开发迷你树' }
    ])
  })

  it('defaultPackId 默认首个；override 存在且合法时生效', async () => {
    const storage = new MemStorage()
    const api = createWebApi(baseFetch(), storage)
    expect(await api.defaultPackId()).toBe('cs-math')
    storage.setItem('litree:pack-override', 'dev-mini')
    expect(await api.defaultPackId()).toBe('dev-mini')
    storage.setItem('litree:pack-override', 'ghost')
    expect(await api.defaultPackId()).toBe('cs-math')
  })

  it('loadPack 正常/404/坏内容', async () => {
    const storage = new MemStorage()
    const api = createWebApi(baseFetch(), storage)
    expect(await api.loadPack('dev-mini')).toMatchObject({ id: 'dev-mini' })
    expect(await api.loadPack('missing')).toHaveProperty('error')
    const badApi = createWebApi(
      makeFetch([
        { match: (u) => u.includes('index.json'), status: 200, body: manifest },
        { match: (u) => u.includes('bad.json'), status: 200, body: null }
      ]),
      storage
    )
    expect(await badApi.loadPack('bad')).toHaveProperty('error')
  })

  it('进度：缺失 → null；损坏 → null；存取一致', async () => {
    const storage = new MemStorage()
    const api = createWebApi(baseFetch(), storage)
    expect(await api.loadProgress('cs-math')).toBeNull()
    storage.setItem('litree:progress:cs-math', '{{{')
    expect(await api.loadProgress('cs-math')).toBeNull()
    const p = { packId: 'cs-math', lit: {}, learning: {}, xp: 0, history: [] }
    await api.saveProgress('cs-math', p)
    expect(await api.loadProgress('cs-math')).toEqual(p)
  })
})
