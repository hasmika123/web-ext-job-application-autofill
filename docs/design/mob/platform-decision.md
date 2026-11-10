# Design — PWA vs native: the platform decision and the mobile web baseline (area `mob`, epics N0, N6)

Status: decided 2026-10-11. Reconciles `docs/design/user/pwa-push.md` (U17: manifest, SW, offline
page, install etiquette, Lighthouse budgets — **unchanged, this doc builds on it**) and the
onboarding design's "the extension is a desktop step" rule.

## 0. Decisions

1. **PWA first, for at least two launches.** The signed-in app at `kiwiply.com` is the mobile app:
   installable (U17.1/U17.2), share target on Android (N1), push on both platforms (U7.4 + N4),
   offline reads (U17.4/N5). No store listing until the gate in §4 passes.
2. **A native shell is a *wrapper around the same web app*, never a second client.** When the gate
   passes, Capacitor (iOS + Android) loads `https://kiwiply.com` via `server.url` — the Next app
   keeps `output: 'standalone'` (locked hosting model) and is **not** statically exported. The shell
   exists for exactly four things the PWA cannot do on iOS: a **Share Extension**, native push
   (APNs), biometric unlock, and store discoverability. Everything else stays web.
3. **Android does not need a shell for a long time.** Chrome on Android gives us install, share
   target, push, badging and Background Sync. If a Play listing is ever wanted for discoverability,
   a **Trusted Web Activity** (Bubblewrap) is the first choice because it is the PWA itself; Capacitor
   on Android only if we need a native plugin the TWA cannot offer.
4. **No payment inside any shell.** Stripe stays the single truth (`store-payments.md`).
5. **The extension stays desktop-only in product copy.** Firefox for Android is an *experiment*
   (N3.2) that may become "autofill on Android (Firefox)" if the drawer works at 390 px; iOS never
   runs it (Safari extensions need the shell, N3.4, P2).
6. **One codebase, one design system.** Every mobile surface renders `@kiwiply/ui` primitives;
   no React Native, no Flutter, no second component library (locked: one design system).

## 1. Why not native now

| Option | Time to first phone value | iOS share sheet | Push | Store presence | Payment rules | Second codebase | Verdict |
|---|---|---|---|---|---|---|---|
| **PWA** (chosen) | 2–3 sessions (U17.1 + N0.2 + N1.1) | Android yes; iOS no (paste/Shortcut fallback) | Both (iOS only when installed) | none | **none — Stripe untouched** | no | Ship now |
| Capacitor shell around the hosted app | +4–6 sessions after PWA | yes (Share Extension) | yes (APNs/FCM) | yes | Apple 3.1.1 applies: US link-out lawful today, elsewhere status-only; Guideline 4.2 risk for a bare wrapper | no (shell only) | **Gated (N6)** |
| TWA (Android only) | +1 session after PWA | yes (via share_target) | yes | Play only | Play: external links allowed in the US since 2025-10-29 | no | Option inside N6 for Android |
| React Native / Expo | 10+ sessions | yes | yes | yes | same as Capacitor | **yes** — breaks "one design system" | No |

The numbers that decide it: 75 % of Gen Z fill applications on a desktop (HireClix 2025) while
93 % search on a phone (Sellick). The phone's job is capture + queue + alerts; the PWA does all
three on Android today and two of three on iOS. A shell buys the iOS share sheet — valuable, but
not before we know iOS users exist in numbers (§4).

## 2. Mobile web baseline (N0.2–N0.5) — what every page inherits

### 2.1 Head (`web/src/app/layout.tsx`)
```ts
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",       // safe areas
  themeColor: [ { media: "(prefers-color-scheme: light)", color: "#FFFCF7" },   // theme-v2 paper
                { media: "(prefers-color-scheme: dark)",  color: "#0F1340" } ],
};
export const metadata: Metadata = { …, manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Kiwiply" },
  icons: { apple: "/icons/apple-touch-icon.png" }, formatDetection: { telephone: false } };
```
Icons: `web/public/icons/{192,512,maskable-512,apple-touch-icon,badge-96}.png` generated from
`brand/` (badge = monochrome white mark on transparent for Android status bar).
`globals.css`: `--safe-top/right/bottom/left: env(safe-area-inset-*)`; the app shell's header
adds `padding-top: var(--safe-top)`, the bottom tab bar (U0.1) `padding-bottom: var(--safe-bottom)`.
Inputs are ≥ 16 px font so iOS does not zoom on focus; `touch-action: manipulation` on buttons
removes the 300 ms delay on old WebKit.

