// TTL helpers shared by the kv, lists, and cleanup modules so they agree on
// what "no expiry" and "expired" mean.

/**
 * Absolute expiry for an optional TTL. A missing, zero, or negative TTL means
 * the row never expires, matching the official memory/Redis/Postgres adapters
 * (they all treat a falsy `ttlMs` as "no TTL").
 */
export function expiresAtFromTtl(
  now: number,
  ttlMs: number | undefined
): number | undefined {
  return ttlMs !== undefined && ttlMs > 0 ? now + ttlMs : undefined;
}

export function isExpired(expiresAt: number | undefined, now: number): boolean {
  return expiresAt !== undefined && expiresAt <= now;
}
