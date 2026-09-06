// Jede Zeichenkette, die im Markup als uebersetzbar markiert ist, muss im
// Woerterbuch stehen. Sonst bleibt beim Umschalten auf Englisch stumm Deutsch
// stehen, und man sieht es nur, wenn man genau hinguckt.
const fs = require('fs')
const s = fs.readFileSync(process.argv[2], 'utf8')
const body = s.slice(s.indexOf('<body'), s.indexOf('<script>'))
const js = s.slice(s.indexOf('<script>'))
const en = js.slice(js.indexOf('const EN = {'), js.indexOf('let uiSprache'))
const noetig = [...new Set([
  ...[...body.matchAll(/data-i18n>([^<]+)</g)].map(m => m[1].replace(/\s+/g, ' ').trim()),
  ...[...body.matchAll(/data-i18n-title title="([^"]+)"/g)].map(m => m[1]),
  ...[...body.matchAll(/data-i18n-aria aria-label="([^"]+)"/g)].map(m => m[1])
])]
const fehlt = noetig.filter(k => !en.includes("'" + k + "'"))
if (fehlt.length) { console.error('ohne Uebersetzung: ' + fehlt.join(' | ')); process.exit(1) }
