// Holds the two text filters together: hooks/lib/speakable.sh (hook, CLI loop)
// and ui/speakable.mjs (UI). Every line of tests/speakable-cases.txt goes
// through both, and both have to produce the expected output. Exit 1 names
// every divergence.
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

// Going through stdin rather than an argument keeps the text out of two levels
// of quoting, so the fixtures may contain anything.
const viaShell = input => execFileSync('/bin/bash', [
  '-c', `source "$1"; cat | speakable_text`, '_', LIB
], { input, encoding: 'utf8' }).replace(/\n$/, '')

let failures = 0, checked = 0
for (const line of readFileSync(CASES, 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue
  const [raw, expected] = line.split('\t')
  if (expected === undefined) { console.error(`no tab: ${line}`); failures++; continue }
  const input = unescape(raw)
  const sh = viaShell(input)
  const js = speakable(input)
  checked++
  if (sh !== expected) { console.error(`shell: ${JSON.stringify(raw)}\n  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(sh)}`); failures++ }
  if (js !== expected) { console.error(`ui:    ${JSON.stringify(raw)}\n  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(js)}`); failures++ }
}
if (!checked) { console.error('no cases found'); process.exit(1) }
process.exit(failures ? 1 : 0)
