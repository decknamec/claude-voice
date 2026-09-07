// Local backend for the voice UI.
//
// One persistent Agent SDK session rather than `claude -p` per utterance. That
// is faster (process startup dominates the response time), and it is the only
// shape in which permissions work at all: in headless mode the CLI silently
// denies anything that needs approval instead of asking the client.
// `canUseTool` asks it.
//
// Binds to 127.0.0.1 only and additionally requires a startup token: the
// endpoint runs tools, and "localhost only" is no protection against a web
// page the user has open in the same browser.
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, randomBytes } from 'node:crypto'
import { query, listSessions } from '@anthropic-ai/claude-agent-sdk'
import { speakable } from './speakable.mjs'
import { readTranscript } from './transcript.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOME = homedir()
const PORT = Number(process.env.VOICE_UI_PORT || 7331)
const CWD = process.env.VOICE_UI_CWD || HOME
const TOKEN = process.env.VOICE_UI_TOKEN || randomBytes(24).toString('hex')
const ORIGIN = `http://127.0.0.1:${PORT}`

function loadConf () {
  const conf = {
    MODEL: join(HOME, '.claude/whisper-models/ggml-large-v3-turbo-q5_0.bin'),
    // Without this, "Stop Hook" comes back as "Stopthook". The CLI loop primes
    // Whisper the same way.
    VOCAB: 'Claude Code, Hook, Repo, Commit, Branch, Pull Request, Merge, Supabase, '
         + 'Vercel, TypeScript, Deploy, Terminal, Debugging, Refactoring, Prompt, '
         + 'Skill, Subagent, Transcript, MCP, Token, Kontextfenster.',
    WHISPER_LANG: 'de',
    VOICE: 'Anna',
    MAX_CHARS: '900',
    PERMISSION_MODE: 'default',
    TTS_BACKEND: 'auto',
    CLAUDE_MODEL: '',
    VOICE_SYSTEM_PROMPT: 'Deine Antwort wird per Sprachausgabe vorgelesen. Antworte auf Deutsch, in höchstens drei bis vier Sätzen, in ganzen Sätzen ohne Markdown, ohne Codeblöcke, ohne Aufzählungen. Lies keine Dateipfade oder URLs vor, beschreibe sie stattdessen. Wenn die Antwort zwingend Code braucht, sag nur, was du geändert hast und wo.'
  }
  for (const f of ['.claude/voice.conf', '.claude/voice-loop.conf']) {
    const p = join(HOME, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)=(.*)$/)
      if (!m) continue
      conf[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '')
    }
  }
  return conf
}

const run = (cmd, args, opts = {}) => new Promise(resolve => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts })
  let out = '', err = ''
  p.stdout.on('data', d => { out += d })
  p.stderr.on('data', d => { err += d })
  p.on('close', code => resolve({ code, out, err }))
  p.on('error', e => resolve({ code: -1, out: '', err: String(e) }))
})

// ── SSE: one channel carrying state, text and permission requests ────
const clients = new Set()
function push (event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) { try { res.write(frame) } catch {} }
}

// ── Speech output: synthesised sentence by sentence, played in the browser.
//    Server-side afplay would be simpler, but then the microphone hears its
//    own voice and echo cancellation does not apply, which rules out
//    hands-free mode. ──
const speech = { queue: [], busy: false, proc: null, seq: 0 }
const audio = new Map()   // id -> { path, mime }

function enqueueSpeech (text, conf) {
  const t = speakable(text)
  if (t) { speech.queue.push({ text: t, conf }); drainSpeech() }
}

async function drainSpeech () {
  if (speech.busy || !speech.queue.length) return
  speech.busy = true
  const { text, conf } = speech.queue.shift()
  const id = `a${++speech.seq}`
  // The container follows the backend: piper and say produce WAV, edge and
  // ElevenLabs produce mp3. The extension decides what the browser receives.
  const wav = conf.TTS_BACKEND === 'piper' || conf.TTS_BACKEND === 'say'
  const dir = await mkdtemp(join(tmpdir(), 'voicetts-'))
  const path = join(dir, wav ? 'a.wav' : 'a.mp3')
  const args = []
  if (conf.TTS_BACKEND && conf.TTS_BACKEND !== 'auto') args.push('--tts', conf.TTS_BACKEND)
  args.push('--out', path, text)
  speech.proc = spawn(join(HOME, '.claude/bin/claude-say'), args, { stdio: 'ignore' })
  const done = async () => {
    speech.proc = null
    if (existsSync(path)) {
      // The extension differs when `auto` picked a different backend.
      const mime = readFileSync(path, { encoding: null }).slice(0, 4).toString('binary').startsWith('RIFF')
        ? 'audio/wav' : 'audio/mpeg'
      audio.set(id, { path, dir, mime })
      push('audio', { id, mime })
    } else {
      await rm(dir, { recursive: true, force: true })
    }
    speech.busy = false
    drainSpeech()
  }
  speech.proc.on('close', done)
  speech.proc.on('error', done)
}

async function stopSpeech () {
  speech.queue.length = 0
  if (speech.proc) { try { speech.proc.kill() } catch {} }
  for (const [id, a] of audio) { audio.delete(id); await rm(a.dir, { recursive: true, force: true }) }
  push('audio-stop', {})
}

