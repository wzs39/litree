import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildGraphIndex } from '../../src/renderer/core/graph'
import { validatePack } from '../../src/renderer/core/schema'
import { AppStore } from '../../src/renderer/core/store'
import { hashToStack, stackToHash } from '../../src/renderer/core/router'
import { miniPack } from '../fixtures/mini'

const validation = validatePack(JSON.parse(JSON.stringify(miniPack)))
if (!validation.ok) throw new Error('fixture 校验失败: ' + validation.errors.join('; '))
const index = buildGraphIndex(validation.pack)

describe('stackToHash / hashToStack', () => {
  it('根视图 → #/home', () => {
    expect(stackToHash(['root'])).toBe('#/home')
  })
  it('钻取链 → #/tree/…', () => {
    expect(stackToHash(['root', 'b1', 'u1'])).toBe('#/tree/root/b1/u1')
  })
  it('home 解析回根栈', () => {
    expect(hashToStack('#/home', index)).toEqual({ stack: ['root'], valid: true })
  })
  it('合法钻取链解析（parent 链逐级校验）', () => {
    expect(hashToStack('#/tree/root/b1/u1', index)).toEqual({
      stack: ['root', 'b1', 'u1'],
      valid: true
    })
  })
  it('断链 hash（b1 的 parent 不是根级）→ invalid 回退', () => {
    expect(hashToStack('#/tree/root/u1', index)).toEqual({ stack: ['root'], valid: false })
  })
  it('不存在的节点 → invalid 回退', () => {
    expect(hashToStack('#/tree/root/b1/ghost', index)).toEqual({ stack: ['root'], valid: false })
  })
  it('非 home/tree 前缀 → invalid', () => {
    expect(hashToStack('#/whatever', index).valid).toBe(false)
  })
})

describe('AppStore.setStack（路由回写）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  it('设置视图栈并通知订阅者', async () => {
    const saves: unknown[] = []
    const api = {
      listPacks: async () => [{ id: 'mini', title: 'mini' }],
      loadPack: async () => JSON.parse(JSON.stringify(miniPack)),
      defaultPackId: async () => 'mini',
      loadProgress: async () => null,
      saveProgress: async () => {
        saves.push(1)
      }
    }
    const store = new AppStore(api)
    await store.init()
    let calls = 0
    store.subscribe(() => calls++)
    store.setStack(['root', 'b1'])
    expect(store.viewStack).toEqual(['root', 'b1'])
    expect(calls).toBe(1)
  })
})
