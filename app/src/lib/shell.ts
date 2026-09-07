import { controls } from './controls.ts'
import { useSession } from '../store/session.ts'
import { audio } from './audio.ts'

/** Whether the page runs inside the desktop shell. Tauri sets both globals. */
export const inShell = () =>
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

/**
 * What the shell triggers from outside. Rust dispatches these events with eval
 * rather than over IPC, so the page needs no extra rights for a remote origin
 * and the same build keeps running in a plain browser.
 */
export function connectShell () {
  addEventListener('claude-voice-hotkey', () => {
    const s = useSession.getState()
    // The same shortcut twice ends the recording instead of starting a second
    // one; otherwise submitting would require reaching for the mouse.
    if (s.state === 'listening') { controls.stopRecording(); return }
    if (audio.isSpeaking()) { void controls.interrupt(); return }
    void controls.startRecording().catch(() => {})
  })

  addEventListener('claude-voice-new', () => { void controls.newSession() })

  if (!inShell()) return

  // The shell has no address bar for the token to sit in. Clearing it costs
  // nothing and keeps it out of the history.
  try {
    const url = new URL(location.href)
    if (url.searchParams.has('token')) {
      url.searchParams.delete('token')
      history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
  } catch { /* ignored */ }

  document.documentElement.dataset.shell = 'on'
}
