import { useEffect, useRef, useState } from 'react'
import { Microphone } from '@phosphor-icons/react'
import clsx from 'clsx'
import { audio } from '../lib/audio.ts'
import { controls, describeError } from '../lib/controls.ts'
import { useSession } from '../store/session.ts'
import { useMessages } from '../lib/i18n/index.ts'
import { useToasts } from './ui/Toasts.tsx'
import type { UiState } from '../lib/types.ts'

const GLOW: Record<UiState, string> = {
  idle: '--accent', listening: '--listen', transcribing: '--think',
  thinking: '--think', speaking: '--speak', error: '--err',
  waiting: '--think', off: '--fg-dim'
}

/**
 * The waveform. Runs on requestAnimationFrame and reads the level straight
 * from the audio engine; routed through React state this would redraw the tree
 * sixty times a second.
 */
function Waveform ({ state }: { state: UiState }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const SPOKES = 72, CENTER = 300, RADIUS = 118
    let phase = 0, stopped = false
    const draw = () => {
      if (stopped) return
      requestAnimationFrame(draw)
      phase += 0.03
      ctx.clearRect(0, 0, 600, 600)
      const live = state === 'listening'
      const level = live ? audio.currentLevel() : 0
      const color = getComputedStyle(document.documentElement)
        .getPropertyValue(GLOW[state] ?? '--accent').trim()
      ctx.globalAlpha = live || state === 'speaking' ? 0.85 : 0.35
      ctx.strokeStyle = color
      ctx.lineCap = 'round'
      for (let i = 0; i < SPOKES; i++) {
        const angle = (i / SPOKES) * Math.PI * 2 - Math.PI / 2
        const wave = Math.sin(phase * 2 + i * 0.35) * 0.5 + 0.5
        // While speaking the shape is synthetic: visibly alive, but calmer
        // than listening, where real levels drive it.
        const length = state === 'speaking'
          ? 6 + wave * 16
          : 4 + level * 90 * (0.55 + wave * 0.65)
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(CENTER + Math.cos(angle) * RADIUS, CENTER + Math.sin(angle) * RADIUS)
        ctx.lineTo(CENTER + Math.cos(angle) * (RADIUS + length),
                   CENTER + Math.sin(angle) * (RADIUS + length))
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
    draw()
    return () => { stopped = true }
  }, [state])
  return <canvas ref={ref} width={600} height={600}
                 className="absolute inset-0 w-[300px] h-[300px] pointer-events-none" />
}

function Key ({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-line bg-panel px-[5px] py-px
                    font-mono text-[10.5px] text-label">{children}</kbd>
  )
}

export function Stage () {
  const { m } = useMessages()
  const state = useSession(s => s.state)
  const step = useSession(s => s.step)
  const preview = useSession(s => s.preview)
  const hint = useSession(s => s.hint)
  const toast = useToasts(s => s.show)
  const [draft, setDraft] = useState('')
  const [seconds, setSeconds] = useState(0)

  // Elapsed time for the turn. Without it, "Thinking…" is indistinguishable
  // from a hang.
  const running = step !== ''
  useEffect(() => {
    if (!running) { setSeconds(0); return }
    const started = Date.now()
    const id = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 500)
    return () => clearInterval(id)
  }, [running])

  const toggleRecording = async () => {
    try {
      if (state === 'listening') controls.stopRecording()
      else await controls.startRecording()
    } catch (e) { const [title, text] = describeError(e, m); toast(title, text, true) }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setDraft('')
    try { await controls.submitText(text, m, m.stage.typed) }
    catch (err) { const [title, body] = describeError(err, m); toast(title, body, true) }
  }

  const glow = GLOW[state] ?? '--accent'

  return (
    <section className="flex flex-col items-center px-6 pt-[14px] pb-[2px]">
      <div className="relative grid place-items-center w-[300px] h-[300px]">
        <Waveform state={state} />
        {state === 'listening' && [0, 1].map(i => (
          <span key={i}
                style={{ animationDelay: `${i * 0.9}s` }}
                className="absolute w-[152px] h-[152px] rounded-full border border-[var(--listen)]
                           animate-[pulse-ring_1.8s_var(--ease-out-sig)_infinite]" />
        ))}
        <button
          onClick={toggleRecording}
          aria-label={m.stage.startRecording}
          className={clsx(
            'relative grid place-items-center w-[120px] h-[120px] rounded-full border-0 cursor-pointer',
            'text-white transition-transform duration-200 active:scale-95',
            'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4'
          )}
          style={{
            background: `radial-gradient(circle at 38% 32%,
              color-mix(in srgb, var(${glow}) 78%, white), var(${glow}))`
          }}
        >
          <Microphone size={34} weight="fill" />
        </button>
      </div>

      <div className="mt-1 text-[13px] text-dim">{m.state[state]}</div>

      {state === 'thinking' && (
        <div className="mt-[10px] flex items-center gap-[6px] h-2">
          {[0, 1, 2].map(i => (
            <i key={i} style={{ animationDelay: `${i * 0.14}s` }}
               className="w-[5px] h-[5px] rounded-full bg-current opacity-35
                          animate-[hop_1.1s_var(--ease-sig)_infinite]" />
          ))}
        </div>
      )}

      {step && (
        <div className="mt-[10px] flex items-center gap-2 min-h-4 max-w-[min(620px,88vw)]
                        text-[12.5px] text-dim">
          <span className="w-[9px] h-[9px] shrink-0 rounded-full border-[1.5px] border-line
                           border-t-accent animate-[sspin_.8s_linear_infinite]" />
          <span className="truncate tabular-nums">{step}</span>
          <span className="shrink-0 opacity-55 tabular-nums">{seconds} s</span>
        </div>
      )}

      {preview && (
        <div className="mt-[10px] text-[13px] text-dim max-w-[min(560px,86vw)] text-center">
          „<b className="font-normal text-fg">{preview}</b>"
        </div>
      )}

      <form onSubmit={submit} className="mt-[14px] flex gap-2 w-[min(560px,86vw)]">
        <input
          value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.stopPropagation()}
          autoComplete="off" spellCheck={false}
          placeholder={m.stage.typePlaceholder}
          disabled={state === 'listening'}
          className="field flex-1 min-w-0 rounded-pill px-4 py-[9px] text-[13.5px] bg-panel
                     placeholder:text-dim placeholder:opacity-70 disabled:opacity-40"
        />
        <button type="submit" className="chip shrink-0">{m.stage.send}</button>
      </form>

      <div className="mt-[6px] h-4 text-[12px] text-dim opacity-[.62]">
        {hint ?? (
          <>
            {m.stage.clickToTalk} · <Key>{m.keyboard.space}</Key> {m.stage.hold} ·{' '}
            <Key>?</Key> {m.stage.showsEveryKey}
          </>
        )}
      </div>
    </section>
  )
}
