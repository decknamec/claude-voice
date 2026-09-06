import { EN } from './woerter'
import type { Sprache } from './types'

/** Aus der Auswahl die Sprache der Oberfläche ableiten. Bei "automatisch
 *  erkennen" hängt die Antwortsprache am Gesprochenen — die Beschriftungen
 *  können nicht mitwandern, also folgen sie dem Browser. */
export function uiSprache (wahl: Sprache): 'de' | 'en' {
  if (wahl === 'auto') {
    return (navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en'
  }
  return wahl
}

/** Ohne Treffer bleibt der deutsche Text stehen. Eine fehlende Übersetzung
 *  soll nichts kaputtmachen, nur unübersetzt bleiben. */
export function uebersetze (code: 'de' | 'en', de: string): string {
  return code === 'en' ? (EN[de] ?? de) : de
}

/** Relative Zeitangaben. Intl.RelativeTimeFormat wäre der große Hammer für
 *  vier Fälle und liefert im Deutschen "vor 6 Minuten" statt "vor 6 min". */
export function seit (code: 'de' | 'en', ms: number): string {
  const m = Math.round((Date.now() - ms) / 60000)
  const en = code === 'en'
  if (m < 1) return en ? 'just now' : 'gerade eben'
  if (m < 60) return en ? `${m} min ago` : `vor ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return en ? `${h} h ago` : `vor ${h} h`
  const d = Math.round(h / 24)
  return en ? `${d} d ago` : `vor ${d} Tagen`
}
