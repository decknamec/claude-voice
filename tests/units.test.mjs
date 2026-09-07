// Unit tests for the pure logic - what is checkable without a microphone,
// without a model and without a running session. Deliberately not chasing
// coverage: what gets tested is what has broken before or can break silently.
//
//   node --test tests/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { condense } from '../ui/transcript.mjs'
import { speakable } from '../ui/speakable.mjs'

// ── Transcript ───────────────────────────────────────────────────────
// A foreign data format: if Claude Code changes the shape of a line, the
// restore silently comes back empty and nobody notices.

const line = o => JSON.stringify(o)
const user = t => line({ type: 'user', message: { content: t } })
const claude = (...blocks) => line({ type: 'assistant', message: { content: blocks } })
const text = t => ({ type: 'text', text: t })
const tool = name => ({ type: 'tool_use', name })

test('transcript: question and answer become two blocks', () => {
  const v = condense([user('Wie spät?'), claude(text('Kurz nach drei.'))])
  assert.deepEqual(v, [
    { role: 'user', text: 'Wie spät?' },
    { role: 'assistant', text: 'Kurz nach drei.' }
  ])
})

test('transcript: a split answer is joined again', () => {
  // The stream breaks one answer into several assistant lines.
  const v = condense([claude(text('Erster Teil.')), claude(text('Zweiter Teil.'))])
  assert.equal(v.length, 1)
  assert.equal(v[0].text, 'Erster Teil. Zweiter Teil.')
})

test('transcript: runs of tool calls are bundled, not listed', () => {
  const v = condense([
    claude(tool('Bash'), tool('Bash'), tool('Read'), tool('Bash'))
  ])
  assert.equal(v.length, 1)
  assert.equal(v[0].role, 'tool')
  assert.equal(v[0].n, 4)
  assert.deepEqual(v[0].names, ['Bash', 'Read'])
})

test('transcript: at most four distinct tool names', () => {
  const v = condense([claude(...['a', 'b', 'c', 'd', 'e', 'f'].map(tool))])
  assert.equal(v[0].n, 6)
  assert.equal(v[0].names.length, 4)
})

test('transcript: subagents do not belong in the history', () => {
  const v = condense([
    JSON.stringify({ type: 'assistant', isSidechain: true, message: { content: [text('quiet')] } }),
    claude(text('loud'))
  ])
  assert.deepEqual(v.map(b => b.text), ['loud'])
})

test('transcript: tool results and hook interjections are dropped', () => {
  // Those arrive as user lines too, but they start with a marker.
  const v = condense([user('<system-reminder>ignore</system-reminder>'), user('real')])
  assert.deepEqual(v.map(b => b.text), ['real'])
})

test('transcript: broken lines do not stop the rest', () => {
  const v = condense(['{not json', '', user('still here')])
  assert.deepEqual(v.map(b => b.text), ['still here'])
})

test('transcript: the cap cuts from the front, the newest survives', () => {
  // Alternating, because consecutive lines of the same role merge into one
  // block - ten user lines would otherwise be a single one.
  const many = Array.from({ length: 10 }, (_, i) =>
    i % 2 ? claude(text(`c${i}`)) : user(`n${i}`))
  const v = condense(many, 3)
  assert.deepEqual(v.map(b => b.text), ['c7', 'n8', 'c9'])
})

// ── Speakable text ───────────────────────────────────────────────────
// Without this, speech output spells out slashes for minutes.

test('speakable: code blocks disappear', () => {
  // Newlines become spaces: speech output knows no paragraphs, and a wrapped
  // sentence would sound chopped up.
  assert.equal(speakable('Vorher.\n```js\nconst x = 1\n```\nNachher.'), 'Vorher. Nachher.')
})

test('speakable: a path is reduced to its file name', () => {
  assert.match(speakable('siehe /a/b/hook.sh hier'), /siehe hook\.sh hier/)
})

test('speakable: empty text stays empty', () => {
  assert.equal(speakable('').trim(), '')
  assert.equal(speakable('```nur code```').trim(), '')
})

// ── Wire contract ────────────────────────────────────────────────────
// The client declares the shapes in app/src/lib/types.ts, the server builds
// them by hand in ui/server.mjs. A field renamed on one side only shows up as
// a blank panel rather than an error, so check that every field of a
// server-sent type still appears in the server.

// Fields the server forwards verbatim from another source and therefore never
// names itself: the account block comes from the SDK's accountInfo(), the
// backend block from `claude-say --backends`.
const PASSTHROUGH = new Set([
  'StatusReport.email', 'StatusReport.organization', 'StatusReport.subscriptionType',
  'StatusReport.apiKeySource',
  'SpeechBackend.label', 'SpeechBackend.available', 'SpeechBackend.voices'
])

const SERVER_TYPES = [
  'Stats', 'RateWindow', 'RateLimits', 'ModelUsage', 'ContextUsage',
  'GitState', 'SessionSummary', 'McpServer', 'SlashCommand', 'ModelInfo',
  'StatusReport', 'ToolEvent', 'PermissionRequest', 'SpeechBackend'
]

test('wire: every field the client declares is emitted by the server', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const types = readFileSync(join(here, '../app/src/lib/types.ts'), 'utf8')
  const server = readFileSync(join(here, '../ui/server.mjs'), 'utf8')

  const missing = []
  for (const name of SERVER_TYPES) {
    // The body of `export type Name = { ... }` up to the closing brace at the
    // start of a line, which also covers the nested objects in StatusReport.
    const body = types.match(new RegExp(`export type ${name} =[\\s\\S]*?\\n\\}`))?.[0]
    assert.ok(body, `type ${name} not found in types.ts`)
    for (const [, field] of body.matchAll(/^\s{2,}(\w+)\??:/gm)) {
      const key = `${name}.${field}`
      if (PASSTHROUGH.has(key)) continue
      if (!new RegExp(`\\b${field}\\b`).test(server)) missing.push(key)
    }
  }
  assert.deepEqual(missing, [], 'fields absent from ui/server.mjs')
})
