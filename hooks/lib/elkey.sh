#!/usr/bin/env bash
# Löst den ElevenLabs-Key auf und setzt ELEVENLABS_API_KEY + EL_KEY_SOURCE.
# Bewusst über eine Variable statt stdout — so landet der Key in keinem Log und
# in keiner Prozessliste.
#
# Reihenfolge: Umgebungsvariable > ~/.claude/voice.env > 1Password > Schlüsselbund.
# Die Umgebungsvariable zuerst, damit langlebige Prozesse (Loop, UI) einmal
# auflösen und ihre Kindprozesse den `op read` nicht jedes Mal neu zahlen —
# das kostet sonst 1 bis 4 Sekunden vor jedem gesprochenen Satz.
el_resolve_key() {
  if [ -n "${ELEVENLABS_API_KEY:-}" ]; then EL_KEY_SOURCE="Umgebungsvariable"; return 0; fi

  # Einfachster Weg: Datei mit KEY=WERT, chmod 600, liegt außerhalb des Repos.
  # Bequem, aber im Klartext auf der Platte — schwächer als Schlüsselbund/1Password.
  local envf="$HOME/.claude/voice.env"
  if [ -f "$envf" ]; then
    local v; v=$(grep -m1 '^ELEVENLABS_API_KEY=' "$envf" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'[:space:]')
    if [ -n "$v" ]; then
      ELEVENLABS_API_KEY="$v"; EL_KEY_SOURCE="~/.claude/voice.env"; return 0
    fi
  fi

  if [ -n "${EL_KEY_OP_REF:-}" ] && command -v op >/dev/null 2>&1; then
    local opargs=()
    [ -n "${EL_KEY_OP_ACCOUNT:-}" ] && opargs=(--account "$EL_KEY_OP_ACCOUNT")
    local v; v=$(op read --no-newline "${opargs[@]}" "$EL_KEY_OP_REF" 2>/dev/null)
    if [ -n "$v" ]; then
      ELEVENLABS_API_KEY="$v"; EL_KEY_SOURCE="1Password ($EL_KEY_OP_REF)"; return 0
    fi
  fi

  local k; k=$(security find-generic-password -s elevenlabs-api-key -w 2>/dev/null)
  if [ -n "$k" ]; then
    ELEVENLABS_API_KEY="$k"; EL_KEY_SOURCE="Schlüsselbund"; return 0
  fi

  EL_KEY_SOURCE=""; return 1
}
