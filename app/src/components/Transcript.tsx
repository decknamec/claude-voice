import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { useSession } from '../store/session.ts'
import { useSettings } from '../store/settings.ts'
import { useMessages } from '../lib/i18n/index.ts'
import { controls } from '../lib/controls.ts'
import { shortArg } from '../lib/tools.ts'
import { useToasts } from './ui/Toasts.tsx'
import type { Bubble, TrailRow } from '../lib/types.ts'

function Message ({ bubble }: { bubble: Bubble }) {
  const { m } = useMessages()
  if (bubble.who === 'divider') {
    return (
      <div className="flex items-center gap-[10px] w-full max-w-[760px] mt-2 mb-[2px]
                      text-[11px] text-dim opacity-75
                      before:content-[''] before:flex-1 before:h-px before:bg-line
                      after:content-[''] after:flex-1 after:h-px after:bg-line">
        <span>{bubble.text}</span>
      </div>
    )
  }
  if (bubble.who === 'tool') {
    return (
      <div className="w-full max-w-[720px] rounded-panel border border-line bg-panel
                      px-[15px] py-[9px] text-[11.5px] text-dim opacity-50">
        {bubble.text}
      </div>
    )
  }
  return (
    <div className={clsx(
      'w-full max-w-[720px] rounded-panel border bg-panel shadow-panel',
      'animate-[rise_var(--t-slow)_var(--ease-out-sig)_both]',
      bubble.who === 'user' ? 'border-soft' : 'border-line',
      bubble.restored && 'opacity-[.72]'
    )} style={{ padding: 'var(--pad-msg)' }}>
      <div className="mb-[5px] text-[11px] uppercase tracking-[.07em] text-dim">
        {bubble.who === 'user' ? m.transcript.you : 'Claude'}
      </div>
      <div className="whitespace-pre-wrap break-words" style={{ fontSize: 'var(--fs)' }}>
        {bubble.text}
        {bubble.live && <span className="ml-[2px] inline-block w-[7px] animate-pulse">▌</span>}
      </div>
      {bubble.meta && <div className="mt-[6px] text-[11px] text-dim opacity-70">{bubble.meta}</div>}
    </div>
  )
}

function PermissionCard (
  { id, tool, input }: { id: string; tool: string; input: Record<string, unknown> }
) {
  const { m } = useMessages()
  const toast = useToasts(s => s.show)
  const handsFree = useSession(s => s.handsFree)
  const short = shortArg(tool, input)
  const answer = async (allow: boolean, scope?: 'exact' | 'tool') => {
    try { await controls.answerPermission(id, allow, scope) }
    catch (e) { toast(m.toast.error, String((e as Error).message), true) }
  }
  return (
    <div className="w-full max-w-[720px] rounded-panel border border-[var(--think)]
                    bg-panel shadow-panel p-[15px]
                    animate-[rise_var(--t-std)_var(--ease-out-sig)_both]">
      <div className="mb-[5px] text-[11px] uppercase tracking-[.07em] text-[var(--think)]">
        {m.transcript.approvalNeeded}
      </div>
      <div className="text-[14px]">{m.transcript.wantsToUse(tool)}</div>
      <pre className="mt-2 max-h-[160px] overflow-auto rounded-field bg-bg p-[10px]
                      font-mono text-[11px] text-dim whitespace-pre-wrap break-words">
        {JSON.stringify(input, null, 2)}
      </pre>
      <div className="mt-[10px] flex flex-wrap items-center gap-[6px]">
        <button className="chip" data-on="true" onClick={() => answer(true)}>
          {m.transcript.allow}
        </button>
        <button className="chip" data-danger="true" onClick={() => answer(false)}>
          {m.transcript.deny}
        </button>
        {/* Hands-free reads the question aloud and takes the answer by voice.
            Nobody guesses that, so it has to be on the card. */}
        {handsFree && (
          <span className="text-[11px] text-dim">{m.transcript.orSayYesNo}</span>
        )}
      </div>
      {/* The simple case stays one click; the scope sits in a second row below,
          so a session does not ask again for every Bash call. */}
      <div className="mt-2 flex flex-wrap gap-[6px] border-t border-line pt-2">
        <button className="chip text-[11px] py-[3px]" onClick={() => answer(true, 'exact')}>
          {short
            ? m.transcript.alwaysThis(short.length > 34 ? short.slice(0, 34) + '…' : short)
            : m.transcript.alwaysExactly}
        </button>
        <button className="chip text-[11px] py-[3px]" onClick={() => answer(true, 'tool')}>
          {m.transcript.alwaysTool(tool)}
        </button>
      </div>
    </div>
  )
}

