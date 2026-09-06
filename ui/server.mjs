// Lokaler Backend-Server für die Voice-UI.
// Bindet bewusst NUR an 127.0.0.1 — der Endpunkt startet `claude -p`.
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOME = homedir()
const PORT = Number(process.env.VOICE_UI_PORT || 7331)

// Dieselben Konfigdateien wie der CLI-Loop, damit beide Wege gleich eingestellt sind.
function loadConf () {
  const conf = {
    MODEL: join(HOME, '.claude/whisper-models/ggml-large-v3-turbo-q5_0.bin'),
    WHISPER_LANG: 'de',
    VOICE: 'Anna',
    RATE: '190',
    MAX_CHARS: '900',
    PERMISSION_MODE: 'acceptEdits',
    TTS_BACKEND: 'auto',
    CLAUDE_MODEL: '',
    VOCAB: 'Claude Code, Hook, Repo, Commit, Branch, Pull Request, Merge, Supabase, Vercel, TypeScript, Deploy, Terminal, Debugging, Refactoring, Prompt, Skill, Subagent, Transcript.',
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

let SESSION = null          // UUID der laufenden Voice-Session
let sayProc = null

// Whisper halluziniert auf Stille gern Standardphrasen — dieselbe Liste wie im CLI-Loop.
const JUNK = /^(\.|\[blank_audio\]|\(musik\)|untertitel.*|vielen dank[.!]?|.*amara\.org.*)$/i

async function transcribe (buf, conf) {
  const dir = await mkdtemp(join(tmpdir(), 'voiceui-'))
  try {
    const webm = join(dir, 'in.webm'); const wav = join(dir, 'in.wav')
    await writeFile(webm, buf)
    // MediaRecorder liefert webm/opus; whisper will 16 kHz mono PCM.
    const ff = await run('ffmpeg', ['-v', 'error', '-i', webm, '-ac', '1', '-ar', '16000',
      '-c:a', 'pcm_s16le', '-y', wav])
    if (ff.code !== 0 || !existsSync(wav)) throw new Error('ffmpeg: ' + ff.err)
    const w = await run('whisper-cli', ['-m', conf.MODEL, '-l', conf.WHISPER_LANG,
      '-nt', '-np', '-t', '8', '--prompt', conf.VOCAB, '--carry-initial-prompt', '-f', wav])
    if (w.code !== 0) throw new Error('whisper: ' + w.err)
    const text = w.out.replace(/\n/g, ' ').trim()
    return JUNK.test(text) ? '' : text
  } finally { await rm(dir, { recursive: true, force: true }) }
}

async function ask (text, conf) {
  const args = ['-p', '--output-format', 'text',
    '--permission-mode', conf.PERMISSION_MODE,
    '--append-system-prompt', conf.VOICE_SYSTEM_PROMPT]
  if (conf.CLAUDE_MODEL) args.push('--model', conf.CLAUDE_MODEL)
  if (SESSION) args.push('--resume', SESSION)
  else { SESSION = randomUUID(); args.push('--session-id', SESSION) }
  args.push('--', text)
  const r = await run('claude', args)
  if (r.code !== 0) throw new Error(r.err || r.out || 'claude exit ' + r.code)
  return r.out.trim()
}

// Serverseitiges Sprechen: der Request löst erst auf, wenn `say` fertig ist —
// so weiß die UI ohne Polling, wann der Speaking-State endet.
function speak (text, conf) {
  return new Promise(resolve => {
    if (sayProc) { try { sayProc.kill() } catch {} }
    // claude-say entscheidet selbst zwischen ElevenLabs und macOS say.
    sayProc = spawn(join(HOME, '.claude/bin/claude-say'), [text], { stdio: 'ignore' })
    sayProc.on('close', () => { sayProc = null; resolve() })
    sayProc.on('error', () => { sayProc = null; resolve() })
  })
}

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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const conf = loadConf()

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = await readFile(join(HERE, 'index.html'))
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(html)
    }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return json(res, 200, {
        tts: process.env.TTS_BACKEND || conf.TTS_BACKEND,
        voice: conf.VOICE,
        model: conf.CLAUDE_MODEL || 'default (opus[1m])',
        permissionMode: conf.PERMISSION_MODE,
        session: SESSION
      })
    }

    if (req.method === 'POST' && url.pathname === '/api/transcribe') {
      const t0 = Date.now()
      const said = await transcribe(await body(req), conf)
      return json(res, 200, { said, ms: Date.now() - t0 })
    }

    if (req.method === 'POST' && url.pathname === '/api/ask') {
      const { text } = JSON.parse((await body(req)).toString('utf8'))
      if (!text?.trim()) return json(res, 400, { error: 'leer' })
      const t0 = Date.now()
      const reply = await ask(text, conf)
      return json(res, 200, { reply, ms: Date.now() - t0, session: SESSION })
    }

    if (req.method === 'POST' && url.pathname === '/api/speak') {
      const { text } = JSON.parse((await body(req)).toString('utf8'))
      await speak(String(text || '').slice(0, Number(conf.MAX_CHARS) * 2), conf)
      return json(res, 200, { ok: true })
    }

    if (req.method === 'POST' && url.pathname === '/api/stop') {
      if (sayProc) { try { sayProc.kill() } catch {} }
      return json(res, 200, { ok: true })
    }

    if (req.method === 'POST' && url.pathname === '/api/shutdown') {
      json(res, 200, { ok: true })
      // Erst antworten, dann abbauen — sonst sieht die UI nur einen Verbindungsabbruch
      // und kann nicht zwischen "beendet" und "abgestürzt" unterscheiden.
      if (sayProc) { try { sayProc.kill() } catch {} }
      SESSION = null
      setTimeout(() => { server.close(); process.exit(0) }, 150)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/reset') {
      SESSION = null
      return json(res, 200, { ok: true })
    }

    res.writeHead(404); res.end('not found')
  } catch (e) {
    json(res, 500, { error: String(e.message || e) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`voice-ui  http://127.0.0.1:${PORT}`)
})
