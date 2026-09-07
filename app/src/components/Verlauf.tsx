import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { useSitzung } from '../store/sitzung.ts'
import { useEinstellungen } from '../store/einstellungen.ts'
import { useT } from '../lib/useT.ts'
import { steuerung } from '../lib/steuerung.ts'
import { kurzArg } from '../lib/werkzeuge.ts'
import { useMeldungen } from './ui/Meldungen.tsx'
import type { Blase, SpurZeile } from '../lib/types.ts'

function Nachricht ({ b }: { b: Blase }) {
  const { t } = useT()
  if (b.wer === 'trenner') {
    return (
      <div className="flex items-center gap-[10px] w-full max-w-[760px] my-[8px_0_2px]
                      text-[11px] text-dim opacity-75
                      before:content-[''] before:flex-1 before:h-px before:bg-line
                      after:content-[''] after:flex-1 after:h-px after:bg-line">
        <span>{b.text}</span>
      </div>
    )
  }
  if (b.wer === 'werkzeug') {
    return (
      <div className={clsx('w-full max-w-[720px] rounded-panel border border-line bg-panel',
                           'px-[15px] py-[9px] text-[11.5px] text-dim opacity-50')}>
        {b.text}
      </div>
    )
  }
  return (
    <div className={clsx(
      'w-full max-w-[720px] rounded-panel border bg-panel shadow-panel',
      'animate-[rise_var(--t-slow)_var(--ease-out-sig)_both]',
      b.wer === 'du' ? 'border-soft' : 'border-line',
      b.alt && 'opacity-[.72]'
    )} style={{ padding: 'var(--pad-msg)' }}>
      <div className="mb-[5px] text-[11px] uppercase tracking-[.07em] text-dim">
        {b.wer === 'du' ? t('Du') : 'Claude'}
      </div>
      <div className="whitespace-pre-wrap break-words" style={{ fontSize: 'var(--fs)' }}>
        {b.text}
        {b.live && <span className="ml-[2px] inline-block w-[7px] animate-pulse">▌</span>}
      </div>
      {b.meta && <div className="mt-[6px] text-[11px] text-dim opacity-70">{b.meta}</div>}
    </div>
  )
}

function Freigabe ({ id, tool, input }:
  { id: string; tool: string; input: Record<string, unknown> }) {
  const { t } = useT()
  const melde = useMeldungen(s => s.zeige)
  const kurz = kurzArg(tool, input)
  const antworte = async (ok: boolean, umfang?: 'genau' | 'werkzeug') => {
    try { await steuerung.freigeben(id, ok, umfang) }
    catch (e) { melde(t('Fehler'), String((e as Error).message), true) }
  }
  return (
    <div className="w-full max-w-[720px] rounded-panel border border-[var(--think)]
                    bg-panel shadow-panel p-[15px]
                    animate-[rise_var(--t-std)_var(--ease-out-sig)_both]">
      <div className="mb-[5px] text-[11px] uppercase tracking-[.07em] text-[var(--think)]">
        {t('Freigabe erforderlich')}
      </div>
      <div className="text-[14px]">{t('Claude möchte X benutzen.').replace('X', tool)}</div>
      <pre className="mt-2 max-h-[160px] overflow-auto rounded-field bg-bg p-[10px]
                      font-mono text-[11px] text-dim whitespace-pre-wrap break-words">
        {JSON.stringify(input, null, 2)}
      </pre>
      <div className="mt-[10px] flex gap-[6px]">
        <button className="chip" data-an="true" onClick={() => antworte(true)}>{t('Erlauben')}</button>
        <button className="chip" data-gefahr="true" onClick={() => antworte(false)}>{t('Ablehnen')}</button>
      </div>
      {/* Der einfache Fall bleibt ein Klick; der Umfang steht als zweite Reihe
          darunter, damit man nicht bei jedem Bash-Aufruf neu gefragt wird. */}
      <div className="mt-2 flex flex-wrap gap-[6px] border-t border-line pt-2">
        <button className="chip text-[11px] py-[3px]" onClick={() => antworte(true, 'genau')}>
          {kurz
            ? t('immer: X').replace('X', kurz.length > 34 ? kurz.slice(0, 34) + '…' : kurz)
            : t('immer genau das')}
        </button>
        <button className="chip text-[11px] py-[3px]" onClick={() => antworte(true, 'werkzeug')}>
          {t('immer X').replace('X', tool)}
        </button>
      </div>
    </div>
  )
}

