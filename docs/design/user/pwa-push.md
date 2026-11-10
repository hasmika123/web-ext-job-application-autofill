# Design — PWA, web push, offline and performance budgets (area `user`, epic U17)

Status: decided 2026-10-11 (Fable). Next 16 App Router, `output: 'standalone'`, no `next-pwa`.

## 0. Decisions

1. **Installable PWA for the signed-in app only.** `web/public/manifest.webmanifest` (`start_url:
   /dashboard?src=pwa`, `display: standalone`, `scope: /`, icons 192/512 + maskable from
   `brand/`, theme/background colours from `theme-v2`), linked from the root layout; marketing pages
   stay plain. `id: /dashboard` so updates keep one install.
2. **Hand-rolled service worker** `web/public/sw.js` (no build plugin, no Workbox): versioned by a
   build-time constant injected via `next.config` `env` + a `/sw.js` route that sets
   `Cache-Control: no-cache`. Strategies: **static assets** (`/_next/static/*`, fonts, icons) =
   cache-first; **app HTML** = network-only with an **offline fallback page** (`/offline`, a static
   route) — we do not cache personalized HTML (shared devices, stale data); **API GETs** =
   network-only. Data offline (read-only last board/jobs) is **P2** via IndexedDB snapshots written
   by the pages themselves, not by the SW.
3. **Web push** through the same SW (`push`, `notificationclick`, `pushsubscriptionchange`) — the
   server side is in `alerts-notifications.md` §3. Prompt etiquette: never on load; after creating an
   alert or saving a second job; pre-prompt sheet; "Not now" snoozes 14 days.
4. **Install prompt etiquette**: capture `beforeinstallprompt`; show the "Add Kiwiply to your home
   screen" card on the dashboard after the **second visit** or after the first saved job, dismissible
   (30-day snooze). iOS: a 2-step illustrated sheet (Share → Add to Home Screen) shown once; push on
   iOS requires the installed app, which the notifications settings explains.
5. **Performance budgets (enforced in CI with Lighthouse CI on the mock API)**: per signed-in route
   LCP ≤ 2.5 s and INP ≤ 200 ms on the mobile preset (throttled 4G, 4× CPU), CLS ≤ 0.1, **route JS ≤
   220 KB gzipped**, total transfer on first load ≤ 600 KB, images via `next/image` only, fonts
   `display: swap` (exist). Budgets live in `web/lighthouserc.json`; a failing budget fails the PR.
6. **Perceived speed**: every route has `loading.tsx` skeletons matching the board layout (three
   exist); optimistic UI for save/hide/status/alert toggle with undo toasts; prefetch the detail
   sheet data on card press-down; `Suspense` boundaries per card row on the dashboard.
7. **Update flow**: new SW → `waiting` → a small "Update available · Reload" pill in the shell; never
   force-reload mid-edit.

## 1. Files

```
web/public/manifest.webmanifest        web/public/sw.js            web/public/icons/{192,512,maskable-512}.png (from brand/)
web/src/app/offline/page.tsx           web/src/app/sw.js/route.ts (serves public/sw.js with no-cache + version header)
web/src/lib/pwa.ts                      register SW (only when `navigator.serviceWorker` and not in dev), install prompt capture, snooze keys, push subscribe helper (`alerts-notifications.md`)
web/src/components/app-shell/{InstallCard,UpdatePill}.tsx
web/lighthouserc.json + .github/workflows/ci.yml job "web-lighthouse" (uses scripts/mock-api.mjs + demo account)
```

## 2. Service worker (shape)

```js
const VERSION = "__SW_VERSION__";          // replaced at build (git sha)
const STATIC = `static-${VERSION}`;
self.addEventListener("install", e => e.waitUntil(caches.open(STATIC).then(c => c.addAll(["/offline", "/icons/192.png"]))));   // skipWaiting only after the user taps Reload
self.addEventListener("activate", e => e.waitUntil(/* delete caches not named STATIC */));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.startsWith("/_next/static/") || u.pathname.startsWith("/icons/") || u.pathname.startsWith("/v2/")) return e.respondWith(cacheFirst(e.request));
  if (e.request.mode === "navigate") return e.respondWith(fetch(e.request).catch(() => caches.match("/offline")));
  // API + everything else: network only
});
self.addEventListener("push", e => { const d = e.data?.json() ?? {}; e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: "/icons/192.png", badge: "/icons/badge.png", tag: d.tag, data: { link: d.link }, renotify: !!d.tag })); });
self.addEventListener("notificationclick", e => { e.notification.close(); e.waitUntil(clients.matchAll({ type: "window" }).then(ws => { const w = ws.find(x => x.url.includes(location.origin)); return w ? w.focus().then(() => w.navigate(e.notification.data.link)) : clients.openWindow(e.notification.data.link); })); });
self.addEventListener("pushsubscriptionchange", e => e.waitUntil(resubscribe()));   // POST the new subscription
```
Security: the SW never caches `/api/*` or any HTML; `tag` groups by `group_key`; links are same-origin only (validated server-side before sending).

## 3. Offline (P2, U17.4)

Pages that matter offline on a phone: Applications list (read), a job detail you opened, saved jobs.
Each page writes a compact snapshot to IndexedDB (`kiwiply-snap`, per user id, ≤ 500 KB) after a
successful load; on fetch failure the page renders the snapshot with an "Offline — showing what you
had at 10:42" banner and disables writes (queued writes are **not** attempted — simpler and honest).
Sign-out clears the store.

## 4. Failure modes

| Failure | Behaviour |
|---|---|
| SW registration fails (private mode, old browser) | app works as a normal site; no prompts |
| Stale SW serving old static chunks after deploy | versioned cache names + `UpdatePill`; HTML is never cached so routes always load current chunk manifests; chunk 404 → full reload once (guard flag) |
| Push permission denied | recorded; settings explains; never re-asked |
| `beforeinstallprompt` never fires (iOS, desktop Safari) | iOS sheet; desktop: nothing |
| Lighthouse flake in CI | 3 runs, median; budgets apply to median |

## 5. Tests

- Playwright: SW registers on `/dashboard` (demo account), `/offline` served when the network is blocked, install card appears on the 2nd visit, update pill on a version bump (two builds in CI is heavy → unit-test the pill logic instead), push `showNotification` via a fake push event in the SW context (Playwright `serviceWorker` handle).
- Unit (vitest): `pwa.ts` snooze keys, prompt gating, subscribe helper request shape.
- CI: Lighthouse CI budgets on `/dashboard`, `/jobs`, `/applications`, `/assistant` at the mobile preset.

## 6. Rollout

U17.1 manifest + SW + offline page + register → U17.2 install card + iOS sheet + update pill →
U17.3 Lighthouse CI budgets + skeleton/optimistic pass → U17.4 IndexedDB snapshots (P2). Push UI is
U7.4 (depends on U17.1).
