import { create } from 'zustand'
import type {
  Bubble, GitState, PermissionRequest, Stats, Todo, TrailRow, UiState
} from '../lib/types.ts'

export type Subagent = {
  id: string
  kind: string
  description: string
  start: number
  end?: number
  tool: string
  finished: boolean
  ok?: boolean
}

export const emptyStats = (): Stats => ({
  turns: 0, inTok: 0, outTok: 0, cacheRead: 0, cacheWrite: 0,
  costUsd: 0, lastMs: 0, apiMs: 0, startedAt: Date.now(),
  ctx: null, branch: '', limits: null, models: {}
})

export type Session = {
  state: UiState
  /**
   * A turn and its speech end independently of each other, so the visible
   * state is derived from both rather than from whichever finished last.
   */
  turnRunning: boolean
  speaking: boolean
  busy: boolean

  bubbles: Bubble[]
  liveId: string | null
  trail: TrailRow[]
  thoughts: string
  step: string

  permissions: PermissionRequest[]
  subagents: Subagent[]
  todos: Todo[]
  stats: Stats
  git: GitState | null

  preview: string
  hint: string | null
  cwd: string
  modelName: string

  set: (patch: Partial<Session>) => void
  addBubble: (b: Bubble) => void
  patchBubble: (id: string, patch: Partial<Bubble>) => void
  addTrailRow: (row: TrailRow) => void
  setTrailResult: (id: string, result: string, failed: boolean) => void
  clear: () => void
  derive: () => void
}

/** States the operator triggered; an event from the stream must not override them. */
const OPERATOR_STATES = new Set<UiState>([
  'listening', 'transcribing', 'waiting', 'error', 'off'
])

let counter = 0
export const nextId = () => `b${++counter}`

export const useSession = create<Session>()((set, get) => ({
  state: 'idle',
  turnRunning: false,
  speaking: false,
  busy: false,

  bubbles: [],
  liveId: null,
  trail: [],
  thoughts: '',
  step: '',

  permissions: [],
  subagents: [],
  todos: [],
  stats: emptyStats(),
  git: null,

  preview: '',
  hint: null,
  cwd: '',
  modelName: '',

  set: patch => set(patch),
  addBubble: b => set(s => ({ bubbles: [...s.bubbles, b] })),
  patchBubble: (id, patch) => set(s => ({
    bubbles: s.bubbles.map(b => b.id === id ? { ...b, ...patch } : b)
  })),
  // Newest row first: reading along, the eye would otherwise chase the bottom.
  addTrailRow: row => set(s => ({ trail: [row, ...s.trail].slice(0, 400) })),
  setTrailResult: (id, result, failed) => set(s => ({
    trail: s.trail.map(r => r.id === id ? { ...r, result, failed } : r)
  })),
  clear: () => set({
    bubbles: [], liveId: null, trail: [], thoughts: '', step: '',
    permissions: [], subagents: [], todos: [], turnRunning: false, busy: false,
    preview: '', state: 'idle'
  }),

  /**
   * Derive the visible state from the turn and the speech together. Polling
   * once when a turn ends catches the speech either before or after it,
   * depending on timing.
   */
  derive: () => {
    const s = get()
    if (OPERATOR_STATES.has(s.state)) return
    if (s.speaking) { if (s.state !== 'speaking') set({ state: 'speaking' }); return }
    if (s.turnRunning) {
      if (s.state !== 'thinking' && s.state !== 'speaking') set({ state: 'thinking' })
      return
    }
    if (s.state !== 'idle') set({ state: 'idle' })
  }
}))
