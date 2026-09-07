import { useCallback, useMemo } from 'react'
import { seit, uebersetze, uiSprache } from './i18n.ts'
import { useEinstellungen } from '../store/einstellungen.ts'

/** Übersetzer und Sprachcode. Der deutsche Text ist zugleich der Schlüssel,
 *  eine fehlende Übersetzung lässt ihn also einfach stehen. */
export function useT () {
  const wahl = useEinstellungen(s => s.sprache)
  const code = useMemo(() => uiSprache(wahl), [wahl])
  const t = useCallback((de: string) => uebersetze(code, de), [code])
  const seither = useCallback((ms: number) => seit(code, ms), [code])
  return { t, code, seither }
}
