# Design — Autopilot orchestrator in the extension (area `ext`, epic E7; ROADMAP Phase 19)

Status: decided 2026-10-11. Locked constraints (CLAUDE.md): Autopilot batch-**prepares** applications
in the user's own browser (300/month, 30/day), **stops before submit**, **never ticks attestation
boxes**, no cloud auto-apply, no CAPTCHA bypass. Queue tables (`autopilot_run`, `autopilot_item`) and
the "Prepare N" web flow are 19.1 (user/pay areas); this doc is the extension half (19.2–19.5) plus
the no-submit proof.

## 0. Summary

1. **The queue is pulled, never pushed.** The service worker polls `GET /api/autopilot/next?max=3`
   while a run is ACTIVE and the Autopilot window is open; MV3 has no persistent connection, so the
   alarm (`kiwiply-autopilot`, 1 min) + window focus drive it. Items are leased for 15 minutes.
2. **One dedicated window, ≤ 3 tabs, humanlike pacing.** `chrome.windows.create({type:"normal"})`
   titled by the first tab; tabs open with 4–12 s jitter, one fill at a time per tab, 20–60 s between
   item starts, and a hard **30 items/day** client guard mirrored by the server. The `tabs` permission
   is needed to enumerate/focus tabs in that window — its own store release (19.5).
3. **The fill is the ordinary engine** (`JAF_FILL` with the assigned resume, auto-advance ON) plus
   two new guards: the **attestation detector** (any checkbox/radio whose group prompt or label matches
   the attestation lexicon is excluded from the plan and from auto-advance — the step parks instead)
   and the **final-page detector** (a step whose primary control is a submit-class button with no
   next-class button → stop, mark READY, never click).
4. **"Needs you" is a first-class outcome, not an error**: sign-in wall, CAPTCHA, unknown required
   question, failed upload, exhausted AI budget, attestation step, unsupported ATS, page error. Each
   parks the item with a reason enum and leaves the tab open for the user.
5. **Review queue in the drawer and on the web**: READY items list with "Focus tab"; the existing
   submit-detect (E4) flips READY → SUBMITTED when the user submits. Nothing else can.

## 1. State machine (`autopilot_item.status`, server-owned; extension proposes transitions)

```
QUEUED ──lease──▶ FILLING ──all steps ok, final page──▶ READY ──user submits (submit-detect)──▶ SUBMITTED
   │                 │                                      │
   │                 ├─ needs-you reason ──▶ NEEDS_YOU ─user fixes, "Resume"─▶ FILLING
   │                 ├─ lease expired / SW died ──▶ QUEUED (retry ≤ 2, then NEEDS_YOU: "stalled")
   │                 └─ unsupported ATS / 4xx page ──▶ SKIPPED(reason)
   └─ user removes ──▶ SKIPPED(user)
Daily/monthly caps: server refuses leases past 30/day or 300/period (402 AUTOPILOT_LIMIT); client stops polling.
Reasons: SIGN_IN_WALL · CAPTCHA · UNKNOWN_REQUIRED · UPLOAD_FAILED · AI_BUDGET · ATTESTATION · UNSUPPORTED_ATS · PAGE_ERROR · STALLED · USER
```

## 2. Data model (owned by 19.1; what the extension needs on it)

```
autopilot_run   id, user_id, status (ACTIVE|PAUSED|DONE), created_at, day_count, period_count
autopilot_item  id, run_id, application_id (SAVED/DRAFT row), job_url, ats_family, resume_id,
                status, reason VARCHAR(24) NULL, lease_until TIMESTAMP NULL, lease_token CHAR(36) NULL,
                tab_hint INT NULL, steps_done SMALLINT, fields_filled SMALLINT, required_left SMALLINT,
                updated_at
INDEX (run_id, status), INDEX (user_id, status, updated_at)
```

## 3. API shapes (extension-facing; through `TrackingProvider`)

