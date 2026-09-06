#!/usr/bin/env bash
# Gemeinsame Text-Aufbereitung fürs Vorlesen. Genutzt von speak-answer.sh (Hook)
# und ~/.claude/bin/claude-voice (Freisprech-Loop).

# stdin -> vorlesbarer Fließtext auf stdout.
# Wirft alles raus, was `say` sonst buchstabieren würde.
speakable_text() {
  perl -0777 -pe '
    s/```.*?```//gs;                       # Codeblöcke
    s/^\s*(?:[-*+]|\d+\.)\s+/ /gm;         # Listenmarker
    s/^\s*#{1,6}\s*//gm;                   # Überschriften
    s/!?\[([^\]]*)\]\([^)]*\)/$1/g;        # Links/Bilder -> Linktext
    s{\bhttps?://\S+}{ }g;                 # nackte URLs
    s{(?:~|\.{0,2})?(?:/[\w.@+-]+){2,}/?}{ die Datei }g;  # Pfade
    s/`([^`]*)`/$1/g;                      # Inline-Code
    s/[*_>|#]+/ /g;                        # restliches Markdown
    s/\s+/ /g; s/^\s+|\s+$//g;
  '
}

# $1 = Text, $2 = max Zeichen. Kürzt auf die letzte Satzgrenze davor.
clip_to_sentence() {
  local text="$1" max="${2:-600}"
  if [ "${#text}" -gt "$max" ]; then
    printf '%s' "${text:0:$max}" | perl -pe 's/(.*[.!?])[^.!?]*$/$1/s'
  else
    printf '%s' "$text"
  fi
}
