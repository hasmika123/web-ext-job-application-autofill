# PLAN — area `ext` (browser extension & application-tracking engine)

Written 2026-10-11. Machine-readable twin: `docs/roadmap/areas/ext.json` (13 epics, 90 stories:
11 done · 18 partial · 61 not started). Audit + competitive benchmark: `docs/roadmap/AUDIT-ext.md`.
Deep designs: `docs/design/ext/*.md` (six). Cross-cutting: stories reference U/O/A/R ids via `deps`/
`relates`; competitive gap rows (`docs/roadmap/COMPETITIVE-GAPS.md`) are cited as `G<n>` in `relates`
and `benchmark`.

## 1. The shape of the problem

The extension is further along than any other surface: a real engine with six adapters and a
generic scanner, a review overlay, a post-fill required audit, count-only fill telemetry, learned
answers that become profile suggestions, a drawer that floats instead of docking, a sign-in that
never lives in the extension, Edge for free and a Firefox MV3 build with its own handoff. It is also
the surface the audience will test in week one against **Simplify Copilot** (600k users, 4.9★) and
judge in the only terms that matter: *did it fill the form, and was it right?*

Three things stand between "a good engine" and "the best in this space":

1. **Nothing proves the fill rate.** Five of the fifteen hosts we claim run on the generic scanner
   with no adapter; the thin adapters have never been live-validated past step one; and there is no
   real-DOM fixture suite, so a selector change can lower a fill rate without any test noticing.
   Simplify's measured weak spot is Workday (~70 %); our listing cannot say better until we can
   measure it.
2. **The tracker's best trick is unmeasured.** Submission detection works on generic cues with no
   per-ATS signals and no precision number, and ambiguity is resolved only on the web. The
   self-filling tracker is the differentiator over Teal/Huntr; it has to be right and resolvable in
   place.
3. **Operations are release-bound.** A broken adapter, a noisy signal, a bad version — every fix is a
   store review away (1–7 days). No remote config, no error reporting, no staged rollout, no public
   accuracy numbers, no Firefox/Edge listings.

Everything in this plan serves those three, then layers the things that make the drawer feel like
the product's front door (page state, fill report, badges, one-tap tailor), the Pro AI defaults, and
the Autopilot orchestrator for Launch 2 — all inside the locked lines: **never submit, no CAPTCHA
bypass, no LinkedIn automation, count-only telemetry, server is the truth.**

## 2. Epics

| Epic | Pri | What | Why it matters | Main risk |
|---|---|---|---|---|
| **E0 Store readiness & release train** | P0 | W5.7 walk, CWS Pro resubmit, CI screenshots, changelog, staged rollout + rollback | The listing is the first screen; releases must be boring | Human-gated items (screenshots, reviewer account) |
| **E1 Real-DOM fixture harness** | P0 | Scrubbed tenant pages as CI fixtures asserting map/apply/audit/no-submit; capture tool; Playwright e2e; adapter-rot alert; published accuracy | The only way "best autofill" becomes a number | Login-gated captures (Workday steps, iCIMS, Taleo) |
| **E2 ATS coverage** | P0 | Adapters for iCIMS/SmartRecruiters/Taleo/BambooHR/Jobvite, depth on Greenhouse/Lever/Ashby/Workday, SuccessFactors + Oracle hosts, LinkedIn decision | Breadth is table stakes (G1) | Host-permission re-reviews; capture effort |
| **E3 Fill engine quality** | P0 | Generic multi-step loop, combo strategies with read-back, custom required widgets, post-fill report (G3), attach reliability, perf budget | Turns silent misses into handled ones | Multi-step state across navigations |
| **E4 Capture & submit detection** | P0 | Per-ATS signals + confidence + precision telemetry, submit-click watch, drawer "Did you submit?", events write-through, JD snapshot v2 (G4), board capture v2 | The self-filling tracker, made trustworthy | False positives on intermediate "thank you" pages |
| **E5 Drawer & on-page UX** | P1 | Page-state header, shortcut, provenance, learned-answers peek, a11y, announcements, board badges (G5), review prompt (G10), one-tap tailor (G21) | The front door of the product on a laptop | Scope creep into web-owned surfaces |
| **E6 In-page AI assist** | P1 | AI on for Pro with consent (10.5), grounded drafts with provenance (G6), truth guardrails, cost caps, answer library read | Pro value that users actually discover | Gemini consent copy; budget |
| **E7 Autopilot orchestrator** | P1 | Provider + core, guards, window/tabs, needs-you + ask-and-remember (G8), review queue, `tabs` release, QA | Launch 2 revenue; the "prepare, never submit" stance made real | Store perception of `tabs`; ATS throttling |
| **E8 Telemetry, errors & remote config** | P0 | `track()` events (U20.4), telemetry v2, error fingerprints, remote config (A5.5), signal/pacing keys, retire GA4 | Operate without a release | Privacy by schema must hold |
| **E9 Cross-browser** | P1 | Firefox smoke + AMO, AMO automation, Firefox tests, Edge listing, Safari spike | Where the audience's browsers are (G11) | Firefox relay path untested live |
| **E10 Security, privacy & trust proofs** | P0 | No-submit test, CAPTCHA stop, privacy-sync CI (G30), transparency panel, CSP/revoke | Trust is the sales argument | None new |
| **E11 Org & marketer hooks** | P2 | Save-for-consultant, assignment APPLIED via submit-detect | Phase 22 dependency | Waits on O10 |
| **E12 Web ↔ ext hand-off & funnel** | P1 | Connect v2, extension-aware web, install/uninstall funnel, try-it page (G9) | First 30 seconds after install | Edge id mismatch |

