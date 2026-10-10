/** Bounded scheduling utilities for the browser Mapillary still-image inference queue. */
export const FRAME_SETTLE_MS = 1400;
export const MIN_INTERVAL_SECONDS = 10;
export const DEFAULT_INTERVAL_SECONDS = 15;
export const MAX_INTERVAL_SECONDS = 30;
export const MAX_BACKOFF_MS = 5 * 60 * 1000;

export function intervalSeconds(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_INTERVAL_SECONDS;
  return Math.max(MIN_INTERVAL_SECONDS, Math.min(MAX_INTERVAL_SECONDS, Math.round(value)));
}

/** Accept either Retry-After seconds or HTTP-date. Never allow unbounded waiting. */
export function retryAfterMs(header: string | null, now: number, fallbackMs = 60_000): number {
  let wait = fallbackMs;
  if (header && /^\d+(?:\.\d+)?$/.test(header.trim())) {
    wait = Number(header.trim()) * 1000;
  } else if (header) {
    const date = Date.parse(header);
    if (Number.isFinite(date)) wait = date - now;
  }
  if (!Number.isFinite(wait)) wait = fallbackMs;
  return Math.max(15_000, Math.min(MAX_BACKOFF_MS, wait));
}

/** Always debounce image navigation, enforce request spacing, and respect provider cooldown. */
export function queueDelayMs(now: number, lastStarted: number, cooldownUntil: number, seconds: number): number {
  const spacing = lastStarted > 0 ? lastStarted + intervalSeconds(seconds) * 1000 - now : 0;
  return Math.max(FRAME_SETTLE_MS, spacing, cooldownUntil - now);
}