function SpurEintrag ({ z }: { z: SpurZeile }) {
  const ganz = useEinstellungen(s => s.befehleGanz)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      onClick={() => ref.current?.classList.toggle('auf')}
      className={clsx('group flex gap-[9px] items-baseline cursor-pointer',
                      'py-px break-words', z.dim && 'opacity-60')}
      title="Klick klappt die ganze Zeile auf"
    >
      <span className={clsx('shrink-0 min-w-[64px]', z.schief ? 'text-err' : 'text-accent')}>
        {z.name === '__denkt' ? 'denkt' : z.name}
      </span>
      <span className={clsx('flex-1 opacity-85 min-w-0',
                            ganz ? 'whitespace-pre-wrap' : 'truncate group-[.auf]:whitespace-pre-wrap')}>
        {z.arg}
        {z.ergebnis && <span className="opacity-55"> · {z.ergebnis}</span>}
        {z.diff && (
          <span className="mt-[5px] block overflow-hidden rounded-field font-mono text-[11px] leading-[1.5]">
            {z.diff.raus.split('\n').slice(0, 14).map((l, i) => (
              <span key={'r' + i} className="block px-2 py-px whitespace-pre-wrap
                                             bg-[color-mix(in_srgb,var(--err)_14%,transparent)] text-err">- {l}</span>
            ))}
            {z.diff.rein.split('\n').slice(0, 14).map((l, i) => (
              <span key={'n' + i} className="block px-2 py-px whitespace-pre-wrap
                                             bg-[color-mix(in_srgb,var(--ok)_16%,transparent)] text-ok">+ {l}</span>
            ))}
          </span>
        )}
      </span>
    </div>
  )
}

export function Verlauf () {
  const { t } = useT()
  const blasen = useSitzung(s => s.blasen)
  const freigaben = useSitzung(s => s.freigaben)
  const spur = useSitzung(s => s.spur)
  const spurAuf = useEinstellungen(s => s.spurAuf)
  const zeigeWz = useEinstellungen(s => s.werkzeugzeilen)
  const box = useRef<HTMLDivElement>(null)

  // Neueste Nachricht oben, also dorthin nachführen — und nur, wenn der Nutzer
  // ohnehin oben steht. Wer weiter unten liest, will nicht weggerissen werden.
  useEffect(() => {
    const el = box.current
    if (el && el.scrollTop < 120) el.scrollTo({ top: 0, behavior: 'smooth' })
  }, [blasen.length, freigaben.length])

  const sichtbar = zeigeWz ? blasen : blasen.filter(b => b.wer !== 'werkzeug')
  const leer = !sichtbar.length && !freigaben.length

  return (
    <section ref={box} className="flex flex-col items-center gap-[var(--gap-feed)]
                                  overflow-y-auto min-h-0 px-6 pt-1 pb-10">
      {leer && (
        <div className="mt-[26px] max-w-[520px] text-center">
          <p className="text-[15px] text-dim">{t('Noch nichts gesprochen.')}</p>
          <p className="mt-2 text-[12.5px] text-dim opacity-70">
            {t('Halte die Leertaste oder klicke auf den Kreis. Für ein durchgehendes Gespräch schalte oben Freihändig ein.')}
          </p>
        </div>
      )}

      {/* Anzeige umgedreht: das Neueste liegt oben, die Reihenfolge im
          Dokument bleibt chronologisch. */}
      <div className="flex w-full max-w-[720px] flex-col-reverse gap-[var(--gap-feed)] mt-[26px]">
        {sichtbar.map(b => <Nachricht key={b.id} b={b} />)}
      </div>

      {freigaben.map(f => <Freigabe key={f.id} {...f} />)}

      {spurAuf && (
        <div className="w-full max-w-[720px] max-h-[240px] overflow-y-auto rounded-panel
                        border border-line bg-panel p-[10px] font-mono text-[11.5px]
                        text-dim leading-[1.55]">
          {spur.length
            ? spur.map(z => <SpurEintrag key={z.id} z={z} />)
            : <span className="opacity-60">{t('Noch keine Werkzeuge benutzt.')}</span>}
        </div>
      )}
    </section>
  )
}
