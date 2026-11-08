import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { atomicWriteFileSync, readJsonFileSync } from '../../src/main/files'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'litree-files-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('atomicWriteFileSync', () => {
  it('写入内容一致且无 .tmp 残留', () => {
    const p = join(dir, 'data.json')
    atomicWriteFileSync(p, '{"a":1}')
    expect(readFileSync(p, 'utf-8')).toBe('{"a":1}')
    expect(readdirSync(dir)).not.toContain('data.json.tmp')
  })
  it('覆写旧值生效且仍无残留', () => {
    const p = join(dir, 'data.json')
    atomicWriteFileSync(p, 'v1')
    atomicWriteFileSync(p, 'v2')
    expect(readFileSync(p, 'utf-8')).toBe('v2')
    expect(readdirSync(dir)).toEqual(['data.json'])
  })
  it('嵌套不存在的目录直接抛错（不静默创建）', () => {
    expect(() => atomicWriteFileSync(join(dir, 'no-such', 'f.json'), 'x')).toThrow()
  })
})

describe('readJsonFileSync', () => {
  it('不存在 → null', () => {
    expect(readJsonFileSync(join(dir, 'missing.json'))).toBeNull()
  })
  it('损坏 JSON → null', () => {
    const p = join(dir, 'broken.json')
    atomicWriteFileSync(p, '{{{')
    expect(readJsonFileSync(p)).toBeNull()
  })
  it('合法 JSON 读回一致', () => {
    const p = join(dir, 'ok.json')
    atomicWriteFileSync(p, '{"x":42}')
    expect(readJsonFileSync<{ x: number }>(p)).toEqual({ x: 42 })
  })
})
