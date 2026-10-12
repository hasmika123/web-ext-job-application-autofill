# Design — Extension in-page help & "this site didn't fill" (area `sup`, epic S4)

Status: decided 2026-10-11. The drawer (`job-autofill/entrypoints/panel/HomeView.tsx`) has
Settings and Close in its header and no way to ask for help or say "this didn't work". Simplify's
loudest complaints are exactly this (extension "not able to scan", "9 days and nothing fixed").
The `ext` area owns adapters and the fill engine; this area owns the help/report affordances and
the support loop they feed. Everything here goes through the `TrackingProvider` seam
(`job-autofill/src/lib/tracking.js`), stays framework-free in the engine, and adds no deps.

## 0. Summary

1. **A "?" in the drawer header** opens `HelpSheet`: three articles for the current adapter (from
   `/api/help/index`, filtered by `ats`), a search box, "This site didn't fill", "Ask" (Pro, S6.3),
   "Open help center". Offline: a bundled list of 10 slugs with titles.
2. **"This site didn't fill" is one tap + optional note.** It creates a `support_ticket`
   kind `SITE_REPORT` with **consented diagnostics**: `fill_event.id` of the last fill on this
   page (already recorded: `ats, adapter, fields_found/filled/failed, required_left_empty,
   user_corrected, ext_version`), the host, and a **field-label fingerprint** — the list of visible
   form labels, each hashed (sha256, salted per install) with their input types — never values,
   never page text, never the URL path (host only). The consent switch is per report, default on,
   and the sheet shows exactly what will be sent.
3. **Every fill asks once:** "Did this fill work? 👍 👎" inline after the fill summary, at most
   once per host per day; 👎 opens the report sheet pre-filled. Goes to `feedback_event`
   (`target_type=fill`, `target_id=fill_event.id`).
4. **The loop closes in the drawer.** `GET /api/profile/version` (already polled) gains
   `supportUnread`; a dot on "?" and a card "Your Workday report: fixed in 0.66 — update now" with
   the store link. Site reports resolved FIXED_IN_VERSION show this automatically.
5. **Per-ATS public status** (`/status` autofill group) is fed by the site-report rate and the
   kill switch, so "we know, fix shipping" is visible before anyone writes a ticket.

## 1. Data additions

- `support_ticket.diagnostics` JSON (defined in `support-tickets.md`) for SITE_REPORT:
  `{host, ats, adapter, extVersion, browser, fillEventId, labels:[{h, type, required}], stepIndex,
  url_hash}`.
- `fill_event` gains `report_ticket_id BIGINT NULL` (additive) so engineering can jump from the
  aggregate to the report.
- No new extension storage beyond a small `reportQueue` (≤ 5 pending reports, retried on the next
  profile pull) and `fillFeedbackSeen: {host: day}`.

## 2. Extension flow

```
fill completes ─▶ summary card ─▶ "Did this fill work? 👍 👎"
                                     │👎
                                     ▼
                      ReportSheet (what happened? · what we'll send ▾ · [Send])
                                     │
                                     ▼
          JAF.tracking.createTicket({kind:'SITE_REPORT', subject, body, diagnostics})
                                     │ offline / 5xx
                                     ▼
                              reportQueue (retry on next pull, max 3)
```
Header "?" → HelpSheet → same ReportSheet without a fill event (diagnostics then carry host +
adapter + labels only).

Seam additions (`tracking.js`): `createTicket(payload)`, `listTickets()`, `helpIndex()` (cached 1 h
in `chrome.storage.session`), all auth-optional like `submitBugReport` (which becomes a thin alias
that creates a `kind=BUG` ticket, keeping 0.65 clients working).

## 3. API

| Method | Path | Notes |
|---|---|---|
| `POST /api/support/tickets` | from S2.1 | `source: extension`, `kind: SITE_REPORT`; API-side limit 20/day per install key (hash of the token or the anonymous install id) |
| `GET /api/help/index?ats=` | from S1.2 | ≤ 50 entries |
| `GET /api/profile/version` | existing | + `supportUnread`, `supportCards:[{ticketId, publicId, text, link}]` (max 3) |
| `GET /api/admin/support/site-reports?ats&since` | S9 | grouped by `(ats, adapter, label-fingerprint prefix)` with counts → "top broken fields" |

## 4. Failure modes

| Failure | Behaviour |
|---|---|
| Page has no fill yet | report still works (no `fillEventId`), labelled "before a fill" |
| Label hashing collides across sites | fine — we group within `(ats, adapter)` only |
| User disables diagnostics | ticket carries host + ats + version only; staff reply asks for a screenshot (web attachment) |
| Index fetch fails | bundled fallback list; never blocks the fill |
| Report storm from one broken adapter | API-side per-install limit; the aggregate still spikes the status signal (S7) — that's the point |
| Adapter kill switch on | HelpSheet shows "Workday autofill paused — we're fixing it" (from remote config) instead of the report button |

## 5. Privacy

Diagnostics are consented per report and previewed before sending; labels are hashed with a
per-install salt, so two users' reports for the same form group together only via the public
`(ats, adapter)` and the staff never recover label text from hashes (the engineer reproduces on the
real site). URL path is never sent (host only). PRIVACY.md gains a paragraph (trust area reviews).

## 6. Cost

No AI. Tickets are cheap; the payoff is a measured, prioritised ATS backlog instead of "Workday is
broken" emails.

## 7. Tests

Extension: `help_sheet.test.js` (index filter by ats, fallback offline, kill-switch state),
`site_report.test.js` (payload shape, hashing with salt, no values/URL path, consent off ⇒ minimal
payload, queue retry max 3, 👍/👎 once per host/day), `tracking.test.js` (createTicket alias for
submitBugReport). API: `SiteReportGroupingTest`, `ProfileVersionIT` (supportUnread/cards).
Playwright (web admin): resolve a SITE_REPORT as FIXED_IN_VERSION → next version poll returns a card.

## 8. 390 px / drawer wireframes (drawer is ~360 px wide)

```
┌──────────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐
│ Kiwiply       ?●  ⚙  ✕       │  │ Help for Workday        ‹    │  │ This site didn't fill    ‹   │
│ Fill summary · 12/18 filled  │  │ [🔍 Search help…          ]  │  │ What happened? (optional)    │
│ 3 need a look ›              │  │ 📄 Workday: what autofills   │  │ [Dropdowns on step 2 empty ] │
│ Did this fill work?  👍  👎  │  │ 📄 Site didn't fill?         │  │ We'll send: Workday · v0.65  │
│ ──────────────────────────── │  │ 📄 Review before submit      │  │ · 12/18 fields · 14 field    │
│ ✨ Your Workday report:      │  │ [This site didn't fill]      │  │   labels (hashed) · no page  │
│ fixed in 0.66 — update now › │  │ [Ask Kiwiply Help ✨ Pro]    │  │   text, no answers  [What?]  │
│                              │  │ [Open help center ↗]         │  │ ☑ Include these details      │
│                              │  │                              │  │ [ Send report ]              │
│                              │  │                              │  │ We reply within 1 business   │
│                              │  │                              │  │ day. Track it in Settings ›  │
└──────────────────────────────┘  └──────────────────────────────┘  └──────────────────────────────┘
```
