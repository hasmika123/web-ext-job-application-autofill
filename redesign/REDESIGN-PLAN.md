# Kiwiply — UI / UX Redesign Plan

> Companion to `redesign/mockups.html` (clickable prototype) and `redesign/logo.svg`
> (supplied lockup; `logo.png` is the raster fallback).
> This is the spec to hand Claude Code, phase by phase. The product is **feature-complete
> and live** (Phases 0–7, kiwiply.com); nothing here adds backend features — it restyles,
> re-flows, and re-brands the surfaces that already work.

## Locked decisions (this round)
- **Brand = Kiwiply.** The word "Dossier" appears **nowhere** in any user-facing surface
  (and we rename internal identifiers too — see §2).
- **Visual direction = Editorial**, using the **real logo palette**: kiwi green accent,
  kiwi-skin brown as warm secondary, charcoal ink, warm cream surfaces, serif display
  (Fraunces) + Inter body. Tokens in §3.
- **Backend stays Spring Boot.** "React for the backend" isn't the right framing — see §10.
- **Everything must be responsive** down to ~360px. Requirements in §9.

---

## 0. The core finding (why this matters)

The product has two faces that don't look like the same company:

- **The extension** already has a real identity — warm navy/cream/gold + the folder logo.
- **The web app — your *primary* product — is the unmodified Next.js starter.**
  `globals.css` is the default Geist + black/white template, the only `/public` assets
  are `next.svg` / `vercel.svg`, there is **no shared layout, no nav, no logo, no brand
  color**, and each page hand-rolls its own header with a row of text links.

So the redesign is three jobs, in priority order:
1. **Give the web app a visual identity and a real app shell** (it has none).
2. **Unify both surfaces under one brand — Kiwiply**, with the new kiwi palette.
3. **Re-flow the pages**: add a real landing page and a dashboard, replace ad-hoc
   per-page link rows with a persistent sidebar, and make every screen responsive.

---

## 1. How to use this plan
1. Open `redesign/mockups.html`. Click through every screen (Landing → Sign in →
   Dashboard → Profile → Resumes → Board → Settings → Extension). **Resize the window**
   to see mobile layouts (sidebar collapses to a drawer under ~980px).
2. Work the phases in §8 **in order**, one task = one commit = one push, exactly as
   `CLAUDE.md` requires. Each task has acceptance criteria written to paste into Claude
   Code.
3. Repo rule: **extension changes bump `manifest.json` + `package.json`** (and the
   `rules.js` version if rules change). Web/marketing changes don't.

---

## 2. Brand: remove "Dossier" entirely → Kiwiply

### 2.1 Naming
- **Kiwiply** is the only name — wordmark, page titles, store listing, emails, the
  extension name, in-product copy.
- The profile page is **"Your profile"** (not "Your dossier"). Avoid the word "dossier"
  in copy altogether.
- Logo: the kiwi mark + "kiwiply" wordmark in `logo.svg`. In the prototype it's used on
  light surfaces; on dark surfaces a CSS mark + two-tone wordmark stands in (green
  "kiwi" + light "ply"). Reproduce both in code (§2.3).

### 2.2 Rename surface — three buckets
| Bucket | Action | Examples |
|---|---|---|
| **User-facing strings** | → "Kiwiply" | landing copy in `page.tsx`, every `<title>`/metadata, popup `.brand` "Dossier", options `.brand`, overlay `brand` text in `filler.js` `CSS_TEXT`, privacy page, email templates, README marketing lines |
| **Internal identifiers** | → rename to `kiwiply*` (do as one dedicated, well-tested commit) | `DossierApiProvider` → `KiwiplyApiProvider`, cookies `dossier_access`/`dossier_refresh` → `kiwiply_access`/`kiwiply_refresh` (coordinate web + API + extension together; log users out once), any `dossier`-named classes/vars in JS. |
| **Risky / external** | rename **only deliberately** | `dossier.jdl`, package/artifact names, env keys baked into the live VPS, DB names. These are infra; renaming mid-flight can break deploys. Schedule separately or leave — they're never shown to users. |

