import { create } from 'zustand'
import type {
  Blase, FreigabeAnfrage, GitLage, SpurZeile, Stats, Todo, Zustand
} from '../lib/types.ts'

export type Unteragent = {
  id: string
  typ: string
  desc: string
  start: number
  ende?: number
  wz: string
  fertig: boolean
  ok?: boolean
}

export const leereStats = (): Stats => ({
  turns: 0, inTok: 0, outTok: 0, cacheRead: 0, cacheWrite: 0,
  costUsd: 0, lastMs: 0, apiMs: 0, startedAt: Date.now(),
  ctx: null, zweig: '', limits: null, modelle: {}
})

export type Sitzung = {
  zustand: Zustand
  /** Läuft gerade ein Zug? Der sichtbare Zustand hängt an zwei Dingen, die
   *  unabhängig voneinander enden: dem Zug und der Wiedergabe. */
  zugLaeuft: boolean
  spricht: boolean
  beschaeftigt: boolean

  blasen: Blase[]
  liveId: string | null
  spur: SpurZeile[]
  denkText: string
  schritt: string
  schrittStart: number

  freigaben: FreigabeAnfrage[]
  agenten: Unteragent[]
  todos: Todo[]
  stats: Stats
  git: GitLage | null

  vorschau: string
  hinweis: string | null
  cwd: string
  modellName: string

  setzen: (p: Partial<Sitzung>) => void
  blase: (b: Blase) => void
  blaseAendern: (id: string, p: Partial<Blase>) => void
  spurZeile: (z: SpurZeile) => void
  spurErgebnis: (id: string, ergebnis: string, schief: boolean) => void
  leeren: () => void
  neuBewerten: () => void
}

const EIGENER_ZUSTAND = new Set<Zustand>(['listening', 'transcribing', 'waiting', 'error', 'off'])

let zaehler = 0
export const neueId = () => `b${++zaehler}`

export const useSitzung = create<Sitzung>()((set, get) => ({
  zustand: 'idle',
  zugLaeuft: false,
  spricht: false,
  beschaeftigt: false,

  blasen: [],
  liveId: null,
  spur: [],
  denkText: '',
  schritt: '',
  schrittStart: 0,

  freigaben: [],
  agenten: [],
  todos: [],
  stats: leereStats(),
  git: null,

  vorschau: '',
  hinweis: null,
  cwd: '',
  modellName: '',

  setzen: p => set(p),
  blase: b => set(s => ({ blasen: [...s.blasen, b] })),
  blaseAendern: (id, p) => set(s => ({
    blasen: s.blasen.map(b => b.id === id ? { ...b, ...p } : b)
  })),
  // Neueste Zeile oben: beim Mitlesen springt der Blick sonst ständig nach unten.
  spurZeile: z => set(s => ({ spur: [z, ...s.spur].slice(0, 400) })),
  spurErgebnis: (id, ergebnis, schief) => set(s => ({
    spur: s.spur.map(z => z.id === id ? { ...z, ergebnis, schief } : z)
  })),
  leeren: () => set({
    blasen: [], liveId: null, spur: [], denkText: '', schritt: '',
    freigaben: [], agenten: [], todos: [], zugLaeuft: false, beschaeftigt: false,
    vorschau: '', zustand: 'idle'
  }),

  /** Ein einmaliger Poll nach dem Ende eines Zuges trifft die Wiedergabe mal
   *  davor, mal danach. Deshalb nach jeder Änderung beider Quellen neu
   *  bewerten, statt einmal zu raten. */
  neuBewerten: () => {
    const s = get()
    if (EIGENER_ZUSTAND.has(s.zustand)) return
    if (s.spricht) { if (s.zustand !== 'speaking') set({ zustand: 'speaking' }); return }
    if (s.zugLaeuft) {
      if (s.zustand !== 'thinking' && s.zustand !== 'speaking') set({ zustand: 'thinking' })
      return
    }
    if (s.zustand !== 'idle') set({ zustand: 'idle' })
  }
}))
