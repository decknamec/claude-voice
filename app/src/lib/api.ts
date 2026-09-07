import type {
  GitState, McpServer, ModelInfo, SessionSummary, SlashCommand,
  SpeechBackend, Stats, StatusReport, TranscriptBlock
} from './types.ts'

/**
 * The token arrives in the URL, but the desktop shell strips it from there, so
 * a reload would be left without one. Session storage lives exactly as long as
 * the window does.
 */
function readToken (): string {
  const fromUrl = new URLSearchParams(location.search).get('token')
  if (fromUrl) {
    try { sessionStorage.setItem('cv-token', fromUrl) } catch { /* private mode */ }
    return fromUrl
  }
  try { return sessionStorage.getItem('cv-token') ?? '' } catch { return '' }
}

export const TOKEN = readToken()

export class ApiError extends Error {
  code: string
  constructor (message: string, code = 'unknown') { super(message); this.code = code }
}

async function unwrap<T> (r: Response): Promise<T> {
  const text = await r.text()
  let data: unknown
  try { data = text ? JSON.parse(text) : {} } catch { data = {} }
  if (!r.ok) {
    const d = data as { error?: string; code?: string }
    throw new ApiError(d.error || `HTTP ${r.status}`, d.code || String(r.status))
  }
  return data as T
}

export async function get<T> (path: string): Promise<T> {
  const r = await fetch(path, { headers: { 'x-voice-token': TOKEN } })
    .catch(() => { throw new ApiError('Server unreachable', 'offline') })
  return unwrap<T>(r)
}

export async function post<T> (path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-voice-token': TOKEN },
    body: JSON.stringify(body ?? {})
  }).catch(() => { throw new ApiError('Server unreachable', 'offline') })
  return unwrap<T>(r)
}

/** Raw upload, used for the recording that goes to transcription. */
export async function postBlob<T> (path: string, blob: Blob): Promise<T> {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-voice-token': TOKEN },
    body: blob
  }).catch(() => { throw new ApiError('Server unreachable', 'offline') })
  return unwrap<T>(r)
}

export const api = {
  config: () => get<{
    tts: string; voice: string; model: string | null; permissionMode: string
    session: string | null; cwd: string; language: string
    modelOverride: string | null; effort: string | null
  }>('/api/config'),
  backends: () => get<{ backends: SpeechBackend[]; active: string }>('/api/backends'),
  stats: () => get<Stats>('/api/stats'),
  status: () => get<StatusReport>('/api/status'),
  context: (full?: boolean) => get<{
    tokens: number; max: number; percent: number; model: string
    categories: { name: string; tokens: number }[]
  }>('/api/context' + (full ? '?full=1' : '')),
  mcp: () => get<{ servers: McpServer[] }>('/api/mcp'),
  commands: () => get<{ commands: SlashCommand[] }>('/api/commands'),
  models: () => get<{ models: ModelInfo[] }>('/api/models'),
  sessions: () => get<{ sessions: SessionSummary[] }>('/api/sessions'),
  vocabulary: () => get<{ vocabulary: string }>('/api/vocab'),
  git: () => get<GitState>('/api/git'),

  transcribe: (blob: Blob) => postBlob<{ said: string; ms: number }>('/api/transcribe', blob),
  say: (text: string) => post<{ ok: boolean }>('/api/say', { text }),
  /** Reads a sentence aloud without submitting it as a turn. */
  speak: (text: string) => post<{ ok: boolean }>('/api/speak', { text }),
  preview: (blob: Blob) => postBlob<{ said: string }>('/api/preview', blob),
  interrupt: () => post<{ ok: boolean }>('/api/interrupt', {}),
  reset: () => post<{ ok: boolean }>('/api/reset', {}),
  shutdown: () => post<{ ok: boolean }>('/api/shutdown', {}),
  resume: (id: string) =>
    post<{ ok: boolean; transcript: TranscriptBlock[] | null }>('/api/resume', { id }),

  permission: (body: {
    id: string; behavior: 'allow' | 'deny'; scope?: 'exact' | 'tool'
    tool?: string; input?: unknown
  }) => post<{ ok: boolean }>('/api/permission', body),
  setMode: (mode: string) =>
    post<{ ok: boolean; applied: boolean; restarted: boolean }>('/api/permission-mode', { mode }),
  setModel: (model: string) =>
    post<{ ok: boolean; restarted: boolean }>('/api/model', { model }),
  setLanguage: (language: string) =>
    post<{ ok: boolean; restarted: boolean }>('/api/language', { language }),
  setDepth: (effort: string | null) =>
    post<{ ok: boolean; restarted: boolean }>('/api/effort', { effort }),
  setStyle: (style: string, text?: string) =>
    post<{ ok: boolean; restarted: boolean }>('/api/style', { style, text }),
  setVocabulary: (text: string) => post<{ ok: boolean }>('/api/vocab', { text }),
  gitRun: (action: string, name?: string) =>
    post<{ ok: boolean; message: string; state: GitState }>('/api/git', { action, name }),

  audioUrl: (id: string) => `/api/audio/${id}?token=${encodeURIComponent(TOKEN)}`
}