> Because you asked for "Dossier nowhere," the plan **does** rename internal code
> identifiers (bucket 2) — but as its own task with tests, not blindly mixed into UI
> commits. Cookie renames must ship across all three surfaces in one coordinated change
> (existing sessions will need a re-login). Infra names (bucket 3) are the one place to
> pause and confirm before touching, since they can break the live deploy.

> **Acceptance:** no user-visible "Dossier" anywhere; grep of the web + extension `src`
> for `/dossier/i` returns only intentional infra names you chose to keep; sign-in still
> works after the cookie rename; extension version bumped.

### 2.3 Assets to produce
- **Delete** the starter assets in `web/public`: `next.svg`, `vercel.svg`, `window.svg`,
  `globe.svg`, `file.svg`.
- **Use the supplied logo:** `logo.svg` (full kiwi + "kiwiply" lockup — green "kiwi"
  `#94BD37`, charcoal "ply" `#2D3133`) is in the working dir and copied to
  `web/public/logo.svg`; `logo.png` is the raster fallback. Use `logo.svg` on light
  surfaces (header, sidebar, footer). Still **to produce:** `mark.svg` (kiwi mark only,
  for favicon/sidebar-collapsed/extension icon), a **light/knockout wordmark** for the
  dark hero + auth panel (the charcoal "ply" disappears on dark — the prototype uses a
  CSS stand-in there), `app/icon.png` (favicon from the mark), and `og-image.png`
  (1200×630 social preview — currently missing, hurts link sharing).
- **Extension icons**: regenerate `icons/icon16|48|128.png` from the kiwi mark so the
  toolbar icon matches (current icons are the old navy/gold folder).

---

## 3. Visual system — Editorial / Kiwi (final)

Warm, premium, calm. Serif display gives a distinctive, non-generic feel; the kiwi
green ties the color to the name. **Palette = the exact brand colors you supplied.**

### 3.1 Tokens (drop into `web/src/app/globals.css`, mirror in the extension)
Built from the **exact supplied brand palette** — `#94BD37` kiwi green · `#2D3133`
charcoal · `#986A35` kiwi skin · `#D4D3C8` warm gray · `#B7D283` light green · `#AB8F63`
tan · `#DFEAB9` pale green · `#725125` deep brown — plus near-white/grey neutrals for
surfaces and text.
```css
:root{
  --font-body:"Inter",system-ui,sans-serif;
  --font-display:"Fraunces",Georgia,serif;       /* headlines only */

  --app-bg:#ECEBE3;        /* warm light-gray canvas (from #D4D3C8 family) */
  --paper:#FBFAF6;         /* near-white warm surface (cards) */
  --paper-2:#E7E6DD;       /* subtle warm fill */
  --ink:#2D3133;           /* charcoal (brand) — body text & dark surfaces */
  --ink-soft:#4F5557;      /* warm grey text */
  --muted:#73746E;         /* muted warm grey */
  --line:#D4D3C8;          /* warm gray border (brand) */

  --accent:#94BD37;        /* kiwi green (brand) — CTAs, accents, fills */
  --accent-2:#B7D283;      /* light green (brand) — secondary / hover */
  --accent-soft:#DFEAB9;   /* pale green (brand) — pills, tints */
  --accent-deep:#5E7D1E;   /* darkened brand green — green TEXT on light */
  --on-accent:#2D3133;     /* charcoal text/icons ON green fills (lime needs dark) */

  --brown:#986A35;         /* kiwi skin (brand) — warm secondary */
  --brown-2:#AB8F63;       /* tan (brand) */
  --brown-deep:#725125;    /* deep brown (brand) */
  --brown-soft:#ECE2D1;    /* pale brown (tint of tan) */

  --ok:#5E7D1E; --warn:#986A35; --danger:#A23B2E;  /* danger red kept for UX clarity */

  --radius:10px; --radius-lg:14px; --radius-pill:999px;
  --shadow:0 1px 0 rgba(45,49,51,.04), 0 10px 26px rgba(45,49,51,.08);
  --shadow-lg:0 22px 56px rgba(45,49,51,.16);
  --hero-bg:linear-gradient(165deg,#2D3133,#2F3330,#37322B);  /* charcoal */
  --hero-ink:#FBFAF6;
}
```
Notes on neutrals: the supplied palette has no large light surface, so surfaces use a
**near-white warm** (`--paper`) over a **warm light-gray** canvas derived from `#D4D3C8`
(which itself is the border color). Text uses charcoal + warm greys (and pure black is
fine where you need maximum contrast). `--accent-deep` and `--brown-soft` are the only
two derived shades (a darker green for legible text, a pale brown tint) — everything else
is straight from your list.
Usage rules that keep it legible (warm palettes are easy to get wrong):
- **Primary button = ink (charcoal)**, not green. Green is the **accent**: key CTAs
  (`btn-accent`), pills, active states, links, progress, the overlay's left border.
