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
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, randomBytes } from 'node:crypto'
import { query, listSessions } from '@anthropic-ai/claude-agent-sdk'

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

function speakable (t) {
  return t.replace(/```[\s\S]*?```/g, '')
          .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, ' ')
          .replace(/^\s*#{1,6}\s*/gm, '')
          .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
          .replace(/\bhttps?:\/\/\S+/g, ' ')
          .replace(/(?:~|\.{0,2})?(?:\/[\w.@+-]+){2,}\/?/g, ' die Datei ')
          .replace(/`([^`]*)`/g, '$1')
          .replace(/[*_>|#]+/g, ' ')
          .replace(/\s+/g, ' ').trim()
}

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
let whisper = { proc: null, port: PORT + 500, ready: false }

async function startWhisper (conf) {
  if (whisper.ready || whisper.proc) return whisper.ready
  if (!existsSync(conf.MODEL)) return false
  whisper.proc = spawn('whisper-server', [
    '-m', conf.MODEL, '--host', '127.0.0.1', '--port', String(whisper.port),
    '-t', '8', '--convert'   // nimmt webm direkt an, spart den ffmpeg-Schritt
  ], { stdio: 'ignore' })
  whisper.proc.on('close', () => { whisper.proc = null; whisper.ready = false })
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${whisper.port}/`, { signal: AbortSignal.timeout(500) })
      if (r.status) { whisper.ready = true; return true }
    } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  return false
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

// ── Die persistente Session ──────────────────────────────────────────
let S = null   // { q, send, pending, sessionId }
let permMode = null   // vom Nutzer gewählt; überstimmt die Konfig
let modelOverride = null
let lang = 'de'

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

  const q = query({
    prompt: input(),
    options: {
      cwd: CWD,
      ...(resumeId ? { resume: resumeId } : {}),
      permissionMode: permMode || conf.PERMISSION_MODE,
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
    q, pending,
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
          const d = msg.event?.delta
          if (d?.type === 'text_delta' && d.text) {
            buf += d.text
            push('delta', { text: d.text })
            // Sobald ein Satz fertig ist, geht er sofort in die Sprachausgabe.
            const cut = buf.lastIndexOf('. ') + 1 || buf.lastIndexOf('! ') + 1 || buf.lastIndexOf('? ') + 1
            if (cut > spoken) { enqueueSpeech(buf.slice(spoken, cut), conf); spoken = cut }
          }
        } else if (msg.type === 'assistant') {
          const blocks = msg.message?.content || []
          const text = blocks.filter(b => b.type === 'text').map(b => b.text).join(' ')
          if (text) push('message', { role: 'assistant', text })
          // Werkzeugaufrufe sichtbar machen — sonst ist eine lange Antwort eine
          // Blackbox, in der minutenlang nichts passiert zu sein scheint.
          for (const b of blocks) {
            if (b.type === 'tool_use') push('tool', { phase: 'use', id: b.id, name: b.name, input: b.input })
          }
        } else if (msg.type === 'user') {
          for (const b of msg.message?.content || []) {
            if (b.type !== 'tool_result') continue
            const c = b.content
            const text = typeof c === 'string' ? c
              : Array.isArray(c) ? c.filter(x => x.type === 'text').map(x => x.text).join(' ') : ''
            push('tool', { phase: 'result', id: b.tool_use_id, ok: !b.is_error, text: text.slice(0, 400) })
          }
        } else if (msg.type === 'result') {
          if (buf.length > spoken) enqueueSpeech(buf.slice(spoken), conf)
          buf = ''; spoken = 0
          push('done', { subtype: msg.subtype, ms: msg.duration_ms })
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
        modelOverride
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
      startSession(conf, id)
      return json(res, 200, { ok: true, resumed: id })
    }

    if (req.method === 'POST' && url.pathname === '/api/model') {
      const { model } = JSON.parse((await body(req)).toString('utf8'))
      modelOverride = model || null
      if (S) { try { await S.q.setModel(modelOverride || undefined) } catch (e) {
        return json(res, 500, { error: String(e?.message || e) }) } }
      return json(res, 200, { ok: true, model: modelOverride, applied: !!S })
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
      const allowed = ['default', 'acceptEdits', 'plan', 'bypassPermissions']
      if (!allowed.includes(mode)) return json(res, 400, { error: 'unbekannter Modus' })
      permMode = mode
      // Läuft schon eine Session, gilt es sofort — sonst beim nächsten Start.
      if (S) { try { await S.q.setPermissionMode(mode) } catch (e) {
        return json(res, 500, { error: String(e?.message || e) }) } }
      push('state', { state: 'idle' })
      return json(res, 200, { ok: true, mode, applied: !!S })
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
      return json(res, 200, { ok: true })
    }

    if (req.method === 'POST' && url.pathname === '/api/shutdown') {
      json(res, 200, { ok: true })
      stopSpeech()
      try { S?.q.close() } catch {}
      if (whisper.proc) { try { whisper.proc.kill() } catch {} }
      setTimeout(() => { server.close(); process.exit(0) }, 150)
      return
    }

    res.writeHead(404); res.end('not found')
  } catch (e) {
    json(res, 500, { code: e.code || 'server', error: String(e.message || e) })
  }
})

process.on('exit', () => { if (whisper.proc) { try { whisper.proc.kill() } catch {} } })

server.listen(PORT, '127.0.0.1', () => {
  // Das Token steht in der URL — nur gleichherkünftige Seiten können es lesen.
  console.log(`${ORIGIN}/?token=${TOKEN}`)
})
