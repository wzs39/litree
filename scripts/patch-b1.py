"""Batch1: 数据语义正确性——isLit 空容器守卫 + 转换器质量门禁（一次性补丁）"""
import io, re

# 1. graph.ts: isLit 空容器守卫
p = 'src/renderer/core/graph.ts'
s = io.open(p, encoding='utf-8').read()
old = """/** 容器或叶子是否点亮：叶子按集合；unit/branch 按叶子后代全亮 */
export function isLit(id: string, index: GraphIndex, litLeaves: Set<string>): boolean {
  const node = index.nodeById.get(id)
  if (node === undefined) return false
  if (node.kind === 'leaf') return litLeaves.has(id)
  return index.leavesOf(id).every((l) => litLeaves.has(l.id))
}"""
new = """/** 容器或叶子是否点亮：叶子按集合；unit/branch 按叶子后代全亮（无叶容器不虚亮） */
export function isLit(id: string, index: GraphIndex, litLeaves: Set<string>): boolean {
  const node = index.nodeById.get(id)
  if (node === undefined) return false
  if (node.kind === 'leaf') return litLeaves.has(id)
  const leaves = index.leavesOf(id)
  if (leaves.length === 0) return false // 空容器（审查发现 252 个虚点亮）：不视为已点亮
  return leaves.every((l) => litLeaves.has(l.id))
}"""
assert old in s, 'isLit'
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

# 2. convert-csmath.mjs：垃圾叶 lint、练习拆分、0 叶章丢弃、无 outline 单元跳过、diff 时不写（--force 例外）、README 对账值更新
p = 'scripts/convert-csmath.mjs'
s = io.open(p, encoding='utf-8').read()

old = """const README_EXPECTED = { units: 192, hard: 260, soft: 400, leaves: 8411 }"""
new = """// 对账基线：上游 README 写 8411，实查其口径含"节"级标题（8458）与其内部去重（47），
// 我们的规范口径（纯可点亮叶子）为 8124 —— 见 2026-11-08 实施账本 V2-1 对账结论。
const README_EXPECTED = { units: 192, hard: 260, soft: 400, leaves: 8124 }"""
assert old in s, 'expected'
s = s.replace(old, new, 1)

# 练习拆分：按题号 (1)/(2)/… 切分 question 字符串
old = """      exercises: s.exercise?.question ? [s.exercise.question] : [],"""
new = """      exercises: splitExercises(s.exercise?.question),"""
assert old in s, 'exercises'
s = s.replace(old, new, 1)

old = """function skillResources(s) {"""
new = """/** 练习拆分：按 "(1)"/"(2)" 题号切成逐题数组（上游恒为单一巨型字符串） */
function splitExercises(question) {
  if (!question || typeof question !== 'string') return []
  const marks = [...question.matchAll(/\\((\\d+)\\)/g)]
  if (marks.length < 2) return [question.trim()]
  const parts = []
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index
    const end = i + 1 < marks.length ? marks[i + 1].index : question.length
    const text = question.slice(start, end).replace(/\\s+$/, '')
    if (text.length > 3) parts.push(text)
  }
  return parts.length > 0 ? parts : [question.trim()]
}

/** 叶子标题合法性：≥2 字符且含 CJK 或字母（过滤上游 "sz" 类乱码噪声） */
function isSaneLeafTitle(title) {
  if (!title || title.trim().length < 2) return false
  return /[\\u4e00-\\u9fffA-Za-z0-9]/.test(title)
}

function skillResources(s) {"""
assert old in s, 'helpers'
s = s.replace(old, new, 1)

# 叶子推送处加 lint；0 叶章不生成章节点
old = """function outlineToChapters(skillId, outline) {
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
}"""
new = """function outlineToChapters(skillId, outline, diffs) {
  const chapters = []
  for (const ch of outline) {
    const leaves = []
    for (const it of ch.items ?? []) {
      const pushLeaf = (leaf) => {
        const zh = leaf.zh ?? leaf.title
        if (!isSaneLeafTitle(zh)) {
          diffs.push(`技能 ${skillId} 剔除乱码叶子标题: "${String(zh).slice(0, 20)}"`)
          return
        }
        leaves.push({ zh, en: leaf.zh ? leaf.title : undefined })
      }
      if (Array.isArray(it.items) && it.items.length > 0) {
        // 节 → 摊平其知识点（仅保留章一层分组，避免无意义深层级）
        for (const leaf of it.items) pushLeaf(leaf)
      } else {
        pushLeaf(it)
      }
    }
    if (leaves.length === 0) {
      diffs.push(`技能 ${skillId} 章 "${ch.zh ?? ch.title}" 无有效叶子（丢弃）`)
      continue
    }
    chapters.push({
      id: `${skillId}.c${chapters.length}`,
      titleZh: ch.zh ?? ch.title,
      titleEn: ch.zh ? ch.title : undefined,
      leaves
    })
  }
  return chapters
}"""
assert old in s, 'outlineToChapters'
s = s.replace(old, new, 1)

old = """    const chs = outlineToChapters(s.id, ol.outline)"""
new = """    const chs = outlineToChapters(s.id, ol.outline, diffs)"""
assert old in s, 'chs call'
s = s.replace(old, new, 1)

# 缺 outline 的 unit 跳过（不产出空单元）
old = """    const ol = outlines[s.id]
    if (!ol || !Array.isArray(ol.outline)) {
      diffs.push(`技能 ${s.id} 缺少 outline`)
      continue
    }"""
new = """    const ol = outlines[s.id]
    if (!ol || !Array.isArray(ol.outline)) {
      diffs.push(`技能 ${s.id} 缺少 outline（跳过该单元的叶子生成）`)
      continue
    }"""
assert old in s, 'no outline'
s = s.replace(old, new, 1)

# CLI：有差异时不落盘（--force 例外）
old = """  const st = JSON.parse(readFileSync(`${srcDir}/skilltree.json`, 'utf-8'))
  const ol = JSON.parse(readFileSync(`${srcDir}/outlines.json`, 'utf-8'))
  const { pack, report } = convertCsmath(st, ol)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, JSON.stringify(pack))"""
new = """  const force = process.argv.includes('--force')
  const st = JSON.parse(readFileSync(`${srcDir}/skilltree.json`, 'utf-8'))
  const ol = JSON.parse(readFileSync(`${srcDir}/outlines.json`, 'utf-8'))
  const { pack, report } = convertCsmath(st, ol)"""
assert old in s, 'cli pre'
s = s.replace(old, new, 1)

old = """  console.log(hasDiff ? '结论: 存在差异，见上' : '结论: 与 README 全部吻合')"""
new = """  console.log(hasDiff ? '结论: 存在差异，见上' : '结论: 与对账基线全部吻合')
  if (hasDiff && !force) {
    console.log('已跳过写入（差异未确认；确认后加 --force 重跑）')
    process.exit(2)
  }
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, JSON.stringify(pack))
  console.log(`已写入 ${dest}`)"""
assert old in s, 'cli post'
s = s.replace(old, new, 1)
# 修正 CLI 末尾原有的重复 write（报告块后还留着旧 mkdir/write？上面已挪，需确认无残留）
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('BATCH1 CONVERT PATCHED')
