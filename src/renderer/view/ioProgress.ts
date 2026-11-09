/**
 * view/ioProgress.ts — 进度导出 / 导入（README 承诺但没有）
 *
 * 三层拆开，方便「纯逻辑可单测、浏览器路径可手工验证」：
 *  1) 纯函数：exportFileName / buildExportPayload / parseProgressJson / mergeProgress
 *     —— 不碰 DOM、不碰 Blob、不碰 URL，Node 环境直接测。
 *  2) 下载与选择文件：deps 注入（createObjectUrl / revokeObjectUrl / pickFile），
 *     默认走浏览器 Blob + URL.createObjectURL + 临时 <a download>。
 *     明确不使用 window.open，也不使用超长 data URI（超长字符串会被部分浏览器截断）。
 *  3) UI：两个按钮 + 一个隐藏 <input type=file accept=".json">。
 *
 * 冲突策略：导入时若已有进度，走 deps.onConfirmOverwrite(existing, incoming)；
 * 提供 merge（并集 + xp 按叶子数重算 + history 合并按时间排序后修剪 500）
 * 与 replace（直接采用 incoming）两种模式。
 */
import type { LitRecord, Progress } from '../core/types'

export const IO_PROGRESS_IDS = {
  exportButton: 'export-progress',
  importButton: 'import-progress',
  fileInput: 'import-file'
} as const

/** 导出文件的 schema 标识（与既有 litree/pack-v1 命名风格一致） */
export const PROGRESS_SCHEMA = 'litree/progress-v1'
/** 单测与默认实现都用它：与 core/progress 的 XP_PER_LEAF 保持一致，此处刻意自带，避免耦合队友正在改的模块 */
export const DEFAULT_XP_PER_LEAF = 2
/** history 修剪上限，与 core/progress.lightLeaf 的既有行为一致 */
export const HISTORY_LIMIT = 500

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function fmtDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** 文件名：litree-<packId>-<YYYYMMDD>.json（packId 里的非法文件名字符替换为 -） */
export function exportFileName(packId: string, at: Date = new Date()): string {
  const safe = packId.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'pack'
  return `litree-${safe}-${fmtDay(at)}.json`
}

/** 导出载荷：带版本号的 JSON 对象（可直接 JSON.stringify） */
export function buildExportPayload(progress: Progress, at: Date = new Date()): Record<string, unknown> {
  return {
    schema: PROGRESS_SCHEMA,
    exportedAt: at.toISOString(),
    packId: progress.packId,
    lit: progress.lit,
    learning: progress.learning,
    xp: progress.xp,
    history: progress.history
  }
}

export function serializeProgress(progress: Progress, at: Date = new Date()): string {
  return JSON.stringify(buildExportPayload(progress, at), null, 2)
}

export interface ParseResultOk {
  ok: true
  progress: Progress
  warnings: string[]
  /** 导入文件的 schema 与导出时间，供 UI 展示 */
  meta: { schema: string | null; exportedAt: string | null }
}
export interface ParseResultErr {
  ok: false
  error: string
  warnings: string[]
}
export type ParseResult = ParseResultOk | ParseResultErr

export interface ParseOptions {
  /** 与当前 packId 不一致时给警告（不判失败：进度文件本身带 packId，lead 可据此决定落哪个包） */
  expectedPackId?: string
  /** xp 缺失/非法时的兜底：按 lit 数量 * xpPerLeaf 重算 */
  xpPerLeaf?: number
}

/**
 * 严格校验 + 归一化。错误信息一律中文，且指出「坏在哪个字段」，
 * 便于用户知道是导错文件还是文件被改坏。
 */
