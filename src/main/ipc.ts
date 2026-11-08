/** IPC 白名单注册（spec §3）：仅 5 个 channel，全部经 packStore */
import { ipcMain } from 'electron'
import { listPacks, loadPack, loadProgress, resolveDefaultPackId, saveProgress, type PackStoreDeps } from './packStore'
import type { Progress } from '../renderer/core/types'

export function registerPackIpc(
  deps: PackStoreDeps,
  getEnvPackId: () => string | undefined
): void {
  ipcMain.handle('pack:list', () => listPacks(deps))
  ipcMain.handle('pack:load', (_e, packId: string) => loadPack(deps, packId))
  ipcMain.handle('pack:default', () => resolveDefaultPackId(deps, getEnvPackId()))
  ipcMain.handle('progress:load', (_e, packId: string) => loadProgress(deps, packId))
  ipcMain.handle('progress:save', (_e, packId: string, progress: Progress) => {
    saveProgress(deps, packId, progress)
  })
}
