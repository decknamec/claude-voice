import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LanguageChoice } from '../lib/i18n/index.ts'

export const ACCENTS = [
  { key: 'indigo', light: '#5b5bd6', dark: '#8b8bf0' },
  { key: 'emerald', light: '#0f8a5f', dark: '#34d399' },
  { key: 'amber', light: '#b45309', dark: '#fbbf24' },
  { key: 'rose', light: '#be123c', dark: '#fb7185' },
  { key: 'steel', light: '#475569', dark: '#94a3b8' },
  { key: 'teal', light: '#0d9488', dark: '#2dd4bf' }
] as const

export type AccentKey = (typeof ACCENTS)[number]['key']

/** Index into this list is what gets stored; the label comes from the catalogue. */
export const TEXT_SIZES = [13, 14, 15, 17, 19] as const

/**
 * Below this width the sidebar and the content no longer sit side by side, so
 * the sidebar covers the content instead. The threshold lives here alone:
 * layout, backdrop and Escape have to agree on the same breakpoint.
 */
export const NARROW = '(max-width:1000px)'

export type Settings = {
  theme: 'system' | 'light' | 'dark'
  accent: AccentKey
  textSize: number
  density: 'airy' | 'normal' | 'compact'
  corners: 'soft' | 'normal' | 'sharp'
  reduceMotion: boolean
  noGlow: boolean
  muted: boolean
  speakingRate: number
  language: LanguageChoice
  style: string
  styleText: string
  toolLines: boolean
  fullCommands: boolean
  sidebarOpen: boolean
  trailOpen: boolean
  openGroups: Record<string, boolean>
  set: (patch: Partial<Settings>) => void
  setGroup: (id: string, open: boolean) => void
}

/**
 * Everything the operator picked survives a reload. Anything that belongs to
 * the running session lives in store/session.ts instead.
 */
export const useSettings = create<Settings>()(persist((set) => ({
  theme: 'system',
  accent: 'indigo',
  textSize: 2,
  density: 'normal',
  corners: 'normal',
  reduceMotion: false,
  noGlow: false,
  muted: false,
  speakingRate: 100,
  language: 'de',
  style: 'standard',
  styleText: '',
  toolLines: true,
  fullCommands: false,
  sidebarOpen: !matchMedia(NARROW).matches,
  trailOpen: false,
  openGroups: { settings: true, history: true },
  set: patch => set(patch),
  setGroup: (id, open) => set(s => ({ openGroups: { ...s.openGroups, [id]: open } }))
}), { name: 'claude-voice-settings', version: 2 }))
