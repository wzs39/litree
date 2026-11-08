import { contextBridge, ipcRenderer } from 'electron'

/** 白名单 API（spec §3）：renderer 唯一的宿主能力入口 */
const api = {
  listPacks: (): Promise<{ id: string; title: string }[]> => ipcRenderer.invoke('pack:list'),
  loadPack: (packId: string): Promise<unknown> => ipcRenderer.invoke('pack:load', packId),
  defaultPackId: (): Promise<string> => ipcRenderer.invoke('pack:default'),
  loadProgress: (packId: string): Promise<unknown> => ipcRenderer.invoke('progress:load', packId),
  saveProgress: (packId: string, progress: unknown): Promise<void> =>
    ipcRenderer.invoke('progress:save', packId, progress)
}

contextBridge.exposeInMainWorld('litree', api)
