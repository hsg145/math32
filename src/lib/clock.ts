/* ═══════════════════════════════════════════════════════════════════════════
   Server clock. The countdown must match the teacher's screen for every
   student, so the timer is always computed against Postgres time.
   ═══════════════════════════════════════════════════════════════════════════ */

let offsetMs = 0;
let synced = false;

/** Current server time in epoch milliseconds. */
export const serverNow = (): number => Date.now() + offsetMs;

export const isClockSynced = (): boolean => synced;

/**
 * @param serverIso  `serverNow` returned by the RPC
 * @param rttMs      round-trip time of that RPC
 */
export function syncClock(serverIso: string, rttMs: number) {
  const server = new Date(serverIso).getTime();
  if (!Number.isFinite(server)) return;
  offsetMs = server + rttMs / 2 - Date.now();
  synced = true;
}

/** Milliseconds left until an absolute server timestamp. */
export function msUntil(iso: string | null | undefined, seconds: number): number {
  if (!iso) return seconds * 1000;
  return new Date(iso).getTime() - serverNow();
}

/** Measured round-trip helper. */
export async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; rtt: number }> {
  const t0 = performance.now();
  const value = await fn();
  const rtt = performance.now() - t0;
  return { value, rtt };
}