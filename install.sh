#!/usr/bin/env bash
# Verlinkt dieses Repo nach ~/.claude und prüft die Abhängigkeiten.
# Symlinks statt Kopien: Änderungen im Repo wirken sofort, nichts driftet.
#
#   ./install.sh            installieren
#   ./install.sh --uninstall  Symlinks + Hook-Registrierung entfernen
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"
C="$HOME/.claude"
HOOK="$C/hooks/speak-answer.sh"
MODEL_DIR="$C/whisper-models"
MODEL="$MODEL_DIR/ggml-large-v3-turbo-q5_0.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin"

link() { mkdir -p "$(dirname "$2")"; ln -sfn "$1" "$2"; echo "  $2 -> ${1#$REPO/}"; }

if [ "${1:-}" = "--uninstall" ]; then
  for f in bin/claude-say bin/claude-voice bin/claude-voice-ui \
           voice-ui/server.mjs voice-ui/index.html voice-ui/speakable.mjs \
           hooks/speak-answer.sh hooks/voice hooks/lib/speakable.sh hooks/lib/voicelock.sh hooks/lib/elkey.sh; do
    [ -L "$C/$f" ] && rm -f "$C/$f" && echo "  entfernt: $C/$f"
  done
  if [ -f "$C/settings.json" ]; then
    tmp=$(mktemp)
    jq --arg cmd "$HOOK" '
      .hooks.Stop = [ (.hooks.Stop // [])[]
        | .hooks = [ (.hooks // [])[] | select(.command != $cmd) ] ]
    ' "$C/settings.json" > "$tmp" && mv "$tmp" "$C/settings.json" && echo "  Stop-Hook abgemeldet"
  fi
  echo "Deinstalliert. ~/.claude/voice*.conf und das Modell bleiben liegen."
  exit 0
fi

echo "Abhängigkeiten:"
missing=()
for t in whisper-cli whisper-server rec sox ffmpeg node npm jq curl say afplay; do
  if command -v "$t" >/dev/null 2>&1; then printf "  ok   %s\n" "$t"
  else printf "  FEHLT %s\n" "$t"; missing+=("$t"); fi
done
if [ ${#missing[@]} -gt 0 ]; then
  echo
  echo "Fehlt etwas? Auf macOS:  brew install whisper-cpp sox ffmpeg jq"
  echo "(node über nodejs.org oder brew install node)"
fi

echo
echo "Symlinks:"
link "$REPO/bin/claude-say"          "$C/bin/claude-say"
link "$REPO/bin/claude-voice"        "$C/bin/claude-voice"
link "$REPO/bin/claude-voice-ui"     "$C/bin/claude-voice-ui"
link "$REPO/ui/server.mjs"           "$C/voice-ui/server.mjs"
link "$REPO/ui/index.html"           "$C/voice-ui/index.html"
link "$REPO/ui/speakable.mjs"        "$C/voice-ui/speakable.mjs"
link "$REPO/hooks/speak-answer.sh"   "$HOOK"
link "$REPO/hooks/voice"             "$C/hooks/voice"
link "$REPO/hooks/lib/speakable.sh"  "$C/hooks/lib/speakable.sh"
link "$REPO/hooks/lib/voicelock.sh"  "$C/hooks/lib/voicelock.sh"
link "$REPO/hooks/lib/elkey.sh"      "$C/hooks/lib/elkey.sh"

echo
echo "Konfiguration:"
for f in voice.conf voice-loop.conf; do
  if [ -f "$C/$f" ]; then echo "  $C/$f existiert, bleibt unangetastet"
  else cp "$REPO/conf/$f.example" "$C/$f"; echo "  $C/$f angelegt"; fi
done

echo
echo "Whisper-Modell:"
if [ -f "$MODEL" ]; then
  echo "  vorhanden ($(du -h "$MODEL" | cut -f1))"
else
  echo "  fehlt (~547 MB). Jetzt laden? [j/N]"
  read -r a || a=""
  if [ "$a" = "j" ] || [ "$a" = "J" ]; then
    mkdir -p "$MODEL_DIR"; curl -fL --progress-bar -o "$MODEL" "$MODEL_URL"
  else
    echo "  übersprungen — später: curl -fL -o $MODEL $MODEL_URL"
  fi
fi

echo
echo "UI-Abhängigkeiten:"
if [ -d "$REPO/ui/node_modules/@anthropic-ai/claude-agent-sdk" ]; then
  echo "  Agent SDK vorhanden"
elif command -v npm >/dev/null 2>&1; then
  echo "  installiere Agent SDK…"
  (cd "$REPO/ui" && npm install --silent) && echo "  ok" || echo "  FEHLGESCHLAGEN — später: cd ui && npm install"
else
  echo "  npm fehlt — die Browser-UI bleibt ohne Agent SDK unbenutzbar"
fi

echo
echo "Piper (lokales TTS, optional):"
if command -v piper >/dev/null 2>&1 || [ -x "$HOME/.local/bin/piper" ]; then
  echo "  piper vorhanden"
else
  echo "  nicht installiert — mit uv:  uv tool install piper-tts"
fi
PV="$C/piper-voices/de_DE-thorsten-medium.onnx"
if [ -f "$PV" ]; then echo "  deutsche Stimme vorhanden"
else echo "  keine Stimme — siehe README, Abschnitt \"Piper einrichten\""; fi

echo
echo "Stop-Hook in settings.json:"
SETTINGS="$C/settings.json"
ADD_HOOK='
  .hooks //= {} | .hooks.Stop //= [{matcher: "", hooks: []}]
  | .hooks.Stop[0].hooks += [{type: "command", command: $cmd}]'
if [ ! -f "$SETTINGS" ]; then
  jq -n --arg cmd "$HOOK" '{hooks:{Stop:[{matcher:"",hooks:[{type:"command",command:$cmd}]}]}}' \
    > "$SETTINGS" && echo "  angelegt und registriert"
elif ! jq -e . "$SETTINGS" >/dev/null 2>&1; then
  # Wichtig: hier NICHT neu schreiben. Eine unlesbare settings.json ist meist eine
  # volle Konfiguration mit einem Tippfehler — die wäre sonst weg.
  echo "  $SETTINGS ist kein gültiges JSON — unangetastet gelassen."
  echo "  Von Hand nachtragen: .hooks.Stop[0].hooks += [{type:\"command\", command:\"$HOOK\"}]"
elif jq -e --arg cmd "$HOOK" '[.hooks.Stop[]?.hooks[]?.command] | index($cmd)' \
       "$SETTINGS" >/dev/null 2>&1; then
  echo "  war schon registriert"
else
  BAK="$SETTINGS.bak.$(date +%Y%m%d%H%M%S)"
  cp "$SETTINGS" "$BAK"
  tmp=$(mktemp)
  if jq --arg cmd "$HOOK" "$ADD_HOOK" "$SETTINGS" > "$tmp" && [ -s "$tmp" ]; then
    mv "$tmp" "$SETTINGS"; echo "  registriert (Sicherung: ${BAK##*/})"
  else
    rm -f "$tmp" "$BAK"
    echo "  FEHLGESCHLAGEN — settings.json unverändert" >&2
  fi
fi

echo
echo "Fertig. Noch zu tun:"
echo "  1) ~/.claude/bin in den PATH (fish: fish_add_path -g ~/.claude/bin)"
echo "  2) Vorlesen anschalten:  ~/.claude/hooks/voice on"
echo "  3) Optional ElevenLabs:  security add-generic-password -a \"\$USER\" -s elevenlabs-api-key -w"
echo "  4) Starten:  claude-voice   oder   claude-voice-ui"
echo "  5) Prüfen:   tests/smoke.sh"
