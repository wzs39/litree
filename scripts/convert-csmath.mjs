/** cs-math-skill-tree 数据 → litree/pack-v1 转换器
 *
 * 映射依据 scripts/probe-csmath.mjs 的探测结果（2026-11-08）：
 * - skilltree.skills[192]: {id,name,en,domain,lane,path[{id,name}×2],desc,optional,
 *   required[{id,why,kind}],recommended[...],prereqSummary,resource{title,url,lang},
 *   courses[],extraResources[],exercise{question}}
 * - skilltree.lanes[13]: {id,domain,name,short,en,color,optional,count}
 * - outlines[skillId].outline: [章{src,ref,title,zh,items:[节{…items}|知识点]}]
 * - L1 学科 = path[0] 自动派生；L2 分支 = lane（自带配色）；
 *   L3 单元 = skill；L4 知识点 = outline 最深层；单元叶子 >20 时保留章分组层
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const README_EXPECTED = { units: 192, hard: 260, soft: 400, leaves: 8411 }
const CHAPTER_GROUP_THRESHOLD = 20

function skillResources(s) {
  const out = []
  const push = (title, url, lang) => {
    if (typeof title === 'string' && title.length > 0 && typeof url === 'string' && url.startsWith('http')) {
      out.push(lang === 'zh' || lang === 'en' ? { title, url, lang } : { title, url })
    }
  }
  if (s.resource && typeof s.resource === 'object') {
    push(s.resource.title, s.resource.url, s.resource.lang)
  }
  for (const c of Array.isArray(s.courses) ? s.courses : []) {
    push(`${c.school ?? ''} ${c.course ?? ''}`.trim(), c.url, undefined)
  }
  for (const r of Array.isArray(s.extraResources) ? s.extraResources : []) {
    push(r.title, r.url, r.lang)
  }
  return out
}

/** outline → 章列表（每章含其叶子），章 id 按声明顺序编号 */
function outlineToChapters(skillId, outline) {
  const chapters = []
  for (const ch of outline) {
    const leaves = []
    for (const it of ch.items ?? []) {
      if (Array.isArray(it.items) && it.items.length > 0) {
        // 节 → 摊平其知识点（仅保留章一层分组，避免无意义深层级）
        for (const leaf of it.items) {
          leaves.push({ zh: leaf.zh ?? leaf.title, en: leaf.zh ? leaf.title : undefined })
        }
      } else {
        leaves.push({ zh: it.zh ?? it.title, en: it.zh ? it.title : undefined })
      }
    }
    chapters.push({
      id: `${skillId}.c${chapters.length}`,
      titleZh: ch.zh ?? ch.title,
      titleEn: ch.zh ? ch.title : undefined,
      leaves
    })
  }
  return chapters
}

