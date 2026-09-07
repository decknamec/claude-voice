import { useEffect, useState } from 'react'
import { api } from '../lib/api.ts'
import { AKZENTE, GROESSEN, useEinstellungen } from '../store/einstellungen.ts'
import { useSitzung } from '../store/sitzung.ts'
import { useT } from '../lib/useT.ts'
import { Gruppe } from './ui/Gruppe.tsx'
import { Auswahl, Feld, Haken, Regler, Textfeld, type Wahl } from './ui/Felder.tsx'
import { useMeldungen } from './ui/Meldungen.tsx'
import { audio } from '../lib/audio.ts'
import type { Backend, ModellInfo, Modus } from '../lib/types.ts'

export const MODUS_NAME: Record<string, string> = {
  default: 'fragt nach', acceptEdits: 'Edits ohne Rückfrage', plan: 'nur planen',
  auto: 'Modell entscheidet', dontAsk: 'nur Vorgenehmigtes',
  bypassPermissions: 'ohne jede Rückfrage'
}

const MODI: { wert: Modus; text: string }[] = [
  { wert: 'default', text: 'fragt nach' },
  { wert: 'acceptEdits', text: 'Edits ohne Rückfrage' },
  { wert: 'plan', text: 'nur planen' },
  { wert: 'auto', text: 'Modell entscheidet' },
  { wert: 'dontAsk', text: 'nur Vorgenehmigtes' },
  { wert: 'bypassPermissions', text: 'ohne jede Rückfrage' }
]

const STILE = ['standard', 'knapp', 'ausfuehrlich', 'erklaerend', 'sachlich',
               'locker', 'sokratisch', 'eigen'] as const
export const STIL_NAME: Record<string, string> = {
  standard: 'wie üblich', knapp: 'knapp', ausfuehrlich: 'ausführlich',
  erklaerend: 'erklärend', sachlich: 'sachlich', locker: 'locker',
  sokratisch: 'sokratisch', eigen: 'eigener Stil'
}

const DENKTIEFEN = ['', 'low', 'medium', 'high', 'xhigh', 'max']
const DENKTEXT = ['wie konfiguriert', 'sehr flach', 'mittel', 'tief', 'sehr tief', 'maximal']

/** Modelle sind eine Momentaufnahme, bis eine Session läuft — dann ersetzt
 *  supportedModels() die Liste, und es steht nur drin, was dieser Zugang kann. */
const START_MODELLE: Wahl[] = [
  { wert: '', text: 'wie konfiguriert' },
  { wert: 'claude-fable-5', text: 'Fable 5', gruppe: 'Fable' },
  { wert: 'claude-opus-5', text: 'Opus 5', gruppe: 'Opus' },
  { wert: 'claude-opus-4-8', text: 'Opus 4.8', gruppe: 'Opus' },
  { wert: 'claude-sonnet-5', text: 'Sonnet 5', gruppe: 'Sonnet' },
  { wert: 'claude-haiku-4-5', text: 'Haiku 4.5', gruppe: 'Haiku' }
]

