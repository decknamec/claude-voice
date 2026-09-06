import { create } from 'zustand'
import { useEffect } from 'react'
import clsx from 'clsx'

export type Meldung = { id: number; titel: string; text: string; schlecht?: boolean }

type Laden = {
  liste: Meldung[]
  zeige: (titel: string, text: string, schlecht?: boolean) => void
  weg: (id: number) => void
}

let n = 0
export const useMeldungen = create<Laden>()(set => ({
  liste: [],
  zeige: (titel, text, schlecht) => {
    const id = ++n
    set(s => ({ liste: [...s.liste, { id, titel, text, schlecht }] }))
    setTimeout(() => set(s => ({ liste: s.liste.filter(m => m.id !== id) })), 4200)
  },
  weg: id => set(s => ({ liste: s.liste.filter(m => m.id !== id) }))
}))

/** Kurzmeldung oben statt einer Zeile im Gesprächsverlauf: Zustandsänderungen
 *  sind Rückmeldung der Oberfläche, nicht Teil des Gesprächs. */
export function Meldungen () {
  const liste = useMeldungen(s => s.liste)
  const weg = useMeldungen(s => s.weg)
  return (
    <div
      aria-live="polite"
      className="fixed top-[14px] left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2
                 items-center pointer-events-none w-[min(560px,92vw)]"
    >
      {liste.map(m => (
        <div
          key={m.id}
          onClick={() => weg(m.id)}
          className={clsx(
            'pointer-events-auto cursor-pointer flex items-baseline gap-2 max-w-full',
            'rounded-pill border border-line bg-panel shadow-panel px-[15px] py-[9px]',
            'text-[12.5px] animate-[toastRein_var(--t-std)_var(--ease-out-sig)_both]',
            m.schlecht && 'border-err/60'
          )}
        >
          <b className={clsx('shrink-0 font-medium', m.schlecht ? 'text-err' : 'text-fg')}>{m.titel}</b>
          <span className="text-dim truncate">{m.text}</span>
        </div>
      ))}
    </div>
  )
}

/** Fehler eines Aufrufs einmal zentral melden. */
export function useFehlerMelder () {
  const zeige = useMeldungen(s => s.zeige)
  return zeige
}

/** Benachrichtigungen einmal erbitten, und zwar erst wenn der Nutzer etwas
 *  tut — ein Dialog beim Laden wird reflexhaft weggeklickt. */
export function useNotifBitte (ausloeser: unknown) {
  useEffect(() => {
    if (!ausloeser) return
    if (!('Notification' in window) || Notification.permission !== 'default') return
    void Notification.requestPermission().catch(() => {})
  }, [ausloeser])
}
