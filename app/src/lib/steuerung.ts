import { ApiFehler, api } from './api.ts'
import { audio } from './audio.ts'
import { markiereZugStart, setzeStatsZurueck } from './strom.ts'
import { neueId, useSitzung } from '../store/sitzung.ts'

const S = () => useSitzung.getState()

/** Der rohe Text einer Ausnahme sagt dem Nutzer nichts darüber, was er jetzt
 *  tun soll. Jeder Fall bekommt deshalb einen Handgriff mit. */
export function fehlerText (err: unknown): [string, string] {
  const e = err as { name?: string; message?: string; code?: string }
  const m = String(e?.message ?? err ?? '')
  const code = e?.code
  if (e?.name === 'NotAllowedError' || /Permission denied/i.test(m)) {
    return ['Kein Mikrofonzugriff',
      'Systemeinstellungen → Datenschutz → Mikrofon, dort den Browser erlauben. Danach neu laden.']
  }
  if (e?.name === 'NotFoundError') {
    return ['Kein Mikrofon gefunden', 'Ist ein Eingabegerät angeschlossen und ausgewählt?']
  }
  if (code === 'no_model') return ['Whisper-Modell fehlt', 'Einmalig laden: siehe README, Abschnitt Installation.']
  if (code === 'whisper_failed' || code === 'ffmpeg_failed') return ['Spracherkennung fehlgeschlagen', m]
  if (code === 'offline') return ['Server nicht erreichbar', 'Läuft claude-voice-ui noch? Das Terminal-Fenster prüfen.']
  if (/403/.test(m) || /Token/i.test(m)) {
    return ['Token ungültig', 'Diese Seite ohne das ?token= in der URL geöffnet? Starte claude-voice-ui neu.']
  }
  if (/usage limit|rate.?limit|429/i.test(m)) {
    return ['Limit erreicht', 'Die Anthropic-API bremst gerade. Kurz warten und erneut versuchen.']
  }
  return ['Fehler', m || 'Unbekannte Ursache']
}

export const steuerung = {
  async aufnehmen () {
    const s = S()
    if (s.beschaeftigt || s.zustand !== 'idle') return
    try {
      await audio.starteAufnahme()
      s.setzen({ zustand: 'listening', vorschau: '' })
    } catch (e) { throw e }
  },

  beenden () {
    if (audio.nimmtAuf()) audio.stoppeAufnahme()
  },

  /** Nach dem Loslassen: transkribieren, anzeigen, abschicken. */
  async verarbeite (blob: Blob) {
    const s = S()
    s.setzen({ beschaeftigt: true, zustand: 'transcribing', vorschau: '' })
    try {
      const { said, ms } = await api.transkribieren(blob)
      if (!said) {
        s.setzen({ zustand: 'idle', beschaeftigt: false })
        return
      }
      s.blase({ id: neueId(), wer: 'du', text: said, meta: `${ms} ms lokal transkribiert` })
      // Ab hier übernimmt der Ereignisstrom: Text, Freigaben und das Ende des
      // Zuges kommen über SSE, nicht als Antwort auf diesen Aufruf.
      markiereZugStart()
      s.setzen({ zugLaeuft: true, zustand: 'thinking' })
      await api.sagen(said)
    } catch (e) {
      s.setzen({ beschaeftigt: false })
      throw e
    }
  },

  /** Einen Zug abschicken, ohne dafür zu sprechen. Denselben Weg nehmen die
   *  Slash-Befehle und das Tippfeld. */
  async schickeText (text: string, etikett?: string) {
    const s = S()
    if (s.beschaeftigt) throw new ApiFehler('Es läuft noch ein Zug.', 'busy')
    s.setzen({ beschaeftigt: true })
    s.blase({ id: neueId(), wer: 'du', text, meta: etikett })
    markiereZugStart()
    s.setzen({ zugLaeuft: true, zustand: 'thinking' })
    try { await api.sagen(text) } catch (e) { s.setzen({ beschaeftigt: false }); throw e }
  },

  /** Hält Sprachausgabe und laufenden Zug an. Das ist das Dazwischenreden. */
  async abbrechen () {
    await api.abbrechen().catch(() => {})
    audio.stopp()
    const s = S()
    if (s.liveId) s.blaseAendern(s.liveId, { live: false })
    s.setzen({ liveId: null, beschaeftigt: false, zugLaeuft: false, spricht: false, zustand: 'idle' })
  },

  async neueSitzung () {
    audio.stopp()
    await api.zuruecksetzen()
    S().leeren()
    setzeStatsZurueck()
  },

  async freigeben (id: string, erlaubt: boolean, umfang?: 'genau' | 'werkzeug') {
    const s = S()
    const a = s.freigaben.find(f => f.id === id)
    s.setzen({ freigaben: s.freigaben.filter(f => f.id !== id), zustand: 'thinking' })
    await api.freigabe({
      id, behavior: erlaubt ? 'allow' : 'deny', umfang,
      tool: a?.tool, input: a?.input
    })
  }
}
