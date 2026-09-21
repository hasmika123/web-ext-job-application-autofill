# CLAUDE.md — Working rules for this repo

Claude Code reads this automatically every session. Keep it short.

## What this is
Dossier: MV3 browser extension that autofills job applications. The autofill **engine** is
vanilla JS on `window.JAF`/`globalThis.JAF`; since W0.2 the extension is **built with WXT (Vite)**
— WXT owns the build, manifest generation, and `entrypoints/` (background, content, the `panel/`
drawer, `options/`, and the Firefox-only `connect-relay`), importing the engine modules as-is.
There is **no popup and no native side panel**: the toolbar icon injects the drawer over the page. Being productized into extension + Spring Boot API +
Next.js web app. Spec: `ROADMAP.md`. Task trackers: `PROGRESS.md` (product phases) +
`EXT-UI-PLATFORM-PLAN.md` (the active extension UI-platform build-out, phases W0–W6).
Admin-side plan: `ADMIN-PLAN.md`. Starting a new chat? Read `HANDOFF.md` first.

## The loop (do this every session)
1. Read `PROGRESS.md` → find **Current focus**.
2. Read ONLY the matching phase section of `ROADMAP.md` (not the whole file).
3. Do that one task. Stop when it's done — do NOT start the next task.
4. Update `PROGRESS.md`: check the box, move **Current focus** to the next task,
   add one line under **Log**.
5. **Commit and push this one task on its own.** One task = one commit = one push.
   Never batch multiple tasks into a commit. Message: `phase<P>.<N>: <subject>`
   (e.g. `phase0.1: local field-choice cache`). Then `git push`.

## Branching (set 2026-09-21 — `develop` is the integration branch)
`main` is the **deploy** branch: a merge there auto-deploys to production (`deploy.yml`).
`develop` branches off `main` and is where work accumulates until the user decides to
promote a batch.

- **Branch off `develop`**, never off `main`: `git checkout -b <topic> develop`.
- **PR into `develop`**, never into `main`. CI runs on every PR and on pushes to
  `develop`, so each merge there still gets its own verdict.
- **Only the user promotes `develop` → `main`.** Don't open or merge that PR unless
  they ask for it by name — that merge is a production deploy.
- Delete a topic branch once it's merged; don't leave stale branches around.

## Hard rules
- **No auto-submit, ever.** No CAPTCHA bypass. Legitimate use only.
- **One design system: `@kiwiply/ui` (`packages/ui`).** All shared visuals — icons,
  primitives (Button/Badge/Card/…), tokens — live there; web + extension import them
  (web's `@/components/ui` files are thin re-exports). Never inline an `<svg>` icon or
  hand-roll a primitive's styles in a surface (web ESLint enforces the svg rule; only
  exception: `web/src/app/opengraph-image.tsx`). New shared visual → add it to
  `packages/ui` first. Contract: `packages/ui/README.md`.
- **Capture real ATS DOM before writing selectors.** Never guess tenant markup —
  it's the #1 failure mode. Use real `data-automation-id`s / option text.
- Extension **engine** code: vanilla JS on `window.JAF`/`globalThis.JAF` IIFE modules — keep it
  framework-free and import it into entrypoints as-is. The **build/UI** uses WXT (Vite); add UI deps
  only when a W-phase calls for it. No new engine deps without asking. Build: `cd job-autofill &&
  npm run build` (→ `.output/chrome-mv3`); dev: `npm run dev`.
- Server is the source of truth; the extension's local store is a **read-only mirror**
  (pull-only for autofill — edits happen on the web; only resume *creates* push back).
- Never commit secrets. API keys via env only; never ship a key in the extension bundle.

## Commands
- Extension tests: `cd job-autofill && npm test` (must be green before done).
- Backend (once it exists): `cd api && ./gradlew test`.
- Web (once it exists): `cd web && npm test`.

## Version-bump ritual (extension changes)
Bump the `manifest.version` in `job-autofill/wxt.config.ts` + `job-autofill/package.json`
(the legacy root `manifest.json` is gone — WXT generates the manifest). If rules change, bump
the `version` in `src/config/rules.js` too (the smoke test asserts it).

## Layout (target monorepo)
npm workspaces (root `package.json`, `workspaces: ["packages/*","web","job-autofill"]`; install at
the ROOT — `job-autofill` joined in W3 and the publish workflow's `npm ci` depends on it).
`/packages/ui` (`@kiwiply/ui`) shared React/Tailwind UI (tokens + `ResumeUpload`, consumed as
source by web + extension) · `/job-autofill` extension (workspace member) ·
`/api` Spring Boot · `/web` Next.js (workspace member) · `/brand` source logo/ATS
art (originals only — served copies live in `web/public` + `job-autofill/icons`; see
`brand/README.md`) · root: ROADMAP/PROGRESS/ADMIN-PLAN/HANDOFF/CLAUDE.
When working in `job-autofill/`, read `job-autofill/ARCHITECTURE.md` for the file map.

## Locked decisions (persist across sessions — don't re-litigate)
- **DB = MySQL** (managed: Railway/Aiven; RDS/Aurora later). `dossier.jdl` is now
  documentation; schema changes are additive Liquibase migrations on `/api`.
- **Swappable backend:** all extension→backend calls go through the one
  `TrackingProvider` seam (`job-autofill/src/lib/tracking.js`); canonical DTOs only.
- **Client split:** web app = primary product (account, resumes, bio, board);
  extension = on-page agent (autofill, capture, submit-detect, save-a-job).
- **One account, web-connect auth:** the extension has **no separate login or
  profile/resume management** — those live on kiwiply.com. Sign-in is a single web
  sign-in; the web `/connect` page mints a separate extension token pair
  (`POST /api/extension/session` ← `web /api/extension/token`) and hands it over via
  `externally_connectable`. The extension's options page is **slim** (device settings +
  account status only). Don't reintroduce in-extension **bio** editing or saved-resume
  management. **Exception (user decision 2026-06-30):** the extension MAY upload a resume
  **on the fly** — parse + review + save a NEW resume (or store the raw file), pushing it
  back via the `TrackingProvider` seam. This is resume *creation*, consistent with
  "only resume creates push back"; editing existing resumes/bio still lives on the web.
  **Exception 2 (user decision 2026-09-21, Phase 10.3):** the extension MAY promote an
  answer it *learned while the user applied* into a **suggested** profile value, when that
  answer's label resolves to a canonical field. Same reasoning — it's creation, the server
  still owns the record, and the user confirms the suggestion on the web. The point is that
  a user should never have to sit and fill a long profile form: ask the bare minimum, derive
  the rest from the resume, and learn the remainder from real applications.