## 3. Recommended build order — first 10

The skeleton proves: **a captured fixture → a measured fill → a detected submission → an operable
release**. Each item is one Sonnet session.

| # | Story | Why first |
|---|---|---|
| 1 | **E1.1** Fixture scrubber + runner with the six captured pages | Every adapter story after this ships with a fixture; stops regressions today |
| 2 | **E10.1** No-submit proof across fixtures | Makes the core promise a test before more automation (steps, Autopilot) lands |
| 3 | **E0.1** W5.7 walk + screenshots + reviewer account → CWS Pro resubmit (15.3) | Unblocks Launch 1's store gate; the listing is the funnel |
| 4 | **E3.1** Generic multi-step loop | Unblocks adapter depth (E2.6–E2.9) and Autopilot; Workday/Indeed loops collapse into one |
| 5 | **E8.4** Remote-config client (min version, kill switch, announcements) | The brake we need before coverage grows; A5.5 provides the endpoint |
| 6 | **E4.1** Per-ATS submit signals + confidence + precision telemetry | The tracker differentiator, measured |
| 7 | **E2.1** iCIMS adapter (with E1.3 captures) | Largest generic-only enterprise host; first real adapter under the harness |
| 8 | **E8.1 → E8.2** `track()` events + fill telemetry v2 | Funnel + per-class failure data direct the remaining adapter order |
| 9 | **E4.3** Drawer "Did you submit?" card | Closes the loop in place; small, visible, trust-building |
| 10 | **E9.1** Firefox live smoke + AMO first submission | Second store, already built; Simplify's Firefox is "beta" |

Then in parallel lanes (strict file ownership):
- **Lane A (adapters):** E2.2 SmartRecruiters → E2.6 Greenhouse depth → E2.9 Workday 2–4 → E2.3 Taleo → E2.10 SuccessFactors/Oracle → E2.4/E2.5 → E2.11.
- **Lane B (engine):** E3.2 combos → E3.3 custom required → E3.4 post-fill report → E3.5 attach → E3.6 perf → E4.2 click watch → E4.6 JD snapshot → E4.5 events (after U6.1).
- **Lane C (ops/stores):** E1.4 Playwright e2e → E0.2 screenshots → E1.5 rot watch → E8.3 errors → E0.3/E0.4 → E10.3 privacy-sync → E9.4 Edge → E8.6 retire GA4 → E9.2/E9.3.
- **Lane D (drawer/AI):** E5.1 page state → E5.5 a11y → E5.6 banner → E6.1 AI on for Pro → E6.2/E6.3 grounded drafts → E5.7 badges → E5.8 review prompt → E12.4 try page → E5.9 one-tap tailor (after R5.1/R5.3).
- **Lane E (Autopilot, after 19.1 API):** E7.1 → E7.2 → E7.3 → E7.4 → E7.5 → E7.6 → E7.7.

