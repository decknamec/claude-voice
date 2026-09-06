import type {
  Backend, Befehl, GitLage, McpServer, ModellInfo, SitzungKurz,
  StatusBericht, Stats, VerlaufBlock
} from './types'

/** Das Token steht in der URL, aber in der Desktop-Schale putzen wir es dort
 *  weg — und ein Neuladen (Cmd-R) hätte danach keins mehr. Also einmal in den
 *  Sitzungsspeicher legen, der genau so lange lebt wie das Fenster. */
function holToken (): string {
  const ausUrl = new URLSearchParams(location.search).get('token')
  if (ausUrl) {
    try { sessionStorage.setItem('cv-token', ausUrl) } catch { /* privater Modus */ }
    return ausUrl
  }
  try { return sessionStorage.getItem('cv-token') ?? '' } catch { return '' }
}

export const TOKEN = holToken()

export class ApiFehler extends Error {
  code: string
  constructor (message: string, code = 'unbekannt') { super(message); this.code = code }
}

async function auswerten<T> (r: Response): Promise<T> {
  const text = await r.text()
  let daten: unknown
  try { daten = text ? JSON.parse(text) : {} } catch { daten = {} }
  if (!r.ok) {
    const d = daten as { error?: string; code?: string }
    throw new ApiFehler(d.error || `HTTP ${r.status}`, d.code || String(r.status))
  }
  return daten as T
}

export async function hol<T> (pfad: string): Promise<T> {
  const r = await fetch(pfad, { headers: { 'x-voice-token': TOKEN } })
    .catch(() => { throw new ApiFehler('Server nicht erreichbar', 'offline') })
  return auswerten<T>(r)
}

export async function schick<T> (pfad: string, body: unknown): Promise<T> {
  const r = await fetch(pfad, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-voice-token': TOKEN },
    body: JSON.stringify(body ?? {})
  }).catch(() => { throw new ApiFehler('Server nicht erreichbar', 'offline') })
  return auswerten<T>(r)
}

/** Rohdaten hochladen, etwa die Aufnahme zur Transkription. */
export async function schickRoh<T> (pfad: string, blob: Blob): Promise<T> {
  const r = await fetch(pfad, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-voice-token': TOKEN },
    body: blob
  }).catch(() => { throw new ApiFehler('Server nicht erreichbar', 'offline') })
  return auswerten<T>(r)
}

export const api = {
  config: () => hol<{
    tts: string; voice: string; model: string | null; permissionMode: string
    session: string | null; cwd: string; lang: string
    modelOverride: string | null; effort: string | null
  }>('/api/config'),
  backends: () => hol<{ backends: Backend[]; active: string }>('/api/backends'),
  stats: () => hol<Stats>('/api/stats'),
  status: () => hol<StatusBericht>('/api/status'),
  kontext: (voll?: boolean) => hol<{
    tokens: number; max: number; prozent: number; modell: string
    kategorien: { name: string; tokens: number }[]
  }>('/api/context' + (voll ? '?voll=1' : '')),
  mcp: () => hol<{ server: McpServer[] }>('/api/mcp'),
  befehle: () => hol<{ befehle: Befehl[] }>('/api/commands'),
  modelle: () => hol<{ modelle: ModellInfo[] }>('/api/models'),
  sitzungen: () => hol<{ sessions: SitzungKurz[] }>('/api/sessions'),
  vokabular: () => hol<{ vokabular: string }>('/api/vocab'),
  git: () => hol<GitLage>('/api/git'),

  transkribieren: (blob: Blob) => schickRoh<{ said: string; ms: number }>('/api/transcribe', blob),
  sagen: (text: string) => schick<{ ok: boolean }>('/api/say', { text }),
  vorschau: (blob: Blob) => schickRoh<{ said: string }>('/api/preview', blob),
  abbrechen: () => schick<{ ok: boolean }>('/api/interrupt', {}),
  zuruecksetzen: () => schick<{ ok: boolean }>('/api/reset', {}),
  beenden: () => schick<{ ok: boolean }>('/api/shutdown', {}),
  fortsetzen: (id: string) => schick<{ ok: boolean; verlauf: VerlaufBlock[] | null }>('/api/resume', { id }),

  freigabe: (b: { id: string; behavior: 'allow' | 'deny'; umfang?: 'genau' | 'werkzeug'
                  tool?: string; input?: unknown }) =>
    schick<{ ok: boolean }>('/api/permission', b),
  modus: (mode: string) => schick<{ ok: boolean; applied: boolean; restarted: boolean }>('/api/permission-mode', { mode }),
  modell: (model: string) => schick<{ ok: boolean; restarted: boolean }>('/api/model', { model }),
  sprache: (lang: string) => schick<{ ok: boolean; restarted: boolean }>('/api/language', { lang }),
  denktiefe: (effort: string | null) => schick<{ ok: boolean; restarted: boolean }>('/api/effort', { effort }),
  stil: (stil: string, text?: string) => schick<{ ok: boolean; restarted: boolean }>('/api/style', { stil, text }),
  setzeVokabular: (text: string) => schick<{ ok: boolean }>('/api/vocab', { text }),
  gitTun: (aktion: string, name?: string) =>
    schick<{ ok: boolean; meldung: string; lage: GitLage }>('/api/git', { aktion, name }),

  audioUrl: (id: string) => `/api/audio/${id}?token=${encodeURIComponent(TOKEN)}`
}
