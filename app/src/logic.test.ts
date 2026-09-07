// Unit tests for the pure logic of the interface.
//
//   cd app && node --test src/logic.test.ts
//
// Deliberately narrow: what gets tested is what has broken before or can break
// silently, not what happens to be easy to test.
import { test } from 'node:test'
import assert from 'node:assert/strict'

// The settings store reads matchMedia and localStorage at module load. Stub
// them before the imports below pull the stores in, so the logic stays testable
// without a DOM. node supplies navigator.language itself.
Object.assign(globalThis, {
  matchMedia: () => ({ matches: false, addEventListener () {}, removeEventListener () {} }),
  localStorage: { getItem: () => null, setItem () {}, removeItem () {} }
})

const { useSession, emptyStats } = await import('./store/session.ts')
const { argText, shortArg, stepLabel } = await import('./lib/tools.ts')
const { timeSince, messagesFor, resolveLocale } = await import('./lib/i18n/index.ts')

const S = () => useSession.getState()
const set = (patch: Parameters<ReturnType<typeof useSession.getState>['set']>[0]) => S().set(patch)

function fresh () {
  S().clear()
  set({ stats: emptyStats(), speaking: false, turnRunning: false })
}

// ── State machine ────────────────────────────────────────────────────
// The visible state hangs off two things that end independently of each other:
// the turn and the playback. A one-shot poll after the turn ends lands
// sometimes before and sometimes after playback, which leaves the display stuck
// on "speaking" or jumping to "idle" too early.

test('state: nothing is running, so idle', () => {
  fresh()
  set({ state: 'speaking' })
  S().derive()
  assert.equal(S().state, 'idle')
})

test('state: the turn is over but there is still talking', () => {
  fresh()
  set({ turnRunning: false, speaking: true, state: 'thinking' })
  S().derive()
  assert.equal(S().state, 'speaking')
})

test('state: talking continues long after the turn finished', () => {
  // The case that jumps to idle while audio is still playing.
  fresh()
  set({ turnRunning: false, speaking: true, state: 'idle' })
  S().derive()
  assert.equal(S().state, 'speaking')
})

test('state: the last audio is through, now idle', () => {
  // And this is the case that stays stuck on speaking.
  fresh()
  set({ turnRunning: false, speaking: true, state: 'speaking' })
  S().derive()
  set({ speaking: false })
  S().derive()
  assert.equal(S().state, 'idle')
})

test('state: the turn runs without audio, so it is thinking', () => {
  fresh()
  set({ turnRunning: true, speaking: false, state: 'idle' })
  S().derive()
  assert.equal(S().state, 'thinking')
})

test('state: once text flows it stays on speaking', () => {
  fresh()
  set({ turnRunning: true, speaking: false, state: 'speaking' })
  S().derive()
  assert.equal(S().state, 'speaking')
})

for (const own of ['listening', 'transcribing', 'waiting', 'error', 'off'] as const) {
  test(`state: ${own} is not run over`, () => {
    // The user triggered these states themselves. An event from the stream must
    // not overwrite them.
    fresh()
    set({ state: own, turnRunning: false, speaking: false })
    S().derive()
    assert.equal(S().state, own)
  })
}

// ── Trail ────────────────────────────────────────────────────────────

test('trail: the newest row is on top', () => {
  fresh()
  S().addTrailRow({ id: '1', name: 'Bash', arg: 'first' })
  S().addTrailRow({ id: '2', name: 'Read', arg: 'second' })
  assert.deepEqual(S().trail.map(r => r.arg), ['second', 'first'])
})

test('trail: a result finds its row', () => {
  fresh()
  S().addTrailRow({ id: 'a', name: 'Bash', arg: 'ls' })
  S().setTrailResult('a', 'failed', true)
  assert.equal(S().trail[0].result, 'failed')
  assert.equal(S().trail[0].failed, true)
})

// ── Tool labels ──────────────────────────────────────────────────────

const m = messagesFor('de')

test('tool: verb plus the one field that matters', () => {
  assert.equal(stepLabel('Bash', { command: 'npm test' }, m), 'Führt aus npm test')
  assert.equal(stepLabel('Grep', { pattern: 'TODO' }, m), 'Durchsucht TODO')
})

test('tool: for files only the name, not the whole path', () => {
  assert.equal(stepLabel('Read', { file_path: '/a/b/server.mjs' }, m), 'Liest server.mjs')
})

test('tool: without an argument the verb keeps its ellipsis', () => {
  assert.equal(stepLabel('Bash', {}, m), 'Führt aus…')
})

test('tool: long arguments are cut, but not into nothing', () => {
  const long = stepLabel('Bash', { command: 'x'.repeat(200) }, m)
  assert.ok(long.length < 80, long.length + ' characters')
  assert.ok(long.endsWith('…'))
})

test('tool: an unknown tool keeps its name', () => {
  assert.equal(stepLabel('mcp__something__do', { a: 1 }, m), 'mcp__something__do…')
})

test('tool: newlines in a command do not break the row open', () => {
  assert.equal(shortArg('Bash', { command: 'a\n  b' }), 'a b')
})

test('tool: without a known field the whole object is shown', () => {
  assert.equal(argText('Unknown', { x: 1 }), '{"x":1}')
})

// ── Language ─────────────────────────────────────────────────────────

test('language: both catalogues answer for the same key', () => {
  assert.equal(messagesFor('de').state.idle, 'Bereit')
  assert.equal(messagesFor('en').state.idle, 'Ready')
})

test('language: auto follows the browser', () => {
  assert.ok(['de', 'en'].includes(resolveLocale('auto')))
  assert.equal(resolveLocale('de'), 'de')
  assert.equal(resolveLocale('en'), 'en')
})

test('time: just now, minutes, hours, days', () => {
  const now = Date.now()
  assert.equal(timeSince('de', now), 'gerade eben')
  assert.equal(timeSince('en', now), 'just now')
  assert.equal(timeSince('de', now - 6 * 60_000), 'vor 6 min')
  assert.equal(timeSince('de', now - 3 * 3600_000), 'vor 3 h')
  assert.equal(timeSince('en', now - 3 * 3600_000), '3 h ago')
  assert.equal(timeSince('de', now - 2 * 86_400_000), 'vor 2 Tagen')
})