- The accent is a **bright lime**, so **text/icons sitting *on* a green fill use
  `--on-accent` (#2D3133 charcoal), not white** — white on lime is unreadable.
  (Applies to accent buttons, the avatar initial, checkmarks, the AI badge, etc.)
- For green **text on light** use `--accent-deep` (#5E7D1E), never raw `--accent`.
- **Brown** is a sparing warm secondary — "needs review" badges, the Saved column dot,
  the "Draft — confirm?" pill. Don't overuse or it muddies.
- Headlines in **Fraunces** (display); everything else **Inter**. Don't set body in the
  serif.
- Dark surfaces (hero, auth panel) use a **charcoal** gradient with cream ink
  (`--hero-bg: linear-gradient(165deg,#2D3133,#2F3330,#37322B)`, `--hero-ink:#FBFAF6`)
  — no green in the background; the kiwi green stays reserved for accents/CTAs so it
  pops against the neutral dark.

### 3.2 Dark mode
The current `prefers-color-scheme: dark` auto-flip is a trap with a branded warm palette
— it half-works and was never designed for. **Drop the media query this pass.** Add a
real dark theme later as a `[data-theme="dark"]` token block + a toggle (R6.5).

---

## 4. Design system (the foundation task)

### 4.1 Tokens + Tailwind theme (`web/src/app/globals.css`)
Expose §3.1 as CSS vars **and** Tailwind v4 `@theme` colors (`--color-accent`,
`--color-ink`, `--color-paper`, `--color-line`, …) so pages use `bg-paper text-ink
border-line` instead of the current `border-foreground/15` opacity hacks. Load Fraunces
+ Inter via `next/font`.

### 4.2 Primitive components (`web/src/components/ui/`)
Stop re-declaring Tailwind strings (today's `rounded-full bg-foreground px-5…` is copied
across pages). Build: `Button` (primary/accent/ghost/danger), `Input`+`Field`
(label+input+error slot), `Select`, `Card`, `Badge`/`Pill`, `Tag`, `Switch`, `Toast`
(new), `Skeleton` (new), `EmptyState` (new), `Logo`/`Mark`. Port the classes 1:1 from
`mockups.html` (`.btn`, `.input`, `.card`, `.switch`, `.chip`, …).

---

## 5. Information architecture & navigation

### 5.1 Marketing shell vs app shell (the big structural change)
Split into two Next.js **route groups** (URLs unchanged):
- **`(marketing)/layout.tsx`** — sticky top header (logo, How it works / Features /
  Pricing / Privacy, Sign in, Get started). Used by `/`, `/privacy`, `/pricing`.
- **`(app)/layout.tsx`** — **persistent left sidebar** (Dashboard, Profile, Resumes,
  Application board, Settings) + a top bar (breadcrumb, page title, primary action, user
  chip), **plus a mobile top bar with a hamburger that opens the sidebar as a drawer**
  (see §9). Does the `hasSession()` gate **once**, instead of every page repeating it.
  This deletes the hand-rolled `<header><nav>…` from `profile`, `resumes`, `board`,
  `settings`.

### 5.2 New route `/dashboard` (post-login home)
Today login dumps you on `/settings` — wrong. Add a **Dashboard** as the authed home and
the login redirect target: KPI row (applications, interviews, response rate, drafts-to-
confirm), a **"Finish setting up" checklist** (your activation driver), quick actions,
and a recent-activity feed that surfaces the "Draft — confirm?" nudge.

### 5.3 Route map (before → after)
| Route | Now | After |
|---|---|---|
| `/` | minimal hero + 3 text features | full marketing landing (§6.1) |
| `/login`,`/signup` | two bare forms | one split-screen, tabbed (§6.2) |
| `/account/activate` | text states | branded card |
| `/dashboard` | — | **new** authed home (§5.2) |
| `/settings` | post-login dump + links | real settings + sub-nav (§6.6) |
| `/profile` | one long form | sectioned "Your profile" + strength meter (§6.3) |
| `/resumes` | upload + list | drop-zone + richer variant cards (§6.4) |
| `/board` | kanban, select status | kanban + tools + card detail (§6.5) |
| `/privacy` | fine | reskin + real contact email |
| `/pricing` | — | **new** (marketing) |

---

## 6. Page-by-page (current → proposed)

### 6.1 Marketing landing `/`
Now: a `max-w-5xl` column, an uppercase "Dossier" pill, three text features, no header/
proof/images/pricing. Proposed: sticky header; **hero** (headline + subcopy + dual CTA +
a product-peek card mocking the review overlay + trust strip); **how it works** (3
steps); **features** (4 cards); **pricing** (3 tiers); footer. Highest-leverage screen
for adoption and currently the weakest — build first after the design system.

### 6.2 Auth `/login` + `/signup`
Now: two separate `max-w-sm` pages; login → `/settings`. Proposed: **split-screen** —
left brand panel (warm-charcoal gradient, value prop, testimonial), right form with
a **Sign in / Create account** toggle (keep both routes, share the component). Add a
"Continue with Google" slot. **Change post-login redirect to `/dashboard`.** Branded
`/account/activate` reusing the panel.

### 6.3 Profile `/profile` → "Your profile"
Now: one flat 2-column grid of ~16 fields + a yes/no pair + a Save button; EEO only in
the extension. Proposed: left **section sub-nav** (Identity & contact · Location · Links
· Work authorization · EEO/demographics) + a **profile-strength meter** (drives the
dashboard checklist); fields grouped under headers; **skills as chips** (port the
extension's chip editor); EEO in an opt-in collapsible; **autosave** with a sticky
"saved / Save" bar.

### 6.4 Resumes `/resumes`
Now: file input (no drag-drop), inline parsed preview, simple rows, archived section,
409 archive-guard shown as a raw error. Proposed: real **drag-and-drop drop-zone** (the
parser is already in-browser); **variant cards** (file icon, label, status badge: Needs
review / Ready / Default, meta line, **"used in N applications"**, actions); a
**default-resume** concept feeding the popup picker; the archive-guard 409 becomes a
friendly inline explanation.

### 6.5 Board `/board`
Now: 6 columns, cards with company/role/ATS/resume/URL, status via `<select>`, amber
"Did you submit?" nudge, delete ×, dashed empty box. Proposed: **board tools** (search,
filter by resume, sort); **drag-and-drop** between columns (keep select as a11y
fallback); the **"Did you submit?" nudge** styled as the accent callout (signature
feature — make it intentional); a **card-detail slide-over** showing the **captured job
description**, notes, status history, and the exact resume sent (today the JD is captured
but never shown — this is the Teal-style payoff); an engaging empty state.

### 6.6 Settings `/settings`
Now: doubles as post-login landing; account info read-only + "Manage" links; AI/autofill
toggles live only in the extension. Proposed: real settings with **sub-nav** — Account
(editable email/password) · **AI & drafting** (Kiwiply AI + BYO key, surfaced on web) ·
Autofill behavior (auto-advance, EEO default) · Privacy & data (export, delete) · Billing
(plan). `Switch` primitive; danger zone as a red card with type-to-confirm (reuse
existing `DeleteAccountButton` logic).

### 6.7 Extension (popup · options · overlay)
Most polished surface; needs **brand alignment + small UX**: re-token to the kiwi palette
and rename `.brand` "Dossier" → "Kiwiply" in `popup.css`/`options.css`/`filler.js`
`CSS_TEXT` (bump version); popup gets the logo lockup + clearer ready/empty/error states;
options keeps the 4-tab structure but modernizes the resume-drawer date controls, adds a
sticky save, and groups the AI settings (BYO vs Kiwiply AI); the **review overlay** keeps
its left accent border (now green), improves AI-badge legibility, adds an "advancing…"
micro-state and a "regenerate draft" affordance, and keeps the "never clicks Submit"
note. **Overlay tokens stay inline in the Shadow DOM** — mirror §3.1 values; don't
inherit page CSS.

---

## 7. Cross-cutting UX (Phase R6)
Toasts replacing inline "Saved." text · loading **skeletons** for server-fetched lists ·
**empty states** everywhere · inline form **validation** (email/URL/required via the
`Field` error slot) · optional real **dark mode** · an **a11y pass** (focus rings,
contrast on `--muted` text, keyboard nav on the board, `aria` on the overlay dialog).

---

## 8. Execution plan for Claude Code (phased; one task = one commit)

> `CLAUDE.md` rules: one task, update `PROGRESS.md`, commit+push as its own commit, bump
> extension versions when extension code changes, keep `npm test` green. Commit prefix:
> `redesign.<phase>.<n>:`.

### Phase R0 — Foundations (first; everything depends on it)
- **R0.1 Tokens.** Rewrite `globals.css` with §3.1 as CSS vars + Tailwind `@theme`;
  load Fraunces+Inter via `next/font`; remove the Geist/black-white defaults and the
  `prefers-color-scheme` block. *Accept:* a sample page renders in the kiwi palette; no
  `--foreground/--background` refs remain.
- **R0.2 UI primitives** in `components/ui/` (§4.2), ported from `mockups.html`.
- **R0.3 Brand assets** (§2.3): delete starter SVGs; add logo/mark/icon/og-image; set
  `metadata` (title/description/OG) in root layout. *Accept:* favicon + link preview show
  Kiwiply.

### Phase R1 — App shell & IA
- **R1.1 Route groups + layouts** `(marketing)` / `(app)`; move routes in (URLs
  unchanged); app layout renders sidebar + top bar **+ mobile drawer** and gates session
  once. *Accept:* authed pages share the sidebar; public pages share the marketing
  header; no per-page nav rows remain; drawer works on mobile.
- **R1.2 Dashboard** (`(app)/dashboard/page.tsx`): KPIs, setup checklist, quick actions,
  recent activity, wired to `/api/profile/applications`; login redirect → `/dashboard`.

### Phase R2 — Marketing
- **R2.1 Landing rebuild** (§6.1). **R2.2 Pricing** (`/pricing`, Free-only + "Pro coming
  soon" if not live — see §11). **R2.3 Privacy reskin** + replace placeholder
  `privacy@dossier.app` with the real address + Kiwiply name.

### Phase R3 — Auth
- **R3.1 Split-screen auth** shared by `/login` + `/signup` with tab toggle; branded
  `/account/activate`; redirect → dashboard.

### Phase R4 — Core app screens
- **R4.1 Profile** (§6.3) · **R4.2 Resumes** (§6.4) · **R4.3 Board** (§6.5, incl. JD
  card-detail) · **R4.4 Settings** (§6.6). Each: keep existing API behavior underneath,
  new UI on top; *Accept* = current save/delete/status flows still pass.

### Phase R5 — Extension (bumps versions)
- **R5.1 Re-token + rename** (palette + Kiwiply) · **R5.2 Popup polish** · **R5.3 Options
  polish** · **R5.4 Overlay polish**. *Accept:* no "Dossier" in UI; Shadow DOM isolation
  preserved; `npm test` + smoke test green.

### Phase R6 — Cross-cutting polish
- **R6.1 Toasts · R6.2 Skeletons · R6.3 Empty states · R6.4 Validation · R6.5 Dark mode
  (optional) · R6.6 a11y pass.**

### Phase R7 — Internal rename + responsive QA
- **R7.1 Code-identifier rename** (bucket 2 in §2.2: `Kiwiply*` classes, cookie names) as
  one coordinated, tested commit across web+API+extension.
- **R7.2 Responsive QA pass** against §9 at 360 / 768 / 1024 / 1440px on every screen.

---

## 9. Responsive requirements (must hold on every screen, ~360px → desktop)

Breakpoints: **base (mobile-first) · `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280**. Rules:

- **App shell:** sidebar is persistent ≥ `lg`; below it, collapse to an **off-canvas
  drawer** opened by a hamburger in a mobile top bar, with a scrim that closes on tap
  (built in the prototype — resize to see). Never leave nav inaccessible on mobile.
- **Marketing:** hero is two-column ≥ `md`, single column stacked below (image/peek under
  the copy); nav links collapse into the CTA row (or a menu) on small screens; type
  scales down (h1 ~52→33px).
- **Board:** keep the kanban **horizontally scrollable** on small screens (don't force-
  wrap columns); cards stay full-width within their column; the card-detail slide-over
  becomes a full-height sheet on mobile.
- **Profile / Settings:** the left sub-nav becomes a **horizontally scrollable pill row**
  above the content on small screens; form grids collapse 2-col → 1-col; the sticky
  save/discard bar stays reachable.
- **Resumes:** variant cards reflow — actions wrap below the meta on narrow widths; the
  drop-zone stays tappable.
- **Tables/long values:** truncate with ellipsis + wrap where needed; never cause
  horizontal page scroll (only the board scrolls intentionally).
- **Tap targets** ≥ 40px; inputs ≥ 16px font to avoid iOS zoom; respect safe-area insets.
- **Extension:** the popup is a fixed ~340px (correct for a browser action); the
  **options/manager page must be responsive** (its sidebar → top tabs on mobile); the
  overlay is already `max-width:92vw` — keep it.
- *Accept* (R7.2): no horizontal overflow at 360px on any screen except the intentional
  board scroll; drawer + scrim work; sub-navs scroll; forms single-column on mobile.

---

## 10. "Should we use React for the backend?" — short answer: no, keep Spring Boot

A few things to untangle, because the framing mixes layers:

- **React is a front-end UI library — it does not run a backend.** It renders components
  in the browser (and via SSR). It can't be "the backend" the way Spring Boot or Node is.
- What people usually mean by this is one of: (a) **Next.js full-stack** (use Next's API
  route handlers / server actions as the backend), or (b) a **Node/TS backend** like
  NestJS/Express instead of Spring.
- **You already have the healthy amount of "JS backend."** The Next.js web app's route
  handlers (`web/src/app/api/**`) act as a **backend-for-frontend**: they hold the JWT in
  httpOnly cookies and proxy to Spring. That's exactly the right use of a React/Next
  server layer — keep it.
- **The real backend (Spring Boot + MySQL + S3, JWT auth) is already built, deployed,
  and live** on your VPS with CI/CD, and the stack was chosen deliberately (it's your
  strongest skill and the cheapest path to SaaS margins — see `ROADMAP.md`). Rewriting a
  working, live API in Node/Next for a **UI redesign** is large, risky scope creep with
  **zero user-visible benefit**. The redesign touches presentation only; it never needs
  to change the API.

**When a JS backend *would* make sense** (note for the future, not now): if you wanted a
single language across the stack, a tiny team, and heavy server-rendered React with
server actions, a Next-only or NestJS backend is reasonable — but that's a from-scratch
or deliberate-migration decision, justified by team/velocity, **not** by a restyle. My
recommendation: **leave the architecture exactly as the locked decisions in `CLAUDE.md`
have it.** If you want, I can write a one-page "stay vs. migrate" analysis separately.

---

## 11. Open decisions for you (the "few more things" — tell me and I'll fold them in)
1. **Logo on dark backgrounds** — `logo.svg` is supplied/used on light surfaces; I still
   need a **light/knockout wordmark** for the hero/auth panel (charcoal "ply" vanishes on
   dark; prototype uses a CSS stand-in there). Want me to generate it?
2. **Pricing reality** — are paid tiers live at launch, or is `/pricing` aspirational
   ("Pro coming soon")? Changes R2.2 copy + the Settings → Billing section.
3. **Google sign-in** — wire it now or stub the button?
4. **Internal rename scope** — confirm you want the code-identifier + cookie rename (R7.1)
   now, or keep internal `dossier*` names and only purge user-facing text?
5. **Dark mode** — ship without it now (recommended) or build the real toggle in R6.5?
6. **Anything else you want changed** — list it and I'll update both the prototype and
   this plan before we hand it to Claude Code.
