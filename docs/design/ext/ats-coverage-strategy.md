# Design — ATS coverage strategy and adapter architecture v2 (area `ext`, epics E2, E3)

Status: decided 2026-10-11. Builds on the adapter pattern (`src/content/adapters/*.js`, `ARCHITECTURE.md`
§Adding a new site adapter), ROADMAP 10.4 (coverage "the long grind, metered by 10.1"), the
`AUTOFILL-QA.md` bug ledger, and `fill-telemetry.js` `FAMILIES` (which already names SuccessFactors
and Oracle). Hard rule: **capture real tenant DOM before writing selectors** (CLAUDE.md).

## 0. Decisions

1. **Order of work is set by telemetry, then by market share, never by guess.** The admin "Fill
   quality by ATS" panel ranks families by gap rate × volume; the first adapter built is the worst
   family with real traffic. Until volume exists the default order is: **iCIMS → SmartRecruiters →
   Taleo → SuccessFactors → Oracle Recruiting → BambooHR → Jobvite**, then depth on Greenhouse/Lever/
   Ashby, then Workday step 2–4 live validation. (Workday + Greenhouse + Lever + iCIMS + Taleo +
   SuccessFactors + Oracle cover the large majority of US enterprise and startup postings; Simplify
   names Workday/Lever/Greenhouse as its anchors and claims "100+" overall.)
2. **An adapter is data first, code second.** Each adapter exposes `matches()`, `plan(values)`,
   `fileInput()`, `captureJob()`, and new optional hooks `steps()` (step detector + next button),
   `submitSignals` (E4), `attestationHints` (E7), `requiredWidgets()` (custom required controls for the
   audit, E3.3). Selectors live in `rules.js` per adapter (`rules.icims.fields.*`) so most tenant fixes
   are a ruleset bump, and remote config can demote a selector without a release.
3. **The generic scanner stays the long-tail engine.** It is what makes "any site" true; adapters only
   claim the controls generic gets wrong (custom widgets, split names, multi-step). The fixture suite
   (E1) asserts that adding an adapter never lowers the generic-only score on that ATS.
4. **Multi-step orchestration becomes generic** (E3.1): `filler.runSteps()` = fill → audit →
   (gaps? stop : next) → wait for DOM settle/navigation → re-plan, max N steps, memory of filled
   controls per step (so re-plan never refills what the user corrected). Workday's and Indeed's
   bespoke loops become configurations of this one loop.
5. **Host growth is batched for the store.** New `host_permissions` trigger a Chrome review; ship new
   families in two batches (E2.10: SuccessFactors + Oracle + Taleo Enterprise; E2.11: Phenom, Eightfold,
   Paylocity, ADP WorkforceNow, UKG, Dayforce, Rippling, JazzHR, Breezy) with listing copy ready.
   Everything else is reached by `activeTab` on demand (drawer → "Scan & fill" injects) — so the user
   is never blocked, only un-auto-injected.
6. **LinkedIn Easy Apply: capture yes, fill no.** LinkedIn's User Agreement bans automated methods and
   its Prohibited Software policy names extensions; account restriction is the user's cost, not ours.
   The extension saves LinkedIn jobs (URL shape + JSON-LD/og) and deep-links the user to the employer's
   ATS when the posting exposes one (`applyUrl` in JSON-LD). No DOM reads on linkedin.com. Same for
   Indeed's native quick-apply beyond the public `smartapply` flow we already support.

## 1. Per-ATS notes (what is known; everything else waits for capture)

