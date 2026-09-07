import * as Collapsible from '@radix-ui/react-collapsible'
import { CaretRight } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { useSettings } from '../../store/settings.ts'

/**
 * A group in the sidebar. Its open state persists, so an arrangement survives
 * a reload.
 */
export function Group (
  { id, title, badge, badgeActive, action, grows, children, onOpen }:
  {
    id: string
    title: string
    badge?: string | number
    badgeActive?: boolean
    action?: ReactNode
    grows?: boolean
    children: ReactNode
    onOpen?: () => void
  }
) {
  const open = useSettings(s => s.openGroups[id] ?? false)
  const setGroup = useSettings(s => s.setGroup)

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={o => { setGroup(id, o); if (o) onOpen?.() }}
      // flex:none, or the sidebar squeezes several open groups together until
      // their content spills out of the box.
      className={clsx('min-h-0', grows && open ? 'flex flex-1 flex-col' : 'flex-none')}
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
        <span>{title}</span>
        {badge !== undefined && (
          <span className={clsx(
            'ml-auto rounded-full px-[6px] py-px text-[10.5px] tabular-nums',
            badgeActive ? 'bg-accent text-white' : 'bg-line text-dim'
          )}>{badge}</span>
        )}
        {action && <span className="ml-auto" onClick={e => e.stopPropagation()}>{action}</span>}
      </Collapsible.Trigger>
      <Collapsible.Content
        className={clsx('overflow-hidden', grows && open && 'flex flex-1 flex-col min-h-0')}
      >
        <div className={clsx('flex flex-col gap-[11px] pt-2 pb-[2px]',
                             grows && 'flex-1 min-h-0 pb-0')}>
          {children}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

/** Small icon-only button, used to reload a list. */
export function IconButton (
  { title, onClick, children, busy }:
  { title: string; onClick: () => void; children: ReactNode; busy?: boolean }
) {
  return (
    <button
      type="button" title={title} aria-label={title}
      onClick={e => { e.preventDefault(); e.stopPropagation(); onClick() }}
      className={clsx(
        'grid place-items-center w-[22px] h-[22px] rounded-field border-0 bg-transparent',
        'text-dim hover:text-fg hover:bg-soft cursor-pointer transition-colors',
        'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1',
        busy && 'opacity-50 pointer-events-none animate-[sspin_.8s_linear_infinite]'
      )}
    >
      {children}
    </button>
  )
}
