import { TOKEN, api } from './api.ts'
import { audio } from './audio.ts'
import { argText, stepLabel } from './tools.ts'
import { useSession, nextId, emptyStats } from '../store/session.ts'
import { de, type Messages } from './i18n/messages.ts'
import type { PermissionRequest, Stats, SubagentEvent, Todo, ToolEvent } from './types.ts'

type Notify = (title: string, text: string, bad?: boolean) => void

let source: EventSource | null = null
let turnStart = 0
let m: Messages = de
let notify: Notify = () => {}
let afterTurn: (() => void) | null = null

export function setMessages (next: Messages) { m = next }
export function setNotifier (fn: Notify) { notify = fn }
export function setAfterTurn (fn: () => void) { afterTurn = fn }

const S = () => useSession.getState()

/**
 * The point of hands-free is doing something else meanwhile, which is exactly
 * when the end of a turn goes unnoticed. Only notify when the window is truly
 * away and the turn ran long enough to have been forgotten.
 */
function notifyDesktop (text: string) {
  if (!document.hidden || Notification?.permission !== 'granted') return
  if (Date.now() - turnStart < 15000) return
  try { new Notification('Claude Voice', { body: text.slice(0, 140), tag: 'claude-voice' }) } catch { /* ignored */ }
}

export function markTurnStart () { turnStart = Date.now() }

function liveBubble (): string {
  const s = S()
  if (s.liveId) return s.liveId
  const id = nextId()
  s.addBubble({ id, who: 'assistant', text: '', live: true })
  s.set({ liveId: id })
  return id
}

const THINKING_ROW = '__thinking'

function thinkingRow (text: string) {
  const s = S()
  const row = s.trail.find(r => r.name === THINKING_ROW)
  if (row) s.set({ trail: s.trail.map(r => r === row ? { ...r, arg: text.slice(-400) } : r) })
  else s.addTrailRow({ id: nextId(), name: THINKING_ROW, arg: text.slice(-400), dim: true })
}

function onTool (d: ToolEvent) {
  const s = S()
  s.set({ thoughts: '' })

  // A subagent's tools belong on its card, not in the main trail; otherwise two
  // storylines interleave.
  if (d.parent) {
    if (d.phase === 'use' && d.name) {
      const name = d.name
      s.set({
        subagents: s.subagents.map(a => a.id === d.parent
          ? { ...a, tool: stepLabel(name, d.input, m) } : a)
      })
      s.addTrailRow({ id: nextId(), name: '↳ ' + name, arg: argText(name, d.input), dim: true })
    }
    return
  }

  if (d.phase === 'use' && d.name) {
    if (d.name === 'TodoWrite') {
      s.set({ todos: (d.input?.todos as Todo[] | undefined) ?? [] })
    }
    s.addTrailRow({
      id: d.id,
      name: d.name,
      arg: argText(d.name, d.input),
      // For an edit the file name says nothing, and under bypassPermissions
      // that is the largest blind spot, so the lines themselves are shown.
      diff: d.name === 'Edit' && d.input?.old_string != null
        ? { removed: String(d.input.old_string), added: String(d.input.new_string ?? '') }
        : undefined
    })
    s.set({ step: stepLabel(d.name, d.input, m) })
  } else if (d.phase === 'result') {
    s.setTrailResult(d.id, d.ok ? (d.text || m.transcript.ok) : m.transcript.failed, !d.ok)
    if (S().turnRunning) s.set({ step: m.state.stillThinking })
  }
}

function onSubagent (d: SubagentEvent) {
  const s = S()
  if (d.phase === 'start') {
    s.set({
      subagents: [...s.subagents, {
        id: d.id, kind: d.kind, description: d.description,
        start: Date.now(), tool: '', finished: false
      }]
    })
  } else if (d.phase === 'done') {
    s.set({
      subagents: s.subagents.map(a => a.id === d.id
        ? { ...a, finished: true, ok: d.ok, end: Date.now() } : a)
    })
  } else {
    s.set({
      subagents: s.subagents.map(a => a.id === d.id
        ? { ...a, tool: d.text.replace(/\s+/g, ' ').slice(0, 90) } : a)
    })
  }
}

