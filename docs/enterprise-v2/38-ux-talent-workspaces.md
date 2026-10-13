# 38 — UX: marketer, marketing manager, consultant, account manager, HR and finance pages

> Status: design, 2026-10-12 (Session D). Requirements §25 (page inventory), §26 (standards),
> CLAUDE.md "Gen Z / Notion-style": autosave, no Save buttons in forms, inline ✓ (`SavedTick`),
> undo toasts, versions in a menu. **`@kiwiply/ui` only** — primitives named below exist in
> `packages/ui/src/index.ts` (`PageFrame, Tabs, Card, Badge, Button, IconButton, Menu, Popover, SideSheet,
> BottomSheet, Dialog, EmptyState, ErrorState, ListSkeleton, Skeleton, Meter, ProgressBar, DeltaChip,
> SourceChip, ChipInput, ChoiceGroup, Stepper, SwipeCard, CardStack, DiffText, SpeechBubble, ConfettiBurst,
> SparkleBurst, AnimatedNumber, SaveStatusChip, SavedTick, Toast, Tooltip, DragHandle, AiDisclosure,
> useBottomBar, useMediaQuery, useReducedMotion`, `icons.tsx`, `doodles.tsx`, `Brand`). New primitives
> this domain needs → added to `packages/ui` **first** (§7). Session B owns the shell, nav derivation,
> tenant tokens and the mascot pose map; these pages render inside that shell at 390 and 1440.

## 1. Shared rules for every page here

- **Layout:** `PageFrame` with a title row (title · count chip · primary action as a compact `Button`
  size `sm`, never a large edit button), a filter row (`ChipInput`/`Select` inline; on 390 collapses
  to one "Filters" `BottomSheet`), then a list or board. Boards scroll horizontally on 390 with
  snap; lists are cards on 390 and dense rows on 1440. Sidebars are viewport-height and scroll
  independently (shell rule).
- **Consent is visible, not hidden:** a `Badge` tone `neutral` "Summary" / tone `success` "Full"
  on every consultant card; a blank cell is a dotted `Tooltip` "Not shared" with "Ask Anika" where
  requestable. Never a lock icon without words.
- **State chips** use one vocabulary (`PipelineBadge`, §7): SUGGESTED grey · ASSIGNED blue · ACCEPTED
  teal · AUTHORIZED violet · IN_PROGRESS amber · CLOSED_* slate/green/red · WITHDRAWN slate.
- **Autosave everywhere** (`SaveStatusChip` top-right of a sheet; `SavedTick` inline on a field).
  Destructive or irreversible: `Dialog` with the typed reason where the API requires one.
- **Loading** = `ListSkeleton`; **error** = `ErrorState` with retry; **empty** = `EmptyState` with
  one doodle from `doodles.tsx`, a one-line truth and one action (texts in §6).
- **Honest delight** = one `SpeechBubble` from the mascot per *earned* moment (first authorization,
  first placement, a clean week), `ConfettiBurst` only on placement ACTIVE, respects
  `useReducedMotion`. Never on rejections, no-shows, overdue lists, or finance pages.

## 2. Marketer workspace (MARKETING_SPECIALIST)

Nav: Home · My Assigned Talent · Resumes · Job Discovery · Job Matches · Opportunities · Submissions ·
Applications · Interviews · Follow-ups · Tasks · Activities · Performance.

### 2.1 My Assigned Talent — 390
```
┌──────────────────────────────┐
│ ‹ Acme     My talent  (7)  ⌕ │  PageFrame title + count + search IconButton
│ [Needs you 3] [Ready 4] [All]│  Tabs (segmented)
│ ┌──────────────────────────┐ │
│ │ ◯ Anika R.   Full ✓  ●  │ │  avatar/initials (photo only if opted in) · consent Badge · availability dot
│ │ Java backend · bench 12d │ │  headline · bench aging
│ │ Readiness ████████░ 82   │ │  Meter
│ │ ⚠ Approve resume v5     │ │  nextAction (readiness) as a tappable line
│ │ 3 assigned · 1 authorized│ │  pipeline mini-counts
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ ◯ Dev P.     Summary  ○ │ │
│ │ ░ Not shared · Ask Dev  │ │  consent gap, one tap request
│ └──────────────────────────┘ │
│                      [+ Jobs]│  floating compact Button → Job Discovery for the selected consultant
└──────────────────────────────┘
```
Tap a card → consultant page: `Tabs` Overview · Resumes · Opportunities · Applications · Interviews ·
Notes (marketer's own) · Timeline. Overview = profile overlay (editable fields open a `BottomSheet`
that **proposes**, with copy "Anika will confirm") + readiness checklist + license chips.

