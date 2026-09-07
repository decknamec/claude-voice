import { useEffect, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import {
  ArrowsDownUp, CalendarBlank, ChatsCircle, Clock, CurrencyDollar,
  Gauge, GitBranch, HourglassMedium, ShieldCheck
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { api } from '../lib/api.ts'
import { useSitzung } from '../store/sitzung.ts'
import { useT } from '../lib/useT.ts'
import { useMeldungen } from './ui/Meldungen.tsx'
import { zahl } from './GruppenUnten.tsx'
import { MODUS_NAME } from './GruppenOben.tsx'
import type { Fenster, GitLage } from '../lib/types.ts'

const dauerText = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s % 60
  const zz = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${zz(m)}:${zz(r)}` : `${m}:${zz(r)}`
}

function Teiler () { return <span className="mx-[2px] h-[15px] w-px shrink-0 bg-line" /> }

function Wert ({ titel, icon, children }:
  { titel: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span title={titel} className="flex h-[26px] items-center gap-[6px] whitespace-nowrap">
      <span className="shrink-0 opacity-[.62]">{icon}</span>
      <b className="font-medium text-fg">{children}</b>
    </span>
  )
}

/** Plangrenze als Balken plus Zahl. Ab drei Vierteln färbt er sich, damit man
 *  das Limit sieht, bevor man hineinläuft. */
function Grenze ({ titel, icon, f }: { titel: string; icon: React.ReactNode; f: Fenster | null }) {
  if (!f || f.pct == null) return null
  const pct = Math.max(0, Math.min(100, f.pct))
  return (
    <span title={titel} className="flex h-[26px] items-center gap-[6px] whitespace-nowrap">
      <span className="shrink-0 opacity-[.62]">{icon}</span>
      <span className="h-[4px] w-[34px] shrink-0 overflow-hidden rounded-[2px] bg-line">
        <i style={{ width: pct.toFixed(0) + '%' }}
           className={clsx('block h-full rounded-[2px] transition-all',
             pct >= 90 ? 'bg-err' : pct >= 75 ? 'bg-warn' : 'bg-dim')} />
      </span>
      <b className="font-medium text-fg">{Math.round(pct)} %</b>
    </span>
  )
}

function GitKlappe ({ lage }: { lage: GitLage }) {
  const { t } = useT()
  const setzen = useSitzung(s => s.setzen)
  const [meldung, setzeMeldung] = useState('')
  const [schief, setzeSchief] = useState(false)
  const [laeuft, setzeLaeuft] = useState(false)
  const [neu, setzeNeu] = useState('')
  const [pushBereit, setzePushBereit] = useState(false)

  const tun = async (aktion: string, name?: string) => {
    if (laeuft) return
    setzeLaeuft(true); setzeSchief(false); setzeMeldung(t('läuft…'))
    try {
      const r = await api.gitTun(aktion, name)
      setzen({ git: r.lage })
      setzeSchief(!r.ok)
      setzeMeldung(r.meldung || t(r.ok ? 'erledigt' : 'fehlgeschlagen'))
      if (r.ok && (aktion === 'wechseln' || aktion === 'neu')) setzeNeu('')
    } catch (e) { setzeSchief(true); setzeMeldung(String((e as Error).message)) }
    finally { setzeLaeuft(false) }
  }

  const marken = [
    lage.vor ? '↑' + lage.vor : '',
    lage.zurueck ? '↓' + lage.zurueck : '',
    lage.geaendert ? '•' + lage.geaendert : ''
  ].filter(Boolean).join(' ')

  return (
    <Popover.Root>
      <Popover.Trigger
        title={t('Git-Zweig · klicken für Wechseln, Holen, Ziehen, Schieben')}
        className="flex h-[26px] cursor-pointer items-center gap-[6px] rounded-field border-0
                   bg-transparent px-2 text-inherit transition-colors hover:bg-soft hover:text-fg
                   data-[state=open]:bg-soft data-[state=open]:text-fg
                   focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-1"
      >
        <GitBranch size={13} className="opacity-[.62]" />
        <b className="font-medium text-fg">{lage.zweig}</b>
        <span className="text-[10.5px] opacity-65">{marken}</span>
      </Popover.Trigger>
      <Popover.Portal>
        {/* Öffnet nach oben, weil die Leiste am unteren Rand klebt. */}
        <Popover.Content
          side="top" align="start" sideOffset={8}
          className="z-50 flex w-[250px] flex-col gap-2 rounded-panel border border-line
                     bg-panel p-[10px] shadow-panel
                     animate-[rise_var(--t-std)_var(--ease-out-sig)_both]"
        >
          <div className="text-[11px] text-dim">
            {lage.hatOben
              ? `${lage.vor} ${t('voraus')}, ${lage.zurueck} ${t('zurück')}, ${lage.geaendert} ${t('geändert')}`
              : `${t('kein Gegenstück am Server')}, ${lage.geaendert} ${t('geändert')}`}
          </div>
          <div className="-mx-1 flex max-h-[190px] flex-col gap-px overflow-y-auto">
            {(lage.zweige ?? []).map(z => (
              <button
                key={z} type="button" disabled={z === lage.zweig}
                onClick={() => tun('wechseln', z)}
                className={clsx('flex w-full items-center gap-[6px] truncate rounded-field border-0',
                  'bg-transparent px-2 py-1 text-left text-[12px]',
                  z === lage.zweig ? 'cursor-default text-fg' : 'cursor-pointer text-label hover:bg-soft hover:text-fg')}
              >
                <span className={clsx('text-[8px]', z === lage.zweig ? 'text-accent' : 'opacity-40')}>
                  {z === lage.zweig ? '●' : '○'}
                </span>
                {z}
              </button>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); if (neu.trim()) tun('neu', neu.trim()) }}
                className="flex gap-[6px]">
            <input
              value={neu} onChange={e => setzeNeu(e.target.value)}
              placeholder={t('neuer Zweig')} autoComplete="off" spellCheck={false}
              className="field min-w-0 flex-1 px-2 py-[5px] text-[12px]"
            />
            <button type="submit" className="chip text-[11px] py-[3px]">{t('anlegen')}</button>
          </form>
          <div className="flex gap-[6px] border-t border-line pt-2">
            <button className="chip flex-1 justify-center text-[11px] py-[3px]"
                    onClick={() => tun('fetch')}>{t('holen')}</button>
            <button className="chip flex-1 justify-center text-[11px] py-[3px]"
                    onClick={() => tun('pull')}>{t('ziehen')}</button>
            {/* Schieben verlässt den Rechner. Ein zweiter Klick bestätigt. */}
            <button
              className="chip flex-1 justify-center text-[11px] py-[3px] text-err"
              onClick={() => {
                if (!pushBereit) {
                  setzePushBereit(true)
                  setTimeout(() => setzePushBereit(false), 5000)
                  return
                }
                setzePushBereit(false); tun('push')
              }}
            >{pushBereit ? t('wirklich?') : t('schieben')}</button>
          </div>
          {meldung && (
            <div className={clsx('max-h-[70px] overflow-y-auto whitespace-pre-wrap text-[11px]',
                                 schief ? 'text-err' : 'text-dim')}>{meldung}</div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function Leiste ({ modus, aufModus }: { modus: string; aufModus: () => void }) {
  const { t } = useT()
  const stats = useSitzung(s => s.stats)
  const git = useSitzung(s => s.git)
  const setzen = useSitzung(s => s.setzen)
  const melde = useMeldungen(s => s.zeige)
  const [laufzeit, setzeLaufzeit] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setzeLaufzeit(Date.now() - stats.startedAt), 1000)
    setzeLaufzeit(Date.now() - stats.startedAt)
    return () => clearInterval(id)
  }, [stats.startedAt])

  useEffect(() => { void api.git().then(g => setzen({ git: g })).catch(() => {}) }, [])

  const rein = stats.inTok + stats.cacheWrite
  const ctx = stats.ctx
  const pct = ctx ? Math.max(0, Math.min(100, ctx.prozent)) : 0

  return (
    <footer className="flex min-h-[38px] items-center gap-[10px] border-t border-line
                       bg-panel px-[18px] text-[11.5px] tabular-nums text-dim">
      {/* Die Werte umbrechen, der Modusknopf bleibt rechts stehen — sonst
          rutscht er auf eine zweite Zeile und die Leiste wird doppelt hoch. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[10px] py-1">
      {git?.repo && <><GitKlappe lage={git} /><Teiler /></>}

      <Wert titel={t('Laufzeit dieser Session')} icon={<Clock size={13} />}>{dauerText(laufzeit)}</Wert>
      <Wert titel={t('Abgeschlossene Züge')} icon={<ChatsCircle size={13} />}>{stats.turns}</Wert>
      <Wert titel={t('Token: gesendet ↑ / empfangen ↓, in Klammern aus dem Cache gelesen')}
            icon={<ArrowsDownUp size={13} />}>
        {stats.cacheRead
          ? `${zahl(rein)} ↑ (${zahl(stats.cacheRead)} Cache) ${zahl(stats.outTok)} ↓`
          : `${zahl(rein)} ↑ ${zahl(stats.outTok)} ↓`}
      </Wert>

      <Teiler />

      <button
        title={t('Füllstand des Kontextfensters · klicken für die Aufschlüsselung')}
        onClick={async () => {
          try {
            const c = await api.kontext(true)
            const top = c.kategorien.sort((a, b) => b.tokens - a.tokens).slice(0, 6)
              .map(k => `${k.name}: ${zahl(k.tokens)}`).join(' · ')
            melde(t('Kontext'), `${Math.round(c.prozent)} % ${t('von')} ${zahl(c.max)}. ${top || t('keine Aufschlüsselung')}`)
          } catch (e) { melde(t('Fehler'), String((e as Error).message), true) }
        }}
        className="flex h-[26px] cursor-pointer items-center gap-[6px] rounded-field border-0
                   bg-transparent px-2 text-inherit transition-colors hover:bg-soft hover:text-fg
                   focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-1"
      >
        <Gauge size={13} className="opacity-[.62]" />
        <span className="h-[5px] w-[44px] shrink-0 overflow-hidden rounded-[3px] bg-line">
          <i style={{ width: pct.toFixed(1) + '%' }}
             className={clsx('block h-full rounded-[3px] transition-all',
               pct >= 85 ? 'bg-err' : pct >= 66 ? 'bg-warn' : 'bg-accent')} />
        </span>
        <b className="font-medium text-fg">
          {ctx ? `${pct < 1 ? '<1' : Math.round(pct)} % · ${zahl(ctx.tokens)}/${zahl(ctx.max)}` : '–'}
        </b>
      </button>

      <Wert titel={t('Kosten laut SDK')} icon={<CurrencyDollar size={13} />}>
        {stats.costUsd ? stats.costUsd.toFixed(stats.costUsd < 1 ? 3 : 2).replace('.', ',') + ' $' : '–'}
      </Wert>

      {(stats.limits?.fuenfH || stats.limits?.siebenT) && <Teiler />}
      <Grenze titel={t('Anteil des 5-Stunden-Fensters · Zurücksetzung in Klammern')}
              icon={<HourglassMedium size={13} />} f={stats.limits?.fuenfH ?? null} />
      <Grenze titel={t('Anteil des 7-Tage-Fensters · Zurücksetzung in Klammern')}
              icon={<CalendarBlank size={13} />} f={stats.limits?.siebenT ?? null} />

      </div>

      <button
        onClick={aufModus}
        title={t('Werkzeug-Modus · Umschalt+Tab wechselt')}
        className={clsx('shrink-0 flex h-[26px] cursor-pointer items-center gap-[6px] rounded-field',
          'border-0 bg-transparent px-2 transition-colors hover:bg-soft hover:text-fg',
          'focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-1',
          modus === 'bypassPermissions' ? 'text-err' : 'text-inherit')}
      >
        <ShieldCheck size={13} className="opacity-[.62]" />
        <span>{t(MODUS_NAME[modus] ?? modus)}</span>
      </button>
    </footer>
  )
}
