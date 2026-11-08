/** litree/pack-v1 数据模型（spec §4.1） */

export type NodeKind = 'branch' | 'unit' | 'leaf'

export interface PackNode {
  id: string
  parent: string | null
  kind: NodeKind
  title: { zh: string; en?: string }
  domain: string
  core?: boolean
  summary?: string
  resources?: PackResource[]
  exercises?: string[]
  evidence?: string
  layoutOverride?: { x: number; y: number }
}

export interface PackResource {
  title: string
  url: string
  lang?: 'zh' | 'en'
}

export interface PackEdge {
  from: string
  to: string
  type: 'hard' | 'soft'
  reason?: string
}

export interface Domain {
  id: string
  name: string
  color: string
}

export interface Pack {
  schema: 'litree/pack-v1'
  id: string
  title: { zh: string; en?: string }
  domains: Domain[]
  nodes: PackNode[]
  edges: PackEdge[]
}

export interface LitRecord {
  at: string
  note?: string
}

export interface Progress {
  packId: string
  lit: Record<string, LitRecord>
  learning: Record<string, string>
  xp: number
  history: { id: string; at: string; xp: number }[]
}