Launch-1-critical (P0): E0.1, E1.1–E1.3, E2.1–E2.2, E2.6, E2.9, E3.1–E3.4, E4.1–E4.3, E8.1–E8.4, E9.1,
E10.1–E10.3. Launch 2 adds E7.*, E2.10, E5.9, E6.1–E6.3.

## 4. Competitive gaps folded in — and the ones rejected

Accepted (cited in stories): **G1** adapters (E2.1–E2.11), **G2** harness + published accuracy
(E1.1, E1.6), **G3** fill report (E3.4), **G4** JD snapshot + resume link (E4.6), **G5** board badges
(E5.7), **G6** Pro free-text answers (E6.1–E6.3), **G8** ask-and-remember (E7.4), **G9** try-it page
(E12.4), **G10** review prompt (E5.8), **G11** Firefox/Safari (E9.1–E9.5), **G21** one-tap tailor
(E5.9), **G30** permissions explainer + CI drift (E10.3). **G7** (answer bank) is web-owned; E6.5 adds
the extension read side.

Rejected or narrowed, with reasons:
- **G1 — LinkedIn Easy Apply fill:** rejected. LinkedIn's User Agreement §8.2 bans automated methods
  and its Prohibited Software policy names extensions; the user bears the account-restriction risk.
  We save LinkedIn jobs and deep-link to the employer's ATS (E2.13). "Indeed Apply" stays at the
  public `smartapply` flow we already fill; the native in-feed apply is not automated.
- **G5 — badges on LinkedIn:** narrowed to Greenhouse/Lever/Ashby/Workday listings, Indeed job pages,
  company career pages and our own web cards. No `linkedin.com` host permission, no LinkedIn DOM.
- **G6 — "BYO key stays on Free":** accepted as is; note the one Free exception already locked
  (server AI resume parsing).
- **G11 — Safari:** kept as a P2 spike with a go/no-go note, not a build commitment (Apple account,
  Xcode, App Store review; `externally_connectable` absent).

## 5. Experience principles for Gen Z / Alpha / millennials (this area)

The drawer is the laptop half of a phone-first product, so it must feel like an app overlay, not a
browser plugin: **status first** ("Greenhouse · 14 fields ready · 2 need you") before any button;
**one tap, then only the parts that are theirs** (multi-step auto-advance that stops at gaps and
attestation, never at a submit we clicked); **instant, honest feedback** (a fill report with reasons
and a tap to fix, a "Did you submit?" that takes one tap); **transparency as a feature** (provenance
badges, a "what this extension sends" panel, a published accuracy table with a date); **AI as a
co-writer** that cites the facts it used and says "needs your input" instead of inventing one;
**dark mode, keyboard, screen reader and 44 px targets** as baseline; **ask once** (consent sheet
once, review prompt once per 90 days, unknown questions once per run); and **respect for their
accounts** — no LinkedIn bots, no CAPTCHA tricks, humanlike pacing, so the tool they recommend to
friends never gets a friend restricted.

## 6. How we beat the competition

1. **Measured, published fill accuracy per ATS** (E1 + E1.6) — nobody in the market publishes a
   number with a date; Simplify's weakest ATS becomes our proof point (Workday steps 2–4, E2.9).
2. **A tracker that fills itself and is right about it** — per-ATS submit signals with a precision
   metric, resolved in the drawer, with the inbox as the backstop and a timeline that shows its
   sources (E4). Teal and Huntr need manual status changes; Simplify logs but cannot resolve ambiguity.
3. **The trust line, made verifiable** — a no-submit test over every fixture, a CI check that the
   privacy disclosure matches the manifest, count-only telemetry with no user id, a transparency panel,
   and an Autopilot that prepares and stops (E7, E10). LazyApply/Sonara-class tools are the foil;
   Workday's 2026R1 fraud signals make this the right side of history.
4. **Grounded AI with provenance, on by default for Pro** (E6) against Jobright's fabricated answers
   and hidden pricing, with a free BYO-key path no competitor offers.
