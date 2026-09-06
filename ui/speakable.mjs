// Textaufbereitung fürs Vorlesen — der Zwilling von hooks/lib/speakable.sh.
// Beide Wege müssen identisch filtern: der Hook und der CLI-Loop gehen durch die
// Bash-Fassung, die UI durch diese hier. Driftet eine ab, klingt dieselbe Antwort
// je nach Weg anders. tests/speakable-diff.mjs hält die zwei über
// tests/speakable-cases.txt zusammen — wer hier eine Regel ändert, ändert sie dort mit.
export function speakable (t) {
  return t
    .replace(/```[\s\S]*?```/g, '')                                    // Codeblöcke
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, ' ')                          // Listenmarker
    .replace(/^\s*#{1,6}\s*/gm, '')                                    // Überschriften
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')                         // Links/Bilder -> Linktext
    .replace(/\bhttps?:\/\/\S+/g, ' ')                                 // nackte URLs
    .replace(/(?:~|\.{0,2})?(?:\/[\w.@+-]+)+\/([\w.@+-]+)\/?/g, '$1')  // Pfad -> Dateiname
    .replace(/`([^`]*)`/g, '$1')                                       // Inline-Code
    .replace(/[*_>|#]+/g, ' ')                                         // restliches Markdown
    .replace(/\s+/g, ' ').trim()
}
