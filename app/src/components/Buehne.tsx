import { useEffect, useRef, useState } from 'react'
import { Microphone } from '@phosphor-icons/react'
import clsx from 'clsx'
import { audio } from '../lib/audio'
import { steuerung, fehlerText } from '../lib/steuerung'
import { useSitzung } from '../store/sitzung'
import { useT } from '../lib/useT'
import { useMeldungen } from './ui/Meldungen'

const TEXT: Record<string, string> = {
  idle: 'Bereit', listening: 'Hört zu…', transcribing: 'Verstehe…',
  thinking: 'Denkt nach…', speaking: 'Spricht…', error: 'Fehler',
  off: 'Beendet. Das Fenster kann zu.', waiting: 'Wartet auf deine Freigabe'
}
const GLUT: Record<string, string> = {
  idle: '--accent', listening: '--listen', transcribing: '--think',
  thinking: '--think', speaking: '--speak', error: '--err', waiting: '--think'
}

/** Die Wellenform. Läuft auf requestAnimationFrame und liest den Pegel direkt
 *  aus dem Audiomodul — durch React-Zustand geschleift wäre das sechzig
 *  Neuzeichnungen des Baums pro Sekunde. */
function Welle ({ zustand }: { zustand: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    const N = 72, C = 300, R = 118
    let lauf = 0, tot = false
    const zeichne = () => {
      if (tot) return
      requestAnimationFrame(zeichne)
      lauf += 0.03
      ctx.clearRect(0, 0, 600, 600)
      const aktiv = zustand === 'listening' || zustand === 'speaking'
      const pegel = zustand === 'listening' ? audio.jetzt() : 0
      const farbe = getComputedStyle(document.documentElement)
        .getPropertyValue(GLUT[zustand] ?? '--accent').trim()
      ctx.globalAlpha = aktiv ? 0.85 : 0.35
      ctx.strokeStyle = farbe
      ctx.lineCap = 'round'
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2 - Math.PI / 2
        // Beim Sprechen synthetisch moduliert: sichtbar lebendig, aber
        // ruhiger als beim Zuhören, wo echte Werte anliegen.
        const wellig = Math.sin(lauf * 2 + i * 0.35) * 0.5 + 0.5
        const hoehe = zustand === 'speaking'
          ? 6 + wellig * 16
          : 4 + pegel * 90 * (0.55 + wellig * 0.65)
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(C + Math.cos(a) * R, C + Math.sin(a) * R)
        ctx.lineTo(C + Math.cos(a) * (R + hoehe), C + Math.sin(a) * (R + hoehe))
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
    zeichne()
    return () => { tot = true }
  }, [zustand])
  return <canvas ref={ref} width={600} height={600}
                 className="absolute inset-0 w-[300px] h-[300px] pointer-events-none" />
}

