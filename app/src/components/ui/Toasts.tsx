import { create } from 'zustand'
import clsx from 'clsx'

export type Toast = { id: number; title: string; text: string; bad?: boolean }

type Store = {
  list: Toast[]
  show: (title: string, text: string, bad?: boolean) => void
  dismiss: (id: number) => void
}

let counter = 0
export const useToasts = create<Store>()(set => ({
  list: [],
  show: (title, text, bad) => {
    const id = ++counter
    set(s => ({ list: [...s.list, { id, title, text, bad }] }))
    setTimeout(() => set(s => ({ list: s.list.filter(t => t.id !== id) })), 4200)
  },
  dismiss: id => set(s => ({ list: s.list.filter(t => t.id !== id) }))
}))

/**
 * A short notice at the top rather than a line in the transcript: a state
 * change is feedback from the interface, not part of the conversation.
 */
export function Toasts () {
  const list = useToasts(s => s.list)
  const dismiss = useToasts(s => s.dismiss)
  return (
    <div
      aria-live="polite"
      className="fixed top-[14px] left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2
                 items-center pointer-events-none w-[min(560px,92vw)]"
    >
      {list.map(t => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={clsx(
            'pointer-events-auto cursor-pointer flex items-baseline gap-2 max-w-full',
            'rounded-pill border border-line bg-panel shadow-panel px-[15px] py-[9px]',
            'text-[12.5px] animate-[toastIn_var(--t-std)_var(--ease-out-sig)_both]',
            t.bad && 'border-err/60'
          )}
        >
          <b className={clsx('shrink-0 font-medium', t.bad ? 'text-err' : 'text-fg')}>{t.title}</b>
          <span className="text-dim truncate">{t.text}</span>
        </div>
      ))}
    </div>
  )
}
