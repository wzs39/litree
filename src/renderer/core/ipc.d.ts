import type { Pack, Progress } from './types'

declare global {
  interface Window {
    litree: {
      listPacks(): Promise<{ id: string; title: string }[]>
      loadPack(packId: string): Promise<Pack | { error: string }>
      defaultPackId(): Promise<string>
      loadProgress(packId: string): Promise<Progress | null>
      saveProgress(packId: string, progress: Progress): Promise<void>
    }
  }
}

export {}
