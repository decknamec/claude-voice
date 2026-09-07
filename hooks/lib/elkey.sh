#!/usr/bin/env bash
# Resolves the ElevenLabs key and sets ELEVENLABS_API_KEY + EL_KEY_SOURCE.
# Deliberately through a variable rather than stdout, so the key lands in no log
# and in no process list.
#
# Order: environment variable > ~/.claude/voice.env > 1Password > keychain.
# The environment variable comes first so that long-lived processes (loop, UI)
# resolve once and their children do not pay for `op read` every time, which
# otherwise costs 1 to 4 seconds before every spoken sentence.
# Always defined, so that `set -u` does not bail out on a read.
EL_KEY_SOURCE="${EL_KEY_SOURCE:-}"
# The UI cannot translate prose, so every source carries a token beside its
# German label. EL_KEY_SOURCE_ARG holds the part that is a name, not a word.
EL_KEY_SOURCE_ID="${EL_KEY_SOURCE_ID:-}"
EL_KEY_SOURCE_ARG="${EL_KEY_SOURCE_ARG:-}"
el_found() { EL_KEY_SOURCE_ID="$1"; EL_KEY_SOURCE="$2"; EL_KEY_SOURCE_ARG="$3"; }

el_resolve_key() {
  if [ -n "${ELEVENLABS_API_KEY:-}" ]; then el_found "keyEnv" "Umgebungsvariable" ""; return 0; fi

  # Simplest route: a file with KEY=VALUE, chmod 600, outside the repo.
  # Convenient, but in cleartext on disk, which is weaker than keychain or
  # 1Password.
  local envf="$HOME/.claude/voice.env"
  if [ -f "$envf" ]; then
    local v; v=$(grep -m1 '^ELEVENLABS_API_KEY=' "$envf" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'[:space:]')
    if [ -n "$v" ]; then
      ELEVENLABS_API_KEY="$v"; el_found "keyFile" "~/.claude/voice.env" ""; return 0
    fi
  fi

  if [ -n "${EL_KEY_OP_REF:-}" ] && command -v op >/dev/null 2>&1; then
    local opargs=()
    [ -n "${EL_KEY_OP_ACCOUNT:-}" ] && opargs=(--account "$EL_KEY_OP_ACCOUNT")
    local v; v=$(op read --no-newline "${opargs[@]}" "$EL_KEY_OP_REF" 2>/dev/null)
    if [ -n "$v" ]; then
      ELEVENLABS_API_KEY="$v"; el_found "keyOnePassword" "1Password ($EL_KEY_OP_REF)" "$EL_KEY_OP_REF"; return 0
    fi
  fi

  local k; k=$(security find-generic-password -s elevenlabs-api-key -w 2>/dev/null)
  if [ -n "$k" ]; then
    ELEVENLABS_API_KEY="$k"; el_found "keyKeychain" "Schlüsselbund" ""; return 0
  fi

  EL_KEY_SOURCE=""; EL_KEY_SOURCE_ID=""; EL_KEY_SOURCE_ARG=""; return 1
}
