/** 只读结构探测：打印顶层键、样例对象、计数 —— 为转换器映射提供依据 */
import { readFileSync } from 'node:fs'

const [skilltreePath, outlinesPath] = process.argv.slice(2)
if (!skilltreePath || !outlinesPath) {
  console.error('用法: node scripts/probe-csmath.mjs <skilltree.json> <outlines.json>')
  process.exit(1)
}

const st = JSON.parse(readFileSync(skilltreePath, 'utf-8'))
const ol = JSON.parse(readFileSync(outlinesPath, 'utf-8'))

console.log('=== skilltree.json ===')
console.log('顶层键:', Object.keys(st))
for (const k of Object.keys(st)) {
  const v = st[k]
  if (Array.isArray(v)) {
    console.log(`- ${k}: array(${v.length})`)
    if (v.length > 0) console.log(`  样例[0]:`, JSON.stringify(v[0]).slice(0, 600))
  } else if (v !== null && typeof v === 'object') {
    console.log(`- ${k}: object 键=${Object.keys(v).slice(0, 12).join(',')}`)
  } else {
    console.log(`- ${k}: ${JSON.stringify(v)}`)
  }
}

console.log('\n=== outlines.json ===')
console.log('顶层键:', Object.keys(ol))
for (const k of Object.keys(ol)) {
  const v = ol[k]
  if (Array.isArray(v)) {
    console.log(`- ${k}: array(${v.length})`)
    if (v.length > 0) console.log(`  样例[0]:`, JSON.stringify(v[0]).slice(0, 600))
  } else if (v !== null && typeof v === 'object') {
    console.log(`- ${k}: object 键=${Object.keys(v).slice(0, 12).join(',')}`)
  } else {
    console.log(`- ${k}: ${JSON.stringify(v)}`)
  }
}
