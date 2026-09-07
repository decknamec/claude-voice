import * as SelectP from '@radix-ui/react-select'
import * as CheckboxP from '@radix-ui/react-checkbox'
import * as SliderP from '@radix-ui/react-slider'
import { CaretDown, Check } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import clsx from 'clsx'

/**
 * Radix carries keyboard handling, focus containment and ARIA. A native
 * `<select>` under `appearance: none` also fights the system control on macOS,
 * which draws its own arrow inside the border.
 */

export function Field ({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-[5px] text-[11.5px] text-label">
      <span>{label}</span>
      {children}
    </label>
  )
}

export type Choice = { value: string; label: string; title?: string; group?: string }

/**
 * Radix treats the empty string as "nothing selected", so an item carrying it
 * leaves the trigger blank however good its label is. Callers use '' for "as
 * configured", which is a real choice, so swap it for a sentinel on the way in
 * and back again on the way out. Containing it here keeps every caller from
 * having to remember.
 */
const UNSET = '\u0000unset'
const intoRadix = (v: string) => v === '' ? UNSET : v
const outOfRadix = (v: string) => v === UNSET ? '' : v

export function Select (
  { value, onChange, choices, danger }:
  { value: string; onChange: (v: string) => void; choices: Choice[]; danger?: boolean }
) {
  const groups = [...new Set(choices.map(c => c.group ?? ''))]
  return (
    <SelectP.Root value={intoRadix(value)} onValueChange={v => onChange(outOfRadix(v))}>
      <SelectP.Trigger
        className={clsx(
          'field flex items-center justify-between gap-2 px-[10px] py-2 w-full cursor-pointer',
          'data-[state=open]:border-accent',
          danger && 'text-err border-err!'
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
            {groups.map(group => (
              <SelectP.Group key={group}>
                {group && (
                  <SelectP.Label className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-[.08em] text-dim">
                    {group}
                  </SelectP.Label>
                )}
                {choices.filter(c => (c.group ?? '') === group).map(c => (
                  <SelectP.Item
                    key={c.value} value={intoRadix(c.value)} title={c.title}
                    className="flex items-center gap-2 px-2 py-[6px] text-[12.5px] rounded-[6px]
                               cursor-pointer outline-none select-none text-label
                               data-[highlighted]:bg-soft data-[highlighted]:text-fg
                               data-[state=checked]:text-fg"
                  >
                    <SelectP.ItemIndicator><Check size={11} weight="bold" /></SelectP.ItemIndicator>
                    <SelectP.ItemText>{c.label}</SelectP.ItemText>
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

export function Checkbox (
  { checked, onChange, label }:
  { checked: boolean; onChange: (b: boolean) => void; label: string }
) {
  return (
    <label className="flex flex-row items-center gap-[9px] min-h-[26px] py-[3px] cursor-pointer
                      text-[12px] text-label hover:text-fg transition-colors">
      <CheckboxP.Root
        checked={checked} onCheckedChange={v => onChange(v === true)}
        className="w-[15px] h-[15px] shrink-0 rounded-[calc(var(--r-field)/2)] border border-line
                   bg-panel grid place-items-center cursor-pointer transition-colors
                   data-[state=checked]:bg-accent data-[state=checked]:border-accent
                   focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      >
        <CheckboxP.Indicator><Check size={10} weight="bold" color="#fff" /></CheckboxP.Indicator>
      </CheckboxP.Root>
      <span>{label}</span>
    </label>
  )
}

export function Slider (
  { label, value, onChange, min, max, step, display }:
  { label: string; value: number; onChange: (n: number) => void
    min: number; max: number; step: number; display: string }
) {
  return (
    <div className="flex flex-col gap-[7px] text-[11.5px] text-label">
      {/* Label left, value right, track below: the value on its own line under
          the track costs a row and frays the column. */}
      <span className="flex items-baseline justify-between gap-[10px]">
        <span>{label}</span>
        <span className="text-fg tabular-nums text-right">{display}</span>
      </span>
      <SliderP.Root
        value={[value]} min={min} max={max} step={step}
        onValueChange={v => onChange(v[0])}
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

export function TextArea (
  { value, onChange, placeholder, rows = 2 }:
  { value: string; onChange: (s: string) => void; placeholder: string; rows?: number }
) {
  return (
    <textarea
      rows={rows} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="field w-full px-[10px] py-2 text-[12.5px] resize-y min-h-[56px]
                 placeholder:text-dim placeholder:opacity-70"
    />
  )
}
