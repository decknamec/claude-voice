/**
 * Whether a finished turn is worth a desktop notification.
 *
 * Pure because the live path is hard to observe: the branch only opens when a
 * turn runs long enough, and forcing that reliably means waiting on a model.
 * All four conditions have to hold, and each one has cost the feature before -
 * the permission check in particular was there while nothing ever asked for
 * the permission, which made the whole thing dead code.
 */
export const SLOW_TURN_MS = 15_000

export function shouldNotify (
  { enabled, hidden, permission, elapsedMs }:
  { enabled: boolean; hidden: boolean; permission: string; elapsedMs: number }
): boolean {
  if (!enabled) return false                      // off unless asked for
  if (!hidden) return false                       // you are looking at it
  if (permission !== 'granted') return false      // never granted, or refused
  return elapsedMs >= SLOW_TURN_MS                // a quick answer needs none
}