// ── Whisper: load the model once rather than per utterance (~0.3 s a call). ──
// `owned` records whether we started the server, and only then do we stop it.
let whisper = { proc: null, port: PORT + 500, ready: false, owned: false }

const whisperAlive = async (ms = 500) => {
  try {
    const r = await fetch(`http://127.0.0.1:${whisper.port}/`, { signal: AbortSignal.timeout(ms) })
    return !!r.status
  } catch { return false }
}

async function startWhisper (conf) {
  if (whisper.ready || whisper.proc) return whisper.ready
  // If one already listens on the port - the remains of a hard-killed run, for
  // instance - use it. whisper-server binds with SO_REUSEPORT: a second one
  // would get the port without complaint, the kernel would alternate requests
  // between them, and each instance holds another half gigabyte of model in
  // memory. That is how orphans accumulate.
  if (await whisperAlive()) { whisper.ready = true; whisper.owned = false; return true }
  if (!existsSync(conf.MODEL)) return false
  whisper.proc = spawn('whisper-server', [
    '-m', conf.MODEL, '--host', '127.0.0.1', '--port', String(whisper.port),
    '-t', '8', '--convert'   // accepts webm directly, which saves the ffmpeg step
  ], { stdio: 'ignore' })
  whisper.owned = true
  whisper.proc.on('close', () => { whisper.proc = null; whisper.ready = false; whisper.owned = false })
  for (let i = 0; i < 60; i++) {
    if (await whisperAlive()) { whisper.ready = true; return true }
    await new Promise(r => setTimeout(r, 250))
  }
  return false
}

// Only clean up our own child, never a foreign one on the same port.
function stopWhisper () {
  if (whisper.proc && whisper.owned) { try { whisper.proc.kill() } catch {} }
  whisper.proc = null; whisper.ready = false; whisper.owned = false
}

const JUNK = /^(\.|\[blank_audio\]|\(musik\)|untertitel.*|vielen dank[.!]?|.*amara\.org.*)$/i

class VoiceError extends Error {
  constructor (code, message) { super(message); this.code = code }
}

