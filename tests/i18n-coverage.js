// Jede deutsche Zeichenkette, die durch t() läuft, muss im Wörterbuch stehen.
// Sonst bleibt beim Umschalten auf Englisch stumm Deutsch stehen, und man
// sieht es nur, wenn man genau hinguckt.
//
//   node tests/i18n-coverage.js app/src
const fs = require('fs')
const path = require('path')

const wurzel = process.argv[2]
const woerter = fs.readFileSync(path.join(wurzel, 'lib/woerter.ts'), 'utf8')
const EN = new Set([...woerter.matchAll(/'((?:[^'\\]|\\.)*)'\s*:/g)].map(m => m[1]))

function dateien (dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return dateien(p)
    return /\.tsx?$/.test(e.name) && e.name !== 'woerter.ts' ? [p] : []
  })
}

const fehlt = new Map()
for (const datei of dateien(wurzel)) {
  const quelle = fs.readFileSync(datei, 'utf8')
  // Nur wörtliche Argumente: t(VERB[name] ?? name) lässt sich hier nicht
  // auflösen, und ein Ratespiel wäre schlimmer als eine Lücke.
  for (const m of quelle.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g)) {
    const s = m[1].replace(/\\'/g, "'")
    // Platzhalter und reine Zeichen brauchen keine Übersetzung.
    if (!/[A-Za-zÄÖÜäöüß]/.test(s)) continue
    if (!EN.has(s)) {
      if (!fehlt.has(s)) fehlt.set(s, path.relative(wurzel, datei))
    }
  }
}

if (fehlt.size) {
  for (const [s, d] of fehlt) console.error(`ohne Übersetzung: ${d}: "${s}"`)
  process.exit(1)
}
