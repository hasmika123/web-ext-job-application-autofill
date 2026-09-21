# HANDOFF.md — start here in a new chat

A fast orientation for picking this up cold, plus a **kickstart for what's immediately next**.
Canonical docs stay authoritative; this just points you at them and gets you moving.

## What this is
**Kiwiply** — a job-application autofill product in a monorepo:
- `/job-autofill` — MV3 browser extension. The autofill **engine** is vanilla JS on `window.JAF`;
  the build + UI are **WXT (Vite)** (`npm run build` → `.output/chrome-mv3`). Firefox gets its own
  build — see `job-autofill/BROWSERS.md`.
- `/web` — Next.js 16 + React 19 + TS + Tailwind v4 (the primary product; BFF for the API).
- `/api` — Spring Boot (JHipster-derived) + MySQL + Liquibase + S3.
- `/brand` — source logo/ATS art (originals; served copies live in `web/public` + `job-autofill/icons`).
- Root docs: `ROADMAP.md` (architecture), `PROGRESS.md` (task tracker + Log), `ADMIN-PLAN.md`
  (admin side), `DEPLOY.md` (ops), `CLAUDE.md` (working rules — read it).

**Live** at https://kiwiply.com (web), https://api.kiwiply.com (API), **co-hosted with
BeeCompete** on one box (Docker Compose + AWS S3). **CI/CD auto-deploys on push to `main`**
(build → GHCR → box pull/restart). Email verification + password reset are live (Brevo SMTP).

⚠️ **Shared host:** that box's `beecompete-edge-caddy` owns :80/:443, so our own Caddy must not
run — deploy with `-f docker-compose.prod.yml -f docker-compose.shared-edge.yml`. Freeing those
ports takes BeeCompete down. Read `MIGRATION.md` §10 before touching the proxy.

⚠️ **The DB was rebuilt empty on 2026-09-17** after the original VPS was lost with no off-box
dump. Don't expect historical accounts or applications. See the `live-deployment` memory.

⚠️ **Two operational gaps are still OPEN** (verified 2026-09-21) — production has the same single
point of failure the lost box did:
- **No database backup.** Both crontabs empty, no timer, no dump anywhere. DEPLOY.md §5.
- **No uptime monitoring.** Nothing reports a dead box; you find out by visiting it.

CI/CD is live and hands-off (merge to `main` deploys). Live values in DEPLOY.md §7.1; the deploy
traps worth knowing before you touch it are in §7.3.

## How to work here (the loop)
Per `CLAUDE.md`: read `PROGRESS.md` → **Current focus**; do ONE task; tests green; bump
versions if the extension changed; **one task = one commit** (`phaseN.x: subject`). Hard rules:
no auto-submit/CAPTCHA, never commit secrets, server is source of truth, capture real ATS DOM
before writing selectors.

**Build/test environments (important gotchas):**
- Web: `cd web && npm test` (tsc + eslint) and `npm run build` (strongest gate).
- Extension: `cd job-autofill && npm test`.
- API: builds with **JDK 17** (`JAVA_HOME="/c/Program Files/Java/jdk-17"`), e.g.
  `./gradlew compileJava` / a single `--tests` unit test. **Docker/MySQL aren't running
  locally**, so integration tests (Testcontainers) only run in **CI**. Plan accordingly.
- **Pushing `main` deploys to production.** Don't push unless asked. The extension is **not**
  auto-published — Chrome Web Store uploads are manual.

## Current state (2026-09-17)

- **Web + API are DONE and LIVE** on `main`/prod through Phase 9 (admin console, analytics, email
  subscription + Brevo sync, bug reports, DSAR, admin MFA, per-application resume attachment,
  on-the-fly resume upload).