async function transcribe (buf, conf) {
  if (!existsSync(conf.MODEL)) {
    throw new VoiceError('no_model', `Whisper-Modell fehlt: ${conf.MODEL}`)
  }
  if (await startWhisper(conf)) {
    const form = new FormData()
    form.append('file', new Blob([buf]), 'in.webm')
    form.append('language', WHISPER_LANG[lang] || conf.WHISPER_LANG)
    form.append('response_format', 'text')
    const vok = vocabulary ?? conf.VOCAB
    if (vok) form.append('prompt', vok)
    const r = await fetch(`http://127.0.0.1:${whisper.port}/inference`, { method: 'POST', body: form })
    if (r.ok) {
      const text = (await r.text()).replace(/\n/g, ' ').trim()
      return JUNK.test(text) ? '' : text
    }
  }
  // Fallback via ffmpeg + whisper-cli for when no server is running.
  const dir = await mkdtemp(join(tmpdir(), 'voiceui-'))
  try {
    const webm = join(dir, 'in.webm'), wav = join(dir, 'in.wav')
    await writeFile(webm, buf)
    const ff = await run('ffmpeg', ['-v', 'error', '-i', webm, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', wav])
    if (ff.code !== 0) throw new VoiceError('ffmpeg_failed', ff.err.trim().split('\n').pop() || 'unbekannt')
    const w = await run('whisper-cli', ['-m', conf.MODEL, '-l', WHISPER_LANG[lang] || conf.WHISPER_LANG,
      '-nt', '-np', '-t', '8',
      ...((vocabulary ?? conf.VOCAB) ? ['--prompt', vocabulary ?? conf.VOCAB, '--carry-initial-prompt'] : []),
      '-f', wav])
    if (w.code !== 0) throw new VoiceError('whisper_failed', w.err.trim().split('\n').pop() || 'unbekannt')
    const text = w.out.replace(/\n/g, ' ').trim()
    return JUNK.test(text) ? '' : text
  } finally { await rm(dir, { recursive: true, force: true }) }
}

// The branch shows in the status bar. Cheap enough to re-read after every
// turn: one file, no process.
function gitBranch () {
  try {
    let dir = CWD
    for (let i = 0; i < 12; i++) {
      const head = join(dir, '.git', 'HEAD')
      if (existsSync(head)) {
        const t = readFileSync(head, 'utf8').trim()
        return t.startsWith('ref: ') ? t.slice(t.lastIndexOf('/') + 1) : t.slice(0, 7)
      }
      const oben = dirname(dir)
      if (oben === dir) break
      dir = oben
    }
  } catch {}
  return ''
}

// ── Earlier conversations ────────────────────────────────────────────
// resume restores the full memory of a session, but the window stays empty and
// the user cannot see what was discussed. So pull the history out of the
// transcript. The parsing itself lives in transcript.mjs so that it is
// testable without a running server.
const sessionTranscript = id => readTranscript(id, { home: HOME, cwd: CWD })

// ── The persistent session ───────────────────────────────────────────
let S = null   // { q, send, pending, sessionId }
let permMode = null   // chosen by the user, overrides the config
let modelOverride = null
let lang = 'de'
let effort = null   // null = whatever the model defaults to
let vocabulary = null       // null = the default from the config
let style = 'standard'      // how Claude answers
let styleText = ''          // free-form style, used when style === 'custom'

// Response styles. The text is appended to the system prompt and therefore
// applies to the whole session, so switching restarts it; resume keeps the
// thread. Keyed by language like PROMPTS above: a German style instruction
// next to an English answer prompt bleeds into the answer language.
const STYLES = {
  de: {
    standard: '',
    concise: 'Fasse dich so kurz wie moeglich: ein bis zwei Saetze, keine Einleitung, keine Zusammenfassung am Ende.',
    thorough: 'Antworte ausfuehrlicher als noetig waere: nenne den Grund, eine Alternative und woran es scheitern koennte.',
    explanatory: 'Erklaere so, dass es jemand ohne Vorwissen versteht. Fachbegriffe beim ersten Auftauchen in einem Halbsatz erklaeren.',
    factual: 'Antworte nuechtern und ohne Floskeln. Kein Lob, keine Einleitungssaetze, keine Rueckfragen aus Hoeflichkeit.',
    casual: 'Antworte locker und gespraechig, so wie man es einem Kollegen im Nebenzimmer zurufen wuerde.',
    socratic: 'Gib die Antwort nicht sofort. Stelle zuerst eine Rueckfrage, die den Kern trifft, und leite dann hin.'
  },
  en: {
    standard: '',
    concise: 'Keep it as short as possible: one or two sentences, no preamble, no summary at the end.',
    thorough: 'Answer more fully than strictly needed: give the reason, one alternative, and what could go wrong with it.',
    explanatory: 'Explain so that someone without prior knowledge follows. Gloss a technical term in half a sentence the first time it appears.',
    factual: 'Answer plainly and without filler. No praise, no opening pleasantries, no questions asked out of politeness.',
    casual: 'Answer loosely and conversationally, the way you would call something over to a colleague next door.',
    socratic: 'Do not give the answer straight away. Ask one question that gets at the heart of it first, then lead there.'
  }
}
// `auto` answers in whatever the user just spoke, so its prompt is English;
// the style has to match that rather than the last utterance.
const stylePrompt = () => style === 'custom'
  ? styleText.slice(0, 800)
  : (lang === 'de' ? STYLES.de : STYLES.en)[style] || ''

// What Claude Code shows in the terminal status line: duration, tokens, cost,
// how full the context window is. Without it there is no telling whether a
// session is about to hit its limit.
const emptyStats = () => ({
  turns: 0, inTok: 0, outTok: 0, cacheRead: 0, cacheWrite: 0,
  costUsd: 0, lastMs: 0, apiMs: 0, startedAt: Date.now(), ctx: null, branch: '',
  limits: null, models: {}
})
let stats = emptyStats()

// The plan limits cost a control call. Once a minute is enough: the windows
// move in percentage points, not in seconds.
let limitCache = { at: 0, value: null }
async function planLimits (fresh) {
  if (!S) return null
  if (!fresh && Date.now() - limitCache.at < 60000) return limitCache.value
  try {
    const u = await S.q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })
    const f = u?.rate_limits || {}
    const win = x => x && x.utilization != null
      ? { percent: x.utilization, resetsAt: x.resets_at || null } : null
    limitCache = { at: Date.now(), value: u?.rate_limits_available
      ? { plan: u.subscription_type || null, fiveHour: win(f.five_hour), sevenDay: win(f.seven_day),
          opus: win(f.seven_day_opus), sonnet: win(f.seven_day_sonnet) }
      : null }
  } catch { limitCache = { at: Date.now(), value: null } }
  return limitCache.value
}

function addUsage (u) {
  if (!u) return
  stats.inTok     += u.input_tokens || 0
  stats.outTok    += u.output_tokens || 0
  stats.cacheRead += u.cache_read_input_tokens || 0
  stats.cacheWrite += u.cache_creation_input_tokens || 0
}

// The system prompt is fixed per session, so switching language needs a new
// session. German keeps using the text from the config.
const PROMPTS = {
  en: 'Your reply will be read aloud. Answer in English, in at most three or four sentences, in full sentences without markdown, code blocks or bullet lists. Do not read out file paths or URLs - describe them instead. If the answer truly needs code, just say what you changed and where.',
  auto: 'Your reply will be read aloud. Answer in the same language the user just spoke, in at most three or four sentences, in full sentences without markdown, code blocks or bullet lists. Do not read out file paths or URLs - describe them instead. If the answer truly needs code, just say what you changed and where.'
}
const WHISPER_LANG = { de: 'de', en: 'en', auto: 'auto' }