| Family | Hosts | Shape | Known from QA | Plan |
|---|---|---|---|---|
| iCIMS | `*.icims.com` (careers-<tenant>.icims.com, iframe `?in_iframe=1`) | same-domain iframe, light DOM, account-gated profile forms | structural check OK, no shadow DOM (`AUTOFILL-QA.md` §6) | throwaway account on the synthetic persona; capture profile + questions + EEO steps; adapter claims the iframe, resume `input[type=file]`, the "Profile" step rows |
| SmartRecruiters | `jobs.smartrecruiters.com/oneclick-ui/…` | open shadow DOM, clean ids (`first-name-input`…) | BUG-5 fixed (deep query); apply spot-check pending | adapter = id map + LinkedIn/Indeed import buttons ignored; live apply check of combos |
| Taleo (TBE + Enterprise) | `*.taleo.net` (`tbe.taleo.net`, `<tenant>.taleo.net/careersection`) | legacy table layouts, multi-page, iframes, `requisition` ids | not reached | capture both variants; adapter per variant (`taleo-tbe`, `taleo-ee`); heavy on `name=` attributes |
| SuccessFactors | `*.successfactors.com`, `*.successfactors.eu`, `*.sapsf.com` (`career5.successfactors.com`) | SAP UI5, iframes, custom combos | not in manifest | new hosts (E2.10); capture; UI5 combos need `selectCustom` variant |
| Oracle Recruiting Cloud | `*.oraclecloud.com` (`<tenant>.fa.<region>.oraclecloud.com/hcmUI/CandidateExperience`) | Oracle JET SPA, "Apply" drawer, OTP sign-in for returning candidates | not in manifest | new hosts; capture; sign-in-wall detector (E7) matters here |
| BambooHR | `*.bamboohr.com/careers/<id>` | React, plain labels | not reached | generic likely fine; adapter for file + custom questions |
| Jobvite | `jobs.jobvite.com`, `*.jobvite.com` | classic forms + iframe apply | not reached | capture; adapter for the iframe + EEO |
| Greenhouse depth | `job-boards.greenhouse.io`, `boards.greenhouse.io`, embedded `<iframe id="grnhse_iframe">` on company sites | react-select combos, "demographic questions" section, education/employment repeaters (`#education_school_name_0`) | contact mapped live | add repeaters + demographic step + embedded-iframe host rule (company site + iframe = needs `activeTab`) |
| Lever depth | `jobs.lever.co/<co>/<id>/apply` | `cards[uuid][field0]` question cards, EEO selects, location typeahead | BUG-3/2 fixed | add card-question mapping by prompt, EEO, location combo apply check |
| Ashby depth | `jobs.ashbyhq.com/<co>/<id>/application` | SPA, `_systemfield_*`, sections, custom `fieldset` groups | BUG-4 fixed | section-aware plan, typeahead school/employer combos |
| Workday | `*.myworkdayjobs.com` | 4 steps, `data-automation-id` everywhere, tenant-specific question sets | step 1 live-validated; steps 2–4 unit-tested only | live-validate steps 2–4 on two tenants with fixtures; `steps()` from the progress bar |
| Indeed smartapply | `smartapply.indeed.com` | multi-step, randomized testids, final-step reCAPTCHA | adapter exists | keep FILL-ONLY; CAPTCHA detector parks |

## 2. Adapter interface v2 (`src/content/adapters/base.js` documents it; each adapter implements the subset it needs)

```js
{
  id, label,
  matches(loc=location) → bool,
  plan(values) → [{el, field, value, label, kind, confidence, source:"adapter"}],
  fileInput() → HTMLInputElement|null,
  captureJob({loc}) → Partial<JobCapture>,
  steps() → {index, total, nextButton, isFinal} | null,         // E3.1
  submitSignals → {urlPattern?, markerSelector?, copy?[]},        // E4.1 (data from rules.js)
  attestationHints → [selector]                                   // E7.2 (optional extra markers)
  requiredWidgets() → [{el, label, isEmpty()}]                     // E3.3 custom required controls
}
```
Priority rules unchanged: specific adapter first, generic fills the rest, one item per element.

## 3. Generic multi-step loop (E3.1)

