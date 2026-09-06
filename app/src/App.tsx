import { useCallback, useEffect, useRef, useState } from 'react'
import { SidebarSimple, X } from '@phosphor-icons/react'
import clsx from 'clsx'
import { api } from './lib/api'
import { audio } from './lib/audio'
import { steuerung, fehlerText } from './lib/steuerung'
import { markiereZugStart, setzeMelder, setzeNachZug, setzeUebersetzer, verbinde } from './lib/strom'
import { AKZENTE, GROESSEN, SCHMAL, useEinstellungen } from './store/einstellungen'
import { useSitzung } from './store/sitzung'
import { useT } from './lib/useT'
import { Buehne } from './components/Buehne'
import { Verlauf } from './components/Verlauf'
import { Leiste } from './components/Leiste'
import { Meldungen, useMeldungen } from './components/ui/Meldungen'
import { GruppeAufgaben, GruppeDarstellung, GruppeEinstellungen, MODUS_NAME } from './components/GruppenOben'
import {
  GruppeBefehle, GruppeMcp, GruppeStatus, GruppeUnteragenten, GruppeVerlauf
} from './components/GruppenUnten'
import type { ModellInfo, Modus } from './lib/types'

const MODI: Modus[] = ['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']

export default function App () {
  const { t, code } = useT()
  const e = useEinstellungen()
  const S = useSitzung()
  const melde = useMeldungen(s => s.zeige)
  const [modelle, setzeModelle] = useState<ModellInfo[]>([])
  const [modus, setzeModus] = useState<Modus>('default')
  const [tastenHilfe, setzeTastenHilfe] = useState(false)
  const [frei, setzeFrei] = useState(false)
  const [bereit, setzeBereit] = useState(false)
  const gehalten = useRef(false)

  // ── Schmales Fenster ───────────────────────────────────────────────
  //    Die Grenze gehört nach JS und nicht bloß in eine Breiten-Variante:
  //    im überlagernden Zustand ändert sich nicht nur der Rand, sondern das
  //    Verhalten — es braucht Abdunklung, Schließen-Knopf und Escape. Zwei
  //    getrennte Quellen (CSS-Query hier, matchMedia dort) liefen zudem an
  //    genau 1000 px auseinander.
  const [schmal, setzeSchmal] = useState(() => matchMedia(SCHMAL).matches)
  useEffect(() => {
    const mq = matchMedia(SCHMAL)
    const merke = () => setzeSchmal(mq.matches)
    merke()
    mq.addEventListener('change', merke)
    return () => mq.removeEventListener('change', merke)
  }, [])

  // Nur im schmalen Fenster verdeckt die Leiste den Inhalt — und nur dann
  // ist sie ein Overlay, das sich schließen lassen muss.
  const ueberlagert = schmal && e.seiteAuf
  const schliesseLeiste = useCallback(() => e.setzen({ seiteAuf: false }), [e.setzen])

  // ── Darstellung an den Body hängen: die Stellschrauben laufen über
  //    Variablen, damit die Größenverhältnisse untereinander stimmen.
  useEffect(() => {
    const r = document.documentElement
    if (e.theme === 'system') r.removeAttribute('data-theme')
    else r.dataset.theme = e.theme
  }, [e.theme])

  useEffect(() => {
    const a = AKZENTE.find(x => x.name === e.akzent) ?? AKZENTE[0]
    const dunkel = (document.documentElement.dataset.theme
      ?? (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light')) === 'dark'
    const c = dunkel ? a.dunkel : a.hell
    document.documentElement.style.setProperty('--accent', c)
    document.documentElement.style.setProperty('--accent-soft', c + '22')
  }, [e.akzent, e.theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--fs', (GROESSEN[e.groesse]?.[1] ?? 15) + 'px')
  }, [e.groesse])

  useEffect(() => {
    const b = document.body
    b.dataset.dense = e.dichte
    b.dataset.radius = e.radius
    b.dataset.calm = e.ruhig ? 'an' : 'aus'
    b.dataset.state = S.zustand
  }, [e.dichte, e.radius, e.ruhig, S.zustand])

  useEffect(() => { document.documentElement.lang = code }, [code])
  useEffect(() => { audio.stumm(e.stumm); audio.setzeTempo(e.tempo / 100) }, [])

  // ── Ereignisstrom und Audio verbinden ─────────────────────────────
  useEffect(() => {
    setzeUebersetzer(t)
    setzeMelder((titel, text, schlecht) => melde(titel, text, schlecht))
  }, [t])

  useEffect(() => {
    setzeNachZug(() => {
      setzeBereit(true)
      if (!modelle.length) void api.modelle().then(d => setzeModelle(d.modelle)).catch(() => {})
    })
  }, [modelle.length])

  useEffect(() => {
    verbinde()
    audio.an({
      aufnahmeFertig: blob => {
        steuerung.verarbeite(blob).catch(err => {
          const [a, b] = fehlerText(err); melde(t(a), t(b), true)
        })
      },
      vorschau: text => { if (useSitzung.getState().zustand === 'listening') S.setzen({ vorschau: text }) },
      wiedergabe: () => {
        S.setzen({ spricht: audio.spricht() })
        useSitzung.getState().neuBewerten()
      },
      vad: m => {
        const s = useSitzung.getState()
        if (m.type === 'ready') {
          S.setzen({ hinweis: t('Freihändig aktiv. Sprich einfach los, du kannst dazwischenreden.') })
          return
        }
        if (!freiRef.current) return
        if (m.type === 'start') {
          if (s.beschaeftigt && !audio.spricht()) return          // denkt gerade
          if (audio.spricht()) { void steuerung.abbrechen().then(() => steuerung.aufnehmen()) }
          else if (!s.beschaeftigt && s.zustand === 'idle') void steuerung.aufnehmen()
        } else if (m.type === 'end') {
          if (s.zustand === 'listening') steuerung.beenden()
        }
      }
    })
    // Nach einem Neuladen mitten in der Session stünden die Zähler sonst
    // wieder auf null, obwohl die Session weiterläuft.
    void api.stats().then(st => { S.setzen({ stats: st }); if (st.turns) setzeBereit(true) }).catch(() => {})
    void api.config().then(c => {
      S.setzen({ cwd: c.cwd.replace(/^\/Users\/[^/]+/, '~'), modellName: c.model ?? '' })
      setzeModus((c.permissionMode as Modus) ?? 'default')
    }).catch(() => {})
  }, [])

  const freiRef = useRef(false)
  useEffect(() => { freiRef.current = frei }, [frei])

  const wechsleModus = useCallback(async () => {
    const naechster = MODI[(MODI.indexOf(modus) + 1) % MODI.length]
    setzeModus(naechster)
    try {
      const r = await api.modus(naechster)
      melde(t('Modus'), `${t('Werkzeuge')}: ${t(MODUS_NAME[naechster] ?? naechster)}` +
        (r.restarted ? t('. Session neu gestartet, dieser Modus geht nur beim Start.') : ''))
    } catch (err) { melde(t('Fehler'), String((err as Error).message), true) }
  }, [modus, t])

  const freihaendig = useCallback(async (an: boolean) => {
    setzeFrei(an)
    if (!an) { S.setzen({ hinweis: null }); return }
    try {
      await audio.mikro()
      await audio.haengeVadAn()
      audio.neuKalibrieren()
      S.setzen({ hinweis: t('Kalibriere den Raumpegel…') })
    } catch (err) { const [a, b] = fehlerText(err); melde(t(a), t(b), true); setzeFrei(false) }
  }, [t])

  // ── Tastatur ──────────────────────────────────────────────────────
  useEffect(() => {
    const tippt = (el: EventTarget | null) =>
      el instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)
    const runter = (ev: KeyboardEvent) => {
      if (tippt(ev.target)) return
      if (ev.key === '?') { ev.preventDefault(); setzeTastenHilfe(v => !v); return }
      if (tastenHilfe) { setzeTastenHilfe(false); return }
      if (ev.key === 'Tab' && ev.shiftKey) { ev.preventDefault(); void wechsleModus(); return }
      const k = ev.key.toLowerCase()
      if (k === 'f') { ev.preventDefault(); void freihaendig(!frei); return }
      if (k === 'a') { ev.preventDefault(); e.setzen({ spurAuf: !e.spurAuf }); return }
      if (k === 'n') { ev.preventDefault(); void steuerung.neueSitzung(); return }
      if (k === 's') { ev.preventDefault(); e.setzen({ seiteAuf: !e.seiteAuf }); return }
      if (ev.code === 'Escape') {
        ev.preventDefault()
        // Über dem Inhalt liegende Leiste zuerst: Escape räumt weg, was im
        // Weg ist, bevor es an den laufenden Turn geht.
        if (ueberlagert) { schliesseLeiste(); return }
        void steuerung.abbrechen(); return
      }
      if (ev.code === 'Space' && !ev.repeat && !gehalten.current) {
        ev.preventDefault(); gehalten.current = true
        markiereZugStart()
        steuerung.aufnehmen().catch(err => {
          const [a, b] = fehlerText(err); melde(t(a), t(b), true)
        })
      }
    }
    const hoch = (ev: KeyboardEvent) => {
      if (ev.code === 'Space' && gehalten.current) {
        ev.preventDefault(); gehalten.current = false; steuerung.beenden()
      }
    }
    addEventListener('keydown', runter)
    addEventListener('keyup', hoch)
    return () => { removeEventListener('keydown', runter); removeEventListener('keyup', hoch) }
  }, [frei, tastenHilfe, e.spurAuf, e.seiteAuf, ueberlagert, schliesseLeiste, wechsleModus, freihaendig, t])

  return (
    <>
      {!e.ohneSchimmer && (
        <div aria-hidden className="pointer-events-none fixed inset-[-30%] z-0 opacity-[.10] blur-[60px]"
             style={{ background: 'radial-gradient(closest-side, var(--accent), transparent 70%)' }} />
      )}
      <Meldungen />

      {tastenHilfe && (
        <div onClick={() => setzeTastenHilfe(false)}
             className="fixed inset-0 z-30 grid place-items-center backdrop-blur-[6px]
                        bg-[color-mix(in_srgb,var(--bg)_72%,transparent)]
                        animate-[rise_var(--t-std)_var(--ease-out-sig)_both]">
          <div className="min-w-[300px] rounded-panel border border-line bg-panel p-[22px_26px] shadow-panel">
            <h3 className="m-0 mb-[14px] text-[12px] uppercase tracking-[.08em] text-dim">{t('Tastatur')}</h3>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-[9px_16px] text-[13.5px]">
              {[[t('Leertaste'), t('halten zum Sprechen')], ['Esc', t('laufenden Turn abbrechen')],
                ['F', t('Freihändig an und aus')], ['A', t('Aktivitätsspur')],
                ['N', t('neue Session')], ['S', t('Seitenleiste ein und aus')],
                [`${t('Umschalt')}+Tab`, t('Werkzeug-Modus wechseln')], ['?', t('diese Übersicht')]
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="m-0"><kbd className="rounded-[5px] border border-line bg-bg px-[6px] py-px
                                                      font-mono text-[11px]">{k}</kbd></dt>
                  <dd className="m-0 text-dim">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 mb-0 text-[11.5px] text-dim opacity-70">{t('Irgendwo klicken schließt.')}</p>
          </div>
        </div>
      )}

      <div className="relative z-[1] h-full">
        {ueberlagert && (
          <div data-abdunklung aria-hidden onClick={schliesseLeiste}
               className="fixed inset-0 z-[5] bg-[color-mix(in_srgb,var(--bg)_65%,transparent)]
                          animate-[blende_var(--t-quick)_var(--ease-out-sig)_both]" />
        )}

        <aside className={clsx(
          'fixed left-0 top-0 z-[6] flex h-dvh w-[280px] flex-col gap-[18px] overflow-y-auto overflow-x-hidden',
          'border-r border-line bg-panel p-[20px_18px] transition-transform duration-300 ease-[var(--ease-sig)]',
          !e.seiteAuf && '-translate-x-full',
          ueberlagert && 'shadow-panel'
        )}>
          <div className="flex items-center gap-[9px] text-[13px] font-semibold">
            <span className="h-[7px] w-[7px] rounded-full bg-accent" />
            <b>Claude Voice</b>
            {/* Der Umschalter in der Kopfzeile liegt hier unter der Leiste. Statt
                ihn nach oben zu zwingen, wo er über der Leiste schweben würde,
                bekommt die Leiste ihren eigenen Ausgang. */}
            {schmal && (
              <button onClick={schliesseLeiste}
                      aria-label={t('Seitenleiste schließen')}
                      title={t('Seitenleiste schließen (Esc)')}
                      className="chip ml-auto h-[26px] w-[26px] justify-center p-0">
                <X size={13} />
              </button>
            )}
          </div>
          <GruppeEinstellungen modelle={modelle} />
          <GruppeDarstellung />
          <GruppeAufgaben />
          <GruppeBefehle bereit={bereit} />
          <GruppeStatus bereit={bereit} />
          <GruppeMcp bereit={bereit} />
          <GruppeUnteragenten />
          <GruppeVerlauf />
        </aside>

        <main className={clsx('grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)_auto] min-w-0',
                              'transition-[margin] duration-300 ease-[var(--ease-sig)]',
                              e.seiteAuf && !schmal ? 'ml-[280px]' : 'ml-0')}>
          <header className="flex items-center gap-[10px] border-b border-line px-[18px] py-[13px]">
            <button
              onClick={() => e.setzen({ seiteAuf: !e.seiteAuf })}
              aria-label={t('Seitenleiste umschalten')} aria-expanded={e.seiteAuf}
              title={t('Seitenleiste ein- und ausklappen (S)')}
              className="chip h-[30px] w-[30px] justify-center p-0"
            >
              <SidebarSimple size={15} className={clsx('transition-transform', !e.seiteAuf && 'scale-x-[-1] opacity-70')} />
            </button>
            <span className="flex min-w-0 items-baseline gap-[7px] text-[12px] text-dim">
              <b className="truncate font-medium text-fg" title={t('Laufendes Modell')}>
                {S.modellName || t('Standardmodell')}
              </b>
              <span className="opacity-40">·</span>
              <span className="truncate font-mono text-[11px]" title={t('Arbeitsverzeichnis der Session')}>
                {S.cwd}
              </span>
            </span>
            <span className="ml-auto flex gap-[6px]">
              <button className="chip" title={t('Neue Session beginnen')}
                      onClick={() => void steuerung.neueSitzung()}>{t('Neue Session')}</button>
              <button className="chip" data-an={frei}
                      title={t('Freihändig: hört durchgehend zu, du kannst dazwischenreden')}
                      onClick={() => void freihaendig(!frei)}>{t('Freihändig')}</button>
              <button className="chip" data-an={e.spurAuf}
                      title={t('Zeigt, welche Werkzeuge die Session benutzt')}
                      onClick={() => e.setzen({ spurAuf: !e.spurAuf })}>{t('Aktivität')}</button>
              <button className="chip" title={t('Laufenden Turn abbrechen (Esc)')}
                      onClick={() => void steuerung.abbrechen()}>{t('Abbrechen')}</button>
              <button className="chip" data-gefahr="true" title={t('Server beenden und Session schließen')}
                      onClick={() => { void api.beenden(); S.setzen({ zustand: 'off' }) }}>{t('Beenden')}</button>
            </span>
          </header>

          <Buehne />
          <Verlauf />
          <Leiste modus={modus} aufModus={() => void wechsleModus()} />
        </main>
      </div>
    </>
  )
}
