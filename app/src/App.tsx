import { useCallback, useEffect, useRef, useState } from 'react'
import { SidebarSimple, X } from '@phosphor-icons/react'
import clsx from 'clsx'
import { api } from './lib/api.ts'
import { audio } from './lib/audio.ts'
import { controls, describeError } from './lib/controls.ts'
import { connect, markTurnStart, setAfterTurn, setMessages, setNotifier } from './lib/stream.ts'
import { ACCENTS, NARROW, TEXT_SIZES, useSettings } from './store/settings.ts'
import { useSession } from './store/session.ts'
import { useMessages } from './lib/i18n/index.ts'
import { Stage } from './components/Stage.tsx'
import { Transcript } from './components/Transcript.tsx'
import { StatusBar } from './components/StatusBar.tsx'
import { Toasts, useToasts } from './components/ui/Toasts.tsx'
import { AppearanceGroup, MODES, SettingsGroup, TasksGroup } from './components/SettingsGroups.tsx'
import {
  CommandsGroup, HistoryGroup, McpGroup, StatusGroup, SubagentsGroup
} from './components/PanelGroups.tsx'
import type { ModelInfo, PermissionMode } from './lib/types.ts'

export default function App () {
  const { m, locale } = useMessages()
  const settings = useSettings()
  const session = useSession()
  const toast = useToasts(s => s.show)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [mode, setMode] = useState<PermissionMode>('default')
  const [keyHelp, setKeyHelp] = useState(false)

  const [sessionReady, setSessionReady] = useState(false)
  const spaceHeld = useRef(false)

  /**
   * Below this width the sidebar covers the content instead of sitting beside
   * it. The threshold belongs in JS and not only in a width variant: what
   * changes is the behaviour, not just the margin - the overlay needs a
   * backdrop, a close button and an Escape handler.
   */
  const [narrow, setNarrow] = useState(() => matchMedia(NARROW).matches)
  useEffect(() => {
    const query = matchMedia(NARROW)
    const sync = () => setNarrow(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const overlaying = narrow && settings.sidebarOpen
  const closeSidebar = useCallback(() => settings.set({ sidebarOpen: false }), [settings])

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') root.removeAttribute('data-theme')
    else root.dataset.theme = settings.theme
  }, [settings.theme])

  useEffect(() => {
    const accent = ACCENTS.find(a => a.key === settings.accent) ?? ACCENTS[0]
    const dark = (document.documentElement.dataset.theme
      ?? (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light')) === 'dark'
    const color = dark ? accent.dark : accent.light
    document.documentElement.style.setProperty('--accent', color)
    document.documentElement.style.setProperty('--accent-soft', color + '22')
  }, [settings.accent, settings.theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--fs', (TEXT_SIZES[settings.textSize] ?? 15) + 'px')
  }, [settings.textSize])

  useEffect(() => {
    const body = document.body
    body.dataset.density = settings.density
    body.dataset.corners = settings.corners
    body.dataset.motion = settings.reduceMotion ? 'reduced' : 'full'
    body.dataset.state = session.state
  }, [settings.density, settings.corners, settings.reduceMotion, session.state])

  useEffect(() => { document.documentElement.lang = locale }, [locale])
  useEffect(() => {
    audio.setMuted(settings.muted)
    audio.setRate(settings.speakingRate / 100)
  }, [settings.muted, settings.speakingRate])

  useEffect(() => {
    setMessages(m)
    setNotifier((title, text, bad) => toast(title, text, bad))
  }, [m, toast])

  useEffect(() => {
    setAfterTurn(() => {
      setSessionReady(true)
      if (!models.length) void api.models().then(d => setModels(d.models)).catch(() => {})
    })
  }, [models.length])

  const messagesRef = useRef(m)
  useEffect(() => { messagesRef.current = m }, [m])

  useEffect(() => {
    connect()
    audio.on({
      recordingDone: blob => {
        controls.submitRecording(blob, messagesRef.current).catch(err => {
          const [title, text] = describeError(err, messagesRef.current)
          toast(title, text, true)
        })
      },
      preview: text => {
        if (useSession.getState().state === 'listening') session.set({ preview: text })
      },
      playback: () => {
        session.set({ speaking: audio.isSpeaking() })
        useSession.getState().derive()
      },
      vad: event => {
        const s = useSession.getState()
        if (event.type === 'ready') {
          session.set({ hint: messagesRef.current.stage.handsFreeActive })
          return
        }
        if (!useSession.getState().handsFree) return
        if (event.type === 'start') {
          if (s.busy && !audio.isSpeaking()) return          // a turn is in flight
          if (audio.isSpeaking()) void controls.interrupt().then(() => controls.startRecording())
          else if (!s.busy && s.state === 'idle') void controls.startRecording()
        } else if (event.type === 'end') {
          if (s.state === 'listening') controls.stopRecording()
        }
      }
    })
    // After a reload mid-session the counters would otherwise sit at zero while
    // the session keeps running.
    void api.stats().then(stats => {
      session.set({ stats })
      if (stats.turns) setSessionReady(true)
    }).catch(() => {})
    void api.config().then(c => {
      session.set({
        cwd: c.cwd.replace(/^\/Users\/[^/]+/, '~'),
        modelName: c.model ?? ''
      })
      setMode((c.permissionMode as PermissionMode) ?? 'default')
    }).catch(() => {})
    // Wiring the engine once is the point; re-running it would attach a second
    // event source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cycleMode = useCallback(async () => {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length]
    setMode(next)
    try {
      const r = await api.setMode(next)
      toast(m.toast.mode, `${m.settings.tools}: ${m.mode[next]}` +
        (r.restarted ? m.toast.restartedForMode : ''))
    } catch (err) { toast(m.toast.error, String((err as Error).message), true) }
  }, [mode, m, toast])

  const toggleHandsFree = useCallback(async (on: boolean) => {
    session.set({ handsFree: on })
    if (!on) { session.set({ hint: null }); return }
    try {
      await audio.microphone()
      await audio.attachVad()
      audio.recalibrate()
      session.set({ hint: m.stage.calibrating })
    } catch (err) {
      const [title, text] = describeError(err, m)
      toast(title, text, true)
      session.set({ handsFree: false })
    }
  }, [m, session, toast])

  useEffect(() => {
    const typing = (el: EventTarget | null) =>
      el instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)
    const down = (ev: KeyboardEvent) => {
      if (typing(ev.target)) return
      if (ev.key === '?') { ev.preventDefault(); setKeyHelp(v => !v); return }
      if (keyHelp) { setKeyHelp(false); return }
      if (ev.key === 'Tab' && ev.shiftKey) { ev.preventDefault(); void cycleMode(); return }
      const key = ev.key.toLowerCase()
      if (key === 'f') { ev.preventDefault(); void toggleHandsFree(!session.handsFree); return }
      if (key === 'a') { ev.preventDefault(); settings.set({ trailOpen: !settings.trailOpen }); return }
      if (key === 'n') { ev.preventDefault(); void controls.newSession(); return }
      if (key === 's') { ev.preventDefault(); settings.set({ sidebarOpen: !settings.sidebarOpen }); return }
      if (ev.code === 'Escape') {
        ev.preventDefault()
        // The sidebar covering the content goes first: Escape clears what is in
        // the way before it reaches the running turn.
        if (overlaying) { closeSidebar(); return }
        void controls.interrupt(); return
      }
      if (ev.code === 'Space' && !ev.repeat && !spaceHeld.current) {
        ev.preventDefault(); spaceHeld.current = true
        markTurnStart()
        controls.startRecording().catch(err => {
          const [title, text] = describeError(err, m)
          toast(title, text, true)
        })
      }
    }
    const up = (ev: KeyboardEvent) => {
      if (ev.code === 'Space' && spaceHeld.current) {
        ev.preventDefault(); spaceHeld.current = false; controls.stopRecording()
      }
    }
    addEventListener('keydown', down)
    addEventListener('keyup', up)
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up) }
  }, [session.handsFree, keyHelp, overlaying, closeSidebar, cycleMode, toggleHandsFree, settings, m, toast])

  const keyRows: [string, string][] = [
    [m.keyboard.space, m.keyboard.holdToTalk],
    ['Esc', m.keyboard.interrupt],
    ['F', m.keyboard.toggleHandsFree],
    ['A', m.keyboard.trail],
    ['N', m.keyboard.newSession],
    ['S', m.keyboard.toggleSidebar],
    [`${m.keyboard.shift}+Tab`, m.keyboard.cycleMode],
    ['?', m.keyboard.thisOverview]
  ]

  return (
    <>
      {!settings.noGlow && (
        <div aria-hidden className="pointer-events-none fixed inset-[-30%] z-0 opacity-[.10] blur-[60px]"
             style={{ background: 'radial-gradient(closest-side, var(--accent), transparent 70%)' }} />
      )}
      <Toasts />

      {keyHelp && (
        <div onClick={() => setKeyHelp(false)}
             className="fixed inset-0 z-30 grid place-items-center backdrop-blur-[6px]
                        bg-[color-mix(in_srgb,var(--bg)_72%,transparent)]
                        animate-[rise_var(--t-std)_var(--ease-out-sig)_both]">
          <div className="min-w-[300px] rounded-panel border border-line bg-panel px-[26px] py-[22px] shadow-panel">
            <h3 className="m-0 mb-[14px] text-[12px] uppercase tracking-[.08em] text-dim">
              {m.keyboard.title}
            </h3>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-[9px] text-[13.5px]">
              {keyRows.map(([key, description]) => (
                <div key={key} className="contents">
                  <dt className="m-0">
                    <kbd className="rounded-[5px] border border-line bg-bg px-[6px] py-px font-mono text-[11px]">
                      {key}
                    </kbd>
                  </dt>
                  <dd className="m-0 text-dim">{description}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 mb-0 text-[11.5px] text-dim opacity-70">{m.keyboard.clickToClose}</p>
          </div>
        </div>
      )}

      <div className="relative z-[1] h-full">
        {overlaying && (
          <div aria-hidden onClick={closeSidebar}
               className="fixed inset-0 z-[5] bg-[color-mix(in_srgb,var(--bg)_65%,transparent)]
                          animate-[fade_var(--t-quick)_var(--ease-out-sig)_both]" />
        )}

        <aside className={clsx(
          'fixed left-0 top-0 z-[6] flex h-dvh w-[280px] flex-col gap-[18px] overflow-y-auto overflow-x-hidden',
          'border-r border-line bg-panel px-[18px] py-[20px] transition-transform duration-300 ease-[var(--ease-sig)]',
          !settings.sidebarOpen && '-translate-x-full',
          overlaying && 'shadow-panel'
        )}>
          <div className="flex items-center gap-[9px] text-[13px] font-semibold">
            <span className="h-[7px] w-[7px] rounded-full bg-accent" />
            <b>Claude Voice</b>
            {/* The header toggle sits underneath the sidebar here. Rather than
                forcing it above, the sidebar carries its own way out. */}
            {narrow && (
              <button onClick={closeSidebar}
                      aria-label={m.header.closeSidebar}
                      title={m.header.closeSidebarHint}
                      className="chip ml-auto h-[26px] w-[26px] justify-center p-0">
                <X size={13} />
              </button>
            )}
          </div>
          <SettingsGroup models={models} />
          <AppearanceGroup />
          <TasksGroup />
          <CommandsGroup ready={sessionReady} />
          <StatusGroup ready={sessionReady} />
          <McpGroup ready={sessionReady} />
          <SubagentsGroup />
          <HistoryGroup />
        </aside>

        <main className={clsx('grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)_auto] min-w-0',
                              'transition-[margin] duration-300 ease-[var(--ease-sig)]',
                              settings.sidebarOpen && !narrow ? 'ml-[280px]' : 'ml-0')}>
          <header className="flex items-center gap-[10px] border-b border-line px-[18px] py-[13px]">
            <button
              onClick={() => settings.set({ sidebarOpen: !settings.sidebarOpen })}
              aria-label={m.header.toggleSidebar} aria-expanded={settings.sidebarOpen}
              title={m.header.toggleSidebarHint}
              className="chip h-[30px] w-[30px] justify-center p-0"
            >
              <SidebarSimple size={15}
                             className={clsx('transition-transform',
                                             !settings.sidebarOpen && 'scale-x-[-1] opacity-70')} />
            </button>
            <span className="flex min-w-0 items-baseline gap-[7px] text-[12px] text-dim">
              <b className="truncate font-medium text-fg" title={m.header.modelInUse}>
                {session.modelName || m.header.defaultModel}
              </b>
              <span className="opacity-40">·</span>
              <span className="truncate font-mono text-[11px]" title={m.header.workingDirectory}>
                {session.cwd}
              </span>
            </span>
            <span className="ml-auto flex gap-[6px]">
              <button className="chip" title={m.header.newSessionHint}
                      onClick={() => void controls.newSession()}>{m.header.newSession}</button>
              <button className="chip" data-on={session.handsFree}
                      title={m.header.handsFreeHint}
                      onClick={() => void toggleHandsFree(!session.handsFree)}>{m.header.handsFree}</button>
              <button className="chip" data-on={settings.trailOpen}
                      title={m.header.activityHint}
                      onClick={() => settings.set({ trailOpen: !settings.trailOpen })}>
                {m.header.activity}
              </button>
              <button className="chip" title={m.header.interruptHint}
                      onClick={() => void controls.interrupt()}>{m.header.interrupt}</button>
              <button className="chip" data-danger="true" title={m.header.quitHint}
                      onClick={() => { void api.shutdown(); session.set({ state: 'off' }) }}>
                {m.header.quit}
              </button>
            </span>
          </header>

          <Stage />
          <Transcript />
          <StatusBar mode={mode} onCycleMode={() => void cycleMode()} />
        </main>
      </div>
    </>
  )
}
