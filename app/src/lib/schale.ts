import { steuerung } from './steuerung.ts'
import { useSitzung } from '../store/sitzung.ts'
import { audio } from './audio.ts'

/** Läuft die Seite in der Desktop-Schale? Tauri setzt beides. */
export const inSchale = () =>
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

/**
 * Was die Schale von außen anstößt. Rust schickt die Ereignisse mit eval statt
 * über IPC — dann braucht die Seite keine Sonderrechte für eine entfernte
 * Herkunft, und derselbe Bau läuft unverändert auch im Browser.
 */
export function verbindeSchale () {
  addEventListener('claude-voice-hotkey', () => {
    const s = useSitzung.getState()
    // Zweimal derselbe Kurzbefehl beendet die Aufnahme, statt eine zweite zu
    // starten — sonst müsste man zum Absenden zur Maus greifen.
    if (s.zustand === 'listening') { steuerung.beenden(); return }
    if (audio.spricht()) { void steuerung.abbrechen(); return }
    void steuerung.aufnehmen().catch(() => {})
  })

  addEventListener('claude-voice-neu', () => { void steuerung.neueSitzung() })

  if (!inSchale()) return

  // In der Schale gibt es keine Adresszeile, in der das Token stünde. Es aus
  // der URL zu putzen kostet nichts und hält es aus dem Verlauf heraus.
  try {
    const u = new URL(location.href)
    if (u.searchParams.has('token')) {
      u.searchParams.delete('token')
      history.replaceState(null, '', u.pathname + u.search + u.hash)
    }
  } catch { /* egal */ }

  document.documentElement.dataset.schale = 'an'
}