### 2.2 Standalone mode rules (N0.3)
- `web/src/lib/pwa.ts` exposes `displayMode()` → `browser | standalone | shell` (shell = the
  Capacitor user-agent suffix `KiwiplyShell/<version>` when N6 lands) and `platform()` →
  `ios | android | desktop`. Both are sent as event props (N8.3) and drive the rules below.
- **External links** (`target="_blank"`, posting URLs, "Reply in Gmail") get `rel="noopener"` and
  open in the system browser; in standalone iOS a plain in-scope link to another origin would open
  an in-app Safari sheet with no URL bar — acceptable for postings, wrong for OAuth/Stripe.
- **OAuth (Google/Apple) and Stripe Checkout round-trips in standalone**: the redirect returns to
  `scope: /`, so iOS re-opens the installed app. Guard: `/billing/success` and `/login?next=` must
  not depend on `sessionStorage` set before the hop (it is not shared between the standalone
  window and the in-app browser on iOS). Keep the state server-side (the `SuccessPoller` already
  polls the API; the login `next` param is in the URL).
- **Back behaviour**: standalone has no browser chrome; every sheet/dialog pushes a history entry
  so the Android back gesture closes it instead of leaving the app (`@kiwiply/ui` Sheet gains
  `historyEntry` — a change in `packages/ui`, consumed by U0.2).
- **Deep links** (`/applications?open=<id>`, `/jobs?job=<id>`, `/share?url=`) must work cold
  (app not running) and warm (focus the existing window — see `notificationclick` in
  `pwa-push.md` §2). JobRight's top store complaint is exactly this bug.
- **Session gate** stays as is (`web/src/app/(app)/layout.tsx`): httpOnly cookies survive
  standalone; a 401 bounces to `/login?next=`.

### 2.3 Keyboard and input (N0.4)
Every form field declares `autocomplete`, `inputmode`, `enterkeyhint`. The bottom tab bar
hides while `visualViewport.height < window.innerHeight * 0.75` (U0.1 AC) and sticky action
bars (Save / Send to laptop) re-anchor to `visualViewport` so they sit above the keyboard.

### 2.4 Touch (N0.5)
`overscroll-behavior-y: contain` on scroll containers (no rubber-band over sheets);
pull-to-refresh on list pages (Jobs, Applications, Saved) implemented in the page, not the
browser (standalone Chrome disables native PTR); long-press opens the row's action sheet;
`navigator.vibrate(10)` on destructive confirms where supported (Android only; no-op on iOS).

## 3. Native shell shape (N6, when gated in)

```
mobile-shell/                     (new workspace member; NOT in the web bundle)
  capacitor.config.ts             server: { url: "https://kiwiply.com", cleartext: false }, appId: com.kiwiply.app
  ios/   App/ShareExtension/      posts {url,title,text} → https://kiwiply.com/share (N6.3)
  android/                        TWA first (Bubblewrap); Capacitor only if a plugin is needed
  src/bridge.ts                   window.KiwiplyShell = { version, platform, push: {register}, biometrics: {unlock} }
```
- The web app detects the shell via the UA suffix and `window.KiwiplyShell`; no separate build.
- Push: the shell registers for APNs/FCM and POSTs the token to `POST /api/push/subscriptions`
  with `kind: NATIVE_IOS | NATIVE_ANDROID` (one new column on `push_subscription`); the engine in
  `alerts-notifications.md` §2 fans out through the same `PushSender` with a second transport.
- Guideline 4.2 defence: the shell ships the Share Extension, native push, biometric unlock,
  Home-Screen widgets ("3 jobs waiting on your laptop") and universal links — real native value,
  listed in the review notes (N6.6).
