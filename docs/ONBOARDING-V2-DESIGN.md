# Onboarding v2 — the happy first run (build-ready)

Written 2026-10-12 on `resume-builder` for the user's brief of the same day ("users should feel happy; the
best user experience matters"; audience Gen Z and Gen Alpha first, millennials second). Companions:
`docs/RESUME-BUILDER-STORIES.md` + `docs/resume-builder/stories.json` (epic **R1b**, stories R1.7–R1.13),
`docs/RESUME-BUILDER-DECISIONS.md` (#32, #33 and sub-rows), `docs/HANDOFF-RESUME-BUILDER.md`.

**How to read this document.** It is written for a Sonnet agent that implements one story per session.
Every section is a decision; if a story and this document disagree, this document wins; if something is
unspecified, the implementer **stops and asks**. The R1.4/R1.5 machinery is **kept**: the parse pipeline
(`lib/profile-setup/parse.ts`, `import.ts`, `draft.ts`, `sensitive.ts`), `ReviewCards`, `SwipeCard`,
`SkillsStep`, `IdentityStep` (never overwrites a user-provenance value), `FreshFlow`, `ParseConsent`,
`SensitiveNotice`, the redaction before parsing. What changes is the **shell, the flow, where progress
lives, and where the flow starts**. Nothing in parsing is rebuilt.

Platform rules this design obeys (root `CLAUDE.md`): never collect sensitive PII (the draft included, §8.5);
everything admin-configured (§11); one design system `@kiwiply/ui`, no inline `<svg>`; "ask the bare
minimum, derive the rest from the resume, learn the remainder from real applications"; Free has no server
AI except resume parsing (the flow uses nothing else); the extension's local store is a read-only mirror
that moves only on a confirmed profile write (§16).

---

## 0. Summary — and what changes vs today

**One flow, never a gate, never lost.** A new user lands on the Dashboard (no redirect) and sees one warm
card: *"Let's get you job-ready · ~2 min"*. The flow at `/profiles/setup` is one question or one card per
screen under a single thin progress bar: **who you are** (persona chip) → **your resume** (upload is the
hero; paste and start fresh are secondary) → **confirm cards** (Keep / Edit / Skip, swipe on touch) →
**skills** → **about you** → **the six application questions**, persona-aware and all skippable →
**payoff**: *"You're set — Kiwiply can now autofill ~N fields for you"*, confetti, three next actions.
Everything the user does is autosaved as a **server-side draft** (resumable on any device, "3 of 7 done")
while **nothing reaches the profile until a confirm point** (§3.4). `/welcome` is retired into this flow.

### 0.1 Change table

| # | Today (R1.4/R1.5 + 10.3b `/welcome`) | Onboarding v2 | Where |
|---|---|---|---|
| 1 | "Nothing is saved until you finish" + `sessionStorage` draft (this tab only) | **Progress is never lost**: server draft `onboarding_draft` autosaved on every decision, local mirror for offline, resumable cross-device; profile writes only at confirm points | §3.4, §7, §8 |
| 2 | 6-label `Stepper` ("Start · Your resume · Review · Skills · About you · Preferences · Done") | **One thin progress bar** + "~2 min" / "about 1 min left"; one question or card per screen | §5.0, §13 |
| 3 | No personality; "Build your profile" | **Mascot + warm copy**: "Let's get you job-ready in 2 minutes" | §5, §5.14 copy deck |
| 4 | Three equal option rows (Upload / Paste / Start fresh) | **Upload is the hero** (big drop zone on the page; phone: Files / Drive picker); Paste and Start fresh are secondary chips below | §5.3 |
| 5 | "Paste text — From LinkedIn, Notes or anywhere else" | "Paste from **Google Docs, ChatGPT, Notes or LinkedIn**" | §5.4 |
| 6 | No persona | **Persona chip first** (Student / Internship · First job · Switching careers · Experienced) shapes question order, defaults, tips, copy; stored in `bio.meta_json.onboarding.persona` (not sensitive, not a form field) | §3.2, §5.2 |
| 7 | Privacy line in grey text at the bottom | **🔒 badge next to the drop zone**: "We remove SSN and bank details before reading" + a tap-to-expand line | §5.3 |
| 8 | "Your profile is set up." + meter + next action | **Payoff**: "You're set — Kiwiply can now autofill **~N fields** for you" (honest count, §10), confetti, three actions: Build a resume (chooser preselected "Use my profile") · Install the extension · Find jobs | §5.11, §10 |
| 9 | Dashboard `redirect("/welcome")` for anyone without `onboardedAt`; `/welcome` a separate 6-question wizard | **No forced redirect anywhere.** `/welcome` → 302 into the flow (`/profiles/setup?step=prefs`); the six questions are the flow's last part, persona-aware, all skippable; dashboard shows a dismissible **"Finish your profile · 2 min"** card that resumes the draft | §4, §6 |
| 10 | `BuildProfileCard` (score < 40) + `ProfileProgressCard` (≥ 40) | **`FinishProfileCard`** replaces `BuildProfileCard` (not-started / in-progress / snoozed states, mascot, "3 of 7 done"); `ProfileProgressCard` unchanged for the ≥ threshold range | §6 |
| 11 | Events `profile_setup_*` (3) | Full funnel: `onboarding_card_shown … onboarding_resumed` (§12); `profile_setup_parsed` kept | §12 |
| 12 | Settings: `profile.setup.promptBelowPercent` | + 12 `onboarding.*` keys with defaults and bounds (§11), travelling on the builder config | §11 |

### 0.2 The nine user-approved points (2026-10-12) → where each lands
(1) draft autosave §7/§8 · (2) progress bar §5.0 · (3) mascot + copy §5/§5.14 · (4) upload hero §5.3 ·
(5) paste copy §5.4 · (6) persona §3.2 · (7) lock badge §5.3 · (8) payoff §5.11/§10 · (9) one onboarding,
no redirect §4/§6.

---

## 1. Benchmark — what we adopt, what we deliberately don't

| Product | What it does well | We adopt | We don't |
|---|---|---|---|
| **Duolingo** | One question per screen; a single thin progress bar; the mascot reacts to what you do; a "why we ask" line under each question; every screen has a clear primary action; a celebration at the end | one-per-screen, thin bar, mascot moments (3, not on every screen), the "why" line (kept from `/welcome`), one celebration | **streaks, hearts, loss-aversion, guilt notifications**, "you'll lose your progress" copy — none of it. Progress is simply kept. |
| **Notion** | Autosave with a quiet status; no Save buttons; undo instead of confirm dialogs; "what will you use this for?" persona question that shapes the template | the quiet status pill (DECISIONS #32), undo toasts on Skip, the persona chip | the multi-step team/invite upsell |
| **Canva** | Upload is the hero of "start"; a huge drop zone that also works as a button; templates are one click away but not a step | upload hero, "no template step" (already DECISIONS #18) | Pro paywall interstitials during setup |
| **Spotify** | "Pick 3 artists" — chips, no typing; immediate payoff ("here's your mix") | chips everywhere (persona, notice period, work preference, skills); the payoff screen is computed from what you just did | — |
| **TikTok / BeReal** | Near-zero onboarding; value before account; the phone is the default | phone-first 390 px wireframes for every screen; nothing wider than one column; big touch targets; the flow is fine with **no file** | dark-pattern contact-import, "find friends" permission grabs |
| **LinkedIn** | Profile strength meter and "next best action" | the meter stays on the dashboard (`ProfileProgressCard`) | "All-Star" nagging, endless completeness upsells |
| **Simplify / Teal / Kickresume** (competitive landscape §4.1.4) | Resume upload → structured profile in one step | kept (R1.4 parse + review) | long forms after upload; EEO asked up front; weekly-plan upsell inside onboarding |

**Hard rules of tone (apply to every string in §5.14):** no fake urgency, no countdowns, no "limited",
no guilt ("you're almost there!!!"), no exclamation stacking, no corporate ("leverage", "optimize"), no
baby-talk. Honest numbers only (the "~N fields" is computed, never a marketing constant). Nothing is ever
"required"; "Skip" is always visible and never shamed.

---

## 2. Principles

1. **Gate nothing.** The Dashboard is the landing page for every signed-in user. The flow is an invitation
   on a card, not a wall. (User point 9.)
2. **Never lose a tap.** Every decision is in the server draft within a second; the local mirror covers
   offline; the card resumes where they left. (User point 1.)
3. **Confirm, don't type.** The resume fills; the user says yes/no/fix. The profile receives only what was
   confirmed, at a confirm point (§3.4). The extension mirror moves only then (§16).
4. **One thing per screen.** One question, one card, one primary button. Secondary options are chips or
   links, never equal-weight buttons.
5. **~2 minutes, honestly.** The estimate is computed from the remaining steps (§5.0); it never counts up.
6. **The persona is a lens, not a wall.** It reorders and rewords; it never hides a path or a question the
   user might want (every question stays reachable by "Show all questions").
7. **Reuse the proven parts.** Parse pipeline, review cards, swipe, redaction, identity-conflict rules —
   untouched.

---

## 3. The flow

### 3.1 Steps (`StepKey` v2) and the per-screen rule

```
hello → source → (input: upload | paste | fresh) → review (0..n cards + recap) → skills → you → prefs (q1..qk) → done
```

| Step | Screen(s) | Counts in the bar as | Autosaved to the draft on | Writes the profile? |
|---|---|---|---|---|
| `hello` | persona chips | 1 | chip tap | persona only (meta, §8.2) |
| `source` | upload hero / paste / start fresh entry | 1 | path tap, parse result (candidates, never the file or text) | no |
| `review` | one card per candidate, then the recap | 1 (sub-progress = cards decided / cards) | every Keep / Edit / Skip, cursor | no |
| `skills` | chips | 1 | every chip change (debounced 400 ms) | no |
| `you` | identity confirm card | 1 | every field (debounced 400 ms) | **yes — core confirm point** (one import + one PUT) |
| `prefs` | one question per screen, k ≤ 6 | 1 (sub-progress = questions answered-or-skipped / k) | each answer | **yes — per answer** (merge PUT of that key) |
| `done` | payoff | — | finish → draft deleted | finish marks `finishedAt` + `onboardedAt` |

"3 of 7 done" counts whole steps (`hello, source, review, skills, you, prefs, done`); `done` counts when
finished. A run with **no candidates** (nothing parsed, or Start fresh with no entries) skips `review`;
the totals shrink accordingly (`stepsTotal` in the draft, §8.1) — the bar never jumps backwards.

### 3.2 Persona — the lens

`persona ∈ {student, first_job, switching, experienced} | null`. Chips (labels in §5.2). Chosen on `hello`;
changeable from the ⋯ menu on any step ("Change who I am") and from `/profiles?tab=preferences` later.

| Persona | Source screen order | Pref questions shown (order) | Defaults pre-selected (shown as a selected chip, still one tap to change) | Tips (one line, the "why") |
|---|---|---|---|---|
| **student** | Upload hero; secondary chips **Start fresh** (promoted, copy "No resume yet? Totally fine.") then Paste | work authorization · sponsorship · work arrangement + relocation · **when can you start** (chips: "Right away" · "After I graduate" + month) · EEO (collapsed). *Salary is not asked* (shown under "Show all questions") | none | "Internship forms ask this on page one." |
| **first_job** | same as student | work authorization · sponsorship · salary (hint "a range is fine, e.g. $45–55k") · when can you start · work arrangement + relocation · EEO | none | "Most entry-level forms ask these five." |
| **switching** | Upload hero; Paste; Start fresh | work authorization · sponsorship · work arrangement + relocation · salary · notice period · EEO | none | "Career-change applications ask about relocation and start dates more often." |
| **experienced** | Upload hero; Paste; Start fresh | work authorization · sponsorship · notice period · salary · work arrangement + relocation · EEO | none | "Senior roles nearly always ask notice and salary." |
| **null** (skipped) | = experienced | all six, `/welcome` order | none | `/welcome` "why" lines |

Rules: a persona **never pre-answers** a question (no silent defaults into the profile — a pre-selected
chip still needs the user's tap on *Continue*; the only exception is none). Questions already answered in
the bio are not shown (`unansweredQuestions(bio)` kept), so a returning user sees only what is missing.
"Show all questions" on the last pref screen reveals any question the persona hid.

### 3.3 Paths into the review (kept)

`upload` → `UploadStep` (browser-side text extraction → `SensitivePatterns` redaction → AI parse with the
existing consent, heuristic fallback) · `paste` → `PasteStep` (same) · `fresh` → `FreshFlow` (R1.5, its own
sub-screens; its goal chips are **pre-filled from the persona**: student→`internship`, first_job→`first-job`,
switching→`switch`, experienced→`same`, still changeable). All three land on `review` with the same
`ParsedDraft`. The draft stores `parsed` exactly as today (candidates, identity, skills, suggestions,
languages, `removed`) — never the file, never the raw text.

### 3.4 Confirm points — "confirm, not type" reconciled with "never lost"

The draft is the **working copy**; the profile is the **confirmed copy**. Two confirm points, chosen so
Back is free inside each tier and nothing half-confirmed ever reaches the extension (DECISIONS #33c):

1. **Core confirm = Continue on `you`.** One `POST /api/profile/items/import` (kept entries with edits,
   skills, languages, identity from the resume) + one `PUT /api/profile` (typed identity, headline, summary)
   — exactly `ProfileSetup.finish()` today minus the prefs and the onboarded flag. The draft records
   `coreConfirmedAt` + the import result. After this, `review` / `skills` / `you` are shown as **done**: Back
   from `prefs` lands on a one-screen **"Your profile so far"** summary (counts + "Edit on your profile" link),
   not on the cards. Re-opening them would mean a second import; merge-by-identity (`ProfileItemMerge`)
   makes that safe, but the UI does not invite it.
2. **Per-answer confirm on `prefs`.** Each answer is a merge `PUT /api/profile` of that key (the `/welcome`
   behaviour), so leaving after three questions keeps three answers. Skip writes nothing.
3. **Finish** (`POST /api/profile/onboarding/finish`): sets `meta.onboarding.finishedAt`, writes
   `payload.onboardedAt` (kept for every reader of `ONBOARDED_KEY`), deletes the draft, returns the payoff
   numbers (§10). Finish is the automatic result of the last pref screen's Continue/Skip — there is no
   Finish button to find.

Retry safety is kept from R1.4: `imported: true` in the draft prevents a second import when the PUT after it
failed ("Try again" repeats only the PUT).

### 3.5 Leaving and coming back

- **Exit** (top-right ✕ on every screen): saves (it already did), goes to the Dashboard, toasts nothing.
  The card shows "Finish your profile · 3 of 7 done".
- **Resume**: the card's Continue (or any entry point) opens the flow on the draft's `step`; a one-line
  status "Picked up where you left off · Start over" shows for the first screen only (kept copy).
- **Another device**: the draft is server-side; the local mirror is reconciled by `updatedAt` (§7.3).
- **Start over**: `DELETE …/draft` + local clear + `reset`; persona is kept (it is meta, not draft).
- **Expiry**: a draft older than `onboarding.draft.ttlDays` (30) is purged nightly; the card then shows the
  not-started state again (the persona and any confirmed prefs are, of course, still in the profile).

---

## 4. Entry points, routing and the retired `/welcome`

| Entry | Behaviour |
|---|---|
| **First login** | `(app)` layout → `/dashboard` (unchanged post-login target). **No redirect.** `FinishProfileCard` in the first slot of the dashboard's card column (above `SuggestionsCard`), not-started state with the mascot. |
| **Dashboard card** | Start → `/profiles/setup` (`onboarding_started{entry:"card"}`); Continue (draft exists) → `/profiles/setup` which opens on the draft's step (`onboarding_resumed`). |
| **`/welcome`** | Server redirect `302 /profiles/setup?step=prefs&from=welcome`. The `?step=prefs` deep link opens the prefs tier directly when there is no draft (persona null → `/welcome` order) — exactly the old six questions, now in the new shell. Old bookmarks and any email linking `/welcome` keep working. The `Onboarding.tsx` + `welcome/page.tsx` components are deleted; `preferences.tsx` (the question data + inputs) stays. |
| **Start chooser "Use my profile", empty profile** (DESIGN §10.14 card 1) | Button **"Build my profile · 2 min"** → `/profiles/setup?return=/resume-builder%3Fnew%3Dprofile`. The payoff's *Build a resume* action honours `return` (§5.11); `/resume-builder?new=profile` opens `NewResumeSheet` with "Use my profile" preselected (R2.6 adds the query handling in R1.12). |
| **My Profiles empty states** (`SectionTab` `fromResume` link) | Link text becomes "Set up in 2 min" → `/profiles/setup` (same page, no `?path=` — the persona screen first; a user who already has a persona skips `hello`). |
| **`/profiles/setup?path=upload|paste|fresh`** (kept) | Skips `hello` only if a persona exists; lands on that input. |
| **Extension** | Today there is no "set up on the web" link (the drawer links `/connect` only). R1.13 adds the drawer's empty-profile line "Set up your profile on kiwiply.com · 2 min" → `https://kiwiply.com/profiles/setup?utm_source=ext` (optional story, ext version bump). |
| **Email** (activation mail, U2 later) | may link `/profiles/setup`; nothing in this design changes mail. |

`needsOnboarding()` in `profile-options.ts` is **deleted** with its only caller (the dashboard redirect).

---

## 5. Screens — 390 px wireframes + copy

Conventions: the column is `max-w-[560px]` centred; on a phone it is full width with 16 px gutters. One
`<h1>` per screen (the question). The primary button is full-width on phones, `min-h-11` everywhere. The
status pill (§7.4) lives in the top bar right; Exit ✕ right of it. Mascot = `web/public/v2/app/mascot-*.png`
via the existing `Mascot` component (`components/marketing/media.tsx`), 96 px on phones, 128 px from `sm`;
rendered only when `onboarding.mascot.enabled` and never as the only carrier of meaning.

### 5.0 The shell (every screen)

```
┌──────────────────────────────────┐ 390
│ ‹ Back        Saved ✓        ✕   │  top bar: Back (hidden on hello), status pill, Exit
│ ▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱  ~2 min     │  one 4 px bar, accent fill; right label = estimate
│                                  │
│  [screen body]                   │
│                                  │
│ ┌──────────────────────────────┐ │
│ │        Continue  →           │ │  primary, sticky above the keyboard on phones
│ └──────────────────────────────┘ │
│            Skip for now          │  secondary text button, always 44 px tall
└──────────────────────────────────┘
```

- Bar value = `(stepsDone + subProgress) / stepsTotal`; `role="progressbar"`, `aria-valuetext="Step 3 of 7,
  about 1 minute left"`. Label: `~2 min` on `hello`/`source`; then `about N min left` (N = ceil of the sum of
  `onboarding.stepSeconds` for remaining steps / 60; `< 1 min left` under 60 s; hidden on `done`). It is
  computed from the remaining steps, so it only ever goes down.
- **No step labels, no numbered dots.** The `Stepper` primitive is not used here (it stays for other flows).
- Back returns to the previous screen *within the tier* (§3.4). On `review` it moves the cursor back one card.
- The ⋯ menu (phone: in the top bar; desktop: same) has "Change who I am", "Start over", "Exit".

### 5.1 Dashboard card — see §6 (three states, wireframes there).

### 5.2 `hello` — persona

```
┌──────────────────────────────────┐
│               Saved ✓        ✕   │
│ ▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱  ~2 min     │
│                                  │
│        (mascot-wave, 96px)       │
│                                  │
│  Hey Priya — let's get you       │  h1, 24px display
│  job-ready in 2 minutes.         │
│  First, which one's you?         │  14px soft
│                                  │
│  ┌────────────┐ ┌─────────────┐  │  radiogroup; chips 2×2, 56px tall
│  │ 🎓 Student │ │ 🌱 First job│  │
│  │ /Internship│ │             │  │
│  └────────────┘ └─────────────┘  │
│  ┌────────────┐ ┌─────────────┐  │
│  │ 🔄 Switching│ │ 💼 Experi- │  │
│  │   careers  │ │    enced    │  │
│  └────────────┘ └─────────────┘  │
│                                  │
│  This just changes which         │  12.5px muted
│  questions we ask. Change it     │
│  anytime.                        │
│ ┌──────────────────────────────┐ │
│ │        Continue  →           │ │  enabled once a chip is picked
│ └──────────────────────────────┘ │
│          I'll decide later       │  → persona null, next screen
└──────────────────────────────────┘
```
Icons: `GraduationCapIcon`, `RocketIcon`, `RefreshIcon`, `BriefcaseIcon` from `@kiwiply/ui` (the emoji
above are wireframe shorthand — never emoji in the UI). Tapping a chip selects it and the focus stays on
the chip; Continue advances (one explicit action, so a mis-tap is free). Desktop: the chips are 4-in-a-row.
Returning user with a persona: this screen is skipped.

Copy: h1 "Hey {firstName} — let's get you job-ready in 2 minutes." (no name → "Let's get you job-ready in
2 minutes."); sub "First, which one's you?"; chips "Student / Internship", "First job", "Switching careers",
"Experienced"; note "This just changes which questions we ask. Change it anytime."; link "I'll decide later".

### 5.3 `source` — upload is the hero

```
┌──────────────────────────────────┐
│ ‹ Back        Saved ✓        ✕   │
│ ▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱  ~2 min     │
│                                  │
│  Drop in your resume.            │  h1
│  We'll read it and you confirm   │  sub
│  what's right — no typing.       │
│                                  │
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │  drop zone = one big button, 180px
│      (mascot-resume, 72px)       │  tall, dashed accent border,
│ │                              │ │  whole area tappable
│      ⬆  Choose a file            │  phone: opens Files / Drive / iCloud
│ │  PDF, DOCX or TXT · up to 10MB │ │  (plain <input type=file accept>)
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
│  🔒 We remove SSN, bank and ID   │  LockIcon badge, 12.5px; tap →
│     numbers before reading. ⌄    │  expands the full never-collected line
│                                  │
│  No file handy?                  │  13px semibold
│  ┌─────────────┐ ┌─────────────┐ │  secondary chips, 44px
│  │ 📋 Paste text│ │ ✨ Start    │ │
│  │             │ │   fresh     │ │
│  └─────────────┘ └─────────────┘ │
│                                  │
│          Skip for now            │  → straight to `you` (identity) then prefs
└──────────────────────────────────┘
```
Desktop: the drop zone is 240 px tall and accepts drag-and-drop ("Drop it here" state with the accent fill);
the chips sit side by side under it. **student / first_job**: the chip row header reads "No resume yet?
Totally fine." and *Start fresh* comes first (and is `variant="accent-soft"`), Paste second. Consent copy:
`ParseConsent` exactly as today (the AI-parse consent toggle appears inline under the drop zone the first
time; remembered by `getAiParseConsent`).

Busy state (parsing): the drop zone becomes a card "Reading your resume… (mascot-books)" with a `Spinner`,
the progress bar does not move; ≤ 20 s then the heuristic fallback (existing). Result: lands on `review`.
Failure: inline `role="alert"` "We couldn't read that file. Try another, or paste the text instead." + the
chips stay. Too large: "That file is over 10 MB. Try a smaller one, or paste the text instead." (bytes from
`config.profile.uploadMaxBytes`).

Copy: h1 "Drop in your resume."; sub "We'll read it and you confirm what's right — no typing."; zone
"Choose a file" / "PDF, DOCX or TXT · up to {cap}"; badge "We remove SSN, bank and ID numbers before
reading."; expanded "We never collect Social Security, bank, passport or birth-date details. If your
resume has any, they're removed before anything reads it — and nothing is saved to your profile until you
confirm it."; row "No file handy?" / student: "No resume yet? Totally fine."; chips "Paste text", "Start
fresh"; skip "Skip for now".

### 5.4 `paste`

```
┌──────────────────────────────────┐
│ ‹ Back        Saved ✓        ✕   │
│ ▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱  ~2 min     │
│  Paste it in.                    │  h1
│  From Google Docs, ChatGPT,      │  sub
│  Notes or LinkedIn — anything    │
│  with your roles and schools.    │
│ ┌──────────────────────────────┐ │
│ │                              │ │  textarea, 10 rows, autofocus,
│ │  Paste here…                 │ │  "Paste" button appears on
│ │                              │ │  phones with clipboard API
│ └──────────────────────────────┘ │
│  🔒 We remove SSN, bank and ID   │
│     numbers before reading.      │
│ ┌──────────────────────────────┐ │
│ │        Read it  →            │ │  enabled at ≥ 80 chars
│ └──────────────────────────────┘ │
│     Upload a file instead        │
└──────────────────────────────────┘
```
Kept `PasteStep` behaviour (text only, never stored). Copy: h1 "Paste it in."; sub "From Google Docs,
ChatGPT, Notes or LinkedIn — anything with your roles and schools."; button "Read it"; link "Upload a file
instead"; too short: "Give us a bit more — a few lines about a role or a school is enough."

### 5.5 `fresh` (R1.5 `FreshFlow`, kept) — only the shell changes
`FreshFlow` renders inside the v2 shell; its internal sub-steps report `subProgress` to the bar (answered /
total of its own screens); its goal chip is pre-filled from the persona (§3.3). Its heading copy stays.

### 5.6 `review` — one card per screen

```
┌──────────────────────────────────┐
│ ‹ Back        Saved ✓        ✕   │
│ ▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱ about 1 min │
│  Does this look right?    3 / 8  │  h1 + card counter (12.5px muted)
│                                  │
│ ┌──────────────────────────────┐ │  SwipeCard (kept): swipe right =
│ │ 💼 Experience                │ │  Keep, left = Skip; arrows on
│ │ Product Design Intern        │ │  keyboard; buttons always
│ │ Acme · Austin, TX            │ │
│ │ Jun 2025 – Aug 2025          │ │
│ │ • Shipped onboarding redesign│ │
│ │ • Ran 12 usability sessions  │ │
│ │                        Edit ✎│ │
│ └──────────────────────────────┘ │
│ ┌─────────────┐ ┌──────────────┐ │
│ │    Skip     │ │   Keep  ✓    │ │  Keep = accent, Skip = ghost
│ └─────────────┘ └──────────────┘ │
│        Keep all the rest         │  after the 2nd card
└──────────────────────────────────┘
```
Kept `ReviewCards` behaviour (Keep / Edit / Skip, `decideAll`, cursor, the recap at the end with "Adding
3 roles, 1 school and 14 skills."). Changes: the recap is its own screen with Continue; a **Skip shows an
undo toast** "Skipped Acme · Undo" (4 s; `Toast` primitive; undo = `decide(id, undefined)` + cursor back);
the `removed > 0` `SensitiveNotice` shows once, on the first card, as the 🔒 line ("We removed 2 sensitive
values — we never collect those."). Every decision autosaves (§7). Copy: h1 "Does this look right?"; recap
h1 "Nice. Here's what we'll add."; "Keep all the rest"; mascot-clap on the recap (desktop only; it is
clipped on the left and sits behind the card).

### 5.7 `skills`

```
│  Your skills — tap to add.       │  h1
│  We found these in your resume.  │  sub (fresh: "Suggested for you.")
│  [Figma ✓][React ✓][SQL ✓]       │  selected chips (accent), 44px
│  [User research][+ A/B testing]  │  suggestions (outline)
│  ┌──────────────────────────────┐│
│  │ + Add a skill                ││  ChipInput (kept SkillsStep)
│  └──────────────────────────────┘│
│  Languages  [English · Native ✓] │  collapsed `details` when none parsed
│ [        Continue  →          ]  │
│          Skip for now            │
```
Kept `SkillsStep`. Copy: h1 "Your skills — tap to add."; sub "We found these in your resume." / "Suggested
for you." (fresh); hint when < 5: "Five or more helps forms that ask for skills." (not a blocker).

### 5.8 `you` — about you (the core confirm point)

```
│  Last check — is this you?       │  h1
│  Forms ask these on every page.  │  sub
│  First name   [Priya          ]  │  IdentityStep (kept): prefilled from
│  Last name    [Sharma         ]  │  the resume; a field the profile
│  Email        [priya@…        ]  │  already has (user provenance) shows
│  Phone        [+1 512 …       ]  │  "Keep mine / Use resume" conflict row
│  City, State  [Austin, TX     ]  │
│  Headline     [Product design…]  │
│  LinkedIn     [linkedin.com/…]   │
│  ▸ Summary (from your resume)    │  collapsed
│ [   Save my profile  →        ]  │  the ONE labelled write ("Save my
│                                  │  profile", not "Continue"): honest
│  Nothing above is shared with    │  about what happens
│  anyone. Edit it anytime.        │
```
Primary = "Save my profile" (DECISIONS #33c). On success → "Saved ✓" pill, `prefs`. Error → inline
`role="alert"` with the R1.4 `finishError` strings; the button becomes "Try again" (import not repeated).

### 5.9 `prefs` — one question per screen, persona-aware

```
│ ‹ Back        Saved ✓        ✕   │
│ ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱ < 1 min left│
│  Can you legally work in the     │  h1 (question, ≤ 2 lines)
│  country you're applying in?     │
│  Nearly every form asks. Answer  │  "why" line (12.5px muted)
│  once, we fill it everywhere.    │
│  ┌──────────────┐┌─────────────┐ │
│  │     Yes      ││     No      │ │  ChoiceGroup chips, 56px
│  └──────────────┘└─────────────┘ │
│ [        Continue  →          ]  │  tap of a chip = answered; Continue
│          Skip this one           │  writes it (PUT merge) and advances
```
Questions and inputs are `PREFERENCE_QUESTIONS` + `PreferenceInputs` (kept), rendered one at a time in the
persona's order (§3.2) with the persona's rewrites:

| Key | Default (`/welcome`) | student | first_job | switching / experienced |
|---|---|---|---|---|
| `noticePeriod` | "How soon could you start?" chips `NOTICE` | "When could you start?" chips "Right away" · "After I graduate" (+ `MonthPicker`, stored as the notice option nearest the date; the month itself is kept as `earliestStartDate`) | same as student | default |
| `desiredSalary` | "What salary are you looking for?" | hidden (reachable via "Show all questions") | shown, hint "A range is fine, e.g. $45–55k" | default |
| EEO | "Voluntary self-identification" | last, `details` collapsed, sub "Optional. Only filled where a form asks, and you review each one." | same | same |

The last screen's secondary link is **"Show all questions"** when the persona hid any. The final
Continue/Skip calls finish (§3.4) and shows `done`. The EEO screen's primary reads "Continue" with "Skip
this one" and never pre-selects anything.

### 5.10 "Your profile so far" (Back from prefs after the core confirm)

```
│  Your profile so far             │
│  ✓ 3 roles · 1 school · 14 skills│
│  ✓ Name, contact, headline       │
│  Change any of it on your profile│  link → /profiles
│ [     Back to questions  →    ]  │
```

### 5.11 `done` — the payoff

```
┌──────────────────────────────────┐
│          (confetti, once)        │
│         (mascot-clap, 96)        │
│  You're set, Priya.              │  h1
│  Kiwiply can now autofill        │
│  ~31 fields for you.             │  computed, §10; "~" always
│                                  │
│  Profile strength  ▰▰▰▰▰▰▰▱▱▱ 72%│  Meter (kept)
│                                  │
│  What's next                     │  13px semibold
│ ┌──────────────────────────────┐ │
│ │ 📄 Build a resume            │ │  accent; → /resume-builder?new=
│ │ From your profile, in a tap  │ │  profile (or `return`)
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ 🧩 Install the extension     │ │  desktop Chrome/Edge/Firefox only;
│ │ Autofill on any job site     │ │  phone: "Autofill works on your
│ └──────────────────────────────┘ │  laptop — we'll show you there"
│ ┌──────────────────────────────┐ │
│ │ 🔎 Find jobs                 │ │  → /jobs
│ │ 3 picked for you today       │ │  count from loadJobs(), else no line
│ └──────────────────────────────┘ │
│          Go to dashboard         │
└──────────────────────────────────┘
```
Order and set from `onboarding.payoff.actions` (§11). The extension card is hidden when the extension is
detected (the `extension-signal` ping, 300 ms timeout) or on a phone UA (replaced by the laptop line). The
jobs line shows a count only when `loadJobs().real` and ≥ 1. Confetti = `ConfettiBurst` (kept; none under
reduced motion; `onboarding.confetti.enabled`). `return` query → the first action uses it.

Copy: h1 "You're set, {firstName}." ; line "Kiwiply can now autofill ~{N} fields for you." ; N = 0 edge:
"Kiwiply is ready to learn as you apply." ; "What's next"; actions "Build a resume / From your profile,
in a tap", "Install the extension / Autofill on any job site", "Find jobs / {k} picked for you today";
link "Go to dashboard".

### 5.12 Resume banner (first screen after resuming)
`role="status"` line under the bar: "Picked up where you left off — 3 of 7 done." + "Start over" link. From
another device: "Picked up from your other device." (when the server draft's `updatedAt` beat the local
mirror).

### 5.13 Error, offline and conflict states

| State | Where | Copy / behaviour |
|---|---|---|
| Draft save fails (network) | status pill | "Offline — saved on this device" (amber dot); retries with backoff 2 s → 30 s; next successful save → "Saved ✓" |
| Draft save fails (4xx) | toast | 413 `DRAFT_TOO_LARGE`: "That's more than we can hold in one setup — skip a few entries." · 422 `SENSITIVE_CONTENT`: "One entry has a {class} in it — we never store those. Edit the card." (card gets the error ring) |
| Draft conflict (409) | banner | "This was updated on another device. Use that version?" **Use that** (reload server draft) / **Keep mine** (force PUT) |
| Core confirm fails | inline alert on `you` | R1.4 `finishError` strings; "Try again" |
| Pref PUT fails | inline alert | "Couldn't save that answer. Try again." — the answer stays selected |
| Finish fails | inline on the last pref | "Couldn't wrap up. Try again." (prefs are already saved) |
| Parse: nothing found | `review` skipped | `skills` sub "We couldn't find roles in that file — add skills here and the rest on your profile." |
| Server unreachable on load | page | the flow still opens from the local mirror; status pill "Offline"; when there is no mirror and the API is down: `EmptyState` "Kiwiply is having a moment. Try again in a minute." + Retry |
| Feature switched off (`feature.onboarding_v2.enabled=false`) | — | card hidden; `/welcome` redirect still active (there is no old wizard to fall back to); the flow at `/profiles/setup` works |

### 5.14 Copy deck — everything else in one table

| Key | String |
|---|---|
| status.saving | "Saving…" |
| status.saved | "Saved ✓" |
| status.offline | "Offline — saved on this device" |
| bar.estimate.start | "~2 min" (from `onboarding.estimateMinutes`) |
| bar.estimate.left | "about {n} min left" / "< 1 min left" |
| bar.aria | "Step {i} of {n}, about {m} minute(s) left" |
| exit.aria | "Exit setup — your progress is saved" |
| back | "Back" |
| continue | "Continue" |
| skip.now | "Skip for now" |
| skip.one | "Skip this one" |
| showAll | "Show all questions" |
| menu.persona | "Change who I am" |
| menu.restart | "Start over" |
| restart.confirm | "Start over? Your confirmed profile stays; only the unfinished steps reset." · "Start over" / "Keep going" |
| toast.skipped | "Skipped {title} · Undo" |
| toast.undone | "Back in the list." |
| card.new.title | "Let's get you job-ready" |
| card.new.body | "Drop in a resume, confirm a few cards, done. About 2 minutes." |
| card.new.cta | "Start" |
| card.draft.title | "Finish your profile" |
| card.draft.body | "{done} of {total} done · about {m} min left" |
| card.draft.cta | "Continue" |
| card.menu.snooze | "Remind me in a few days" |
| card.menu.dismiss | "Don't show this again" |
| card.menu.aria | "Hide this card" |
| card.snoozed.toast | "Okay — we'll bring it back in {days} days." |
| card.dismissed.toast | "Got it. You can set up anytime from My Profiles." |

---

## 6. The dashboard card — `FinishProfileCard`

Replaces `BuildProfileCard` (same slot, first in the card column, above `SuggestionsCard`;
`ProfileProgressCard` keeps the ≥ threshold range unchanged).

```
Not started                              In progress (draft)
┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│ (mascot-wave)                 ⋯  │     │ (mascot-laptop)               ⋯  │
│ Let's get you job-ready          │     │ Finish your profile              │
│ Drop in a resume, confirm a few  │     │ 3 of 7 done · about 1 min left   │
│ cards, done. About 2 minutes.    │     │ ▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱             │
│ [        Start  →             ]  │     │ [        Continue  →          ]  │
└──────────────────────────────────┘     └──────────────────────────────────┘
```
Lime-soft background (`bg-v2-lime-soft/60`, the current `BuildProfileCard` look), `aria-label="Set up your
profile"`. The ⋯ (`IconButton`, 44 px) opens a `Menu`: *Remind me in a few days* · *Don't show this again*.

**Show rules** (server-evaluated in the dashboard RSC from `GET /api/profile/onboarding`):

```
hidden  if feature.onboarding_v2.enabled = false
hidden  if status = finished  AND  score ≥ profile.setup.promptBelowPercent (40)     // finished + thin profile → the card returns as "Finish your profile"
hidden  if card.snoozedUntil > now
hidden  if card.dismissedAt AND (score ≥ onboarding.card.resurfaceBelowPercent
                                 OR now < dismissedAt + onboarding.card.resurfaceAfterDays
                                 OR card.resurfaceCount ≥ onboarding.card.maxResurfaces)
shown   otherwise: state = draft ? "in_progress" : "not_started"
```
When a dismissed card resurfaces, `resurfaceCount` increments once per showing (server, on the GET) and the
body gains one honest line: "Your profile is {score}% — forms will ask for the rest." Nothing else nags:
no badge counts, no toasts, no emails from this card.

**Migration of existing users:** `status = finished` when `meta.onboarding.finishedAt` **or**
`payload.onboardedAt` is set (read-through; no backfill job). Anyone who finished the old `/welcome` or the
old wizard therefore never sees the card unless their score is under the resurface threshold.

Card events: `onboarding_card_shown{state, stepsDone, stepsTotal, resurfaced}` once per dashboard render
(client effect, deduped per session), `onboarding_dismissed{action}`.

---

## 7. Autosave and the draft

### 7.1 Client model
`SetupState` v2 (`lib/profile-setup/state.ts`, `v: 2`): the v1 fields plus `persona`, `stepsDone`,
`stepsTotal`, `subProgress`, `coreConfirmedAt`, `prefsDone: string[]` (keys answered or skipped),
`updatedAt`. A v1 `sessionStorage` draft found on load is **migrated** (`upgradeDraft(v1) → v2`) once and the
v1 key removed. The reducer gains `persona`, `prefDone`, `coreConfirmed`, `hydrate` (server draft wins or
loses by `updatedAt`).

### 7.2 Save pipeline (DECISIONS #32 — Notion-style)
`useDraftSync(state)`: every state change → local mirror write (sync, `localStorage` key
`kiwiply.onboarding.draft.v2`, replaces the `sessionStorage` key) → debounced **600 ms** `PUT
/api/profile/onboarding/draft` with `{v, step, persona, stepsDone, stepsTotal, state, baseUpdatedAt}`; at
most one in flight, the latest state wins (trailing). `beforeunload` / `visibilitychange: hidden` flush
with `navigator.sendBeacon` to the BFF (`keepalive`). The pill: `Saving…` while in flight ≥ 300 ms (no
flicker), `Saved ✓` after, `Offline — saved on this device` on network failure (retry backoff 2 s → 30 s,
cap 5 min; also on `online`). No Save buttons anywhere; the one labelled write is "Save my profile" on `you`,
which is a profile commit, not a draft save.

### 7.3 Load and reconcile
On mount: `GET /api/profile/onboarding` (RSC passes it) + local mirror. Pick the newer by `updatedAt`
(ISO, server clock for server, client clock for local — a 60 s skew tolerance favours the server). If
local is newer and differs → PUT it immediately (the user worked offline). If server is newer → hydrate and
show "Picked up from your other device."

### 7.4 Conflict
`PUT` carries `baseUpdatedAt`; the server answers `409 DRAFT_CONFLICT {serverUpdatedAt}` when the stored
draft is newer than `baseUpdatedAt` (another device wrote). Client shows the §5.13 banner; **Use that** →
GET + hydrate; **Keep mine** → PUT with `force: true`. Last writer wins by explicit choice, never silently.

### 7.5 What is never in the draft
The uploaded file, the pasted text, raw parser output before redaction, EEO answers that were not yet
confirmed (prefs are written per answer, so they are not drafted at all — a pref screen's selected-but-not-
continued chip is UI state only), passwords/tokens (obviously), anything a `SensitivePatterns` class
matches (§8.5).

---

## 8. Data model

### 8.1 `onboarding_draft` (new table; Liquibase `20261012110000_onboarding_draft.xml`, additive)

| Column | Type | Notes |
|---|---|---|
| `user_id` | BIGINT PK, FK `jhi_user.id` ON DELETE CASCADE | one draft per user |
| `v` | TINYINT NOT NULL | state schema version (2) |
| `step` | VARCHAR(16) NOT NULL | `hello…prefs` |
| `persona` | VARCHAR(16) NULL | mirror of meta for the card query; truth is meta |
| `steps_done` | TINYINT NOT NULL DEFAULT 0 | |
| `steps_total` | TINYINT NOT NULL DEFAULT 7 | |
| `state_json` | LONGTEXT NOT NULL | the `SetupState` (≤ `onboarding.draft.maxBytes`, default 256 KB) |
| `created_at` / `updated_at` | TIMESTAMP(3) NOT NULL | `updated_at` is the conflict token |
| `expires_at` | TIMESTAMP(3) NOT NULL | `updated_at + onboarding.draft.ttlDays`; index `idx_onboarding_draft_expires` |

JPA `OnboardingDraft` + `OnboardingDraftRepository` (`findByUserId`, `deleteByUserId`,
`deleteByExpiresAtBefore`). Purge: `OnboardingDraftPurgeJob` in the `ResumeViewEventPurgeJob` pattern
(`@Scheduled` cron `${dossier.onboarding.draft-purge-cron:0 50 3 * * *}` UTC). Deletion: `AccountDeletionService`
deletes the row (via `ResumeBuilderDataService.deleteOnboardingDraft(userId)`); export:
`AccountExportService` includes `onboardingDraft` (it is the user's own unconfirmed data).
`DataMapTest`/`StorageKeys` unaffected (no stored files).

Why a table and not `bio.meta_json`: a draft carries every parsed candidate (tens of KB); `meta_json` is a
small cache the profile write path rewrites on every save (`ProfileMeta`), and its contract says "a cache
plus a few markers". The small, long-lived markers go to meta (8.2); the large, short-lived working copy
gets its own row with its own TTL.

### 8.2 `bio.meta_json.onboarding` (the reserved key `ProfileMeta` already preserves)

```json
"onboarding": {
  "persona": "student" | "first_job" | "switching" | "experienced" | null,
  "startedAt": "2026-10-12T…", "finishedAt": null | "…", "source": "web",
  "card": { "dismissedAt": null | "…", "snoozedUntil": null | "…", "resurfaceCount": 0 }
}
```
`ProfileMeta` gains `onboarding(ObjectNode)` accessor + `OnboardingMeta` record (read/write helpers,
tolerant). Written by `OnboardingService` only. `payload.onboardedAt` is still written on finish for every
existing reader of `ONBOARDED_KEY` (extension irrelevance noted in §16). A bio row is created on first write
if the account has none (the existing `BioServiceImpl` upsert path).

### 8.3 Retention summary
Draft: `onboarding.draft.ttlDays` (30) after the last write, nightly purge; deleted on finish, on start over,
on account deletion. Meta markers: live with the bio. Local mirror: cleared on finish / start over / sign-out
(`signedOut` signal already exists in `extension-signal`; the `(app)` logout route clears the key).

### 8.4 The extension mirror
`ProfileVersion` hashes `bio.payload` + `resume.parsed_json` only. Draft writes and meta writes do not touch
either → the extension sees nothing until the core confirm (import + PUT) or a pref PUT, at which point the
web calls `notifyExtension("changed")` exactly as today. `ProfileVersionTest` gains "a draft PUT does not
move the version".

### 8.5 Never-collected — applies to the draft too
`PUT …/draft` runs `SensitivePatterns.scan` over every string in `state_json` (the same walker the items
import uses); a hit → `422 SENSITIVE_CONTENT {path, class}` and the row is not written (the client marks
the card). The web redacts before parsing already; this is the server's second line, same as items.
`persona` is an enum, not free text. No EEO value is ever in the draft (§7.5). `DataMapTest` (T1.1): the
new column names match no deny-list pattern.

---

## 9. API and BFF contracts

All under `/api/profile/onboarding`, owner-scoped (`userId` from the login, never a path id), in
`OnboardingResource` + `OnboardingService` (`api/.../web/rest/OnboardingResource.java`,
`service/OnboardingService.java`, DTOs in `service/dto/OnboardingDTOs.java`).

| Method · path | Body | Response | Errors |
|---|---|---|---|
| `GET /api/profile/onboarding` | — | `OnboardingStatusDTO {status: NONE\|DRAFT\|FINISHED, persona, finishedAt, draft: {step, stepsDone, stepsTotal, updatedAt, state} \| null, card: {dismissedAt, snoozedUntil, resurfaceCount, show: bool, state: NOT_STARTED\|IN_PROGRESS}, completeness: {score, promptBelow, resurfaceBelow}}` (`state` included only when `?include=state`) | 401 |
| `PUT /api/profile/onboarding/draft` | `{v, step, persona?, stepsDone, stepsTotal, state, baseUpdatedAt?, force?}` | `200 {updatedAt, expiresAt}` | 409 `DRAFT_CONFLICT {serverUpdatedAt}` · 413 `DRAFT_TOO_LARGE {max}` · 422 `SENSITIVE_CONTENT {path, class}` · 422 `DRAFT_INVALID {path}` (unknown step / v) |
| `DELETE /api/profile/onboarding/draft` | — | 204 | — |
| `PATCH /api/profile/onboarding` | `{persona?: enum\|null, card?: {action: SNOOZE\|DISMISS\|RESET}}` | `200 OnboardingStatusDTO` | 422 `PERSONA_INVALID` |
| `POST /api/profile/onboarding/finish` | `{}` | `200 {finishedAt, completeness, coverage: {fields, groups: {contact, links, work, education, skills, preferences, eeo}}}` (§10) | — (idempotent; a second call returns the same shape) |

Semantics: `PUT draft` upserts, sets `expires_at`, mirrors `persona` to meta when present; `finish` writes
`meta.onboarding.finishedAt`, `payload.onboardedAt` (if blank), deletes the draft, recomputes completeness
(`ProfileItemService.completeness()`), computes coverage; `PATCH card SNOOZE` sets `snoozedUntil = now +
onboarding.card.snoozeDays`; `DISMISS` sets `dismissedAt`; `RESET` clears both (used by "Start over" and by
the My Profiles page's "Show the setup card again" link in Preferences).

Rate limits (BFF, `lib/rate-limit.ts`): draft PUT 60/min per user (`onboarding.rate.draftPerMin`), others
20/min.

**BFF routes** (`web/src/app/api/profile/onboarding/route.ts` GET+PATCH, `…/draft/route.ts` PUT+DELETE
(+ POST alias for `sendBeacon`), `…/finish/route.ts` POST) — thin proxies in the `profile/items` pattern,
cookie auth, errors passed through with the JSON body. Client helpers in `web/src/lib/onboarding/api.ts`:
`getOnboarding()`, `putDraft()`, `deleteDraft()`, `patchOnboarding()`, `finishOnboarding()` + typed errors
(`OnboardingApiError {code, …}`). Mock API (`web/scripts/mock-api.mjs`) gains the five routes with an
in-memory draft so the Playwright journey and the dev demo run without Spring.

Config: `GET /api/profile/resume-builder/config` gains `onboarding: {enabled, estimateMinutes, stepSeconds,
draftMaxBytes, card: {snoozeDays, resurfaceBelowPercent, resurfaceAfterDays, maxResurfaces}, confetti,
mascot, personaStep, payoffActions}` (`ResumeBuilderConfigDTO.Onboarding`, `DEFAULT_BUILDER_CONFIG.onboarding`).

---

## 10. The honest "~N fields" (`autofillCoverage`)

Pure function `autofillCoverage(bio, counts)` in `web/src/lib/onboarding/coverage.ts` (TS twin
`AutofillCoverage.java` for the finish response; both tested on the same fixtures):

- **Direct fields** = keys of the extension's canonical schema (`job-autofill/src/lib/schema.js` `FIELDS`,
  31 keys: identity/contact/address 15 incl. `fullName`, links 3, preferences 7 incl. `earliestStartDate`
  and `referralSource`, summary 1, EEO 5) that are non-blank in `bio.payload`. `fullName` counts when first
  + last are set.
- **Repeated fields** = for each kept EXPERIENCE item: 5 (title, company, location, start, end/current),
  capped at 3 items; each EDUCATION item: 4 (school, degree, field, dates), capped at 2; `skills ≥ 1` → 1.
- `fields = direct + repeated`; the payoff shows `~{fields}`; `groups` is the per-group breakdown for the
  "What's next" tips and analytics (`onboarding_finished{fields}` only the total).
- Never counts EEO unless the user answered; never counts what the parser found but the user skipped.
- `AutofillCoverageParityTest` (web vitest) reads `../../job-autofill/src/lib/schema.js` and asserts the
  key list equals `AUTOFILL_FIELD_KEYS` (so an extension schema change fails the web test, not the user's
  number). Java: `AutofillCoverageTest` with the same JSON fixtures as the TS test
  (`web/src/lib/onboarding/__fixtures__/coverage-*.json`, copied under `api/src/test/resources/onboarding/`).

Copy edge: `fields = 0` → "Kiwiply is ready to learn as you apply." (no number is better than a fake one).

---

## 11. Settings keys (declared in `ResumeBuilderSettingKeys`, read through `ResumeBuilderSettings`; admin via `app_setting` until A5.1)

| Key | Type | Default | Bounds / values | Used by |
|---|---|---|---|---|
| `feature.onboarding_v2.enabled` | BOOL | true | | dashboard card, `/welcome` redirect note (§5.13) |
| `onboarding.persona.enabled` | BOOL | true | | hide the `hello` step (persona stays null) |
| `onboarding.estimateMinutes` | INT | 2 | 1–10 | bar label at start, card copy |
| `onboarding.stepSeconds` | JSON | `{hello:10, source:40, review:45, skills:20, you:15, prefs:30}` | each 5–600 | "about N min left" |
| `onboarding.draft.ttlDays` | INT | 30 | 7–365 | `expires_at`, purge job |
| `onboarding.draft.maxBytes` | INT | 262144 | 64 K–1 M | 413 |
| `onboarding.rate.draftPerMin` | INT | 60 | 10–600 | BFF |
| `onboarding.card.snoozeDays` | INT | 3 | 1–30 | PATCH SNOOZE |
| `onboarding.card.resurfaceBelowPercent` | INT | 20 | 0–100 | §6 rules (0 = never resurface) |
| `onboarding.card.resurfaceAfterDays` | INT | 14 | 1–365 | §6 |
| `onboarding.card.maxResurfaces` | INT | 2 | 0–10 | §6 |
| `onboarding.confetti.enabled` | BOOL | true | | payoff |
| `onboarding.mascot.enabled` | BOOL | true | | every mascot slot |
| `onboarding.payoff.actions` | JSON string[] | `["build_resume","install_extension","find_jobs"]` | subset, ordered, 1–3 | §5.11 |
| `profile.setup.promptBelowPercent` (existing) | INT | 40 | 0–100 | the card's finished-user threshold; `ProfileProgressCard` boundary |

Hard constants (not settings): persona enum and labels, the question set (`PREFERENCE_QUESTIONS`), the 44 px
targets, the never-collected classes, the 600 ms debounce, the 300 ms pill delay.

---

## 12. Analytics events (`track(name, props)`, snake_case, no content, no names)

| Event | Props | When |
|---|---|---|
| `onboarding_card_shown` | `state: not_started\|in_progress, stepsDone, stepsTotal, resurfaced: bool` | dashboard render, once per session |
| `onboarding_started` | `entry: card\|chooser\|profiles\|welcome\|ext\|direct, persona?` | first screen of a run with no draft |
| `onboarding_persona_set` | `persona` (or `"skipped"`), `changed: bool` | chip Continue / "Change who I am" |
| `onboarding_path_chosen` | `path: upload\|paste\|fresh\|skip, persona` | `source` tap |
| `profile_setup_parsed` (kept) | `source, cards, skills, removed` | parse result |
| `onboarding_step_completed` | `step, index, total, skipped: bool, seconds` | every Continue / Skip (review: once at the recap, with `kept, skipped` counts) |
| `onboarding_core_confirmed` | `items, merged` | import + PUT ok |
| `onboarding_pref_answered` | `key, skipped: bool` (never the value) | each pref screen |
| `onboarding_finished` | `fields, score, seconds, persona, path, prefsAnswered` | finish ok |
| `onboarding_dismissed` | `action: snooze\|dismiss\|exit` | card menu / Exit ✕ |
| `onboarding_resumed` | `stepsDone, stepsTotal, device: same\|other, ageHours` | hydrate from a draft |
| `onboarding_draft_conflict` | `choice: theirs\|mine` | banner resolved |
| `onboarding_draft_offline` | `retries` | first failed save of a run |
| `onboarding_payoff_action` | `action` | payoff card tap |

Funnel for the admin tile (U18/A11 later): shown → started → persona_set → path_chosen → step_completed(you)
→ finished; drop-off per step from `step_completed.index`. `profile_setup_step` / `profile_setup_started` /
`profile_setup_completed` are **removed** (superseded; named in the story so the pipeline schema is updated).

---

## 13. Motion

| Moment | Default | `prefers-reduced-motion` |
|---|---|---|
| Screen change | content slides 16 px left/right (direction of travel) + fades, 180 ms `ease-out`; the bar fills 300 ms `ease-out` | crossfade 120 ms; the bar jumps |
| Chip select | 1.0 → 1.04 → 1.0 scale, 150 ms | none; colour only |
| Card Keep / Skip (touch) | `SwipeCard` as built (tilt + fly-out) | as built (no movement, hint fades) |
| Undo toast | slide up 160 ms | fade |
| Status pill | text swap with a 120 ms fade; the ✓ draws in 200 ms | instant |
| Mascot | static images; the payoff mascot does one 400 ms "pop" scale-in | static |
| Confetti | `ConfettiBurst` once | none (already) |
| Drop zone drag-over | border → solid accent, bg accent-soft, 120 ms | instant |

Implementation: CSS transitions / `@keyframes` in `globals.css` under `@media (prefers-reduced-motion: no-
preference)`; a `useReducedMotion()` hook in `@kiwiply/ui` (new, S) wrapping the existing `reducedMotion()`
helpers so `SwipeCard`, `ConfettiBurst` and the shell share one. No animation library.

---

## 14. Accessibility

- Every screen: exactly one `<h1>` (the question); on step change focus moves to the `<h1>`
  (`tabIndex={-1}`), and a polite live region announces "Step 3 of 7". The bar is `role="progressbar"` with
  `aria-valuetext` (§5.0).
- Persona chips and every yes/no / option set: `role="radiogroup"` + `aria-labelledby` the `<h1>`; arrow
  keys move, Space selects (the `ChoiceGroup` primitive as built).
- Targets ≥ 44 px on touch (`max-sm:min-h-11` everywhere, chips 56 px), ≥ 32 px with 8 px spacing on desktop.
- Drop zone: a real `<button>` wrapping the label; the `<input type="file">` is visually hidden but
  focusable via the button; drag-and-drop is additive. Phone: `accept=".pdf,.docx,.txt,application/pdf,…"`
  opens the OS picker (Files / Drive / iCloud) — nothing custom.
- `SwipeCard`: gestures never the only way (Keep / Skip buttons always; arrows with the card focused).
- Status pill: `role="status"` (polite) — "Saved" is announced at most once per 10 s (throttled), never
  on every keystroke; "Offline — saved on this device" announced once when it starts.
- Undo toast: `role="status"`, the Undo button is focusable, toast lifetime 4 s is paused on hover/focus.
- Colour: lime-soft card passes 4.5:1 for body text (`v2-navy` on lime-soft); the bar has a 1 px line under
  it so the unfilled part is visible in high-contrast mode; nothing conveyed by colour only (the ✓ carries
  the "saved" meaning, the amber dot has the text).
- Mascot images: `alt=""` (decorative) everywhere.
- Playwright + `@axe-core/playwright` (approved dev dep, R6.5 — if R6.5 has not landed, R1.12 adds it) at
  390 and 1440 on every screen: 0 serious/critical.

---

## 15. Phone-specific behaviour

- The primary button is sticky at the bottom (`position: sticky; bottom: env(safe-area-inset-bottom)`)
  so it is never under the keyboard; "Skip" sits above it inside the sticky area.
- The persona chips and option chips are 2 per row at 390 px, never 3.
- The review card scrolls inside itself when bullets overflow (`max-h-[52vh] overflow-y-auto`), so Keep /
  Skip stay visible.
- Upload on a phone: the drop zone is a single tall button "Choose a file" (no drag copy); the 🔒 badge sits
  directly under it.
- The payoff's extension card is replaced by the one-line laptop note (§5.11).
- Landscape phones: the shell is the same; nothing is fixed-height besides the sticky footer.

---

## 16. Interaction with the extension and existing data

- The extension reads `bio.payload` and `resume.parsed_json` through `tracking.js`; nothing in the draft or
  meta is visible to it. The mirror moves at the core confirm, at every pref answer, and never otherwise
  (§8.4). `notifyExtension("changed")` fires at those two points only (not on finish, which writes nothing
  the extension reads besides `onboardedAt`, which it ignores).
- `onboardedAt` stays in the payload (written on finish, and by the migration read-through considered
  equivalent to `finishedAt`). No extension release is needed for R1.7–R1.12; R1.13 (the drawer link) is the
  optional one and bumps the version per the ritual.
- Existing users mid-way through the old `sessionStorage` wizard: their v1 draft is upgraded on the next
  visit (§7.1) and pushed to the server.
- Demo accounts (`DemoGuard`, read-only): the status GET works; `PUT draft` for a demo login returns
  `403 DEMO_READ_ONLY` (existing guard) and the flow shows the §5.13 offline pill with "Demo accounts can't
  save — sign up to keep this." No card on the demo dashboard (`status = finished` is seeded).

---

## 17. Tests (what every story names)

- **Java unit:** `OnboardingServiceTest` (upsert, TTL, finish idempotent, card rules table §6 as a parametrised
  test, persona enum, read-through migration of `onboardedAt`), `AutofillCoverageTest` (fixtures),
  `ProfileMetaTest` (+ onboarding accessors, unknown keys survive), `OnboardingDraftPurgeJobTest`,
  `ResumeBuilderSettingsTest` (+ bounds of the new keys), `ProfileVersionTest` (+ draft/meta don't move it).
- **Java IT:** `OnboardingResourceIT` (GET none/draft/finished; PUT 200/409/413/422 sensitive; DELETE;
  PATCH persona + card actions; finish deletes the draft and writes meta + `onboardedAt`; user B 404 on
  nothing because there are no ids — ownership by login; demo 403), `AccountDeletionServiceIT` (+ draft row
  gone), `AccountExportServiceIT` (+ `onboardingDraft`), `ResumeBuilderConfigResourceIT` (+ `onboarding`).
- **Web unit (vitest):** `state.test.ts` (v2 reducer, `upgradeDraft` v1→v2, `stepsTotal` with/without review,
  persona order tables §3.2, `prefsDone`), `useDraftSync.test.tsx` (debounce, trailing, offline retry,
  beacon on hide, conflict choices, local-vs-server pick by `updatedAt`), `coverage.test.ts` +
  `coverage.parity.test.ts`, `FinishProfileCard.test.tsx` (3 states, menu actions, hidden rules), route tests
  for the three BFF routes, `OnboardingShell.test.tsx` (bar value/label/aria, focus to h1, Exit saves),
  `PersonaStep.test.tsx`, `SourceStep.test.tsx` (hero order per persona, lock badge expand, picker on
  phone UA, error strings), `PrefsFlow.test.tsx` (one question per screen, persona rewrites, skip writes
  nothing, PUT per answer, "Show all questions", finish on last), `PayoffStep.test.tsx` (count, actions,
  `return`, extension detection, 0-fields copy), `welcome redirect` route test, dashboard page test (no
  redirect ever; card slot).
- **Playwright (mock API, 390 + 1440):** the whole flow upload → payoff; resume after reload at `review`
  card 3 ("3 of 7"); another-device conflict (two contexts); offline save then reconnect; `/welcome` →
  prefs; dismiss → snooze → resurface after clock skew (mock); axe on every screen; reduced-motion run
  (no transforms, no confetti).
- **Smoke:** `rb-smoke.mjs` gains: register → GET status NONE → PUT draft → GET DRAFT (3 of 7) → finish →
  FINISHED, draft row gone, `onboardedAt` set, ProfileVersion unchanged across the draft PUT.

---

## 18. Rollout — story map (epic R1b, build order)

| Story | Ships | Size |
|---|---|---|
| **R1.7** `FinishProfileCard` + no dashboard redirect + `/welcome` → flow redirect (snooze/dismiss client-local until R1.8) | the user-visible fix on day one | S |
| **R1.8** API: `onboarding_draft` table, `OnboardingResource` (GET/PUT/DELETE/PATCH/finish), meta accessors, settings keys + config, purge, deletion/export, coverage (Java) | the server half | M |
| **R1.9** Web draft sync: state v2 + upgrade, `useDraftSync` (local mirror, debounce, beacon, offline, conflict), BFF routes, mock API, the status pill, resume banner, card reads "3 of 7" from the server, dismiss/snooze move to the server | "never lost" | M |
| **R1.10** The new shell + screens: progress bar, mascot, `hello` persona, `source` hero (lock badge, persona order, phone picker), paste copy, review in the shell (undo toast, one card per screen, recap), skills, `you` → "Save my profile" core confirm, "Your profile so far" | the feel | L |
| **R1.11** `prefs` one-per-screen persona-aware + per-answer PUT + finish + payoff (coverage, confetti, actions, `return`, extension detection) + delete `Onboarding.tsx`/`welcome/page.tsx` | the finish | M |
| **R1.12** Entry points (start chooser `?new=profile` + "Build my profile · 2 min", My Profiles empty states, preferences "Show the setup card again"), the full analytics funnel, motion + a11y pass with `useReducedMotion`, Playwright journey + axe, smoke rows | the polish and the proof | M |
| **R1.13** (optional, ext) drawer empty-profile line "Set up your profile on kiwiply.com · 2 min" | the extension entry | S |

Feature flag `feature.onboarding_v2.enabled` guards the card and the `/welcome` redirect; the flow itself is
always on (it replaces the old wizard's shell in place, so there is no dual-run).

---

## 19. Non-goals
Streaks or daily goals · push/email nudges from onboarding · instant job matches inside the flow (that is
U2.5 on the user roadmap; the payoff links to `/jobs`) · a separate mobile app flow (the PWA shows this
same web flow) · collecting address, date of birth, or any EEO value outside the voluntary last screen ·
AI anywhere but resume parsing · a template step · importing LinkedIn by API · gamified "profile
levels".