- **The extension UI platform (W0–W5) is complete and merged.** WXT builds it; `@kiwiply/ui` is the
  one design system, shared with web; every surface is React on shared tokens with light/dark.
  **There is no popup and no native side panel** — the toolbar icon injects a **drawer**
  (`panel.html`) as an on-page iframe that floats over the site without resizing it. Settings are a
  full options tab. The on-page fill overlay stays shadow-DOM and deliberately light.
- **Extension is at v0.52.0 and still UNPUBLISHED.** Chrome Web Store uploads are manual and the
  item does not exist yet.
- **W6 is mostly done:** W6.0 manifest hygiene, W6.1 Firefox parity, W6.2 dead-code prune,
  W6.3 docs. **W6.4 (package + upload) is the last one**, and it is gated on things only a human
  with a browser can do (below).

### Where the extension work is tracked
`EXT-UI-PLATFORM-PLAN.md` (phases W0–W6, with a detailed Log). `PROGRESS.md` holds **Current
focus** and the product-phase history. `job-autofill/ARCHITECTURE.md` is the file map.

## ▶️ KICKSTART — what's actually left before the extension ships

Everything that can be done from a terminal is done. The remaining gates need a real browser:

1. **Walk `job-autofill/W5-QA.md`** in Chrome, light and dark (W5.7). The checklist was rewritten
   2026-09-17 against the surfaces that actually ship — the old one still walked `popup.html` and
   `sidepanel.html`, deleted back in v0.30.0/0.31.0.
2. **Live-verify autofill**, especially **SmartRecruiters** — its shadow-DOM fix shipped in
   v0.37.0 and has never been tested on a real form. Ledger: `job-autofill/AUTOFILL-QA.md`.
3. **Smoke-test Firefox** (`job-autofill/BROWSERS.md`) — above all that kiwiply.com/connect
   actually signs the add-on in, since that path is Firefox-only code.
4. **Five screenshots at 1280×800** + a seeded reviewer test account.
   Copy and shot list: `job-autofill/STORE-LISTING.md`.
5. **Upload, following `DEPLOY.md` §8 in order.** The trap: the store assigns its own extension ID,
   `web/src/app/connect/page.tsx` falls back to the dev one, and `NEXT_PUBLIC_KIWIPLY_EXTENSION_ID`
   is baked in at build time — so web must be rebuilt and redeployed with the store's ID or
   `/connect` hands sessions to an extension that doesn't exist, and `/connect` is the only way to
   sign in. Publish **unlisted** first and verify.

Still deferred by decision: PL.1 lawyer review (the legal entity, **AutomoraLab LLC**, is settled
and now named in web `/privacy` + `/terms`), DPAs with Brevo + AWS S3, and Safari (7.3).

## Building the extension

```bash
cd job-autofill
npm test              # 22 engine suites (node + jsdom) — must be green
npm run typecheck     # wxt prepare + tsc
npm run build         # -> .output/chrome-mv3   (load unpacked from here)
npm run build:firefox # -> .output/firefox-mv3  (MV3; a genuinely different artifact)
```

`.output/` is **gitignored** — it is derivable from source, and CI rebuilds it and produces the
release zip (`publish-extension.yml`).

## Watch-outs

- **Preserve the manifest `key`** in `wxt.config.ts` (it pins the unpacked extension ID, which
  keeps `/connect` working) — *except* for the very first CWS upload, which rejects it. `DEPLOY.md`
  §8 has the full dance.
- **The manifest is a function of the build env.** Dev-only hosts (`localhost:8080`,
  `localhost:3000`) are added only to development builds. Don't hardcode them back in, and if you
  add a permission, add the matching honest row to `PRIVACY.md` — that table is a store
  certification, not a comment.
- **MV3 forbids remote code.** Everything is bundled (pdf.js + mammoth are vendored).
- **Don't push `main`** — it deploys to production.
- The extension ships via a **manual** store upload, never automatically.

**Commit convention:** `w<phase>.<n>: <subject>` for extension-platform tasks (`phase<N>.<n>:` for
product phases), one task = one commit, on a branch — never straight to `main`.
