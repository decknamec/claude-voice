// Findet Selektoren, die auf Klassen zeigen, die es weder im Markup noch in
// einer Zuweisung im Skript gibt. Genau so waren .slider und select.sel tot
// liegengeblieben, nachdem das Markup umgebaut wurde.
const fs = require('fs')
const s = fs.readFileSync(process.argv[2], 'utf8')
const css = s.slice(s.indexOf('<style>'), s.indexOf('</style>'))
const rest = s.slice(s.indexOf('</style>'))

const inCss = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m => m[1]))
const da = new Set()
const merken = t => String(t).trim().split(/\s+/).forEach(c => c && da.add(c))
for (const m of rest.matchAll(/class="([^"]+)"/g)) merken(m[1])
for (const m of rest.matchAll(/className\s*=\s*['"`]([^'"`]*)/g)) merken(m[1])
for (const m of rest.matchAll(/classList\.(?:add|toggle|remove)\(\s*'([^']+)'/g)) merken(m[1])
// Klassennamen, die als blosse Zeichenkette irgendwo im Skript stehen —
// etwa in `'ag' + (fertig ? ' schief' : '')`.
for (const m of rest.matchAll(/'([^']{1,40})'/g)) merken(m[1])

const verwaist = [...inCss].filter(c => !da.has(c))
if (verwaist.length) { console.error('verwaist: ' + verwaist.join(', ')); process.exit(1) }
