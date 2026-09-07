// Einheitentests für die reine Logik der Oberfläche.
//
//   cd app && node --test src/logik.test.ts
//
// Bewusst schmal gehalten: geprüft wird, was schon einmal kaputt war oder still
// kaputtgehen kann, nicht was sich leicht prüfen lässt.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useSitzung, leereStats } from './store/sitzung.ts'
import { argText, kurzArg, schrittText } from './lib/werkzeuge.ts'
import { seit, uebersetze, uiSprache } from './lib/i18n.ts'

const S = () => useSitzung.getState()
const setze = (p: Parameters<ReturnType<typeof useSitzung.getState>['setzen']>[0]) => S().setzen(p)

function frisch () {
  S().leeren()
  setze({ stats: leereStats(), spricht: false, zugLaeuft: false })
}

// ── Zustandsmaschine ─────────────────────────────────────────────────
// Der sichtbare Zustand hängt an zwei Dingen, die unabhängig voneinander
// enden: dem Zug und der Wiedergabe. Ein einmaliger Poll nach dem Zugende
// traf die Wiedergabe mal davor, mal danach — die Anzeige blieb auf "Spricht"
// hängen oder sprang zu früh auf "Bereit".

test('Zustand: nichts läuft, also bereit', () => {
  frisch()
  setze({ zustand: 'speaking' })
  S().neuBewerten()
  assert.equal(S().zustand, 'idle')
})

test('Zustand: der Zug ist zu Ende, aber es wird noch geredet', () => {
  frisch()
  setze({ zugLaeuft: false, spricht: true, zustand: 'thinking' })
  S().neuBewerten()
  assert.equal(S().zustand, 'speaking')
})

test('Zustand: es wird geredet, obwohl der Zug schon lange fertig ist', () => {
  // Genau der Fall, der vorher auf "Bereit" sprang, während der Ton lief.
  frisch()
  setze({ zugLaeuft: false, spricht: true, zustand: 'idle' })
  S().neuBewerten()
  assert.equal(S().zustand, 'speaking')
})

test('Zustand: der letzte Ton ist durch, jetzt bereit', () => {
  // Und das ist der Fall, der auf "Spricht" hängenblieb.
  frisch()
  setze({ zugLaeuft: false, spricht: true, zustand: 'speaking' })
  S().neuBewerten()
  setze({ spricht: false })
  S().neuBewerten()
  assert.equal(S().zustand, 'idle')
})

test('Zustand: der Zug läuft noch, ohne Ton, also denkt es', () => {
  frisch()
  setze({ zugLaeuft: true, spricht: false, zustand: 'idle' })
  S().neuBewerten()
  assert.equal(S().zustand, 'thinking')
})

test('Zustand: fließt schon Text, bleibt es beim Sprechen', () => {
  frisch()
  setze({ zugLaeuft: true, spricht: false, zustand: 'speaking' })
  S().neuBewerten()
  assert.equal(S().zustand, 'speaking')
})

for (const eigen of ['listening', 'transcribing', 'waiting', 'error', 'off'] as const) {
  test(`Zustand: ${eigen} wird nicht überfahren`, () => {
    // Diese Zustände hat der Nutzer selbst ausgelöst. Sie dürfen nicht von
    // einem Ereignis aus dem Strom überschrieben werden.
    frisch()
    setze({ zustand: eigen, zugLaeuft: false, spricht: false })
    S().neuBewerten()
    assert.equal(S().zustand, eigen)
  })
}

// ── Verlauf ──────────────────────────────────────────────────────────

test('Spur: die neueste Zeile steht oben', () => {
  frisch()
  S().spurZeile({ id: '1', name: 'Bash', arg: 'erst' })
  S().spurZeile({ id: '2', name: 'Read', arg: 'dann' })
  assert.deepEqual(S().spur.map(z => z.arg), ['dann', 'erst'])
})

test('Spur: ein Ergebnis findet seine Zeile', () => {
  frisch()
  S().spurZeile({ id: 'a', name: 'Bash', arg: 'ls' })
  S().spurErgebnis('a', 'fehlgeschlagen', true)
  assert.equal(S().spur[0].ergebnis, 'fehlgeschlagen')
  assert.equal(S().spur[0].schief, true)
})

// ── Werkzeugbeschriftung ─────────────────────────────────────────────

const t = (s: string) => s   // ohne Übersetzung, wir prüfen die Form

test('Werkzeug: Verb plus das eine Feld, auf das es ankommt', () => {
  assert.equal(schrittText('Bash', { command: 'npm test' }, t), 'Führt aus npm test')
  assert.equal(schrittText('Grep', { pattern: 'TODO' }, t), 'Durchsucht TODO')
})

test('Werkzeug: bei Dateien nur der Name, nicht der ganze Pfad', () => {
  assert.equal(schrittText('Read', { file_path: '/a/b/server.mjs' }, t), 'Liest server.mjs')
})

test('Werkzeug: ohne Argument bleibt das Verb mit Auslassung', () => {
  assert.equal(schrittText('Bash', {}, t), 'Führt aus…')
})

test('Werkzeug: lange Argumente werden gekürzt, aber nicht im Nichts', () => {
  const lang = schrittText('Bash', { command: 'x'.repeat(200) }, t)
  assert.ok(lang.length < 80, lang.length + ' Zeichen')
  assert.ok(lang.endsWith('…'))
})

test('Werkzeug: unbekanntes Werkzeug behält seinen Namen', () => {
  assert.equal(schrittText('mcp__irgendwas__tu', { a: 1 }, t), 'mcp__irgendwas__tu…')
})

test('Werkzeug: Zeilenumbrüche im Befehl brechen die Zeile nicht auf', () => {
  assert.equal(kurzArg('Bash', { command: 'a\n  b' }), 'a b')
})

test('Werkzeug: ohne bekanntes Feld steht das ganze Objekt da', () => {
  assert.equal(argText('Unbekannt', { x: 1 }), '{"x":1}')
})

// ── Sprache ──────────────────────────────────────────────────────────

test('Sprache: fehlende Übersetzung lässt den deutschen Text stehen', () => {
  assert.equal(uebersetze('en', 'Gibt es nicht im Wörterbuch'), 'Gibt es nicht im Wörterbuch')
  assert.equal(uebersetze('de', 'Bereit'), 'Bereit')
  assert.equal(uebersetze('en', 'Bereit'), 'Ready')
})

test('Sprache: automatisch folgt dem Browser', () => {
  assert.ok(['de', 'en'].includes(uiSprache('auto')))
  assert.equal(uiSprache('de'), 'de')
  assert.equal(uiSprache('en'), 'en')
})

test('Zeit: gerade eben, Minuten, Stunden, Tage', () => {
  const jetzt = Date.now()
  assert.equal(seit('de', jetzt), 'gerade eben')
  assert.equal(seit('en', jetzt), 'just now')
  assert.equal(seit('de', jetzt - 6 * 60_000), 'vor 6 min')
  assert.equal(seit('de', jetzt - 3 * 3600_000), 'vor 3 h')
  assert.equal(seit('en', jetzt - 3 * 3600_000), '3 h ago')
  assert.equal(seit('de', jetzt - 2 * 86_400_000), 'vor 2 Tagen')
})
