/**
 * In-memory, per-client-IP rate limiting for the auth BFF routes (login / signup /
 * password-reset).
 *
 * Why here and not in Spring: those endpoints all proxy browser → Next → Spring, and the web
 * app reaches Spring over the internal Docker network, so Spring sees ONE source IP for every
 * user — a per-IP limit there throttles everyone on a shared bucket. Only this layer sees the
 * real client IP: Caddy (the single edge proxy; Cloudflare is DNS-only / grey-cloud) sets
 * X-Forwarded-For on the browser→Next hop. We trust the LAST hop in that header — the one Caddy
 * appends — so a client-supplied X-Forwarded-For prefix can't be used to dodge the limit.
 *
 * Fixed-window counters in a module-level map: fine because the web app runs as a single
 * long-running container. If it's ever scaled to multiple instances this becomes per-instance
 * (limits effectively multiply by instance count) — move to a shared store (Redis) then.
 */
const WINDOWS = new Map<string, { startMs: number; count: number }>();
let lastSweepMs = 0;
const SWEEP_INTERVAL_MS = 10 * 60_000;
const MAX_WINDOW_MS = 60 * 60_000; // the largest window any caller uses (1h) — sweep TTL

/** Real client IP behind Caddy: the LAST X-Forwarded-For hop (Caddy-appended, trustworthy). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

/**
 * Record one hit for (bucket, client-IP) and report whether it's over the limit.
 * @returns ok:true while under the limit; ok:false with retryAfter (seconds) once over.
 */
export function rateLimit(request: Request, bucket: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const key = `${bucket} ${clientIp(request)}`;
  const w = WINDOWS.get(key);
  if (!w || now - w.startMs >= windowMs) {
    WINDOWS.set(key, { startMs: now, count: 1 });
    return { ok: true };
  }
  w.count += 1;
  if (w.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((w.startMs + windowMs - now) / 1000)) };
  }
  return { ok: true };
}

/** A 429 shaped like the other BFF errors (forms read `error`), with a Retry-After header. */
export function tooManyRequests(retryAfter: number): Response {
  return Response.json(
    { error: "Too many attempts. Please wait a moment and try again." },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}

/** Drop counters whose window has fully elapsed so the map can't grow unbounded. */
function sweep(now: number): void {
  if (now - lastSweepMs < SWEEP_INTERVAL_MS) return;
  lastSweepMs = now;
  for (const [k, w] of WINDOWS) {
    if (now - w.startMs > MAX_WINDOW_MS) WINDOWS.delete(k);
  }
}
