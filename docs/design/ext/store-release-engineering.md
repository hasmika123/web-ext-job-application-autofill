# Design — Store policies, release train and cross-browser shipping (area `ext`, epics E0, E9, E10)

Status: decided 2026-10-11. Builds on `publish-extension.yml` (tag `ext-v*` → test → inject GA →
WXT build → manifest-limit check → zip → optional CWS publish), `DEPLOY.md` §8, `STORE-LISTING.md`,
`PRIVACY.md`, `BROWSERS.md`, W6.0 manifest hygiene. Store status at audit: CWS v1 published and
under review; AMO and Edge not yet listed.

## 0. Decisions

1. **One release train, three stores, one artifact per browser.** `ext-vX.Y.Z` tag → CI builds
   `chrome-mv3` (Chrome + Edge, same zip) and `firefox-mv3` (+ source archive for AMO) → publishes
   Chrome via the CWS API (exists, gated), Edge via Partner Center API (`wdzeng/edge-addon` action)
   and Firefox via `web-ext sign`/AMO API with the source archive attached. First submission to each
   store stays manual (store rule), then automated.
2. **Permission changes get their own release, with copy.** Any change to `permissions`,
   `host_permissions` or `externally_connectable` ships alone, with the listing "What's new", the
   `PRIVACY.md` table and AMO `data_collection_permissions` updated in the same PR; a CI check
   (`check-privacy-sync.mjs`) diffs the generated manifest against the permission table in
   `PRIVACY.md` and fails on drift. Known upcoming: Autopilot `tabs` (E7.6), new ATS hosts (E2.10/11),
   removing `google-analytics.com` (E8.6).
3. **Staged rollout + rollback.** CWS supports percentage rollout for listings above a size — use
   10 % → 50 % → 100 % over 72 h when a release touches the engine; error fingerprints (E8.3) and
   fill-rate (E1.5) are the gates. Rollback = re-tag the previous version with a patch bump (stores
   never accept a lower version). Remote config (E8.4) is the instant brake meanwhile.
4. **Release notes are generated from commits** (`phase<P>.<N>:` / `e<N>.<M>:` prefixes) into
   `job-autofill/CHANGELOG.md` and the store "What's new"; the drawer shows a one-line "Updated to
   0.70 — Taleo support" announcement from remote config, not from a hardcoded string.
5. **Policy posture is a product feature.** The listing's single purpose stays "fill job applications
   from one profile; never submits"; no "auto-apply" wording anywhere, even for Autopilot ("prepares
   applications; you submit"). This keeps us clear of the auto-apply class that draws scrutiny and
   matches the trust footer users see.

## 1. Release checklist (automated where possible; `scripts/ext-release.mjs` prints the human steps)

| Step | Who | Automated |
|---|---|---|
| `npm test` + `typecheck` + fixtures (E1) + Playwright smoke | CI | yes |
| Version bump in `wxt.config.ts` + `package.json` (+ `rules.js` when rules changed) | PR | check that tag == manifest version (exists) |
| `PRIVACY.md` ↔ manifest permission diff | CI | E10.3 |
| CHANGELOG + store "What's new" | script | E0.3 |
| Chrome zip + Edge (same) + Firefox zip + source archive | CI | exists / E9.2 |
| `web-ext lint` 0 errors | CI | E9.1 |
| Screenshots refreshed when a surface changed (Playwright capture at 1280×800 on fixtures) | CI artifact | E0.2 |
| Reviewer test account seeded (`DEMO_ENABLED` box or a dedicated reviewer account) | human | documented in `STORE-LISTING.md` |
| `NEXT_PUBLIC_KIWIPLY_EXTENSION_ID` matches the store id; web redeployed | human (once) | `DEPLOY.md` §8 |
| Staged rollout 10/50/100 with gates | human + CI | E0.4 |

## 2. Store-by-store notes

**Chrome Web Store.** Limits enforced at upload (132-char description — checked). Privacy tab answers
come from `PRIVACY.md`. Host-permission additions trigger a re-review (expect 1–7 days); keep ATS host
batches small and documented. `tabs` adds the "Read your browsing history" warning text — the listing
must explain it (Autopilot window only). Never use `declarativeNetRequest`, `webRequest`, remote code.
Single purpose: autofill + tracking of job applications (the drawer's resume-fit and save-a-job are in
scope as "application tracking"; a job *search* inside the extension would not be — keep search on the web).

**Firefox Add-ons.** MV3 event page, `strict_min_version 140`, `data_collection_permissions` required
and must match `PRIVACY.md`; source archive + build steps (`npm ci && npm run build:firefox
--workspace job-autofill`, Node 20/22) on every version because the bundle is minified; `web-ext lint`
warnings for vendored `pdf.js`/`mammoth` `Function` use documented in `BROWSERS.md` for the reviewer.
Live smoke before the first submission is mandatory (`BROWSERS.md` §Firefox). Firefox Android: declared
min 142 but unsupported UI — say so in the listing.

**Edge Add-ons.** Same zip; Partner Center listing reuses the CWS copy; certification ~1–3 days;
the Edge store id differs from Chrome's but `externally_connectable` is id-independent (the web
targets Chrome's id for `sendMessage`; on Edge the extension id is also pinned by `key`, so the same
id holds — verify on first install, else add `NEXT_PUBLIC_KIWIPLY_EXTENSION_ID_EDGE`).

**Safari (P2).** `xcrun safari-web-extension-converter` + Xcode + Apple Developer account; MV3 is
supported; `externally_connectable` is not — reuse the Firefox relay path; App Store review. Deferred.

## 3. Data model

None server-side beyond `client_config` (E8). `CHANGELOG.md` in repo.

## 4. Failure modes

| Failure | Behaviour |
|---|---|
| CWS rejects a release (policy) | rollout never started; previous version stays live; remote config can still pause a broken family |
| A release ships a broken adapter | fill-rate watch (E1.5) + error fingerprints (E8.3) trip within a day; kill switch on the family; patch release with the fixture |
| Store id drift (new item) | the `key` dance in `DEPLOY.md` §8; the web `/connect` ping/pong detects "no extension" and shows the install card rather than minting a session |
| AMO rejects for data-collection mismatch | CI drift check prevents it; the reviewer notes list each category's reason |
| Edge users cannot connect | `/connect` tries `externally_connectable` then shows a "copy the connect code" fallback (E12.1) — never a dead end |

## 5. Security / privacy

Secrets (CWS/Edge/AMO API credentials) live in GitHub secrets, write-only; the bundle carries no key.
The signed artifact per browser is reproducible from source + lockfile; CI artifacts are the record.
No remote code; remote config is data. The reviewer account is a demo account on a seeded box, never
a real user's.

## 6. Cost

Developer accounts: Chrome $5 one-time (exists), Edge free, AMO free, Apple $99/yr (deferred). CI
minutes.

## 7. Tests

`check-manifest-limits.mjs` (exists), `check-privacy-sync.mjs` (E10.3), tag-vs-version check (exists),
`web-ext lint` gate in CI (E9.1), Playwright screenshot job (E0.2), a dry-run of the release script
in CI that validates CHANGELOG generation.

## 8. Rollout

E0.1 W5.7 walk + screenshots + reviewer account + CWS Pro resubmit (15.3) → E0.2 Playwright screenshot
job → E0.3 CHANGELOG + "What's new" → E0.4 staged rollout + rollback runbook → E9.1 Firefox live smoke +
AMO first submission → E9.2 AMO automation → E9.4 Edge listing → E10.3 privacy-sync check → (E7.6 `tabs`
release when Autopilot lands) → E9.5 Safari when asked.
