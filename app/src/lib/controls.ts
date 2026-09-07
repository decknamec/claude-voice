import { ApiError, api } from './api.ts'
import { audio } from './audio.ts'
import { markTurnStart, resetStats } from './stream.ts'
import { nextId, useSession } from '../store/session.ts'
import type { Messages } from './i18n/index.ts'

const S = () => useSession.getState()

/**
 * The raw text of an exception tells the operator nothing about what to do
 * next, so each case carries the handle that resolves it.
 */
export function describeError (err: unknown, m: Messages): [string, string] {
  const e = err as { name?: string; message?: string; code?: string }
  const text = String(e?.message ?? err ?? '')
  const code = e?.code
  if (e?.name === 'NotAllowedError' || /Permission denied/i.test(text)) {
    return [m.error.micDenied, m.error.micDeniedHint]
  }
  if (e?.name === 'NotFoundError') return [m.error.micMissing, m.error.micMissingHint]
  if (code === 'no_model') return [m.error.modelMissing, m.error.modelMissingHint]
  if (code === 'whisper_failed' || code === 'ffmpeg_failed') {
    return [m.error.recognitionFailed, text]
  }
  if (code === 'offline') return [m.error.serverUnreachable, m.error.serverUnreachableHint]
  if (/403/.test(text) || /token/i.test(text)) {
    return [m.error.tokenInvalid, m.error.tokenInvalidHint]
  }
  if (/usage limit|rate.?limit|429/i.test(text)) {
    return [m.error.rateLimited, m.error.rateLimitedHint]
  }
  return [m.state.error, text || m.error.unknownCause]
}

export const controls = {
  async startRecording () {
    const s = S()
    if (s.busy || s.state !== 'idle') return
    await audio.startRecording()
    s.set({ state: 'listening', preview: '' })
  },

  stopRecording () {
    if (audio.isRecording()) audio.stopRecording()
  },

  /** After release: transcribe, show, submit. */
  async submitRecording (blob: Blob, m: Messages) {
    const s = S()
    s.set({ busy: true, state: 'transcribing', preview: '' })
    try {
      const { said, ms } = await api.transcribe(blob)
      if (!said) {
        s.set({ state: 'idle', busy: false })
        return
      }
      s.addBubble({
        id: nextId(), who: 'user', text: said, meta: m.stage.transcribedLocally(ms)
      })
      // The event stream takes over here: text, approvals and the end of the
      // turn arrive over SSE, not as the response to this call.
      markTurnStart()
      s.set({ turnRunning: true, state: 'thinking' })
      await api.say(said)
    } catch (e) {
      s.set({ busy: false })
      throw e
    }
  },

  /** Submit a turn without speaking. Slash commands and the text field share it. */
  async submitText (text: string, m: Messages, meta?: string) {
    const s = S()
    if (s.busy) throw new ApiError(m.toast.turnStillRunning, 'busy')
    s.set({ busy: true })
    s.addBubble({ id: nextId(), who: 'user', text, meta })
    markTurnStart()
    s.set({ turnRunning: true, state: 'thinking' })
    try { await api.say(text) } catch (e) { s.set({ busy: false }); throw e }
  },

  /** Stops speech and the running turn. This is what makes interrupting work. */
  async interrupt () {
    await api.interrupt().catch(() => {})
    audio.stopPlayback()
    const s = S()
    if (s.liveId) s.patchBubble(s.liveId, { live: false })
    s.set({ liveId: null, busy: false, turnRunning: false, speaking: false, state: 'idle' })
  },

  async newSession () {
    audio.stopPlayback()
    await api.reset()
    S().clear()
    resetStats()
  },

  async answerPermission (id: string, allow: boolean, scope?: 'exact' | 'tool') {
    const s = S()
    const request = s.permissions.find(p => p.id === id)
    s.set({ permissions: s.permissions.filter(p => p.id !== id), state: 'thinking' })
    await api.permission({
      id, behavior: allow ? 'allow' : 'deny', scope,
      tool: request?.tool, input: request?.input
    })
  }
}
