#!/usr/bin/env bash
# Covers the class of bug that has repeatedly bitten during development:
# bash 3.2 syntax, argument parsing, precedence of config sources, lock
# behaviour. No network, no API calls - runs in a few seconds.
#
#   tests/smoke.sh
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  \033[32mok\033[0m   %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '       %s\n' "$2"; }
# Without -q pipes run to the end: with pipefail a `| grep -q` would kill its
# predecessor via SIGPIPE and count the pipeline as a failure.
t(){ if eval "$2" >/dev/null 2>&1 </dev/null; then ok "$1"; else no "$1" "${3:-}"; fi; }

SH="$REPO/bin/claude-say $REPO/bin/claude-voice $REPO/bin/claude-voice-ui
    $REPO/hooks/speak-answer.sh $REPO/hooks/voice $REPO/hooks/lib/speakable.sh
    $REPO/hooks/lib/voicelock.sh $REPO/hooks/lib/elkey.sh $REPO/install.sh"
# The pattern greps below must not hit this script: it necessarily contains
# the patterns it searches for.
# Normalise onto one line: inside "… $SH" the newlines would otherwise survive
# and eval would see several commands instead of a single grep.
SH=$(echo $SH)
SH_ALL="$SH $0"

echo "Syntax (against /bin/bash - macOS ships 3.2, not 4+)"
for f in $SH_ALL; do
  t "$(basename "$f")" "/bin/bash -n '$f'"
done

echo "bash 4 constructs that only blow up at runtime on macOS"
t "no \${var,,} / \${var^^}" \
  "! grep -qE '[\$][{][A-Za-z_]+(,,|\\^\\^)[}]' $SH" \
  "lowercase via tr instead"
t "no declare -A" "! grep -qE '^\\s*declare -A' $SH"
t "no readarray/mapfile" "! grep -qE '\\b(readarray|mapfile)\\b' $SH"

echo "Variable names that collide with the shell"
t "no LANG= (POSIX locale)" \
  "! grep -qE '^\\s*LANG=' $SH" \
  "WHISPER_LANG instead of LANG, or perl loses its locale"
t "no top-level PATH= or IFS=" "! grep -qE '^(PATH|IFS)=' $SH"

echo "Argument parsing (shift has no effect inside for loops)"
t "claude-voice --tts takes a value" \
  "! /bin/bash '$REPO/bin/claude-voice' --tts piper --help 2>&1 | grep -q 'unbekannt'"
t "claude-voice-ui --tts takes a value" \
  "! /bin/bash '$REPO/bin/claude-voice-ui' --tts piper --help 2>&1 | grep -q 'unbekannt'"
SAYOUT=$(/bin/bash "$REPO/bin/claude-say" --tts say --voice Anna --backends 2>&1)
t "claude-say --tts and --voice together" \
  "printf '%s' \"\$SAYOUT\" | grep -q 'aktiv: *say'" \
  "both flags have to be consumed before the subcommand"

echo "Precedence of config sources"
export VOICELOCK_TESTDIR=""
t "inherited TTS_BACKEND beats the default" \
  "[ \"\$(TTS_BACKEND=piper /bin/bash '$REPO/bin/claude-say' --backends | awk '/aktiv:/{print \$2}')\" = piper ]" \
  "the script default must not overwrite the environment"
t "--tts beats an inherited TTS_BACKEND" \
  "[ \"\$(TTS_BACKEND=piper /bin/bash '$REPO/bin/claude-say' --tts say --backends | awk '/aktiv:/{print \$2}')\" = say ]"

echo "Lock: two speakers, one leaves"
LOCKTMP=$(mktemp -d); export VOICELOCK_DIR="$LOCKTMP/locks"
cat > "$LOCKTMP/hold.sh" <<'EOF'
source "$REPO/hooks/lib/voicelock.sh"
voicelock_acquire; trap voicelock_release EXIT; sleep "$1"
EOF
REPO="$REPO" /bin/bash "$LOCKTMP/hold.sh" 4 & A=$!
REPO="$REPO" /bin/bash "$LOCKTMP/hold.sh" 1 & B=$!
sleep 0.6
t "both hold -> active" "source '$REPO/hooks/lib/voicelock.sh'; voicelock_active"
wait $B; sleep 0.4
t "one gone, other still holds -> still active" \
  "source '$REPO/hooks/lib/voicelock.sh'; voicelock_active" \
  "the exact bug: one takes the lock away from the other"
wait $A; sleep 0.4
t "both gone -> free" "source '$REPO/hooks/lib/voicelock.sh'; ! voicelock_active"
mkdir -p "$VOICELOCK_DIR"; : > "$VOICELOCK_DIR/999999"
t "a dead pid is cleaned up" \
  "source '$REPO/hooks/lib/voicelock.sh'; ! voicelock_active && [ ! -e \"\$VOICELOCK_DIR/999999\" ]"
rm -rf "$LOCKTMP"; unset VOICELOCK_DIR

echo "Text preparation for reading aloud"
src(){ source "$REPO/hooks/lib/speakable.sh"; }
t "code blocks are dropped" \
  "[ -z \"\$(src; printf 'a\\n\`\`\`x\`\`\`\\n' | speakable_text | tr -d 'a ')\" ]"
t "a path becomes a file name" \
  "src; printf '%s' 'siehe /a/b/hook.sh hier' | speakable_text | grep -q 'siehe hook.sh hier'" \
  "not 'the file' - with several paths that turns into gibberish"
t "paragraph clipping cuts at a paragraph boundary" \
  "[ \"\$(src; clip_to_paragraph \$'kurz.\\n\\nzweiter absatz der zu lang ist' 20)\" = 'kurz.' ]"
t "sentence clipping does not cut mid-word" \
  "src; [ \"\$(clip_to_sentence 'Eins. Zwei. Drei.' 12)\" = 'Eins. Zwei.' ]"
# The filter exists twice: in the shell for hook and loop, in JS for the UI.
# That is exactly where they drifted apart (path -> file name vs "the file").
t "shell and UI filter produce the same" \
  "node '$REPO/tests/speakable-diff.mjs'" \
  "detail: node tests/speakable-diff.mjs"

echo "CLI loop on the Agent SDK"
t "agent-loop.mjs parses" "node --check '$REPO/ui/agent-loop.mjs'"
# A process per utterance must not come back: measured, it costs about 13
# seconds per sentence.
t "no claude -p per utterance" \
  "! grep -qE 'claude .*(--resume|--session-id) ' '$REPO/bin/claude-voice'" \
  "the session stays open, see ui/agent-loop.mjs"
t "install.sh links agent-loop.mjs" \
  "grep -q 'ui/agent-loop.mjs' '$REPO/install.sh'" \
  "otherwise the file is missing after install and the loop aborts"
t "the loop finds its file without an install too" \
  "grep -q 'dirname \"\$0\")/..' '$REPO/bin/claude-voice'"

echo "Unit tests"
t "pure logic in the server" "node --test '$REPO/tests/units.test.mjs'"
t "pure logic in the interface" \
  "cd '$REPO/app' && node --test src/logic.test.ts" \
  "missing npm install in app?"

echo "Desktop shell"
# cargo build takes too long for a smoke test, so check what is provable
# without a compiler.
t "microphone permission declared in the bundle" \
  "grep -q NSMicrophoneUsageDescription '$REPO/desktop/src-tauri/Info.plist'" \
  "without the entry macOS hard-kills the app on the first getUserMedia"
t "the window loads the local server, nothing bundled" \
  "grep -q 'WebviewUrl::External' '$REPO/desktop/src-tauri/src/main.rs'"
t "PATH comes from the login shell" \
  "grep -q 'fn login_path' '$REPO/desktop/src-tauri/src/main.rs'" \
  "started from Finder, node is otherwise not findable"
t "cleanup does not hang off closing the window alone" \
  "grep -q 'RunEvent::Exit' '$REPO/desktop/src-tauri/src/main.rs'"
t "the server notices when it is orphaned" \
  "grep -q 'process.ppid === 1' '$REPO/ui/server.mjs'" \
  "otherwise whisper-server outlives the app with its half gigabyte"
t "the token survives a reload" \
  "grep -q \"sessionStorage.setItem('cv-token'\" '$REPO/app/src/lib/api.ts'" \
  "the shell scrubs it from the URL, so Cmd-R would have none left"
# rustup puts cargo in ~/.cargo/bin, but only onto PATH if allowed to during
# install. Account for both.
CARGO=$(command -v cargo || echo "$HOME/.cargo/bin/cargo")
if [ -x "$CARGO" ]; then
  t "Rust helpers" \
    "cd '$REPO/desktop/src-tauri' && '$CARGO' test --quiet 2>&1 | grep -q 'test result: ok'"
else
  printf '  \033[2m--\033[0m   Rust tests skipped: no cargo found\n'
fi
t "desktop build folders are ignored" \
  "grep -q '^desktop/src-tauri/target/' '$REPO/.gitignore'"

echo "React interface"
t "TypeScript is clean" \
  "cd '$REPO/app' && npx --no-install tsc -b --noEmit" \
  "missing npm install in app? then the launcher skips the build"
t "the build produces exactly one file" \
  "cd '$REPO/app' && npx --no-install vite build >/dev/null 2>&1 && [ \"\$(ls dist | wc -l | tr -d ' ')\" = 1 ]" \
  "the page holds the session token, so it must fetch nothing at runtime"
t "the build pulls nothing in from outside" \
  "! grep -qE '<(script|link)[^>]+(src|href)=\"https?:' '$REPO/app/dist/index.html'" \
  "no CDN, no external font"
t "the server prefers the build" \
  "grep -q \"app', 'dist', 'index.html\" '$REPO/ui/server.mjs'"
t "dist is in the gitignore" \
  "grep -q '^app/dist/' '$REPO/.gitignore'" \
  "a 440 kB bundle does not belong in version control"

echo "UI server"
t "server.mjs parses" "node --check '$REPO/ui/server.mjs'"
t "token check present" \
  "grep -q 'x-voice-token' '$REPO/ui/server.mjs' && grep -q 'authorized' '$REPO/ui/server.mjs'" \
  "without it any open web page can trigger the endpoints"
t "no endpoints without the token gate" \
  "grep -q \"url.pathname.startsWith('/api/') && !authorized\" '$REPO/ui/server.mjs'"
echo
printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
