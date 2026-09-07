import { useMemo } from 'react'
import { de, type Messages } from './messages.ts'
import { en } from './en.ts'
import { useSettings } from '../../store/settings.ts'

export type Locale = 'de' | 'en'
/** The reply language also accepts "auto", where the model follows what was spoken. */
export type LanguageChoice = Locale | 'auto'

const catalogues: Record<Locale, Messages> = { de, en }

/**
 * Interface language for a reply-language choice. Under "auto" the reply
 * follows what was spoken, which the labels cannot do, so they follow the
 * browser instead.
 */
export function resolveLocale (choice: LanguageChoice): Locale {
  if (choice !== 'auto') return choice
  return (navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en'
}

/**
 * Relative timestamps. Intl.RelativeTimeFormat is the large hammer for four
 * cases and renders German as "vor 6 Minuten" where the sidebar wants
 * "vor 6 min".
 */
export function timeSince (locale: Locale, ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60000)
  const english = locale === 'en'
  if (minutes < 1) return english ? 'just now' : 'gerade eben'
  if (minutes < 60) return english ? `${minutes} min ago` : `vor ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return english ? `${hours} h ago` : `vor ${hours} h`
  const days = Math.round(hours / 24)
  return english ? `${days} d ago` : `vor ${days} Tagen`
}

export function messagesFor (locale: Locale): Messages {
  return catalogues[locale]
}

/**
 * The resolved catalogue plus its locale. Components read fields directly
 * (`m.state.idle`), so a typo is a type error instead of a label that silently
 * stays German.
 */
export function useMessages () {
  const choice = useSettings(s => s.language)
  const locale = useMemo(() => resolveLocale(choice), [choice])
  return useMemo(
    () => ({ m: catalogues[locale], locale, since: (ms: number) => timeSince(locale, ms) }),
    [locale]
  )
}

export type { Messages }
