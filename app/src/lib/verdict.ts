/**
 * Reading a spoken yes or no.
 *
 * This decides whether a tool runs, so it matches whole utterances rather than
 * looking for a keyword inside one. Membership-in-a-sentence is too generous:
 * "weiter so" and "ja also eigentlich wollte ich etwas anderes" both contain a
 * yes and neither is one. Anything not listed comes back `null`, which leaves
 * the request standing.
 *
 * The asymmetry is the point. A misheard no only asks again; a misheard yes
 * runs something nobody agreed to.
 */
const YES = new Set([
  'ja', 'ja bitte', 'ja gerne', 'ja klar', 'jo', 'jau', 'jep',
  'klar', 'gerne', 'okay', 'ok', 'passt', 'sicher', 'mach', 'machs',
  'erlaube', 'erlaubt', 'erlauben', 'genehmigt', 'einverstanden',
  'yes', 'yes please', 'yeah', 'yep', 'yup', 'sure', 'go ahead',
  'allow', 'allowed', 'approved', 'do it'
])
const NO = new Set([
  'nein', 'nein danke', 'nee', 'ne', 'noe', 'stopp', 'stop', 'halt',
  'lass', 'lass es', 'abbrechen', 'nicht', 'verweigern', 'abgelehnt',
  'no', 'no thanks', 'nope', 'nah', 'deny', 'denied', 'cancel', 'never'
])

export function readVerdict (said: string): boolean | null {
  const phrase = said
    .toLowerCase()
    .replace(/[^\p{Letter}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
  if (!phrase) return null
  if (YES.has(phrase)) return true
  if (NO.has(phrase)) return false
  return null
}

/**
 * What a finished recording means, given whether a permission is waiting.
 *
 * Pure so the rule can be checked without a microphone: driving the real
 * hands-free loop needs live audio, and the branch that runs a tool is the
 * last one that should rest on a manual test.
 */
export type Route =
  | { kind: 'nothing' }
  | { kind: 'answer'; allow: boolean }
  | { kind: 'askAgain' }
  | { kind: 'turn'; said: string }

export function routeUtterance (said: string, permissionPending: boolean): Route {
  if (!said.trim()) return { kind: 'nothing' }
  if (!permissionPending) return { kind: 'turn', said }
  const verdict = readVerdict(said)
  // Anything that is not a clear answer leaves the request standing. Passing
  // it on as a turn would strand the permission and look swallowed.
  return verdict === null ? { kind: 'askAgain' } : { kind: 'answer', allow: verdict }
}
