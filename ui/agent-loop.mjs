#!/usr/bin/env node
// Persistente Agent-Session für die CLI-Schleife.
//
// Die Schleife in bin/claude-voice startete bisher `claude -p` je Äußerung.
// Gemessen kostete allein der Prozessstart rund 13 Sekunden pro Satz, gegen
// 1,9 Sekunden bis zum ersten Text in der Weboberfläche. Dieses Skript hält
// die Session offen und spricht über Zeilen-JSON mit der Shell.
//
// Hinein (stdin, eine JSON-Zeile je Nachricht):
//   {"typ":"sagen","text":"…"}          eine Äußerung
//   {"typ":"freigabe","id":"…","ok":true}
//   {"typ":"abbrechen"}
//
// Hinaus (stdout, eine JSON-Zeile je Ereignis):
//   {"typ":"satz","text":"…"}           fertiger Satz, sofort vorlesbar
//   {"typ":"werkzeug","name":"Bash","arg":"…"}
//   {"typ":"freigabe","id":"…","werkzeug":"…","arg":"…"}
//   {"typ":"fertig","ms":1234}
//   {"typ":"fehler","text":"…"}
//   {"typ":"session","id":"…"}
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import { query } from '@anthropic-ai/claude-agent-sdk'

const arg = (name, standard) => {
  const i = process.argv.indexOf('--' + name)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : standard
}

const CWD = arg('cwd', process.cwd())
const MODELL = arg('model', '')
const MODUS = arg('permission-mode', 'acceptEdits')
const EFFORT = arg('effort', '')
const FORTSETZEN = arg('resume', '')
const PROMPT = arg('system-prompt', '')

const raus = o => process.stdout.write(JSON.stringify(o) + '\n')

// Der Eingang ist ein asynchroner Iterator, den der SDK abfragt. Kommt nichts,
// wartet er auf das nächste wake() statt zu pollen.
const inbox = []
let wake = null
async function * eingang () {
  while (true) {
    if (!inbox.length) await new Promise(r => { wake = r })
    yield inbox.shift()
  }
}
const schicken = text => {
  inbox.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null })
  if (wake) { wake(); wake = null }
}

// Offene Freigabe-Anfragen. Die Shell antwortet mit derselben Kennung.
const offen = new Map()

// Für die häufigen Werkzeuge das eine Feld zeigen, auf das es ankommt.
const FELD = { Bash: 'command', Read: 'file_path', Write: 'file_path', Edit: 'file_path',
               Glob: 'pattern', Grep: 'pattern', WebFetch: 'url', Agent: 'description',
               Task: 'description' }
const kurz = (name, input) => {
  const f = FELD[name]
  const roh = f && input?.[f] != null ? String(input[f]) : JSON.stringify(input ?? {})
  return roh.replace(/\s+/g, ' ').slice(0, 120)
}

const q = query({
  prompt: eingang(),
  options: {
    cwd: CWD,
    ...(FORTSETZEN ? { resume: FORTSETZEN } : {}),
    permissionMode: MODUS,
    allowDangerouslySkipPermissions: true,
    ...(EFFORT ? { effort: EFFORT } : {}),
    ...(MODELL ? { model: MODELL } : {}),
    includePartialMessages: true,
    systemPrompt: { type: 'preset', preset: 'claude_code', ...(PROMPT ? { append: PROMPT } : {}) },
    // Die Shell fragt den Nutzer und schickt die Antwort zurück. Bricht der
    // Zug vorher ab, löst das Signal die Zusage auf, sonst hinge der Aufruf.
    canUseTool: (werkzeug, input, { signal }) => new Promise(resolve => {
      const id = randomUUID()
      offen.set(id, resolve)
      raus({ typ: 'freigabe', id, werkzeug, arg: kurz(werkzeug, input) })
      signal?.addEventListener('abort', () => {
        if (offen.delete(id)) resolve({ behavior: 'deny', message: 'Abgebrochen.' })
      }, { once: true })
    })
  }
})

createInterface({ input: process.stdin }).on('line', zeile => {
  let m
  try { m = JSON.parse(zeile) } catch { return }
  if (m.typ === 'sagen') schicken(String(m.text || ''))
  else if (m.typ === 'freigabe') {
    const aufloesen = offen.get(m.id)
    if (!aufloesen) return
    offen.delete(m.id)
    aufloesen(m.ok ? { behavior: 'allow' } : { behavior: 'deny', message: 'Vom Nutzer abgelehnt.' })
  } else if (m.typ === 'abbrechen') q.interrupt().catch(() => {})
  else if (m.typ === 'ende') { try { q.close() } catch {} ; process.exit(0) }
})

// Sätze einzeln herausgeben, sobald sie fertig sind: dann beginnt die
// Sprachausgabe, während der Rest noch entsteht. Genau das war der spürbare
// Unterschied zur alten Schleife, die erst auf die ganze Antwort wartete.
let puffer = '', gesprochen = 0, sitzung = null
const SATZENDE = /[.!?](\s|$)/g

function saetzeAbgeben (rest) {
  if (rest) {
    const offen2 = puffer.slice(gesprochen).trim()
    if (offen2) raus({ typ: 'satz', text: offen2 })
    puffer = ''; gesprochen = 0
    return
  }
  SATZENDE.lastIndex = gesprochen
  let m, schnitt = gesprochen
  while ((m = SATZENDE.exec(puffer))) schnitt = m.index + 1
  if (schnitt > gesprochen) {
    const stueck = puffer.slice(gesprochen, schnitt).trim()
    if (stueck) raus({ typ: 'satz', text: stueck })
    gesprochen = schnitt
  }
}

;(async () => {
  try {
    for await (const msg of q) {
      if (msg.type === 'stream_event') {
        const d = msg.event?.delta
        if (d?.type === 'text_delta' && d.text && !msg.parent_tool_use_id) {
          puffer += d.text
          saetzeAbgeben(false)
        }
      } else if (msg.type === 'assistant') {
        for (const b of msg.message?.content || []) {
          if (b.type === 'tool_use') {
            raus({ typ: 'werkzeug', name: b.name, arg: kurz(b.name, b.input),
                   unter: msg.parent_tool_use_id || null })
          }
        }
      } else if (msg.type === 'result') {
        saetzeAbgeben(true)
        raus({ typ: 'fertig', ms: msg.duration_ms || 0, kosten: msg.total_cost_usd || 0 })
      } else if (msg.type === 'system' && msg.session_id) {
        // Jede system-Nachricht trägt die Kennung; nur die Änderung ist neu.
        if (msg.session_id !== sitzung) { sitzung = msg.session_id; raus({ typ: 'session', id: sitzung }) }
      }
    }
  } catch (e) {
    raus({ typ: 'fehler', text: String(e?.message || e) })
    process.exit(1)
  }
})()
