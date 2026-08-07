/**
 * In-memory sliding-window limiter for PIN attempts: 5 failures per minute
 * per IP. This lives in process memory, so it resets on redeploy and won't
 * be shared across multiple server instances -- acceptable for a single
 * ~10-person cafe on a single Next.js instance; revisit (e.g. move to
 * Supabase or Redis) before running this behind more than one instance.
 */

const WINDOW_MS = 60_000;
const MAX_FAILURES = 5;

const failures = new Map<string, number[]>();

export function isRateLimited(key: string, now: number): boolean {
  const hits = (failures.get(key) || []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, hits);
  return hits.length >= MAX_FAILURES;
}

export function recordFailure(key: string, now: number): void {
  const hits = (failures.get(key) || []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  failures.set(key, hits);
}

export function clearFailures(key: string): void {
  failures.delete(key);
}

export function requestIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") || "unknown";
}
