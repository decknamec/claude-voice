// Einheitentests für die reine Logik — das, was ohne Mikrofon, ohne Modell und
// ohne laufende Session prüfbar ist. Bewusst kein Streben nach Abdeckung:
// geprüft wird, was schon einmal kaputt war oder still kaputtgehen kann.
//
//   node --test tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verdichte } from '../ui/transkript.mjs'
import { speakable } from '../ui/speakable.mjs'

// ── Transkript ───────────────────────────────────────────────────────
// Fremdes Datenformat: ändert Claude Code die Zeilenform, bleibt die
// Wiederherstellung sonst still leer, und niemand merkt es.

const zeile = o => JSON.stringify(o)
const nutzer = t => zeile({ type: 'user', message: { content: t } })
const claude = (...bloecke) => zeile({ type: 'assistant', message: { content: bloecke } })
const text = t => ({ type: 'text', text: t })
const werkzeug = name => ({ type: 'tool_use', name })

test('Transkript: Frage und Antwort werden zu zwei Blöcken', () => {
  const v = verdichte([nutzer('Wie spät?'), claude(text('Kurz nach drei.'))])
  assert.deepEqual(v, [
    { rolle: 'du', text: 'Wie spät?' },
    { rolle: 'claude', text: 'Kurz nach drei.' }
  ])
})

test('Transkript: geteilte Antwort wird wieder zusammengefügt', () => {
  // Der Stream zerlegt eine Antwort in mehrere assistant-Zeilen.
  const v = verdichte([claude(text('Erster Teil.')), claude(text('Zweiter Teil.'))])
  assert.equal(v.length, 1)
  assert.equal(v[0].text, 'Erster Teil. Zweiter Teil.')
})

test('Transkript: Werkzeugläufe werden gebündelt, nicht aufgelistet', () => {
  const v = verdichte([
    claude(werkzeug('Bash'), werkzeug('Bash'), werkzeug('Read'), werkzeug('Bash'))
  ])
  assert.equal(v.length, 1)
  assert.equal(v[0].rolle, 'werkzeug')
  assert.equal(v[0].n, 4)
  assert.deepEqual(v[0].namen, ['Bash', 'Read'])
})

test('Transkript: höchstens vier verschiedene Werkzeugnamen', () => {
  const v = verdichte([claude(...['a', 'b', 'c', 'd', 'e', 'f'].map(werkzeug))])
  assert.equal(v[0].n, 6)
  assert.equal(v[0].namen.length, 4)
})

test('Transkript: Unteragenten gehören nicht in den Verlauf', () => {
  const v = verdichte([
    JSON.stringify({ type: 'assistant', isSidechain: true, message: { content: [text('leise')] } }),
    claude(text('laut'))
  ])
  assert.deepEqual(v.map(b => b.text), ['laut'])
})

test('Transkript: Werkzeugergebnisse und Hook-Einwürfe fliegen raus', () => {
  // Die kommen ebenfalls als user-Zeile, beginnen aber mit einer Marke.
  const v = verdichte([nutzer('<system-reminder>egal</system-reminder>'), nutzer('echt')])
  assert.deepEqual(v.map(b => b.text), ['echt'])
})

test('Transkript: kaputte Zeilen halten den Rest nicht auf', () => {
  const v = verdichte(['{kein json', '', nutzer('trotzdem da')])
  assert.deepEqual(v.map(b => b.text), ['trotzdem da'])
})

test('Transkript: die Obergrenze schneidet vorne ab, das Neueste bleibt', () => {
  // Abwechselnd, weil aufeinanderfolgende Zeilen derselben Rolle zu einem
  // Block verschmelzen — zehn Nutzerzeilen waeren sonst ein einziger.
  const viele = Array.from({ length: 10 }, (_, i) =>
    i % 2 ? claude(text(`c${i}`)) : nutzer(`n${i}`))
  const v = verdichte(viele, 3)
  assert.deepEqual(v.map(b => b.text), ['c7', 'n8', 'c9'])
})

// ── Vorlesbarer Text ─────────────────────────────────────────────────
// Ohne das buchstabiert die Sprachausgabe minutenlang Schrägstriche.

test('Vorlesbar: Codeblöcke verschwinden', () => {
  // Zeilenumbrüche werden zu Leerzeichen: die Sprachausgabe kennt keine
  // Absätze, und ein umgebrochener Satz klänge zerhackt.
  assert.equal(speakable('Vorher.\n```js\nconst x = 1\n```\nNachher.'), 'Vorher. Nachher.')
})

test('Vorlesbar: aus einem Pfad wird der Dateiname', () => {
  assert.match(speakable('siehe /a/b/hook.sh hier'), /siehe hook\.sh hier/)
})

test('Vorlesbar: leerer Text bleibt leer', () => {
  assert.equal(speakable('').trim(), '')
  assert.equal(speakable('```nur code```').trim(), '')
})
