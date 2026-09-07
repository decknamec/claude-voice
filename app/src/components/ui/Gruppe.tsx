import * as Collapsible from '@radix-ui/react-collapsible'
import { CaretRight } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { useEinstellungen } from '../../store/einstellungen.ts'

/** Eine Gruppe in der Seitenleiste. Der Zustand wird gemerkt, damit man seine
 *  Anordnung nicht nach jedem Neuladen wiederherstellen muss. */
export function Gruppe (
  { id, titel, abzeichen, abzeichenAn, aktion, waechst, children, beimOeffnen }:
  {
    id: string
    titel: string
    abzeichen?: string | number
    abzeichenAn?: boolean
    aktion?: ReactNode
    waechst?: boolean
    children: ReactNode
    beimOeffnen?: () => void
  }
) {
  const offen = useEinstellungen(s => s.offeneGruppen[id] ?? false)
  const setzeGruppe = useEinstellungen(s => s.gruppe)

  return (
    <Collapsible.Root
      open={offen}
      onOpenChange={o => { setzeGruppe(id, o); if (o) beimOeffnen?.() }}
      // flex:none, sonst quetscht die Seitenleiste mehrere offene Gruppen
      // zusammen, bis der Inhalt aus dem Kasten läuft.
      className={clsx('min-h-0', waechst && offen ? 'flex flex-1 flex-col' : 'flex-none')}
    >
      <Collapsible.Trigger
        className="group flex w-full items-center gap-[7px] py-[5px] rounded-field
                   text-[11px] font-semibold uppercase tracking-[.08em] text-dim
                   hover:text-fg transition-colors cursor-pointer select-none
                   focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      >
        <CaretRight
          size={10} weight="bold"
          className="transition-transform duration-200 group-data-[state=open]:rotate-90"
        />
        <span>{titel}</span>
        {abzeichen !== undefined && (
          <span className={clsx(
            'ml-auto rounded-full px-[6px] py-px text-[10.5px] tabular-nums',
            abzeichenAn ? 'bg-accent text-white' : 'bg-line text-dim'
          )}>{abzeichen}</span>
        )}
        {aktion && <span className="ml-auto" onClick={e => e.stopPropagation()}>{aktion}</span>}
      </Collapsible.Trigger>
      <Collapsible.Content
        className={clsx('overflow-hidden', waechst && offen && 'flex flex-1 flex-col min-h-0')}
      >
        <div className={clsx('flex flex-col gap-[11px] pt-2 pb-[2px]',
                             waechst && 'flex-1 min-h-0 pb-0')}>
          {children}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

/** Kleiner Nur-Symbol-Knopf, etwa zum Neuladen einer Liste. */
export function Symbolknopf (
  { titel, auf, children, laeuft }:
  { titel: string; auf: () => void; children: ReactNode; laeuft?: boolean }
) {
  return (
    <button
      type="button" title={titel} aria-label={titel}
      onClick={e => { e.preventDefault(); e.stopPropagation(); auf() }}
      className={clsx(
        'grid place-items-center w-[22px] h-[22px] rounded-field border-0 bg-transparent',
        'text-dim hover:text-fg hover:bg-soft cursor-pointer transition-colors',
        'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1',
        laeuft && 'opacity-50 pointer-events-none animate-[sspin_.8s_linear_infinite]'
      )}
    >
      {children}
    </button>
  )
}
