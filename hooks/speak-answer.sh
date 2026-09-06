#!/usr/bin/env bash
# Claude Code Stop hook -> liest die letzte Antwort vor (via bin/claude-say).
#
# An/Aus:      ~/.claude/hooks/voice on|off|status|test
# Konfig:      ~/.claude/voice.conf  (VOICE, RATE, MAX_CHARS)
# Schweigt, solange Subagents laufen — und im macOS-Fokusmodus, falls
# hooks/lib/focus.sh vorhanden ist (optional, nicht Teil des Repos).
set -euo pipefail

STATE="$HOME/.claude/voice-enabled"
[ -f "$STATE" ] || exit 0

VOICE="Anna"
RATE=190
MAX_CHARS=600
# shellcheck disable=SC1090
[ -f "$HOME/.claude/voice.conf" ] && source "$HOME/.claude/voice.conf"

HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/lib/speakable.sh"
source "$HERE/lib/voicelock.sh"

# focus.sh ist optional und gehört nicht zu diesem Repo — wer es hat (macOS
# Focus/"Nicht stören" erkennen), bei dem schweigt der Hook im Fokusmodus.
if [ -f "$HERE/lib/focus.sh" ]; then
  source "$HERE/lib/focus.sh"
  focus_active && exit 0
fi

# Sprechen Loop oder UI gerade selbst, bleibt der Hook stumm.
voicelock_active && exit 0

input=$(cat)

running_agents=$(printf '%s' "$input" \
  | jq -r '[.background_tasks[]? | select(.status == "running" and (.type == "subagent" or .type == "workflow"))] | length' \
  2>/dev/null || echo 0)
[ "${running_agents:-0}" -gt 0 ] && exit 0

transcript=$(printf '%s' "$input" | jq -r '.transcript_path // ""')
[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

# Letzte Assistant-Textnachricht aus dem JSONL-Transcript. `fromjson? // empty`
# überspringt kaputte/teilgeschriebene Zeilen, statt jq aussteigen zu lassen.
raw=$(tail -n 400 "$transcript" \
  | jq -R 'fromjson? // empty' \
  | jq -rs '[.[] | select(.type == "assistant") | .message.content[]?
             | select(.type == "text") | .text] | last // ""' 2>/dev/null || true)
[ -n "$raw" ] || exit 0

# Vorlesbar machen: Codeblöcke, Pfade, URLs und Markdown-Rauschen raus — sonst
# buchstabiert `say` minutenlang Slashes und Backticks.
# Erst auf ganze Absätze eindampfen, dann vorlesbar machen. Andersherum wären
# die Absatzgrenzen schon weg und es bliebe nur der harte Schnitt.
spoken=$(clip_to_paragraph "$raw" "$MAX_CHARS")
spoken=$(printf '%s' "$spoken" | speakable_text)
[ -n "$spoken" ] || exit 0
spoken=$(clip_to_sentence "$spoken" "$MAX_CHARS")

pkill -x say 2>/dev/null || true
pkill -x afplay 2>/dev/null || true
nohup "$HOME/.claude/bin/claude-say" "$spoken" >/dev/null 2>&1 &
disown