### 2.1 My Assigned Talent — 1440
Three-pane: left list (320 px, independently scrolled, same cards compact), centre the consultant
page, right rail (280 px) "Next actions" (readiness `nextAction` for each consultant + follow-ups
due). Keyboard: `j/k` move, `enter` open, `a` assign jobs.

### 2.2 Job Discovery + Matches (for one consultant) — 390
```
┌──────────────────────────────┐
│ ‹ Anika · Find jobs          │
│ ⌕ java backend remote   ⚙    │  JobSearchService.search; ⚙ opens MatchPreferences (consultant's, read-only to marketer)
│ [AI matches 12] [Search] [Bank]│ Tabs — AI tab shows AiDisclosure "Scored for Anika · charged to her license"
│ ┌──────────────────────────┐ │
│ │ Stripe · SWE II · Remote │ │
│ │ 84 ▮ fits: Java, Kafka   │ │  score chip + reason (300 chars max, truncated)
│ │ ☐ select   Resume: v5 ▾  │ │  checkbox + resume picker (APPROVED only; STALE shows "approve first")
│ └──────────────────────────┘ │
│ … (SwipeCard on 390: swipe right = select, left = dismiss)                                  │
│ ───────────────────────────  │
│ [Assign 5 → Anika]  Note ▾   │  useBottomBar sticky; one notification per batch
└──────────────────────────────┘
```
Duplicate warnings render inline on the card ("Anika applied here on 3 Oct · linked") — the card is
selectable only to **link**, never to re-assign. Board policy note ("Apply on Stripe's site — in
Anika's session") as a `SourceChip`.

### 2.3 Opportunities / Submissions pipeline — 1440
Kanban (`CardStack` columns; `DragHandle` for reorder within a column only — status changes go
through buttons with guards, not drops): Suggested · Assigned · Accepted · Authorized · In progress
· Closed. Cards show consultant avatar, opportunity title, company/client, resume version chip,
days in column, `DeltaChip` for score, a "needs approval" `Badge` when the manager must act.
Submissions tab = table (requirement · consultant · resume vN · channel · submitted on · status),
primary action per row **"Record submission"** (`SideSheet`: submitted_at, channel, external ref —
the sheet's title reads "Record what you sent outside Kiwiply"). On 390 the Kanban becomes a status
`Tabs` + card list.

### 2.4 Follow-ups / Tasks / Activities
Follow-ups = list grouped Today · Overdue · This week; one-tap "Done" with undo `Toast`; snooze
`Menu`. Activities = `pipeline_event` feed ("You assigned 14 jobs to Anika · 2h"). Performance =
tiles (`AnimatedNumber`) + a 12-week bar (own rows only).

## 3. Consultant workspace (CONSULTANT)

### 3.1 Consultant Home — 390
```
┌──────────────────────────────┐
│ Hi Anika            Acme ▾   │  workspace switcher lives in the shell (Session B)
│ ┌──────────────────────────┐ │
│ │ 🐦 "Sarah lined up 3 new │ │  SpeechBubble, only when there is something new
│ │ jobs for you."           │ │
│ └──────────────────────────┘ │
│ Needs you (2)                │
│ ▸ Approve resume "Backend v5"│  → DiffText review sheet
│ ▸ Confirm interview · Globex │  → confirm/decline BottomSheet
│ Assigned opportunities (3)   │
│ ┌ Stripe · SWE II  [Accept] ┐│  SwipeCard: right = accept, left = decline (reason sheet)
│ └ Notion · Platform  …      ┘│
│ My applications · 12  ▸      │  the existing tracker, "From Acme" filter preset
│ Interviews · Tue 14:00  ▸    │
│ Placement · —                │
│ Features on my Acme license ▸│  Session C's view
└──────────────────────────────┘
```
### 3.2 Assigned opportunity detail — 390
Title/company/location · marketer note (`SpeechBubble` with Sarah's avatar) · pinned resume chip
(STALE → "Approve the new version first" button) · **three actions**: *Accept* · *Decline…* ·
*Authorize* (opens `ChoiceGroup`: "I'll apply myself" / "Sarah may present me to the client" / both;
the second hidden for board postings) · after authorize: **"Open on Stripe"** (new tab; the
extension drawer autofills in *your* session) + "Save to my board". Timeline at the bottom with
"you"/"Sarah" tags.
1440: two-column; right column = the pinned resume preview (`ResumePreview`).

### 3.3 Resume approval review
`DiffText` between the approved version and the current, grouped by section; "Approve v5" /
"Reject with a note" / "Revert to v4?" (offered, not automatic). Copy: "You're attesting this is
true. Sarah can't use it until you do."

## 4. Marketing Manager (MARKETING_MANAGER)

Nav: Home · Team · Consultant Assignments · Pipeline · Approvals · Workload · Escalations · Reports.

### 4.1 Workload — 1440
```
┌ Workload · Bench team ──────────────────────────────────────────────── [Cap 10 ▾] ┐
│ Sarah K.  ●●●●●●●●○○  8/10   │ Priya N.  ●●●●○○○○○○  4/10   │ Rahul S. (leave) ●●●●●●●●●● 10/10 ⚠ │
│ ◯ Anika R.  bench 12d  ⠿     │ ◯ Dev P.   on project         │ ◯ … (delegate →)                  │
│ ◯ Maya L.   bench 3d   ⠿     │ ◯ Sam T.   bench 40d ⚠        │                                   │
│ ↑ drag a chip to another marketer → "Reassign Anika to Priya? (PRIMARY)" Dialog with reason      │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```
Undo `Toast` 8 s ("Moved Anika to Priya · Undo"). Health flags (`ROLE_LOST`, suspended) as `Badge`
tone `warning`. 390: columns become an accordion per marketer; "Reassign" via a `Menu` on the chip
(no drag on touch).

### 4.2 Approvals
List of pending `opportunity_match` approvals and `org_resume` requests needing a manager (when
the org sets it): consultant · opportunity · resume display name · marketer · age; Approve / Reject
(note). **Metadata only** — no resume content opens here.

## 5. Account Manager, HR, Finance

- **Account Manager** (34 §4): Clients list → account page with `Tabs` Contacts · Relationships
  (a small graph rendered as nested chips "TekVendor → subcontracts to → Globex") · Requirements ·
  Submissions · Placements. Requirement intake `SideSheet` with "Paste the email" `Textarea` →
  prefilled fields (rules), `AiDisclosure` when enrichment is on. Submissions table as 2.3.
- **HR** (36 §3): Onboarding board = member columns with checklist `ProgressBar`; Policies page
  (nav label "Policies", not "Documents") with version `Menu`; ack flow at 390 = scroll-to-end then
  "I acknowledge" button; Lifecycle timeline (`employment_record` chain).
- **Finance** (36 §4): Finance Home tiles (`AnimatedNumber`: licenses cost, outstanding invoices
  (records), payments recorded this month, approved hours this week) → each tile a deep link into
  H's pages or Session C's billing pages; Placements (rates) table with `bill`/`pay`/margin band.
  Disclaimer line from H: "Records you entered. Not tax, legal or accounting advice."

### 5.1 Placements — 1440
Board: Pending start · Active · Ending soon (≤ 30 d) · Ended. Card: consultant, client (via vendor
chip), start → end, rate band (numbers only for finance), `Badge` EXTENDED for 7 d after an
extension, "Redeploy" `Menu` on ended cards. Row actions: Start · Extend… (`SideSheet`: new end
date, rates change? → creates an offer) · End… · Terminate… (reason). 390: list with the same
`Badge`s; actions in a `BottomSheet`.

### 5.2 Timesheet entry — 390 (product H's screen, embedded unchanged)
```
┌──────────────────────────────┐
│ ‹ Oct 6–12     Globex ▾      │  week header; placement switcher only if >1
│ Draft · due Mon              │
│ Mon  ─  8.00  +              │  44 px Stepper, step = ops_settings.step_minutes
│ Tue  ─  8.00  +              │
│ Wed  ─  7.50  +   ⚠ note    │
│ Thu  ─  8.00  +              │
│ Fri  ─  8.00  +              │
│ Sat/Sun ▸ (collapsed)        │
│ Total 39.50 h (expected 40)  │  soft amber flag
│ [Copy last week] [PTO…]      │
│ Client-approved sheet  [Add] │  proof (H3), scanned client-side first
│ [Submit for approval]        │  useBottomBar; disabled at 0 min
└──────────────────────────────┘
```
Finance's approver inbox (H3.6) is the 1440 counterpart: All · Flagged · No proof tabs, one-tap
approve only on clean rows.

## 6. Empty states and copy (one truth, one action)

| page | empty text | action |
|---|---|---|
| My Assigned Talent | "No consultants assigned to you yet. Your manager assigns them." | — (or "Ask Priya" if `workload.view` shows the manager) |
| Job Matches (consultant has no FULL) | "Anika hasn't shared her profile with you, so there's nothing to match on yet." | Ask Anika |
| Job Matches (no license) | "AI matching isn't on Anika's license." | Tell your admin (deep link) |
| Opportunities pipeline | "Nothing in flight. Find jobs for someone on your list." | Job Discovery |
| Submissions | "No submissions recorded. When you present someone to a client, record it here." | Record submission |
| Consultant home (nothing assigned) | "Nothing from Acme yet. Your own job search still works as always." | Jobs |
| Assigned opportunities (all handled) | "All caught up." + mascot nod (no confetti) | — |
| Interviews (consultant) | "No interviews scheduled." | — |
| Placements (AM) | "No placements yet. They appear when someone accepts an offer." | Offers |
| Workload (manager) | "No marketers on your team yet." | Team |
| HR Policies | "Kiwiply keeps no identity documents. Policies you publish live here." | New policy |
| Finance Payments | "Record payments you received or made elsewhere. Kiwiply never moves money." | Record a payment |
| Timesheets (consultant, no placement) | "You're not on a placement yet. Timesheets start when you are." | — |

Honest-delight moments (one `SpeechBubble`, dismissable, never repeated): first authorization
("Anika's in. Now it's her move."), placement ACTIVE (`ConfettiBurst` once, "Anika starts Monday."),
a marketer clearing all follow-ups ("Inbox zero, pipeline style."). No cheer on REJECTED, NO_SHOW,
TERMINATED, overdue, or any finance screen.

## 7. New `@kiwiply/ui` primitives (add first, with tests, then use)

| primitive | purpose | notes |
|---|---|---|
| `PipelineBadge` | one status→tone map for match/submission/interview/offer/placement/employment states | generated from `PipelineTransitions` state list (doc-sync test) |
| `ConsentChip` | Summary / Full / Not shared + "Ask" affordance with cooldown state | wraps `Badge` + `Popover` |
| `ReadinessRing` | 0–100 ring with `nextAction` line | wraps `Meter` |
| `KanbanBoard` | columns with horizontal snap on 390, `CardStack` columns on 1440; no drag between columns | |
| `WorkloadColumn` | capacity dots + drag chips (desktop) / menu (touch) | uses `DragHandle` |
| `TimelineFeed` | merged `application_event` ∪ `pipeline_event` rows with actor tags | |
| `RateCell` | minor-units money with currency, band-only mode for non-finance | never floats |
| `SensitiveTextField` | `Input`/`Textarea` with the TS `sensitive-patterns` pre-check and the 422 message | shared with H |

Icons: add `briefcase`, `handshake`, `calendar-check`, `clipboard-check`, `shield-check`,
`building`, `route` to `icons.tsx` (no inline `<svg>` in web).

## 8. Accessibility and responsiveness checks (per story AC)
Every page passes at 390 (no horizontal page scroll, 16 px gutters, 44 px tap targets) and 1440;
contrast on tenant tokens validated by Session B's rule; all boards keyboard-navigable; motion
honours `useReducedMotion`; screen-reader labels on status chips read the full state name.