```
runSteps({values, file, autoAdvance, maxSteps=12, autopilot=false}):
  for step in 1..maxSteps:
    plan = buildPlan(values); if (!autopilot) show overlay & await user "Fill selected" (first step only; later steps reuse the user's unchecks by field key)
    apply; attach file if the step has the file input and not yet attached
    gaps = requiredAudit.scan(); if gaps.length → showGaps(); stop (auto-advance waits)
    s = adapter.steps?.() ?? {nextButton: findNextButton(), isFinal: looksFinal()}
    if s.isFinal || !autoAdvance || !s.nextButton → stop (READY)
    click s.nextButton (never a submit-class control — guarded in findNextButton + the lexicon)
    await settle(): navigation (content re-injects; state persisted in sessionStorage per tab) or DOM mutation quiet for 600 ms, ≤ 45 s
    remember filled {fieldKey → el signature} so a re-plan after the user's correction doesn't overwrite it
```
State across navigations: `sessionStorage["kiwiply.steps"]` (per tab, same origin) holds
`{resumeId, step, unchecked[], attached}`; the SW re-sends values on `JAF_PING` after re-injection.

## 4. Combo/typeahead reliability (E3.2)

`selectCustom` grows strategies, tried in order and recorded in telemetry by class: native `<select>`
→ react-select (type, wait for options, pick `bestOption`) → ARIA combobox (`aria-controls` listbox)
→ UI5/Oracle JET patterns (open button + `role=option`) → "manual" with the value shown in the
overlay. A pick is verified by reading back the displayed value; a mismatch marks the item `failed`
(counted) rather than silently wrong.

## 5. Custom required widgets (E3.3)

`requiredAudit` accepts adapter-provided `requiredWidgets()` plus a generic heuristic: a visible
`[role=combobox|listbox|radiogroup]` or Workday `button[aria-haspopup]` whose group label ends in `*`
or sits in a container with `aria-required`, and whose displayed value is a placeholder. Under-count
remains the policy; the heuristic only adds controls with an explicit required marker.

## 6. Failure modes

| Failure | Behaviour |
|---|---|
| Tenant customises a step (e.g., Workday "Experience" hidden) | `steps()` returns what it sees; loop stops on no next button; telemetry `steps` shows the spread |
| New ATS family without hosts (company careers page) | `activeTab` injection from the drawer; family `other` in telemetry; capture tool helps us decide hosts by volume |
| A ruleset bump breaks a tenant | fixture suite catches it before release; remote config demotes a selector after |
| Embedded iframe (Greenhouse on a company site) is cross-origin | content script runs in the iframe when the host matches `boards.greenhouse.io` (it does); drawer picks the frame with the most fields (`pickFrame`, exists) |
| Site blocks the drawer iframe by CSP | fill overlay (shadow DOM) still works; drawer shows a toast "open the drawer from the toolbar on this site isn't allowed; the fill panel will still appear" — known from `BROWSERS.md` |

## 7. Security / privacy / policy

Host permissions grow only with adapters that exist; each batch updates `PRIVACY.md`'s permission
table and AMO's `data_collection_permissions` (unchanged categories). No LinkedIn DOM access, ever.
The capture tool never runs in production builds.

## 8. Cost

Engineering time, mostly capture sessions (throwaway accounts for iCIMS/Taleo/Oracle on the synthetic
persona). No server cost.

## 9. Tests

One fixture set per family and per step (E1), `test/<ats>.test.js` for adapter internals, the
multi-step loop against the Workday 4-step fixture chain and a synthetic 3-step generic chain,
`selectCustom` strategies against react-select / ARIA / UI5 fixtures, required-widget heuristics on
Workday and Oracle fixtures, `no_submit` across everything.

## 10. Rollout

E2.1 iCIMS → E2.2 SmartRecruiters apply verify + adapter → E2.3 Taleo (both) → E3.1 generic steps (unblocks
depth) → E2.6–E2.8 Greenhouse/Lever/Ashby depth → E2.9 Workday steps 2–4 live → E2.10 SuccessFactors +
Oracle hosts (store review) → E2.4 BambooHR, E2.5 Jobvite → E2.11 batch two. Each adapter story ships
with its fixtures, a `rules.js` version bump and a listing-copy line if hosts change.
