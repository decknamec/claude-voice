# claude-voice

macOS voice interface for Claude Code: a persistent Agent SDK session behind a
local node server, driven from a React window, a browser tab, a terminal loop
and a stop hook.

## Language

Everything inside the repo is **English**: identifiers, comments, file names,
test names, documentation, commit messages.

What the **user** reads or hears stays **German**. It never sits inline in
component code; it lives behind structural keys:

- `app/src/lib/i18n/messages.ts` is the German catalogue and defines
  `type Messages`.
- `app/src/lib/i18n/en.ts` is typed `Messages`, so a missing key is a compile
  error instead of a label that silently stays German.
- The keys are structural (`status.ownProcess`), never the German text itself.

The same split holds outside the app: the server sends tokens (`'own'`,
`'foreign'`, `'off'`) and the client translates them. German remains only in
the prompts sent to Claude and in terminal output the operator reads directly.

Mirror the operator's language in chat; that is unrelated to what goes into
files.

## Writing

- Plain hyphen, never an em dash.
- Timeless: describe what the code does, not what it used to do. No "now",
  "previously", "fixed", "legacy".
- Comments carry the reason, not a restatement of the line below.
- One sentence per line in long Markdown.
- Conventional Commits.

## Shape

```
app/          React 19 + Vite, builds to one self-contained HTML file
ui/           server.mjs (HTTP + SSE + Agent SDK), agent-loop.mjs (CLI loop)
bin/          claude-voice, claude-voice-ui, claude-say
hooks/        stop hook and shared bash libraries
desktop/      Tauri shell around the same server
tests/        smoke.sh, units.test.mjs, speakable-diff.mjs
```

- `app/dist/` is built, never committed. `claude-voice-ui` builds it on start.
- The wire contract lives in `app/src/lib/types.ts`. A field renamed on one side
  and not the other shows up as a blank panel, not an error - change both.
- `ui/speakable.mjs` and `hooks/lib/speakable.sh` are twins. They have drifted
  apart before; `tests/speakable-diff.mjs` holds them together.

## Checks

```bash
tests/smoke.sh                             # everything
cd app && npx tsc -b --noEmit
cd desktop/src-tauri && cargo clippy --all-targets -- -D warnings && cargo test
```

The smoke test needs no network and no microphone. What it cannot cover -
anything needing a mic, the Whisper model or a signed-in `claude` CLI - is a
real boundary: a green run does not mean speech works.

## Security

The server binds to `127.0.0.1` and additionally requires a startup token,
because its endpoints run tools. The page holding that token must fetch nothing
at runtime, which is why the build is a single file with no CDN and no external
font. Both properties are asserted in `tests/smoke.sh` and in CI.
