# Design — Push, badges and offline on phones (area `mob`, epics N4, N5)

Status: decided 2026-10-11. **Extends, does not replace**: `docs/design/user/pwa-push.md`
(SW strategies, install etiquette, offline page, snapshots P2) and `alerts-notifications.md`
(engine, `push_subscription`, VAPID, pre-prompt etiquette, kinds). This doc owns what is
*mobile-specific*: the iOS install gate, badges, notification actions, subscription liveness,
per-platform caps, the network layer and low-data mode.

## 0. Decisions

1. **iOS push is gated on install, and the UI says so before asking.** Flow on iOS Safari (not
   standalone): the pre-prompt sheet becomes the "Add to Home Screen" sheet; the permission
   prompt is only ever requested in standalone mode after a tap. Never show a dead prompt.
2. **Badge = unread count, cleared on open.** `navigator.setAppBadge(n)` from the SW on `push`
   and from the page after `/api/notifications` loads; `clearAppBadge()` when the bell opens or
   the list is read-all. Android (installed) and iOS 16.4+ (installed) support it; elsewhere no-op.
3. **Actionable notifications.** Per kind, ≤ 2 actions in the SW `showNotification`:
   `ALERT_HITS` → *See jobs* / *Mute this alert*; `APP_STATUS` → *Open* / *Add note*;
   `INTERVIEW_REMINDER` → *Open* / *Prep* (U9); `HANDOFF_*` never pushes to the phone.
   Actions POST through the SW with the session cookie (same origin) and fall back to opening
   the deep link.
4. **Subscriptions are verified on every app open.** iOS is known to drop subscriptions after
   inactivity; on `visibilitychange → visible` the page compares
   `registration.pushManager.getSubscription()` with the server's record for this device
   (`GET /api/push/subscriptions/me?endpointHash=`), re-subscribes silently when permission is
   still `granted`, and marks the server row `disabled` when permission became `denied`.
5. **Mobile etiquette caps** (runtime settings, A5.1): installed-phone devices get **≤ 3 pushes/day**
   by default (desktop ≤ 10 per the engine), quiet hours default from the device tz, a one-tap
   "mute this kind" action, and every notification's settings deep link (`/settings/notifications
   ?kind=`). The engine's policy step reads the device class from the subscription row
   (`platform` column) — one new column, no new tables.
6. **One fetch layer for the app** (`web/src/lib/net.ts`): 10 s timeout on GET (30 s uploads),
   one retry with jitter on network errors/502/503 for idempotent requests, `online/offline`
   events + a failed-fetch probe drive an **offline banner**, and `navigator.connection.saveData`
   / `effectiveType ∈ {slow-2g, 2g}` flips **low-data mode** (no prefetch, smaller `next/image`
   sizes, no autoplay).
7. **Offline writes: only the share outbox** (`share-target-and-handoff.md` §0.6). Everything else
   stays read-only offline (pwa-push.md §3) — simpler and honest.

## 1. Data model (additive)

```
ALTER TABLE push_subscription ADD COLUMN platform VARCHAR(16) NULL,   -- ios-pwa | android-pwa | desktop | ios-native | android-native
  ADD COLUMN display_mode VARCHAR(12) NULL, ADD COLUMN last_seen_at TIMESTAMP NULL, ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'WEBPUSH';  -- WEBPUSH | NATIVE (N6.4)
```
`notification_preference.matrix_json` gains `mobileDailyCap` (default 3) and `lockScreenPrivate`
is already there.

## 2. API (additions to U7.4)

```
POST /api/push/subscriptions {endpoint, keys, platform, displayMode, userAgent}   (exists; +fields)
GET  /api/push/subscriptions/me?endpointHash=…   → {exists, disabled}           (liveness check; 60/min)
POST /api/push/subscriptions/{id}/seen                                            (last_seen_at; batched by the page, ≤ 1/hour)
POST /api/notifications/{id}/action {action: "MUTE_ALERT"|"ADD_NOTE"|…, payload?}   (SW actions; CSRF: same-origin + SameSite cookie + Origin check from U1.1)
GET  /api/push/subscriptions         → [{id, platform, displayMode, lastSeenAt, disabled}]   (Settings "Your devices")
```

## 3. Service worker additions (`web/public/sw.js`, on top of pwa-push.md §2)

```js
self.addEventListener("push", e => { const d = e.data?.json() ?? {};
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title, { body: d.body, icon: "/icons/192.png", badge: "/icons/badge-96.png", tag: d.tag, renotify: !!d.tag,
      data: { link: d.link, id: d.id, kind: d.kind }, actions: ACTIONS[d.kind] ?? [] }),
    "setAppBadge" in navigator && typeof d.unread === "number" ? navigator.setAppBadge(d.unread) : Promise.resolve() ])); });
self.addEventListener("notificationclick", e => { e.notification.close();
  if (e.action === "mute")  return e.waitUntil(fetch(`/api/notifications/${e.notification.data.id}/action`, { method: "POST", credentials: "include", headers: {"content-type":"application/json"}, body: JSON.stringify({ action: "MUTE_ALERT" }) }));
  /* default + other actions: focus/open the (validated, same-origin) link — pwa-push.md §2 */ });
