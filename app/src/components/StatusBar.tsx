import { useEffect, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import {
  ArrowsDownUp, CalendarBlank, ChatsCircle, Clock, CurrencyDollar,
  Gauge, GitBranch, HourglassMedium, ShieldCheck
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { api } from '../lib/api.ts'
import { useSession } from '../store/session.ts'
import { useMessages } from '../lib/i18n/index.ts'
import { useToasts } from './ui/Toasts.tsx'
import { formatCount, formatDuration } from './PanelGroups.tsx'
import type { GitState, PermissionMode, RateWindow } from '../lib/types.ts'

function Divider () { return <span className="mx-[2px] h-[15px] w-px shrink-0 bg-line" /> }

function Value ({ title, icon, children }:
  { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span title={title} className="flex h-[26px] items-center gap-[6px] whitespace-nowrap">
      <span className="shrink-0 opacity-[.62]">{icon}</span>
      <b className="font-medium text-fg">{children}</b>
    </span>
  )
}

/**
 * A plan window as a bar plus a number. Past three quarters it takes on colour,
 * so the limit is visible before it is reached.
 */
function Window ({ title, icon, window: w }:
  { title: string; icon: React.ReactNode; window: RateWindow | null }) {
  if (!w || w.percent == null) return null
  const percent = Math.max(0, Math.min(100, w.percent))
  return (
    <span title={title} className="flex h-[26px] items-center gap-[6px] whitespace-nowrap">
      <span className="shrink-0 opacity-[.62]">{icon}</span>
      <span className="h-[4px] w-[34px] shrink-0 overflow-hidden rounded-[2px] bg-line">
        <i style={{ width: percent.toFixed(0) + '%' }}
           className={clsx('block h-full rounded-[2px] transition-all',
             percent >= 90 ? 'bg-err' : percent >= 75 ? 'bg-warn' : 'bg-dim')} />
      </span>
      <b className="font-medium text-fg">{Math.round(percent)} %</b>
    </span>
  )
}

function GitPopover ({ state }: { state: GitState }) {
  const { m } = useMessages()
  const set = useSession(s => s.set)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [pushArmed, setPushArmed] = useState(false)

  const run = async (action: string, name?: string) => {
    if (busy) return
    setBusy(true); setFailed(false); setMessage(m.git.running)
    try {
      const r = await api.gitRun(action, name)
      set({ git: r.state })
      setFailed(!r.ok)
      setMessage(r.message || (r.ok ? m.git.done : m.git.failed))
      if (r.ok && (action === 'switch' || action === 'create')) setBranchName('')
    } catch (e) { setFailed(true); setMessage(String((e as Error).message)) }
    finally { setBusy(false) }
  }

  const marks = [
    state.ahead ? '↑' + state.ahead : '',
    state.behind ? '↓' + state.behind : '',
    state.changed ? '•' + state.changed : ''
  ].filter(Boolean).join(' ')

  return (
    <Popover.Root>
      <Popover.Trigger
        title={m.git.branchHint}
        className="flex h-[26px] cursor-pointer items-center gap-[6px] rounded-field border-0
                   bg-transparent px-2 text-inherit transition-colors hover:bg-soft hover:text-fg
                   data-[state=open]:bg-soft data-[state=open]:text-fg
                   focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-1"
      >
        <GitBranch size={13} className="opacity-[.62]" />
        <b className="font-medium text-fg">{state.branch}</b>
        <span className="text-[10.5px] opacity-65">{marks}</span>
      </Popover.Trigger>
      <Popover.Portal>
        {/* Opens upward because the bar sits at the bottom edge. */}
        <Popover.Content
          side="top" align="start" sideOffset={8}
          className="z-50 flex w-[250px] flex-col gap-2 rounded-panel border border-line
                     bg-panel p-[10px] shadow-panel
                     animate-[rise_var(--t-std)_var(--ease-out-sig)_both]"
        >
          <div className="text-[11px] text-dim">
            {state.hasUpstream
              ? `${state.ahead} ${m.git.ahead}, ${state.behind} ${m.git.behind}, ${state.changed} ${m.git.changed}`
              : `${m.git.noUpstream}, ${state.changed} ${m.git.changed}`}
          </div>
          <div className="-mx-1 flex max-h-[190px] flex-col gap-px overflow-y-auto">
            {(state.branches ?? []).map(name => (
              <button
                key={name} type="button" disabled={name === state.branch}
                onClick={() => run('switch', name)}
                className={clsx('flex w-full items-center gap-[6px] truncate rounded-field border-0',
                  'bg-transparent px-2 py-1 text-left text-[12px]',
                  name === state.branch
                    ? 'cursor-default text-fg'
                    : 'cursor-pointer text-label hover:bg-soft hover:text-fg')}
              >
                <span className={clsx('text-[8px]', name === state.branch ? 'text-accent' : 'opacity-40')}>
                  {name === state.branch ? '●' : '○'}
                </span>
                {name}
              </button>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); if (branchName.trim()) run('create', branchName.trim()) }}
                className="flex gap-[6px]">
            <input
              value={branchName} onChange={e => setBranchName(e.target.value)}
              placeholder={m.git.newBranch} autoComplete="off" spellCheck={false}
              className="field min-w-0 flex-1 px-2 py-[5px] text-[12px]"
            />
            <button type="submit" className="chip text-[11px] py-[3px]">{m.git.create}</button>
          </form>
          <div className="flex gap-[6px] border-t border-line pt-2">
            <button className="chip flex-1 justify-center text-[11px] py-[3px]"
                    onClick={() => run('fetch')}>{m.git.fetch}</button>
            <button className="chip flex-1 justify-center text-[11px] py-[3px]"
                    onClick={() => run('pull')}>{m.git.pull}</button>
            {/* Pushing leaves the machine, so a second click confirms. */}
            <button
              className="chip flex-1 justify-center text-[11px] py-[3px] text-err"
              onClick={() => {
                if (!pushArmed) {
                  setPushArmed(true)
                  setTimeout(() => setPushArmed(false), 5000)
                  return
                }
                setPushArmed(false); run('push')
              }}
            >{pushArmed ? m.git.reallyPush : m.git.push}</button>
          </div>
          {message && (
            <div className={clsx('max-h-[70px] overflow-y-auto whitespace-pre-wrap text-[11px]',
                                 failed ? 'text-err' : 'text-dim')}>{message}</div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function StatusBar (
  { mode, onCycleMode, narrow }:
  { mode: PermissionMode; onCycleMode: () => void; narrow: boolean }
) {
  const { m } = useMessages()
  const stats = useSession(s => s.stats)
  const git = useSession(s => s.git)
  const set = useSession(s => s.set)
  const toast = useToasts(s => s.show)
  const [runtime, setRuntime] = useState(0)

  useEffect(() => {
    const tick = () => setRuntime(Date.now() - stats.startedAt)
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [stats.startedAt])

  useEffect(() => { void api.git().then(g => set({ git: g })).catch(() => {}) }, [set])

  const sent = stats.inTok + stats.cacheWrite
  const ctx = stats.ctx
  const percent = ctx ? Math.max(0, Math.min(100, ctx.percent)) : 0

  const showBreakdown = async () => {
    try {
      const c = await api.context(true)
      const top = c.categories.sort((a, b) => b.tokens - a.tokens).slice(0, 6)
        .map(k => `${k.name}: ${formatCount(k.tokens)}`).join(' · ')
      toast(m.toast.context,
        `${Math.round(c.percent)} % ${m.bar.of} ${formatCount(c.max)}. ${top || m.bar.noBreakdown}`)
    } catch (e) { toast(m.toast.error, String((e as Error).message), true) }
  }

  return (
    <footer className="flex min-h-[38px] items-center gap-[10px] border-t border-line
                       bg-panel px-[18px] text-[11.5px] tabular-nums text-dim">
      {/* Everything fits on one line while there is room. Below the breakpoint
          it would wrap and the bar would grow from 38 to 71 pixels, measured,
          and never shrink back - so the values one glances at least often step
          aside instead. Runtime, turns and the token split are all in the
          status panel. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[10px] py-1">
        {git?.repo && <><GitPopover state={git} /><Divider /></>}

        {!narrow && (
          <>
            <Value title={m.bar.sessionRuntime} icon={<Clock size={13} />}>
              {formatDuration(runtime)}
            </Value>
            <Value title={m.bar.completedTurns} icon={<ChatsCircle size={13} />}>{stats.turns}</Value>
            <Value title={m.bar.tokens} icon={<ArrowsDownUp size={13} />}>
              {stats.cacheRead
                ? `${formatCount(sent)} ↑ (${formatCount(stats.cacheRead)} cache) ${formatCount(stats.outTok)} ↓`
                : `${formatCount(sent)} ↑ ${formatCount(stats.outTok)} ↓`}
            </Value>

            <Divider />
          </>
        )}

        <button
          title={m.bar.contextFill}
          onClick={showBreakdown}
          className="flex h-[26px] cursor-pointer items-center gap-[6px] rounded-field border-0
                     bg-transparent px-2 text-inherit transition-colors hover:bg-soft hover:text-fg
                     focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-1"
        >
          <Gauge size={13} className="opacity-[.62]" />
          <span className="h-[5px] w-[44px] shrink-0 overflow-hidden rounded-[3px] bg-line">
            <i style={{ width: percent.toFixed(1) + '%' }}
               className={clsx('block h-full rounded-[3px] transition-all',
                 percent >= 85 ? 'bg-err' : percent >= 66 ? 'bg-warn' : 'bg-accent')} />
          </span>
          <b className="font-medium text-fg">
            {ctx
              ? `${percent < 1 ? '<1' : Math.round(percent)} % · ${formatCount(ctx.tokens)}/${formatCount(ctx.max)}`
              : '–'}
          </b>
        </button>

        <Value title={m.bar.costBySdk} icon={<CurrencyDollar size={13} />}>
          {stats.costUsd
            ? stats.costUsd.toFixed(stats.costUsd < 1 ? 3 : 2).replace('.', ',') + ' $'
            : '–'}
        </Value>

        {(stats.limits?.fiveHour || stats.limits?.sevenDay) && <Divider />}
        <Window title={m.bar.fiveHourWindow} icon={<HourglassMedium size={13} />}
                window={stats.limits?.fiveHour ?? null} />
        <Window title={m.bar.sevenDayWindow} icon={<CalendarBlank size={13} />}
                window={stats.limits?.sevenDay ?? null} />
      </div>

      <button
        onClick={onCycleMode}
        title={m.bar.toolMode}
        className={clsx('shrink-0 flex h-[26px] cursor-pointer items-center gap-[6px] rounded-field',
          'border-0 bg-transparent px-2 transition-colors hover:bg-soft hover:text-fg',
          'focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-1',
          mode === 'bypassPermissions' ? 'text-err' : 'text-inherit')}
      >
        <ShieldCheck size={13} className="opacity-[.62]" />
        <span>{m.mode[mode]}</span>
      </button>
    </footer>
  )
}
