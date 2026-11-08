import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  listPacks,
  loadPack,
  loadProgress,
  resolveDefaultPackId,
  saveProgress,
  emptyProgressForTest
} from '../../src/main/packStore'
import { miniPack } from '../fixtures/mini'

let packsDir: string
let progressDir: string
let deps: { packsDir: string; progressDir: string }

beforeEach(() => {
  packsDir = mkdtempSync(join(tmpdir(), 'litree-packs-'))
  progressDir = mkdtempSync(join(tmpdir(), 'litree-progress-'))
  deps = { packsDir, progressDir }
})
afterEach(() => {
  rmSync(packsDir, { recursive: true, force: true })
  rmSync(progressDir, { recursive: true, force: true })
})

function writePack(id: string): void {
  const pack = JSON.parse(JSON.stringify(miniPack)) as typeof miniPack
  pack.id = id
  writeFileSync(join(packsDir, `${id}.json`), JSON.stringify(pack), 'utf-8')
}

describe('listPacks', () => {
  it('返回 2 个合法包', () => {
    writePack('mini')
    writePack('mini2')
    const list = listPacks(deps)
    expect(list.map((p) => p.id).sort()).toEqual(['mini', 'mini2'])
  })
  it('损坏的包文件被跳过', () => {
    writePack('mini')
    writeFileSync(join(packsDir, 'bad.json'), '{{{', 'utf-8')
    expect(listPacks(deps).map((p) => p.id)).toEqual(['mini'])
  })
})

describe('loadPack', () => {
  it('正常加载', () => {
    writePack('mini')
    const r = loadPack(deps, 'mini')
    expect('id' in r && r.id === 'mini').toBe(true)
  })
  it('不存在 → error', () => {
    expect(loadPack(deps, 'missing')).toHaveProperty('error')
  })
  it('坏 JSON → error', () => {
    writeFileSync(join(packsDir, 'bad.json'), 'not json', 'utf-8')
    expect(loadPack(deps, 'bad')).toHaveProperty('error')
  })
})

describe('progress 存取', () => {
  it('缺失 → null；保存后读回一致', () => {
    expect(loadProgress(deps, 'mini')).toBeNull()
    const p = emptyProgressForTest('mini')
    saveProgress(deps, 'mini', p)
    expect(loadProgress(deps, 'mini')).toEqual(p)
  })
})

describe('resolveDefaultPackId', () => {
  beforeEach(() => {
    writePack('mini')
    writePack('mini2')
  })
  it('env 指定存在的 id → 用 env', () => {
    expect(resolveDefaultPackId(deps, 'mini2')).toBe('mini2')
  })
  it('env 指定不存在的 id → 回退首个（按 id 排序）', () => {
    expect(resolveDefaultPackId(deps, 'ghost')).toBe('mini')
  })
  it('env 未指定 → 首个', () => {
    expect(resolveDefaultPackId(deps, undefined)).toBe('mini')
  })
})