```
GET  /api/autopilot/next?max=3          → {run:{id,status,dayLeft,periodLeft}, items:[{id, jobUrl, atsFamily, resumeId, leaseToken, leaseUntil}]}
POST /api/autopilot/items/{id}/progress {leaseToken, status: FILLING|READY|NEEDS_YOU|SKIPPED, reason?, stepsDone, fieldsFilled, requiredLeft}
POST /api/autopilot/items/{id}/heartbeat {leaseToken}         (every 60 s while FILLING; extends lease)
POST /api/autopilot/items/{id}/release  {leaseToken}          (window closed / user paused)
GET  /api/autopilot/review              → READY + NEEDS_YOU items for the drawer list
```
`TrackingProvider` gains `autopilotNext/autopilotProgress/autopilotHeartbeat/autopilotRelease/autopilotReview`
(declared, `NotSupportedError` until 19.1 lands, same pattern as Phase 3).

## 4. Orchestrator (service worker, `src/lib/autopilot.js` pure core + `src/background/autopilot-sw.js`)

```
tick():                                  (alarm 1 min, window focus, item finished)
  if !settings.autopilotEnabled or no plan AUTOPILOT → return
  win = ensureWindow()                   // reuse by stored windowId; recreate if closed → paused
  open = tabsInWindow(win).filter(ours)  // ours = tab ids we created (stored), never user tabs
  if open.length >= 3 → return
  {items} = provider.autopilotNext(3 - open.length)
  for item, i: setTimeout(jitter(i)) → tab = tabs.create({windowId, url: item.jobUrl, active:false}); store {tabId → item}
onTabLoaded(tab) for ours:
  if blocked page (chrome://, PDF) → SKIPPED(PAGE_ERROR)
  inject content; JAF_PING → {adapter, fieldCount, signals: {signInWall, captcha}}
  if signInWall → NEEDS_YOU(SIGN_IN_WALL); if captcha → NEEDS_YOU(CAPTCHA); if adapter==generic && fieldCount<2 → UNSUPPORTED_ATS
  JAF_FILL {resume, bio, autoAdvance:true, autopilot:true}   → overlay is NOT shown; the plan is applied directly
      (Autopilot is a Pro/Autopilot-tier explicit opt-in to unattended fill; the review happens on the final page)
  on fill result: if gaps (required-audit) → NEEDS_YOU(UNKNOWN_REQUIRED) with the gaps card left on the page
                  if attestation step → NEEDS_YOU(ATTESTATION)
                  if finalPage → READY; focus nothing; badge count +1
                  else content advanced → wait for next load (≤ 45 s) → repeat (max 12 steps)
heartbeat every 60 s per FILLING tab; stop on READY/NEEDS_YOU
```
Pacing constants live in remote config (E8.5) with safe floors: min 20 s between item starts, max 3
tabs, max 12 steps, 30/day. The client cannot lower the floors.

## 5. Detectors (content script, `src/content/autopilot-guards.js`; data in `rules.js`)

- **Attestation lexicon** (group prompt or label): `certify|attest|acknowledge|I agree|accurate and complete|
  terms|consent|authorize .* background|signature|e-sign|electronically sign|penalty of perjury|
  I confirm|I understand`. Any checkbox/radio hit is removed from the plan and the step is reported
  `attestation:true`. The user ticks it; the drawer's "Resume" continues the item.
- **Final-page**: visible submit-class control (`submit|apply|send application|finish`) and no
  next-class control (`findNextButton` returns null or returns the same element) → `finalPage:true`.
  The engine's existing rule "auto-advance never clicks submit" stays as the second lock.
- **Sign-in wall**: password field + ≤ 3 other inputs on an ATS host, or Workday `signInContent`.
- **CAPTCHA**: `iframe[src*=recaptcha]`, `.g-recaptcha`, `#cf-turnstile`, `[data-hcaptcha]`,
  `iframe[src*=hcaptcha]` → park; never interact, never wait it out.
- **Signals never leave the page** beyond the booleans.

## 6. Drawer UI (review queue)

