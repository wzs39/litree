/** 主进程文件工具（spec §7）：写临时文件后原子替换，防崩溃损坏 */
import * as fs from 'fs'
import * as path from 'path'

export function atomicWriteFileSync(filePath: string, data: string): void {
  const tmpPath = `${filePath}.tmp`
  fs.writeFileSync(tmpPath, data, 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

export function readJsonFileSync<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
  } catch {
    return null
  }
}

/** 确保目录存在（递归），供 userData 初始化使用 */
export function ensureDirSync(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true })
}

export function joinPath(...parts: string[]): string {
  return path.join(...parts)
}
