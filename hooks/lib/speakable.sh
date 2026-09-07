#!/usr/bin/env bash
# Shared text preparation for reading aloud. Used by speak-answer.sh (hook)
# and ~/.claude/bin/claude-voice (hands-free loop).

# stdin -> speakable prose on stdout.
# Throws out everything `say` would otherwise spell out.
speakable_text() {
  perl -0777 -pe '
    s/```.*?```//gs;                       # code blocks
    s/^\s*(?:[-*+]|\d+\.)\s+/ /gm;         # list markers
    s/^\s*#{1,6}\s*//gm;                   # headings
    s/!?\[([^\]]*)\]\([^)]*\)/$1/g;        # links and images -> link text
    s{\bhttps?://\S+}{ }g;                 # bare URLs
    s{(?:~|\.{0,2})?(?:/[\w.@+-]+)+/([\w.@+-]+)/?}{$1}g;  # path -> file name
    s/`([^`]*)`/$1/g;                      # inline code
    s/[*_>|#]+/ /g;                        # remaining markdown
    s/\s+/ /g; s/^\s+|\s+$//g;
  '
}

# $1 = raw text, $2 = max characters. Takes whole paragraphs while they fit:
# a hard-cut sentence sounds like a dropped connection.
clip_to_paragraph() {
  local raw="$1" max="${2:-600}" out="" para
  while IFS= read -r para; do
    [ -z "$para" ] && continue
    if [ -z "$out" ]; then out="$para"
    elif [ $(( ${#out} + ${#para} + 2 )) -le "$max" ]; then out="$out"$'\n\n'"$para"
    else break; fi
  done < <(printf '%s' "$raw" | perl -0777 -pe 's/\n{2,}/\n\x00\n/g' | tr '\0' '\n' | perl -0777 -pe 's/\n(?!\n)/ /g')
  printf '%s' "${out:-$raw}"
}

# $1 = text, $2 = max characters. Clips to the last sentence boundary before it.
clip_to_sentence() {
  local text="$1" max="${2:-600}"
  if [ "${#text}" -gt "$max" ]; then
    printf '%s' "${text:0:$max}" | perl -pe 's/(.*[.!?])[^.!?]*$/$1/s'
  else
    printf '%s' "$text"
  fi
}
