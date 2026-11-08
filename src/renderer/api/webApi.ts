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
  /** 带超时的 fetch（审查 P1：服务器停滞时 boot 永挂） */
  const fetchTimeout = async (url: string): Promise<Response> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    try {
      return await fetchFn(url, { signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  async function loadManifest(): Promise<ManifestEntry[]> {
    const res = await fetchTimeout('packs/index.json')
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
        const res = await fetchTimeout(`packs/${entry.file}`)
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
      if (raw === null || raw === undefined) return null
      try {
        const parsed: unknown = JSON.parse(raw)
        return isProgressShape(parsed) ? parsed : null
      } catch {
        // 损坏进度：保留原始串供人工恢复（审查 P1：静默清零风险）
        storage?.setItem(`${progressKey(packId)}:corrupt`, raw)
        return null
      }
    },

    async saveProgress(packId, progress) {
      try {
        storage?.setItem(progressKey(packId), JSON.stringify(progress))
      } catch (err) {
        // 配额超限等：不静默（审查 P1）
        console.error('进度保存失败', err)
        window.dispatchEvent(new CustomEvent('litree-save-error', { detail: String(err) }))
      }
    }
  }
}