export function GruppeEinstellungen ({ modelle }: { modelle: ModellInfo[] }) {
  const { t } = useT()
  const e = useEinstellungen()
  const melde = useMeldungen(s => s.zeige)
  const [backends, setzeBackends] = useState<Backend[]>([])
  const [backend, setzeBackend] = useState('')
  const [stimme, setzeStimme] = useState('')
  const [modell, setzeModell] = useState('')
  const [modus, setzeModus] = useState<Modus>('default')
  const [tiefe, setzeTiefe] = useState(0)
  const [vokabel, setzeVokabel] = useState('')

  useEffect(() => {
    void api.backends().then(d => {
      setzeBackends(d.backends)
      const frei = d.backends.filter(b => b.available).map(b => b.id)
      setzeBackend(frei.includes(d.active) ? d.active : frei[0] ?? '')
    }).catch(() => {})
    void api.config().then(c => {
      setzeModus((c.permissionMode as Modus) ?? 'default')
      setzeModell(c.modelOverride ?? '')
      setzeTiefe(Math.max(0, DENKTIEFEN.indexOf(c.effort ?? '')))
    }).catch(() => {})
    void api.vokabular().then(d => setzeVokabel(d.vokabular)).catch(() => {})
  }, [])

  const b = backends.find(x => x.id === backend)
  const stimmen: Wahl[] = b?.voices.length
    ? b.voices.map(v => ({ wert: v.id, text: v.name ?? v.id, titel: v.id }))
    : [{ wert: '', text: t(b?.id === 'auto' ? 'Stimme aus Konfig' : 'keine Auswahl') }]

  const modellWahlen: Wahl[] = modelle.length
    ? [{ wert: '', text: t('wie konfiguriert') },
       ...modelle.map(m => ({ wert: m.id, text: m.name, titel: m.beschreibung }))]
    : START_MODELLE.map(w => ({ ...w, text: w.wert ? w.text : t(w.text) }))

  const melden = (titel: string, txt: string) => melde(t(titel), txt, false)
  const fehler = (err: unknown) => melde(t('Fehler'), String((err as Error).message), true)

  return (
    <Gruppe id="grp-set" titel={t('Einstellungen')}>
      <Feld label={t('Sprachausgabe')}>
        <Auswahl
          wert={backend} auf={setzeBackend}
          wahlen={backends.map(x => ({
            wert: x.id,
            text: x.available ? t(x.label) : `${t(x.label)} (${t(x.detail)})`,
            titel: t(x.detail)
          }))}
        />
      </Feld>
      <Feld label={t('Stimme')}>
        <Auswahl wert={stimme || (stimmen[0]?.wert ?? '')} auf={setzeStimme} wahlen={stimmen} />
      </Feld>
      <Feld label={t('Modell')}>
        <Auswahl
          wert={modell} wahlen={modellWahlen}
          auf={async v => {
            setzeModell(v)
            try {
              const r = await api.modell(v)
              melden('Modell', (v || t('wie konfiguriert')) +
                (r.restarted ? t('. Neue Session gestartet, weil das Modell beim Start gesetzt wird.') : ''))
            } catch (err) { fehler(err) }
          }}
        />
      </Feld>
      <Regler
        label={t('Denktiefe')} wert={tiefe} min={0} max={5} schritt={1}
        anzeige={t(DENKTEXT[tiefe])}
        auf={async n => {
          setzeTiefe(n)
          try { await api.denktiefe(DENKTIEFEN[n] || null) } catch (err) { fehler(err) }
        }}
      />
      <Feld label={t('Sprache')}>
        <Auswahl
          wert={e.sprache}
          wahlen={[
            { wert: 'de', text: t('Deutsch') },
            { wert: 'en', text: t('English') },
            { wert: 'auto', text: t('automatisch erkennen') }
          ]}
          auf={async v => {
            e.setzen({ sprache: v as never })
            try {
              const r = await api.sprache(v)
              melden('Sprache', r.restarted
                ? t('. Neue Session gestartet, weil die Antwortsprache am Systemprompt hängt.') : '')
            } catch (err) { fehler(err) }
          }}
        />
      </Feld>
      <Feld label={t('Fachwörter für die Erkennung')}>
        <Textfeld
          wert={vokabel} auf={setzeVokabel}
          platzhalter={t('Begriffe, die Whisper sonst verhört — mit Komma getrennt')}
        />
      </Feld>
      <button className="chip self-start text-[11px] py-[3px]"
              onClick={async () => {
                try { await api.setzeVokabular(vokabel); melden('Spracherkennung', t('Fachwörter übernommen')) }
                catch (err) { fehler(err) }
              }}>{t('übernehmen')}</button>

      <div className="flex flex-col gap-[2px] border-t border-line pt-2">
        <Haken an={e.werkzeugzeilen} auf={v => e.setzen({ werkzeugzeilen: v })}
               text={t('Werkzeugzeilen im Verlauf')} />
        <Haken an={e.befehleGanz} auf={v => e.setzen({ befehleGanz: v })}
               text={t('Befehle vollständig zeigen')} />
      </div>

      <Feld label={t('Antwortstil')}>
        <Auswahl
          wert={e.stil}
          wahlen={STILE.map(s => ({ wert: s, text: t(s === 'eigen' ? 'eigener Stil…' : STIL_NAME[s]) }))}
          auf={async v => {
            e.setzen({ stil: v })
            try {
              const r = await api.stil(v, e.stilText)
              melden('Antwortstil', t(STIL_NAME[v] ?? v) +
                (r.restarted ? t('. Session neu gestartet, der Stil gilt ab jetzt.') : ''))
            } catch (err) { fehler(err) }
          }}
        />
      </Feld>
      {e.stil === 'eigen' && (
        <Feld label={t('Eigener Stil')}>
          <Textfeld
            wert={e.stilText} zeilen={3}
            auf={v => e.setzen({ stilText: v })}
            platzhalter={t('Antworte immer zuerst mit dem Ergebnis, dann mit dem Weg dorthin.')}
          />
        </Feld>
      )}

      <Feld label={t('Werkzeuge')}>
        <Auswahl
          wert={modus} gefahr={modus === 'bypassPermissions'}
          wahlen={MODI.map(m => ({ wert: m.wert, text: t(m.text) }))}
          auf={async v => {
            setzeModus(v as Modus)
            try {
              const r = await api.modus(v)
              melden('Modus', `${t('Werkzeuge')}: ${t(MODI.find(m => m.wert === v)?.text ?? v)}` +
                (r.restarted ? t('. Session neu gestartet, dieser Modus geht nur beim Start.')
                 : r.applied ? '' : t('. Gilt ab der nächsten Session.')))
            } catch (err) { fehler(err) }
          }}
        />
      </Feld>
    </Gruppe>
  )
}