export function parseProgressJson(text: string, opts: ParseOptions = {}): ParseResult {
  const warnings: string[] = []
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return { ok: false, error: `文件不是合法的 JSON：${String(err)}`, warnings }
  }
  if (!isPlainObject(raw)) {
    return { ok: false, error: '文件内容必须是 JSON 对象（顶层不能是数组或字符串）', warnings }
  }

  const schema = typeof raw['schema'] === 'string' ? (raw['schema'] as string) : null
  if (schema === null) {
    warnings.push('缺少 schema 字段，按旧版进度格式尽力解析')
  } else if (schema !== PROGRESS_SCHEMA) {
    return { ok: false, error: `格式版本不匹配：期望 ${PROGRESS_SCHEMA}，实际 ${schema}`, warnings }
  }
  const exportedAtRaw = raw['exportedAt']
  const exportedAt = typeof exportedAtRaw === 'string' ? exportedAtRaw : null
  if (exportedAt !== null && Number.isNaN(Date.parse(exportedAt))) {
    warnings.push(`exportedAt 不是合法时间：${exportedAt}`)
  }

  const packIdRaw = raw['packId']
  if (typeof packIdRaw !== 'string' || packIdRaw.length === 0) {
    return { ok: false, error: '缺少 packId 字段：这不是 litree 的进度文件', warnings }
  }
  if (opts.expectedPackId !== undefined && packIdRaw !== opts.expectedPackId) {
    warnings.push(
      `文件里的学科包是「${packIdRaw}」，与当前学科包「${opts.expectedPackId}」不同；导入后不会合并到当前包`
    )
  }

  // lit：{ id: {at, note?} }
  const litRaw = raw['lit']
  if (litRaw === undefined) {
    warnings.push('缺少 lit 字段，按空集合处理')
  }
  const lit: Record<string, LitRecord> = {}
  if (litRaw !== undefined) {
    if (!isPlainObject(litRaw)) {
      return { ok: false, error: 'lit 字段必须是对象（知识点 id → 点亮记录）', warnings }
    }
    for (const [id, v] of Object.entries(litRaw)) {
      if (id.length === 0) {
        warnings.push('lit 里有空 id，已忽略')
        continue
      }
      if (isPlainObject(v)) {
        const at = typeof v['at'] === 'string' ? (v['at'] as string) : ''
        const rec: LitRecord = { at: at.length > 0 ? at : '' }
        if (at.length === 0) warnings.push(`lit.${id} 缺少 at 时间`)
        if (typeof v['note'] === 'string') rec.note = v['note'] as string
        lit[id] = rec
      } else if (typeof v === 'string') {
        lit[id] = { at: v } // 兼容「id → 时间字符串」的旧写法
      } else if (v === null || v === true) {
        lit[id] = { at: '' } // 兼容「id → true」的更旧写法
      } else {
        warnings.push(`lit.${id} 的记录形状不认识，已忽略`)
      }
    }
  }

  // learning：{ id: 日期串 }
  const learningRaw = raw['learning']
  if (learningRaw === undefined) warnings.push('缺少 learning 字段，按空集合处理')
  const learning: Record<string, string> = {}
  if (learningRaw !== undefined) {
    if (!isPlainObject(learningRaw)) {
      return { ok: false, error: 'learning 字段必须是对象（知识点 id → 日期）', warnings }
    }
    for (const [id, v] of Object.entries(learningRaw)) {
      if (id.length === 0) continue
      if (typeof v === 'string') learning[id] = v
      else if (typeof v === 'number') learning[id] = String(v)
      else warnings.push(`learning.${id} 的值不是日期，已忽略`)
    }
  }

  // xp：必须是数字，非法则按 lit 数量重算
  const xpRaw = raw['xp']
  let xp: number
  if (typeof xpRaw === 'number' && Number.isFinite(xpRaw) && xpRaw >= 0) {
    xp = xpRaw
  } else {
    if (xpRaw !== undefined) warnings.push(`xp 字段不是合法数字（${typeof xpRaw}），按点亮数重算`)
    const per = opts.xpPerLeaf ?? DEFAULT_XP_PER_LEAF
    xp = Object.keys(lit).length * per
  }

  // history：数组化，逐项补齐
  const historyRaw = raw['history']
  const per = opts.xpPerLeaf ?? DEFAULT_XP_PER_LEAF
  type Entry = { id: string; at: string; xp: number }
  let history: Entry[] = []
  if (historyRaw === undefined) {
    warnings.push('缺少 history 字段，按空数组处理')
  } else if (!Array.isArray(historyRaw)) {
    warnings.push('history 字段不是数组，已丢弃并重新生成')
    history = Object.entries(lit)
      .map(([id, r]) => ({ id, at: r.at, xp: per }))
      .sort((a, b) => a.at.localeCompare(b.at))
  } else {
    let dropped = 0
    for (const item of historyRaw) {
      if (!isPlainObject(item) || typeof item['id'] !== 'string' || item['id'].length === 0) {
        dropped++
        continue
      }
      const at = typeof item['at'] === 'string' ? (item['at'] as string) : ''
      const xpItem =
        typeof item['xp'] === 'number' && Number.isFinite(item['xp']) ? (item['xp'] as number) : per
      history.push({ id: item['id'] as string, at, xp: xpItem })
    }
    if (dropped > 0) warnings.push(`history 里有 ${dropped} 条记录形状不认识，已忽略`)
  }
  // 修剪：按时间排序后保留最近 HISTORY_LIMIT 条
  history = history.sort((a, b) => a.at.localeCompare(b.at))
  if (history.length > HISTORY_LIMIT) {
    warnings.push(`history 超过 ${HISTORY_LIMIT} 条，只保留最近 ${HISTORY_LIMIT} 条`)
    history = history.slice(history.length - HISTORY_LIMIT)
  }

  return {
    ok: true,
    progress: { packId: packIdRaw, lit, learning, xp, history },
    warnings,
    meta: { schema, exportedAt }
  }
}

