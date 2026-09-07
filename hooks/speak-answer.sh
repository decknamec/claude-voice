#!/usr/bin/env bash
# Claude Code Stop hook -> reads the last answer aloud (via bin/claude-say).
#
# On/off:      ~/.claude/hooks/voice on|off|status|test
# Config:      ~/.claude/voice.conf  (VOICE, RATE, MAX_CHARS)
# Stays quiet while subagents are running, and in macOS focus mode if
# hooks/lib/focus.sh is present (optional, not part of this repo).
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

# focus.sh is optional and not part of this repo. Where it exists (detecting
# macOS Focus / Do Not Disturb), the hook stays quiet in focus mode.
if [ -f "$HERE/lib/focus.sh" ]; then
  source "$HERE/lib/focus.sh"
  focus_active && exit 0
fi

# While the loop or the UI is speaking for itself, the hook stays mute.
voicelock_active && exit 0

input=$(cat)

running_agents=$(printf '%s' "$input" \
  | jq -r '[.background_tasks[]? | select(.status == "running" and (.type == "subagent" or .type == "workflow"))] | length' \
  2>/dev/null || echo 0)
[ "${running_agents:-0}" -gt 0 ] && exit 0

transcript=$(printf '%s' "$input" | jq -r '.transcript_path // ""')
[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

# Last assistant text message from the JSONL transcript. `fromjson? // empty`
# skips broken or half-written lines instead of letting jq bail out.
raw=$(tail -n 400 "$transcript" \
  | jq -R 'fromjson? // empty' \
  | jq -rs '[.[] | select(.type == "assistant") | .message.content[]?
             | select(.type == "text") | .text] | last // ""' 2>/dev/null || true)
[ -n "$raw" ] || exit 0

# Make it speakable: strip code blocks, paths, URLs and markdown noise, or
# `say` spells out slashes and backticks for minutes.
# Reduce to whole paragraphs first, then make it speakable. The other way round
# the paragraph boundaries would already be gone and only a hard cut remains.
spoken=$(clip_to_paragraph "$raw" "$MAX_CHARS")
spoken=$(printf '%s' "$spoken" | speakable_text)
[ -n "$spoken" ] || exit 0
spoken=$(clip_to_sentence "$spoken" "$MAX_CHARS")

pkill -x say 2>/dev/null || true
pkill -x afplay 2>/dev/null || true
nohup "$HOME/.claude/bin/claude-say" "$spoken" >/dev/null 2>&1 &
disown
