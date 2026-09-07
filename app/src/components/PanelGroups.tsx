import { useCallback, useEffect, useState } from 'react'
import { ArrowsClockwise } from '@phosphor-icons/react'
import clsx from 'clsx'
import { api } from '../lib/api.ts'
import { controls } from '../lib/controls.ts'
import { useSession, nextId } from '../store/session.ts'
import { useMessages } from '../lib/i18n/index.ts'
import { Group, IconButton } from './ui/Group.tsx'
import { useToasts } from './ui/Toasts.tsx'
import { resetStats } from '../lib/stream.ts'
import { audio } from '../lib/audio.ts'
import type { McpServer, SessionSummary, SlashCommand, StatusReport } from '../lib/types.ts'

export const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600), min = Math.floor(total / 60) % 60, s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(min)}:${pad(s)}` : `${min}:${pad(s)}`
}

export const formatCount = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' M'
  : n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'k'
  : String(n)

function Empty ({ text }: { text: string }) {
  return <div className="px-2 text-[11.5px] text-dim opacity-70">{text}</div>
}

const noSessionYet = (error: string) => /no running session/i.test(error)

export function CommandsGroup ({ ready }: { ready: boolean }) {
  const { m } = useMessages()
  const [list, setList] = useState<SlashCommand[] | null>(null)
  const [error, setError] = useState('')
  const toast = useToasts(s => s.show)

  const load = useCallback(() => {
    void api.commands()
      .then(d => { setList(d.commands); setError('') })
      .catch(e => setError(String((e as Error).message)))
  }, [])
  // Loading needs a running session, so retry once the first turn produced one.
  useEffect(() => { if (ready && list === null) load() }, [ready, list, load])

  return (
    <Group id="commands" title={m.groups.commands} badge={list?.length ?? '–'} onOpen={load}>
      {list?.length
        ? (
          <div className="-mx-2 flex max-h-[230px] flex-col gap-px overflow-y-auto">
            {list.map(c => (
              <button
                key={c.name} type="button"
                title={c.description + (c.hint ? ' · ' + c.hint : '')}
                onClick={() => controls.submitText('/' + c.name, m).catch(e =>
                  toast(m.toast.error, String((e as Error).message), true))}
                className="flex w-full cursor-pointer flex-col gap-px rounded-field border-0
                           bg-transparent px-2 py-[5px] text-left transition-colors hover:bg-soft
                           focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
              >
                <span className="text-[12px] text-fg">/{c.name}</span>
                <span className="truncate text-[11px] text-dim">{c.description}</span>
              </button>
            ))}
          </div>
        )
        : <Empty text={error
            ? (noSessionYet(error)
                ? m.groups.sessionStartsWithFirstQuestion
                : m.groups.unreadable + ': ' + error)
            : m.groups.noCommands} />}
    </Group>
  )
}

const MCP_DOT: Record<string, string> = {
  connected: 'bg-ok',
  failed: 'bg-err',
  'needs-auth': 'bg-warn',
  pending: 'bg-warn',
  disabled: 'bg-dim'
}

export function McpGroup ({ ready }: { ready: boolean }) {
  const { m } = useMessages()
  const [list, setList] = useState<McpServer[] | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    void api.mcp().then(d => { setList(d.servers); setError('') })
      .catch(e => setError(String((e as Error).message)))
  }, [])
  useEffect(() => { if (ready && list === null) load() }, [ready, list, load])

  return (
    <Group id="mcp" title={m.groups.mcp} badge={list?.length ?? '–'} onOpen={load}>
      {list?.length
        ? list.map(server => (
            <div key={server.name} className="flex items-center gap-[7px] text-[12px] text-dim"
                 title={`${server.status}${server.scope ? ' · ' + server.scope : ''}` +
                        `${server.error ? ' · ' + server.error : ''}` +
                        (server.tools.length ? '\n' + server.tools.join(', ') : '')}>
              <span className={clsx('h-[6px] w-[6px] shrink-0 rounded-full',
                                    MCP_DOT[server.status] ?? 'bg-dim')} />
              <span className="truncate text-fg">{server.name}</span>
              <span className="ml-auto shrink-0 tabular-nums opacity-70">
                {server.tools.length
                  ? m.groups.toolCount(server.tools.length)
                  : m.mcpState[server.status]}
              </span>
            </div>
          ))
        : <Empty text={error && noSessionYet(error)
            ? m.groups.sessionStartsWithFirstQuestion
            : m.groups.noMcp} />}
    </Group>
  )
}

export function SubagentsGroup () {
  const { m } = useMessages()
  const subagents = useSession(s => s.subagents)
  const [, tick] = useState(0)
  // A running subagent shows its duration; without a tick it would stand still.
  const anyRunning = subagents.some(a => !a.finished)
  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [anyRunning])

  const running = subagents.filter(a => !a.finished).length
  return (
    <Group id="subagents" title={m.groups.subagents}
           badge={running || subagents.length} badgeActive={running > 0}>
      {subagents.length
        ? subagents.map(a => (
            <div key={a.id} className="flex flex-col gap-[3px] rounded-[9px] border border-line px-[10px] py-2">
              <div className="flex items-center gap-[6px] text-[12px] text-fg">
                <span className={clsx('h-[6px] w-[6px] shrink-0 rounded-full',
                  a.finished ? (a.ok === false ? 'bg-err' : 'bg-dim')
                             : 'bg-accent animate-[agent-pulse_1.4s_ease-in-out_infinite]')} />
                <span>{a.kind}</span>
                <span className="ml-auto rounded-full bg-line px-[6px] py-px text-[10.5px] tabular-nums text-dim">
                  {formatDuration((a.end ?? Date.now()) - a.start)}
                </span>
              </div>
              <div className="line-clamp-2 text-[11px] text-dim">{a.description}</div>
              {a.tool && (
                <div className="truncate text-[11px] text-dim opacity-80">
                  {a.finished
                    ? (a.ok === false ? m.git.failed : m.groups.done)
                    : '· ' + a.tool}
                </div>
              )}
            </div>
          ))
        : <Empty text={m.groups.noSubagents} />}
    </Group>
  )
}

type Row = ['head', string] | ['row', string, string, boolean?]

export function StatusGroup ({ ready }: { ready: boolean }) {
  const { m, locale } = useMessages()
  const [report, setReport] = useState<StatusReport | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    setBusy(true)
    void api.status().then(setReport).catch(() => {}).finally(() => setBusy(false))
  }, [])
  useEffect(() => { if (ready) load() }, [ready, load])

  const rows: Row[] = []
  if (report) {
    const ctx = report.usage.ctx
    rows.push(['head', m.status.work])
    rows.push(['row', m.status.directory, report.work.cwd.replace(/^\/Users\/[^/]+/, '~')])
    if (report.work.branch) rows.push(['row', m.status.branch, report.work.branch])
    rows.push(['head', m.status.session])
    rows.push(['row', m.status.running, report.session.running ? m.status.yes : m.status.no,
               !report.session.running])
    rows.push(['row', m.status.id, report.session.id ? report.session.id.slice(0, 8) : m.status.noneYet])
    rows.push(['row', m.status.model, report.session.model ?? m.settings.asConfigured])
    rows.push(['row', m.status.depth, report.session.depth ?? m.settings.asConfigured])
    rows.push(['row', m.status.style,
               m.style[report.session.style as keyof typeof m.style] ?? report.session.style])
    rows.push(['row', m.status.runtime, formatDuration(report.session.runtimeMs)])
    rows.push(['head', m.status.usage])
    rows.push(['row', m.status.turns, String(report.usage.turns)])
    rows.push(['row', m.status.tokensIn, formatCount(report.usage.in + report.usage.cache)])
    rows.push(['row', m.status.tokensOut, formatCount(report.usage.out)])
    rows.push(['row', m.status.cost, report.usage.costUsd.toFixed(3).replace('.', ',') + ' $'])
    if (ctx) {
      rows.push(['row', m.status.context,
                 `${Math.round(ctx.percent)} % · ${formatCount(ctx.tokens)}/${formatCount(ctx.max)}`])
    }
    const perModel = Object.entries(report.usage.models ?? {})
    if (perModel.length > 1) {
      rows.push(['head', m.status.costPerModel])
      for (const [name, usage] of perModel) {
        rows.push(['row', name.replace(/^claude-/, ''),
                   usage.costUsd.toFixed(3).replace('.', ',') + ' $'])
      }
    }
    if (report.account) {
      rows.push(['head', m.status.account])
      if (report.account.email) rows.push(['row', m.status.email, report.account.email])
      if (report.account.organization) {
        rows.push(['row', m.status.organisation, report.account.organization])
      }
      if (report.account.subscriptionType) {
        rows.push(['row', m.status.plan, report.account.subscriptionType])
      }
    }
    const limits = (report.limits as {
      rate_limits?: Record<string, { utilization?: number; resets_at?: string } | null>
    } | null)?.rate_limits
    if (report.limits?.rate_limits_available && limits) {
      rows.push(['head', m.status.planLimits])
      const windows = [
        [m.status.fiveHours, 'five_hour'], [m.status.sevenDays, 'seven_day'],
        [m.status.sevenDaysOpus, 'seven_day_opus'], [m.status.sevenDaysSonnet, 'seven_day_sonnet']
      ] as const
      for (const [label, key] of windows) {
        const w = limits[key]
        if (!w || w.utilization == null) continue
        const resets = w.resets_at
          ? ' · ' + new Date(w.resets_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
          : ''
        rows.push(['row', label, Math.round(w.utilization) + ' %' + resets, w.utilization >= 90])
      }
    }
    rows.push(['head', m.status.speechRecognition])
    rows.push(['row', m.status.model, report.speechRecognition.model.split('/').pop() ?? '',
               !report.speechRecognition.present])
    const whisperState = { own: m.status.ownProcess, foreign: m.status.foreignProcess,
                           off: m.status.serverOff }[report.speechRecognition.server]
    rows.push(['row', m.status.server, whisperState ?? report.speechRecognition.server,
               report.speechRecognition.server === 'off'])
    rows.push(['head', m.status.speechOutput])
    rows.push(['row', m.status.backend, report.speechOutput.backend])
    rows.push(['row', m.status.voice, report.speechOutput.voice])
    rows.push(['head', m.status.environment])
    rows.push(['row', m.status.node, report.runtime.node])
    rows.push(['row', m.status.sdk, report.runtime.sdk || m.status.unknown])
    rows.push(['row', m.status.port, String(report.runtime.port)])
  }

  return (
    <Group
      id="status" title={m.groups.status} onOpen={load}
      action={<IconButton title={m.groups.reload} onClick={load} busy={busy}>
        <ArrowsClockwise size={12} weight="bold" />
      </IconButton>}
    >
      {report
        ? (
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
            {rows.map((row, i) => row[0] === 'head'
              ? <dt key={i} className="col-span-2 mt-2 text-[10px] uppercase tracking-[.07em]
                                       text-dim opacity-70 first:mt-0">{row[1]}</dt>
              : (
                <div key={i} className="contents">
                  <dt className="whitespace-nowrap text-dim">{row[1]}</dt>
                  <dd title={row[2]} className={clsx('m-0 truncate text-right tabular-nums',
                                                     row[3] ? 'text-err' : 'text-fg')}>{row[2]}</dd>
                </div>
              ))}
          </dl>
        )
        : <Empty text={m.groups.sessionStartsWithFirstQuestion} />}
    </Group>
  )
}

export function HistoryGroup () {
  const { m, since } = useMessages()
  const [list, setList] = useState<SessionSummary[] | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToasts(s => s.show)
  const session = useSession()

  const load = useCallback(() => {
    setBusy(true)
    void api.sessions().then(d => setList(d.sessions)).catch(() => setList([]))
      .finally(() => setBusy(false))
  }, [])
  useEffect(load, [load])

  const resume = async (id: string, title: string) => {
    try {
      const r = await api.resume(id)
      audio.stopPlayback()
      session.clear()
      resetStats()
      // Resume restores the session's memory, but the window stays empty, so
      // the conversation itself has to be replayed from the transcript.
      let contributions = 0
      for (const block of r.transcript ?? []) {
        if (block.role === 'tool') {
          session.addBubble({
            id: nextId(), who: 'tool', restored: true,
            text: block.n > 1
              ? m.restore.toolCalls(block.n, block.names.join(', '))
              : '↳ ' + block.names[0]
          })
        } else {
          contributions++
          session.addBubble({
            id: nextId(), who: block.role === 'user' ? 'user' : 'assistant',
            text: block.text, restored: true
          })
        }
      }
      session.addBubble({
        id: nextId(), who: 'divider',
        text: r.transcript?.length ? m.restore.restored(contributions) : m.restore.noTranscript
      })
      toast(m.toast.session, m.toast.resumed(title))
      load()
    } catch (e) { toast(m.toast.error, String((e as Error).message), true) }
  }

  return (
    <Group
      id="history" title={m.groups.history} grows
      action={<IconButton title={m.groups.reload} onClick={load} busy={busy}>
        <ArrowsClockwise size={12} weight="bold" />
      </IconButton>}
    >
      <div className="-mx-2 min-h-0 flex-1 overflow-y-auto">
        {list?.length
          ? list.map(s => (
              <button
                key={s.id} type="button" title={s.id} disabled={s.current}
                onClick={() => resume(s.id, s.title)}
                className={clsx('flex w-full cursor-pointer flex-col gap-[2px] rounded-[8px] border-0',
                                'bg-transparent px-2 py-[7px] text-left transition-colors',
                                s.current ? 'cursor-default' : 'hover:bg-soft')}
              >
                <span className={clsx('truncate text-[12.5px]',
                                      s.current ? 'text-[var(--listen)]' : 'text-fg')}>{s.title}</span>
                <span className="text-[10.5px] text-dim">{since(s.lastModified)}</span>
              </button>
            ))
          : <Empty text={m.groups.noSessions} />}
      </div>
    </Group>
  )
}