export type MergeMode = 'merge' | 'replace'

export interface MergeOptions {
  xpPerLeaf?: number
  /** merge 模式下 learning 的取舍：union（默认）/ incoming / existing */
  learningPolicy?: 'union' | 'incoming' | 'existing'
  /** merge 模式下 lit 的时间戳冲突取谁：incoming（默认，保留最近一次点亮时间）/ existing */
  litAtPolicy?: 'incoming' | 'existing'
}

/**
 * merge = lit/learning 取并集 + xp 按合并后的叶子数重算 + history 合并后按时间排序修剪 500。
 * replace = 直接用 incoming（packId 保留 existing 的，因为落盘键由 lead 决定）。
 */
export function mergeProgress(
  existing: Progress,
  incoming: Progress,
  mode: MergeMode = 'merge',
  opts: MergeOptions = {}
): Progress {
  const per = opts.xpPerLeaf ?? DEFAULT_XP_PER_LEAF
  if (mode === 'replace') {
    return {
      packId: existing.packId,
      lit: { ...incoming.lit },
      learning: { ...incoming.learning },
      xp: Object.keys(incoming.lit).length * per,
      history: incoming.history.slice().sort((a, b) => a.at.localeCompare(b.at)).slice(-HISTORY_LIMIT)
    }
  }
  const litPolicy = opts.litAtPolicy ?? 'incoming'
  const learningPolicy = opts.learningPolicy ?? 'union'
  const lit: Record<string, LitRecord> = { ...existing.lit }
  for (const [id, rec] of Object.entries(incoming.lit)) {
    const before = lit[id]
    if (before === undefined) lit[id] = { ...rec }
    else if (litPolicy === 'incoming') lit[id] = { ...rec, at: rec.at.length > 0 ? rec.at : before.at }
    else lit[id] = { ...before, note: rec.note ?? before.note }
  }
  const learning: Record<string, string> =
    learningPolicy === 'incoming'
      ? { ...incoming.learning }
      : learningPolicy === 'existing'
        ? { ...existing.learning }
        : { ...existing.learning, ...incoming.learning }
  const history = [...existing.history, ...incoming.history]
    .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id && x.at === e.at) === i)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-HISTORY_LIMIT)
  return {
    packId: existing.packId,
    lit,
    learning,
    xp: Object.keys(lit).length * per,
    history
  }
}