- Updates: none needed — the shell loads the live site. A **minimum shell version** is enforced
  the same way the extension's remote config does (A5.5): `GET /api/mobile/config` →
  `{minShellVersion}`; older shells show a "please update" screen.

## 4. The gate (N6.1) — numbers, not opinions

Measured by the mobile event taxonomy (N8.3) over 60 days after N1/N2 ship:

| Signal | Go for the iOS shell when | Why |
|---|---|---|
| iOS share of signed-in mobile sessions | ≥ 40 % | the shell's main value is the iOS share sheet |
| Share-to-Kiwiply uses per mobile WAU (Android) | ≥ 0.5 / week | proves capture matters before we build the iOS twin |
| Paste-a-link uses on iOS per iOS WAU | ≥ 0.3 / week | iOS users are trying to capture and hitting the wall |
| PWA install rate (installed / mobile WAU) | ≥ 15 % | people want an app icon; a store icon will convert better |
| Push opt-in after the pre-prompt (installed users) | ≥ 35 % | the shell's second value is reliable push on iOS |
| Hand-off completion (queued → opened on laptop within 72 h) | ≥ 50 % | the loop works; worth making easier to enter |

Any two of the first three plus one of the last three → build N6.2–N6.6. Otherwise re-check
every 60 days; the PWA keeps improving in the meantime.

## 5. Failure modes

| Failure | Behaviour |
|---|---|
| iOS user never installs | Full site works in Safari; push/share unavailable — Settings › Notifications explains in one line with the "Add to Home Screen" sheet |
| iOS 26 "Open as Web App" toggle off at add time | Site opens in Safari; `displayMode()` = browser; we show the install card again after 30 days with the updated copy |
| User installed from Chrome on iOS | Chrome-iOS home-screen icons open in Chrome (no standalone); copy says "use Safari's Share → Add to Home Screen" |
| Shell UA spoofed | Shell detection only changes *display* rules (purchase surface, bridge calls); nothing security-relevant keys off it |
| Shell rejected under 4.2 | PWA is the product; the shell is additive — no launch depends on store approval |

## 6. Privacy and security

- No new data: `displayMode`/`platform` are event props (U18 schema), not stored on the account.
- Share-sheet payloads are validated like any form (`share-target-and-handoff.md` §6).
- The shell's bridge exposes nothing to third-party origins (`allowNavigation` = kiwiply.com only;
  external links open the system browser).

## 7. Cost

PWA: $0 incremental. Shell: Apple Developer $99/yr + Google Play $25 once; APNs/FCM free; one
Mac build machine (user's). No OTA/update service.

## 8. Tests

- Playwright mobile projects (N8.1): `iPhone 14` (Safari UA, touch) and `Pixel 7` for every
  N-story; a `standalone` project sets `display-mode: standalone` via `--app` emulation and
  asserts external links open in a new context, deep links cold-start to the right route, and
  the back gesture closes a sheet.
- Unit (vitest): `pwa.ts` `displayMode()`/`platform()` matrix; `viewport` export snapshot.
- Real-device smoke (N8.2): iOS Safari + installed; Chrome Android + installed; Firefox Android.

## 9. Rollout

N0.2 head → N0.3 standalone rules → N0.4/N0.5 input + touch (parallel with U17.1/U17.2) → N1 →
N2 → N4/N5 → gate review (N6.1) at +60 days → N6/N7 only if green.

## 10. Wireframes (390 px)

```
Install card (Android, after 2nd visit)      iOS sheet (once, Safari)
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│ ◉ Kiwiply on your home screen        │     │ Get Kiwiply on your phone            │
│ Share jobs to it, get pinged, works  │     │                                      │
│ offline. No app store needed.        │     │  1  Tap  ⎙  Share in Safari          │
│            [ Add ]   [ Not now ]     │     │  2  Tap  ⊕  Add to Home Screen       │
└──────────────────────────────────────┘     │                                      │
                                             │ That's it — it opens as an app, and  │
                                             │ you can turn on job pings there.     │
                                             │                       [ Got it ]     │
                                             └──────────────────────────────────────┘
```
