#!/usr/bin/env node
// Persistent agent session for the CLI loop.
//
// Starting `claude -p` per utterance costs about 13 seconds of process startup
// alone, measured against 1.9 seconds to first text in the web interface. This
// script keeps the session open and talks to the shell in line-delimited JSON.
//
// In (stdin, one JSON line per message):
//   {"type":"say","text":"…"}           one utterance
//   {"type":"permission","id":"…","ok":true}
//   {"type":"interrupt"}
//
// Out (stdout, one JSON line per event):
//   {"type":"sentence","text":"…"}      finished sentence, ready to speak
//   {"type":"tool","name":"Bash","arg":"…"}
//   {"type":"permission","id":"…","tool":"…","arg":"…"}
//   {"type":"done","ms":1234}
//   {"type":"error","text":"…"}
//   {"type":"session","id":"…"}
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import { query } from '@anthropic-ai/claude-agent-sdk'

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const CWD = arg('cwd', process.cwd())
const MODEL = arg('model', '')
const MODE = arg('permission-mode', 'acceptEdits')
const EFFORT = arg('effort', '')
const RESUME = arg('resume', '')
const PROMPT = arg('system-prompt', '')

const emit = o => process.stdout.write(JSON.stringify(o) + '\n')

// The input is an async iterator the SDK pulls from. With nothing queued it
// waits for the next wake() instead of polling.
const inbox = []
let wake = null
async function * incoming () {
  while (true) {
    if (!inbox.length) await new Promise(r => { wake = r })
    yield inbox.shift()
  }
}
const send = text => {
  inbox.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null })
  if (wake) { wake(); wake = null }
}

// Open permission requests. The shell answers with the same id.
const pending = new Map()

// For the common tools, show the one field that matters.
const FIELD = { Bash: 'command', Read: 'file_path', Write: 'file_path', Edit: 'file_path',
               Glob: 'pattern', Grep: 'pattern', WebFetch: 'url', Agent: 'description',
               Task: 'description' }
const summarise = (name, input) => {
  const f = FIELD[name]
  const raw = f && input?.[f] != null ? String(input[f]) : JSON.stringify(input ?? {})
  return raw.replace(/\s+/g, ' ').slice(0, 120)
}

const q = query({
  prompt: incoming(),
  options: {
    cwd: CWD,
    ...(RESUME ? { resume: RESUME } : {}),
    permissionMode: MODE,
    allowDangerouslySkipPermissions: true,
    ...(EFFORT ? { effort: EFFORT } : {}),
    ...(MODEL ? { model: MODEL } : {}),
    includePartialMessages: true,
    systemPrompt: { type: 'preset', preset: 'claude_code', ...(PROMPT ? { append: PROMPT } : {}) },
    // The shell asks the user and sends the answer back. If the turn aborts
    // first, the signal settles the promise, which would otherwise hang.
    canUseTool: (tool, input, { signal }) => new Promise(resolve => {
      const id = randomUUID()
      pending.set(id, resolve)
      emit({ type: 'permission', id, tool, arg: summarise(tool, input) })
      signal?.addEventListener('abort', () => {
        if (pending.delete(id)) resolve({ behavior: 'deny', message: 'Interrupted.' })
      }, { once: true })
    })
  }
})

createInterface({ input: process.stdin }).on('line', line => {
  let m
  try { m = JSON.parse(line) } catch { return }
  if (m.type === 'say') send(String(m.text || ''))
  else if (m.type === 'permission') {
    const settle = pending.get(m.id)
    if (!settle) return
    pending.delete(m.id)
    settle(m.ok ? { behavior: 'allow' } : { behavior: 'deny', message: 'Denied by the user.' })
  } else if (m.type === 'interrupt') q.interrupt().catch(() => {})
  else if (m.type === 'end') { try { q.close() } catch {} ; process.exit(0) }
})

// Emit sentences one at a time as soon as they are complete: speech then
// starts while the rest is still being written. That is the audible difference
// against a loop which waits for the whole answer.
let buffer = '', spoken = 0, session = null
const SENTENCE_END = /[.!?](\s|$)/g

function flushSentences (rest) {
  if (rest) {
    const tail = buffer.slice(spoken).trim()
    if (tail) emit({ type: 'sentence', text: tail })
    buffer = ''; spoken = 0
    return
  }
  SENTENCE_END.lastIndex = spoken
  let m, cut = spoken
  while ((m = SENTENCE_END.exec(buffer))) cut = m.index + 1
  if (cut > spoken) {
    const piece = buffer.slice(spoken, cut).trim()
    if (piece) emit({ type: 'sentence', text: piece })
    spoken = cut
  }
}

;(async () => {
  try {
    for await (const msg of q) {
      if (msg.type === 'stream_event') {
        const d = msg.event?.delta
        if (d?.type === 'text_delta' && d.text && !msg.parent_tool_use_id) {
          buffer += d.text
          flushSentences(false)
        }
      } else if (msg.type === 'assistant') {
        for (const b of msg.message?.content || []) {
          if (b.type === 'tool_use') {
            emit({ type: 'tool', name: b.name, arg: summarise(b.name, b.input),
                   parent: msg.parent_tool_use_id || null })
          }
        }
      } else if (msg.type === 'result') {
        flushSentences(true)
        emit({ type: 'done', ms: msg.duration_ms || 0, costUsd: msg.total_cost_usd || 0 })
      } else if (msg.type === 'system' && msg.session_id) {
        // Every system message carries the id; only a change is news.
        if (msg.session_id !== session) { session = msg.session_id; emit({ type: 'session', id: session }) }
      }
    }
  } catch (e) {
    emit({ type: 'error', text: String(e?.message || e) })
    process.exit(1)
  }
})()
