# 11 — Branding and login: the branding model, runtime theme tokens, `BrandedLogin`, contrast safety, favicon/title, the mascot pose map

> Status: design (Session B), 2026-10-12. Implements ADR-003 (public tenant DTO), ADR-004
> (host-bound login), ADR-007 (one login component, one shell, `MascotPose`). Escalations E14
> (Google per host), E20 (Powered-by mark, default (a)). Build-ready for X2.3, X2.5, X2.8, X2.12,
> X2.13, X2.14, X3.7. `@kiwiply/ui` only; no hex literal in any tenant surface (lint, §4.5).

## 1. Branding model

### 1.1 What an organization can brand (requirements §3.4)
| Field | Column (`org_branding`) | Constraint | Default when unset |
|---|---|---|---|
| Company name (display) | `organization.display_name` | 2–120 chars, PII-scanned | `organization.name` |
| Logo | `logo_key` | PNG/JPG/WebP ≤ 512 KB, ≥ 64 px tall, any ratio; served at 40 px tall in the shell, 56 px on login | Kiwiply `BrandLockup` (never another org's) |
| Favicon | `favicon_key` | PNG ≤ 256 KB, square 64–512 px; we serve as-is (browsers scale) | Kiwiply favicon |
| Login background / banner | `login_banner_key` | JPG/PNG/WebP ≤ 2 MB, ≥ 1200 px wide, landscape | Kiwiply `AuthBackdrop` (soft gradient in the org's primary tint) |
| Primary colour | `primary_color` | `#rrggbb` | `#94BD37` (kiwi) |
| Secondary colour | `secondary_color` | `#rrggbb` | `#2D3133` |
| Accent colour | `accent_color` | `#rrggbb` | = primary |
| Welcome title | `welcome_title` | ≤ 120 chars, PII-scanned | "Welcome back" |
| Welcome message | `welcome_message` | ≤ 500 chars, plain text, PII-scanned | "Sign in to {display name}" |
| Dashboard theme | `theme` | `LIGHT` / `DARK` / `SYSTEM` | `LIGHT` |
| Terminology | `terminology_json` | allow-listed keys (§1.3), each ≤ 30 chars | Kiwiply defaults |
| Navigation preferences | `nav_prefs_json` | `{hidden: navKey[], order: navKey[]}` — only nav keys that exist; a hidden page is still reachable by URL and still permission-checked | none |
| Powered-by mark | `powered_by` | `LOGIN_ONLY` / `LOGIN_AND_FOOTER` (never `NONE`, E20) | `LOGIN_ONLY` |

No SVG uploads (script-bearing); no custom fonts (one type system); no custom CSS. Those are
deliberate: the Kiwiply visual identity stays (requirements §26) and the attack surface stays flat.

### 1.2 Draft vs published
- `org_branding` holds the **published** values in columns and the **draft** as `draft_json`
  (full branding object, same keys). Every edit on the Branding page autosaves into the draft
  (`PATCH /api/orgs/{orgId}/branding/draft`, 800 ms debounce, `If-Match: draft_version`,
  Notion-style chip + inline ✓, undo toast per field).
- **Publish** (`POST /api/orgs/{orgId}/branding/publish`) validates the whole draft (sizes, colours,
  contrast §4, PII), copies draft → columns, sets `published_at`, bumps `organization.config_version`
  (public DTO cache evicts), writes `org_branding_version` (new table, X2.5: `org_id, version_no,
  snapshot_json, published_at, published_by_member_id`) and audit `BRANDING_PUBLISH` (risk MEDIUM,
  details = changed keys). "Discard draft" resets `draft_json` to the published values.
- **Restore**: the History drawer lists versions (last 20); "Restore" copies a snapshot into the
  draft (never publishes by itself). Undo of a publish = restore previous + publish.
- **Preview**: the Branding page renders the login card and the shell header **from the draft**
  live; "Open draft login" opens `/login?preview=draft` in a new tab — the login page accepts
  `preview=draft` only for a signed-in member with `branding.manage` (the BFF checks), renders with
  a "Draft preview — not what employees see yet" banner, `noindex`, and never sets cookies.
- Only published values ever reach `GET /api/public/tenant` (ADR-003).

### 1.3 Terminology keys (allow-list, `Terminology.KEYS`)
`consultant` ("Consultant" → "Talent", "Associate"…), `consultants`, `marketer` ("Marketing
Specialist" → "Bench Sales Rep"), `marketers`, `client` ("Client" → "Account"), `clients`,
`placement`, `placements`, `opportunity`, `opportunities`, `submission`, `submissions`,
`department`, `departments`, `team`, `teams`, `employee`, `employees`, `requirement`, `requirements`,
`vendor`, `vendors` — **22 keys, nothing else** (the last four added for Session D's pages, 09 row 6). The web uses `t('consultant')`
from `TenantTerminology` (context from the public DTO) everywhere a label is shown; plural keys are
explicit (no auto-pluralising). Keys never change permission semantics.

## 2. Runtime theme tokens (X2.12) — no per-tenant build

### 2.1 Derived on the server
`BrandingTheme.derive(branding)` (API, pure, unit-tested with golden tables) turns the three
customer colours into a **complete, contrast-safe variable set** and the public DTO ships it:

```
"theme": {
  "mode": "LIGHT|DARK|SYSTEM",
  "light": { "--tenant-primary": "#1E6FF5", "--tenant-primary-ink": "#FBFAF6", "--tenant-primary-deep": "#1553C0",
             "--tenant-primary-soft": "#E8F0FF", "--tenant-secondary": "#2D3133", "--tenant-secondary-ink": "#FBFAF6",
             "--tenant-accent": "#1EA7A0", "--tenant-accent-ink": "#FBFAF6", "--tenant-accent-deep": "#11706A",
             "--tenant-accent-soft": "#E3F6F4", "--tenant-nav-active-bg": "#E8F0FF", "--tenant-nav-active-text": "#1553C0",
             "--tenant-login-wash": "#EEF4FF" },
  "dark":  { ...same keys, dark-surface variants... }
}
```
The client never computes colours; SSR writes the variables inline on the shell wrapper
(`<div class="theme-v2 theme-tenant" style="--tenant-primary:…">`), so there is no flash and no
per-tenant CSS file. `SYSTEM` adds both sets (`:where(.dark) .theme-tenant` for dark).

### 2.2 Mapping onto `@kiwiply/ui`
`packages/ui/styles/theme-tenant.css` (new, X2.12) remaps the design-system tokens inside
`.theme-tenant` so **every existing primitive re-skins without code changes**:

```css
.theme-tenant {
  --color-accent: var(--tenant-primary);          --color-accent-deep: var(--tenant-primary-deep);
  --color-accent-soft: var(--tenant-primary-soft); --color-on-accent: var(--tenant-primary-ink);
  --color-v2-org-blue: var(--tenant-primary);     --color-v2-org-blue-deep: var(--tenant-primary-deep);
  --color-v2-org-nav-active-bg: var(--tenant-nav-active-bg);
  --color-v2-org-nav-active-text: var(--tenant-nav-active-text);
  --color-v2-blue: var(--tenant-accent);          --color-v2-blue-soft: var(--tenant-accent-soft);
  --color-v2-blue-ink: var(--tenant-accent-deep);
}
```
Not remapped on purpose: `--color-ok/warn/danger(-text)`, `--color-v2-coral/amber/green*`
(status semantics stay Kiwiply's so a red is always a red), surfaces (`app-bg`, `paper`, `line`),
typography, radii, shadows. `--tenant-secondary` is used for the sidebar header band and chips only.

### 2.3 Where the wrapper lives
`web/src/app/(tenant)/_t/layout.tsx` renders `<TenantThemeProvider tenant={dto}>` which sets the
inline variables, `.theme-tenant`, `.dark` (per `mode` and `prefers-color-scheme`), the `<title>`
template and the favicon link (§5). Login, join, profile and workspace pages are all inside it.

## 3. `BrandedLogin` (X2.3, X2.6, X2.14) — one component, every tenant

### 3.1 Anatomy (desktop 1440 / phone 390)
```
1440                                                        390
┌───────────────────────────────┬──────────────────────┐    ┌──────────────────────────┐
│  [banner or tinted wash]      │  ┌────────────────┐  │    │  ◉ Acme logo (56px)      │
│                               │  │ ◉ Acme logo    │  │    │  Welcome back            │
│   mascot "wave" (120px)       │  │ Welcome back   │  │    │  Sign in to Acme Talent  │
│   Welcome title (display font)│  │ Sign in to Acme│  │    │  [ Work email          ] │
│   Welcome message             │  │ [Work email   ]│  │    │  [ Password          👁 ]│
│                               │  │ [Password   👁]│  │    │  ( Sign in → )           │
│                               │  │ (Sign in →)    │  │    │  Forgot password?        │
│                               │  │ Forgot pwd?    │  │    │  [G Continue with Google]│
│                               │  │ [G Google]*    │  │    │  mascot wave (64px)      │
│                               │  └────────────────┘  │    │  Powered by ◆ kiwiply    │
│  Powered by ◆ kiwiply · Report│      * when enabled   │    │  Report this page        │
└───────────────────────────────┴──────────────────────┘    └──────────────────────────┘
```
- Reuses `AuthCardShell`, `AuthField`, `SocialRow`, `GoogleSignIn` from `web/src/components/auth`
  (same validation, same `/api/auth/*` BFF routes, which forward `X-Kiwiply-Host` since X1.4).
- Primary button = `Button` (accent = tenant primary); card on `paper`; title in the display font.
- The **mascot** is `MascotPose pose="wave" size="lg"` (120 px desktop, `sm` 64 px phone), decorative.
- **"Powered by Kiwiply"** mark (E20 default (a)): `BrandLockup size=16` + text, 12.5 px muted,
  always present on tenant logins; "Report this page" opens `mailto:abuse@kiwiply.com` with the
  host prefilled (T5).
- No sign-up link on tenant hosts (members arrive by invite); no demo card; no marketing links.
- `?next=` is honoured only for same-host relative paths (existing `safeNext`).

### 3.2 States (all rendered by the same component; `state` is decided server-side in the page)
| State | How it is detected | What renders | Copy (title / body) |
|---|---|---|---|
| `UNKNOWN_HOST` | `getTenant().kind === UNKNOWN` | `TenantUnavailable` (X1.4), **not** the login | "This workspace isn't available" / "Check the address you were given, or contact your organization." mascot `peek` |
| `ORG_SUSPENDED` / `HOST_SUSPENDED` | UNKNOWN with internal reason (04 §2.2) — the public DTO is still 404; the page shows the same `TenantUnavailable` with the variant copy chosen by a `reason` cookie-less header the BFF passes (`x-kiwiply-tenant-reason: INACTIVE`) | same component | "This workspace is paused" / "The organization's workspace is currently unavailable. If you're an administrator, sign in at kiwiply.com." (the only state that may link to kiwiply.com, because it names no org) |
| `SIGNED_OUT` | no valid session cookie for this host | the login card | branding copy |
| `EXISTING_SESSION` | cookie present, `GET /api/account` 200 and `GET /api/me/tenant` 200 | **redirect** to the primary workspace home (`/w/{landing}`) before render | — |
| `STALE_SESSION` | cookie present but token has no `tid` or wrong `tid` (401 from `/api/me/tenant`) | login card + quiet line "Sign in to continue" (cookies cleared by the BFF) | — |
| `WRONG_ORG_ACCOUNT` | login POST → `403 NOT_A_MEMBER` (X1.5) | the card swaps to a **not-a-member** panel | "You're not a member of {org}" / "This account isn't part of {org}'s workspace. Ask an administrator for an invitation, or sign in with a different account." Buttons: "Use a different account" (clears form), none else. Mascot `peek`. No data, no link out. |
| `INVITED_NOT_ACCEPTED` | login OK but membership `INVITED` → `403 NOT_A_MEMBER {pending: true}` | panel | "Your invitation is waiting" / "Open the link in your invitation email to join {org}." + "Resend my invitation" (rate-limited, `POST /api/join/resend-for-me` on tenant hosts, X2.6) |
| `MFA_REQUIRED` | login response `{mfaRequired, mfaToken}` (admin MFA today, org-enforced email code with X2.14) | second step: 6-digit code field, "We emailed a code to {masked}", resend after 30 s | — |
| `EMAIL_UNVERIFIED` | `401 USER_NOT_ACTIVATED` | panel with "Resend verification" (links built on this host, `TenantUrls`) | "Verify your email first" |
| `PAST_DUE_ORG` | DTO `status = PAST_DUE` | login works; after sign-in the shell shows the billing banner (admins) | — |
| `GOOGLE_UNAVAILABLE` | DTO `login.google = false` | no Google button (E14) | — |
| `DRAFT_PREVIEW` | `?preview=draft` + `branding.manage` | login card from the draft with a banner; form disabled | "Draft preview" |
| `ERROR` | API unreachable | `ErrorState` inside the card, retry | "We couldn't reach the server" |

Rate limiting: the existing BFF limiter keys on IP; on tenant hosts the key becomes
`tenant:{host}:{ip}` (10 / 5 min) and the API's `/api/authenticate` audit row carries `hostname_id`.

### 3.3 Login-first flow (ADR-004, requirements §3.3), as code paths
1. Edge → `dossier-web` with `X-Forwarded-Host`. `proxy.ts` normalises the host and **rewrites**
   every non-API path on a non-platform host to `/_t{path}` (the tenant route tree, 16 §2).
2. `(tenant)/_t/layout.tsx`: `getTenant()` → UNKNOWN → `TenantUnavailable` (404). TENANT → theme
   provider + children.
3. `/_t/login/page.tsx`: session probe (`/api/account` + `/api/me/tenant`) → `EXISTING_SESSION`
   redirects; otherwise `BrandedLogin`.
4. `POST /api/auth/login` (BFF) → API `/api/authenticate` with `X-Kiwiply-Host` → tokens with
   `tid/hid` (X1.5) → cookies (host-only) → `router.push(next ?? '/w/{landing}')`.
5. `/_t/w/[workspace]/layout.tsx` (16 §3): `GET /api/me/tenant` → membership, permissions,
   workspaces, landing → shell. A 401 → `/login`; a 404 (not a member any more) → not-a-member panel.
6. Every BFF call forwards the host; the API re-resolves and re-checks (05 §2) — the UI never
   decides access.

### 3.4 MFA on tenant hosts (X2.14)
- Today: admin accounts get an emailed code (`AdminMfaService`). X2.14 generalises it to
  `LoginMfaService.shouldChallenge(user, tenantContext)`: challenge when the user has `ROLE_ADMIN`
  (as today) **or** the tenant org's setting `org.security.mfa_required` (BOOL, org-overridable,
  default **false**) is on. Same `mfaToken` + 6-digit code, 10-minute validity, 5 attempts,
  per-user rate limit; audit `LOGIN_MFA_CHALLENGED/PASSED/FAILED` with `hostname_id`.
- TOTP/passkeys are Phase 12 (SSO story X12.4 carries them); the public DTO's `login.mfaRequired`
  reflects the org setting so the login page can say "Your organization requires a sign-in code".
- Escalation B3 (08 §Session B) records this choice; it is additive and off by default.

## 4. Contrast safety (X2.12)

### 4.1 Rules (WCAG 2.1 AA)
| Pair | Minimum | How `BrandingTheme` guarantees it |
|---|---|---|
| text on primary (`--tenant-primary-ink` on `--tenant-primary`) | 4.5:1 | ink = whichever of `#FBFAF6` (paper) / `#2D3133` (charcoal) has the higher ratio; if the better one is < 4.5 (only possible for mid-tones around L≈50 with low chroma) the primary itself is nudged in OKLCH lightness away from 0.5 in steps of 0.02 until ≥ 4.5 — recorded as `adjusted: ["primary"]` |
| primary-deep text on paper / paper-2 (`--tenant-primary-deep` on `#FBFAF6`, `#E7E6DD`) | 4.5:1 | start from primary, decrease OKLCH L by 0.04 per step (keep hue/chroma, clamp chroma to gamut) until ≥ 4.5 on both |
| nav-active-text on nav-active-bg | 4.5:1 | bg = primary mixed 12 % into paper; text = primary-deep re-derived against that bg |
| accent variants | same three rules | same functions |
| dark set | same, against `#24282A` / `#2E3335` | lighten instead of darken (L + 0.04 per step); ink choice re-evaluated |
| large text / icons (≥ 24 px or bold ≥ 19 px) | 3:1 | satisfied a fortiori |

Status colours are never customer-controlled, so `danger-text` AA rules from `tokens.css` hold.

### 4.2 Behaviour and feedback
- Publishing never fails on contrast; the derivation **adjusts** and the Branding page shows an
  honest chip next to the colour: "Adjusted for readability — we'll use {hex} for text" with the
  two swatches. The customer's chosen value stays stored; the derived set is what ships.
- `GET /api/orgs/{orgId}/branding/preview-theme?primary=&secondary=&accent=` (branding.manage,
  cached 60 s) returns the derived set for the live preview so the page never implements the math.
- Golden tests: 24 fixture colours (brand blues, oranges, neon lime, near-black, near-white, grey
  50 %, saturated purple) with expected ratios ≥ thresholds; property test over 2 000 random
  colours asserting every pair meets its minimum.

### 4.3 Implementation
`api/service/ent/BrandingTheme.java` (sRGB ↔ linear ↔ OKLCH conversions, WCAG relative luminance;
no library needed, ~150 lines) + the same math in `packages/ui/src/color/contrast.ts` **only for
tests and Storybook-style previews** (the web consumes the API's set). A doc-sync test compares the
two implementations on the fixture table.

### 4.4 Light/dark
`theme = DARK` applies `.dark` on the tenant wrapper; `SYSTEM` uses `prefers-color-scheme`. The
login page follows the same setting (a dark-themed org gets a dark login). Images (logo) get a
subtle paper-coloured plate behind them in dark mode when the logo has transparency
(`bg-paper/90 rounded-md p-1`), because we cannot know the logo's own contrast.

### 4.5 Lint
ESLint rule `kiwiply/no-hex-in-tenant` (extends the existing sample-lint): any `#[0-9a-f]{3,8}`
string literal or `bg-[#…]` class under `web/src/app/(tenant)/**` and
`web/src/components/ent/**` fails the build. Tokens only.

## 5. Favicon and title per tenant (X2.13)

- **Public assets**: `GET /api/public/tenant/assets/{logo|favicon|banner}` (permitAll, resolved by
  host, only for ACTIVE/PAST_DUE tenants, 404 otherwise) streams the S3 object with
  `Cache-Control: public, max-age=86400, immutable`-style caching keyed by `?v={config_version}`;
  `ETag` = object hash. The BFF exposes the same at `/tenant-assets/{kind}?v=` so the browser
  never calls the API host. Keys live under `org/{orgId}/branding/{kind}-{sha256[:12]}.{ext}`
  (`OrgStorageKeys`, 04 §4 file-storage rule); uploads are validated server-side (magic bytes,
  dimensions via ImageIO, size), re-encoded to strip metadata, never served from the upload path.
- **Favicon**: the tenant layout emits `<link rel="icon" href="/tenant-assets/favicon?v=…">` and
  `<link rel="apple-touch-icon" …>` when set, else the Kiwiply icons. Next's metadata API:
  `generateMetadata()` in `(tenant)/_t/layout.tsx` returns `{ icons, title: { template: '%s · ' + displayName, default: displayName } }`.
- **Title**: every tenant page sets `title` = page name; the template yields "Employees · Acme
  Talent". Login: "Sign in · Acme Talent". Unknown host: "Workspace unavailable" (no org name).
- **OpenGraph**: none on tenant hosts (`noindex`, no `og:*` — nothing to share).
- **Robots**: `X-Robots-Tag: noindex, nofollow` header on every tenant response (set in the
  `(tenant)` layout via `headers()` — Next 16 supports response headers from `proxy.ts`; set it
  there on the rewrite).

## 6. The mascot pose map (X2.8) — one shared character, compact

`packages/ui/src/primitives/MascotPose.tsx` — a decorative image wrapper with a **fixed** map so
no surface path-hunts. Assets stay in `web/public/v2/**` (the extension passes its own base):

```ts
export type EnterprisePose = "welcome" | "greet" | "empty" | "encourage" | "celebrate" | "warn" | "error" | "peek";
export const MASCOT_POSES: Record<EnterprisePose, { file: string; w: number; h: number; motion: string }> = {
  welcome:   { file: "mascot-wave.png",            w: 210, h: 221, motion: "ob-m-wave"  },  // login
  greet:     { file: "app/mascot-wave-laptop.png", w: 145, h: 142, motion: "ob-m-idle"  },  // dashboard hero, first visit of the day
  empty:     { file: "mascot-peek.png",            w: 172, h: 214, motion: "ob-m-peek"  },  // EmptyState slot
  encourage: { file: "app/mascot-books.png",       w: 149, h: 154, motion: "ob-m-think" },  // interview prep, readiness checklist
  celebrate: { file: "mascot-clap.png",            w: 221, h: 246, motion: "ob-m-cheer" },  // placement / hire / first invite accepted (+ConfettiBurst)
  warn:      { file: "mascot-peek.png",            w: 172, h: 214, motion: "ob-m-idle"  },  // paused domain, PAST_DUE banner (amber chip beside it)
  error:     { file: "mascot-wave.png",            w: 210, h: 221, motion: "ob-m-shrug" },  // ErrorState slot ("all good, try again")
  peek:      { file: "mascot-peek.png",            w: 172, h: 214, motion: "ob-m-peek"  },  // not-a-member panel, side cards
};
```
- `<MascotPose pose size="sm|md|lg" />` → 48 / 80 / 120 px tall (phone caps at `md`); `alt=""`,
  `aria-hidden`, `loading="lazy"` except on login; motion class only when `!prefersReducedMotion`.
- `<MascotProvider base="/v2">` (default) supplies the asset base; the extension sets its bundle
  path if it ever renders one.
- Usage caps (requirements §3.5 "compact, contextual"): at most **one** mascot per viewport;
  never inside tables or list rows; never in the sidebar except the existing "Need help?" card;
  dashboard greeting only on the first visit of the day (`localStorage` key, try/catch) and
  dismissable; celebrations fire once per event id (dedupe key in `sessionStorage`).
- Copy lines live in `web/src/lib/ent/mascot-copy.ts` (deck per pose, 3–5 lines each, seeded
  pick, PII-free, terminology-aware). Organizations cannot change the character or its art
  (one shared character), only whether the dashboard greeting shows (`nav_prefs_json.greeting: false`).
- Replacement art (README under `web/public/v2`) drops in by editing this map only.

## 7. Security headers on tenant hosts (X3.7)
`proxy.ts` sets on every rewritten tenant response: `Content-Security-Policy: default-src 'self';
img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-…';
frame-ancestors 'none'; form-action 'self'; base-uri 'self'`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`,
`X-Robots-Tag: noindex, nofollow`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
No HSTS until ADR-002's edge covers every subdomain. Google sign-in (E14): `script-src` adds
`https://accounts.google.com` only when the DTO says `login.google = true`.

## 8. What Session C / D must align with
- Billing banners in the shell use `--tenant-*` tokens through the remap, never raw colours.
- The consultant "My Available Features" page (D, X9.1) uses `MascotPose pose="encourage"` for the
  AI interview-prep entry and `celebrate` on placement declaration; nothing else adds poses.
- Terminology keys for `client`, `placement`, `submission`, `opportunity` are the ones D's pages
  must call through `t()`.
