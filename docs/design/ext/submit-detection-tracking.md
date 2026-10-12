# Design — Submit detection, capture precision and tracker write-through (area `ext`, epic E4)

Status: decided 2026-10-11. Builds on Phase 3.2 (`app-tracking.js` `isSuccessUrl`/`hasSuccessSignal`,
`submit-detect.js`, SW `logFill`/`confirmForTab`, 30-minute window), 3.4 (web "Did you submit?" nudge),
14.4–14.5 (inbox → status, dedup) and the user-area tracker design
(`docs/design/user/applications-inbox.md`: `application_event`, statuses `IN_REVIEW`/`WITHDRAWN`).

## 0. Summary

1. **Three detectors, one verdict, a confidence.** URL rule (exists) + in-page confirmation copy
   (exists) + **per-ATS confirmation signals** captured with the fixtures (E1): Workday
   `data-automation-id="applicationSubmittedPage"`-class markers, Greenhouse `#application_confirmation`
   / "Thank you for applying", Lever `/thanks`, Ashby "Application submitted", Workable "Thank you",
   iCIMS "Application Received", Indeed "Application submitted". The verdict carries
   `confidence: HIGH|MEDIUM|LOW` and `signal: url|copy|ats|form`. Only HIGH/MEDIUM flip DRAFT → APPLIED;
   LOW leaves DRAFT and asks in the drawer.
2. **A fourth signal, cheap and strong: the submit click itself.** The content script listens
   (capture phase, passive) for a user click on a `type=submit`/"Submit application" control after a
   fill — we never click it, but we can *see* the user click it. A click + navigation/DOM change within
   10 s = MEDIUM even with no copy match. This is observation, not action; it stays inside the
   "never auto-submit" line.
3. **The drawer resolves ambiguity in place**: when a DRAFT is older than 10 minutes and the tab is
   still on the ATS, or when the user reopens the drawer on a job with a pending DRAFT, it shows
   *"Did you submit the Figma application?"* **Yes / Not yet / I won't** — the same three outcomes as
   the web nudge, one tap, no page switch.
4. **The inbox is the backstop, and it writes to the same row.** 14.4's "application received" mail
   already moves status forward; with `application_event.source=INBOX` (U6.1) the timeline shows
   "Confirmed by your inbox" under the extension's DRAFT. The extension does nothing new here except
   write its own events so the merge is visible.
5. **Precision is measured**: every verdict posts `{fillId, signal, confidence}` (count-only, no URL)
   to `fill_event`; the user's later Yes/Not-yet answers (drawer or web) post `{fillId, outcome}`.
   Precision per signal per ATS = confirmed / asserted; the admin panel shows it; a signal under 90 %
   precision is demoted to LOW by remote config (E8.5) without a release.

## 1. State machine (extension side, per tab)

```
                 fill commit (JAF_LOG_FILL)
                          │
                          ▼
   ┌───────────── PENDING(DRAFT upserted, ts, serverId, fillId) ───────────────┐
   │  webNavigation success URL ──HIGH──▶ CONFIRM ──▶ APPLIED (server)         │
   │  per-ATS marker (fixture) ────HIGH──▶ CONFIRM                              │
   │  confirmation copy ──────────MEDIUM─▶ CONFIRM                              │
   │  user submit click + change ─MEDIUM─▶ CONFIRM                              │
   │  user says Yes (drawer/web) ─HIGH──▶ CONFIRM                               │
   │  user says Not yet ───────────────▶ PENDING (window extended 24 h)         │
   │  user says I won't ───────────────▶ DROPPED (DRAFT archived on server)     │
   │  30 min elapse, no signal ────────▶ STALE (web nudge; drawer asks on reopen)│
   │  tab closed ──────────────────────▶ keep PENDING until window expiry       │
   └────────────────────────────────────────────────────────────────────────────┘
Rules: CONFIRM is idempotent (second signal is a no-op); DRAFT dedup by externalJobId/jobUrl (exists,
`ApplicationKeys`); a confirm after the inbox already moved the row forward never moves it back.
```

## 2. Data model (additive, API)

`fill_event` gains `submit_signal VARCHAR(8) NULL (url|copy|ats|form|user)`, `submit_confidence VARCHAR(8) NULL`,
`submit_outcome VARCHAR(12) NULL (CONFIRMED|DENIED|UNKNOWN)`, `submit_outcome_at TIMESTAMP NULL`.
Still **no user id** on the row; `fillId` is the random per-fill UUID that already exists.

`application_event` (U6.1) rows written by the extension through `ApplicationSyncResource`:
`kind=CREATED source=EXTENSION summary="Filled on Greenhouse with resume v3"`,
`kind=STATUS from=DRAFT to=APPLIED source=EXTENSION summary="Submission detected (url)"`,
`kind=RESUME source=EXTENSION ref_id=<resumeId>`, `kind=ATTACHMENT` when a PDF was attached.
The extension does not get a new write path — `pushApplication`/`updateApplication` carry an optional
`event{kind, summary}` and the server writes the row; an old extension that omits it still works.

