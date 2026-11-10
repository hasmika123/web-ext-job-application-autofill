/**
 * Share one in-flight call between identical concurrent requests (server only, per process).
 *
 * Why (the "We couldn't load your workspace" panel): every page of a tenant workspace calls `GET /api/me/tenant` from its layout, and the
 * shell's menu links prefetch every other page in the menu, so ONE page view makes about fourteen layout renders in the same second and
 * therefore fourteen identical session calls with the same token. Under load (a cold API, a busy machine, several people signing in at once)
 * the last of them queue behind the others and some miss the call's time budget; when the one that misses is the navigation itself, the
 * member sees the "try again" panel, and pressing it works because the burst is over. Sharing the call turns the fourteen into one.
 *
 * Only SUCCESS is remembered, for `ttlMs` (a couple of seconds, long enough to cover the burst). A failure is never kept, so "Try again" always
 * asks the API afresh and a real outage is never papered over. The key must contain everything that decides the answer (the host and the
 * bearer token): two people never share an entry. Keys are held in memory only and are never logged.
 */
export interface SharedCalls<T> {
  /** The answer for `key`: the call already in flight or finished within the window, else a new one made by `run`. */
  share(key: string, run: () => Promise<T>): Promise<T>;
  /** Forget everything (tests, sign-out). */
  clear(): void;
}

export function createSharedCalls<T>(opts: { ttlMs: number; isShareable: (value: T) => boolean; now?: () => number; maxEntries?: number }): SharedCalls<T> {
  const { ttlMs, isShareable } = opts;
  const now = opts.now ?? Date.now;
  const maxEntries = opts.maxEntries ?? 500;
  const entries = new Map<string, { at: number; promise: Promise<T> }>();

  return {
    share(key, run) {
      const t = now();
      const hit = entries.get(key);
      if (hit && t - hit.at < ttlMs) return hit.promise;
      if (entries.size >= maxEntries) {
        for (const [k, e] of entries) if (t - e.at >= ttlMs) entries.delete(k);
        if (entries.size >= maxEntries) entries.clear(); // a flood of distinct keys: start over rather than grow
      }
      const entry = { at: t, promise: undefined as unknown as Promise<T> };
      entry.promise = run().then(
        (value) => {
          if (!isShareable(value) && entries.get(key) === entry) entries.delete(key);
          return value;
        },
        (error) => {
          if (entries.get(key) === entry) entries.delete(key);
          throw error;
        },
      );
      entries.set(key, entry);
      return entry.promise;
    },
    clear() {
      entries.clear();
    },
  };
}
