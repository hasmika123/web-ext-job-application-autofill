# Design — Real-DOM ATS fixture harness & regression suite (area `ext`, epic E1)

Status: decided 2026-10-11. Builds on `test/harness.js` (jsdom + `window.eval` of the real IIFE
sources), `AUTOFILL-QA.md` (the live method: inject the real `buildPlan` into the page's main world),
10.1 fill telemetry (`fill_event`) and ROADMAP 10.6 ("saved HTML snapshots per ATS as jsdom fixtures,
run in CI, alerting when a fill rate drops").

## 0. Summary

1. **A fixture is a captured, scrubbed, real tenant page** (`job-autofill/test/fixtures/<ats>/<tenant>-<step>.html`)
   plus a sidecar **expectation file** (`.expect.json`) that says which canonical fields must map to
   which control, which must be *manual*, which must be *absent*, and the expected `requiredLeftEmpty`.
2. **Capture is a tool, not a chore**: a dev-only drawer action ("Capture this page as a fixture",
   `settings.devFixtureCapture`) serialises the live DOM (open shadow roots inlined as
   `<template shadowrootmode="open">`), strips values/PII/scripts/trackers, records the URL shape and
   adapter id, and downloads the pair. Nothing is ever uploaded; this is a developer workflow on the
   synthetic persona (`AUTOFILL-QA.md` §Test persona).
3. **The suite asserts fill rate, not just "no crash"**: for every fixture, `buildPlan(values)` must
   produce the expected map, `applyItem` must set the value on the (jsdom) control, and
   `requiredAudit` must agree with the expectation. A fixture's score is `mapped / expected`; the
   suite fails below **100 % per fixture** (regressions are exact) and reports the per-ATS average.
4. **Adapter-rot alert from production**: a nightly job compares each ATS family's 7-day fill rate in
   `fill_event` against its 28-day baseline; a drop > 15 points with ≥ 30 fills opens an admin alert
   and names the fixture folder to re-capture. Fixtures prevent regressions we cause; telemetry
   catches changes the ATS causes.
5. **Browser e2e for the surfaces** (Playwright + the built `.output/chrome-mv3`, `--load-extension`)
   runs the three fixture-backed smoke flows (open drawer → fill Greenhouse fixture → overlay →
   gaps card; save-a-job; connect handoff on a local page) on every PR. jsdom proves mapping; the
   browser proves injection, shadow DOM, the iframe drawer and the real event plumbing.

## 1. Layout and formats

```
job-autofill/test/fixtures/
  README.md                       how to capture, scrub rules, naming
  greenhouse/figma-apply.html     (captured 2026-07-01, job-boards style)
  greenhouse/figma-apply.expect.json
  lever/fieldnation-apply.html + .expect.json
  ashby/harvey-application.html + .expect.json
  workable/tplink-apply.html + .expect.json
  smartrecruiters/versant-oneclick.html + .expect.json      (shadow DOM)
  workday/cmegroup-my-information.html + .expect.json
  workday/cmegroup-my-experience.html + .expect.json        (step 2: rows)
  workday/cmegroup-application-questions.html + .expect.json
  workday/cmegroup-voluntary-disclosures.html + .expect.json
  indeed/smartapply-contact.html + .expect.json
  icims/… taleo/… bamboohr/… jobvite/… successfactors/… oracle/…   (E2 adds as captured)
```

`.expect.json`:
```json
{ "url": "https://job-boards.greenhouse.io/figma/jobs/6102379004", "adapter": "greenhouse",
  "capturedAt": "2026-07-01", "step": "apply", "notes": "new job-boards style; EEO selects present",
  "map": { "firstName": {"sel": "#first_name", "kind": "text"}, "country": {"sel": "#country", "kind": "combo"},
           "authorizedToWork": {"sel": "#question_955", "kind": "combo"} },
  "manual": ["city"], "absent": ["addressLine1", "state"], "file": "#resume",
  "required": { "total": 6, "leftEmptyAfterFill": 1, "leftEmptyLabels": ["Pronouns"] },
  "submit": { "neverClick": ["button[type=submit]", "#submit_app"], "next": null },
  "successSignals": { "urlPattern": "/confirmation", "copy": "Thank you for applying" } }
```
`successSignals` and `submit.neverClick` double as the data for E4 (submit-detect per ATS) and E10
(the no-submit proof): one capture feeds three suites.

## 2. Scrubbing rules (enforced by `scripts/fixture-scrub.mjs`, run on capture and in CI)

- Remove `<script>`, `<link rel=preload>`, inline event handlers, `src`/`href` to third-party hosts
  (replaced with `about:blank`), `<img>` data, base64 blobs.
- Blank every `input/textarea/select` **value**; keep `option` text (that *is* the ATS vocabulary).
- Replace any email/phone/name-looking text in body text with the synthetic persona; CI greps the
  fixture for `@` patterns outside `option`/`label` and for the persona's real-looking tokens.
- Keep `data-automation-id`, `id`, `name`, `aria-*`, `autocomplete`, `class`, `required`, labels,
  legends, placeholders, shadow roots — everything the matcher reads.
- Cap at 1.5 MB; larger pages are trimmed to the `<form>`/app root plus its ancestors.
- A fixture carries a `tenant` only as a folder name (public career pages of large employers); never a
  candidate's data, never a login-gated page's session tokens (query strings stripped).

## 3. Runner (`test/fixtures.test.js`, in the `npm test` chain)

```
for each <ats>/<name>.html with .expect.json:
  window = makeWindow(html, {url})              // harness.js; declarative shadow DOM parsed by jsdom ≥ 24
  loadCore + the adapter chain in entrypoints/content.ts order (minus content-script.js)
  values = buildFillValues(persona)
  {adapter, items} = JAF.filler.buildPlan(values)
  assert adapter.id === expect.adapter
  for field in expect.map: item exists, item.el matches sel, item.kind === kind   → else FAIL "missed/ wrong control"
  for field in expect.absent: no item                                            → else FAIL "false positive"
  for field in expect.manual: item.kind === "manual"
  apply all items via applyItemAsync; read back values; assert non-empty for text/select
  gaps = JAF.requiredAudit.scan(document); assert gaps.length === expect.required.leftEmptyAfterFill
  assert no element matching expect.submit.neverClick received a click (click spy on jsdom)
report: per-fixture 100 % or the diff; per-ATS summary table printed; JSON summary to
        job-autofill/.output/fixture-report.json (CI artifact)
```
Snapshot drift: when an expectation is intentionally changed, the diff is reviewed in the PR; there is
no auto-update flag (the point is a human seeing the mapping change).

## 4. Capture tool (dev-only)

- Drawer footer shows **"Capture fixture"** only when `settings.devFixtureCapture` is on *and* the build
  mode is development (`import.meta.env.MODE !== "production"`; the production bundle contains no
  capture code — tree-shaken by a build-time constant, so the store build cannot ship it).
- Content script `JAF_CAPTURE_FIXTURE` → serialises `document` (walks shadow roots, emits declarative
  shadow DOM), runs the scrubber in-page, and returns `{html, meta}`; the drawer builds the
  `.expect.json` skeleton from the current `buildPlan` result (the developer edits expectations by
  hand — the plan is a starting point, not the truth) and triggers two downloads.
- Multi-step ATS: capture per step; the file name carries the step.

## 5. Adapter-rot alert (API + admin)

Table (additive): `fill_event` already has `ats, adapter, fields_found, fields_filled, required_left_empty, ext_version, created_at`.
Add a nightly rollup `fill_quality_daily (day DATE, ats VARCHAR(24), adapter VARCHAR(24), ext_version VARCHAR(16), fills INT, fill_rate_bp INT, gap_rate_bp INT, PRIMARY KEY(day, ats, adapter, ext_version))`.
Alert rule (`FillQualityWatch`, scheduled 03:30 UTC): for each `ats` with ≥ 30 fills in the last 7 days,
`rate7 < rate28 − 15 pts` → `admin_alert(kind=ADAPTER_ROT, ats, delta, sample)` (reuses the admin
alerts/announcements plumbing from A5/A10) and a line in the ops digest. The alert text names
`test/fixtures/<ats>/` so the fix starts with a re-capture.

## 6. Failure modes

| Failure | Behaviour |
|---|---|
| jsdom cannot parse a fixture (malformed HTML from the scrub) | capture tool validates by re-parsing with jsdom before download; CI fails loudly naming the file |
| A fixture depends on layout (`getBoundingClientRect`) | harness stubs visibility; expectation can mark `"hiddenOk": true` for controls the real page hides until a step opens |
| A tenant changes its DOM | production alert fires; the fixture stays green (it is the old DOM) — the alert, not the suite, is the signal; re-capture replaces the file, old file kept one release for the diff |
| A fixture contains PII that slipped the scrub | CI grep fails; `fixtures/README.md` lists what to check; captures are from public, unauthenticated pages only, except Workday/iCIMS steps captured behind a throwaway account on the synthetic persona |
| Fixture suite becomes slow | each fixture is one jsdom window (~50–200 ms); budget 60 s for 40 fixtures; split by ATS folder if needed |

## 7. Security / privacy

Fixtures are public page structure, never candidate data. The capture path does not exist in the
production bundle. The telemetry side adds no new fields to `fill_event` (counts only, no user id —
unchanged). The Playwright run uses a local mock API (`web/scripts/mock-api.mjs`) and local fixture
pages served from `test/fixtures/` — no network to real ATS in CI.

## 8. Cost

CI minutes only (~2 min for the jsdom suite, ~4 min for the Playwright job on Chromium). No server cost
beyond the nightly rollup (one aggregate query).

## 9. Tests

- `test/fixtures.test.js`: every fixture 100 % (the suite itself).
- `test/fixture_scrub.test.js`: scrubber removes scripts/values/emails, keeps `data-automation-id`,
  inlines shadow roots, rejects > 1.5 MB.
- `test/no_submit.test.js` (E10.1): across all fixtures, with auto-advance ON, no `neverClick` element
  is clicked; `findNextButton` never returns a submit/apply button (word list + `type=submit` on the
  final step).
- API `FillQualityWatchTest`: rollup math, the 15-point rule, the ≥ 30 sample floor, idempotent nightly run.
- Playwright `e2e/extension.spec.ts`: drawer opens as iframe without reflowing the page; Greenhouse
  fixture fills and shows the gaps card; save-a-job creates a SAVED row on the mock; `/connect` on
  localhost hands a session (Chrome path).

## 10. Rollout

E1.1 scrubber + runner with the 6 fixtures we can already capture from `AUTOFILL-QA.md` sites →
E1.2 capture tool → E1.3 Workday multi-step captures (account) → E1.4 Playwright e2e job → E1.5
rot rollup + alert → E1.6 fixture README + contribution rule in `ARCHITECTURE.md` ("no adapter change
without a fixture").
