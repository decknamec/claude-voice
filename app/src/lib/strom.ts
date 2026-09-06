import { TOKEN, api } from './api'
import { audio } from './audio'
import { argText, schrittText, VERB } from './werkzeuge'
import { useSitzung, neueId, leereStats } from '../store/sitzung'
import type {
  FreigabeAnfrage, Stats, SubagentEreignis, Todo, WerkzeugEreignis
} from './types'

type Melder = (titel: string, text: string, schlecht?: boolean) => void

let quelle: EventSource | null = null
let zugStart = 0
let t: (s: string) => string = s => s
let melden: Melder = () => {}
let nachZug: (() => void) | null = null

export function setzeUebersetzer (fn: (s: string) => string) { t = fn }
export function setzeMelder (fn: Melder) { melden = fn }
export function setzeNachZug (fn: () => void) { nachZug = fn }

const S = () => useSitzung.getState()

/** Der Sinn von freihändig ist, nebenbei etwas anderes zu tun. Dann sieht man
 *  das Ende nicht. Nur melden, wenn das Fenster wirklich weg ist und der Zug
 *  lange genug lief, dass man ihn vergessen haben könnte. */
function benachrichtige (text: string) {
  if (!document.hidden || Notification?.permission !== 'granted') return
  if (Date.now() - zugStart < 15000) return
  try { new Notification('Claude Voice', { body: text.slice(0, 140), tag: 'claude-voice' }) } catch { /* egal */ }
}

export function markiereZugStart () { zugStart = Date.now() }

function liveBlase (): string {
  const s = S()
  if (s.liveId) return s.liveId
  const id = neueId()
  s.blase({ id, wer: 'claude', text: '', live: true })
  s.setzen({ liveId: id })
  return id
}

function denkZeile (text: string) {
  const s = S()
  const zeile = s.spur.find(z => z.name === '__denkt')
  if (zeile) s.setzen({ spur: s.spur.map(z => z === zeile ? { ...z, arg: text.slice(-400) } : z) })
  else s.spurZeile({ id: neueId(), name: '__denkt', arg: text.slice(-400), dim: true })
}

function denkEnde () {
  const s = S()
  s.setzen({ denkText: '', spur: s.spur.filter(z => z.name !== '__denkt' || z.arg) })
}

function onWerkzeug (d: WerkzeugEreignis) {
  const s = S()
  s.setzen({ denkText: '' })

  // Werkzeuge eines Unteragenten gehören an dessen Karte, nicht in die
  // Hauptspur — sonst mischen sich zwei Erzählstränge.
  if (d.parent) {
    if (d.phase === 'use' && d.name) {
      s.setzen({
        agenten: s.agenten.map(a => a.id === d.parent
          ? { ...a, wz: schrittText(d.name!, d.input, t) } : a)
      })
      s.spurZeile({ id: neueId(), name: '↳ ' + d.name, arg: argText(d.name, d.input), dim: true })
    }
    return
  }

  if (d.phase === 'use' && d.name) {
    if (d.name === 'TodoWrite') {
      const todos = (d.input?.todos as Todo[] | undefined) ?? []
      s.setzen({ todos })
    }
    const zeile = {
      id: d.id,
      name: d.name,
      arg: argText(d.name, d.input),
      // Bei einer Änderung sagt der Dateiname nichts. Mit bypassPermissions ist
      // das der größte blinde Fleck, also die Zeilen direkt zeigen.
      diff: d.name === 'Edit' && d.input?.old_string != null
        ? { raus: String(d.input.old_string), rein: String(d.input.new_string ?? '') }
        : undefined
    }
    s.spurZeile(zeile)
    s.setzen({ schritt: schrittText(d.name, d.input, t) })
  } else if (d.phase === 'result') {
    s.spurErgebnis(d.id, d.ok ? (d.text || t('ok')) : t('fehlgeschlagen'), !d.ok)
    if (S().zugLaeuft) s.setzen({ schritt: t('Denkt weiter…') })
  }
}