/** 导入差异摘要，供确认框展示 */
export function progressDelta(existing: Progress, incoming: Progress): {
  added: number
  removed: number
  same: number
  incomingXp: number
} {
  const a = new Set(Object.keys(existing.lit))
  const b = new Set(Object.keys(incoming.lit))
  let same = 0
  for (const id of b) if (a.has(id)) same++
  return {
    added: b.size - same,
    removed: a.size - same,
    same,
    incomingXp: Object.keys(incoming.lit).length * DEFAULT_XP_PER_LEAF
  }
}

// ───────────────────────────── 浏览器 IO 适配 ─────────────────────────────

/** 结构化的 File：单测可用 { name, text() } 的假对象替代 */
export interface LikeFile {
  name?: string
  size?: number
  text(): Promise<string>
}

export interface IoProgressDeps {
  /** 当前进度（导出内容 + 冲突判定的基准） */
  getProgress: () => Progress
  /** 导入成功后的落地；lead 在此写 store.progress 并 saveNow() */
  onApply: (progress: Progress, info: { mode: MergeMode; warnings: string[] }) => void
  /** 模式选择：默认 merge；lead 也可在 UI 上给开关 */
  mode?: MergeMode
  /** 解析时的当前 packId（用于 packId 不匹配警告） */
  expectedPackId?: () => string | undefined
  /** 已有进度且导入会改写它时的确认；返回 false 放弃导入 */
  onConfirmOverwrite?: (existing: Progress, incoming: Progress) => Promise<boolean> | boolean
  /** 结果/错误提示（中文文案已备好） */
  onMessage?: (text: string, kind: 'info' | 'warn' | 'error') => void
  /** 以下三个注入点用于单测与降级；默认走浏览器实现 */
  blobFactory?: (parts: string[], type: string) => { size: number }
  createObjectUrl?: (blob: unknown) => string
  revokeObjectUrl?: (url: string) => void
  /** 文件选择：默认用隐藏 <input type=file>；单测可注入 */
  pickFile?: () => Promise<LikeFile | null>
}

export interface IoProgressHandle {
  readonly root: HTMLElement
  readonly exportButton: HTMLButtonElement
  readonly importButton: HTMLButtonElement
  readonly fileInput: HTMLInputElement
  /** 程序化导出（工具栏按钮直接调它） */
  exportNow(): { fileName: string; bytes: number } | null
  /** 程序化导入（绕过文件选择器，供 lead 的拖拽/测试用） */
  importFromFile(file: LikeFile): Promise<{ ok: boolean; error?: string; warnings?: string[] }>
  setMode(mode: MergeMode): void
  readonly currentMode: MergeMode
  destroy(): void
}

