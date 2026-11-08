import type { Pack } from '../../src/renderer/core/types'

/** 统一测试 fixture（与 resources/packs/dev-mini.json 同构，spec 计划 Task 6）：
 * b1(D1){ u1(3叶,无前置); u2(2叶, hard←u1) }; b2(D2){ u3(1叶, hard←u2) } */
export const miniPack: Pack = {
  schema: 'litree/pack-v1',
  id: 'mini',
  title: { zh: 'mini' },
  domains: [
    { id: 'D1', name: '域一', color: '#3DD6C3' },
    { id: 'D2', name: '域二', color: '#F0B429' }
  ],
  nodes: [
    { id: 'b1', parent: null, kind: 'branch', title: { zh: '分支一' }, domain: 'D1' },
    { id: 'u1', parent: 'b1', kind: 'unit', title: { zh: '单元一' }, domain: 'D1', core: true },
    { id: 'u1.k1', parent: 'u1', kind: 'leaf', title: { zh: '点一' }, domain: 'D1' },
    { id: 'u1.k2', parent: 'u1', kind: 'leaf', title: { zh: '点二' }, domain: 'D1' },
    { id: 'u1.k3', parent: 'u1', kind: 'leaf', title: { zh: '点三' }, domain: 'D1' },
    { id: 'u2', parent: 'b1', kind: 'unit', title: { zh: '单元二' }, domain: 'D1', core: true },
    { id: 'u2.k1', parent: 'u2', kind: 'leaf', title: { zh: '点四' }, domain: 'D1' },
    { id: 'u2.k2', parent: 'u2', kind: 'leaf', title: { zh: '点五' }, domain: 'D1' },
    { id: 'b2', parent: null, kind: 'branch', title: { zh: '分支二' }, domain: 'D2' },
    { id: 'u3', parent: 'b2', kind: 'unit', title: { zh: '单元三' }, domain: 'D2', core: true },
    { id: 'u3.k1', parent: 'u3', kind: 'leaf', title: { zh: '点六' }, domain: 'D2' }
  ],
  edges: [
    { from: 'u1', to: 'u2', type: 'hard', reason: '单元一先学' },
    { from: 'u2', to: 'u3', type: 'hard', reason: '单元二先学' }
  ]
}

export const U1_LEAVES = ['u1.k1', 'u1.k2', 'u1.k3']
export const ALL_LEAVES = [...U1_LEAVES, 'u2.k1', 'u2.k2', 'u3.k1']
