import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Sprache } from '../lib/types'

export const AKZENTE = [
  { name: 'Indigo', hell: '#5b5bd6', dunkel: '#8b8bf0' },
  { name: 'Smaragd', hell: '#0f8a5f', dunkel: '#34d399' },
  { name: 'Bernstein', hell: '#b45309', dunkel: '#fbbf24' },
  { name: 'Rose', hell: '#be123c', dunkel: '#fb7185' },
  { name: 'Stahl', hell: '#475569', dunkel: '#94a3b8' },
  { name: 'Türkis', hell: '#0d9488', dunkel: '#2dd4bf' }
] as const

/** Unter dieser Breite stehen Leiste und Inhalt nicht mehr nebeneinander, die
 *  Leiste legt sich also über den Inhalt. Die Grenze steht genau einmal hier:
 *  Layout, Abdunklung und Escape müssen sich über dasselbe Fenster einig sein. */
export const SCHMAL = '(max-width:1000px)'

export const GROESSEN = [
  ['sehr klein', 13], ['klein', 14], ['normal', 15], ['groß', 17], ['sehr groß', 19]
] as const

export type Einstellungen = {
  theme: 'system' | 'light' | 'dark'
  akzent: string
  groesse: number
  dichte: 'luft' | 'normal' | 'kompakt'
  radius: 'weich' | 'normal' | 'kantig'
  ruhig: boolean
  ohneSchimmer: boolean
  stumm: boolean
  tempo: number
  sprache: Sprache
  stil: string
  stilText: string
  werkzeugzeilen: boolean
  befehleGanz: boolean
  seiteAuf: boolean
  spurAuf: boolean
  offeneGruppen: Record<string, boolean>
  setzen: (p: Partial<Einstellungen>) => void
  gruppe: (id: string, auf: boolean) => void
}

/** Alles, was der Nutzer eingestellt hat, überlebt das Neuladen. Was aus der
 *  Session kommt, gehört nicht hierher — das steht in sitzung.ts. */
export const useEinstellungen = create<Einstellungen>()(persist((set) => ({
  theme: 'system',
  akzent: 'Indigo',
  groesse: 2,
  dichte: 'normal',
  radius: 'normal',
  ruhig: false,
  ohneSchimmer: false,
  stumm: false,
  tempo: 100,
  sprache: 'de',
  stil: 'standard',
  stilText: '',
  werkzeugzeilen: true,
  befehleGanz: false,
  seiteAuf: !matchMedia(SCHMAL).matches,
  spurAuf: false,
  offeneGruppen: { 'grp-set': true, 'grp-hist': true },
  setzen: p => set(p),
  gruppe: (id, auf) => set(s => ({ offeneGruppen: { ...s.offeneGruppen, [id]: auf } }))
}), { name: 'claude-voice-einstellungen', version: 1 }))