function TrailEntry ({ row }: { row: TrailRow }) {
  const { m } = useMessages()
  const full = useSettings(s => s.fullCommands)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      onClick={() => ref.current?.classList.toggle('expanded')}
      className={clsx('group flex gap-[9px] items-baseline cursor-pointer py-px break-words',
                      row.dim && 'opacity-60')}
      title={m.transcript.expandRow}
    >
      <span className={clsx('shrink-0 min-w-[64px]', row.failed ? 'text-err' : 'text-accent')}>
        {row.name === '__thinking' ? m.transcript.thinking : row.name}
      </span>
      <span className={clsx('flex-1 opacity-85 min-w-0',
                            full ? 'whitespace-pre-wrap'
                                 : 'truncate group-[.expanded]:whitespace-pre-wrap')}>
        {row.arg}
        {row.result && <span className="opacity-55"> · {row.result}</span>}
        {row.diff && (
          <span className="mt-[5px] block overflow-hidden rounded-field font-mono text-[11px] leading-[1.5]">
            {row.diff.removed.split('\n').slice(0, 14).map((line, i) => (
              <span key={'r' + i} className="block px-2 py-px whitespace-pre-wrap
                                             bg-[color-mix(in_srgb,var(--err)_14%,transparent)] text-err">- {line}</span>
            ))}
            {row.diff.added.split('\n').slice(0, 14).map((line, i) => (
              <span key={'a' + i} className="block px-2 py-px whitespace-pre-wrap
                                             bg-[color-mix(in_srgb,var(--ok)_16%,transparent)] text-ok">+ {line}</span>
            ))}
          </span>
        )}
      </span>
    </div>
  )
}

export function Transcript () {
  const { m } = useMessages()
  const bubbles = useSession(s => s.bubbles)
  const permissions = useSession(s => s.permissions)
  const trail = useSession(s => s.trail)
  const trailOpen = useSettings(s => s.trailOpen)
  const showToolLines = useSettings(s => s.toolLines)
  const box = useRef<HTMLDivElement>(null)

  // Newest message on top, so follow there, and only when the reader is at the
  // top anyway. Someone reading further down should not be yanked away.
  useEffect(() => {
    const el = box.current
    if (el && el.scrollTop < 120) el.scrollTo({ top: 0, behavior: 'smooth' })
  }, [bubbles.length, permissions.length])

  const visible = showToolLines ? bubbles : bubbles.filter(b => b.who !== 'tool')
  const empty = !visible.length && !permissions.length

  return (
    <section ref={box} className="flex flex-col items-center gap-[var(--gap-feed)]
                                  overflow-y-auto min-h-0 px-6 pt-1 pb-10">
      {empty && (
        <div className="mt-[26px] max-w-[520px] text-center">
          <p className="text-[15px] text-dim">{m.stage.nothingSpokenYet}</p>
          <p className="mt-2 text-[12.5px] text-dim opacity-70">{m.stage.emptyHint}</p>
        </div>
      )}

      {/* Display reversed: the newest sits on top while document order stays
          chronological. */}
      <div className="flex w-full max-w-[720px] flex-col-reverse gap-[var(--gap-feed)] mt-[26px]">
        {visible.map(b => <Message key={b.id} bubble={b} />)}
      </div>

      {permissions.map(p => <PermissionCard key={p.id} {...p} />)}

      {trailOpen && (
        <div className="w-full max-w-[720px] max-h-[240px] overflow-y-auto rounded-panel
                        border border-line bg-panel p-[10px] font-mono text-[11.5px]
                        text-dim leading-[1.55]">
          {trail.length
            ? trail.map(row => <TrailEntry key={row.id} row={row} />)
            : <span className="opacity-60">{m.transcript.noToolsYet}</span>}
        </div>
      )}
    </section>
  )
}
