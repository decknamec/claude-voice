// Lokaler Backend-Server für die Voice-UI.
//
// Eine persistente Agent-SDK-Session statt `claude -p` pro Äußerung. Das ist
// nicht nur schneller (der Prozessstart dominierte die Antwortzeit) — es ist
// auch die einzige Bauart, in der Freigaben überhaupt möglich sind: die CLI
// lehnt genehmigungspflichtige Aktionen im Headless-Modus stillschweigend ab,
// ohne den Client zu fragen. `canUseTool` fragt ihn.
//
// Bindet nur an 127.0.0.1 und verlangt zusätzlich ein Start-Token: der Endpunkt
// führt Werkzeuge aus, und "nur localhost" schützt nicht vor einer Webseite,
// die der Nutzer im selben Browser offen hat.
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, randomBytes } from 'node:crypto'
import { query, listSessions } from '@anthropic-ai/claude-agent-sdk'
import { speakable } from './speakable.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOME = homedir()
const PORT = Number(process.env.VOICE_UI_PORT || 7331)
const CWD = process.env.VOICE_UI_CWD || HOME
const TOKEN = process.env.VOICE_UI_TOKEN || randomBytes(24).toString('hex')
const ORIGIN = `http://127.0.0.1:${PORT}`

function loadConf () {
  const conf = {
    MODEL: join(HOME, '.claude/whisper-models/ggml-large-v3-turbo-q5_0.bin'),
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

// ── SSE: ein Kanal, über den Zustand, Text und Freigabe-Anfragen laufen ──
const clients = new Set()
function push (event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) { try { res.write(frame) } catch {} }
}

// ── Sprachausgabe: satzweise erzeugt, im Browser abgespielt.
//    Serverseitiges afplay wäre einfacher, aber dann hört das Mikrofon die
//    eigene Stimme und die Echounterdrückung greift nicht — ohne das ist kein
//    Freihandmodus möglich. ──
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
  // Container richtet sich nach dem Backend: piper und say liefern WAV,
  // edge und ElevenLabs mp3. Die Endung entscheidet, was der Browser bekommt.
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
      // Endung kann abweichen, wenn `auto` ein anderes Backend gewählt hat.
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

// ── Whisper: Modell einmal laden statt pro Äußerung (~0,3 s je Aufruf). ──
// `owned` merkt, ob wir den Server selbst gestartet haben — nur dann beenden wir ihn.
let whisper = { proc: null, port: PORT + 500, ready: false, owned: false }

const whisperAlive = async (ms = 500) => {
  try {
    const r = await fetch(`http://127.0.0.1:${whisper.port}/`, { signal: AbortSignal.timeout(ms) })
    return !!r.status
  } catch { return false }
}

async function startWhisper (conf) {
  if (whisper.ready || whisper.proc) return whisper.ready
  // Läuft auf dem Port schon einer — etwa der Rest eines hart beendeten Laufs —,
  // dann den benutzen. whisper-server bindet mit SO_REUSEPORT: ein zweiter
  // bekäme den Port anstandslos dazu, der Kernel verteilte die Anfragen dann
  // im Wechsel auf beide, und jede Instanz legt das halbe Gigabyte Modell
  // noch einmal in den Speicher. Genau so sammeln sich Waisen an.
  if (await whisperAlive()) { whisper.ready = true; whisper.owned = false; return true }
  if (!existsSync(conf.MODEL)) return false
  whisper.proc = spawn('whisper-server', [
    '-m', conf.MODEL, '--host', '127.0.0.1', '--port', String(whisper.port),
    '-t', '8', '--convert'   // nimmt webm direkt an, spart den ffmpeg-Schritt
  ], { stdio: 'ignore' })
  whisper.owned = true
  whisper.proc.on('close', () => { whisper.proc = null; whisper.ready = false; whisper.owned = false })
  for (let i = 0; i < 60; i++) {
    if (await whisperAlive()) { whisper.ready = true; return true }
    await new Promise(r => setTimeout(r, 250))
  }
  return false
}

// Nur den eigenen Kindprozess abräumen, nie einen fremden auf demselben Port.
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
    const r = await fetch(`http://127.0.0.1:${whisper.port}/inference`, { method: 'POST', body: form })
    if (r.ok) {
      const text = (await r.text()).replace(/\n/g, ' ').trim()
      return JUNK.test(text) ? '' : text
    }
  }
  // Fallback: der alte Weg über ffmpeg + whisper-cli, falls kein Server läuft.
  const dir = await mkdtemp(join(tmpdir(), 'voiceui-'))
  try {
    const webm = join(dir, 'in.webm'), wav = join(dir, 'in.wav')
    await writeFile(webm, buf)
    const ff = await run('ffmpeg', ['-v', 'error', '-i', webm, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', wav])
    if (ff.code !== 0) throw new VoiceError('ffmpeg_failed', ff.err.trim().split('\n').pop() || 'unbekannt')
    const w = await run('whisper-cli', ['-m', conf.MODEL, '-l', WHISPER_LANG[lang] || conf.WHISPER_LANG, '-nt', '-np', '-t', '8', '-f', wav])
    if (w.code !== 0) throw new VoiceError('whisper_failed', w.err.trim().split('\n').pop() || 'unbekannt')
    const text = w.out.replace(/\n/g, ' ').trim()
    return JUNK.test(text) ? '' : text
  } finally { await rm(dir, { recursive: true, force: true }) }
}

// ── Alte Verlaeufe ───────────────────────────────────────────────────
// resume startet die Session zwar mit vollem Gedaechtnis, aber das Fenster
// bleibt leer — man sieht nicht, worueber man geredet hat. Also den
// Verlauf aus dem Transkript nachziehen.
function transkriptPfad (id) {
  const root = join(HOME, '.claude', 'projects')
  const direkt = join(root, CWD.replace(/[/.]/g, '-'), id + '.jsonl')
  if (existsSync(direkt)) return direkt
  // Die Session kann unter einem anderen Projektordner liegen, etwa wenn sie
  // aus einem Unterverzeichnis gestartet wurde.
  try {
    for (const d of readdirSync(root)) {
      const p = join(root, d, id + '.jsonl')
      if (existsSync(p)) return p
    }
  } catch {}
  return null
}

function leseTranskript (id, max = 300) {
  const pfad = transkriptPfad(id)
  if (!pfad) return null
  const out = []
  const anhaengen = (rolle, text) => {
    const t = text.trim()
    if (!t) return
    const letzt = out[out.length - 1]
    // Ganze Laeufe von Werkzeugaufrufen zu einer Zeile buendeln — einzeln
    // aufgelistet verdraengen sie das eigentliche Gespraech aus dem Fenster.
    if (rolle === 'werkzeug') {
      if (letzt?.rolle === 'werkzeug') {
        letzt.n += 1
        if (!letzt.namen.includes(t) && letzt.namen.length < 4) letzt.namen.push(t)
      } else out.push({ rolle, namen: [t], n: 1 })
      return
    }
    // Der Stream zerlegt eine Antwort in mehrere Bloecke — wieder zusammenfuegen.
    if (letzt && letzt.rolle === rolle) letzt.text += ' ' + t
    else out.push({ rolle, text: t })
  }
  for (const zeile of readFileSync(pfad, 'utf8').split('\n')) {
    if (!zeile) continue
    let e; try { e = JSON.parse(zeile) } catch { continue }
    if (e.isSidechain) continue        // Unteragenten gehoeren nicht in den Verlauf
    const c = e.message?.content
    if (e.type === 'user') {
      const t = typeof c === 'string' ? c
        : Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join(' ') : ''
      // Werkzeugergebnisse und Hook-Einwuerfe kommen ebenfalls als user-Zeile.
      if (t && !t.startsWith('<')) anhaengen('du', t)
    } else if (e.type === 'assistant' && Array.isArray(c)) {
      anhaengen('claude', c.filter(b => b.type === 'text').map(b => b.text).join(' '))
      for (const b of c) if (b.type === 'tool_use') anhaengen('werkzeug', b.name)
    }
  }
  return out.slice(-max)
}

// ── Die persistente Session ──────────────────────────────────────────
let S = null   // { q, send, pending, sessionId }
let permMode = null   // vom Nutzer gewählt; überstimmt die Konfig
let modelOverride = null
let lang = 'de'
let effort = null   // null = wie vom Modell vorgegeben

// Was Claude Code im Terminal in der Statuszeile zeigt: Dauer, Tokens, Kosten,
// Fuellstand des Kontextfensters. Ohne das ist nicht einzuschaetzen, ob eine
// Session gleich an die Grenze laeuft.
const leereStats = () => ({
  turns: 0, inTok: 0, outTok: 0, cacheRead: 0, cacheWrite: 0,
  costUsd: 0, lastMs: 0, apiMs: 0, startedAt: Date.now(), ctx: null
})
let stats = leereStats()

function summeUsage (u) {
  if (!u) return
  stats.inTok     += u.input_tokens || 0
  stats.outTok    += u.output_tokens || 0
  stats.cacheRead += u.cache_read_input_tokens || 0
  stats.cacheWrite += u.cache_creation_input_tokens || 0
}

// Der Systemprompt ist je Session fest — eine Sprachumstellung braucht daher
// eine neue Session. Für Deutsch gilt weiter der Text aus der Konfig.
const PROMPTS = {
  en: 'Your reply will be read aloud. Answer in English, in at most three or four sentences, in full sentences without markdown, code blocks or bullet lists. Do not read out file paths or URLs — describe them instead. If the answer truly needs code, just say what you changed and where.',
  auto: 'Your reply will be read aloud. Answer in the same language the user just spoke, in at most three or four sentences, in full sentences without markdown, code blocks or bullet lists. Do not read out file paths or URLs — describe them instead. If the answer truly needs code, just say what you changed and where.'
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

  const pending = new Map()   // Freigabe-Anfragen, auf die die UI antworten muss
  const subagents = new Set()  // laufende Task-Aufrufe, fuer die Uebersicht

  const q = query({
    prompt: input(),
    options: {
      cwd: CWD,
      ...(resumeId ? { resume: resumeId } : {}),
      permissionMode: permMode || conf.PERMISSION_MODE,
      // Erlaubt den Wechsel nach bypassPermissions an der laufenden Session.
      // Ohne das lehnt die CLI ab und man muesste neu starten. Der Modus wird
      // dadurch nicht aktiv — nur waehlbar.
      allowDangerouslySkipPermissions: true,
      ...(effort ? { effort } : {}),
      includePartialMessages: true,
      ...((modelOverride || conf.CLAUDE_MODEL) ? { model: modelOverride || conf.CLAUDE_MODEL } : {}),
      systemPrompt: { type: 'preset', preset: 'claude_code', append: PROMPTS[lang] || conf.VOICE_SYSTEM_PROMPT },
      // Hier hängt die ganze Freigabe-Mechanik dran: das Promise bleibt offen,
      // bis der Nutzer in der UI entschieden hat.
      canUseTool: (toolName, toolInput, { signal }) => new Promise(resolve => {
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
    q, pending, subagents,
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
          // Der Werkzeugname steht schon fest, bevor die Argumente durchgetropft
          // sind — damit ist sofort sichtbar, woran gearbeitet wird.
          if (ev?.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
            push('step', { id: ev.content_block.id, name: ev.content_block.name })
          }
          // Langes Nachdenken ohne Werkzeugaufruf sieht sonst aus wie ein Hänger.
          if (d?.type === 'thinking_delta' && d.thinking) push('think', { text: d.thinking })
          if (d?.type === 'text_delta' && d.text) {
            buf += d.text
            push('delta', { text: d.text })
            // Sobald ein Satz fertig ist, geht er sofort in die Sprachausgabe.
            const cut = buf.lastIndexOf('. ') + 1 || buf.lastIndexOf('! ') + 1 || buf.lastIndexOf('? ') + 1
            if (cut > spoken) { enqueueSpeech(buf.slice(spoken, cut), conf); spoken = cut }
          }
        } else if (msg.type === 'assistant') {
          // Unteragenten reden nicht mit dem Nutzer: ihr Text gehoert in die
          // Uebersicht, nicht in den Gespraechsverlauf.
          const parent = msg.parent_tool_use_id || null
          const blocks = msg.message?.content || []
          const text = blocks.filter(b => b.type === 'text').map(b => b.text).join(' ')
          if (text && !parent) push('message', { role: 'assistant', text })
          if (text && parent) push('subagent', { phase: 'text', id: parent, text: text.slice(0, 300) })
          // Werkzeugaufrufe sichtbar machen — sonst ist eine lange Antwort eine
          // Blackbox, in der minutenlang nichts passiert zu sein scheint.
          for (const b of blocks) {
            if (b.type !== 'tool_use') continue
            push('tool', { phase: 'use', id: b.id, name: b.name, input: b.input, parent })
            // Das Werkzeug heisst je nach Fassung Agent oder Task.
            if (b.name === 'Agent' || b.name === 'Task') {
              subagents.add(b.id)
              push('subagent', { phase: 'start', id: b.id,
                                 typ: b.input?.subagent_type || 'general-purpose',
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
          summeUsage(msg.usage)
          push('done', { subtype: msg.subtype, ms: msg.duration_ms })
          push('stats', stats)
          // Der Fuellstand kostet einen Kontrollaufruf, deshalb erst nach dem
          // Zug und in der billigen Variante.
          q.getContextUsage({ detail: 'summary' })
            .then(c => {
              stats.ctx = { tokens: c.totalTokens, max: c.maxTokens || c.rawMaxTokens,
                            prozent: c.percentage, modell: c.model }
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

// ── HTTP ─────────────────────────────────────────────────────────────
const body = req => new Promise((resolve, reject) => {
  const chunks = []; let n = 0
  req.on('data', c => {
    n += c.length
    if (n > 40 * 1024 * 1024) { reject(new Error('zu groß')); req.destroy(); return }
    chunks.push(c)
  })
  req.on('end', () => resolve(Buffer.concat(chunks)))
  req.on('error', reject)
})

const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

// Ohne das kann jede Webseite, die der Nutzer offen hat, diese Endpunkte
// aufrufen — ein text/plain-POST löst keinen CORS-Preflight aus, und "nur
// localhost" ist keine Hürde für den Browser des Nutzers selbst.
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
      const html = await readFile(join(HERE, 'index.html'))
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(html)
    }

    if (url.pathname.startsWith('/api/') && !authorized(req, url)) {
      return json(res, 403, { error: 'ungültiges oder fehlendes Token' })
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
      if (!a || !existsSync(a.path)) return json(res, 404, { error: 'weg' })
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
      catch { return json(res, 500, { error: 'backends nicht lesbar' }) }
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
      } catch { return json(res, 200, { said: '' }) }   // Vorschau darf nie stören
    }

    if (req.method === 'POST' && url.pathname === '/api/say') {
      const { text } = JSON.parse((await body(req)).toString('utf8'))
      if (!text?.trim()) return json(res, 400, { error: 'leer' })
      if (!S) startSession(conf)
      S.send(text)
      return json(res, 200, { ok: true })
    }

    if (req.method === 'GET' && url.pathname === '/api/sessions') {
      const list = await listSessions({ dir: CWD, limit: 30 })
      return json(res, 200, {
        sessions: list.map(x => ({
          id: x.sessionId,
          titel: x.customTitle || x.summary || '(ohne Titel)',
          zuletzt: x.lastModified,
          aktuell: x.sessionId === S?.sessionId
        }))
      })
    }

    if (req.method === 'POST' && url.pathname === '/api/resume') {
      const { id } = JSON.parse((await body(req)).toString('utf8'))
      if (!id) return json(res, 400, { error: 'keine Session-ID' })
      await stopSpeech()
      try { S?.q.close() } catch {}
      S = null
      stats = leereStats()
      startSession(conf, id)
      return json(res, 200, { ok: true, resumed: id, verlauf: leseTranskript(id) })
    }

    if (req.method === 'GET' && url.pathname === '/api/transcript') {
      const id = url.searchParams.get('id')
      if (!id) return json(res, 400, { error: 'keine Session-ID' })
      const verlauf = leseTranskript(id)
      if (!verlauf) return json(res, 404, { error: 'kein Transkript zu dieser Session gefunden' })
      return json(res, 200, { verlauf })
    }

    if (req.method === 'GET' && url.pathname === '/api/stats') {
      return json(res, 200, stats)
    }

    // Die volle Aufschluesselung kostet Token-Zaehlaufrufe, daher nur auf Abruf.
    if (req.method === 'GET' && url.pathname === '/api/context') {
      if (!S) return json(res, 409, { error: 'keine laufende Session' })
      try {
        const c = await S.q.getContextUsage({ detail: url.searchParams.get('voll') ? 'full' : 'summary' })
        return json(res, 200, {
          tokens: c.totalTokens, max: c.maxTokens || c.rawMaxTokens,
          prozent: c.percentage, modell: c.model,
          kategorien: (c.categories || []).filter(k => k.tokens > 0)
            .map(k => ({ name: k.name, tokens: k.tokens }))
        })
      } catch (e) { return json(res, 500, { error: String(e?.message || e) }) }
    }

    if (req.method === 'GET' && url.pathname === '/api/mcp') {
      if (!S) return json(res, 409, { error: 'keine laufende Session' })
      try {
        const liste = await S.q.mcpServerStatus()
        return json(res, 200, {
          server: liste.map(m => ({
            name: m.name, status: m.status, scope: m.scope || '',
            version: m.serverInfo?.version || '',
            fehler: m.error || '',
            werkzeuge: (m.tools || []).map(t => t.name)
          }))
        })
      } catch (e) { return json(res, 500, { error: String(e?.message || e) }) }
    }

    if (req.method === 'GET' && url.pathname === '/api/agents') {
      if (!S) return json(res, 409, { error: 'keine laufende Session' })
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

    if (req.method === 'POST' && url.pathname === '/api/effort') {
      const { effort: e } = JSON.parse((await body(req)).toString('utf8'))
      const allowed = [null, '', 'low', 'medium', 'high', 'xhigh', 'max']
      if (!allowed.includes(e)) return json(res, 400, { error: 'unbekannte Stufe' })
      effort = e || null
      // Die Denktiefe wird beim Sessionstart gesetzt; es gibt kein setEffort.
      let restarted = false
      if (S) { await stopSpeech(); try { S.q.close() } catch {}; S = null; restarted = true }
      return json(res, 200, { ok: true, effort, restarted })
    }

    if (req.method === 'POST' && url.pathname === '/api/language') {
      const { lang: l } = JSON.parse((await body(req)).toString('utf8'))
      if (!WHISPER_LANG[l]) return json(res, 400, { error: 'unbekannte Sprache' })
      lang = l
      // Die Erkennung stellt sofort um; der Antwortsprache-Prompt hängt an der
      // Session, also muss die neu starten.
      let restarted = false
      if (S) { await stopSpeech(); try { S.q.close() } catch {}; S = null; restarted = true }
      return json(res, 200, { ok: true, lang, restarted })
    }

    if (req.method === 'POST' && url.pathname === '/api/permission-mode') {
      const { mode } = JSON.parse((await body(req)).toString('utf8'))
      const allowed = ['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']
      if (!allowed.includes(mode)) return json(res, 400, { error: 'unbekannter Modus' })
      permMode = mode
      let restarted = false
      // Läuft schon eine Session, gilt es sofort — sonst beim nächsten Start.
      if (S) {
        try { await S.q.setPermissionMode(mode) }
        catch {
          // bypassPermissions laesst sich an einer laufenden Session nicht
          // nachtraeglich setzen; die CLI muss dafuer neu starten. Mit resume
          // behaelt die neue Session den ganzen bisherigen Faden.
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
      const { id, behavior, message } = JSON.parse((await body(req)).toString('utf8'))
      const resolve = S?.pending.get(id)
      if (!resolve) return json(res, 404, { error: 'unbekannte Anfrage' })
      S.pending.delete(id)
      resolve(behavior === 'allow'
        ? { behavior: 'allow' }
        : { behavior: 'deny', message: message || 'Vom Nutzer abgelehnt.' })
      return json(res, 200, { ok: true })
    }

    if (req.method === 'POST' && url.pathname === '/api/interrupt') {
      stopSpeech()
      // Offene Freigaben mit auflösen, sonst hängt der Turn am Promise.
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
      stats = leereStats()
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

// Ohne die Signal-Handler ueberlebt whisper-server jedes Ctrl-C und jedes kill
// und haelt Port und Modellspeicher weiter — der Fall, der die Waisen erzeugt hat.
process.on('exit', stopWhisper)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { stopWhisper(); process.exit(0) })
}

server.listen(PORT, '127.0.0.1', () => {
  // Das Token steht in der URL — nur gleichherkünftige Seiten können es lesen.
  console.log(`${ORIGIN}/?token=${TOKEN}`)
})
