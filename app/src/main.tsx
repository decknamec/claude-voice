import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles.css'
import { connectShell } from './lib/shell.ts'
import { audio } from './lib/audio.ts'
import { useSession } from './store/session.ts'

// Runs before the first render: the shell strips the token from the URL, and
// lib/api.ts reads it while the module loads.
connectShell()

/**
 * The two knobs worth turning at runtime.
 *
 * The voice-activity thresholds are estimates, not values measured against a
 * real voice, and finding better ones by rebuilding between attempts is not
 * something anyone will do. `session` is here because the same tuning session
 * needs to see what the detector decided.
 */
Object.assign(window, {
  __voice: {
    tune: (o: { startSec?: number; endSec?: number }) => audio.tune(o),
    session: () => useSession.getState()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
)
