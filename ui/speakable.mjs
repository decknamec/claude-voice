// Text preparation for reading aloud, the twin of hooks/lib/speakable.sh.
// Both paths have to filter identically: the hook and the CLI loop go through
// the bash version, the UI through this one. If one drifts, the same answer
// sounds different depending on the path. tests/speakable-diff.mjs holds the
// two together via tests/speakable-cases.txt, so a rule changed here is
// changed there as well.
export function speakable (t) {
  return t
    .replace(/```[\s\S]*?```/g, '')                                    // code blocks
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, ' ')                          // list markers
    .replace(/^\s*#{1,6}\s*/gm, '')                                    // headings
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')                         // links and images -> link text
    .replace(/\bhttps?:\/\/\S+/g, ' ')                                 // bare URLs
    .replace(/(?:~|\.{0,2})?(?:\/[\w.@+-]+)+\/([\w.@+-]+)\/?/g, '$1')  // path -> file name
    .replace(/`([^`]*)`/g, '$1')                                       // inline code
    .replace(/[*_>|#]+/g, ' ')                                         // remaining markdown
    .replace(/\s+/g, ' ').trim()
}
