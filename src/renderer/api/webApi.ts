/** Web 宿主 API（spec §3）：fetch 数据包 + localStorage 进度。
 * 依赖注入 fetch/storage 便于测试；LitreeApi 接口与原 preload 白名单一致。 */
import type { Pack, Progress } from '../core/types'

export interface PackSummary {
  id: string
  title: string
}

export interface LitreeApi {
  listPacks(): Promise<PackSummary[]>
  loadPack(packId: string): Promise<Pack | { error: string }>
  defaultPackId(): Promise<string>
  loadProgress(packId: string): Promise<Progress | null>
  saveProgress(packId: string, progress: Progress): Promise<void>
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const OVERRIDE_KEY = 'litree:pack-override'
const progressKey = (packId: string) => `litree:progress:${packId}`

interface ManifestEntry {
  id: string
  title: string
  file: string
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

export function createWebApi(
  fetchFn: typeof fetch = fetch,
  storage: StorageLike | null = typeof localStorage !== 'undefined' ? localStorage : null
): LitreeApi {
  async function loadManifest(): Promise<ManifestEntry[]> {
    const res = await fetchFn('packs/index.json')
    if (!res.ok) throw new Error(`packs/index.json 加载失败: ${res.status}`)
    return (await res.json()) as ManifestEntry[]
  }

  return {
    async listPacks(): Promise<PackSummary[]> {
      const manifest = await loadManifest()
      return manifest.map(({ id, title }) => ({ id, title }))
    },

    async loadPack(packId) {
      try {
        const manifest = await loadManifest()
        const entry = manifest.find((m) => m.id === packId)
        if (!entry) return { error: `数据包不存在: ${packId}` }
        const res = await fetchFn(`packs/${entry.file}`)
        if (!res.ok) return { error: `数据包加载失败: ${packId} (${res.status})` }
        const raw: unknown = await res.json()
        // 校验在 AppStore 层做（需要中文错误聚合）；此处仅做最低形状检查
        if (raw === null || typeof raw !== 'object') return { error: `数据包内容损坏: ${packId}` }
        return raw as Pack
      } catch (err) {
        return { error: String(err) }
      }
    },

    async defaultPackId(): Promise<string> {
      const override = storage?.getItem(OVERRIDE_KEY)
      if (override) {
        const manifest = await loadManifest()
        if (manifest.some((m) => m.id === override)) return override
      }
      const manifest = await loadManifest()
      return manifest[0]?.id ?? 'dev-mini'
    },

    async loadProgress(packId) {
      const raw = storage?.getItem(progressKey(packId))
      if (raw === null) return null
      try {
        const parsed: unknown = JSON.parse(raw)
        return isProgressShape(parsed) ? parsed : null
      } catch {
        return null
      }
    },

    async saveProgress(packId, progress) {
      storage?.setItem(progressKey(packId), JSON.stringify(progress))
    }
  }
}
