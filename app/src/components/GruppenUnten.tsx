import { useCallback, useEffect, useState } from 'react'
import { ArrowsClockwise } from '@phosphor-icons/react'
import clsx from 'clsx'
import { api } from '../lib/api.ts'
import { steuerung } from '../lib/steuerung.ts'
import { useSitzung, neueId } from '../store/sitzung.ts'
import { useT } from '../lib/useT.ts'
import { Gruppe, Symbolknopf } from './ui/Gruppe.tsx'
import { useMeldungen } from './ui/Meldungen.tsx'
import { STIL_NAME } from './GruppenOben.tsx'
import { setzeStatsZurueck } from '../lib/strom.ts'
import { audio } from '../lib/audio.ts'
import type { Befehl, McpServer, SitzungKurz, StatusBericht } from '../lib/types.ts'

const dauer = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s % 60
  const zz = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${zz(m)}:${zz(r)}` : `${m}:${zz(r)}`
}
export const zahl = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' M'
  : n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'k'
  : String(n)

export function GruppeBefehle ({ bereit }: { bereit: boolean }) {
  const { t } = useT()
  const [liste, setzeListe] = useState<Befehl[] | null>(null)
  const [fehler, setzeFehler] = useState('')
  const melde = useMeldungen(s => s.zeige)

  const laden = useCallback(() => {
    void api.befehle()
      .then(d => { setzeListe(d.befehle); setzeFehler('') })
      .catch(e => setzeFehler(String((e as Error).message)))
  }, [])
  useEffect(() => { if (bereit && liste === null) laden() }, [bereit])

  return (
    <Gruppe id="grp-cmd" titel={t('Befehle')} abzeichen={liste?.length ?? '–'} beimOeffnen={laden}>
      {liste?.length
        ? (
          <div className="-mx-2 flex max-h-[230px] flex-col gap-px overflow-y-auto">
            {liste.map(c => (
              <button
                key={c.name} type="button"
                title={c.beschreibung + (c.hinweis ? ' · ' + c.hinweis : '')}
                onClick={() => steuerung.schickeText('/' + c.name).catch(e =>
                  melde(t('Fehler'), String((e as Error).message), true))}
                className="flex w-full cursor-pointer flex-col gap-px rounded-field border-0
                           bg-transparent px-2 py-[5px] text-left transition-colors hover:bg-soft
                           focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
              >
                <span className="text-[12px] text-fg">/{c.name}</span>
                <span className="truncate text-[11px] text-dim">{c.beschreibung}</span>
              </button>
            ))}
          </div>
        )
        : <Leer text={fehler
            ? (/keine laufende Session/.test(fehler)
                ? t('Die Session startet mit der ersten Frage. Danach steht die Liste hier.')
                : t('nicht lesbar') + ': ' + fehler)
            : t('Keine Befehle in dieser Session.')} />}
    </Gruppe>
  )
}

const MCP_ZUSTAND: Record<string, [string, string]> = {
  connected: ['bg-ok', 'verbunden'],
  failed: ['bg-err', 'fehlgeschlagen'],
  'needs-auth': ['bg-warn', 'Anmeldung nötig'],
  pending: ['bg-warn', 'verbindet'],
  disabled: ['bg-dim', 'abgeschaltet']
}

export function GruppeMcp ({ bereit }: { bereit: boolean }) {
  const { t } = useT()
  const [liste, setzeListe] = useState<McpServer[] | null>(null)
  const [fehler, setzeFehler] = useState('')
  const laden = useCallback(() => {
    void api.mcp().then(d => { setzeListe(d.server); setzeFehler('') })
      .catch(e => setzeFehler(String((e as Error).message)))
  }, [])
  useEffect(() => { if (bereit && liste === null) laden() }, [bereit])

  return (
    <Gruppe id="grp-mcp" titel={t('MCP-Server')} abzeichen={liste?.length ?? '–'} beimOeffnen={laden}>
      {liste?.length
        ? liste.map(m => {
            const [farbe, wort] = MCP_ZUSTAND[m.status] ?? ['bg-dim', m.status]
            return (
              <div key={m.name} className="flex items-center gap-[7px] text-[12px] text-dim"
                   title={`${m.status}${m.scope ? ' · ' + m.scope : ''}${m.fehler ? ' · ' + m.fehler : ''}` +
                          (m.werkzeuge.length ? '\n' + m.werkzeuge.join(', ') : '')}>
                <span className={clsx('h-[6px] w-[6px] shrink-0 rounded-full', farbe)} />
                <span className="truncate text-fg">{m.name}</span>
                <span className="ml-auto shrink-0 tabular-nums opacity-70">
                  {m.werkzeuge.length ? t('X Werkzeuge').replace('X', String(m.werkzeuge.length)) : t(wort)}
                </span>
              </div>
            )
          })
        : <Leer text={fehler && /keine laufende Session/.test(fehler)
            ? t('Die Session startet mit der ersten Frage. Danach steht die Liste hier.')
            : t('Keine MCP-Server in dieser Session.')} />}
    </Gruppe>
  )
}

export function GruppeUnteragenten () {
  const { t } = useT()
  const agenten = useSitzung(s => s.agenten)
  const [, tick] = useState(0)
  // Laufende Agenten zeigen ihre Dauer; ohne Takt bliebe sie stehen.
  useEffect(() => {
    if (!agenten.some(a => !a.fertig)) return
    const id = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [agenten])

  const laufend = agenten.filter(a => !a.fertig).length
  return (
    <Gruppe id="grp-agents" titel={t('Unteragenten')}
            abzeichen={laufend || agenten.length} abzeichenAn={laufend > 0}>
      {agenten.length
        ? agenten.map(a => (
            <div key={a.id} className="flex flex-col gap-[3px] rounded-[9px] border border-line p-[8px_10px]">
              <div className="flex items-center gap-[6px] text-[12px] text-fg">
                <span className={clsx('h-[6px] w-[6px] shrink-0 rounded-full',
                  a.fertig ? (a.ok === false ? 'bg-err' : 'bg-dim')
                           : 'bg-accent animate-[agpulse_1.4s_ease-in-out_infinite]')} />
                <span>{a.typ}</span>
                <span className="ml-auto rounded-full bg-line px-[6px] py-px text-[10.5px] tabular-nums text-dim">
                  {dauer((a.ende ?? Date.now()) - a.start)}
                </span>
              </div>
              <div className="line-clamp-2 text-[11px] text-dim">{a.desc}</div>
              {a.wz && (
                <div className="truncate text-[11px] text-dim opacity-80">
                  {a.fertig ? t(a.ok === false ? 'fehlgeschlagen' : 'fertig') : '· ' + a.wz}
                </div>
              )}
            </div>
          ))
        : <Leer text={t('Keine Unteragenten in dieser Session.')} />}
    </Gruppe>
  )
}

export function GruppeStatus ({ bereit }: { bereit: boolean }) {
  const { t, code } = useT()
  const [d, setzeD] = useState<StatusBericht | null>(null)
  const [laeuft, setzeLaeuft] = useState(false)
  const laden = useCallback(() => {
    setzeLaeuft(true)
    void api.status().then(setzeD).catch(() => {}).finally(() => setzeLaeuft(false))
  }, [])
  useEffect(() => { if (bereit) laden() }, [bereit])

  const zeilen: (['kopf', string] | ['zeile', string, string, boolean?])[] = []
  if (d) {
    const k = d.verbrauch.kontext
    zeilen.push(['kopf', 'Arbeit'])
    zeilen.push(['zeile', 'Verzeichnis', d.arbeit.cwd.replace(/^\/Users\/[^/]+/, '~')])
    if (d.arbeit.zweig) zeilen.push(['zeile', 'Zweig', d.arbeit.zweig])
    zeilen.push(['kopf', 'Session'])
    zeilen.push(['zeile', 'Läuft', t(d.session.laeuft ? 'ja' : 'nein'), !d.session.laeuft])
    zeilen.push(['zeile', 'Kennung', d.session.id ? d.session.id.slice(0, 8) : t('noch keine')])
    zeilen.push(['zeile', 'Modell', d.session.modell ?? t('wie konfiguriert')])
    zeilen.push(['zeile', 'Denktiefe', d.session.denktiefe ?? t('wie konfiguriert')])
    zeilen.push(['zeile', 'Antwortstil', t(STIL_NAME[d.session.stil] ?? d.session.stil)])
    zeilen.push(['zeile', 'Laufzeit', dauer(d.session.laufzeitMs)])
    zeilen.push(['kopf', 'Verbrauch'])
    zeilen.push(['zeile', 'Züge', String(d.verbrauch.zuege)])
    zeilen.push(['zeile', 'Token ein', zahl(d.verbrauch.ein + d.verbrauch.cache)])
    zeilen.push(['zeile', 'Token aus', zahl(d.verbrauch.aus)])
    zeilen.push(['zeile', 'Kosten', d.verbrauch.kosten.toFixed(3).replace('.', ',') + ' $'])
    if (k) zeilen.push(['zeile', 'Kontext', `${Math.round(k.prozent)} % · ${zahl(k.tokens)}/${zahl(k.max)}`])
    const je = Object.entries(d.verbrauch.modelle ?? {})
    if (je.length > 1) {
      zeilen.push(['kopf', 'Kosten je Modell'])
      for (const [n, m] of je) zeilen.push(['zeile', n.replace(/^claude-/, ''), m.kosten.toFixed(3).replace('.', ',') + ' $'])
    }
    if (d.konto) {
      zeilen.push(['kopf', 'Konto'])
      if (d.konto.email) zeilen.push(['zeile', 'E-Mail', d.konto.email])
      if (d.konto.organization) zeilen.push(['zeile', 'Organisation', d.konto.organization])
      if (d.konto.subscriptionType) zeilen.push(['zeile', 'Abo', d.konto.subscriptionType])
    }
    const rl = (d.limits as { rate_limits?: Record<string, { utilization?: number; resets_at?: string } | null> } | null)?.rate_limits
    if (d.limits?.rate_limits_available && rl) {
      zeilen.push(['kopf', 'Plangrenzen'])
      for (const [name, key] of [['5 Stunden', 'five_hour'], ['7 Tage', 'seven_day'],
                                 ['7 Tage Opus', 'seven_day_opus'], ['7 Tage Sonnet', 'seven_day_sonnet']] as const) {
        const f = rl[key]
        if (!f || f.utilization == null) continue
        const bis = f.resets_at
          ? ' · ' + new Date(f.resets_at).toLocaleTimeString(code, { hour: '2-digit', minute: '2-digit' })
          : ''
        zeilen.push(['zeile', name, Math.round(f.utilization) + ' %' + bis, f.utilization >= 90])
      }
    }
    zeilen.push(['kopf', 'Spracherkennung'])
    zeilen.push(['zeile', 'Modell', d.spracherkennung.modell.split('/').pop() ?? '', !d.spracherkennung.vorhanden])
    zeilen.push(['zeile', 'Server', t(d.spracherkennung.server), d.spracherkennung.server === 'aus'])
    zeilen.push(['kopf', 'Sprachausgabe'])
    zeilen.push(['zeile', 'Backend', d.sprachausgabe.backend])
    zeilen.push(['zeile', 'Stimme', d.sprachausgabe.stimme])
    zeilen.push(['kopf', 'Laufzeitumgebung'])
    zeilen.push(['zeile', 'Node', d.laufzeit.node])
    zeilen.push(['zeile', 'Agent-SDK', d.laufzeit.sdk || t('unbekannt')])
    zeilen.push(['zeile', 'Port', String(d.laufzeit.port)])
  }

  return (
    <Gruppe
      id="grp-status" titel={t('Status')} beimOeffnen={laden}
      aktion={<Symbolknopf titel={t('Neu laden')} auf={laden} laeuft={laeuft}>
        <ArrowsClockwise size={12} weight="bold" />
      </Symbolknopf>}
    >
      {d
        ? (
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
            {zeilen.map((z, i) => z[0] === 'kopf'
              ? <dt key={i} className="col-span-2 mt-2 text-[10px] uppercase tracking-[.07em]
                                       text-dim opacity-70 first:mt-0">{t(z[1])}</dt>
              : (
                <div key={i} className="contents">
                  <dt className="whitespace-nowrap text-dim">{t(z[1])}</dt>
                  <dd title={z[2]} className={clsx('m-0 truncate text-right tabular-nums',
                                                   z[3] ? 'text-err' : 'text-fg')}>{z[2]}</dd>
                </div>
              ))}
          </dl>
        )
        : <Leer text={t('Die Session startet mit der ersten Frage. Danach steht die Liste hier.')} />}
    </Gruppe>
  )
}

export function GruppeVerlauf () {
  const { t, seither } = useT()
  const [liste, setzeListe] = useState<SitzungKurz[] | null>(null)
  const [laeuft, setzeLaeuft] = useState(false)
  const melde = useMeldungen(s => s.zeige)
  const S = useSitzung()

  const laden = useCallback(() => {
    setzeLaeuft(true)
    void api.sitzungen().then(d => setzeListe(d.sessions)).catch(() => setzeListe([]))
      .finally(() => setzeLaeuft(false))
  }, [])
  useEffect(laden, [])

  const fortsetzen = async (id: string, titel: string) => {
    try {
      const r = await api.fortsetzen(id)
      audio.stopp()
      S.leeren()
      setzeStatsZurueck()
      // resume gibt der Session ihr Gedächtnis zurück, aber das Fenster blieb
      // leer — man sah nicht, worüber man geredet hatte.
      let beitraege = 0
      for (const b of r.verlauf ?? []) {
        if (b.rolle === 'werkzeug') {
          S.blase({ id: neueId(), wer: 'werkzeug', alt: true,
            text: b.n > 1 ? `↳ ${b.n} ${t('Werkzeugaufrufe')} · ${b.namen.join(', ')}` : '↳ ' + b.namen[0] })
        } else {
          beitraege++
          S.blase({ id: neueId(), wer: b.rolle === 'du' ? 'du' : 'claude', text: b.text, alt: true })
        }
      }
      S.blase({ id: neueId(), wer: 'trenner',
        text: r.verlauf?.length
          ? `${beitraege} ${t('Beiträge wiederhergestellt. Hier geht es weiter.')}`
          : t('Kein Transkript gefunden. Das Gedächtnis der Session ist trotzdem da.') })
      melde(t('Session'), `${t('Fortgesetzt')}: ${titel}`)
      laden()
    } catch (e) { melde(t('Fehler'), String((e as Error).message), true) }
  }

  return (
    <Gruppe
      id="grp-hist" titel={t('Verlauf')} waechst
      aktion={<Symbolknopf titel={t('Neu laden')} auf={laden} laeuft={laeuft}>
        <ArrowsClockwise size={12} weight="bold" />
      </Symbolknopf>}
    >
      <div className="-mx-2 min-h-0 flex-1 overflow-y-auto">
        {liste?.length
          ? liste.map(x => (
              <button
                key={x.id} type="button" title={x.id}
                disabled={x.aktuell}
                onClick={() => fortsetzen(x.id, x.titel)}
                className={clsx('flex w-full cursor-pointer flex-col gap-[2px] rounded-[8px] border-0',
                                'bg-transparent px-2 py-[7px] text-left transition-colors',
                                x.aktuell ? 'cursor-default' : 'hover:bg-soft')}
              >
                <span className={clsx('truncate text-[12.5px]',
                                      x.aktuell ? 'text-[var(--listen)]' : 'text-fg')}>{x.titel}</span>
                <span className="text-[10.5px] text-dim">{seither(x.zuletzt)}</span>
              </button>
            ))
          : <Leer text={t('Noch keine früheren Sessions in diesem Verzeichnis.')} />}
      </div>
    </Gruppe>
  )
}

function Leer ({ text }: { text: string }) {
  return <div className="px-2 text-[11.5px] text-dim opacity-70">{text}</div>
}
