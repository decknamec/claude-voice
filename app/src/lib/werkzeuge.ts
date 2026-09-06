// Für die häufigen Werkzeuge das eine Feld zeigen, auf das es ankommt — das
// ganze Eingabeobjekt wäre in einer Zeile nur Rauschen.
export const ARG: Record<string, string> = {
  Bash: 'command', Read: 'file_path', Write: 'file_path', Edit: 'file_path',
  Glob: 'pattern', Grep: 'pattern', WebFetch: 'url',
  Task: 'description', Agent: 'description'
}

// "Read" sagt einem Zuhörer nichts, "Liest server.mjs" schon.
export const VERB: Record<string, string> = {
  Bash: 'Führt aus', Read: 'Liest', Write: 'Schreibt', Edit: 'Ändert',
  Glob: 'Sucht Dateien', Grep: 'Durchsucht', WebFetch: 'Lädt',
  WebSearch: 'Sucht im Netz', Task: 'Startet Unteragent', Agent: 'Startet Unteragent',
  TodoWrite: 'Plant', NotebookEdit: 'Ändert Notebook'
}

const NUR_NAME = new Set(['Read', 'Write', 'Edit', 'NotebookEdit'])

export function argText (name: string, input?: Record<string, unknown>): string {
  const feld = ARG[name]
  const roh = feld && input?.[feld] != null ? String(input[feld]) : JSON.stringify(input ?? {})
  return roh.slice(0, 4000)
}

export function kurzArg (name: string, input?: Record<string, unknown>): string {
  const feld = ARG[name]
  return feld && input?.[feld] != null ? String(input[feld]).replace(/\s+/g, ' ') : ''
}

/** Beschriftung für die Schrittanzeige: Verb plus das eine Argument. */
export function schrittText (
  name: string, input: Record<string, unknown> | undefined,
  t: (s: string) => string
): string {
  const verb = t(VERB[name] ?? name)
  const feld = ARG[name]
  let arg = feld && input?.[feld] != null ? String(input[feld]) : ''
  if (NUR_NAME.has(name)) arg = arg.split('/').pop() ?? arg
  arg = arg.replace(/\s+/g, ' ').trim()
  if (!arg) return verb + '…'
  return verb + ' ' + (arg.length > 64 ? arg.slice(0, 64) + '…' : arg)
}