export function GruppeDarstellung () {
  const { t } = useT()
  const e = useEinstellungen()
  return (
    <Gruppe id="grp-look" titel={t('Darstellung')}>
      <Feld label={t('Design')}>
        <Auswahl
          wert={e.theme} auf={v => e.setzen({ theme: v as never })}
          wahlen={[
            { wert: 'system', text: t('wie das System') },
            { wert: 'light', text: t('hell') },
            { wert: 'dark', text: t('dunkel') }
          ]}
        />
      </Feld>
      <Feld label={t('Akzent')}>
        {/* Das aktive Feld trägt einen Ring statt eines Hakens: ein Haken auf
            farbigem Grund liest sich je nach Ton mal gut, mal gar nicht. */}
        <span className="flex flex-wrap gap-[6px]">
          {AKZENTE.map(a => (
            <button
              key={a.name} type="button" title={t(a.name)}
              aria-pressed={e.akzent === a.name}
              onClick={() => e.setzen({ akzent: a.name })}
              style={{ background: a.hell, color: a.hell }}
              className="w-[22px] h-[22px] rounded-field border border-black/20 p-0 cursor-pointer
                         transition-transform hover:scale-110 active:scale-95
                         aria-pressed:shadow-[0_0_0_2px_var(--panel),0_0_0_3.5px_currentColor]
                         focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-2"
            />
          ))}
        </span>
      </Feld>
      <Regler
        label={t('Schriftgröße')} wert={e.groesse} min={0} max={4} schritt={1}
        anzeige={t(GROESSEN[e.groesse]?.[0] ?? 'normal')}
        auf={n => e.setzen({ groesse: n })}
      />
      <Feld label={t('Dichte')}>
        <Auswahl
          wert={e.dichte} auf={v => e.setzen({ dichte: v as never })}
          wahlen={[
            { wert: 'luft', text: t('luftig') },
            { wert: 'normal', text: t('normal') },
            { wert: 'kompakt', text: t('kompakt') }
          ]}
        />
      </Feld>
      <Feld label={t('Ecken')}>
        <Auswahl
          wert={e.radius} auf={v => e.setzen({ radius: v as never })}
          wahlen={[
            { wert: 'weich', text: t('weich') },
            { wert: 'normal', text: t('normal') },
            { wert: 'kantig', text: t('kantig') }
          ]}
        />
      </Feld>
      <div className="flex flex-col gap-[2px] border-t border-line pt-2">
        <Haken an={e.ruhig} auf={v => e.setzen({ ruhig: v })} text={t('Bewegung reduzieren')} />
        <Haken an={e.ohneSchimmer} auf={v => e.setzen({ ohneSchimmer: v })}
               text={t('Hintergrundschimmer aus')} />
        <Haken an={e.stumm} auf={v => { e.setzen({ stumm: v }); audio.stumm(v) }}
               text={t('Antworten stumm')} />
      </div>
      <Regler
        label={t('Sprechtempo')} wert={e.tempo} min={70} max={150} schritt={5}
        anzeige={`${e.tempo} %`}
        auf={n => { e.setzen({ tempo: n }); audio.setzeTempo(n / 100) }}
      />
    </Gruppe>
  )
}

/** Aufgabenliste: was das Modell sich vorgenommen hat. Sie sagt mehr über den
 *  Fortschritt als jede Leiste, weil sie vom Modell selbst kommt. */
export function GruppeAufgaben () {
  const { t } = useT()
  const todos = useSitzung(s => s.todos)
  if (!todos.length) return null
  const fertig = todos.filter(x => x.status === 'completed').length
  return (
    <Gruppe id="grp-todo" titel={t('Aufgaben')}
            abzeichen={`${fertig}/${todos.length}`} abzeichenAn={fertig < todos.length}>
      <ol className="flex list-none flex-col gap-[5px] p-0 m-0">
        {todos.map((x, i) => (
          <li key={i} className={
            'flex items-baseline gap-2 text-[12px] ' +
            (x.status === 'completed' ? 'text-label opacity-50 line-through'
             : x.status === 'in_progress' ? 'text-fg' : 'text-label')
          }>
            <span className={'shrink-0 text-[10px] ' +
              (x.status === 'in_progress' ? 'text-accent' : 'opacity-50')}>
              {x.status === 'completed' ? '●' : x.status === 'in_progress' ? '◐' : '○'}
            </span>
            <span>{x.status === 'in_progress' && x.activeForm ? x.activeForm : x.content}</span>
          </li>
        ))}
      </ol>
    </Gruppe>
  )
}
