// Hält die zwei Textfilter zusammen: hooks/lib/speakable.sh (Hook, CLI-Loop) und
// ui/speakable.mjs (UI). Jede Zeile aus tests/speakable-cases.txt geht durch beide,
// beide müssen die erwartete Ausgabe liefern. Exit 1 nennt jede Abweichung.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { speakable } from '../ui/speakable.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const LIB = join(REPO, 'hooks/lib/speakable.sh')
const CASES = process.argv[2] || join(HERE, 'speakable-cases.txt')

const unescape = s => s.replace(/\\n/g, '\n')

// Der Umweg über eine Datei statt über ein Argument: so muss der Text nicht durch
// zwei Quoting-Ebenen und die Fixtures dürfen alles enthalten.
const viaShell = input => execFileSync('/bin/bash', [
  '-c', `source "$1"; cat | speakable_text`, '_', LIB
], { input, encoding: 'utf8' }).replace(/\n$/, '')

let fehler = 0, geprueft = 0
for (const line of readFileSync(CASES, 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue
  const [roh, erwartet] = line.split('\t')
  if (erwartet === undefined) { console.error(`kein Tab: ${line}`); fehler++; continue }
  const input = unescape(roh)
  const sh = viaShell(input)
  const js = speakable(input)
  geprueft++
  if (sh !== erwartet) { console.error(`shell: ${JSON.stringify(roh)}\n  erwartet ${JSON.stringify(erwartet)}\n  bekommen ${JSON.stringify(sh)}`); fehler++ }
  if (js !== erwartet) { console.error(`ui:    ${JSON.stringify(roh)}\n  erwartet ${JSON.stringify(erwartet)}\n  bekommen ${JSON.stringify(js)}`); fehler++ }
}
if (!geprueft) { console.error('keine Fälle gefunden'); process.exit(1) }
process.exit(fehler ? 1 : 0)
