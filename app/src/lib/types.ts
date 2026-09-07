/**
 * The shapes server.mjs sends over /api and the event stream.
 *
 * Hand-written because they belong to this repo's server rather than to the
 * Agent SDK, and a field name that drifts here surfaces as a blank panel
 * rather than an error.
 */

export type UiState =
  | 'idle' | 'listening' | 'transcribing' | 'thinking'
  | 'speaking' | 'waiting' | 'error' | 'off'

export type PermissionMode =
  | 'default' | 'acceptEdits' | 'plan' | 'auto' | 'dontAsk' | 'bypassPermissions'

export type ContextUsage = {
  tokens: number
  max: number
  percent: number
  model?: string
}

export type RateWindow = { percent: number; resetsAt: string | null }

export type RateLimits = {
  plan: string | null
  fiveHour: RateWindow | null
  sevenDay: RateWindow | null
  opus: RateWindow | null
  sonnet: RateWindow | null
}

export type ModelUsage = { in: number; out: number; costUsd: number }

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
  ctx: ContextUsage | null
  branch: string
  limits: RateLimits | null
  models: Record<string, ModelUsage>
}

export type ToolEvent = {
  phase: 'use' | 'result'
  id: string
  name?: string
  input?: Record<string, unknown>
  ok?: boolean
  text?: string
  parent: string | null
}

export type SubagentEvent =
  | { phase: 'start'; id: string; kind: string; description: string }
  | { phase: 'text'; id: string; text: string }
  | { phase: 'done'; id: string; ok: boolean }

export type PermissionRequest = {
  id: string
  tool: string
  input: Record<string, unknown>
}

export type Todo = {
  content: string
  activeForm?: string
  status: 'pending' | 'in_progress' | 'completed'
}

export type SpeechBackend = {
  id: string
  label: string
  /** A token the client translates, not prose: `claude-say` speaks German. */
  detailCode: string
  /** The part of the detail that is a name rather than a word, if any. */
  detailArg: string
  available: boolean
  default?: string
  voices: { id: string; name?: string }[]
}

export type SessionSummary = {
  id: string
  title: string
  lastModified: number
  current: boolean
}

export type TranscriptBlock =
  | { role: 'user' | 'assistant'; text: string }
  | { role: 'tool'; names: string[]; n: number }

export type McpServer = {
  name: string
  status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'
  scope: string
  version: string
  error: string
  tools: string[]
}

export type SlashCommand = { name: string; description: string; hint: string }

export type ModelInfo = {
  id: string
  name: string
  description: string
  depths: string[]
}

export type GitState = {
  repo: boolean
  branch?: string
  branches?: string[]
  changed?: number
  ahead?: number
  behind?: number
  hasUpstream?: boolean
}

export type StatusReport = {
  work: { cwd: string; branch: string }
  session: {
    id: string | null
    running: boolean
    model: string | null
    depth: string | null
    tools: string
    language: string
    style: string
    runtimeMs: number
  }
  usage: {
    turns: number; in: number; out: number; cache: number
    costUsd: number; ctx: ContextUsage | null
    models: Record<string, ModelUsage>
  }
  speechRecognition: { model: string; present: boolean; server: string; port: number }
  speechOutput: { backend: string; voice: string }
  runtime: { node: string; sdk: string; pid: number; port: number }
  account: {
    email?: string
    organization?: string
    subscriptionType?: string
    apiKeySource?: string
  } | null
  limits: { rate_limits_available?: boolean } | null
}

/** One row in the tool trail. */
export type TrailRow = {
  id: string
  name: string
  arg: string
  result?: string
  failed?: boolean
  dim?: boolean
  diff?: { removed: string; added: string }
}

export type Bubble = {
  id: string
  who: 'user' | 'assistant' | 'divider' | 'tool'
  text: string
  meta?: string
  live?: boolean
  restored?: boolean
}