export function connect () {
  if (source) return
  source = new EventSource('/api/events?token=' + encodeURIComponent(TOKEN))
  const on = <T,>(name: string, fn: (d: T) => void) =>
    source!.addEventListener(name, e => {
      try { fn(JSON.parse((e as MessageEvent).data)) } catch { /* partial frame */ }
    })

  on<{ text: string }>('delta', ({ text }) => {
    const s = S()
    const id = liveBubble()
    const bubble = s.bubbles.find(b => b.id === id)
    s.patchBubble(id, { text: (bubble?.text ?? '') + text })
    s.set({ step: '', thoughts: '' })
    if (s.state !== 'speaking') s.set({ state: 'speaking' })
  })

  on<{ text: string }>('message', ({ text }) => {
    const s = S()
    const id = liveBubble()
    // The complete message replaces the text assembled from deltas.
    s.patchBubble(id, { text, live: false })
    s.set({ liveId: null })
  })

  on<{ text: string }>('think', ({ text }) => {
    const s = S()
    const all = s.thoughts + text
    const line = all.split('\n').filter(l => l.trim()).pop() ?? ''
    s.set({ thoughts: all, step: line.length > 96 ? '…' + line.slice(-96) : line })
    thinkingRow(all)
  })

  // Arrives before the arguments: the name as soon as the model fixes it.
  on<{ name: string }>('step', ({ name }) => {
    const verb = (m.tool as Record<string, string>)[name] ?? name
    S().set({ thoughts: '', step: verb + '…' })
  })

  on<ToolEvent>('tool', onTool)
  on<SubagentEvent>('subagent', onSubagent)

  // A standing permission matched. Without a row it reads as a question that
  // was skipped.
  on<{ tool: string }>('tool-auto', ({ tool }) => {
    S().addTrailRow({ id: nextId(), name: m.transcript.auto, arg: tool, dim: true })
  })

  on<Stats>('stats', stats => {
    S().set({ stats })
    void api.git().then(git => S().set({ git })).catch(() => {})
    afterTurn?.()
  })

  on<PermissionRequest>('permission', request => {
    const s = S()
    s.set({ permissions: [...s.permissions, request], state: 'waiting' })
    // Hands-free means nobody is watching the screen. Without a spoken
    // question the session just goes quiet and looks like it hung.
    if (s.handsFree) void api.speak(m.spoken.permission(request.tool))
  })

  on<{ id: string }>('audio', ({ id }) => {
    audio.enqueue(id)
    S().set({ speaking: audio.isSpeaking() })
    S().derive()
  })
  on('audio-stop', () => {
    audio.stopPlayback()
    S().set({ speaking: false })
    S().derive()
  })

  on<{ state: string }>('state', ({ state }) => {
    if (state === 'idle') {
      S().set({ busy: false, turnRunning: false })
      S().derive()
    }
  })

  on('done', () => {
    const s = S()
    if (s.liveId) { s.patchBubble(s.liveId, { live: false }); s.set({ liveId: null }) }
    s.set({ busy: false, turnRunning: false, step: '', thoughts: '' })
    s.derive()
    const last = [...s.bubbles].reverse().find(b => b.who === 'assistant')
    if (last) notifyDesktop(last.text)
  })

  on<{ message: string }>('error', ({ message }) => {
    notify(m.toast.error, message, true)
    S().set({ busy: false, turnRunning: false })
    S().derive()
  })

  // A dropped connection arrives without data; EventSource reconnects itself.
  source.onerror = () => {
    S().set({ busy: false, turnRunning: false })
    S().derive()
  }
}

export function disconnect () { source?.close(); source = null }

export function resetStats () {
  S().set({ stats: emptyStats() })
}
