# Landing v2 — design spec (branch `version2`)

**Status:** design locked 2026-10-10 (Fable). Implementation runs in phases V2.1–V2.6 below, one
commit each, **on the `version2` branch only** — no PR into `develop`/`main` until the user asks.
Reference mockups: `design/landing-v2/*.webp` (the AI-generated boards the user supplied).
This file is the contract; the mockups are the mood. Where they disagree, this file wins.

## 0. What this is, in one paragraph

A brand-new marketing surface for kiwiply.com: a bright "Kiwiply Bright" theme (airy
blue-white canvas, navy headlines, lime CTAs, coloured accent families, hand-written doodles,
a mascot, floating glass cards), a **hero carousel** with four audience slides, a long-form
landing page, an **/about** page and an **/organizations** page, all responsive down to 375px.
The signed-in app (`(app)` routes), the extension and the design-system defaults are **not**
restyled — the new look is scoped to the `(marketing)` route group through one theme class.

## 1. Non-negotiables (read before building)

1. **Honest copy only.** The mockups contain invented claims. These are banned:
   - "Auto apply", "applies for you", "on autopilot" as a *submission* claim. Kiwiply never
     submits. Say **autofill**, **prepares**, **you review and submit**. The word "Autopilot" may
     appear only as the plan name, with its real meaning ("prepares applications, you submit").
   - Fake social proof: "Trusted by 1M+ job seekers", "10,000+ companies", "100K+ applications",
     "5x faster", star ratings, named testimonials. **No stats section, no testimonials** until
     real ones exist. The code keeps an empty `TESTIMONIALS` array and renders nothing.
   - Partner logos we don't integrate with (LinkedIn, Indeed, Glassdoor, ZipRecruiter, Handshake,
     Wellfound). The trust strip shows the **real ATS set**: Workday, Greenhouse, Lever, Ashby,
     Workable (`/public/ats/*.png`, already present).
   - "Gmail **or Outlook**" — Inbox is **Gmail over IMAP only**. Say "Connect your Gmail".
   - "Hire top talent / grow your team" on the organisations slide — the org product is
     **placement** (consultancies and teams supporting *their people's* job search), not
     recruiting. Use the placement framing from `organizations-desktop-full.webp`.
   - "Made with ♥ in New Zealand", "founded by students", team photos — unverified. Omit.
   - "Watch demo (2 min)" — render only when `DEMO_VIDEO_URL` in `web/src/lib/site.ts` is set
     (it starts as `null`, so the button is hidden).
2. **Design-system rules still apply.** Every icon and decorative doodle is an `@kiwiply/ui`
   component (`packages/ui/src/primitives/icons.tsx` + new `doodles.tsx`). No inline `<svg>` in
   `web/` (ESLint fails the build). No new runtime deps: carousel, dropdowns and the mobile sheet
   are hand-written; fonts come from `next/font/google` (free, no package).
3. **Scoped theme, shared tokens.** The new look is a token *override* under `.theme-v2`
   (`packages/ui/styles/theme-v2.css`), applied by the `(marketing)` layout wrapper. Primitives
   (`Button`, `Card`, `Badge`, `Tag`, `Dialog`) keep working and simply restyle. No `.dark`
   support for v2 in this pass (the mockups are light-only).
4. **Existing behaviour survives.** Pricing + Services sections (`PricingSection`,
   `ServicesSection`) stay on `/` under `#pricing` / `#services` with their pop-ups, Stripe
   buttons and `/contact?topic=` links intact. `/pricing` keeps redirecting to `/#pricing`.
   The signed-in header state (Dashboard + avatar) survives in the new header. Newsletter
   sign-up stays in the footer. The beta "as is" disclaimer stays in the footer.
5. **Assets the user supplies.** Mascot renders and people photos are **not** in the repo and
   must not be cropped out of the mockups (baked-in text, no transparency). Build with graceful
   fallbacks (see §5) so the pages ship complete without them; the user drops files into
   `web/public/v2/` later and they appear.
6. **Branch discipline.** All work on `version2`. Commit per phase: `v2.<N>: <subject>`. Push the
   branch. Add one Log line to `PROGRESS.md` per phase. Never open a PR.

## 2. Theme: "Kiwiply Bright" (`packages/ui/styles/theme-v2.css`)

Two blocks. The first **adds new tokens** (must be in `@theme` so Tailwind emits utilities —
a bare `:root` block is stripped, see the comment atop `tokens.css`). The second **overrides
existing token names** under `.theme-v2` so primitives restyle.

### 2.1 New tokens (`@theme`, light values; prefix `v2-` keeps them out of the app's way)

| Token | Value | Use |
|---|---|---|
| `--color-v2-canvas` | `#F6F9FF` | page background |
| `--color-v2-navy` | `#1B1F5E` | headlines, footer bg (`#0F1340` for footer, see below) |
| `--color-v2-navy-deep` | `#0F1340` | footer background |
| `--color-v2-ink-soft` | `#4A4F78` | body copy |
| `--color-v2-muted` | `#6E7294` | captions |
| `--color-v2-line` | `#E3E8F2` | hairlines |
| `--color-v2-lime` | `#84E33D` | primary CTA fill |
| `--color-v2-lime-deep` | `#5FBF1F` | hover / lime text on white |
| `--color-v2-lime-soft` | `#E9FBD9` | tints |
| `--color-v2-green` | `#20B33D` | "Get hired." headline word, success |
| `--color-v2-green-soft` | `#E4F7E8` | tints |
| `--color-v2-violet` | `#6A4CF5` | "on autopilot." headline word, purple family |
| `--color-v2-violet-soft` | `#EEEAFF` | |
| `--color-v2-blue` | `#1E6FF5` | "your team." headline word, blue family |
| `--color-v2-blue-soft` | `#E8F0FF` | |
| `--color-v2-teal` | `#1EA7A0` | "that fit you." headline word |
| `--color-v2-teal-soft` | `#E3F6F4` | |
| `--color-v2-coral` | `#F05252` | heart / rejection |
| `--color-v2-coral-soft` | `#FFECEC` | |
| `--color-v2-amber` | `#F5A623` | mail / warning |
| `--color-v2-amber-soft` | `#FFF4E0` | |
| `--color-v2-pink` | `#E040A0` | grid / "organise" family |
| `--color-v2-pink-soft` | `#FFE8F4` | |
| `--color-v2-sticky` | `#FFF3B0` | sticky-note background |
| `--color-v2-sticky-ink` | `#5C4A00` | sticky-note text |
| `--shadow-v2-card` | `0 10px 30px rgba(27,31,94,.08), 0 1px 0 rgba(27,31,94,.04)` | floating cards |
| `--shadow-v2-float` | `0 24px 60px rgba(27,31,94,.14)` | hero cards |
| `--radius-v2-card` | `18px` | floating cards |
| `--radius-button` | `9999px` | **added to `tokens.css`** (default pill); v2 sets `12px` |

`Button.tsx` changes `rounded-full` → `rounded-[var(--radius-button)]` and gains a `lg` size
(`px-6 py-3.5 text-[15px]`). This is the only primitive edit; the extension is unaffected
(its radius stays 9999px).

### 2.2 Overrides (`.theme-v2 { … }`, outside `@theme`)

```
--color-app-bg: var(--color-v2-canvas);   --color-paper: #FFFFFF;   --color-paper-2: #F1F5FB;
--color-ink: var(--color-v2-navy);        --color-ink-soft: var(--color-v2-ink-soft);
--color-muted: var(--color-v2-muted);     --color-line: var(--color-v2-line);
--color-accent: var(--color-v2-lime);     --color-accent-2: var(--color-v2-lime-deep);
--color-accent-soft: var(--color-v2-lime-soft); --color-accent-deep: #3E8F0E;  /* AA green text on white */
--color-on-accent: var(--color-v2-navy);  --color-hero-ink: #FFFFFF;
--color-ok: var(--color-v2-green);        --color-warn: var(--color-v2-amber);
--color-danger: var(--color-v2-coral);
--shadow: var(--shadow-v2-card);          --shadow-lg: var(--shadow-v2-float);
--radius: 12px; --radius-lg: 18px; --radius-button: 12px;
--font-display: var(--font-jakarta), "Plus Jakarta Sans", Inter, system-ui, sans-serif;
--font-hand: var(--font-caveat), "Caveat", cursive;
```

`h1/h2/h3` under `.theme-v2`: `font-weight: 800; letter-spacing: -.025em; line-height: 1.02`.

### 2.3 Typography

- **Display:** Plus Jakarta Sans 700/800 via `next/font/google` (`variable: "--font-jakarta"`),
  loaded in the `(marketing)` layout and put on the wrapper's `className` so the var is scoped.
- **Body:** Inter (already loaded at root).
- **Handwriting:** Caveat 600 (`--font-caveat`) for annotations like "Step by step to your next
  chapter." — always `aria-hidden` decoration, never the only carrier of information.
- Hero h1: 56/60px desktop (`lg:text-[60px]`), 44px tablet, 36px mobile. Three lines; the final
  line takes the slide's accent colour. Section h2: 36/40px desktop, 28px mobile.

### 2.4 Canvas

Body background = canvas colour plus two soft radial blobs fixed behind the hero
(lime at top-left, sky-blue at top-right, 40% opacity, blurred). Implemented as a
`.v2-blobs` pseudo-element on the hero section, not on `body`.

## 3. New shared visuals in `@kiwiply/ui`

### 3.1 Icons (`icons.tsx`, same `makeIcon` idiom, 24×24 stroke)

`ArrowRightIcon`, `ChevronRightIcon`, `MenuIcon`, `PlayIcon`, `SparklesIcon`, `TargetIcon`,
`LayoutGridIcon`, `CalendarIcon`, `HeartIcon`, `BriefcaseIcon`, `GraduationCapIcon`,
`RefreshIcon` (two arrows; keep `RestoreIcon` as is), `ZapIcon`, `LightbulbIcon`,
`CheckCircleIcon`, `ClockIcon`, `TrophyIcon`, `LayersIcon`, `ShieldCheckIcon`,
`ClipboardIcon`, `InboxIcon`, `TrendingUpIcon`, `ChatIcon` (keep `MessageIcon`),
`GlobeIcon`, `LockIcon`.

### 3.2 Doodles (`packages/ui/src/primitives/doodles.tsx`, exported from the barrel)

Hand-drawn decorations from the mockups, stroke-based on `currentColor`, each `aria-hidden`
by default, sized via `className`:

`SparkBurst` (the three short "!!" lines), `CurvedArrow` (swooping arrow, `direction` prop:
`down-right | down-left | up-right`), `Squiggle`, `StarDoodle` (five-point outline), `PaperPlane`
(with dotted trail), `Confetti` (three short ticks), `Underline` (rough single underline for
headline words), `CircleScribble`.

### 3.3 Mascot and photo slots — web only (`web/src/components/marketing/media.tsx`)

- `Mascot({ pose, className })` — poses: `wave | laptop | headphones | envelope | plane`.
  Looks up `/public/v2/mascot-<pose>.png` with a server-side `publicFileExists()`
  (`fs.existsSync(path.join(process.cwd(), "public", …))`; the standalone build copies
  `public/`). Present → `next/image` with fixed box. Absent → fallback: a lime circle with
  the shared `Mark` inside and a subtle drop shadow, same box, so layout never shifts.
- `Photo({ id, alt, className })` — ids: `hero-individual`, `hero-student`, `hero-team`,
  `hero-copilot`, `about-portrait`, `about-team`, `org-team`. Present → `next/image`,
  `sizes` set per breakpoint. Absent → a soft gradient panel (lime-soft → blue-soft) with a
  faint `SparkBurst`, same aspect ratio.
- Document the expected files in `web/public/v2/README.md` (names, transparent PNG for
  mascots, ~1600px JPG/WebP for photos, people looking toward the headline).

## 4. Components (`web/src/components/marketing/`)

| File | Kind | Notes |
|---|---|---|
| `nav.ts` | data | nav tree (below), footer columns, `SOCIAL_LINKS` (empty — renders nothing) |
| `MarketingHeader.tsx` | client | sticky, translucent white (`bg-white/85 backdrop-blur`), 72px tall; logo; desktop nav with hover/focus dropdown panels; `Log in` (ghost) + `Get Started Free →` (accent, `lg` on ≥md); signed-in → `Dashboard` + avatar (port from current layout). Mobile (<lg): `MenuIcon` button → full-width sheet under the header with accordion groups and both CTAs; Escape closes; body scroll locked; focus returns to the button |
| `MarketingFooter.tsx` | server | navy (`v2-navy-deep`) footer: brand lockup (dark-mode logo `/logo-dark-mode.png`) + one-line blurb; four link columns; a white card holding the existing `NewsletterSignup`; bottom row: © year, Privacy, Terms, Contact, the beta disclaimer |
| `HeroCarousel.tsx` | client | see §6 |
| `hero-slides.tsx` | data | the four slides (copy + accent family + floating cards + photo id + mascot pose) |
| `FloatingCard.tsx` | server | white card, `rounded-[var(--radius-v2-card)]`, `shadow-v2-float`, optional tilt (`rotate-[-3deg]`), icon tile in a soft family colour |
| `Eyebrow.tsx` | server | mixed-case pill (not uppercase like `Tag`): `family` prop picks soft bg + deep text (`lime | green | violet | blue | teal | coral | amber | pink`) |
| `Handwritten.tsx` | server | Caveat span, `aria-hidden`, colour from family |
| `SectionHeading.tsx` | server | eyebrow + h2 (with optional coloured word) + lede; `align="left|center"` |
| `FeatureTile.tsx` | server | icon tile + title + body; used by pillars, tools, values |
| `TrustStrip.tsx` | server | "Fills applications on" + the five ATS PNGs (static row, no marquee; wraps on mobile) |
| `mocks/*.tsx` | server | pure HTML product mocks: `InboxMock`, `MatchesMock`, `ResumeMock`, `DashboardMock`, `OrgTableMock`, `OrgStatsMock`. Sample data is clearly fictional (names like "Jordan L.", companies "Northwind", "Acme Robotics"); every mock carries a tiny "Example" badge. No real company logos (Spotify/Google/Notion in the mockups are out) |
| `FinalCta.tsx` | server | lime-soft band with mascot `wave`, headline, two buttons |
| `sections/*.tsx` | server | one file per landing section (§7) so pages compose them |

### 4.1 Navigation tree (`nav.ts`)

- **For Individuals ▾** → Find jobs (`/#matches`), Autofill applications (`/#autofill`), Track
  your inbox (`/#inbox`), Resumes (`/#resumes`), Who it's for (`/#individuals`), Pricing (`/#pricing`)
- **For Organizations ▾** → Overview (`/organizations`), How it works (`/organizations#how`),
  Consultancy plan (`/#pricing`), Talk to us (`/contact?topic=organization`)
- **Pricing** → `/#pricing`
- **Resources ▾** → About (`/about`), Contact (`/contact`), Expert services (`/#services`),
  Privacy (`/privacy`), Terms (`/terms`)

Footer columns: For Individuals · For Organizations · Resources · Company (About, Contact,
Privacy, Terms). No Blog / Careers / Press / Help Center links (they don't exist).

## 5. Pages and routes

| Route | File | Status |
|---|---|---|
| `/` | `(marketing)/page.tsx` | rewritten (§7) |
| `/about` | `(marketing)/about/page.tsx` | new (§8) |
| `/organizations` | `(marketing)/organizations/page.tsx` | new (§9) |
| `/pricing` | unchanged redirect | |
| `/contact`, `/privacy`, `/terms` | unchanged content; they inherit the theme | |

`sitemap.ts`: add `/about` (0.5) and `/organizations` (0.6), `lastModified` = the commit date.
Root `metadata` title/description updated to the v2 positioning (§7.1). Each new page sets its
own `title` + `description`.

## 6. Hero carousel (the centrepiece)

**Layout.** Two columns on ≥lg (`grid-cols-[1fr_1.1fr]`), stacked on mobile (copy first, art
second). Min height 640px desktop. Left: `Eyebrow`, h1 (three lines, last line coloured),
lede (max 520px), CTA row (`Get Started Free →` accent lg; `Watch demo` only when
`DEMO_VIDEO_URL`), trust ticks row (three `CheckCircleIcon` items). Right: `HeroArt` — the
`Photo` slot anchored bottom-centre, the `Mascot` slot bottom-right overlapping it, three to five
`FloatingCard`s positioned absolutely with gentle rotations, doodles (`CurvedArrow`, `SparkBurst`,
`StarDoodle`, `PaperPlane`) and one `Handwritten` note. On mobile the art collapses to the photo
+ mascot + the first two cards stacked (no absolute positioning below `md`).

**Slides** (accent family · headline · lede · trust ticks · floating cards):

1. **Copilot (default)** · green · "Find jobs. / Apply faster. / **Get hired.**" ·
   "Kiwiply finds roles that fit, autofills applications with AI, tracks every reply in your
   inbox, and keeps your search in one place — you review and submit." ·
   ticks: Works on major ATS · No credit card · Free plan ·
   cards: *Top job matches for you* (3 rows: role · company · match %) · *Autofill with AI* ·
   *Track replies in real time* · *Get hired* (heart).
   Handwritten: "Same me. More opportunities." Photo `hero-copilot`, mascot `headphones`.
2. **Autopilot** · violet · "Your / job search / **on autopilot.**" ·
   "Pick the jobs. Kiwiply prepares each application in your browser — right resume, drafted
   answers, every field filled. You press submit." ·
   ticks: Prepares up to 30 a day · You submit · Never ticks attestations for you ·
   cards: *Find jobs that match you* → *Prepare with AI* → *Track updates* → *Get hired* (the
   arrow chain from the mockup, `CurvedArrow` between cards). Handwritten: "Step by step to your
   next chapter." Photo `hero-individual`, mascot `laptop`.
3. **Students & early career** · teal · "Discover / opportunities / **that fit you.**" ·
   "Upload one resume, get a profile that builds itself, and apply to the roles that match where
   you're starting from." · ticks: No credit card · Free plan · Built for first jobs ·
   cards: *Career matches* (3 rows with match %) · *Skills on your profile* (chips) ·
   *Resumes, parsed for you*. Handwritten: "Explore. Learn. Grow. Get hired." Photo
   `hero-student`, mascot `wave`.
4. **Organisations** · blue · "A smarter way / to support / **your people.**" ·
   "Consultancies and teams: prepare resumes, job banks and outreach for every consultant in
   one place. They approve, fill and submit." · ticks: One account per consultant · Marketers
   never submit · Setup fee + per person · primary CTA becomes **Explore for Organizations →**
   (`/organizations`) · cards: *Team applications* (table mock) · *Team insights* (bars) ·
   *Collaborate* · *Track progress*. Handwritten: "Build great careers together." Photo
   `hero-team`, mascot `plane`.

**Behaviour.** Autoplay every 7s; pauses on hover, on focus within, when the tab is hidden, and
entirely under `prefers-reduced-motion` (then it is manual only). Controls: dots (buttons with
`aria-label="Slide 2 of 4: Autopilot"`), prev/next arrows (≥md), ←/→ keys when the region has
focus, horizontal swipe via pointer events (threshold 40px). Track = `translateX(-index*100%)`
with a 500ms ease; `aria-roledescription="carousel"`, each slide `role="group"`
`aria-roledescription="slide"`, inactive slides `aria-hidden` + `inert`. A visually-hidden
`aria-live="polite"` announces the slide title on change. No deps, no layout shift: all slides
share the fixed min-height.

## 7. Landing page `/` — section order and copy

Sections are separate server components in `components/marketing/sections/`; `page.tsx`
composes them and still fetches `hasSession()` / `getPlan()` for the pricing section.

### 7.1 Positioning line (root metadata)
Title: "Kiwiply — find jobs, autofill applications, track every reply". Description: "Kiwiply
matches you with roles, fills job applications for you to review, and tracks replies in your
Gmail — one profile, one board, no auto-submit."

### 7.2 Order
1. **Hero carousel** (§6).
2. **Trust strip** — `TrustStrip`: "Fills applications on" + ATS logos + "and every form the
   engine recognises".
3. **Pillars** (`#pillars`, five `FeatureTile`s in a row, 2-col on mobile): Find the right jobs
   (`SearchIcon`, blue) · AI autofill (`ZapIcon`, amber) · Best resume per job (`FileTextIcon`,
   pink) · AI-drafted answers (`SparklesIcon`, violet) · Track everything (`ChartIcon`, green).
   Each body is one honest sentence; "Pro" chips on the AI tiles.
4. **Inbox tracking** (`#inbox`, lime-soft band): eyebrow "Track applications" · h2 "We track
   your job-application emails automatically." · lede "Connect your Gmail and Kiwiply reads
   recruiter replies, interview invites and rejections, then updates your board — we never
   send, move or delete mail." · CTA "See how Inbox works" → `/signup` · right: `InboxMock`
   + mascot `envelope` + handwritten "We'll keep an eye on your inbox!"
5. **Job matches** (`#matches`): eyebrow "Find better opportunities" · h2 "Get personalised job
   matches." · lede "Fresh roles from company job boards, scored against your resume and
   preferences overnight. Free gets three a day; Pro gets the full ranked list." · CTA
   "Find my matches" → `/signup` · `MatchesMock` left, copy right (alternate side).
6. **Resumes** (`#resumes`): eyebrow "Resumes that fit the job" · h2 "The right resume for
   every application." · lede "Keep tailored variants. Kiwiply picks the best one per posting,
   shows what the ATS will miss, and remembers which one you sent where." · `ResumeMock`.
   (No "builder", no "cover letter" — those are Launch 2.)
7. **One dashboard** (`#dashboard`): eyebrow "One dashboard" · h2 "Keep track of everything in
   one place." · `DashboardMock` (sidebar + board + three stat chips with *example* counts).
8. **How it works** (`#how`): four steps in cards with connector arrows: Find jobs · Autofill
   with AI · Track replies · Get hired — every step ends with "you stay in control" wording.
9. **For individuals** (`#individuals`): eyebrow "For individuals" · h2 "Land your next role." ·
   audience list (Students · New grads · Career switchers · Freelancers & contractors ·
   Professionals · Returning to work) as rows with `ChevronRightIcon` → all link to `/signup`;
   photo `hero-student` + mascot `headphones` on the right.
10. **For organisations** (teaser): eyebrow "For organisations" · h2 "Support your people's
    search." · checklist (Multiple consultants · Marketer-prepared applications · Role-based
    access · Progress across the bench · Expert services per person) · CTA "Explore for
    Organizations →" → `/organizations` · `OrgTableMock`.
11. **Pricing** + **Services** — existing components, untouched except that they inherit the
    theme. Verify the `Card`, `Badge`, `Dialog` and `UpgradeButton` still read well on the white
    paper / navy ink; adjust only via tokens.
12. **Final CTA** — `FinalCta`: "Your next opportunity is waiting." · "Build one profile, apply
    with less busywork, and keep every application in sight." · Get Started Free · View pricing.

## 8. `/about`

Order (from `about-desktop-b.webp`, trimmed to what is true):
1. Hero: eyebrow "About Kiwiply" · h1 "We're building a smarter way / to get people hired." ·
   lede "Kiwiply exists to make job searching simpler and more human: one profile, AI that does
   the repetitive parts, and a board that keeps every application in sight — with you making
   every decision." · CTAs: Our mission (`#mission`, ghost) · Get Started Free. Right: photo
   `about-portrait` + a `FloatingCard` checklist (Find the right jobs · Autofill with AI ·
   Track every reply · Prepare for interviews) + mascot `headphones` + sticky note "Same me.
   Bigger opportunities."
2. Values strip (4 tiles): People first · Smarter matching · Less busywork · Brighter futures.
3. **Why we built Kiwiply** (`#mission`): two columns — photo `about-team` with two small
   floating cards; copy from the mockup, rewritten honestly (friction: tabs, repetitive forms,
   unclear status; what we did: autofill you review, inbox tracking, one board). Quote card:
   "Because everyone deserves a fair shot at a career they're excited about."
4. **Who we serve** (4 cards with photos → fallback panels): Students · New grads · Career
   switchers · Organisations (→ `/organizations`).
5. **What makes Kiwiply different** (6 `FeatureTile`s with tiny mocks): AI autofill · Best
   resume per job · Email tracking · Job match discovery · Interview readiness (expert mock
   interviews + coaching, via services) · All-in-one dashboard.
6. **What guides us** (6 values): People first · Simplicity · Opportunity for everyone ·
   Progress with confidence · Privacy & trust ("your data is yours; delete any time") ·
   Human-centred AI ("AI drafts, you decide — never auto-submit").
7. **Our promise** (4): Less busywork · Better job matches · Never miss an update · Everything
   in one place.
8. **Our story** — short and true: built in 2026, in beta, by a small team; what's live today and
   what's next (Autopilot, interview practice) — phrase future items as "coming".
9. Final CTA.

## 9. `/organizations`

Order (from `organizations-desktop-full.webp`):
1. Hero: eyebrow "For organisations" · h1 "Support your people's / **job search** / at scale." ·
   lede "Consultancies and teams: manage every consultant's search, assign a marketer, track
   progress and prepare applications they approve and submit — in one place." · CTAs **Talk to
   us →** (`/contact?topic=organization`, accent) · View pricing (`/#pricing`, ghost). Right:
   `OrgStatsMock` card (Consultants · Applications · Interviews · Offers, example numbers) +
   photo `org-team` + mascot `plane` + handwritten "Brighter futures for your team."
2. **Everything you need** — 12 feature cards, each with a mini mock, grouped **Available now**
   vs **Coming** (chip on the card): now = Consultant accounts · Profiles & resumes · Autofill
   they review · Inbox tracking per consultant · Role-based access · Notes & activity · Expert
   services per person; coming = Marketer role (prepares, never submits) · Job banks per
   consultant · Recruiter outreach matching · Analytics & reporting · Autopilot batches.
3. **How it works** — six steps from `CONSULTANCY_STEPS` in `lib/catalog.ts` (reuse the data).
4. **Full visibility** — `OrgTableMock` (Name · Role · Support owner · Stage · Last activity)
   with four benefit tiles.
5. **Reporting & insights** — four stat tiles + a simple bars block, all marked *Example*.
6. CTA band: "Help your team land more opportunities with less busywork." · Talk to us · View
   pricing.

Mobile: single column; feature grid 1-col; table mock becomes stacked cards.

## 10. Mobile rules (375px is the reference)

- Header 64px; hamburger sheet; CTAs full-width inside the sheet.
- Hero stacks: eyebrow, h1 36px, lede, buttons full-width (`w-full sm:w-auto`), ticks wrap,
  then art (photo 4:3 with mascot overlapping its bottom-right corner, two cards stacked below).
- Every two-column section becomes copy-then-visual; mocks shrink via `max-w-full` and
  `overflow-hidden`, never horizontal page scroll.
- Tap targets ≥ 44px; dots are 44px hit areas with 8px visible discs.
- Gutters 20px; section vertical rhythm 64px mobile / 96px desktop.

## 11. Accessibility and performance

- Colour contrast: navy on white, white on navy-deep, navy on lime, `#3E8F0E` green text on
  white — all AA. Coloured headline words use the deep values above, not the soft ones.
- All doodles/handwriting `aria-hidden`. Mascot images have empty `alt`. Photos have real `alt`.
- Carousel keyboard + reduced-motion as in §6. Dropdowns open on click/Enter, close on Escape
  and outside click, arrow keys move inside.
- Fonts via `next/font` with `display: swap`; images via `next/image` with `sizes`; hero photo
  `priority`. LCP target < 2.5s on a throttled 4G run of `/`.

## 12. Implementation phases (Sonnet; one commit each)

| Phase | Scope | Acceptance |
|---|---|---|
| **V2.1 Theme + shell** | `theme-v2.css`; `--radius-button` + `lg` size in `Button`; new icons + `doodles.tsx` + barrel exports; fonts in `(marketing)/layout.tsx` with `.theme-v2` wrapper; `MarketingHeader` + `MarketingFooter` + `nav.ts`; `media.tsx` + `public/v2/README.md`; `DEMO_VIDEO_URL` constant | `npm test -w web` + `npm run build -w web` green; `/`, `/contact`, `/privacy` render under the new header/footer with no console errors; mobile sheet works at 375px; signed-in header state preserved |
| **V2.2 Hero carousel** | `HeroCarousel`, `hero-slides.tsx`, `FloatingCard`, `Eyebrow`, `Handwritten`, `TrustStrip`; landing page keeps the old body below the new hero for now | all four slides; autoplay/pause/keys/swipe/dots; reduced-motion manual; no CLS; screenshots at 1440 and 375 |
| **V2.3 Landing body** | sections 3–12 of §7, mocks, `FinalCta`; remove the old hero/how/features; keep Pricing + Services | every anchor in `nav.ts` resolves; pricing pop-ups + Stripe buttons unchanged; lint/type/build green |
| **V2.4 /about** | §8 | metadata, sitemap entry, mobile check |
| **V2.5 /organizations** | §9 | metadata, sitemap entry, `CONSULTANCY_STEPS` reused, contact link carries `topic=organization` |
| **V2.6 QA pass** | root metadata, OG copy, 375/768/1440 screenshots of all three pages into `design/landing-v2/shots/`, Lighthouse-style sanity (no layout shift, images sized), fix list | `npm test -w web`, `npm run build -w web`; PROGRESS.md Log line |

Each phase: commit `v2.<N>: <subject>` on `version2`, push the branch, one Log line in
`PROGRESS.md`. Do not touch `job-autofill/` or `api/`.
