#!/usr/bin/env bash
# Whoever is speaking for itself (loop, UI) registers here, and the stop hook
# stays quiet. A directory of pids rather than a single file, so two parallel
# instances do not deregister each other and a crash leaves no lock behind.
# Overridable, so tests do not rummage around in the real directory.
VOICELOCK_DIR="${VOICELOCK_DIR:-$HOME/.claude/voice-locks}"
VOICELOCK_LEGACY="$HOME/.claude/voice-loop.lock"

voicelock_acquire() { mkdir -p "$VOICELOCK_DIR"; : > "$VOICELOCK_DIR/$$"; }
voicelock_release() { rm -f "$VOICELOCK_DIR/$$"; }

# 0 = someone is speaking for itself. Dead pids get cleaned up along the way.
voicelock_active() {
  [ -f "$VOICELOCK_LEGACY" ] && return 0   # Instanzen von vor diesem Umbau
  [ -d "$VOICELOCK_DIR" ] || return 1
  local f pid alive=1
  for f in "$VOICELOCK_DIR"/*; do
    [ -e "$f" ] || continue
    pid=$(basename "$f")
    if kill -0 "$pid" 2>/dev/null; then alive=0; else rm -f "$f"; fi
  done
  return $alive
}
