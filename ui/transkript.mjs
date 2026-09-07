// Verlaeufe alter Sitzungen aus dem Transkript lesen.
//
// Steht in einer eigenen Datei, weil es die einzige nennenswerte Auswertung im
// Server ist und weil sich fremde Datenformate aendern. Ein Test mit festen
// Beispielzeilen faellt dann auf, statt dass die Wiederherstellung still leer
// bleibt.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Wo liegt das Transkript zu dieser Sitzung? */
export function transkriptPfad (id, { home, cwd }) {
  const root = join(home, '.claude', 'projects')
  const direkt = join(root, cwd.replace(/[/.]/g, '-'), id + '.jsonl')
  if (existsSync(direkt)) return direkt
  // Die Session kann unter einem anderen Projektordner liegen, etwa wenn sie
  // aus einem Unterverzeichnis gestartet wurde.
  try {
    for (const d of readdirSync(root)) {
      const p = join(root, d, id + '.jsonl')
      if (existsSync(p)) return p
    }
  } catch { /* kein Projektordner */ }
  return null
}

/** Die Zeilen eines Transkripts zu Gespraechsbloecken verdichten. Getrennt vom
 *  Dateizugriff, damit sich das ohne Dateisystem pruefen laesst. */
export function verdichte (zeilen, max = 300) {
  const out = []
  const anhaengen = (rolle, text) => {
    const t = String(text).trim()
    if (!t) return
    const letzt = out[out.length - 1]
    // Ganze Laeufe von Werkzeugaufrufen zu einer Zeile buendeln — einzeln
    // aufgelistet verdraengen sie das eigentliche Gespraech aus dem Fenster.
    if (rolle === 'werkzeug') {
      if (letzt?.rolle === 'werkzeug') {
        letzt.n += 1
        if (!letzt.namen.includes(t) && letzt.namen.length < 4) letzt.namen.push(t)
      } else out.push({ rolle, namen: [t], n: 1 })
      return
    }
    // Der Stream zerlegt eine Antwort in mehrere Bloecke — wieder zusammenfuegen.
    if (letzt && letzt.rolle === rolle) letzt.text += ' ' + t
    else out.push({ rolle, text: t })
  }

  for (const zeile of zeilen) {
    if (!zeile) continue
    let e
    try { e = JSON.parse(zeile) } catch { continue }
    if (e.isSidechain) continue        // Unteragenten gehoeren nicht in den Verlauf
    const c = e.message?.content
    if (e.type === 'user') {
      const t = typeof c === 'string' ? c
        : Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join(' ') : ''
      // Werkzeugergebnisse und Hook-Einwuerfe kommen ebenfalls als user-Zeile.
      if (t && !t.startsWith('<')) anhaengen('du', t)
    } else if (e.type === 'assistant' && Array.isArray(c)) {
      anhaengen('claude', c.filter(b => b.type === 'text').map(b => b.text).join(' '))
      for (const b of c) if (b.type === 'tool_use') anhaengen('werkzeug', b.name)
    }
  }
  return out.slice(-max)
}

export function leseTranskript (id, orte, max = 300) {
  const pfad = transkriptPfad(id, orte)
  if (!pfad) return null
  return verdichte(readFileSync(pfad, 'utf8').split('\n'), max)
}
