#!/usr/bin/env bash
# Deckt die Fehlerklasse ab, die beim Bau wiederholt zugeschlagen hat:
# bash-3.2-Syntax, Argument-Parsing, Vorrang der Konfigquellen, Lock-Verhalten.
# Kein Netz, keine API-Aufrufe — läuft in wenigen Sekunden.
#
#   tests/smoke.sh
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  \033[32mok\033[0m   %s\n' "$1"; }
no(){ FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '       %s\n' "$2"; }
# Ohne -q laufen Pipes zu Ende: mit pipefail wuerde ein `| grep -q` den
# Vorgaenger per SIGPIPE toeten und die Pipeline als Fehler zaehlen.
t(){ if eval "$2" >/dev/null 2>&1 </dev/null; then ok "$1"; else no "$1" "${3:-}"; fi; }

SH="$REPO/bin/claude-say $REPO/bin/claude-voice $REPO/bin/claude-voice-ui
    $REPO/hooks/speak-answer.sh $REPO/hooks/voice $REPO/hooks/lib/speakable.sh
    $REPO/hooks/lib/voicelock.sh $REPO/hooks/lib/elkey.sh $REPO/install.sh"
# Die Muster-Greps unten dürfen dieses Skript nicht treffen — es enthält die
# gesuchten Muster naturgemäß selbst.
# Auf eine Zeile normalisieren: in "… $SH" blieben die Zeilenumbrüche sonst
# erhalten und eval sähe mehrere Kommandos statt eines einzigen grep.
SH=$(echo $SH)
SH_ALL="$SH $0"

echo "Syntax (mit /bin/bash — macOS liefert 3.2, nicht 4+)"
for f in $SH_ALL; do
  t "$(basename "$f")" "/bin/bash -n '$f'"
done

echo "bash-4-Konstrukte, die auf macOS erst zur Laufzeit knallen"
t "kein \${var,,} / \${var^^}" \
  "! grep -qE '[\$][{][A-Za-z_]+(,,|\\^\\^)[}]' $SH" \
  "Kleinschreibung über tr lösen"
t "kein declare -A" "! grep -qE '^\\s*declare -A' $SH"
t "kein readarray/mapfile" "! grep -qE '\\b(readarray|mapfile)\\b' $SH"

echo "Variablennamen, die mit der Shell kollidieren"
t "kein LANG= (POSIX-Locale)" \
  "! grep -qE '^\\s*LANG=' $SH" \
  "WHISPER_LANG statt LANG — sonst bricht perls Locale weg"
t "kein PATH=/IFS= auf oberster Ebene" "! grep -qE '^(PATH|IFS)=' $SH"

echo "Argument-Parsing (shift wirkt in for-Schleifen nicht)"
t "claude-voice --tts nimmt einen Wert" \
  "! /bin/bash '$REPO/bin/claude-voice' --tts piper --help 2>&1 | grep -q 'unbekannt'"
t "claude-voice-ui --tts nimmt einen Wert" \
  "! /bin/bash '$REPO/bin/claude-voice-ui' --tts piper --help 2>&1 | grep -q 'unbekannt'"
SAYOUT=$(/bin/bash "$REPO/bin/claude-say" --tts say --voice Anna --backends 2>&1)
t "claude-say --tts + --voice zusammen" \
  "printf '%s' \"\$SAYOUT\" | grep -q 'aktiv: *say'" \
  "beide Flags müssen vor dem Unterbefehl verdaut werden"

echo "Vorrang der Konfigquellen"
export VOICELOCK_TESTDIR=""
t "geerbtes TTS_BACKEND schlägt Default" \
  "[ \"\$(TTS_BACKEND=piper /bin/bash '$REPO/bin/claude-say' --backends | awk '/aktiv:/{print \$2}')\" = piper ]" \
  "Skript-Default darf die Umgebung nicht überschreiben"
t "--tts schlägt geerbtes TTS_BACKEND" \
  "[ \"\$(TTS_BACKEND=piper /bin/bash '$REPO/bin/claude-say' --tts say --backends | awk '/aktiv:/{print \$2}')\" = say ]"

echo "Lock: zwei Sprecher, einer geht"
LOCKTMP=$(mktemp -d); export VOICELOCK_DIR="$LOCKTMP/locks"
cat > "$LOCKTMP/hold.sh" <<'EOF'
source "$REPO/hooks/lib/voicelock.sh"
voicelock_acquire; trap voicelock_release EXIT; sleep "$1"
EOF
REPO="$REPO" /bin/bash "$LOCKTMP/hold.sh" 4 & A=$!
REPO="$REPO" /bin/bash "$LOCKTMP/hold.sh" 1 & B=$!
sleep 0.6
t "beide halten -> aktiv" "source '$REPO/hooks/lib/voicelock.sh'; voicelock_active"
wait $B; sleep 0.4
t "einer weg, anderer hält -> weiter aktiv" \
  "source '$REPO/hooks/lib/voicelock.sh'; voicelock_active" \
  "genau der Fehler von vorher: einer nimmt dem anderen das Lock"
wait $A; sleep 0.4
t "beide weg -> frei" "source '$REPO/hooks/lib/voicelock.sh'; ! voicelock_active"
mkdir -p "$VOICELOCK_DIR"; : > "$VOICELOCK_DIR/999999"
t "toter PID wird aufgeräumt" \
  "source '$REPO/hooks/lib/voicelock.sh'; ! voicelock_active && [ ! -e \"\$VOICELOCK_DIR/999999\" ]"
rm -rf "$LOCKTMP"; unset VOICELOCK_DIR

echo "Textaufbereitung fürs Vorlesen"
src(){ source "$REPO/hooks/lib/speakable.sh"; }
t "Codeblöcke fliegen raus" \
  "[ -z \"\$(src; printf 'a\\n\`\`\`x\`\`\`\\n' | speakable_text | tr -d 'a ')\" ]"
t "Pfad wird zum Dateinamen" \
  "src; printf '%s' 'siehe /a/b/hook.sh hier' | speakable_text | grep -q 'siehe hook.sh hier'" \
  "nicht 'die Datei' — das ergibt bei mehreren Pfaden Kauderwelsch"
t "Absatz-Kürzung schneidet an Absatzgrenze" \
  "[ \"\$(src; clip_to_paragraph \$'kurz.\\n\\nzweiter absatz der zu lang ist' 20)\" = 'kurz.' ]"
t "Satz-Kürzung schneidet nicht im Wort" \
  "src; [ \"\$(clip_to_sentence 'Eins. Zwei. Drei.' 12)\" = 'Eins. Zwei.' ]"
# Der Filter gibt es zweimal: in der Shell fuer Hook und Loop, in JS fuer die UI.
# Genau da sind sie auseinandergelaufen (Pfad -> Dateiname vs. "die Datei").
t "Shell- und UI-Filter liefern dasselbe" \
  "node '$REPO/tests/speakable-diff.mjs'" \
  "Details: node tests/speakable-diff.mjs"

echo "CLI-Schleife auf dem Agent SDK"
t "agent-loop.mjs parst" "node --check '$REPO/ui/agent-loop.mjs'"
# Die alte Schleife startete je Aeusserung einen eigenen Prozess. Das darf
# nicht zurueckkommen: es kostete gemessen rund 13 Sekunden pro Satz.
t "kein claude -p je Aeusserung mehr" \
  "! grep -qE 'claude .*(--resume|--session-id) ' '$REPO/bin/claude-voice'" \
  "die Session bleibt offen, siehe ui/agent-loop.mjs"
t "install.sh verlinkt agent-loop.mjs" \
  "grep -q 'ui/agent-loop.mjs' '$REPO/install.sh'" \
  "sonst fehlt die Datei nach der Installation und die Schleife bricht ab"
t "Schleife findet ihre Datei auch ohne Installation" \
  "grep -q 'dirname \"\$0\")/..' '$REPO/bin/claude-voice'"

echo "Einheitentests"
t "reine Logik im Server" "node --test '$REPO/tests/einheiten.test.mjs'"
t "reine Logik in der Oberflaeche" \
  "cd '$REPO/app' && node --test src/logik.test.ts" \
  "npm install im Ordner app fehlt?"

echo "Desktop-Schale"
# cargo build dauert zu lange fuer einen Rauchtest — geprueft wird, was ohne
# Uebersetzer nachweisbar ist.
t "Mikrofon-Erlaubnis im Buendel angemeldet" \
  "grep -q NSMicrophoneUsageDescription '$REPO/desktop/src-tauri/Info.plist'" \
  "ohne den Eintrag beendet macOS die App beim ersten getUserMedia hart"
t "Fenster laedt den lokalen Server, nichts Mitgeliefertes" \
  "grep -q 'WebviewUrl::External' '$REPO/desktop/src-tauri/src/main.rs'"
t "PATH kommt aus der Login-Shell" \
  "grep -q 'fn login_pfad' '$REPO/desktop/src-tauri/src/main.rs'" \
  "aus dem Finder gestartet ist node sonst nicht auffindbar"
t "Aufraeumen haengt nicht nur am Fensterschliessen" \
  "grep -q 'RunEvent::Exit' '$REPO/desktop/src-tauri/src/main.rs'"
t "Server bemerkt, wenn er verwaist" \
  "grep -q 'process.ppid === 1' '$REPO/ui/server.mjs'" \
  "sonst ueberlebt whisper-server mit seinem halben Gigabyte die App"
t "Token ueberlebt ein Neuladen" \
  "grep -q \"sessionStorage.setItem('cv-token'\" '$REPO/app/src/lib/api.ts'" \
  "die Schale putzt es aus der URL, Cmd-R haette danach keins mehr"
# rustup legt cargo nach ~/.cargo/bin, das aber nur in den PATH, wenn man es
# beim Installieren zulaesst. Beides beruecksichtigen.
CARGO=$(command -v cargo || echo "$HOME/.cargo/bin/cargo")
if [ -x "$CARGO" ]; then
  t "Rust-Hilfsfunktionen" \
    "cd '$REPO/desktop/src-tauri' && '$CARGO' test --quiet 2>&1 | grep -q 'test result: ok'"
else
  printf '  \033[2m--\033[0m   Rust-Tests uebersprungen: kein cargo gefunden\n'
fi
t "desktop-Bauordner sind ignoriert" \
  "grep -q '^desktop/src-tauri/target/' '$REPO/.gitignore'"

echo "React-Oberflaeche"
t "TypeScript ist fehlerfrei" \
  "cd '$REPO/app' && npx --no-install tsc -b --noEmit" \
  "npm install im Ordner app fehlt? Dann ueberspringt der Launcher den Bau"
t "Bau erzeugt genau eine Datei" \
  "cd '$REPO/app' && npx --no-install vite build >/dev/null 2>&1 && [ \"\$(ls dist | wc -l | tr -d ' ')\" = 1 ]" \
  "die Seite haelt das Sitzungs-Token, sie darf zur Laufzeit nichts nachladen"
t "Bau laedt nichts von aussen nach" \
  "! grep -qE '<(script|link)[^>]+(src|href)=\"https?:' '$REPO/app/dist/index.html'" \
  "kein CDN, keine externe Schriftart"
t "Server bevorzugt den Bau" \
  "grep -q \"app', 'dist', 'index.html\" '$REPO/ui/server.mjs'"
t "dist steht in der gitignore" \
  "grep -q '^app/dist/' '$REPO/.gitignore'" \
  "ein 440-kB-Buendel gehoert nicht in die Versionsverwaltung"

echo "UI-Server"
t "server.mjs parst" "node --check '$REPO/ui/server.mjs'"
t "Token-Prüfung vorhanden" \
  "grep -q 'x-voice-token' '$REPO/ui/server.mjs' && grep -q 'authorized' '$REPO/ui/server.mjs'" \
  "ohne die kann jede offene Webseite die Endpunkte auslösen"
t "keine Endpunkte ohne Token-Gate" \
  "grep -q \"url.pathname.startsWith('/api/') && !authorized\" '$REPO/ui/server.mjs'"
t "jede Zeichenkette in t() hat eine Uebersetzung" \
  "node '$REPO/tests/i18n-coverage.js' '$REPO/app/src'" \
  "sonst bleibt beim Umschalten stumm Deutsch stehen"

echo
printf '%d bestanden, %d fehlgeschlagen\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