function startSession (conf, resumeId) {
  const inbox = []
  let wake = null
  async function* input () {
    while (true) {
      if (!inbox.length) await new Promise(r => { wake = r })
      yield inbox.shift()
    }
  }

  const pending = new Map()   // permission requests the UI still has to answer
  // Standing permissions for this session. Without them every single Bash call
  // asks again, and out of exasperation the user switches to "never ask" -
  // exactly the opposite of what they want.
  const standing = { tools: new Set(), exact: new Set() }
  // The key for "exactly this call": tool plus the one field that matters. A
  // full object comparison would almost never match.
  const exactKey = (name, input) => {
    const feld = { Bash:'command', Read:'file_path', Write:'file_path', Edit:'file_path',
                   Glob:'pattern', Grep:'pattern', WebFetch:'url' }[name]
    return name + '\u0000' + (feld && input?.[feld] != null ? String(input[feld]) : JSON.stringify(input ?? {}))
  }
  const subagents = new Set()  // running subagent calls, for the overview

  const q = query({
    prompt: input(),
    options: {
      cwd: CWD,
      ...(resumeId ? { resume: resumeId } : {}),
      permissionMode: permMode || conf.PERMISSION_MODE,
      // Allows switching to bypassPermissions on the running session. Without
      // it the CLI refuses and the session has to restart. This does not
      // activate the mode, it only makes it selectable.
      allowDangerouslySkipPermissions: true,
      ...(effort ? { effort } : {}),
      includePartialMessages: true,
      ...((modelOverride || conf.CLAUDE_MODEL) ? { model: modelOverride || conf.CLAUDE_MODEL } : {}),
      systemPrompt: { type: 'preset', preset: 'claude_code',
                      append: [PROMPTS[lang] || conf.VOICE_SYSTEM_PROMPT, stylePrompt()]
                                .filter(Boolean).join(' ') },
      // The whole permission mechanism hangs off this: the promise stays open
      // until the user has decided in the UI.
      canUseTool: (toolName, toolInput, { signal }) => new Promise(resolve => {
        if (standing.tools.has(toolName) || standing.exact.has(exactKey(toolName, toolInput))) {
          push('tool-auto', { tool: toolName })
          return resolve({ behavior: 'allow' })
        }
        const id = randomUUID()
        pending.set(id, resolve)
        push('permission', { id, tool: toolName, input: toolInput })
        signal?.addEventListener('abort', () => {
          if (pending.delete(id)) resolve({ behavior: 'deny', message: 'Abgebrochen.' })
        }, { once: true })
      })
    }
  })

  S = {
    q, pending, subagents, standing, exactKey,
    send (text) {
      inbox.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null })
      if (wake) { wake(); wake = null }
    }
  }

  ;(async () => {
    let spoken = 0, buf = ''
    try {
      for await (const msg of q) {
        if (msg.type === 'stream_event') {
          const ev = msg.event
          const d = ev?.delta
          // The tool name is known before the arguments have streamed in, so
          // what is being worked on is visible immediately.
          if (ev?.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
            push('step', { id: ev.content_block.id, name: ev.content_block.name })
          }
          // Long thinking without a tool call otherwise looks like a hang.
          if (d?.type === 'thinking_delta' && d.thinking) push('think', { text: d.thinking })
          if (d?.type === 'text_delta' && d.text) {
            buf += d.text
            push('delta', { text: d.text })
            // As soon as a sentence is complete it goes straight to speech.
            const cut = buf.lastIndexOf('. ') + 1 || buf.lastIndexOf('! ') + 1 || buf.lastIndexOf('? ') + 1
            if (cut > spoken) { enqueueSpeech(buf.slice(spoken, cut), conf); spoken = cut }
          }
        } else if (msg.type === 'assistant') {
          // Subagents do not talk to the user: their text belongs in the
          // overview, not in the conversation.
          const parent = msg.parent_tool_use_id || null
          const blocks = msg.message?.content || []
          const text = blocks.filter(b => b.type === 'text').map(b => b.text).join(' ')
          if (text && !parent) push('message', { role: 'assistant', text })
          if (text && parent) push('subagent', { phase: 'text', id: parent, text: text.slice(0, 300) })
          // Surface tool calls, otherwise a long answer is a black box in
          // which nothing appears to happen for minutes.
          for (const b of blocks) {
            if (b.type !== 'tool_use') continue
            push('tool', { phase: 'use', id: b.id, name: b.name, input: b.input, parent })
            // Depending on the version the tool is called Agent or Task.
            if (b.name === 'Agent' || b.name === 'Task') {
              subagents.add(b.id)
              push('subagent', { phase: 'start', id: b.id,
                                 kind: b.input?.subagent_type || 'general-purpose',
                                 desc: b.input?.description || '' })
            }
          }
        } else if (msg.type === 'user') {
          const parent = msg.parent_tool_use_id || null
          for (const b of msg.message?.content || []) {
            if (b.type !== 'tool_result') continue
            const c = b.content
            const text = typeof c === 'string' ? c
              : Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text).join(' ') : ''
            push('tool', { phase: 'result', id: b.tool_use_id, ok: !b.is_error, text: text.slice(0, 400), parent })
            if (subagents.has(b.tool_use_id)) {
              subagents.delete(b.tool_use_id)
              push('subagent', { phase: 'done', id: b.tool_use_id, ok: !b.is_error })
            }
          }
        } else if (msg.type === 'result') {
          if (buf.length > spoken) enqueueSpeech(buf.slice(spoken), conf)
          buf = ''; spoken = 0
          stats.turns += 1
          stats.lastMs = msg.duration_ms || 0
          stats.apiMs += msg.duration_api_ms || 0
          stats.costUsd += msg.total_cost_usd || 0
          // Per-model breakdown: with mixed turns there is otherwise no
          // telling where the money goes.
          for (const [name, u] of Object.entries(msg.modelUsage || {})) {
            const m = stats.models[name] || (stats.models[name] = { in: 0, out: 0, costUsd: 0 })
            m.in += (u.inputTokens || 0) + (u.cacheReadInputTokens || 0)
            m.out += u.outputTokens || 0
            m.costUsd += u.costUSD || 0
          }
          addUsage(msg.usage)
          stats.branch = gitBranch()
          push('done', { subtype: msg.subtype, ms: msg.duration_ms })
          push('stats', stats)
          // The fill level costs a control call, so ask after the turn and in
          // the cheap variant.
          planLimits().then(l => { stats.limits = l; push('stats', stats) }).catch(() => {})
          q.getContextUsage({ detail: 'summary' })
            .then(c => {
              stats.ctx = { tokens: c.totalTokens, max: c.maxTokens || c.rawMaxTokens,
                            percent: c.percentage, model: c.model }
              push('stats', stats)
            })
            .catch(() => {})
        } else if (msg.type === 'system') {
          if (msg.session_id) S.sessionId = msg.session_id
          if (msg.model) S.model = msg.model
        }
      }
    } catch (e) {
      push('error', { message: String(e?.message || e) })
    }
  })()

  return S
}

