/** 数据包存取（spec §3/§7）：纯函数、注入目录便于测试 */
import * as fs from 'fs'
import { join } from 'path'
import { atomicWriteFileSync, readJsonFileSync } from './files'
import { validatePack } from '../renderer/core/schema'
import type { Pack, Progress } from '../renderer/core/types'

export interface PackStoreDeps {
  packsDir: string
  progressDir: string
}

export function listPacks(deps: PackStoreDeps): { id: string; title: string }[] {
  let files: string[] = []
  try {
    files = fs.readdirSync(deps.packsDir).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  const out: { id: string; title: string }[] = []
  for (const f of files) {
    const raw = readJsonFileSync<unknown>(join(deps.packsDir, f))
    if (raw === null) continue
    const r = validatePack(raw)
    if (r.ok) out.push({ id: r.pack.id, title: r.pack.title.zh })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

export function loadPack(deps: PackStoreDeps, packId: string): Pack | { error: string } {
  const raw = readJsonFileSync<unknown>(join(deps.packsDir, `${packId}.json`))
  if (raw === null) return { error: `数据包不存在或已损坏: ${packId}` }
  const r = validatePack(raw)
  if (!r.ok) return { error: `数据包校验失败 ${packId}: ${r.errors.join('; ')}` }
  return r.pack
}

function isProgressShape(v: unknown): v is Progress {
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o['packId'] === 'string' &&
    o['lit'] !== null &&
    typeof o['lit'] === 'object' &&
    o['learning'] !== null &&
    typeof o['learning'] === 'object'
  )
}

export function loadProgress(deps: PackStoreDeps, packId: string): Progress | null {
  const raw = readJsonFileSync<unknown>(join(deps.progressDir, `${packId}.json`))
  return isProgressShape(raw) ? raw : null
}

export function saveProgress(deps: PackStoreDeps, packId: string, progress: Progress): void {
  atomicWriteFileSync(join(deps.progressDir, `${packId}.json`), JSON.stringify(progress))
}

export function resolveDefaultPackId(deps: PackStoreDeps, envPackId?: string): string {
  const ids = listPacks(deps).map((p) => p.id)
  if (envPackId !== undefined && ids.includes(envPackId)) return envPackId
  return ids[0] ?? 'dev-mini'
}

/** 仅供测试构造空进度（renderer/core/progress 依赖 GraphIndex，主进程侧用轻量版） */
export function emptyProgressForTest(packId: string): Progress {
  return { packId, lit: {}, learning: {}, xp: 0, history: [] }
}