self.addEventListener("pushsubscriptionchange", e => e.waitUntil(resubscribe()));   // exists
```
`d.unread` is computed by the engine at send time (`COUNT(status='UNREAD')`). Links are validated
server-side (same origin) before they are put in the payload.

## 4. Offline (N5)

- **Snapshots** (U17.4 P2, extended by N5.2): Saved + Applications + the hand-off queue, per user,
  ≤ 500 KB in IndexedDB `kiwiply-snap`; "Offline — showing what you had at 10:42" banner; writes
  disabled except **Send to laptop**, which is queued into the share outbox as a `queue` op (it is
  idempotent server-side).
- **Outbox** (`kiwiply-outbox`): `{id, kind: SAVE|QUEUE, payload, createdAt, attempts}`; replay on
  `online`, on focus, and via `sync` (Background Sync, Chromium) with tag `kiwiply-outbox`; max 5
  attempts then the row shows "Couldn't sync — retry" in Saved. Cleared on sign-out.
- **Low-data mode**: `data-saver` attribute on `<html>`; components read it to skip prefetch
  (`Link prefetch={false}`), request smaller images, and disable the dashboard's decorative art.

## 5. State machines

```
push_subscription (per device)
  ACTIVE ──410/404 or 5 failures──▶ DISABLED
  ACTIVE ──permission denied (liveness)──▶ DISABLED
  DISABLED ──resubscribe (permission granted again)──▶ new ACTIVE row (old stays for audit, purged 90 d)

outbox row
  PENDING ──replay ok──▶ (deleted)
  PENDING ──replay fail──▶ PENDING(attempts+1) ──5──▶ FAILED (user retry → PENDING)
```

## 6. Failure modes

| Failure | Behaviour |
|---|---|
| iOS Safari (not installed) taps "turn on pings" | Add-to-Home-Screen sheet, no permission prompt; preference stored as `wantsPush` so the installed app asks once on first open |
| iOS silently drops the subscription | liveness on open re-subscribes; if permission is now `denied`, Settings shows "Pings are off on this iPhone — Settings › Notifications › Kiwiply" |
| Badge API unsupported | no-op; the in-app bell count is the fallback |
| Action POST fails in the SW (offline) | open the deep link instead; the page completes the action |
| Daily cap reached on the phone | further pushes for that day are rolled into the digest; in-app rows still appear |
| Background Sync unsupported (iOS) | replay on focus/`online` only |
| Two devices, one user | each subscription row is a device; caps are per device per day; badges are per device |

## 7. Privacy and security

- Push payloads: title/body/link/id/kind/unread only; `lockScreenPrivate` turns body into the
  generic form (engine, exists). No inbox text ever (alerts-notifications.md §7).
- SW action endpoints require the session cookie + Origin check; they only act on the caller's
  own notification rows.
- Device rows show platform + last seen in Settings; the endpoint is never displayed or exported.
- Low-data mode and offline state are device-local; nothing is sent to the server except as
  event props (N8.3).

## 8. Cost

$0 (browser push). The liveness check is one tiny GET per app open (≤ 1/min/user). Outbox replay
is the same POSTs the user would have made online.

## 9. Tests

- Web (vitest): `net.ts` timeout/retry matrix; low-data detection; outbox replay with attempts;
  badge helper no-op without the API.
- Playwright (iPhone project, standalone): pre-prompt shows the install sheet when not standalone;
  in standalone the permission prompt is requested only after a tap (mock `Notification.requestPermission`);
  badge set after a fake push (SW handle); action `mute` posts to the API (route intercept);
  offline → banner → queue op lands in the outbox → online → replayed.
- API: `PushPolicyTest` daily cap per device class and quiet hours; `NotificationActionIT`
  ownership and idempotency; `PushSubscriptionIT` liveness answers + platform column.

## 10. Rollout

N4.1 iOS gate (with U7.4) → N4.2 badge → N4.4 liveness → N4.3 actions → N4.5 caps/mute →
N5.1 fetch layer (can go first, no deps) → N5.3 low-data → N5.2 snapshots + outbox (after U17.4).

## 11. Wireframes (390 px)

```
Pre-prompt on iOS Safari (not installed)        Notification (Android lock screen)
┌──────────────────────────────────────┐        ┌──────────────────────────────────────┐
│ Get pinged for new "UX intern" jobs  │        │ ◉ Kiwiply · now                      │
│ On iPhone, pings work once Kiwiply   │        │ 3 new for "UX intern · Remote"       │
│ is on your Home Screen.              │        │ Figma, Notion, Linear                │
│  1  Tap ⎙ Share    2  Add to Home    │        │ [ See jobs ]  [ Mute this alert ]    │
│     Screen                           │        └──────────────────────────────────────┘
│ [ Show me how ]       [ Not now ]    │
└──────────────────────────────────────┘        Offline banner (Saved)
                                                ┌──────────────────────────────────────┐
Settings › Notifications › Your devices         │ ⚠ Offline — showing what you had at  │
┌──────────────────────────────────────┐        │   10:42. Saves will sync later.      │
│ This iPhone (installed)  Pings on ●  │        ├──────────────────────────────────────┤
│ Chrome · MacBook         Pings on ●  │        │ Product Designer · Figma   ⏳ queued │
│ Pixel 7 (browser)        Off — tap   │        │ (will send to laptop when online)    │
│ Quiet hours 22:00–08:00 · ≤3/day     │        └──────────────────────────────────────┘
└──────────────────────────────────────┘
```