// Restart of the same session. The system prompt is fixed at startup, so any
// change to it needs a new session; resume keeps the thread.
async function restartSession (conf) {
  if (!S) return false
  const alte = S.sessionId
  await stopSpeech()
  try { S.q.close() } catch {}
  S = null
  startSession(conf, alte)
  return true
}

// ── Git ──────────────────────────────────────────────────────────────
// No shell: git gets its arguments as an array, so a branch name containing a
// semicolon cannot do any damage.
function git (args, ms = 20000) {
  return new Promise(resolve => {
    const proc = spawn('git', args, { cwd: CWD, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    const stop = setTimeout(() => { proc.kill('SIGKILL'); resolve({ code: 124, out, err: 'timed out' }) }, ms)
    proc.stdout.on('data', d => { out += d })
    proc.stderr.on('data', d => { err += d })
    proc.on('close', code => { clearTimeout(stop); resolve({ code, out: out.trim(), err: err.trim() }) })
    proc.on('error', e => { clearTimeout(stop); resolve({ code: 127, out: '', err: String(e.message) }) })
  })
}

async function gitState () {
  const branch = gitBranch()
  if (!branch) return { repo: false }
  const [branches, short, oben] = await Promise.all([
    git(['for-each-ref', '--format=%(refname:short)', '--sort=-committerdate', 'refs/heads/']),
    git(['status', '--porcelain']),
    git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])
  ])
  const [ahead, behind] = (oben.code === 0 ? oben.out.split(/\s+/) : ['0', '0']).map(Number)
  return {
    repo: true, branch,
    branches: branches.code === 0 ? branches.out.split('\n').filter(Boolean).slice(0, 40) : [],
    changed: short.code === 0 && short.out ? short.out.split('\n').length : 0,
    ahead: ahead || 0, behind: behind || 0,
    hasUpstream: oben.code === 0
  }
}

const BRANCH_NAME = /^[A-Za-z0-9._\/-]{1,120}$/

// ── HTTP ─────────────────────────────────────────────────────────────
const body = req => new Promise((resolve, reject) => {
  const chunks = []; let n = 0
  req.on('data', c => {
    n += c.length
    if (n > 40 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return }
    chunks.push(c)
  })
  req.on('end', () => resolve(Buffer.concat(chunks)))
  req.on('error', reject)
})

const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