## 3. API (additive)

```
PUT   /api/profile/applications/sync        (exists; body gains optional  event:{kind, summary, signal?, confidence?})
POST  /api/telemetry/fills/{id}/submit      {signal, confidence}                 count-only, 30-min server window
POST  /api/telemetry/fills/{id}/outcome     {outcome: CONFIRMED|DENIED}           from drawer or web nudge (web passes the fillId it got on the application row: application.fill_id VARCHAR(36) NULL — additive)
GET   /api/admin/analytics/submit-precision → [{ats, signal, asserted, confirmed, denied, precisionPct}]
GET   /api/config/client (E8.5)             → ext.submit.signals: {url: HIGH, copy: MEDIUM, ats: HIGH, form: MEDIUM} (demotable)
```

## 4. Content-script changes

- `submit-detect.js`: add `armClickWatch()` — capture-phase `click` listener on `document` filtering
  `button[type=submit], input[type=submit], [role=button]` whose accessible name matches
  `/^(submit|apply|send application|finish)/i`; records `{at, label-class}` (no label text leaves the page);
  pairs with the existing `MutationObserver` or a `beforeunload` within 10 s → `JAF_SUBMIT_DETECTED {signal:"form", confidence:"MEDIUM"}`.
- Per-ATS markers come from `rules.js` (`submitSignals` per adapter, data only, bumping the ruleset
  version) and are overridable by remote config.
- Self-disarm stays at ~2 min for the observer; the click watch lives until the tab navigates.

## 5. Drawer UI (390 px drawer width ≈ 400 px)

```
┌──────────────────────────────────────┐
│ ◉ Kiwiply            [A]  ⚙  ✕      │
│ ┌──────────────────────────────────┐ │
│ │ Did you submit the Figma         │ │
│ │ application?                     │ │
│ │ Filled 12 min ago · resume v3    │ │
│ │ [ Yes, submitted ] [ Not yet ]   │ │
│ │           I won't apply          │ │
│ └──────────────────────────────────┘ │
│ Choose a resume  ▾  Alex – Product v3│
│ [ Scan & fill this page ]            │
│ [ Save this job for later ]          │
│ ✓ Reviews before filling · never submits
└──────────────────────────────────────┘
```
"Yes" → APPLIED + `outcome=CONFIRMED` + toast "Tracked. See it on kiwiply.com/applications ↗".
The card appears at most once per DRAFT per day and never on a page that is not the DRAFT's host.

## 6. Failure modes

| Failure | Behaviour |
|---|---|
| ATS shows "Thank you" on an *intermediate* step (Workday "Thank you for your interest" banner) | per-ATS marker outranks copy; copy alone is MEDIUM and only counts when the URL also changed since the fill; precision telemetry catches the rest and the signal is demoted |
| User submits from a different tab/window than the fill | PENDING keyed per tab (exists); the web nudge/drawer card resolves it; E4.3 adds a per-`externalJobId` lookup so any tab on the same job can confirm |
| Two fills on the same job (user re-ran) | one DRAFT (dedup); the later fillId replaces the pending one |
| Service worker asleep when the success page lands | `webNavigation.onCompleted` wakes it (exists); pending state is in storage, not memory |
| Signed out between fill and confirm | silent no-op (exists); the web nudge covers it after reconnect |
| Inbox and extension disagree (inbox says REJECTED, extension later says APPLIED) | forward-only + terminal rules (user design §2): extension confirm never leaves a terminal state |

## 7. Security / privacy

No URL, label text or page content leaves the page for detection; signal names are an enum. The
click watch records only that a submit-class control was clicked. The extension never dispatches a
click on a submit control — enforced by `test/no_submit.test.js` (E10.1) across every fixture with
auto-advance on. Telemetry stays count-only and user-less; the outcome call carries the random fillId.

## 8. Cost

None beyond one extra count-only POST per fill; the admin precision query is an aggregate.

## 9. Tests

- `test/app_tracking.test.js` (extend): per-ATS markers, confidence ladder, idempotent confirm,
  intermediate "thank you" rejected without URL change.
- `test/submit_click_watch.test.js`: capture-phase listener, name filter, 10-s pairing, never fires
  on our own synthetic events, disarms on navigation.
- `test/drawer_submit_card.test.tsx` (vitest for the panel): shows once per DRAFT/day, three
  outcomes call the right provider methods.
- API `FillTelemetrySubmitIT`: window enforcement, outcome idempotency, precision aggregate.
- Fixtures (E1) carry `successSignals`; a fixture "confirmation" page per ATS asserts HIGH.

## 10. Rollout

E4.1 per-ATS signals + confidence + telemetry → E4.2 submit-click watch → E4.3 drawer "Did you submit?"
card + per-job pending lookup → E4.4 admin precision panel + remote demotion → E4.5 tracker events
write-through (needs U6.1 schema; until then the server ignores `event`).
