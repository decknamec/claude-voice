import * as SelectP from '@radix-ui/react-select'
import * as CheckboxP from '@radix-ui/react-checkbox'
import * as SliderP from '@radix-ui/react-slider'
import { CaretDown, Check } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import clsx from 'clsx'

// Radix übernimmt Tastatur, Fokusfalle und ARIA. Die handgebauten Menüs davor
// hatten genau da Lücken, und `appearance:none` auf einem echten <select> war
// jedes Mal ein Kampf gegen das Steuerelement des Systems.

export function Feld ({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-[5px] text-[11.5px] text-label">
      <span>{label}</span>
      {children}
    </label>
  )
}

export type Wahl = { wert: string; text: string; titel?: string; gruppe?: string }

export function Auswahl (
  { wert, auf, wahlen, gefahr }:
  { wert: string; auf: (w: string) => void; wahlen: Wahl[]; gefahr?: boolean }
) {
  const gruppen = [...new Set(wahlen.map(w => w.gruppe ?? ''))]
  return (
    <SelectP.Root value={wert} onValueChange={auf}>
      <SelectP.Trigger
        className={clsx(
          'field flex items-center justify-between gap-2 px-[10px] py-2 w-full cursor-pointer',
          'data-[state=open]:border-accent',
          gefahr && 'text-err border-err!'
        )}
      >
        <SelectP.Value />
        <SelectP.Icon><CaretDown size={11} weight="bold" className="opacity-55" /></SelectP.Icon>
      </SelectP.Trigger>
      <SelectP.Portal>
        <SelectP.Content
          position="popper" sideOffset={5}
          className="z-50 min-w-[var(--radix-select-trigger-width)] max-h-[320px] overflow-hidden
                     rounded-field border border-line bg-panel shadow-panel
                     animate-[rise_var(--t-quick)_var(--ease-out-sig)_both]"
        >
          <SelectP.Viewport className="p-1">
            {gruppen.map(g => (
              <SelectP.Group key={g}>
                {g && (
                  <SelectP.Label className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-[.08em] text-dim">
                    {g}
                  </SelectP.Label>
                )}
                {wahlen.filter(w => (w.gruppe ?? '') === g).map(w => (
                  <SelectP.Item
                    key={w.wert} value={w.wert} title={w.titel}
                    className="flex items-center gap-2 px-2 py-[6px] text-[12.5px] rounded-[6px]
                               cursor-pointer outline-none select-none text-label
                               data-[highlighted]:bg-soft data-[highlighted]:text-fg
                               data-[state=checked]:text-fg"
                  >
                    <SelectP.ItemIndicator><Check size={11} weight="bold" /></SelectP.ItemIndicator>
                    <SelectP.ItemText>{w.text}</SelectP.ItemText>
                  </SelectP.Item>
                ))}
              </SelectP.Group>
            ))}
          </SelectP.Viewport>
        </SelectP.Content>
      </SelectP.Portal>
    </SelectP.Root>
  )
}

export function Haken (
  { an, auf, text }: { an: boolean; auf: (b: boolean) => void; text: string }
) {
  return (
    <label className="flex flex-row items-center gap-[9px] min-h-[26px] py-[3px] cursor-pointer
                      text-[12px] text-label hover:text-fg transition-colors">
      <CheckboxP.Root
        checked={an} onCheckedChange={v => auf(v === true)}
        className="w-[15px] h-[15px] shrink-0 rounded-[calc(var(--r-field)/2)] border border-line
                   bg-panel grid place-items-center cursor-pointer transition-colors
                   data-[state=checked]:bg-accent data-[state=checked]:border-accent
                   focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      >
        <CheckboxP.Indicator><Check size={10} weight="bold" color="#fff" /></CheckboxP.Indicator>
      </CheckboxP.Root>
      <span>{text}</span>
    </label>
  )
}

export function Regler (
  { label, wert, auf, min, max, schritt, anzeige }:
  { label: string; wert: number; auf: (n: number) => void
    min: number; max: number; schritt: number; anzeige: string }
) {
  return (
    <div className="flex flex-col gap-[7px] text-[11.5px] text-label">
      <span className="flex items-baseline justify-between gap-[10px]">
        <span>{label}</span>
        <span className="text-fg tabular-nums text-right">{anzeige}</span>
      </span>
      <SliderP.Root
        value={[wert]} min={min} max={max} step={schritt}
        onValueChange={v => auf(v[0])}
        className="relative flex items-center w-full h-[14px] cursor-pointer select-none touch-none"
      >
        <SliderP.Track className="relative h-[3px] w-full grow rounded-[2px] bg-line">
          <SliderP.Range className="absolute h-full rounded-[2px] bg-accent" />
        </SliderP.Track>
        <SliderP.Thumb
          className="block w-[13px] h-[13px] rounded-full bg-accent
                     transition-transform active:scale-125
                     focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        />
      </SliderP.Root>
    </div>
  )
}

export function Textfeld (
  { wert, auf, platzhalter, zeilen = 2 }:
  { wert: string; auf: (s: string) => void; platzhalter: string; zeilen?: number }
) {
  return (
    <textarea
      rows={zeilen} value={wert} placeholder={platzhalter}
      onChange={e => auf(e.target.value)}
      className="field w-full px-[10px] py-2 text-[12.5px] resize-y min-h-[56px]
                 placeholder:text-dim placeholder:opacity-70"
    />
  )
}