5. **Operate without a release** (E8) — kill switch, min version, signal demotion, error
   fingerprints, staged rollout — so a broken ATS costs hours, not a review cycle.
6. **Three browsers, honestly** — Firefox as supported (not "beta, best-effort"), Edge listed, Safari
   evaluated in the open (E9).

## 7. Dependencies on other areas

- **A (admin):** A5.5 client config endpoint (E8.4), A5.4 announcements (E5.6), A11.2 `product_event`
  + `/api/events` (E8.1), A10.2/A10.3 alert plumbing (E1.5, E8.3), A1.6 consented support session
  (reuses fill telemetry v2 labels path).
- **U (user):** U6.1 events schema (E4.5), U6.3 detail (E4.6 snapshot consumer), U13.2 suggestions
  (E3.4, E6.5), U20.1/U20.3/U20.4 web halves of connect/extension-aware cards/event envelope, U2.7
  install link (E12.4), U15.1 upgrade sheet (E7.5, E6.1 402s).
- **R (resume):** R5.1 tailoring and R5.3 cover letter (E5.9).
- **O (org):** O3.4 version `via` (E5.11), O10.5–O10.8 (E11), O10.6 Autopilot source (E7.7).
- **Pay / platform / trust / support / marketing (cross-cutting):** 19.1 queue API (E7), `/help`
  pages that render `fill-accuracy.json` and `permissions.json` (E1.6, E10.3), the `/try` and
  `/goodbye` pages (E12.3, E12.4).

## 8. Status honesty

`done` (11) are baselines that exist with tests: release workflow, 28-suite engine tests, six
adapters + generic, fill engine (overlay/cache/audit), capture + submit-detect v1 + save-a-job, drawer
and options on the design system, AI layer, telemetry 10.1, cross-browser builds, security posture,
connect/sync. `partial` (18) are built-but-unverified or half-built: CWS resubmit, thin adapters and
Workday beyond step 1, generic multi-step, combo apply, custom required widgets, attach paths,
submit-detect precision, JD snapshot, board capture, drafts with provenance, truth guardrails,
Firefox live, Firefox tests, CSP/revoke, connect v2. Each partial story's AC says what remains.

## 9. Top risks

1. **Capture effort for login-gated ATS** (Workday steps, iCIMS, Taleo, Oracle) — mitigated by the
   capture tool (E1.2) and throwaway accounts on the synthetic persona.
2. **Host-permission re-reviews** slowing coverage — batched releases (E2.10/E2.11), privacy-sync CI,
   `activeTab` as the always-available fallback.
3. **Submit-detect false positives** on intermediate "thank you" copy — confidence ladder, URL-change
   requirement, precision telemetry and remote demotion.
4. **Autopilot store perception** (`tabs`) — its own release with explicit copy; the no-submit test
   named in reviewer notes.
5. **AI consent copy** for Gemini's free tier — the consent sheet reuses PRIVACY.md text verbatim; the
   15.2 lawyer review covers it.
6. **Performance regressions** from board badges and step loops — perf budget (E3.6) in e2e.

## 10. Open questions for the user

1. **Publish per-ATS accuracy numbers** (G2, decision 4): publish on `/help` with date + fixture count
   — confirm, and whether the store listing may cite them.
2. **Autopilot ask-and-remember** (G8, decision 5): confirm it is in Phase 19 scope and that answers
   learned in a run are stored in the field cache (global twin) like any other learned answer.
3. **AI on by default for Pro** (10.5): confirm the consent sheet in the drawer is acceptable as the
   single consent (names Google Gemini; no profile data sent before Accept), and whether Autopilot
   users may skip the sheet (recommend: no).
4. **Throwaway ATS accounts** for captures (iCIMS, Taleo, Oracle, a second Workday tenant) on the
   synthetic persona — OK to create, and who holds the credentials?
5. **Board badges scope** (G5): confirm no LinkedIn (recommended), and whether Indeed job pages are
   in (host already permitted for `smartapply.indeed.com` only — badges on `www.indeed.com` would add a
   host).
6. **Safari**: run the go/no-go spike now (one session) or after Launch 2?