export function Buehne () {
  const { t } = useT()
  const zustand = useSitzung(s => s.zustand)
  const schritt = useSitzung(s => s.schritt)
  const vorschau = useSitzung(s => s.vorschau)
  const hinweis = useSitzung(s => s.hinweis)
  const melde = useMeldungen(s => s.zeige)
  const [tipp, setzeTipp] = useState('')
  const [sek, setzeSek] = useState(0)

  // Die verstrichene Zeit des Zuges. Ohne sie ist "Denkt nach…" von einem
  // Hänger nicht zu unterscheiden.
  useEffect(() => {
    if (!schritt) { setzeSek(0); return }
    const t0 = Date.now()
    const id = setInterval(() => setzeSek(Math.round((Date.now() - t0) / 1000)), 500)
    return () => clearInterval(id)
  }, [schritt !== ''])

  const klick = async () => {
    try {
      if (zustand === 'listening') steuerung.beenden()
      else await steuerung.aufnehmen()
    } catch (e) { const [a, b] = fehlerText(e); melde(t(a), t(b), true) }
  }

  const senden = async (e: React.FormEvent) => {
    e.preventDefault()
    const txt = tipp.trim()
    if (!txt) return
    setzeTipp('')
    try { await steuerung.schickeText(txt, t('getippt')) }
    catch (err) { const [a, b] = fehlerText(err); melde(t(a), t(b), true) }
  }

  return (
    <section className="flex flex-col items-center px-6 pt-[14px] pb-[2px]">
      <div className="relative grid place-items-center w-[300px] h-[300px]">
        <Welle zustand={zustand} />
        {zustand === 'listening' && [0, 1].map(i => (
          <span key={i}
                style={{ animationDelay: `${i * 0.9}s` }}
                className="absolute w-[152px] h-[152px] rounded-full border border-[var(--listen)]
                           animate-[puls_1.8s_var(--ease-out-sig)_infinite]" />
        ))}
        <button
          onClick={klick}
          aria-label={t('Aufnahme starten')}
          className={clsx(
            'relative grid place-items-center w-[120px] h-[120px] rounded-full border-0 cursor-pointer',
            'text-white transition-transform duration-200 active:scale-95',
            'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4'
          )}
          style={{
            background: `radial-gradient(circle at 38% 32%,
              color-mix(in srgb, var(${GLUT[zustand] ?? '--accent'}) 78%, white),
              var(${GLUT[zustand] ?? '--accent'}))`
          }}
        >
          <Microphone size={34} weight="fill" />
        </button>
      </div>

      <div className="mt-1 text-[13px] text-dim">{t(TEXT[zustand] ?? zustand)}</div>

      {zustand === 'thinking' && (
        <div className="mt-[10px] flex items-center gap-[6px] h-2">
          {[0, 1, 2].map(i => (
            <i key={i} style={{ animationDelay: `${i * 0.14}s` }}
               className="w-[5px] h-[5px] rounded-full bg-current opacity-35
                          animate-[hop_1.1s_var(--ease-sig)_infinite]" />
          ))}
        </div>
      )}

      {schritt && (
        <div className="mt-[10px] flex items-center gap-2 min-h-4 max-w-[min(620px,88vw)]
                        text-[12.5px] text-dim">
          <span className="w-[9px] h-[9px] shrink-0 rounded-full border-[1.5px] border-line
                           border-t-accent animate-[sspin_.8s_linear_infinite]" />
          <span className="truncate tabular-nums">{schritt}</span>
          <span className="shrink-0 opacity-55 tabular-nums">{sek} s</span>
        </div>
      )}

      {vorschau && (
        <div className="mt-[10px] text-[13px] text-dim max-w-[min(560px,86vw)] text-center">
          „<b className="font-normal text-fg">{vorschau}</b>"
        </div>
      )}

      <form onSubmit={senden} className="mt-[14px] flex gap-2 w-[min(560px,86vw)]">
        <input
          value={tipp} onChange={e => setzeTipp(e.target.value)}
          onKeyDown={e => e.stopPropagation()}
          autoComplete="off" spellCheck={false}
          placeholder={t('…oder tippen, wenn das Mikro dich verhört hat')}
          disabled={zustand === 'listening'}
          className="field flex-1 min-w-0 rounded-pill px-4 py-[9px] text-[13.5px] bg-panel
                     placeholder:text-dim placeholder:opacity-70 disabled:opacity-40"
        />
        <button type="submit" className="chip shrink-0">{t('senden')}</button>
      </form>

      <div className="mt-[6px] h-4 text-[12px] text-dim opacity-[.62]">
        {hinweis ?? (
          <>
            {t('Klick zum Sprechen')} · <Taste>{t('Leertaste')}</Taste> {t('halten')} ·{' '}
            <Taste>?</Taste> {t('zeigt alle Tasten')}
          </>
        )}
      </div>
    </section>
  )
}

function Taste ({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-line bg-panel px-[5px] py-px
                    font-mono text-[10.5px] text-label">{children}</kbd>
  )
}
