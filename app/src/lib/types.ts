// Die Formen, die der Server über /api und den Ereignisstrom schickt.
// Handgeschrieben, weil sie zu server.mjs gehören und nicht zum SDK: genau
// hier ging beim letzten Mal ein Feldname daneben, der niemandem auffiel.

export type Zustand =
  | 'idle' | 'listening' | 'transcribing' | 'thinking'
  | 'speaking' | 'waiting' | 'error' | 'off'

export type Sprache = 'de' | 'en' | 'auto'

export type Modus =
  | 'default' | 'acceptEdits' | 'plan' | 'auto' | 'dontAsk' | 'bypassPermissions'

export type Kontext = {
  tokens: number
  max: number
  prozent: number
  modell?: string
}

export type Fenster = { pct: number; bis: string | null }

export type Limits = {
  abo: string | null
  fuenfH: Fenster | null
  siebenT: Fenster | null
  opus: Fenster | null
  sonnet: Fenster | null
}

export type ModellVerbrauch = { ein: number; aus: number; kosten: number }

export type Stats = {
  turns: number
  inTok: number
  outTok: number
  cacheRead: number
  cacheWrite: number
  costUsd: number
  lastMs: number
  apiMs: number
  startedAt: number
  ctx: Kontext | null
  zweig: string
  limits: Limits | null
  modelle: Record<string, ModellVerbrauch>
}

export type WerkzeugEreignis = {
  phase: 'use' | 'result'
  id: string
  name?: string
  input?: Record<string, unknown>
  ok?: boolean
  text?: string
  parent: string | null
}

export type SubagentEreignis =
  | { phase: 'start'; id: string; typ: string; desc: string }
  | { phase: 'text'; id: string; text: string }
  | { phase: 'done'; id: string; ok: boolean }

export type FreigabeAnfrage = {
  id: string
  tool: string
  input: Record<string, unknown>
}

export type Todo = {
  content: string
  activeForm?: string
  status: 'pending' | 'in_progress' | 'completed'
}

export type Backend = {
  id: string
  label: string
  detail: string
  available: boolean
  default?: string
  voices: { id: string; name?: string }[]
}

export type SitzungKurz = {
  id: string
  titel: string
  zuletzt: number
  aktuell: boolean
}

export type VerlaufBlock =
  | { rolle: 'du' | 'claude'; text: string }
  | { rolle: 'werkzeug'; namen: string[]; n: number }

export type McpServer = {
  name: string
  status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'
  scope: string
  version: string
  fehler: string
  werkzeuge: string[]
}

export type Befehl = { name: string; beschreibung: string; hinweis: string }

export type ModellInfo = { id: string; name: string; beschreibung: string; denktiefen: string[] }

export type GitLage = {
  repo: boolean
  zweig?: string
  zweige?: string[]
  geaendert?: number
  vor?: number
  zurueck?: number
  hatOben?: boolean
}

export type StatusBericht = {
  arbeit: { cwd: string; zweig: string }
  session: {
    id: string | null
    laeuft: boolean
    modell: string | null
    denktiefe: string | null
    werkzeuge: string
    sprache: string
    stil: string
    laufzeitMs: number
  }
  verbrauch: {
    zuege: number; ein: number; aus: number; cache: number
    kosten: number; kontext: Kontext | null
    modelle: Record<string, ModellVerbrauch>
  }
  spracherkennung: { modell: string; vorhanden: boolean; server: string; port: number }
  sprachausgabe: { backend: string; stimme: string }
  laufzeit: { node: string; sdk: string; pid: number; port: number }
  konto: { email?: string; organization?: string; subscriptionType?: string; apiKeySource?: string } | null
  limits: { rate_limits_available?: boolean } | null
}

/** Eine Zeile in der Werkzeugspur. */
export type SpurZeile = {
  id: string
  name: string
  arg: string
  ergebnis?: string
  schief?: boolean
  dim?: boolean
  diff?: { raus: string; rein: string }
}

export type Blase = {
  id: string
  wer: 'du' | 'claude' | 'trenner' | 'werkzeug'
  text: string
  meta?: string
  live?: boolean
  alt?: boolean
}