function onUnteragent (d: SubagentEreignis) {
  const s = S()
  if (d.phase === 'start') {
    s.setzen({
      agenten: [...s.agenten, {
        id: d.id, typ: d.typ, desc: d.desc, start: Date.now(), wz: '', fertig: false
      }]
    })
  } else if (d.phase === 'done') {
    s.setzen({
      agenten: s.agenten.map(a => a.id === d.id
        ? { ...a, fertig: true, ok: d.ok, ende: Date.now() } : a)
    })
  } else {
    s.setzen({
      agenten: s.agenten.map(a => a.id === d.id
        ? { ...a, wz: d.text.replace(/\s+/g, ' ').slice(0, 90) } : a)
    })
  }
}

export function verbinde () {
  if (quelle) return
  quelle = new EventSource('/api/events?token=' + encodeURIComponent(TOKEN))
  const auf = <T,>(name: string, fn: (d: T) => void) =>
    quelle!.addEventListener(name, e => {
      try { fn(JSON.parse((e as MessageEvent).data)) } catch { /* halbe Zeile */ }
    })

  auf<{ text: string }>('delta', ({ text }) => {
    const s = S()
    const id = liveBlase()
    const b = s.blasen.find(x => x.id === id)
    s.blaseAendern(id, { text: (b?.text ?? '') + text })
    s.setzen({ schritt: '' })
    denkEnde()
    if (s.zustand !== 'speaking') s.setzen({ zustand: 'speaking' })
  })

  auf<{ text: string }>('message', ({ text }) => {
    const s = S()
    const id = liveBlase()
    // Die vollständige Nachricht ersetzt den zusammengetropften Text.
    s.blaseAendern(id, { text, live: false })
    s.setzen({ liveId: null })
  })

  auf<{ text: string }>('think', ({ text }) => {
    const s = S()
    const neu = s.denkText + text
    const zeile = neu.split('\n').filter(z => z.trim()).pop() ?? ''
    s.setzen({ denkText: neu, schritt: zeile.length > 96 ? '…' + zeile.slice(-96) : zeile })
    denkZeile(neu)
  })

  // Kommt vor den Argumenten: erst der Name, sobald das Modell ihn festlegt.
  auf<{ name: string }>('step', ({ name }) => {
    S().setzen({ denkText: '', schritt: t(VERB[name] ?? name) + '…' })
  })

  auf<WerkzeugEreignis>('tool', onWerkzeug)
  auf<SubagentEreignis>('subagent', onUnteragent)

  // Eine Freigaberegel hat gegriffen — das gehört in die Spur, sonst wirkt es
  // wie eine übersprungene Frage.
  auf<{ tool: string }>('tool-auto', ({ tool }) => {
    S().spurZeile({ id: neueId(), name: t('frei'), arg: tool, dim: true })
  })

  auf<Stats>('stats', st => {
    S().setzen({ stats: st })
    void api.git().then(g => S().setzen({ git: g })).catch(() => {})
    nachZug?.()
  })

  auf<FreigabeAnfrage>('permission', a => {
    const s = S()
    s.setzen({ freigaben: [...s.freigaben, a], zustand: 'waiting' })
  })

  auf<{ id: string }>('audio', ({ id }) => {
    audio.einreihen(id)
    S().setzen({ spricht: audio.spricht() })
    S().neuBewerten()
  })
  auf('audio-stop', () => {
    audio.stopp()
    S().setzen({ spricht: false })
    S().neuBewerten()
  })

  auf<{ state: string }>('state', ({ state }) => {
    if (state === 'idle') {
      S().setzen({ beschaeftigt: false, zugLaeuft: false })
      S().neuBewerten()
    }
  })

  auf('done', () => {
    const s = S()
    if (s.liveId) { s.blaseAendern(s.liveId, { live: false }); s.setzen({ liveId: null }) }
    s.setzen({ beschaeftigt: false, zugLaeuft: false, schritt: '', denkText: '' })
    s.neuBewerten()
    const letzte = [...s.blasen].reverse().find(b => b.wer === 'claude')
    if (letzte) benachrichtige(letzte.text)
  })

  auf<{ message: string }>('error', ({ message }) => {
    melden(t('Fehler'), message, true)
    S().setzen({ beschaeftigt: false, zugLaeuft: false })
    S().neuBewerten()
  })

  // Verbindungsabbrüche kommen ohne data — EventSource verbindet selbst neu.
  quelle.onerror = () => {
    S().setzen({ beschaeftigt: false, zugLaeuft: false })
    S().neuBewerten()
  }
}

export function trenne () { quelle?.close(); quelle = null }

export function setzeStatsZurueck () {
  S().setzen({ stats: leereStats() })
}
