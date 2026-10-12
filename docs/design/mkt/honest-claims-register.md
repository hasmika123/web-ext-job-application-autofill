# Design — Honest-claims register and the marketing QA gate (area `mkt`, epic M0)

Status: decided 2026-10-11. The user chose honesty for the marketing pages (`LANDING-V2-SPEC.md` §1,
the `honest:` commits `ec0a4b2`/`5bfaa1a`, `STORE-LISTING.md`'s "don't claim a site works until
`AUTOFILL-QA.md` verifies it"). Today those rules live in five places and are enforced by memory.
This design makes the register a **single data file**, every claim an **id**, every public surface
a **consumer**, and the check a **CI gate**.

## 0. Summary

1. One file, `web/src/content/claims.ts`, exports `CLAIMS: Claim[]`. A claim is a sentence we are
   allowed to say, with a status (`ships | partial | planned | banned`), the evidence that makes it
   true, the surfaces it may appear on, and a review date. The Markdown twin
   (`docs/design/mkt/honest-claims-register.md` §3 below) is generated from it by
   `npm run claims:md -w web`, never edited by hand.
2. Marketing components read copy from claim ids where the copy *is* a claim (`<Claim id="never-submits" />`),
   so a status flip (e.g. `planned → ships` for Firefox) changes every page and the store listing
   draft at once.
3. `npm run claims:lint -w web` (part of `npm test -w web`) fails the build when: a banned phrase
   appears in `web/src/components/marketing/**`, `web/src/app/(marketing)/**` or
   `job-autofill/STORE-LISTING.md`; a `planned` claim is rendered without its "coming" marker; a
   placeholder file is non-empty on a promotion branch (`CLAIMS_STRICT=1`, set in `deploy.yml`);
   or a numeric claim is not sourced from `GET /api/public/stats` (M1.7).
4. A quarterly review (admin reminder, A5 announcements) re-checks every `ships` claim against its
   evidence path; stale claims flip to `partial` automatically after `reviewBy` passes (the lint
   warns 14 days ahead, fails after).

## 1. Decisions

| Decision | Choice | Why |
|---|---|---|
| Where the register lives | Code (`claims.ts`) + generated Markdown | Copy is already data (`partners-data.ts`, `placeholder-data.ts`); a Markdown-only register drifts |
| Granularity | One claim = one sentence a visitor could screenshot | Reviewable, lintable, and small enough to flip |
| Status model | `ships` (live, verified) · `partial` (true with a caveat that must be shown) · `planned` (may be shown only with "coming"/"Soon") · `banned` (never shown; the lint searches for its phrases) | Matches the existing "Soon chip" and "Pro chip" patterns |
| Numbers | Only from `GET /api/public/stats` and only above a floor (M1.7); hard-coded digits followed by `+`, `%`, `x`, `K`, `M` in marketing copy are a lint error unless the line carries `// claim:number-ok <reason>` | Kills "1M+ jobs", "5x faster" at the source |
| Testimonials | Only rows with `consentId` (a signed consent stored in `testimonial_consent`, admin A1) render; `TESTIMONIALS` arrays without consent render nothing | Keeps the board's empty-array behaviour from `LANDING-V2-SPEC.md` §1 |
| Third-party marks | Text wordmarks only, listed in `partners-data.ts`, each with `verifiedBy` (`AUTOFILL-QA.md` section) or `roadmap: true` | Already the rule; now checked |
| Store listing | `STORE-LISTING.md` body is generated from claims + a free-text section; the generator enforces "no vendor names" and "≤ 5 repetitions of any word" (CWS rejection 2026-09-18) | Turns a lesson into a check |

## 2. Data model

```ts
// web/src/content/claims.ts
export type ClaimStatus = "ships" | "partial" | "planned" | "banned";
export type Surface = "landing" | "pricing" | "about" | "organizations" | "help" | "store" | "email" | "extension";

export interface Claim {
  id: string;                 // kebab-case, stable
  text: string;               // the sentence we say (status ships|partial|planned)
  caveat?: string;            // required when status === "partial" (rendered next to text)
  status: ClaimStatus;
  evidence: string[];         // repo paths, QA sections, admin pages
  surfaces: Surface[];        // where it may appear
  owner: "mkt" | "ext" | "pay" | "user" | "org" | "ai" | "trust";
  reviewBy: string;           // ISO date; lint warns 14 days before, fails after
  bannedPhrases?: string[];   // status banned: regexes the lint searches for
  replaces?: string;          // for banned: the id of the honest version
}
```

Rendering helper: `web/src/components/marketing/Claim.tsx` — `<Claim id="…" />` renders `text`,
appends the caveat for `partial`, wraps `planned` in the existing "Soon"/"Coming" chip, and throws at
build time for `banned` or unknown ids (server component; the throw fails `next build`).

No database table: the register is versioned with the code it describes. The one DB-adjacent piece
is `testimonial_consent` (owned by admin A1, referenced here):
`id, user_id NULL, display_name, role_text, quote, consent_text, consented_at, revoked_at NULL, source ENUM('form','email','interview')`.

## 3. The register (initial contents — status as of 2026-10-11)

| id | text | status | evidence | surfaces |
|---|---|---|---|---|
| `never-submits` | Kiwiply never submits an application for you — you review every field and press submit yourself. | ships | `job-autofill/STORE-LISTING.md` "YOU SEND EVERYTHING YOURSELF", CLAUDE.md hard rule | all |
| `never-attests` | Autopilot never ticks attestation or consent boxes for you. | planned (Autopilot ships Launch 2) | ROADMAP Phase 19 | landing, pricing |
| `autopilot-prepares` | Autopilot prepares up to 30 applications a day in your own browser and stops before submit. | planned | ROADMAP Phase 19 (300/mo, 30/day) | landing, pricing |
| `ats-verified` | Fills applications on Greenhouse, Lever, Ashby, Workable and Workday. | ships | `AUTOFILL-QA.md` verified set; `partners-data.ts WORKS_TODAY` | landing, help, store (capability wording only, no vendor names on store) |
| `linkedin-supported` | Works on LinkedIn Easy Apply. | partial — caveat "Easy Apply forms only" | `partners-data.ts`, `AUTOFILL-QA.md` | landing |
| `generic-matcher` | Sites it hasn't seen before are handled by reading each field's visible label. | ships | `job-autofill/src/…` generic matcher, `STORE-LISTING.md` | landing, store, help |
| `browsers` | Available for Chrome, Edge and Firefox. | partial — caveat "Firefox needs a live smoke test before AMO publish" until 15.3 | `BROWSERS.md` | landing, help, store |
| `safari` | Safari | banned until built (`bannedPhrases: ["Safari", "Brave", "Opera"]` in marketing surfaces) | `BROWSERS.md` deferred | — |
| `inbox-gmail` | Connect your Gmail and Kiwiply reads recruiter replies to update your board — it never sends, moves or deletes mail. | ships (Pro) | `service/inbox/*`, `PRIVACY.md` | landing, pricing, help |
| `inbox-outlook` | Outlook / Yahoo inbox | banned (`["Outlook", "Yahoo"]` near "inbox"/"connect") | locked decision: Gmail IMAP only | — |
| `matches-free` | Free gets 3 matches a day, ranked without AI, in the app. | ships (13.6 light) | `JobMatchResource`, ROADMAP 16.1 decisions | landing, pricing |
| `matches-pro` | Pro gets 10–20 AI-scored matches a day with a daily email. | planned (16.1 strong) | ROADMAP 16.1 | landing, pricing |
| `resume-parse-free` | Upload a resume and the profile builds itself — one AI parse per resume, free. | ships | `ResumeResource` AI parse, locked decision | landing, pricing |
| `ai-never-invents` | AI drafts from your own profile and never adds experience, skills or numbers you didn't give it. | partial — caveat "you review every draft" until I-area guardrail tests exist | `service/ai/*` truthfulness guardrails (13.4) | landing, pricing, help |
| `no-trial-no-refund` | No free trial and no refunds — cancel any time and keep Pro until the end of the period you paid for. | ships | ROADMAP Phase 12 locked; `BillingResource` portal | pricing, help, email |
| `prices` | Pro $19.99/mo · $49.99/3 mo; Autopilot $39.99/mo · $99.99/3 mo. | ships (from `catalog.ts`, later the DB catalog) | `web/src/lib/catalog.ts` | pricing |
| `data-deletable` | Delete your account and every stored file any time from Settings. | ships | `AccountDeletionResource` | all |
| `no-scraping` | Jobs come from employers' own job-board APIs and one licensed aggregator — never scraped. | partial — caveat "aggregator pending" | `service/jobs/*`, ROADMAP 16.1 | landing, help |
| `resume-cap` | Free keeps 3 resumes, Pro 25, Autopilot 50; downgrading never deletes anything. | ships | `EntitlementService`, 15.5 | pricing, help |
| `org-placement` | Organizations support their own people's job search — consultancies and teams, not recruiting. | ships (framing) | locked decision | organizations |
| `org-sso-2fa` | SSO, 2FA, AES-256, ATS sync for organizations | banned until built (`["SSO", "single sign-on", "AES-256", "ATS sync", "two-factor"]` on `/organizations`) | `AUDIT-org.md` | — |
| `users-count` | "N job seekers", "1M+", "trusted by" | banned unless `<LiveStat>` (M1.7) | — | — |
| `multiplier` | "5x faster", "3x more interviews", "68 % get more interviews" | banned (`/\b\d+(\.\d+)?\s?[xX×]\b/`, `/\d+\s?%/` near "interview"/"faster") | — | — |
| `auto-apply` | "auto apply", "applies for you", "one-click apply" as a submission claim | banned (`["auto-apply", "auto apply", "applies for you", "one-click apply", "one click apply"]`) | replaces → `never-submits` | — |
| `made-in` | "Made with ♥ in …", "founded by students", team photos | banned | unverified | — |
| `partner-logos` | Indeed/Glassdoor/ZipRecruiter/Handshake/Wellfound as supported | planned (roadmap chip only) | `partners-data.ts ON_THE_ROADMAP` | landing |
| `help-center` | Step-by-step guides in the Help Center. | planned → ships with M4.2 | `/help` | contact, footer |
| `response-time` | We reply by email within two business days. | partial — becomes `ships` when A8.4 measures first-response SLA | `(marketing)/contact/page.tsx` | contact |

## 4. The lint (`web/scripts/claims-lint.mjs`)

Inputs: `claims.ts` (compiled via `tsx`), the marketing source globs, `STORE-LISTING.md`,
`placeholder-data.ts` files. Steps:

1. **Banned phrases** — for each `banned` claim, grep its `bannedPhrases` (case-insensitive, word
   boundaries) across marketing sources and the store listing. Allow-list a line with
   `// claim:allow <id> <reason>` (e.g. the comparison page quoting a competitor's claim).
2. **Numbers** — regex for `\d[\d,]*\s?(\+|%|x|K|M)\b` in JSX text nodes; error unless inside
   `<LiveStat>` or allow-listed. Prices are allowed when they come from `catalog.ts` (the regex
   skips import-bound expressions).
3. **Planned claims** — every `<Claim id>` whose status is `planned` must be inside a component that
   renders the "Soon"/"Coming" chip (the helper does it; the lint checks raw string usage).
4. **Placeholders** — with `CLAIMS_STRICT=1`: `TESTIMONIALS`, `ABOUT_TESTIMONIALS`, `V3_STORIES`,
   `organizations OVERVIEW/MOBILE_STRIP/TEAM_ROWS` must be empty or consent-backed; the "PLACEHOLDER"
   header must be gone.
5. **Review dates** — warn at `reviewBy − 14d`, fail after `reviewBy`.
6. **Store listing** — vendor-name list (Greenhouse, Lever, Ashby, Workable, Workday, SmartRecruiters,
   iCIMS, Taleo, BambooHR, Jobvite, Indeed, LinkedIn) must not appear in the description block; any
   word > 5 repetitions (plurals merged) fails.

Output: GitHub annotations (`::error file=…,line=…`). Runtime: < 2 s. No new dependencies
(Node 20 `fs`, `path`, a 40-line JSX text extractor using the TypeScript compiler API already in
`devDependencies`).

## 5. Failure modes

| Failure | Behaviour |
|---|---|
| A claim is true in Chrome but not Firefox | Status `partial` with a browser caveat; the help page carries the matrix |
| Marketing wants a number before the live counter clears its floor | Say the qualitative sentence (`STATS` already does: "One profile, every form"); no digits |
| A competitor comparison must quote their claim | `// claim:allow multiplier "quoting Jobscan's own headline, attributed"` |
| Legal (trust area) changes wording | Edit `text`, bump `reviewBy`; every surface updates |
| A `ships` claim silently regresses (adapter breaks) | `reviewBy` forces a look; E-area telemetry (fill success per ATS) can flip `ats-verified` to `partial` automatically later |

## 6. Security / privacy

Nothing personal in the register. Testimonials require explicit consent rows; revocation (`revoked_at`)
hides the quote on the next build (ISR revalidate 1 h). No third-party logo files (trademark
exposure stays as today: text wordmarks, nominative use).

## 7. Cost

Zero runtime cost. One Sonnet session for the data file + helper, one for the lint, one for the
page sweep (M0.2/M0.3). Quarterly review: ~30 minutes.

## 8. Tests

- `web/scripts/claims-lint.test.mjs` (node:test): fixtures with a banned phrase, a bare number, a
  planned claim without chip, an expired review date → each fails with the right annotation.
- `Claim.tsx` unit test (vitest after U19.3; until then a build-time assertion): unknown id throws,
  `partial` renders caveat, `planned` renders chip.
- CI: `npm test -w web` runs the lint; `deploy.yml` sets `CLAIMS_STRICT=1`.

## 9. Rollout

M0.1 register + helper (no page changes) → M0.2 replace/empty the placeholder arrays and route copy
through `<Claim>` on `/`, `/v3`, `/about`, `/organizations` → M0.3 footer destinations → M0.4 lint in
CI → M0.5 support matrix as the single source for tiles, store and help. Store listing generation
(M10.1) consumes the same file.

## 10. Wireframe — how a `partial` and a `planned` claim read on a phone (390 px)

```
┌──────────────────────────────────────┐
│ ✓ Fills applications on Greenhouse,  │
│   Lever, Ashby, Workable and Workday │
│ ✓ Works on LinkedIn Easy Apply       │
│   (Easy Apply forms only)            │   ← partial: caveat in muted text
│ ✓ Chrome · Edge · Firefox            │
│ ◌ Indeed · Glassdoor      [Soon]     │   ← planned: muted + chip
│                                      │
│ We never submit for you. You review  │
│ every field and press submit.        │   ← ships: plain
└──────────────────────────────────────┘
```
