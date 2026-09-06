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
           voice-ui/server.mjs voice-ui/index.html \
           hooks/speak-answer.sh hooks/voice hooks/lib/speakable.sh hooks/lib/voicelock.sh; do
    [ -L "$C/$f" ] && rm -f "$C/$f" && echo "  entfernt: $C/$f"
  done
  python3 - "$C/settings.json" <<'PY'
import json,sys,pathlib
p=pathlib.Path(sys.argv[1])
if p.exists():
    s=json.loads(p.read_text())
    for e in s.get("hooks",{}).get("Stop",[]):
        e["hooks"]=[h for h in e.get("hooks",[]) if "speak-answer.sh" not in h.get("command","")]
    p.write_text(json.dumps(s,indent=2)+"\n"); print("  Stop-Hook abgemeldet")
PY
  echo "Deinstalliert. ~/.claude/voice*.conf und das Modell bleiben liegen."
  exit 0
fi

echo "Abhängigkeiten:"
missing=()
for t in whisper-cli rec sox ffmpeg node jq curl python3 say afplay; do
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
link "$REPO/hooks/speak-answer.sh"   "$HOOK"
link "$REPO/hooks/voice"             "$C/hooks/voice"
link "$REPO/hooks/lib/speakable.sh"  "$C/hooks/lib/speakable.sh"
link "$REPO/hooks/lib/voicelock.sh"  "$C/hooks/lib/voicelock.sh"

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
  read -r a
  if [ "$a" = "j" ] || [ "$a" = "J" ]; then
    mkdir -p "$MODEL_DIR"; curl -fL --progress-bar -o "$MODEL" "$MODEL_URL"
  else
    echo "  übersprungen — später: curl -fL -o $MODEL $MODEL_URL"
  fi
fi

echo
echo "Stop-Hook in settings.json:"
python3 - "$C/settings.json" "$HOOK" <<'PY'
import json,sys,pathlib
p,cmd=pathlib.Path(sys.argv[1]),sys.argv[2]
s=json.loads(p.read_text()) if p.exists() else {}
hooks=s.setdefault("hooks",{}); stop=hooks.setdefault("Stop",[])
if not stop: stop.append({"matcher":"","hooks":[]})
entry=stop[0].setdefault("hooks",[])
if any(h.get("command")==cmd for h in entry): print("  war schon registriert")
else:
    entry.append({"type":"command","command":cmd})
    p.write_text(json.dumps(s,indent=2)+"\n"); print("  registriert")
PY

echo
echo "Fertig. Noch zu tun:"
echo "  1) ~/.claude/bin in den PATH (fish: fish_add_path -g ~/.claude/bin)"
echo "  2) Vorlesen anschalten:  ~/.claude/hooks/voice on"
echo "  3) Optional ElevenLabs:  security add-generic-password -a \"\$USER\" -s elevenlabs-api-key -w"
echo "  4) Starten:  claude-voice   oder   claude-voice-ui"
