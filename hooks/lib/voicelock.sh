#!/usr/bin/env bash
# Wer gerade selbst spricht (Loop, UI), meldet sich hier an — dann schweigt der
# Stop-Hook. Ein PID-Verzeichnis statt einer einzelnen Datei, damit zwei parallele
# Instanzen sich nicht gegenseitig abmelden und ein Absturz kein Lock hinterlässt.
# Überschreibbar, damit Tests nicht im echten Verzeichnis herumfuhrwerken.
VOICELOCK_DIR="${VOICELOCK_DIR:-$HOME/.claude/voice-locks}"
VOICELOCK_LEGACY="$HOME/.claude/voice-loop.lock"

voicelock_acquire() { mkdir -p "$VOICELOCK_DIR"; : > "$VOICELOCK_DIR/$$"; }
voicelock_release() { rm -f "$VOICELOCK_DIR/$$"; }

# 0 = jemand spricht gerade selbst. Tote PIDs werden nebenbei aufgeräumt.
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
