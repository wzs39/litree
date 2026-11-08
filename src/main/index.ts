import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { ensureDirSync } from './files'
import { registerPackIpc } from './ipc'
import type { PackStoreDeps } from './packStore'

function builtinPacksDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'packs')
    : join(app.getAppPath(), 'resources', 'packs')
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 1000,
    title: 'LitTree',
    backgroundColor: '#0B1220',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  const packsDir = builtinPacksDir()
  const progressDir = join(app.getPath('userData'), 'progress')
  ensureDirSync(packsDir)
  ensureDirSync(progressDir)
  const deps: PackStoreDeps = { packsDir, progressDir }
  registerPackIpc(deps, () => process.env['LITREE_PACK_ID'])
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
