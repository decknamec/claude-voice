# claude-voice

Talk to Claude Code instead of typing, on macOS, with local speech recognition.

Four paths that share the same configuration, the same session and the same
speech output:

| | what it does |
|---|---|
| **Claude Voice.app** | Its own window. ⌥Space brings it to the front from anywhere and starts recording; a menu bar icon keeps it reachable. |
| **`claude-voice-ui`** | The same interface in the browser, if you prefer it in a tab. |
| **`claude-voice`** | In the terminal: talk, pause briefly, the answer comes back spoken. |
| **Read-aloud hook** | Claude Code reads every finished answer aloud. You keep typing as usual. |

Speech recognition runs entirely locally through [whisper.cpp](https://github.com/ggerganov/whisper.cpp).
Only the finished transcript goes to the Claude API - audio never leaves the machine.

![Claude Voice while it is listening](docs/images/window.png)

## Installation

```bash
git clone <this-repo> ~/claude-voice
cd ~/claude-voice && ./install.sh
```

`install.sh` checks the dependencies, creates symlinks into `~/.claude`, copies
the example configuration, downloads the Whisper model on request (~547 MB) and
registers the stop hook in `settings.json`. Nothing that already exists is
overwritten.

Dependencies: `brew install whisper-cpp sox ffmpeg jq`. The interface also needs
node; on first start `claude-voice-ui` fetches the Agent SDK and builds the
interface (React, TypeScript, Tailwind), both once and automatically.

Afterwards put `~/.claude/bin` on your PATH and run `~/.claude/hooks/voice on`.

## Desktop app

The app is a Tauri shell around the same local server. It adds what a browser
tab cannot do: a global shortcut (⌥Space, brings the window forward and starts
recording), a menu bar icon, and microphone access without a permission prompt
per origin.

A built DMG is under [Releases](../../releases). To build it yourself:

```bash
cd desktop && npx tauri build      # needs Rust: https://rustup.rs
```

**About the Gatekeeper warning.** The DMG is only ad-hoc signed - there is no
Apple developer certificate behind it. On first open macOS therefore reports
that it is damaged and cannot be opened. That is not a finding about the file,
it is the default for anything unsigned from the internet. Once:

```bash
xattr -dr com.apple.quarantine "/Applications/Claude Voice.app"
```

If that goes too far for you: build it yourself. The app is then created
locally and carries no quarantine attribute at all.

The app does not bring the server with it - it looks for `server.mjs` where
`install.sh` puts it. Without the installation it starts with a hint rather
than an empty window.

## Usage

```bash
claude-voice              # hands-free loop, new session
claude-voice --last       # resume the last voice session
claude-voice --yolo       # tools without asking (bypassPermissions)

claude-voice-ui           # interface in the browser, 127.0.0.1:7331
claude-voice-ui --port N

~/.claude/hooks/voice on|off|toggle|stop|test|voices|status
```

In the terminal loop, saying "stopp" or Ctrl-C ends it. In the interface: click
or hold space to speak, **Esc** stops the running turn including speech output,
and "Beenden" shuts the server down. In the app ⌥Space brings the window
forward from anywhere and starts recording.

All three paths keep **one** agent session open rather than starting a new
process per utterance. Measured, process startup alone used to cost about 13
seconds per sentence. What the open session buys:

- **An answer in ~2 s instead of ~13 s.**
- **Text streams in** as it is written; every finished sentence goes straight to
  speech output instead of waiting for the complete answer.
- **Permissions.** When Claude wants to use a tool that needs confirmation, the
  turn stops. The interface shows a card with the tool name and its parameters,
  the terminal asks a yes/no question that is also read aloud. In the interface
  a permission can be widened to "always this call" or "always this tool", for
  the running session.

**Settings** holds speech output, voice, model, language and permissions. Model
and permissions apply immediately to the running session; switching language
restarts it, because the answer language hangs off the system prompt and that is
fixed per session. Speech recognition switches without a restart.

**History** lists earlier sessions from this directory; one click resumes one of
them.

The permission mode can also be switched directly and applies immediately to the
running session, from "asks first" through to "never ask". The last one is shown
in red, because it turns off every confirmation.

The server requires a token that is generated at startup and appended to the URL
it opens. Without it, any web page you have open in the same browser could
trigger the endpoints - "localhost only" is no protection against that.

## Speech output

Everything speaks through `bin/claude-say`. Four backends, switchable via
`TTS_BACKEND` in the config or `--tts` at startup:

| Backend | Synthesis | Cost | Note |
|---|---|---|---|
| `elevenlabs` | ~1.1 s | credits | best quality, needs the network and a key |
| `edge` | ~0.5 s | – | Microsoft neural voices, free, no key. **Not local** - it goes through an undocumented endpoint |
| `piper` | ~0.7 s | – | local and offline, audibly more synthetic |
| `say` | instant | – | macOS system voice, most brittle quality |

`auto` (the default) takes ElevenLabs if a key is present, otherwise Edge,
Piper, `say`. Backend and voice can be switched in the interface; whatever is
not set up appears greyed out with the reason next to it. A failing backend
always falls back to `say` - silence is the worst answer while someone is
waiting to be spoken to.

```bash
claude-voice --tts piper
claude-voice-ui --tts piper
claude-say --backends        # what is available and active
claude-say --tts edge --voice de-DE-ConradNeural "Text"
```

Why not Kokoro, MLX Audio, Kimi or Gemma: [docs/tts-evaluation.md](docs/tts-evaluation.md).

**Setting up Edge** (free, no key):

```bash
uv tool install edge-tts
edge-tts --list-voices | grep ^de-
```

**Setting up Piper** (local, free):

```bash
uv tool install piper-tts
mkdir -p ~/.claude/piper-voices && cd ~/.claude/piper-voices
B=https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE
curl -fLO $B/thorsten/medium/de_DE-thorsten-medium.onnx
curl -fLO $B/thorsten/medium/de_DE-thorsten-medium.onnx.json
```

Other German voices live under `de/de_DE/` in the same repository (kerstin,
eva_k, karlsson, pavoque, ramona); put the path into `PIPER_MODEL`.

**Setting up ElevenLabs:** if a key is present, it gets used.

```bash
security add-generic-password -a "$USER" -s elevenlabs-api-key -w
claude-say --doctor     # check the key against the API
claude-say --list       # voices and models available to the account
```

Alternatively the environment variable `ELEVENLABS_API_KEY`.

## Configuration

`~/.claude/voice.conf` applies everywhere, `~/.claude/voice-loop.conf` overrides
it for all paths. See `conf/*.example` for every switch. The important ones:

- `CLAUDE_MODEL` - empty means your default. For a conversation a faster model
  is often more pleasant than the strongest one.
- `SILENCE_SEC` - how much silence ends the recording. Raise it if the loop cuts
  you off while you think.
- `MIN_DUR` - short interjections like "ja" are otherwise discarded as a cough.
- `VOCAB` - domain words Whisper is primed with. Without it, "Stop Hook" comes
  back as "Stopthook".

## How it fits together

```
Terminal:  mic ─> sox rec ─> whisper.cpp ─> agent-loop.mjs ────┬─> claude-say ─> 🔈
                  (silence)   (local)       (open session)     └─> yes/no question

Window:    mic ─> webview ─> whisper-server ─> server.mjs ─────┬─> claude-say ─> 🔈
                              (model stays      (open          │   (sentence by
                               loaded)           session)      │    sentence)
                                                               └─> permission card
```

The app is a Tauri shell around the same `server.mjs`: it starts it as a child
process on a free port and loads it into the window. The Agent SDK is TypeScript
only, so the server stays where it is - Rust only adds what a browser tab
cannot do.

The terminal loop talks to `ui/agent-loop.mjs` over two named pipes, one line of
JSON per event. That gives it an open session, permissions and sentence-by-
sentence speech output as well.

Terminal and window register for their lifetime in `~/.claude/voice-locks/` (one
file per pid). The stop hook stays quiet while a living process is listed there,
or every answer would be spoken twice. Dead entries left by a crash are cleaned
up on the next look, and two parallel instances do not deregister each other.

The system prompt limits answers to three or four sentences without markdown -
code blocks read aloud are useless. The interface additionally offers a response
style (concise, thorough, explanatory, factual, casual, socratic, or one you
write yourself).

## Language

Everything inside the repo is English: identifiers, comments, file names, tests,
commit messages. What the user sees stays German and lives behind structural
keys in `app/src/lib/i18n/`, with `messages.ts` as the German catalogue and
`en.ts` typed against it, so a missing translation is a compile error rather
than a label that silently stays German.

## Known limits

- macOS only (`say`, `afplay`, sox recording via CoreAudio; the app is a Cocoa
  bundle).
- No wake word. Hands-free mode records as soon as it gets loud enough.
- The thresholds for voice activity detection are estimated, not measured
  against a real voice. Adjustable at runtime via
  `__voice.tune({ startSec, endSec })`.
- The server binds to `127.0.0.1` only and requires a token, because its
  endpoints start Claude with tool access. Do not put it on a network.
- The DMG is ad-hoc signed, with no Apple certificate. See the Gatekeeper note
  above.

## Tests

```bash
tests/smoke.sh          # everything: scripts, build, unit tests, Rust
node --test tests/      # only the server's unit tests
cd app && node --test src/logic.test.ts
```

`tests/smoke.sh` covers the classes of bug that really did bite during
development: bash 3.2 syntax, argument parsing, precedence of config sources,
lock behaviour. The unit tests check the pure logic - the state machine of the
interface, the transcript parsing, the text preparation for reading aloud.

What cannot be checked here: anything needing a microphone, the Whisper model or
a signed-in `claude` CLI. That boundary is real - a green run does not mean
speech works.