export function createIoProgress(mount: HTMLElement, deps: IoProgressDeps): IoProgressHandle {
  let mode: MergeMode = deps.mode ?? 'merge'
  const listeners: { el: EventTarget; type: string; fn: (e: Event) => void }[] = []
  function on(el: EventTarget, type: string, fn: (e: Event) => void): void {
    el.addEventListener(type, fn)
    listeners.push({ el, type, fn })
  }

  const root = document.createElement('div')
  root.className = 'ui-io'
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', '进度导出与导入')

  const exportButton = document.createElement('button')
  exportButton.type = 'button'
  exportButton.id = IO_PROGRESS_IDS.exportButton
  exportButton.className = 'ui-btn'
  exportButton.textContent = '导出进度'
  exportButton.setAttribute('aria-label', '把当前进度导出为 JSON 文件')

  const importButton = document.createElement('button')
  importButton.type = 'button'
  importButton.id = IO_PROGRESS_IDS.importButton
  importButton.className = 'ui-btn'
  importButton.textContent = '导入进度'
  importButton.setAttribute('aria-label', '从 JSON 文件导入进度')

  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.id = IO_PROGRESS_IDS.fileInput
  fileInput.accept = '.json,application/json'
  fileInput.className = 'ui-io__file'
  fileInput.setAttribute('aria-label', '选择进度文件')
  fileInput.hidden = true

  root.append(exportButton, importButton, fileInput)
  mount.appendChild(root)

  function say(text: string, kind: 'info' | 'warn' | 'error' = 'info'): void {
    deps.onMessage?.(text, kind)
  }

  function exportNow(): { fileName: string; bytes: number } | null {
    const progress = deps.getProgress()
    const now = new Date()
    const fileName = exportFileName(progress.packId, now)
    const body = serializeProgress(progress, now)
    const makeBlob =
      deps.blobFactory ??
      ((parts: string[], type: string) => new Blob(parts, { type }))
    const createUrl =
      deps.createObjectUrl ??
      ((blob: unknown) => URL.createObjectURL(blob as Blob))
    const revoke = deps.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url))
    try {
      const blob = makeBlob([body], 'application/json')
      const url = createUrl(blob)
      // 临时 <a download>：不 window.open、不用 data URI
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.rel = 'noopener'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      // 同一 tick 后释放，Chrome/Safari 均能拿到文件
      setTimeout(() => {
        revoke(url)
        if (a.parentNode !== null) a.parentNode.removeChild(a)
      }, 0)
      say(`已导出 ${fileName}`)
      return { fileName, bytes: blob.size }
    } catch (err) {
      say(`导出失败：${String(err)}`, 'error')
      return null
    }
  }

  async function importFromFile(file: LikeFile): Promise<{ ok: boolean; error?: string; warnings?: string[] }> {
    let text: string
    try {
      text = await file.text()
    } catch (err) {
      const msg = `读取文件失败：${String(err)}`
      say(msg, 'error')
      return { ok: false, error: msg, warnings: [] }
    }
    const parsed = parseProgressJson(text, {
      expectedPackId: deps.expectedPackId?.(),
      xpPerLeaf: DEFAULT_XP_PER_LEAF
    })
    if (!parsed.ok) {
      say(parsed.error, 'error')
      return { ok: false, error: parsed.error, warnings: parsed.warnings }
    }
    for (const w of parsed.warnings) say(w, 'warn')
    const existing = deps.getProgress()
    const hasProgress = Object.keys(existing.lit).length > 0
    if (hasProgress) {
      const d = progressDelta(existing, parsed.progress)
      const confirmed = deps.onConfirmOverwrite
        ? await deps.onConfirmOverwrite(existing, parsed.progress)
        : true
      if (!confirmed) {
        say('已取消导入，原进度保持不变')
        return { ok: false, error: '已取消', warnings: parsed.warnings }
      }
      say(
        `导入方式 ${mode}：新增 ${d.added} 个、重合 ${d.same} 个、原进度独有 ${d.removed} 个`
      )
    }
    const merged = mergeProgress(existing, parsed.progress, mode)
    deps.onApply(merged, { mode, warnings: parsed.warnings })
    say(
      `导入完成：共 ${Object.keys(merged.lit).length} 个已点亮知识点，XP ${merged.xp}`
    )
    return { ok: true, warnings: parsed.warnings }
  }

  async function pickByInput(): Promise<LikeFile | null> {
    return await new Promise<LikeFile | null>((resolve) => {
      const onChange = (): void => {
        const f = fileInput.files?.[0]
        fileInput.value = ''
        resolve((f as unknown as LikeFile) ?? null)
      }
      const onCancel = (): void => resolve(null)
      fileInput.addEventListener('change', onChange, { once: true })
      fileInput.addEventListener('cancel', onCancel, { once: true })
      fileInput.click()
    })
  }

  on(exportButton, 'click', () => exportNow())
  on(importButton, 'click', () => {
    void (async () => {
      const picker = deps.pickFile ?? (() => pickByInput())
      const file = await picker()
      if (file === null) {
        say('未选择文件')
        return
      }
      await importFromFile(file)
    })()
  })

  return {
    root,
    exportButton,
    importButton,
    fileInput,
    exportNow,
    importFromFile,
    setMode(m: MergeMode) {
      mode = m
    },
    get currentMode() {
      return mode
    },
    destroy() {
      for (const l of listeners) l.el.removeEventListener(l.type, l.fn)
      listeners.length = 0
      if (root.parentNode !== null) root.parentNode.removeChild(root)
    }
  }
}