// Without this any web page the user has open can call these endpoints: a
// text/plain POST triggers no CORS preflight, and "localhost only" is no
// obstacle to the user's own browser.
function authorized (req, url) {
  const origin = req.headers.origin
  if (origin && origin !== ORIGIN) return false
  const given = req.headers['x-voice-token'] || url.searchParams.get('token')
  return typeof given === 'string' && given === TOKEN
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, ORIGIN)
    const conf = loadConf()

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      // The interface is built, not committed: half a megabyte of bundle does
      // not belong in version control. claude-voice-ui builds it at startup
      // when it is missing or out of date.
      const gebaut = join(HERE, '..', 'app', 'dist', 'index.html')
      if (!existsSync(gebaut)) {
        res.writeHead(503, { 'content-type': 'text/html; charset=utf-8' })
        return res.end('<!doctype html><meta charset="utf-8">'
          + '<style>body{font:14px/1.6 system-ui;padding:30px;background:#0d0c0f;color:#f2f0ee}'
          + 'code{color:#8b8bf0}</style>'
          + '<h3>The interface has not been built yet.</h3>'
          + '<p>Einmal <code>cd app &amp;&amp; npm install &amp;&amp; npm run build</code>, '
          + 'or restart <code>claude-voice-ui</code>, which builds it itself.</p>')
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(await readFile(gebaut))
    }

    if (url.pathname.startsWith('/api/') && !authorized(req, url)) {
      return json(res, 403, { error: 'invalid or missing token' })
    }

    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      })
      res.write('retry: 2000\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/audio/')) {
      const id = url.pathname.slice('/api/audio/'.length)
      const a = audio.get(id)
      if (!a || !existsSync(a.path)) return json(res, 404, { error: 'audio expired' })
      audio.delete(id)
      const buf = readFileSync(a.path)
      await rm(a.dir, { recursive: true, force: true })
      res.writeHead(200, { 'content-type': a.mime, 'content-length': buf.length })
      return res.end(buf)
    }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return json(res, 200, {
        tts: conf.TTS_BACKEND,
        voice: conf.VOICE,
        model: S?.model || conf.CLAUDE_MODEL || null,
        permissionMode: permMode || conf.PERMISSION_MODE,
        session: S?.sessionId || null,
        cwd: CWD,
        lang,
        modelOverride,
        effort
      })
    }

    if (req.method === 'GET' && url.pathname === '/api/backends') {
      const r = await run(join(HOME, '.claude/bin/claude-say'), ['--backends-json'])
      try { return json(res, 200, JSON.parse(r.out)) }
      catch { return json(res, 500, { error: 'backends unreadable' }) }
    }

    if (req.method === 'POST' && url.pathname === '/api/transcribe') {
      const t0 = Date.now()
      const said = await transcribe(await body(req), conf)
      return json(res, 200, { said, ms: Date.now() - t0 })
    }

    if (req.method === 'POST' && url.pathname === '/api/preview') {
      try {
        const said = await transcribe(await body(req), conf)
        return json(res, 200, { said })
      } catch { return json(res, 200, { said: '' }) }   // a preview must never disrupt
    }

    // Speech the interface asks for, not speech from an answer. A permission
    // request stops a hands-free session dead, and without a spoken question
    // there is nothing to hear that it is waiting.
    if (req.method === 'POST' && url.pathname === '/api/speak') {
      const { text } = JSON.parse((await body(req)).toString('utf8'))
      if (!text?.trim()) return json(res, 400, { error: 'empty text' })
      enqueueSpeech(String(text).slice(0, 200), conf)
      return json(res, 200, { ok: true })
    }

    if (req.method === 'POST' && url.pathname === '/api/say') {
      const { text } = JSON.parse((await body(req)).toString('utf8'))
      if (!text?.trim()) return json(res, 400, { error: 'empty text' })
      if (!S) startSession(conf)
      S.send(text)
      return json(res, 200, { ok: true })
    }

    if (req.method === 'GET' && url.pathname === '/api/sessions') {
      const list = await listSessions({ dir: CWD, limit: 30 })
      return json(res, 200, {
        sessions: list.map(x => ({
          id: x.sessionId,
          title: x.customTitle || x.summary || '(ohne Titel)',
          lastModified: x.lastModified,
          current: x.sessionId === S?.sessionId
        }))
      })
    }

    if (req.method === 'POST' && url.pathname === '/api/resume') {
      const { id } = JSON.parse((await body(req)).toString('utf8'))
      if (!id) return json(res, 400, { error: 'missing session id' })
      await stopSpeech()
      try { S?.q.close() } catch {}
      S = null
      stats = emptyStats()
      startSession(conf, id)
      return json(res, 200, { ok: true, resumed: id, transcript: sessionTranscript(id) })
    }

    if (req.method === 'GET' && url.pathname === '/api/transcript') {
      const id = url.searchParams.get('id')
      if (!id) return json(res, 400, { error: 'missing session id' })
      const transcript = sessionTranscript(id)
      if (!transcript) return json(res, 404, { error: 'no transcript found for this session' })
      return json(res, 200, { transcript })
    }

    // What /status shows in the terminal, gathered in one place.
    if (req.method === 'GET' && url.pathname === '/api/git') {
      return json(res, 200, await gitState())
    }

    if (req.method === 'POST' && url.pathname === '/api/git') {
      const { action, name } = JSON.parse((await body(req)).toString('utf8'))
      if (!gitBranch()) return json(res, 409, { error: 'not a git repository' })
      let r
      if (action === 'switch' || action === 'create') {
        if (!BRANCH_NAME.test(String(name || ''))) return json(res, 400, { error: 'invalid branch name' })
        r = await git(action === 'create' ? ['switch', '-c', name] : ['switch', name])
      } else if (action === 'fetch') {
        r = await git(['fetch', '--all', '--prune'], 60000)
      } else if (action === 'pull') {
        // --ff-only: a merge conflict in the middle of a voice session would
        // be impossible to operate. Better to fail cleanly.
        r = await git(['pull', '--ff-only'], 60000)
      } else if (action === 'push') {
        r = await git(['push'], 60000)
      } else {
        return json(res, 400, { error: 'unknown action' })
      }
      const state = await gitState()
      if (r.code !== 0) return json(res, 200, { ok: false, message: r.err || r.out || 'fehlgeschlagen', state })
      return json(res, 200, { ok: true, message: r.out || r.err || '', state })
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      let sdk = ''
      try {
        sdk = JSON.parse(readFileSync(join(HERE, 'node_modules', '@anthropic-ai',
          'claude-agent-sdk', 'package.json'), 'utf8')).version
      } catch {}
      return json(res, 200, {
        work: { cwd: CWD, branch: gitBranch() },
        session: {
          id: S?.sessionId || null,
          running: !!S,
          model: S?.model || modelOverride || conf.CLAUDE_MODEL || null,
          depth: effort || null,
          tools: permMode || conf.PERMISSION_MODE,
          language: lang,
          style,
          runtimeMs: Date.now() - stats.startedAt
        },
        usage: {
          turns: stats.turns, in: stats.inTok, out: stats.outTok,
          cache: stats.cacheRead, costUsd: stats.costUsd,
          ctx: stats.ctx, models: stats.models
        },
        speechRecognition: {
          model: conf.MODEL,
          present: existsSync(conf.MODEL),
          server: whisper.ready ? (whisper.owned ? 'own' : 'foreign') : 'off',
          port: whisper.port
        },
        speechOutput: { backend: conf.TTS_BACKEND, voice: conf.VOICE },
        runtime: { node: process.version, sdk, pid: process.pid, port: PORT },
        // Account and plan limits come from the running session. The usage
        // query is explicitly marked unstable in the SDK, so it simply drops
        // out on error.
        account: S ? await S.q.accountInfo().catch(() => null) : null,
        limits: S ? await S.q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET(
          { skipBehaviors: true }).catch(() => null) : null
      })
    }

    if (req.method === 'GET' && url.pathname === '/api/stats') {
      stats.branch = gitBranch()
      return json(res, 200, stats)
    }

    // The full breakdown costs token-counting calls, so only on request.
    if (req.method === 'GET' && url.pathname === '/api/context') {
      if (!S) return json(res, 409, { error: 'no running session' })
      try {
        const c = await S.q.getContextUsage({ detail: url.searchParams.get('full') ? 'full' : 'summary' })
        return json(res, 200, {
          tokens: c.totalTokens, max: c.maxTokens || c.rawMaxTokens,
          percent: c.percentage, model: c.model,
          categories: (c.categories || []).filter(k => k.tokens > 0)
            .map(k => ({ name: k.name, tokens: k.tokens }))
        })
      } catch (e) { return json(res, 500, { error: String(e?.message || e) }) }
    }

    if (req.method === 'GET' && url.pathname === '/api/mcp') {
      if (!S) return json(res, 409, { error: 'no running session' })
      try {
        const list = await S.q.mcpServerStatus()
        return json(res, 200, {
          servers: list.map(m => ({
            name: m.name, status: m.status, scope: m.scope || '',
            version: m.serverInfo?.version || '',
            error: m.error || '',
            tools: (m.tools || []).map(t => t.name)
          }))
        })
      } catch (e) { return json(res, 500, { error: String(e?.message || e) }) }
    }

    if (req.method === 'GET' && url.pathname === '/api/models') {
      if (!S) return json(res, 409, { error: 'no running session' })
      try {
        const list = await S.q.supportedModels()
        return json(res, 200, {
          models: list.map(m => ({
            id: m.value, name: m.displayName, description: m.description || '',
            depths: m.supportsEffort ? (m.supportedEffortLevels || []) : []
          }))
        })
      } catch (e) { return json(res, 500, { error: String(e?.message || e) }) }
    }

    // Vocabulary that Whisper is primed with.
    if (req.method === 'GET' && url.pathname === '/api/vocab') {
      return json(res, 200, { vocabulary: vocabulary ?? conf.VOCAB })
    }
    if (req.method === 'POST' && url.pathname === '/api/vocab') {
      const { text } = JSON.parse((await body(req)).toString('utf8'))
      vocabulary = String(text ?? '').slice(0, 1200)
      return json(res, 200, { ok: true, vocabulary })
    }

    if (req.method === 'GET' && url.pathname === '/api/commands') {
      if (!S) return json(res, 409, { error: 'no running session' })
      try {
        const list = await S.q.supportedCommands()
        return json(res, 200, {
          commands: list.map(c => ({ name: c.name, description: c.description,
                                     hint: c.argumentHint || '' }))
        })
      } catch (e) { return json(res, 500, { error: String(e?.message || e) }) }
    }

    if (req.method === 'GET' && url.pathname === '/api/agents') {
      if (!S) return json(res, 409, { error: 'no running session' })
      try { return json(res, 200, { agents: await S.q.supportedAgents() }) }
      catch (e) { return json(res, 500, { error: String(e?.message || e) }) }
    }

    if (req.method === 'POST' && url.pathname === '/api/model') {
      const { model } = JSON.parse((await body(req)).toString('utf8'))
      modelOverride = model || null
      if (S) { try { await S.q.setModel(modelOverride || undefined) } catch (e) {
        return json(res, 500, { error: String(e?.message || e) }) } }
      return json(res, 200, { ok: true, model: modelOverride, applied: !!S })
    }

    if (req.method === 'POST' && url.pathname === '/api/style') {
      const { style: st, text } = JSON.parse((await body(req)).toString('utf8'))
      if (st !== 'custom' && !(st in STYLES.de)) return json(res, 400, { error: 'unknown response style' })
      style = st
      if (st === 'custom') styleText = String(text || '')
      const restarted = await restartSession(conf)
      return json(res, 200, { ok: true, style, restarted })
    }

    if (req.method === 'GET' && url.pathname === '/api/style') {
      return json(res, 200, { style, text: styleText, styles: Object.keys(STYLES.de) })
    }

    if (req.method === 'POST' && url.pathname === '/api/effort') {
      const { effort: e } = JSON.parse((await body(req)).toString('utf8'))
      const allowed = [null, '', 'low', 'medium', 'high', 'xhigh', 'max']
      if (!allowed.includes(e)) return json(res, 400, { error: 'unknown thinking depth' })
      effort = e || null
      // Thinking depth is set at session start; there is no setEffort.
      let restarted = false
      if (S) { await stopSpeech(); try { S.q.close() } catch {}; S = null; restarted = true }
      return json(res, 200, { ok: true, effort, restarted })
    }

    if (req.method === 'POST' && url.pathname === '/api/language') {
      const { language } = JSON.parse((await body(req)).toString('utf8'))
      if (!WHISPER_LANG[language]) return json(res, 400, { error: 'unknown language' })
      lang = language
      // Recognition switches immediately; the answer-language prompt hangs off
      // the session, so that has to restart. resume keeps the thread, which is
      // what stops a language switch from discarding the conversation.
      const restarted = await restartSession(conf)
      return json(res, 200, { ok: true, lang, restarted })
    }

    if (req.method === 'POST' && url.pathname === '/api/permission-mode') {
      const { mode } = JSON.parse((await body(req)).toString('utf8'))
      const allowed = ['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']
      if (!allowed.includes(mode)) return json(res, 400, { error: 'unknown permission mode' })
      permMode = mode
      let restarted = false
      // With a session running it applies immediately, otherwise at next start.
      if (S) {
        try { await S.q.setPermissionMode(mode) }
        catch {
          // bypassPermissions cannot be set on a running session; the CLI has
          // to restart for it. With resume the new session keeps the entire
          // thread so far.
          const alte = S.sessionId
          await stopSpeech()
          try { S.q.close() } catch {}
          S = null
          startSession(conf, alte)
          restarted = true
        }
      }
      push('state', { state: 'idle' })
      return json(res, 200, { ok: true, mode, applied: !!S, restarted })
    }

    if (req.method === 'POST' && url.pathname === '/api/permission') {
      const { id, behavior, message, scope, tool, input } = JSON.parse((await body(req)).toString('utf8'))
      const resolve = S?.pending.get(id)
      if (!resolve) return json(res, 404, { error: 'unknown request' })
      S.pending.delete(id)
      // The scope applies to this session only. Writing something standing to
      // disk would be a decision of longer reach than a click in a voice window
      // should carry.
      if (behavior === 'allow' && scope === 'tool' && tool) S.standing.tools.add(tool)
      if (behavior === 'allow' && scope === 'exact' && tool) S.standing.exact.add(S.exactKey(tool, input))
      resolve(behavior === 'allow'
        ? { behavior: 'allow' }
        : { behavior: 'deny', message: message || 'Vom Nutzer abgelehnt.' })
      return json(res, 200, { ok: true,
        rules: { tools: [...S.standing.tools], exact: S.standing.exact.size } })
    }

    // Inspect and withdraw permission rules.
    if (req.method === 'GET' && url.pathname === '/api/permission-rules') {
      if (!S) return json(res, 200, { tools: [], exact: [] })
      return json(res, 200, {
        tools: [...S.standing.tools],
        exact: [...S.standing.exact].map(k => k.split('\u0000'))
      })
    }
    if (req.method === 'POST' && url.pathname === '/api/permission-rules') {
      if (S) { S.standing.tools.clear(); S.standing.exact.clear() }
      return json(res, 200, { ok: true })
    }

    if (req.method === 'POST' && url.pathname === '/api/interrupt') {
      stopSpeech()
      // Resolve open permissions as well, or the turn hangs on the promise.
      for (const [id, resolve] of S?.pending ?? []) {
        S.pending.delete(id)
        resolve({ behavior: 'deny', message: 'Abgebrochen.' })
      }
      try { await S?.q.interrupt() } catch {}
      push('state', { state: 'idle' })
      return json(res, 200, { ok: true })
    }

    if (req.method === 'POST' && url.pathname === '/api/reset') {
      stopSpeech()
      try { S?.q.close() } catch {}
      S = null
      stats = emptyStats()
      push('stats', stats)
      return json(res, 200, { ok: true })
    }

    if (req.method === 'POST' && url.pathname === '/api/shutdown') {
      json(res, 200, { ok: true })
      stopSpeech()
      try { S?.q.close() } catch {}
      stopWhisper()
      setTimeout(() => { server.close(); process.exit(0) }, 150)
      return
    }

    res.writeHead(404); res.end('not found')
  } catch (e) {
    json(res, 500, { code: e.code || 'server', error: String(e.message || e) })
  }
})

// Without the signal handlers whisper-server survives every Ctrl-C and every
// kill and holds on to the port and the model memory, which is what produces
// orphans. When the parent dies hard - the desktop shell killed, the terminal
// closed - no signal arrives and this server lives on as an orphan, together
// with whisper-server and its half gigabyte of model. So check for it: once 1
// becomes our parent, we have been orphaned.
if (process.ppid !== 1) {
  const wache = setInterval(() => {
    if (process.ppid === 1) {
      stopWhisper()
      process.exit(0)
    }
  }, 2000)
  wache.unref()
}

process.on('exit', stopWhisper)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { stopWhisper(); process.exit(0) })
}

server.listen(PORT, '127.0.0.1', () => {
  // The token sits in the URL, and only same-origin pages can read it.
  console.log(`${ORIGIN}/?token=${TOKEN}`)
})
