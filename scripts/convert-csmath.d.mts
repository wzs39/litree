import type { Pack } from '../src/renderer/core/types'

export interface ConvertReport {
  units: number
  hard: number
  soft: number
  leaves: number
  chapters: number
  diffs: string[]
}

export function convertCsmath(
  skilltree: unknown,
  outlines: Record<string, unknown>
): { pack: Pack; report: ConvertReport }
