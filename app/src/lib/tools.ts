import type { Messages } from './i18n/index.ts'

/**
 * The one field that carries the meaning for each frequent tool. Rendering the
 * whole input object in a single line is noise.
 */
export const ARG_FIELD: Record<string, string> = {
  Bash: 'command', Read: 'file_path', Write: 'file_path', Edit: 'file_path',
  Glob: 'pattern', Grep: 'pattern', WebFetch: 'url',
  Task: 'description', Agent: 'description'
}

/** Tools whose argument is a path, where only the file name is worth showing. */
const BASENAME_ONLY = new Set(['Read', 'Write', 'Edit', 'NotebookEdit'])

export function argText (name: string, input?: Record<string, unknown>): string {
  const field = ARG_FIELD[name]
  const raw = field && input?.[field] != null ? String(input[field]) : JSON.stringify(input ?? {})
  // The row clips with CSS and expands on click, so the text stays whole.
  return raw.slice(0, 4000)
}

export function shortArg (name: string, input?: Record<string, unknown>): string {
  const field = ARG_FIELD[name]
  return field && input?.[field] != null ? String(input[field]).replace(/\s+/g, ' ') : ''
}

/** Label for the step line: verb plus the single argument that matters. */
export function stepLabel (
  name: string,
  input: Record<string, unknown> | undefined,
  m: Messages
): string {
  const verb = (m.tool as Record<string, string>)[name] ?? name
  const field = ARG_FIELD[name]
  let arg = field && input?.[field] != null ? String(input[field]) : ''
  if (BASENAME_ONLY.has(name)) arg = arg.split('/').pop() ?? arg
  arg = arg.replace(/\s+/g, ' ').trim()
  if (!arg) return verb + '…'
  return verb + ' ' + (arg.length > 64 ? arg.slice(0, 64) + '…' : arg)
}