```
┌──────────────────────────────────────┐
│ ◉ Kiwiply   Autopilot ● 2 ready      │
│ ┌ Ready for you ───────────────────┐ │
│ │ Figma · Software Engineer        │ │
│ │ 14 fields filled · final page    │ │
│ │ [ Open & review ]                │ │
│ ├──────────────────────────────────┤ │
│ │ Stripe · Frontend Eng  Needs you │ │
│ │ ⚠ Attestation box on step 3      │ │
│ │ [ Open ]  [ Skip ]               │ │
│ └──────────────────────────────────┘ │
│ Today 7 / 30 · Period 41 / 300       │
│ [ Pause Autopilot ]                  │
│ ✓ Stops before submit · you click    │
└──────────────────────────────────────┘
```
Web (`/ai-apply` board) shows the same list; "Prepare N" lives there (19.1).

## 7. Failure modes

| Failure | Behaviour |
|---|---|
| SW killed mid-fill | lease + heartbeat: server re-queues after 15 min; the tab stays open; on next tick the tab is re-adopted by stored `tabId → item` (storage, not memory) |
| User closes the Autopilot window | all FILLING items released → QUEUED; run PAUSED; drawer explains |
| ATS throttles / shows "too many requests" | NEEDS_YOU(PAGE_ERROR); run auto-pauses for 30 min after 3 PAGE_ERRORs in a row |
| Same job queued twice (saved from two boards) | server dedup on `ApplicationKeys` at enqueue (14.5 rules) |
| AI budget exhausted mid-run | drafts/picks return `quotaExceeded` → the fill continues without AI; open questions left blank → UNKNOWN_REQUIRED if required |
| Final-page detector false positive (a "Submit" mid-form button e.g. file upload) | the engine still never clicks submit; the user sees READY early, hits Next themselves; telemetry (`finalPageDenied`) feeds the fixture fix |
| Attestation on the very last page (common) | READY with `attestationPending:true`; the card says "tick the attestation, then submit" |
| User is on Free/Pro without Autopilot | `GET /next` → 402 `AUTOPILOT_REQUIRED`; the drawer shows the plan sheet, nothing runs |

## 8. Security / privacy / policy

- `tabs` permission only enumerates tabs *in the window we created*; we store our tab ids and ignore
  the rest. Listing copy states this (19.5). `windows` is implied by `tabs`.
- No unattended **submit** ever: three independent locks (plan excludes submit-class controls;
  auto-advance refuses submit; the orchestrator stops at final page) + `test/no_submit.test.js`.
- No attestation ticks: detector + the "checkbox fill requires a planned value" rule (there is no
  canonical field for "I agree", so nothing can map to it).
- Humanlike pacing is a policy choice, not evasion: it keeps a single real user's throughput, and we
  never mask the user agent, never rotate IPs, never solve CAPTCHAs. Workday's 2026R1 fraud signals
  (network/location anomalies) are not triggered by one person's browser.
- Data: the same count-only telemetry; item progress carries counts and enums only.

## 9. Cost

Server: polling at 1/min per active run while the window is open (cheap); AI drafting draws on the
Autopilot budget ($6/mo · $16/qtr) — at ~$0.01 per drafted answer, 300 applications × ~3 drafts stays
inside it with the economy model; picks/mapping are cached. Client: 3 tabs of ATS pages.

## 10. Tests

- `test/autopilot_core.test.js`: lease handling, jitter bounds, caps, re-adoption after SW restart,
  pause/resume, reason mapping, floors cannot be lowered by config.
- `test/autopilot_guards.test.js`: attestation lexicon (positive/negative lists incl. "I agree to receive
  job alerts" = attestation; "Agreeable personality?" = not), final-page detector on every fixture's
  last step, sign-in wall, CAPTCHA markers.
- `test/no_submit.test.js`: with `autopilot:true`, across all fixtures, zero clicks on submit-class controls.
- API `AutopilotItemIT`: lease token required, caps 30/300 enforced with 402, READY→SUBMITTED only via sync.
- Playwright: 3-tab window, one item READY, drawer list focuses the tab.

## 11. Rollout

E7.1 provider methods + pure core (behind `settings.autopilotEnabled`, no UI) → E7.2 guards → E7.3
window/tab orchestrator → E7.4 needs-you handling → E7.5 drawer review queue → E7.6 `tabs` permission
store release with listing/privacy copy (19.5) → E7.7 QA on 6 adapters + generic (fixtures) and the
marketer source hook (O10.6: `autopilot_item.assignment_id`).