export function convertCsmath(skilltree, outlines) {
  const diffs = []
  const skills = skilltree.skills ?? []
  const lanes = skilltree.lanes ?? []

  // ---- L1 学科：path[0] 派生 ----
  const subjectById = new Map()
  for (const s of skills) {
    const p0 = (s.path ?? [])[0]
    if (!p0) {
      diffs.push(`技能 ${s.id} 缺少 path[0]，无法归属学科`)
      continue
    }
    if (!subjectById.has(p0.id)) subjectById.set(p0.id, p0.name)
  }

  // ---- L2 分支 = lane；一致性检查 ----
  const laneSubject = new Map()
  for (const s of skills) {
    const p0 = (s.path ?? [])[0]
    if (!p0) continue
    const prev = laneSubject.get(s.lane)
    if (prev === undefined) laneSubject.set(s.lane, p0.id)
    else if (prev !== p0.id) diffs.push(`lane ${s.lane} 内技能分属不同学科（${prev} / ${p0.id}）`)
  }

  const domains = lanes.map((l) => ({ id: l.id, name: l.short ?? l.name, color: l.color }))
  const domainIds = new Set(domains.map((d) => d.id))
  const fallbackDomain = lanes[0]?.id ?? 'D0'

  // lane.id 与其学科 id 相同（CS 学科：F/P/C/D/A…）→ lane 即学科根节点，不重复创建；
  // 仅当学科被拆成多条 lane（数学：M1/M2/M3）时才需要独立的学科包装节点
  const unifiedLaneSubjects = new Set(
    [...laneSubject.entries()].filter(([laneId, subj]) => laneId === subj).map(([, subj]) => subj)
  )
  const nodes = []
  for (const [sid, name] of [...subjectById.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (unifiedLaneSubjects.has(sid)) continue // 该学科已由同名 lane 节点承担
    const firstLane = lanes.find((l) => laneSubject.get(l.id) === sid)
    nodes.push({ id: sid, parent: null, kind: 'branch', title: { zh: name }, domain: firstLane?.id ?? fallbackDomain })
  }
  for (const l of lanes) {
    const subj = laneSubject.get(l.id)
    nodes.push({
      id: l.id,
      parent: l.id === subj ? null : (subj ?? null),
      kind: 'branch',
      title: { zh: l.id === subj ? (subjectById.get(subj) ?? l.name) : l.name, ...(l.en ? { en: l.en } : {}) },
      domain: domainIds.has(l.id) ? l.id : fallbackDomain
    })
  }

  // ---- L3 单元 + 边 ----
  const unitIds = new Set(skills.map((s) => s.id))
  for (const s of skills) {
    nodes.push({
      id: s.id,
      parent: laneSubject.has(s.lane) ? s.lane : null,
      kind: 'unit',
      title: { zh: s.name, ...(s.en ? { en: s.en } : {}) },
      domain: domainIds.has(s.lane) ? s.lane : fallbackDomain,
      core: !s.optional,
      summary: s.desc,
      resources: skillResources(s),
      exercises: s.exercise?.question ? [s.exercise.question] : [],
      evidence: s.prereqSummary
    })
  }
  const edges = []
  for (const s of skills) {
    for (const r of s.required ?? []) {
      if (!unitIds.has(r.id)) {
        diffs.push(`技能 ${s.id} 的必须前置 ${r.id} 不在技能列表中`)
        continue
      }
      edges.push({ from: r.id, to: s.id, type: 'hard', reason: r.why })
    }
    for (const r of s.recommended ?? []) {
      if (!unitIds.has(r.id)) {
        diffs.push(`技能 ${s.id} 的推荐前置 ${r.id} 不在技能列表中`)
        continue
      }
      edges.push({ from: r.id, to: s.id, type: 'soft', reason: r.why })
    }
  }
  const hard = edges.filter((e) => e.type === 'hard').length
  const soft = edges.filter((e) => e.type === 'soft').length

  // ---- L4 知识点（>20 保留章分组层）----
  let leaves = 0
  let chapters = 0
  for (const s of skills) {
    const ol = outlines[s.id]
    if (!ol || !Array.isArray(ol.outline)) {
      diffs.push(`技能 ${s.id} 缺少 outline`)
      continue
    }
    const chs = outlineToChapters(s.id, ol.outline)
    const totalLeaves = chs.reduce((a, c) => a + c.leaves.length, 0)
    const grouped = totalLeaves > CHAPTER_GROUP_THRESHOLD
    if (grouped) {
      for (const ch of chs) {
        chapters++
        nodes.push({
          id: ch.id,
          parent: s.id,
          kind: 'branch',
          title: { zh: ch.titleZh, ...(ch.titleEn ? { en: ch.titleEn } : {}) },
          domain: domainIds.has(s.lane) ? s.lane : fallbackDomain
        })
      }
    }
    let li = 0
    for (const ch of chs) {
      for (const f of ch.leaves) {
        leaves++
        nodes.push({
          id: `${s.id}.k${li++}`,
          parent: grouped ? ch.id : s.id,
          kind: 'leaf',
          title: { zh: f.zh, ...(f.en ? { en: f.en } : {}) },
          domain: domainIds.has(s.lane) ? s.lane : fallbackDomain
        })
      }
    }
  }

  // ---- 报告（README 对账在 CLI 全量运行时执行，fixture 截取不做全量对账）----
  const report = { units: skills.length, hard, soft, leaves, chapters, diffs }

  const pack = {
    schema: 'litree/pack-v1',
    id: 'cs-math',
    title: { zh: '计算机 + 数学', en: 'CS & Math' },
    domains,
    nodes,
    edges
  }
  return { pack, report }
}

/** CLI: node scripts/convert-csmath.mjs <csmath-output-dir> <dest-pack.json> */
function main() {
  const [srcDir, dest] = process.argv.slice(2)
  if (!srcDir || !dest) {
    console.error('用法: node scripts/convert-csmath.mjs <csmath-output-dir> <dest-pack.json>')
    process.exit(1)
  }
  const st = JSON.parse(readFileSync(`${srcDir}/skilltree.json`, 'utf-8'))
  const ol = JSON.parse(readFileSync(`${srcDir}/outlines.json`, 'utf-8'))
  const { pack, report } = convertCsmath(st, ol)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, JSON.stringify(pack))
  console.log('=== cs-math 转换报告 ===')
  console.log(`units=${report.units} hard=${report.hard} soft=${report.soft} leaves=${report.leaves} chapters=${report.chapters}`)
  console.log(`节点总数=${pack.nodes.length} 边总数=${pack.edges.length}`)
  let hasDiff = false
  for (const [key, expected] of Object.entries(README_EXPECTED)) {
    if (report[key] !== expected) {
      hasDiff = true
      console.log(`对账 ${key}: 实际 ${report[key]} ≠ README ${expected}`)
    }
  }
  if (report.diffs.length > 0) {
    hasDiff = true
    console.log('--- 映射差异（逐项，须人工确认后固化）---')
    for (const d of report.diffs) console.log('  ' + d)
  }
  console.log(hasDiff ? '结论: 存在差异，见上' : '结论: 与 README 全部吻合')
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) main()