- **Hosting = long-running containers, no serverless.** Web = Next `next start`
  (`output: 'standalone'`), **no Express**. API = Spring embedded Tomcat container.
  Resume upload = **Option A (Next-proxied), permanent**; Option B (presigned) is a
  serverless-only fallback. Vercel allowed, not assumed.
- **Pre-launch gate (1.11):** multi-tenant leak fix + basic GDPR/CCPA account/data
  deletion + basic refresh-token rotation/revocation. Fuller SSO/multi-tenancy/audit
  = Phase 8.
- **Deployed LIVE**, **co-hosted with BeeCompete** on one self-managed box `74.208.212.158`
  (Docker Compose + **AWS S3**, not R2). Domain **kiwiply.com** (Cloudflare DNS, grey-cloud;
  apex canonical, www/app 301 to it; API at api.kiwiply.com). **CI/CD auto-deploys on merge to
  `main`** (build → GHCR → box pull). Ops: `DEPLOY.md` + `MIGRATION.md` §10; gotchas in the
  `live-deployment` memory. Self-managed box, not a PaaS.
- **Shared edge Caddy — never run ours.** `beecompete-edge-caddy` owns :80/:443 on that box, so
  always deploy with the overlay: `-f docker-compose.prod.yml -f docker-compose.shared-edge.yml`
  (it parks our Caddy behind a profile and joins web/api to the `web_edge` network). **Freeing
  those ports takes BeeCompete down.** Public routes live in `~/beecompete-edge/Caddyfile`,
  outside this repo; `api.kiwiply.com` is a deliberate exception to that file's no-public-API
  rule, because the published extension calls it directly.
- **Prod data was lost 2026-09-17** — the original IONOS VPS vanished with no off-box dump, so
  the DB was rebuilt empty (S3 resume files survive but are orphaned). Keep `.env` in a password
  manager (**GitHub secrets are write-only** and never held it), and make sure the nightly
  off-box `mysqldump` in `DEPLOY.md` §5 actually runs — it never did.
- **Email verification is LIVE** (Brevo SMTP, sends from **no-reply@kiwiply.com**; domain
  authenticated). Signups self-activate via the emailed link → web `/account/activate`.
  **Still no auto-activate** — verification is the gate, kept that way by decision.
- **Go-to-market (locked 2026-09-21, ROADMAP Phases 11–17).** Two tiers, **Free + Pro**.
  Pro = **$19.99/mo · $44.99 / 3 months** at Launch 1 → **$24.99 / $54.99** at Launch 2.
  **No annual plan.** Stripe Checkout + Portal; `isPro()` in the API is the only entitlement
  source of truth. **Core autofill stays free and identical in both tiers.** Free has **no
  server AI** (BYO key only) with exactly one exception: **AI resume parsing** (one call per
  resume, it's how the profile builds itself). Free = 3 resumes; downgrade never deletes data.
  **Billing mechanics (Phase 12, locked):** Stripe is the truth and **only webhooks write** the
  `subscription` mirror; `past_due` stays Pro until `current_period_end`; gated calls fail
  **402 `PRO_REQUIRED`**; **no free trial**; the resume cap counts non-archived resumes; an
  admin AI-quota override outranks the plan gate; the plan travels on `GET /api/profile/version`
  (no JWT claim); `stripe-java` lives behind one `StripeGateway`; billing is **disabled when the
  Stripe key is blank** so dev/CI run without secrets.
- **Inbox = the user's own dedicated consumer Gmail over IMAP + App Password** (mirrors
  Sales-App). **No Kiwiply email address of any kind, no forwarding, no OAuth, no Google API.**
  Poll `INBOX` + `[Gmail]/Sent Mail`; store headers + body text only, **never attachments**;
  credentials encrypted at rest; we **never send, move or delete** mail. Two launches: ops
  hardening (backup/monitoring/restore drill) is Phase 15, right before Launch 1 — not earlier.
  Daily job matches source jobs from the ATS' public job-board APIs.

## Definition of done (every task)
Acceptance criteria met · tests added & green · PROGRESS.md updated · versions
bumped if extension changed · **committed and pushed as its own commit** (one task
per commit, see loop step 5). If blocked or going off-spec, stop and ask — don't improvise.
