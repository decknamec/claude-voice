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

echo "UI-Server"
t "server.mjs parst" "node --check '$REPO/ui/server.mjs'"
t "Token-Prüfung vorhanden" \
  "grep -q 'x-voice-token' '$REPO/ui/server.mjs' && grep -q 'authorized' '$REPO/ui/server.mjs'" \
  "ohne die kann jede offene Webseite die Endpunkte auslösen"
t "keine Endpunkte ohne Token-Gate" \
  "grep -q \"url.pathname.startsWith('/api/') && !authorized\" '$REPO/ui/server.mjs'"
# Diese Prüfung hätte drei Abbrüche in Folge gefunden: ein umgebautes Markup
# ließ Elemente verschwinden, das Skript griff weiter darauf zu und starb still.
t "jedes \$('#id') hat sein Element im Markup" \
  "node -e \"
     const fs=require('fs'), s=fs.readFileSync('$REPO/ui/index.html','utf8');
     const i=s.indexOf('<script>');
     const da=new Set([...s.slice(0,i).matchAll(/id=[\\\"']([\\w-]+)/g)].map(m=>m[1]));
     const ben=new Set([...s.slice(i).matchAll(/[\\\$]\\('#([\\w-]+)'\\)/g)].map(m=>m[1]));
     const fehlt=[...ben].filter(x=>!da.has(x));
     if (fehlt.length) { console.error(fehlt.join(', ')); process.exit(1) }\"" \
  "ein fehlendes Element bricht das ganze Skript ab"

# Vorher hing das Einklappen komplett in @media (max-width:1000px) — auf breiten
# Fenstern gab es also gar keinen Weg, die Leiste wegzubekommen.
t "Seitenleiste laesst sich in jeder Breite einklappen" \
  "[ -n \"\$(sed '/@media[^{]*width/q' '$REPO/ui/index.html' | grep 'data-side=.off.. main')\" ]" \
  "die Einklapp-Regel darf nicht nur in einer Breiten-Query stehen"

t "hidden schlaegt eigene display-Regeln" \
  "grep -q '\\[hidden\\]{display:none' '$REPO/ui/index.html'" \
  "sonst bleibt ein Overlay mit display:grid trotz hidden sichtbar"

t "index.html JS parst" \
  "node -e \"const s=require('fs').readFileSync('$REPO/ui/index.html','utf8');
     new Function(s.match(/<script>([\\s\\S]*)<\\/script>/)[1].replace(/await /g,''))\""

echo
printf '%d bestanden, %d fehlgeschlagen\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
