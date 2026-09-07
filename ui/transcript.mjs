// Read the history of an earlier session out of its transcript.
//
// This lives in its own file because it is the only parsing of note in the
// server and because foreign data formats change. A test with fixed sample
// lines then fails loudly instead of the restore quietly coming back empty.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Where does the transcript for this session live? */
export function transcriptPath (id, { home, cwd }) {
  const root = join(home, '.claude', 'projects')
  const direct = join(root, cwd.replace(/[/.]/g, '-'), id + '.jsonl')
  if (existsSync(direct)) return direct
  // The session can sit under a different project folder, for instance when it
  // was started from a subdirectory.
  try {
    for (const d of readdirSync(root)) {
      const p = join(root, d, id + '.jsonl')
      if (existsSync(p)) return p
    }
  } catch { /* no project folder */ }
  return null
}

/** Condense the lines of a transcript into conversation blocks. Separate from
 *  the file access so that it can be checked without a filesystem. */
export function condense (lines, max = 300) {
  const out = []
  const append = (role, text) => {
    const t = String(text).trim()
    if (!t) return
    const last = out[out.length - 1]
    // Bundle whole runs of tool calls into one line: listed individually they
    // push the actual conversation out of the window.
    if (role === 'tool') {
      if (last?.role === 'tool') {
        last.n += 1
        if (!last.names.includes(t) && last.names.length < 4) last.names.push(t)
      } else out.push({ role, names: [t], n: 1 })
      return
    }
    // The stream splits one answer across several blocks, so join them again.
    if (last && last.role === role) last.text += ' ' + t
    else out.push({ role, text: t })
  }

  for (const line of lines) {
    if (!line) continue
    let e
    try { e = JSON.parse(line) } catch { continue }
    if (e.isSidechain) continue        // subagents do not belong in the history
    const c = e.message?.content
    if (e.type === 'user') {
      const t = typeof c === 'string' ? c
        : Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join(' ') : ''
      // Tool results and hook interjections arrive as user lines as well.
      if (t && !t.startsWith('<')) append('user', t)
    } else if (e.type === 'assistant' && Array.isArray(c)) {
      append('assistant', c.filter(b => b.type === 'text').map(b => b.text).join(' '))
      for (const b of c) if (b.type === 'tool_use') append('tool', b.name)
    }
  }
  return out.slice(-max)
}

export function readTranscript (id, places, max = 300) {
  const path = transcriptPath(id, places)
  if (!path) return null
  return condense(readFileSync(path, 'utf8').split('\n'), max)
}
